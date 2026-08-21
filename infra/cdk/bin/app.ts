#!/usr/bin/env node
import { App, Aspects, Tags } from "aws-cdk-lib";
import { ManagedPolicy, PermissionsBoundary } from "aws-cdk-lib/aws-iam";
import { AwsSolutionsChecks } from "cdk-nag";
import { ApplicationStack } from "../lib/application-stack";
import { loadEnvironmentConfig } from "../lib/config";
import { DataStack } from "../lib/data-stack";
import { NetworkStack } from "../lib/network-stack";

const app = new App();
const config = loadEnvironmentConfig(app);
const stackPrefix = `${config.projectName}-${config.environmentName}-cdk`;
const commonStackProps = {
	env: config.environment,
	tags: {
		Environment: config.environmentName,
		ManagedBy: "CDK",
		Project: config.projectName,
	},
};

const networkStack = new NetworkStack(app, `${stackPrefix}-network`, {
	...commonStackProps,
	environmentName: config.environmentName,
	natGateways: config.natGateways,
	projectName: config.projectName,
	vpcCidr: config.vpcCidr,
});
const dataStack = new DataStack(app, `${stackPrefix}-data`, {
	...commonStackProps,
	auroraMaxCapacity: config.auroraMaxCapacity,
	auroraMinCapacity: config.auroraMinCapacity,
	bastionSecurityGroup: networkStack.bastionSecurityGroup,
	databaseName: config.databaseName,
	databaseUsername: config.databaseUsername,
	environmentName: config.environmentName,
	projectName: config.projectName,
	terminationProtection: config.environmentName === "prod",
	vpc: networkStack.vpc,
});
const applicationStack = new ApplicationStack(
	app,
	`${stackPrefix}-application`,
	{
		...commonStackProps,
		cluster: dataStack.cluster,
		corsOrigin: config.corsOrigin,
		databaseName: config.databaseName,
		environmentName: config.environmentName,
		projectName: config.projectName,
		vpc: networkStack.vpc,
	}
);

for (const stack of [networkStack, dataStack, applicationStack]) {
	PermissionsBoundary.of(stack).apply(
		ManagedPolicy.fromAwsManagedPolicyName("PowerUserAccess")
	);
}

Tags.of(app).add("Environment", config.environmentName);
Tags.of(app).add("ManagedBy", "CDK");
Tags.of(app).add("Project", config.projectName);
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

app.synth();
