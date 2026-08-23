ALTER TABLE "agent" ADD COLUMN "input_schema" jsonb;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "author_bio" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "auto_accept_jobs" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "classification" text DEFAULT 'general' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "is_free" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "output_schema" jsonb;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "output_types" text[] DEFAULT ARRAY['text']::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent" ADD COLUMN "settlement_contract_address" text;
--> statement-breakpoint
UPDATE "agent"
SET "input_schema" = '{"type":"object","properties":{"description":{"type":"string","description":"任务描述"},"resume":{"type":"string","description":"已有简历内容"}},"required":["description"],"additionalProperties":false}'::jsonb
WHERE "input_schema" IS NULL;
--> statement-breakpoint
ALTER TABLE "agent" ALTER COLUMN "input_schema" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_input_schema_object_check"
	CHECK (jsonb_typeof("input_schema") = 'object');
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_output_schema_object_check"
	CHECK ("output_schema" IS NULL OR jsonb_typeof("output_schema") = 'object');
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_output_types_check"
	CHECK (cardinality("output_types") > 0 AND "output_types" <@ ARRAY['text', 'image', 'json']::text[]);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_classification_check"
	CHECK ("classification" IN ('general', 'content', 'research', 'development', 'data', 'automation'));
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_settlement_contract_check"
	CHECK (("is_free" AND "settlement_contract_address" IS NULL) OR
	       (NOT "is_free" AND "settlement_contract_address" ~ '^0x[0-9a-fA-F]{40}$'));
