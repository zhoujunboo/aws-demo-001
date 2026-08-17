import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import {
	createDatabasePool,
	type DatabaseConnectionOptions,
} from "./connection";

interface RunMigrationsOptions extends DatabaseConnectionOptions {
	migrationsFolder: string;
}

export const runMigrations = async ({
	migrationsFolder,
	...connectionOptions
}: RunMigrationsOptions): Promise<void> => {
	const pool = createDatabasePool(connectionOptions, 1);

	try {
		const database = drizzle(pool);
		await migrate(database, { migrationsFolder });
	} finally {
		await pool.end();
	}
};
