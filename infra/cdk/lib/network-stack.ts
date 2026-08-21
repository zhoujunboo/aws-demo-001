import {
	CfnOutput,
	CfnParameter,
	RemovalPolicy,
	Stack,
	type StackProps,
} from "aws-cdk-lib";
import {
	BlockDeviceVolume,
	EbsDeviceVolumeType,
	FlowLogDestination,
	FlowLogTrafficType,
	Instance,
	InstanceClass,
	InstanceSize,
	InstanceType,
	IpAddresses,
	MachineImage,
	SecurityGroup,
	SubnetType,
	Vpc,
} from "aws-cdk-lib/aws-ec2";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { NagSuppressions } from "cdk-nag";
import type { Construct } from "constructs";

const createOutput = (
	scope: Construct,
	id: string,
	value: string,
	description?: string
): CfnOutput => new CfnOutput(scope, id, { description, value });

export interface NetworkStackProps extends StackProps {
	readonly environmentName: string;
	readonly natGateways: number;
	readonly projectName: string;
	readonly vpcCidr: string;
}

export class NetworkStack extends Stack {
	readonly bastion: Instance;
	readonly bastionSecurityGroup: SecurityGroup;
	readonly vpc: Vpc;

	constructor(scope: Construct, id: string, props: NetworkStackProps) {
		super(scope, id, props);
		const region = props.env?.region;
		if (!region) {
			throw new Error("NetworkStack requires an explicit AWS region.");
		}
		const logRemovalPolicy =
			props.environmentName === "prod"
				? RemovalPolicy.RETAIN
				: RemovalPolicy.DESTROY;

		this.vpc = new Vpc(this, "Vpc", {
			availabilityZones: [`${region}a`, `${region}b`],
			ipAddresses: IpAddresses.cidr(props.vpcCidr),
			natGateways: props.natGateways,
			restrictDefaultSecurityGroup: true,
			subnetConfiguration: [
				{
					cidrMask: 24,
					name: "public",
					subnetType: SubnetType.PUBLIC,
				},
				{
					cidrMask: 24,
					name: "application",
					subnetType: SubnetType.PRIVATE_WITH_EGRESS,
				},
			],
		});

		const flowLogGroup = new LogGroup(this, "VpcFlowLogGroup", {
			removalPolicy: logRemovalPolicy,
			retention: RetentionDays.ONE_MONTH,
		});
		this.vpc.addFlowLog("VpcFlowLog", {
			destination: FlowLogDestination.toCloudWatchLogs(flowLogGroup),
			trafficType: FlowLogTrafficType.REJECT,
		});

		this.bastionSecurityGroup = new SecurityGroup(
			this,
			"BastionSecurityGroup",
			{
				description:
					"No-ingress security group for the SSM database tunnel host",
				vpc: this.vpc,
			}
		);

		const bastionRole = new Role(this, "BastionRole", {
			assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
			description: "Lets the private database tunnel host connect to SSM",
		});
		bastionRole.addManagedPolicy(
			ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
		);

		const bastionAmiId = new CfnParameter(this, "BastionAmiId", {
			default:
				"/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
			description:
				"Latest Amazon Linux 2023 x86_64 AMI from public SSM parameters.",
			type: "AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>",
		});
		this.bastion = new Instance(this, "Bastion", {
			blockDevices: [
				{
					deviceName: "/dev/xvda",
					volume: BlockDeviceVolume.ebs(8, {
						deleteOnTermination: true,
						encrypted: true,
						volumeType: EbsDeviceVolumeType.GP3,
					}),
				},
			],
			detailedMonitoring: true,
			instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
			machineImage: MachineImage.genericLinux({
				[region]: bastionAmiId.valueAsString,
			}),
			requireImdsv2: true,
			role: bastionRole,
			securityGroup: this.bastionSecurityGroup,
			vpc: this.vpc,
			vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
		});
		this.bastion.applyRemovalPolicy(RemovalPolicy.DESTROY);
		NagSuppressions.addResourceSuppressions(bastionRole, [
			{
				appliesTo: [
					"Policy::arn:<AWS::Partition>:iam::aws:policy/AmazonSSMManagedInstanceCore",
				],
				id: "AwsSolutions-IAM4",
				reason:
					"The AWS-maintained policy is the supported baseline for the SSM agent and avoids public SSH access.",
			},
		]);
		NagSuppressions.addResourceSuppressions(this.bastion, [
			{
				id: "AwsSolutions-EC29",
				reason:
					"The host is disposable, stores no data, and must remain removable with the development network stack.",
			},
		]);

		createOutput(
			this,
			"BastionInstanceId",
			this.bastion.instanceId,
			"Use this instance ID with AWS Systems Manager port forwarding."
		);
		createOutput(this, "VpcId", this.vpc.vpcId);
		createOutput(
			this,
			"SsmTunnelExample",
			`aws ssm start-session --target ${this.bastion.instanceId} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters host=DATABASE_HOST,portNumber=5432,localPortNumber=5432`,
			"Replace the database host after deploying the data stack."
		);

		this.templateOptions.description = `${props.projectName} ${props.environmentName} network foundation`;
	}
}
