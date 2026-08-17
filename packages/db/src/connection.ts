import { Pool } from "pg";

const MAX_POSTGRES_PORT = 65_535;

export interface DatabaseConnectionOptions {
	database?: string;
	databaseUrl?: string;
	host?: string;
	password?: string;
	port?: number | string;
	username?: string;
}

const normalizePort = (
	port: number | string | undefined
): number | undefined => {
	const parsedPort = typeof port === "string" ? Number(port) : port;

	if (
		parsedPort === undefined ||
		!Number.isInteger(parsedPort) ||
		parsedPort <= 0 ||
		parsedPort > MAX_POSTGRES_PORT
	) {
		return;
	}

	return parsedPort;
};

export const createDatabasePool = (
	options: DatabaseConnectionOptions,
	maxConnections?: number
): Pool => {
	if (options.databaseUrl) {
		return new Pool({
			connectionString: options.databaseUrl,
			...(maxConnections === undefined ? {} : { max: maxConnections }),
		});
	}

	const { database, host, password, username } = options;
	const port = normalizePort(options.port);
	const missingFields: string[] = [];

	if (!host) {
		missingFields.push("DATABASE_HOST");
	}
	if (port === undefined) {
		missingFields.push("DATABASE_PORT");
	}
	if (!database) {
		missingFields.push("DATABASE_NAME");
	}
	if (!username) {
		missingFields.push("DATABASE_USERNAME");
	}
	if (!password) {
		missingFields.push("DATABASE_PASSWORD");
	}

	if (missingFields.length > 0) {
		throw new Error(
			`Database connection configuration is missing: ${missingFields.join(", ")}`
		);
	}

	return new Pool({
		database,
		host,
		...(maxConnections === undefined ? {} : { max: maxConnections }),
		password,
		port,
		ssl: { rejectUnauthorized: false },
		user: username,
	});
};
