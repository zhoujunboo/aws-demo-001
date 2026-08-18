import { env } from "@aws-demo-001/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import { createDatabasePool } from "./connection";
import {
	account,
	accountRelations,
	githubProfile,
	profileIntroduction,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "./schema";

const schema = {
	account,
	accountRelations,
	githubProfile,
	profileIntroduction,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
};

export function createDb() {
	const pool = createDatabasePool({
		database: env.DATABASE_NAME,
		databaseUrl: env.DATABASE_URL,
		host: env.DATABASE_HOST,
		password: env.DATABASE_PASSWORD,
		port: env.DATABASE_PORT,
		username: env.DATABASE_USERNAME,
	});

	return drizzle(pool, { schema });
}

export const db = createDb();
