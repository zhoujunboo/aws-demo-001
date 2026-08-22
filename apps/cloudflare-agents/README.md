# Resume Deep Agents

One Cloudflare Worker exposes three independently addressable resume agents. Each
agent is created with Deep Agents and uses the native Workers AI binding.

## Endpoints

- `GET /health`
- `POST /v1/agents/tech-resume/run`
- `POST /v1/agents/ats-resume/run`
- `POST /v1/agents/resume-polisher/run`

All run endpoints require `Authorization: Bearer <AGENT_API_KEY>`.

## Request

```json
{
  "requestId": "run-001",
  "input": {
    "description": "为一名有 3 年经验的前端工程师生成中文简历",
    "resume": "可选：已有简历内容"
  }
}
```

## Local development

```bash
cp .dev.vars.example .dev.vars
pnpm dev
```

Workers AI requires remote development mode. Keep `.dev.vars` private.

## Deploy

```bash
pnpm exec wrangler secret put AGENT_API_KEY
pnpm run deploy
```
