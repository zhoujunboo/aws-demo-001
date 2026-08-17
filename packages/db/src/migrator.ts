import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

interface RunMigrationsOptions {
	databaseUrl: string;
	migrationsFolder: string;
}

export const runMigrations = async ({
	databaseUrl,
	migrationsFolder,
}: RunMigrationsOptions): Promise<void> => {
	const pool = new Pool({ connectionString: databaseUrl, max: 1 });

	try {
		const database = drizzle(pool);
		await migrate(database, { migrationsFolder });
	} finally {
		await pool.end();
	}
};
