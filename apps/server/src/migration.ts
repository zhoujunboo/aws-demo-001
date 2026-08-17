import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "@aws-demo-001/db/migrator";

const migrationsFolder = join(
	dirname(fileURLToPath(import.meta.url)),
	"migrations"
);

interface MigrationResult {
	durationMs: number;
	status: "completed";
}

export const handler = async (): Promise<MigrationResult> => {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required to run database migrations");
	}

	const startedAt = Date.now();
	console.info("[Migration] Applying pending Drizzle migrations");

	await runMigrations({ databaseUrl, migrationsFolder });

	const durationMs = Date.now() - startedAt;
	console.info(`[Migration] Completed in ${durationMs}ms`);

	return { durationMs, status: "completed" };
};
