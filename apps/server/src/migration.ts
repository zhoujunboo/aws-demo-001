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
	const startedAt = Date.now();
	console.info("[Migration] Applying pending Drizzle migrations");

	await runMigrations({
		database: process.env.DATABASE_NAME,
		databaseUrl: process.env.DATABASE_URL,
		host: process.env.DATABASE_HOST,
		migrationsFolder,
		password: process.env.DATABASE_PASSWORD,
		port: process.env.DATABASE_PORT,
		username: process.env.DATABASE_USERNAME,
	});

	const durationMs = Date.now() - startedAt;
	console.info(`[Migration] Completed in ${durationMs}ms`);

	return { durationMs, status: "completed" };
};
