CREATE TABLE "agent_workflow" (
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"estimated_price_cents" integer NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"reliability_score" integer NOT NULL,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'preview' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_workflow_step" (
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error_code" text,
	"fairness_score" integer NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"instruction" text NOT NULL,
	"match_score" integer NOT NULL,
	"output" text,
	"started_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"step_order" integer NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workflow_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_dispatch_stat" (
	"agent_id" text PRIMARY KEY NOT NULL,
	"eligible_count" integer DEFAULT 0 NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"last_selected_at" timestamp with time zone,
	"selected_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_workflow_step" ADD CONSTRAINT "agent_workflow_step_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_workflow_step" ADD CONSTRAINT "agent_workflow_step_workflow_id_agent_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."agent_workflow"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_dispatch_stat" ADD CONSTRAINT "agent_dispatch_stat_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_workflow_step_order_idx" ON "agent_workflow_step" USING btree ("workflow_id", "step_order");
