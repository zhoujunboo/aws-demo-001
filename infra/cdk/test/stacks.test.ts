import assert from "node:assert/strict";
import test from "node:test";
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { ApplicationStack } from "../lib/application-stack";
import { loadEnvironmentConfig } from "../lib/config";
import { DataStack } from "../lib/data-stack";
import { NetworkStack } from "../lib/network-stack";

const PRODUCTION_CORS_ERROR_PATTERN = /Set the real production corsOrigin/;
const TEST_ACCOUNT = "111111111111";
const TEST_REGION = "us-east-1";

const createTestStacks = (): {
	readonly application: Template;
	readonly data: Template;
	readonly network: Template;
} => {
	const app = new App({
		context: {
			[`availability-zones:account=${TEST_ACCOUNT}:region=${TEST_REGION}`]: [
				`${TEST_REGION}a`,
				`${TEST_REGION}b`,
			],
		},
	});
	const stackProps = { env: { account: TEST_ACCOUNT, region: TEST_REGION } };
	const networkStack = new NetworkStack(app, "TestNetwork", {
		...stackProps,
		environmentName: "dev",
		natGateways: 1,
		projectName: "test-project",
		vpcCidr: "10.99.0.0/16",
	});
	const dataStack = new DataStack(app, "TestData", {
		...stackProps,
		auroraMaxCapacity: 1,
		auroraMinCapacity: 0.5,
		bastionSecurityGroup: networkStack.bastionSecurityGroup,
		databaseName: "testdb",
		databaseUsername: "postgres",
		environmentName: "dev",
		projectName: "test-project",
		vpc: networkStack.vpc,
	});
	const applicationStack = new ApplicationStack(app, "TestApplication", {
		...stackProps,
		cluster: dataStack.cluster,
		corsOrigin: "https://example.com",
		databaseName: "testdb",
		environmentName: "dev",
		projectName: "test-project",
		vpc: networkStack.vpc,
	});

	return {
		application: Template.fromStack(applicationStack),
		data: Template.fromStack(dataStack),
		network: Template.fromStack(networkStack),
	};
};

test("network creates one VPC and one development NAT gateway", () => {
	const { network } = createTestStacks();
	network.resourceCountIs("AWS::EC2::VPC", 1);
	network.resourceCountIs("AWS::EC2::NatGateway", 1);
});

test("database is encrypted and uses managed credentials", () => {
	const { data } = createTestStacks();
	data.hasResourceProperties("AWS::RDS::DBCluster", {
		ManageMasterUserPassword: true,
		StorageEncrypted: true,
	});
});

test("application keeps compute private and observable", () => {
	const { application } = createTestStacks();
	application.resourceCountIs("AWS::Lambda::Function", 2);
	application.hasResourceProperties("AWS::Lambda::Function", {
		TracingConfig: { Mode: "Active" },
		VpcConfig: Match.objectLike({
			SecurityGroupIds: Match.anyValue(),
			SubnetIds: Match.anyValue(),
		}),
	});
	application.hasResourceProperties("AWS::ECS::TaskDefinition", {
		ContainerDefinitions: Match.arrayWith([
			Match.objectLike({ ReadonlyRootFilesystem: true }),
		]),
	});
	assert.doesNotThrow(() =>
		application.hasResourceProperties("AWS::ApiGatewayV2::Api", {
			ProtocolType: "HTTP",
		})
	);
});

test("production synthesis is blocked while CORS uses a placeholder", () => {
	const app = new App({ context: { environment: "prod" } });
	assert.throws(
		() => loadEnvironmentConfig(app),
		PRODUCTION_CORS_ERROR_PATTERN
	);
});
