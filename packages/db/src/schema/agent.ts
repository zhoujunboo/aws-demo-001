import {
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

const vector = customType<{ data: number[]; driverData: string }>({
	dataType: () => "vector",
	fromDriver: (value) =>
		value
			.slice(1, -1)
			.split(",")
			.map((item) => Number.parseFloat(item)),
	toDriver: (value) => `[${value.join(",")}]`,
});

export const agent = pgTable(
	"agent",
	{
		authorBio: text("author_bio").default("").notNull(),
		autoAcceptJobs: boolean("auto_accept_jobs").default(true).notNull(),
		capabilities: text("capabilities").array().notNull(),
		classification: text("classification").default("general").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		description: text("description").notNull(),
		endpointUrl: text("endpoint_url").notNull(),
		id: text("id").primaryKey(),
		inputSchema: jsonb("input_schema").notNull(),
		isFree: boolean("is_free").default(true).notNull(),
		name: text("name").notNull(),
		outputSchema: jsonb("output_schema"),
		outputTypes: text("output_types").array().default(["text"]).notNull(),
		settlementContractAddress: text("settlement_contract_address"),
		status: text("status").default("active").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [uniqueIndex("agent_endpoint_url_idx").on(table.endpointUrl)]
);

export const agentTask = pgTable("agent_task", {
	completedAt: timestamp("completed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	description: text("description").notNull(),
	id: text("id").primaryKey(),
	resume: text("resume"),
	status: text("status").default("running").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const agentEmbedding = pgTable(
	"agent_embedding",
	{
		agentId: text("agent_id")
			.primaryKey()
			.references(() => agent.id, { onDelete: "cascade" }),
		contentHash: text("content_hash").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		embedding: vector("embedding").notNull(),
		embeddingModel: text("embedding_model").notNull(),
		sourceText: text("source_text").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [index("agent_embedding_model_idx").on(table.embeddingModel)]
);

export const agentExecution = pgTable(
	"agent_execution",
	{
		agentId: text("agent_id")
			.notNull()
			.references(() => agent.id),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		durationMs: integer("duration_ms"),
		errorCode: text("error_code"),
		id: text("id").primaryKey(),
		output: text("output"),
		rank: integer("rank").notNull(),
		score: integer("score").notNull(),
		status: text("status").default("pending").notNull(),
		taskId: text("task_id")
			.notNull()
			.references(() => agentTask.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("agent_execution_task_agent_idx").on(
			table.taskId,
			table.agentId
		),
	]
);

export const agentWorkflow = pgTable("agent_workflow", {
	completedAt: timestamp("completed_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	description: text("description").notNull(),
	estimatedPriceCents: integer("estimated_price_cents").notNull(),
	id: text("id").primaryKey(),
	reliabilityScore: integer("reliability_score").notNull(),
	startedAt: timestamp("started_at", { withTimezone: true }),
	status: text("status").default("preview").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});

export const agentWorkflowStep = pgTable(
	"agent_workflow_step",
	{
		agentId: text("agent_id")
			.notNull()
			.references(() => agent.id),
		agentName: text("agent_name").notNull(),
		attemptCount: integer("attempt_count").default(0).notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		errorCode: text("error_code"),
		fairnessScore: integer("fairness_score").notNull(),
		id: text("id").primaryKey(),
		instruction: text("instruction").notNull(),
		matchScore: integer("match_score").notNull(),
		output: text("output"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		status: text("status").default("pending").notNull(),
		stepOrder: integer("step_order").notNull(),
		title: text("title").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		workflowId: text("workflow_id")
			.notNull()
			.references(() => agentWorkflow.id, { onDelete: "cascade" }),
	},
	(table) => [
		uniqueIndex("agent_workflow_step_order_idx").on(
			table.workflowId,
			table.stepOrder
		),
	]
);

export const agentDispatchStat = pgTable("agent_dispatch_stat", {
	agentId: text("agent_id")
		.primaryKey()
		.references(() => agent.id, { onDelete: "cascade" }),
	eligibleCount: integer("eligible_count").default(0).notNull(),
	executionCount: integer("execution_count").default(0).notNull(),
	lastSelectedAt: timestamp("last_selected_at", { withTimezone: true }),
	selectedCount: integer("selected_count").default(0).notNull(),
	successCount: integer("success_count").default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
});
