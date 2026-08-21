import type { App, Environment } from "aws-cdk-lib";

export type EnvironmentName = "dev" | "prod";

export interface EnvironmentConfig {
	readonly account: string;
	readonly auroraMaxCapacity: number;
	readonly auroraMinCapacity: number;
	readonly corsOrigin: string;
	readonly databaseName: string;
	readonly databaseUsername: string;
	readonly environment: Environment;
	readonly environmentName: EnvironmentName;
	readonly natGateways: number;
	readonly projectName: string;
	readonly region: string;
	readonly vpcCidr: string;
}

interface StaticEnvironmentConfig {
	readonly account: string;
	readonly auroraMaxCapacity: number;
	readonly auroraMinCapacity: number;
	readonly corsOrigin: string;
	readonly databaseName: string;
	readonly databaseUsername: string;
	readonly natGateways: number;
	readonly projectName: string;
	readonly region: string;
	readonly vpcCidr: string;
}

const ENVIRONMENTS: Record<EnvironmentName, StaticEnvironmentConfig> = {
	dev: {
		account: "492646066759",
		auroraMaxCapacity: 1,
		auroraMinCapacity: 0.5,
		corsOrigin: "https://frosty-meadow-9529.junbozhou88.workers.dev",
		databaseName: "githubprofile",
		databaseUsername: "postgres",
		natGateways: 1,
		projectName: "github-profile",
		region: "us-east-1",
		vpcCidr: "10.10.0.0/16",
	},
	prod: {
		account: "492646066759",
		auroraMaxCapacity: 4,
		auroraMinCapacity: 0.5,
		corsOrigin: "https://example.com",
		databaseName: "githubprofile",
		databaseUsername: "postgres",
		natGateways: 2,
		projectName: "github-profile",
		region: "us-east-1",
		vpcCidr: "10.20.0.0/16",
	},
};
const PRODUCTION_CORS_PLACEHOLDER = "https://example.com";

const isEnvironmentName = (value: unknown): value is EnvironmentName =>
	value === "dev" || value === "prod";

export const loadEnvironmentConfig = (app: App): EnvironmentConfig => {
	const environmentName: unknown = app.node.tryGetContext("environment");
	if (!isEnvironmentName(environmentName)) {
		throw new Error(
			'CDK context "environment" must be either "dev" or "prod".'
		);
	}

	const config = ENVIRONMENTS[environmentName];
	if (
		environmentName === "prod" &&
		config.corsOrigin === PRODUCTION_CORS_PLACEHOLDER
	) {
		throw new Error(
			"Set the real production corsOrigin in lib/config.ts before synthesizing prod."
		);
	}
	const account = process.env.CDK_DEFAULT_ACCOUNT ?? config.account;
	const region = process.env.CDK_DEFAULT_REGION ?? config.region;

	return {
		...config,
		account,
		environment: { account, region },
		environmentName,
		region,
	};
};
