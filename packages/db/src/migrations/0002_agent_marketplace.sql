CREATE TABLE "agent" (
	"capabilities" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"endpoint_url" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_execution" (
	"agent_id" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"id" text PRIMARY KEY NOT NULL,
	"output" text,
	"rank" integer NOT NULL,
	"score" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"task_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_task" (
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"resume" text,
	"status" text DEFAULT 'running' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_execution" ADD CONSTRAINT "agent_execution_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution" ADD CONSTRAINT "agent_execution_task_id_agent_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agent_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_endpoint_url_idx" ON "agent" USING btree ("endpoint_url");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_execution_task_agent_idx" ON "agent_execution" USING btree ("task_id","agent_id");--> statement-breakpoint
INSERT INTO "agent" ("capabilities", "description", "endpoint_url", "id", "name")
VALUES
	(ARRAY['resume', 'software-engineering', 'typescript', 'react'], '为软件工程、数据和 AI 岗位生成技术型简历', 'https://resume-deep-agents.junbozhou88.workers.dev/v1/agents/tech-resume/run', 'tech-resume', '技术简历 Agent'),
	(ARRAY['resume', 'ats', 'keywords', 'job-description'], '根据岗位描述优化关键词和结构，提高 ATS 匹配度', 'https://resume-deep-agents.junbozhou88.workers.dev/v1/agents/ats-resume/run', 'ats-resume', 'ATS 简历优化 Agent'),
	(ARRAY['resume', 'polish', 'rewrite', 'editing'], '润色已有简历，使表达更专业、简洁、有说服力', 'https://resume-deep-agents.junbozhou88.workers.dev/v1/agents/resume-polisher/run', 'resume-polisher', '简历润色 Agent')
ON CONFLICT ("id") DO UPDATE SET
	"capabilities" = EXCLUDED."capabilities",
	"description" = EXCLUDED."description",
	"endpoint_url" = EXCLUDED."endpoint_url",
	"name" = EXCLUDED."name",
	"status" = 'active',
	"updated_at" = now();
