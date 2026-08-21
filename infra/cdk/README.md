# 用 CDK 理解并部署本项目的 AWS 基础设施

这套 CDK 代码是现有 `template.yaml` 的并行版本。它不会自动接管、修改或删除当前的 SAM Stack，默认会创建三个新 Stack：

```text
github-profile-dev-cdk-network
        │
        ├── github-profile-dev-cdk-data
        │           │
        └───────────┴── github-profile-dev-cdk-application
```

## 先理解 CDK 到底是什么

SAM YAML 和 CDK 最终都把一份 CloudFormation 模板交给 AWS。区别只在“人如何描述资源”：

- SAM YAML 是直接写声明式配置，短，但资源多以后引用关系很难读。
- CDK 是用 TypeScript 创建资源对象，能使用类型检查、函数、测试和封装。
- CDK 不是替代 CloudFormation。`cdk synth` 做的事，就是把 TypeScript 翻译成 CloudFormation。

所以学习 CDK 的第一条原则是：先问“AWS 中要存在什么资源、资源之间允许怎样通信”，再写代码。不要先问“该调用哪个 CDK 方法”。

## 为什么拆成三个 Stack

一个 Stack 是一组一起创建、更新和删除的资源，也就是一个生命周期边界。

| Stack | 包含什么 | 为什么单独放 |
| --- | --- | --- |
| Network | VPC、子网、NAT、SSM 跳板机、流日志 | 网络变化少，很多资源都会依赖它 |
| Data | Aurora、数据库 Secret | 数据丢失代价最高，应该和应用发布解耦 |
| Application | Lambda、HTTP API、ECS、ALB、应用 Secret | 应用迭代最频繁，可以单独更新 |

依赖方向只能从基础层流向上层：`Network -> Data -> Application`。这样能避免循环依赖，也能降低一次修改的影响范围。

## 当前设计相对 SAM 的变化

1. 跳板机没有公网 IP，也不开放 SSH 22 端口。连接数据库要先通过 IAM 登录 AWS，再用 Systems Manager 建隧道。安全的本质不是“换一个端口”，而是不要让未认证流量有入口。
2. `BETTER_AUTH_URL` 直接引用 CDK 创建的 API 地址，不再首次部署后手工回填。
3. Go 服务的 Docker 目录成为 CDK Asset。部署时 CDK 负责构建、上传和把镜像地址写进 ECS Task Definition。
4. Aurora 自动生成主密码并保存在 Secrets Manager。代码和 Git 中都没有数据库密码。
5. dev 只有一个 NAT Gateway 和一个 Aurora writer，用可用性换成本；prod 配置两个 NAT Gateway、两个数据库实例和删除保护。
6. 默认不写固定物理资源名。物理名是 AWS 账户中的全局或区域标识，固定名称很容易和旧环境冲突，也会阻碍蓝绿迁移。

## 第 1 步：确认身份和目标区域

```bash
aws sts get-caller-identity
aws configure get region
```

要做什么：确认当前 CLI 使用哪个 AWS 账户，并确认目标区域是 `us-east-1`。

为什么：基础设施代码本身不危险，部署到错误账户才危险。每次部署前先确认 `Account` 和 `Region`，相当于前端发布前先确认环境不是生产。

本项目的 dev 配置位于 `lib/config.ts`。普通配置可以提交到 Git；密码、Token、私钥不能放在这里，应该进入 Secrets Manager 或 CI Secret。

`cdk.context.json` 固定了当前账户使用的两个可用区。要做什么：把 CDK 查询得到的环境事实提交到 Git。为什么：否则两位开发者在不同时间执行 `synth`，可能因为账户可见可用区不同而生成不同子网，基础设施就失去可复现性。

## 第 2 步：安装依赖并构建 Lambda

在仓库根目录运行：

```bash
pnpm install
pnpm run build:lambda
```

要做什么：安装 CDK 库，并把 Hono 与数据库迁移函数打包到 `apps/server/dist/lambda`。

为什么：CloudFormation 只负责创建 Lambda 这个“运行容器”，它不会理解你的 Turborepo 源码。必须先把源码变成 Lambda 可以直接执行的部署产物。

## 第 3 步：只做本地翻译，不部署

```bash
pnpm run infra:list
pnpm run infra:synth
```

要做什么：列出三个 Stack，再把 TypeScript 翻译为 `infra/cdk/cdk.out` 下的 CloudFormation 模板。

为什么：`synth` 是成本最低的反馈环。它能发现类型、资源关系、CDK 警告和 `cdk-nag` 安全问题，但不会修改云上资源。先证明“描述是合法的”，再考虑部署。

切换 prod 配置时显式传入上下文：

```bash
pnpm --dir infra/cdk exec cdk synth --all --strict -c environment=prod
```

