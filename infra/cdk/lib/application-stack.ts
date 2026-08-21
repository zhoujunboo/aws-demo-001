import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	CfnOutput,
	Duration,
	RemovalPolicy,
	Stack,
	type StackProps,
} from "aws-cdk-lib";
import { CfnStage, HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
	type ISecurityGroup,
	type IVpc,
	Port,
	SecurityGroup,
	SubnetType,
} from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import {
	AppProtocol,
	AwsLogDriverMode,
	Cluster,
	ContainerImage,
	ContainerInsights,
	CpuArchitecture,
	Secret as EcsSecret,
	FargateService,
	FargateTaskDefinition,
	LogDrivers,
	OperatingSystemFamily,
} from "aws-cdk-lib/aws-ecs";
import {
	ApplicationLoadBalancer,
	ApplicationProtocol,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
	Architecture,
	Code,
	Function as LambdaFunction,
	Runtime,
	Tracing,
} from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import type { DatabaseCluster } from "aws-cdk-lib/aws-rds";
import {
	BlockPublicAccess,
	Bucket,
	BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { type ISecret, Secret } from "aws-cdk-lib/aws-secretsmanager";
import { NagSuppressions } from "cdk-nag";
import type { Construct } from "constructs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, "../../..");
const createOutput = (scope: Construct, id: string, value: string): CfnOutput =>
	new CfnOutput(scope, id, { value });

export interface ApplicationStackProps extends StackProps {
	readonly cluster: DatabaseCluster;
	readonly corsOrigin: string;
	readonly databaseName: string;
	readonly environmentName: "dev" | "prod";
	readonly projectName: string;
	readonly vpc: IVpc;
}

export class ApplicationStack extends Stack {
	constructor(scope: Construct, id: string, props: ApplicationStackProps) {
		super(scope, id, props);

		const databaseSecret = props.cluster.secret;
		if (!databaseSecret) {
			throw new Error("The database cluster must create a master user secret.");
		}
		const logRemovalPolicy =
			props.environmentName === "prod"
				? RemovalPolicy.RETAIN
				: RemovalPolicy.DESTROY;

		const lambdaSecurityGroup = new SecurityGroup(this, "ApiSecurityGroup", {
			description: "Network identity for API and migration Lambda functions",
			vpc: props.vpc,
		});
		const serviceSecurityGroup = new SecurityGroup(
			this,
			"ProfileServiceSecurityGroup",
			{
				description: "Network identity for the profile service tasks",
				vpc: props.vpc,
			}
		);
		const databaseSecurityGroup =
			props.cluster.connections.securityGroups.at(0);
		if (!databaseSecurityGroup) {
			throw new Error("The database cluster must have a security group.");
		}
		// Keep cross-stack rules in this consumer stack so dependencies stay one-way.
		databaseSecurityGroup.addIngressRule(
			lambdaSecurityGroup,
			Port.tcp(5432),
			"PostgreSQL from Lambda",
			true
		);
		databaseSecurityGroup.addIngressRule(
			serviceSecurityGroup,
			Port.tcp(5432),
			"PostgreSQL from the profile service",
			true
		);

		const profileServiceUrl = this.createProfileService({
			corsOrigin: props.corsOrigin,
			databaseCluster: props.cluster,
			databaseName: props.databaseName,
			databaseSecret,
			environmentName: props.environmentName,
			lambdaSecurityGroup,
			serviceSecurityGroup,
			vpc: props.vpc,
		});

		const httpApi = new HttpApi(this, "HttpApi", {
			createDefaultStage: true,
			description: "Public HTTP API for the Hono application",
		});
		const apiAccessLogGroup = new LogGroup(this, "HttpApiAccessLogGroup", {
			removalPolicy: logRemovalPolicy,
			retention: RetentionDays.ONE_MONTH,
		});
		const defaultStageResource = httpApi.defaultStage?.node.defaultChild;
		if (!(defaultStageResource instanceof CfnStage)) {
			throw new Error("The HTTP API must create a default stage.");
		}
		defaultStageResource.accessLogSettings = {
			destinationArn: apiAccessLogGroup.logGroupArn,
			format: JSON.stringify({
				httpMethod: "$context.httpMethod",
				integrationError: "$context.integrationErrorMessage",
				ip: "$context.identity.sourceIp",
				path: "$context.path",
				requestId: "$context.requestId",
				responseLength: "$context.responseLength",
				status: "$context.status",
			}),
		};
		const betterAuthSecret = new Secret(this, "BetterAuthSecret", {
			description: "Better Auth signing secret for the Hono API",
			generateSecretString: {
				excludePunctuation: true,
				generateStringKey: "secret",
				passwordLength: 48,
				secretStringTemplate: JSON.stringify({ purpose: "better-auth" }),
			},
		});
		NagSuppressions.addResourceSuppressions(betterAuthSecret, [
			{
				id: "AwsSolutions-SMG4",
				reason:
					"Better Auth signing-key rotation must be coordinated with the application because an uncoordinated rotation invalidates active sessions.",
			},
		]);

		const sharedDatabaseEnvironment = {
			DATABASE_HOST: props.cluster.clusterEndpoint.hostname,
			DATABASE_NAME: props.databaseName,
			DATABASE_PASSWORD: databaseSecret
				.secretValueFromJson("password")
				.unsafeUnwrap(),
			DATABASE_PORT: props.cluster.clusterEndpoint.port.toString(),
			DATABASE_USERNAME: databaseSecret
				.secretValueFromJson("username")
				.unsafeUnwrap(),
		};
		const apiFunction = this.createFunction({
			description: "Hono API connected to Aurora PostgreSQL",
			environment: {
				...sharedDatabaseEnvironment,
				BETTER_AUTH_SECRET: betterAuthSecret
					.secretValueFromJson("secret")
					.unsafeUnwrap(),
				BETTER_AUTH_URL: httpApi.apiEndpoint,
				CORS_ORIGIN: props.corsOrigin,
				NODE_ENV: "production",
				PROFILE_SERVICE_URL: profileServiceUrl,
			},
			handler: "lambda.handler",
			id: "ApiFunction",
			lambdaSecurityGroup,
			logRemovalPolicy,
			timeout: Duration.seconds(30),
			vpc: props.vpc,
		});
		betterAuthSecret.grantRead(apiFunction);
		databaseSecret.grantRead(apiFunction);

		const migrationFunction = this.createFunction({
			description: "Applies pending Drizzle migrations to Aurora PostgreSQL",
			environment: sharedDatabaseEnvironment,
			handler: "migration.handler",
			id: "MigrationFunction",
			lambdaSecurityGroup,
			logRemovalPolicy,
			timeout: Duration.minutes(5),
			vpc: props.vpc,
		});
		databaseSecret.grantRead(migrationFunction);

		const apiIntegration = new HttpLambdaIntegration(
			"ApiIntegration",
			apiFunction
		);
		httpApi.addRoutes({
			integration: apiIntegration,
			methods: [HttpMethod.ANY],
			path: "/",
		});
		httpApi.addRoutes({
			integration: apiIntegration,
			methods: [HttpMethod.ANY],
			path: "/{proxy+}",
		});
		NagSuppressions.addResourceSuppressions(
			httpApi,
			[
				{
					id: "AwsSolutions-APIG4",
					reason:
						"Hono and Better Auth implement route-level authentication; the API root and auth bootstrap endpoints must remain public.",
				},
			],
			true
		);

		createOutput(this, "ApiUrl", httpApi.apiEndpoint);
		createOutput(this, "ApiFunctionName", apiFunction.functionName);
		createOutput(this, "MigrationFunctionName", migrationFunction.functionName);

		this.templateOptions.description = `${props.projectName} ${props.environmentName} application runtime`;
	}

	private createFunction(options: {
		readonly description: string;
		readonly environment: Record<string, string>;
		readonly handler: string;
		readonly id: string;
		readonly lambdaSecurityGroup: ISecurityGroup;
		readonly logRemovalPolicy: RemovalPolicy;
		readonly timeout: Duration;
		readonly vpc: IVpc;
	}): LambdaFunction {
		const logGroup = new LogGroup(this, `${options.id}LogGroup`, {
			removalPolicy: options.logRemovalPolicy,
			retention: RetentionDays.TWO_WEEKS,
		});

		const lambdaFunction = new LambdaFunction(this, options.id, {
			architecture: Architecture.X86_64,
			code: Code.fromAsset(
				path.join(repositoryRoot, "apps/server/dist/lambda")
			),
			description: options.description,
			environment: options.environment,
			handler: options.handler,
			logGroup,
			memorySize: 512,
			reservedConcurrentExecutions: 10,
			runtime: Runtime.NODEJS_24_X,
			securityGroups: [options.lambdaSecurityGroup],
			timeout: options.timeout,
			tracing: Tracing.ACTIVE,
			vpc: options.vpc,
			vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
		});
		NagSuppressions.addResourceSuppressions(
			lambdaFunction,
			[
				{
					appliesTo: [
						"Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
						"Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole",
					],
					id: "AwsSolutions-IAM4",
					reason:
						"CDK attaches the AWS Lambda execution baselines; application secret permissions are still granted to exact secret ARNs.",
				},
				{
					appliesTo: ["Resource::*"],
					id: "AwsSolutions-IAM5",
					reason:
						"VPC ENI lifecycle and X-Ray telemetry APIs used by Lambda do not support resource-level IAM constraints.",
				},
			],
			true
		);

		return lambdaFunction;
	}

	private createProfileService(options: {
		readonly corsOrigin: string;
		readonly databaseCluster: DatabaseCluster;
		readonly databaseName: string;
		readonly databaseSecret: ISecret;
		readonly environmentName: "dev" | "prod";
		readonly lambdaSecurityGroup: ISecurityGroup;
		readonly serviceSecurityGroup: ISecurityGroup;
		readonly vpc: IVpc;
	}): string {
		const cluster = new Cluster(this, "ProfileServiceCluster", {
			containerInsightsV2: ContainerInsights.ENABLED,
			vpc: options.vpc,
		});
		const taskDefinition = new FargateTaskDefinition(
			this,
			"ProfileServiceTaskDefinition",
			{
				cpu: 256,
				memoryLimitMiB: 512,
				runtimePlatform: {
					cpuArchitecture: CpuArchitecture.X86_64,
					operatingSystemFamily: OperatingSystemFamily.LINUX,
				},
			}
		);
		const logGroup = new LogGroup(this, "ProfileServiceLogGroup", {
			removalPolicy:
				options.environmentName === "prod"
					? RemovalPolicy.RETAIN
					: RemovalPolicy.DESTROY,
			retention: RetentionDays.TWO_WEEKS,
		});
		const imageAsset = new DockerImageAsset(this, "ProfileServiceImage", {
			directory: path.join(repositoryRoot, "apps/profile-service"),
			platform: Platform.LINUX_AMD64,
		});
		const container = taskDefinition.addContainer("ProfileServiceContainer", {
			environment: {
				CORS_ORIGIN: options.corsOrigin,
				DATABASE_HOST: options.databaseCluster.clusterEndpoint.hostname,
				DATABASE_MAX_CONNECTIONS:
					options.environmentName === "prod" ? "10" : "5",
				DATABASE_NAME: options.databaseName,
				DATABASE_PORT: options.databaseCluster.clusterEndpoint.port.toString(),
				DATABASE_SSLMODE: "require",
				PORT: "8080",
			},
			image: ContainerImage.fromDockerImageAsset(imageAsset),
			logging: LogDrivers.awsLogs({
				logGroup,
				mode: AwsLogDriverMode.NON_BLOCKING,
				streamPrefix: "ecs",
			}),
			readonlyRootFilesystem: true,
			secrets: {
				DATABASE_PASSWORD: EcsSecret.fromSecretsManager(
					options.databaseSecret,
					"password"
				),
				DATABASE_USERNAME: EcsSecret.fromSecretsManager(
					options.databaseSecret,
					"username"
				),
			},
			stopTimeout: Duration.seconds(30),
		});
		container.addPortMappings({
			appProtocol: AppProtocol.http,
			containerPort: 8080,
			name: "http",
		});
		NagSuppressions.addResourceSuppressions(
			taskDefinition,
			[
				{
					appliesTo: ["Resource::*"],
					id: "AwsSolutions-IAM5",
					reason:
						"The ECS execution role needs ECR authorization, whose API does not support resource-level IAM constraints; secret access is scoped.",
				},
				{
					id: "AwsSolutions-ECS2",
					reason:
						"Only non-secret deployment configuration is present as environment variables; database credentials use ECS Secrets integration.",
				},
			],
			true
		);

		const service = new FargateService(this, "ProfileService", {
			assignPublicIp: false,
			circuitBreaker: { rollback: true },
			cluster,
			desiredCount: options.environmentName === "prod" ? 2 : 1,
			enableECSManagedTags: true,
			healthCheckGracePeriod: Duration.seconds(60),
			maxHealthyPercent: 200,
			minHealthyPercent: 100,
			securityGroups: [options.serviceSecurityGroup],
			taskDefinition,
			vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
		});

		const loadBalancerSecurityGroup = new SecurityGroup(
			this,
			"ProfileLoadBalancerSecurityGroup",
			{
				description:
					"Allows only the API Lambda to call the internal profile service",
				vpc: options.vpc,
			}
		);
		loadBalancerSecurityGroup.connections.allowFrom(
			options.lambdaSecurityGroup,
			Port.tcp(80),
			"HTTP from the API Lambda"
		);
		options.serviceSecurityGroup.connections.allowFrom(
			loadBalancerSecurityGroup,
			Port.tcp(8080),
			"HTTP from the internal load balancer"
		);

		const loadBalancer = new ApplicationLoadBalancer(
			this,
			"ProfileServiceLoadBalancer",
			{
				dropInvalidHeaderFields: true,
				internetFacing: false,
				securityGroup: loadBalancerSecurityGroup,
				vpc: options.vpc,
				vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
			}
		);
		const accessLogBucket = new Bucket(this, "ProfileAccessLogBucket", {
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			encryption: BucketEncryption.S3_MANAGED,
			enforceSSL: true,
			lifecycleRules: [{ expiration: Duration.days(90) }],
			removalPolicy: RemovalPolicy.RETAIN,
		});
		NagSuppressions.addResourceSuppressions(accessLogBucket, [
			{
				id: "AwsSolutions-S1",
				reason:
					"This bucket is the terminal access-log destination; recursive server-access logging would create another bucket without improving request visibility.",
			},
		]);
		loadBalancer.logAccessLogs(accessLogBucket, "profile-service");
		const listener = loadBalancer.addListener("HttpListener", {
			open: false,
			port: 80,
		});
		listener.addTargets("ProfileServiceTarget", {
			deregistrationDelay: Duration.seconds(60),
			healthCheck: {
				healthyHttpCodes: "200",
				interval: Duration.seconds(30),
				path: "/healthz",
				timeout: Duration.seconds(5),
				unhealthyThresholdCount: 2,
			},
			port: 8080,
			protocol: ApplicationProtocol.HTTP,
			targets: [service],
		});

		createOutput(this, "ProfileServiceClusterName", cluster.clusterName);
		createOutput(this, "ProfileServiceListenerArn", listener.listenerArn);
		createOutput(this, "ProfileServiceName", service.serviceName);

		return `http://${loadBalancer.loadBalancerDnsName}`;
	}
}
