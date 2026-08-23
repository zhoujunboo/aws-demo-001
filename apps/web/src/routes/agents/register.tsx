// biome-ignore-all lint/performance/noJsxPropsBind: Dynamic form rows require value-specific handlers.
import { Badge } from "@aws-demo-001/ui/components/badge";
import { Button } from "@aws-demo-001/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@aws-demo-001/ui/components/card";
import { Checkbox } from "@aws-demo-001/ui/components/checkbox";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@aws-demo-001/ui/components/field";
import { Input } from "@aws-demo-001/ui/components/input";
import { Textarea } from "@aws-demo-001/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Braces,
	CheckCircle2,
	Database,
	FileText,
	Image,
	Loader2,
	Plus,
	Trash2,
} from "lucide-react";
import {
	type ChangeEvent,
	type FormEvent,
	useCallback,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import {
	type Agent,
	type AgentClassification,
	type AgentContract,
	type AgentOutputType,
	registerAgent,
} from "@/lib/agent-api";

export const Route = createFileRoute("/agents/register")({
	component: RegisterAgentPage,
});

type ParameterKind = "boolean" | "number" | "string" | "uri";

interface ParameterDraft {
	description: string;
	id: string;
	kind: ParameterKind;
	name: string;
	required: boolean;
}

interface RegistrationForm {
	authorBio: string;
	capabilityText: string;
	classification: AgentClassification;
	description: string;
	endpointUrl: string;
	id: string;
	name: string;
	settlementContractAddress: string;
}

const agentIDPattern = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const capabilitySeparatorPattern = /[,，]/;
const propertyNamePattern = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const settlementContractAddressPattern = /^0x[0-9a-fA-F]{40}$/;
const initialForm: RegistrationForm = {
	authorBio: "",
	capabilityText: "",
	classification: "general",
	description: "",
	endpointUrl: "",
	id: "",
	name: "",
	settlementContractAddress: "",
};
const classificationOptions: Array<{
	label: string;
	value: AgentClassification;
}> = [
	{ label: "通用助手", value: "general" },
	{ label: "内容创作", value: "content" },
	{ label: "研究分析", value: "research" },
	{ label: "开发工具", value: "development" },
	{ label: "数据处理", value: "data" },
	{ label: "流程自动化", value: "automation" },
];
const initialInputParameters: ParameterDraft[] = [
	{
		description: "用户希望 Agent 完成的任务",
		id: "input-description",
		kind: "string",
		name: "description",
		required: true,
	},
];
const initialOutputParameters: ParameterDraft[] = [
	{
		description: "Agent 生成的结构化结果",
		id: "output-result",
		kind: "string",
		name: "result",
		required: true,
	},
];
const outputOptions: Array<{
	description: string;
	icon: typeof FileText;
	label: string;
	value: AgentOutputType;
}> = [
	{
		description: "纯文本或 Markdown 内容",
		icon: FileText,
		label: "文本",
		value: "text",
	},
	{
		description: "平台可访问的图片 URL",
		icon: Image,
		label: "图片",
		value: "image",
	},
	{
		description: "供下游 Agent 直接读取的字段",
		icon: Braces,
		label: "结构化数据",
		value: "json",
	},
];

const parseCapabilities = (value: string): string[] => {
	const uniqueCapabilities = new Map<string, string>();
	for (const item of value.split(capabilitySeparatorPattern)) {
		const capability = item.trim();
		if (capability) {
			uniqueCapabilities.set(capability.toLowerCase(), capability);
		}
	}
	return [...uniqueCapabilities.values()];
};

const parametersAreValid = (parameters: ParameterDraft[]): boolean => {
	if (parameters.length === 0 || parameters.length > 24) {
		return false;
	}
	const names = new Set<string>();
	for (const parameter of parameters) {
		if (
			!propertyNamePattern.test(parameter.name) ||
			parameter.description.trim().length === 0 ||
			parameter.description.trim().length > 200 ||
			names.has(parameter.name)
		) {
			return false;
		}
		names.add(parameter.name);
	}
	return true;
};

const buildContract = (parameters: ParameterDraft[]): AgentContract => ({
	additionalProperties: false,
	properties: Object.fromEntries(
		parameters.map((parameter) => [
			parameter.name,
			{
				description: parameter.description.trim(),
				...(parameter.kind === "uri" ? { format: "uri" as const } : {}),
				type: parameter.kind === "uri" ? "string" : parameter.kind,
			},
		])
	),
	required: parameters
		.filter((parameter) => parameter.required)
		.map((parameter) => parameter.name),
	type: "object",
});

const sampleValue = (kind: ParameterKind): boolean | number | string => {
	switch (kind) {
		case "boolean":
			return true;
		case "number":
			return 1;
		case "uri":
			return "https://example.com/file.pdf";
		default:
			return "用户输入";
	}
};

function ParameterBuilder({
	disabled,
	onAdd,
	onChange,
	onRemove,
	parameters,
}: {
	disabled: boolean;
	onAdd: () => void;
	onChange: (id: string, changes: Partial<ParameterDraft>) => void;
	onRemove: (id: string) => void;
	parameters: ParameterDraft[];
}) {
	return (
		<div className="flex flex-col gap-3">
			<div className="hidden grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.4fr)_6rem_2rem] gap-2 px-1 text-muted-foreground text-xs md:grid">
				<span>参数名</span>
				<span>类型</span>
				<span>说明</span>
				<span>必填</span>
				<span className="sr-only">操作</span>
			</div>
			{parameters.map((parameter) => {
				const nameIsInvalid =
					parameter.name.length > 0 &&
					!propertyNamePattern.test(parameter.name);
				return (
					<div
						className="grid gap-2 border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.4fr)_6rem_2rem] md:items-center md:border-0 md:bg-transparent md:p-0"
						key={parameter.id}
					>
						<Input
							aria-invalid={nameIsInvalid}
							aria-label="参数名"
							disabled={disabled}
							maxLength={64}
							onChange={(event) =>
								onChange(parameter.id, { name: event.target.value })
							}
							placeholder="例如 topic"
							value={parameter.name}
						/>
						<select
							aria-label="参数类型"
							className="h-8 w-full border border-input bg-background px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50"
							disabled={disabled}
							onChange={(event) =>
								onChange(parameter.id, {
									kind: event.target.value as ParameterKind,
								})
							}
							value={parameter.kind}
						>
							<option value="string">文本</option>
							<option value="number">数字</option>
							<option value="boolean">是 / 否</option>
							<option value="uri">文件 URL</option>
						</select>
						<Input
							aria-label="参数说明"
							disabled={disabled}
							maxLength={200}
							onChange={(event) =>
								onChange(parameter.id, { description: event.target.value })
							}
							placeholder="说明字段用途"
							value={parameter.description}
						/>
						<label
							className="flex min-h-8 items-center gap-2 text-xs"
							htmlFor={`${parameter.id}-required`}
						>
							<Checkbox
								checked={parameter.required}
								disabled={disabled}
								id={`${parameter.id}-required`}
								onCheckedChange={(checked) =>
									onChange(parameter.id, { required: checked })
								}
							/>
							必填
						</label>
						<Button
							aria-label="删除参数"
							disabled={disabled || parameters.length === 1}
							onClick={() => onRemove(parameter.id)}
							size="icon"
							title="删除参数"
							type="button"
							variant="ghost"
						>
							<Trash2 />
						</Button>
						{nameIsInvalid ? (
							<FieldError className="md:col-span-5">
								参数名需以字母开头，只能包含字母、数字和下划线。
							</FieldError>
						) : null}
					</div>
				);
			})}
			<Button
				className="w-fit"
				disabled={disabled || parameters.length >= 24}
				onClick={onAdd}
				size="sm"
				type="button"
				variant="outline"
			>
				<Plus data-icon="inline-start" />
				添加参数
			</Button>
		</div>
	);
}

function BinarySwitch({
	checked,
	disabled,
	label,
	onCheckedChange,
}: {
	checked: boolean;
	disabled: boolean;
	label: string;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<button
			aria-checked={checked}
			aria-label={label}
			className="relative h-5 w-9 shrink-0 rounded-full border border-input bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-checked:border-primary aria-checked:bg-primary aria-checked:[&>span]:translate-x-4"
			disabled={disabled}
			onClick={() => onCheckedChange(!checked)}
			role="switch"
			type="button"
		>
			<span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-background shadow-sm transition-transform" />
		</button>
	);
}

function RegistrationSuccess({ agent }: { agent: Agent }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<CheckCircle2 aria-hidden="true" />
					{agent.name} 已注册
				</CardTitle>
				<CardDescription>
					Agent 调用契约、元数据和能力向量已写入数据库。
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="border bg-muted/30 p-4">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-sm">{agent.id}</span>
						<Badge variant="secondary">可用</Badge>
						{agent.outputTypes.map((outputType) => (
							<Badge key={outputType} variant="outline">
								{outputType}
							</Badge>
						))}
						<Badge variant="outline">{agent.isFree ? "免费" : "收费"}</Badge>
					</div>
					<p className="mt-2 text-muted-foreground text-sm">
						{agent.description}
					</p>
				</div>
			</CardContent>
			<CardFooter className="mt-4">
				<Button
					nativeButton={false}
					render={<Link to="/agents" />}
					variant="outline"
				>
					<ArrowLeft data-icon="inline-start" />
					返回 Agent 列表
				</Button>
			</CardFooter>
		</Card>
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This component coordinates one conditional registration form.
function RegisterAgentPage() {
	const queryClient = useQueryClient();
	const [form, setForm] = useState(initialForm);
	const [inputParameters, setInputParameters] = useState(
		initialInputParameters
	);
	const [outputParameters, setOutputParameters] = useState(
		initialOutputParameters
	);
	const [outputTypes, setOutputTypes] = useState<AgentOutputType[]>(["text"]);
	const [autoAcceptJobs, setAutoAcceptJobs] = useState(true);
	const [isFree, setIsFree] = useState(true);
	const [registeredAgent, setRegisteredAgent] = useState<Agent | null>(null);
	const capabilities = useMemo(
		() => parseCapabilities(form.capabilityText),
		[form.capabilityText]
	);
	const inputContract = useMemo(
		() => buildContract(inputParameters),
		[inputParameters]
	);
	const inputPreview = useMemo(
		() =>
			JSON.stringify(
				{
					input: Object.fromEntries(
						inputParameters
							.filter((parameter) => parameter.name.length > 0)
							.map((parameter) => [parameter.name, sampleValue(parameter.kind)])
					),
					requestId: "run_01H...",
				},
				null,
				2
			),
		[inputParameters]
	);
	const hasStructuredOutput = outputTypes.includes("json");
	const idIsInvalid = form.id.length > 0 && !agentIDPattern.test(form.id);
	const endpointIsInvalid =
		form.endpointUrl.length > 0 && !form.endpointUrl.startsWith("https://");
	const settlementContractIsInvalid =
		!isFree &&
		form.settlementContractAddress.length > 0 &&
		!settlementContractAddressPattern.test(form.settlementContractAddress);
	const formIsValid =
		agentIDPattern.test(form.id) &&
		form.name.trim().length >= 2 &&
		form.description.trim().length >= 10 &&
		capabilities.length >= 1 &&
		capabilities.length <= 12 &&
		form.endpointUrl.startsWith("https://") &&
		(isFree ||
			settlementContractAddressPattern.test(form.settlementContractAddress)) &&
		parametersAreValid(inputParameters) &&
		outputTypes.length > 0 &&
		(!hasStructuredOutput || parametersAreValid(outputParameters));

	const registration = useMutation({
		mutationFn: registerAgent,
		onError: (error) => toast.error(error.message),
		onSuccess: async (agent) => {
			setRegisteredAgent(agent);
			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			toast.success("Agent 已注册并完成契约校验");
		},
	});

	const updateField = useCallback(
		(field: keyof RegistrationForm) =>
			(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
				setForm((currentForm) => ({
					...currentForm,
					[field]: event.target.value,
				}));
			},
		[]
	);
	const addParameter = useCallback((target: "input" | "output") => {
		const parameter: ParameterDraft = {
			description: "",
			id: crypto.randomUUID(),
			kind: "string",
			name: "",
			required: true,
		};
		if (target === "input") {
			setInputParameters((current) => [...current, parameter]);
		} else {
			setOutputParameters((current) => [...current, parameter]);
		}
	}, []);
	const updateParameter = useCallback(
		(
			target: "input" | "output",
			id: string,
			changes: Partial<ParameterDraft>
		) => {
			const update = (parameters: ParameterDraft[]) =>
				parameters.map((parameter) =>
					parameter.id === id ? { ...parameter, ...changes } : parameter
				);
			if (target === "input") {
				setInputParameters(update);
			} else {
				setOutputParameters(update);
			}
		},
		[]
	);
	const removeParameter = useCallback(
		(target: "input" | "output", id: string) => {
			const remove = (parameters: ParameterDraft[]) =>
				parameters.filter((parameter) => parameter.id !== id);
			if (target === "input") {
				setInputParameters(remove);
			} else {
				setOutputParameters(remove);
			}
		},
		[]
	);
	const toggleOutputType = useCallback(
		(outputType: AgentOutputType, checked: boolean) => {
			setOutputTypes((current) =>
				checked
					? [...current, outputType]
					: current.filter((item) => item !== outputType)
			);
		},
		[]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (!formIsValid) {
				return;
			}
			registration.mutate({
				authorBio: form.authorBio.trim(),
				autoAcceptJobs,
				capabilities,
				classification: form.classification,
				description: form.description.trim(),
				endpointUrl: form.endpointUrl.trim(),
				id: form.id.trim(),
				inputSchema: inputContract,
				isFree,
				name: form.name.trim(),
				...(hasStructuredOutput
					? { outputSchema: buildContract(outputParameters) }
					: {}),
				outputTypes,
				...(isFree
					? {}
					: {
							settlementContractAddress: form.settlementContractAddress.trim(),
						}),
			});
		},
		[
			autoAcceptJobs,
			capabilities,
			form,
			formIsValid,
			hasStructuredOutput,
			inputContract,
			isFree,
			outputParameters,
			outputTypes,
			registration,
		]
	);

	return (
		<main className="overflow-y-auto">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
				<header className="flex flex-col gap-2">
					<Badge className="w-fit" variant="outline">
						<Database data-icon="inline-start" />
						Agent Registry
					</Badge>
					<h1 className="font-semibold text-2xl">注册 Agent</h1>
					<p className="text-muted-foreground text-sm">
						声明服务能力与调用契约，平台将据此完成匹配和 Agent 间调度。
					</p>
				</header>

				{registeredAgent ? (
					<RegistrationSuccess agent={registeredAgent} />
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Agent 信息</CardTitle>
							<CardDescription>
								注册已部署、可通过 HTTPS 调用的 Agent 服务。
							</CardDescription>
						</CardHeader>
						<form onSubmit={handleSubmit}>
							<CardContent>
								<FieldGroup>
									<div className="grid gap-5 md:grid-cols-2">
										<Field data-invalid={idIsInvalid}>
											<FieldLabel htmlFor="agent-id">Agent ID</FieldLabel>
											<Input
												aria-invalid={idIsInvalid}
												disabled={registration.isPending}
												id="agent-id"
												maxLength={64}
												onChange={updateField("id")}
												placeholder="frontend-resume"
												value={form.id}
											/>
											<FieldDescription>
												小写字母、数字和连字符。
											</FieldDescription>
											{idIsInvalid ? (
												<FieldError>ID 格式不正确。</FieldError>
											) : null}
										</Field>
										<Field>
											<FieldLabel htmlFor="agent-name">名称</FieldLabel>
											<Input
												disabled={registration.isPending}
												id="agent-name"
												maxLength={80}
												onChange={updateField("name")}
												placeholder="前端简历 Agent"
												value={form.name}
											/>
										</Field>
									</div>
									<div className="grid gap-5 md:grid-cols-2">
										<Field>
											<FieldLabel htmlFor="agent-classification">
												Agent 分类
											</FieldLabel>
											<select
												className="h-8 w-full border border-input bg-background px-2.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50"
												disabled={registration.isPending}
												id="agent-classification"
												onChange={(event) =>
													setForm((currentForm) => ({
														...currentForm,
														classification: event.target
															.value as AgentClassification,
													}))
												}
												value={form.classification}
											>
												{classificationOptions.map((option) => (
													<option key={option.value} value={option.value}>
														{option.label}
													</option>
												))}
											</select>
											<FieldDescription>
												帮助平台理解能力领域，并结合描述和标签完成匹配。
											</FieldDescription>
										</Field>
										<Field>
											<FieldLabel>任务接入</FieldLabel>
											<div className="flex min-h-8 items-center gap-3">
												<BinarySwitch
													checked={autoAcceptJobs}
													disabled={registration.isPending}
													label="自动接受任务"
													onCheckedChange={setAutoAcceptJobs}
												/>
												<span className="text-xs">
													{autoAcceptJobs ? "自动接受任务" : "仅接受手动选择"}
												</span>
											</div>
											<FieldDescription>
												关闭后不进入自动匹配池，用户仍可手动选择。
											</FieldDescription>
										</Field>
									</div>
									<Field>
										<FieldLabel htmlFor="agent-description">
											能力描述
										</FieldLabel>
										<Textarea
											disabled={registration.isPending}
											id="agent-description"
											maxLength={1000}
											onChange={updateField("description")}
											placeholder="为前端工程师生成专业简历，突出 React、TypeScript 和项目成果。"
											rows={4}
											value={form.description}
										/>
										<FieldDescription>
											这段内容会参与向量化，请写清擅长解决的问题。
										</FieldDescription>
									</Field>
									<Field>
										<FieldLabel htmlFor="agent-author-bio">作者简介</FieldLabel>
										<Textarea
											disabled={registration.isPending}
											id="agent-author-bio"
											maxLength={500}
											onChange={updateField("authorBio")}
											placeholder="团队背景、相关经验或可信资质（选填）"
											rows={3}
											value={form.authorBio}
										/>
										<FieldDescription>
											用于 Agent 详情页的信任信息，不参与任务参数传递。
										</FieldDescription>
									</Field>
									<Field data-invalid={capabilities.length > 12}>
										<FieldLabel htmlFor="agent-capabilities">
											能力标签
										</FieldLabel>
										<Input
											disabled={registration.isPending}
											id="agent-capabilities"
											onChange={updateField("capabilityText")}
											placeholder="resume, frontend, react, typescript"
											value={form.capabilityText}
										/>
										<FieldDescription>
											用逗号分隔，最多 12 个。
										</FieldDescription>
										{capabilities.length > 12 ? (
											<FieldError>能力标签不能超过 12 个。</FieldError>
										) : null}
									</Field>

									<FieldSet className="border-t pt-6">
										<FieldLegend>输入参数</FieldLegend>
										<FieldDescription>
											至少配置一个字段；平台自动生成 inputSchema，无需手写
											JSON。
										</FieldDescription>
										<ParameterBuilder
											disabled={registration.isPending}
											onAdd={() => addParameter("input")}
											onChange={(id, changes) =>
												updateParameter("input", id, changes)
											}
											onRemove={(id) => removeParameter("input", id)}
											parameters={inputParameters}
										/>
										<div className="overflow-hidden border bg-muted/30">
											<div className="border-b px-3 py-2 font-medium text-xs">
												平台请求格式预览
											</div>
											<pre className="overflow-x-auto p-3 text-xs leading-5">
												{inputPreview}
											</pre>
										</div>
									</FieldSet>

									<FieldSet className="border-t pt-6">
										<FieldLegend>输出类型</FieldLegend>
										<FieldDescription>
											可多选，至少选择一项。文本默认开启。
										</FieldDescription>
										<div className="grid gap-3 md:grid-cols-3">
											{outputOptions.map((option) => {
												const Icon = option.icon;
												return (
													<label
														className="flex min-h-20 cursor-pointer items-start gap-3 border p-3 transition-colors hover:bg-muted/40 has-data-checked:border-primary/40 has-data-checked:bg-primary/5"
														htmlFor={`output-type-${option.value}`}
														key={option.value}
													>
														<Checkbox
															checked={outputTypes.includes(option.value)}
															disabled={registration.isPending}
															id={`output-type-${option.value}`}
															onCheckedChange={(checked) =>
																toggleOutputType(option.value, checked)
															}
														/>
														<Icon
															aria-hidden="true"
															className="mt-0.5 size-4"
														/>
														<span className="flex flex-col gap-1">
															<span className="font-medium text-xs">
																{option.label}
															</span>
															<span className="text-muted-foreground text-xs">
																{option.description}
															</span>
														</span>
													</label>
												);
											})}
										</div>
										{outputTypes.length === 0 ? (
											<FieldError>至少选择一种输出类型。</FieldError>
										) : null}
										{hasStructuredOutput ? (
											<div className="flex flex-col gap-3 border-primary/30 border-l-2 pl-4">
												<div>
													<p className="font-medium text-xs">结构化结果字段</p>
													<p className="mt-1 text-muted-foreground text-xs">
														平台用这些字段校验结果，并映射给下一个 Agent。
													</p>
												</div>
												<ParameterBuilder
													disabled={registration.isPending}
													onAdd={() => addParameter("output")}
													onChange={(id, changes) =>
														updateParameter("output", id, changes)
													}
													onRemove={(id) => removeParameter("output", id)}
													parameters={outputParameters}
												/>
											</div>
										) : null}
									</FieldSet>

									<Field
										className="border-t pt-6"
										data-invalid={endpointIsInvalid}
									>
										<FieldLabel htmlFor="agent-endpoint">
											HTTPS 调用地址
										</FieldLabel>
										<Input
											aria-invalid={endpointIsInvalid}
											disabled={registration.isPending}
											id="agent-endpoint"
											onChange={updateField("endpointUrl")}
											placeholder="https://example.com/v1/run"
											type="url"
											value={form.endpointUrl}
										/>
										{endpointIsInvalid ? (
											<FieldError>生产 Agent 必须使用 HTTPS。</FieldError>
										) : null}
									</Field>

									<FieldSet className="border-t pt-6">
										<FieldLegend>接单与结算</FieldLegend>
										<FieldDescription>
											当前只登记结算入口，不会发起链上转账、授权或质押。
										</FieldDescription>
										<Field>
											<FieldLabel>收费模式</FieldLabel>
											<div className="flex min-h-8 items-center gap-3">
												<BinarySwitch
													checked={isFree}
													disabled={registration.isPending}
													label="免费提供"
													onCheckedChange={(checked) => {
														setIsFree(checked);
														if (checked) {
															setForm((currentForm) => ({
																...currentForm,
																settlementContractAddress: "",
															}));
														}
													}}
												/>
												<span className="text-xs">
													{isFree ? "免费" : "通过合约结算"}
												</span>
											</div>
										</Field>
										{isFree ? null : (
											<Field data-invalid={settlementContractIsInvalid}>
												<FieldLabel htmlFor="settlement-contract-address">
													结算合约地址
												</FieldLabel>
												<Input
													aria-invalid={settlementContractIsInvalid}
													disabled={registration.isPending}
													id="settlement-contract-address"
													maxLength={42}
													onChange={updateField("settlementContractAddress")}
													placeholder="0x0000000000000000000000000000000000000000"
													value={form.settlementContractAddress}
												/>
												<FieldDescription>
													预留给后续支付托管、结果结算和质押协议。
												</FieldDescription>
												{settlementContractIsInvalid ? (
													<FieldError>
														请输入 0x 开头的 42 位 EVM 合约地址。
													</FieldError>
												) : null}
											</Field>
										)}
									</FieldSet>
								</FieldGroup>
							</CardContent>
							<CardFooter className="mt-5 justify-between gap-4">
								<p aria-live="polite" className="text-muted-foreground text-xs">
									{registration.isPending
										? "正在校验契约、生成能力向量并保存。"
										: "注册成功后会立即进入 Agent 匹配池。"}
								</p>
								<Button
									disabled={!formIsValid || registration.isPending}
									type="submit"
								>
									{registration.isPending ? (
										<Loader2
											className="animate-spin"
											data-icon="inline-start"
										/>
									) : (
										<Plus data-icon="inline-start" />
									)}
									{registration.isPending ? "注册中" : "注册 Agent"}
								</Button>
							</CardFooter>
						</form>
					</Card>
				)}
			</div>
		</main>
	);
}
