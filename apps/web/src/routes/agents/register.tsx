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
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@aws-demo-001/ui/components/field";
import { Input } from "@aws-demo-001/ui/components/input";
import { Textarea } from "@aws-demo-001/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Database, Loader2, Plus } from "lucide-react";
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
	type RegisterAgentInput,
	registerAgent,
} from "@/lib/agent-api";

export const Route = createFileRoute("/agents/register")({
	component: RegisterAgentPage,
});

const agentIDPattern = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const capabilitySeparatorPattern = /[,，]/;
const initialForm: RegisterAgentInput & { capabilityText: string } = {
	capabilities: [],
	capabilityText: "",
	description: "",
	endpointUrl: "",
	id: "",
	name: "",
};

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

function RegistrationSuccess({ agent }: { agent: Agent }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<CheckCircle2 aria-hidden="true" />
					{agent.name} 已注册
				</CardTitle>
				<CardDescription>
					Agent 元数据和能力向量已同时写入数据库。
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="border bg-muted/30 p-4">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-sm">{agent.id}</span>
						<Badge variant="secondary">可用</Badge>
						<Badge variant="outline">
							<Database data-icon="inline-start" />
							向量已入库
						</Badge>
					</div>
					<p className="mt-2 text-muted-foreground text-sm">
						{agent.description}
					</p>
					<div className="mt-3 flex flex-wrap gap-1.5">
						{agent.capabilities.map((capability) => (
							<Badge key={capability} variant="outline">
								{capability}
							</Badge>
						))}
					</div>
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

function RegisterAgentPage() {
	const queryClient = useQueryClient();
	const [form, setForm] = useState(initialForm);
	const [registeredAgent, setRegisteredAgent] = useState<Agent | null>(null);
	const capabilities = useMemo(
		() => parseCapabilities(form.capabilityText),
		[form.capabilityText]
	);
	const idIsInvalid = form.id.length > 0 && !agentIDPattern.test(form.id);
	const endpointIsInvalid =
		form.endpointUrl.length > 0 && !form.endpointUrl.startsWith("https://");
	const formIsValid =
		agentIDPattern.test(form.id) &&
		form.name.trim().length >= 2 &&
		form.description.trim().length >= 10 &&
		capabilities.length >= 1 &&
		capabilities.length <= 12 &&
		form.endpointUrl.startsWith("https://");

	const registration = useMutation({
		mutationFn: registerAgent,
		onError: (error) => toast.error(error.message),
		onSuccess: async (agent) => {
			setRegisteredAgent(agent);
			await queryClient.invalidateQueries({ queryKey: ["agents"] });
			toast.success("Agent 已注册并完成向量入库");
		},
	});

	const updateField = useCallback(
		(field: "capabilityText" | "description" | "endpointUrl" | "id" | "name") =>
			(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
				setForm((currentForm) => ({
					...currentForm,
					[field]: event.target.value,
				}));
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
				capabilities,
				description: form.description.trim(),
				endpointUrl: form.endpointUrl.trim(),
				id: form.id.trim(),
				name: form.name.trim(),
			});
		},
		[capabilities, form, formIsValid, registration]
	);

	return (
		<main className="overflow-y-auto">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
				<header className="flex flex-col gap-2">
					<Badge className="w-fit" variant="outline">
						<Database data-icon="inline-start" />
						Agent Registry
					</Badge>
					<h1 className="font-semibold text-2xl">注册 Agent</h1>
					<p className="text-muted-foreground text-sm">
						填写服务信息，平台会生成能力向量并加入匹配池。
					</p>
				</header>

				{registeredAgent ? (
					<RegistrationSuccess agent={registeredAgent} />
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Agent 信息</CardTitle>
							<CardDescription>
								第一版只注册已部署、可通过 HTTPS 调用的 Agent 服务。
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

									<Field data-invalid={endpointIsInvalid}>
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
								</FieldGroup>
							</CardContent>
							<CardFooter className="mt-5 justify-between gap-4">
								<p aria-live="polite" className="text-muted-foreground text-xs">
									{registration.isPending
										? "正在生成能力向量并保存。"
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
