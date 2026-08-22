import {
	customType,
	index,
	integer,
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
		capabilities: text("capabilities").array().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		description: text("description").notNull(),
		endpointUrl: text("endpoint_url").notNull(),
		id: text("id").primaryKey(),
		name: text("name").notNull(),
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