在合成 prod 之前，必须先把 `lib/config.ts` 中示例用的 `https://example.com` 改成真实前端域名。配置加载器会主动拒绝占位符，避免误部署一个必然 CORS 失败的生产环境。

## 第 4 步：Bootstrap 一次目标环境

```bash
pnpm --dir infra/cdk exec cdk bootstrap aws://492646066759/us-east-1 \
  --custom-permissions-boundary PowerUserAccess
```

要做什么：创建名为 `CDKToolkit` 的基础 Stack。

为什么：部署 Lambda ZIP 和 Docker 镜像时，CloudFormation 需要先从某个地方读取这些文件。Bootstrap 创建存放资产的 S3/ECR 和最小的一组部署角色。它是“部署系统的基础设施”，每个账户与区域组合通常只需做一次。

不要删除 `CDKToolkit`。删除它会让使用该 Bootstrap 环境的 CDK 部署全部失效。

## 第 5 步：看变更，不执行变更

```bash
pnpm run infra:diff
```

要做什么：比较本地将要生成的模板和云端已部署模板。

为什么：代码审查回答“代码改了什么”，`cdk diff` 回答“AWS 资源会改什么”。数据库是否被替换、IAM 是否扩大、子网是否变化，都应该在这一层确认。

首次运行时三个 CDK Stack 尚不存在，所以 diff 会显示全部为新增。这是正常的，也说明它不会原地接管 `github-profile-dev` SAM Stack。

## 第 6 步：部署并运行数据库迁移

```bash
pnpm --dir infra/cdk run deploy
```

要做什么：按依赖顺序创建网络、数据库和应用。CDK 会自动构建并上传 Go 镜像。

为什么：CloudFormation 会维护资源状态、按依赖排序，并在失败时回滚；你不需要自己写一串 `aws ec2`、`aws rds`、`aws lambda` 命令。

部署完成后，从 Application Stack 输出中取得迁移函数名：

```bash
aws cloudformation describe-stacks \
  --stack-name github-profile-dev-cdk-application \
  --query "Stacks[0].Outputs[?OutputKey=='MigrationFunctionName'].OutputValue | [0]" \
  --output text
```

再调用迁移函数：

```bash
aws lambda invoke \
  --function-name YOUR_MIGRATION_FUNCTION_NAME \
  --cli-binary-format raw-in-base64-out \
  --payload '{}' \
  /tmp/github-profile-cdk-migration-response.json
```

为什么迁移不放进 Stack 创建过程：表结构迁移是应用发布动作，不是基础设施创建动作。把它做成 CloudFormation Custom Resource 会让数据库脚本失败直接卡住整个基础设施 Stack，也让重试和回滚更难理解。

## 第 7 步：验证，再切流量

先取得新 API 地址并检查健康状态：

```bash
aws cloudformation describe-stacks \
  --stack-name github-profile-dev-cdk-application \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" \
  --output text
```

```bash
curl YOUR_API_URL/
curl YOUR_API_URL/health
```

要做什么：先直接访问新 API，确认 Lambda、ECS 和数据库都正常，再修改前端的后端地址。

为什么：创建资源和切换用户流量是两件事。分开后，失败时只要把前端地址切回旧 API，旧 SAM 环境仍可使用。

## 第 8 步：最后才处理旧 SAM Stack

不要在第一次 CDK 部署时删除旧 Stack。建议顺序是：

1. 新 CDK 环境部署成功。
2. 新数据库迁移完成，测试关键业务流程。
3. 前端切到新 API，观察日志和错误率。
4. 做 Aurora 最终快照。
5. 明确确认不再回滚后，才删除旧的计算资源。

旧 Aurora 不能直接被这套 CDK 同时管理，因为一个 AWS 资源不能同时属于两个 CloudFormation Stack。如果目标是保留原数据库并且零替换迁移，应另开分支使用 `cdk migrate --from-stack --stack-name github-profile-dev` 先生成保持原逻辑 ID 的 L1 代码，再一次只重构一个资源并运行 `cdk diff`。这是“原地迁移”，风险显著高于本项目当前采用的“并行重建”。

## 日常修改的固定节奏

```bash
pnpm run build:lambda
pnpm --dir infra/cdk run check-types
pnpm --dir infra/cdk run test
pnpm run infra:synth
pnpm run infra:diff
pnpm --dir infra/cdk run deploy
```

这六步分别回答六个问题：应用能否打包、类型是否正确、关键约束是否仍成立、模板能否生成、云资源会怎样变化、最后才是是否执行。

## 成本提醒

这套架构的主要固定成本通常来自 NAT Gateway、Aurora Serverless v2 最低容量、内部 ALB、Fargate Task 和 EC2 跳板机。学习期间不用时应停止或删除并行环境，但删除 Data Stack 前先确认快照。CDK 的 `destroy` 是破坏性操作，本项目没有把它包装成根脚本，避免误操作。
