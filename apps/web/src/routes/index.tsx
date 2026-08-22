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
	FieldLabel,
} from "@aws-demo-001/ui/components/field";
import { Textarea } from "@aws-demo-001/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	ArrowRight,
	Bot,
	Loader2,
	RouteIcon,
	Send,
	ShieldCheck,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import { createWorkflowPreview } from "@/lib/agent-api";

export const Route = createFileRoute("/")({
	component: AgentMarketplacePage,
});

const MIN_DESCRIPTION_LENGTH = 10;

const platformCapabilities = [
	{
		description: "先把复杂需求变成最多三个可执行步骤。",
		icon: RouteIcon,
		title: "拆分需求",
	},
	{
		description: "通过向量检索、重排和公平分选择 Agent。",
		icon: Bot,
		title: "匹配 Agent",
	},
	{
		description: "确认方案后异步执行，失败可安全重试。",
		icon: ShieldCheck,
		title: "稳定执行",
	},
] as const;

function AgentMarketplacePage() {
	const navigate = useNavigate();
	const [description, setDescription] = useState("");
	const trimmedDescription = description.trim();
	const descriptionIsInvalid =
		trimmedDescription.length > 0 &&
		trimmedDescription.length < MIN_DESCRIPTION_LENGTH;

	const createPreview = useMutation({
		mutationFn: createWorkflowPreview,
		onError: (error) => toast.error(error.message),
		onSuccess: async (workflow) => {
			toast.success("执行方案已生成，请先确认再执行");
			await navigate({
				params: { workflowId: workflow.id },
				to: "/workflows/$workflowId",
			});
		},
	});

	const handleDescriptionChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			setDescription(event.target.value);
		},
		[]
	);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) {
				return;
			}
			createPreview.mutate({ description: trimmedDescription });
		},
		[createPreview, trimmedDescription]
	);

	return (
		<main className="overflow-y-auto">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 md:px-6 md:py-16">
				<header className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
					<Badge variant="outline">Agent 调度与编排平台</Badge>
					<h1 className="font-semibold text-3xl tracking-tight md:text-5xl">
						描述目标，先看方案，再决定是否执行
					</h1>
					<p className="max-w-2xl text-base text-muted-foreground leading-7">
						平台负责拆分任务、匹配合适的 Agent，并把执行顺序展示给你。
						第一版只生成一套最多三步的方案，保持简单可控。
					</p>
				</header>

				<Card className="mx-auto w-full max-w-3xl">
					<CardHeader>
						<CardTitle>发布一个需求</CardTitle>
						<CardDescription>
							此时只生成预览，不会调用 Agent，也不会产生执行费用。
						</CardDescription>
					</CardHeader>
					<form onSubmit={handleSubmit}>
						<CardContent>
							<Field data-invalid={descriptionIsInvalid}>
								<FieldLabel htmlFor="workflow-description">需求描述</FieldLabel>
								<Textarea
									aria-invalid={descriptionIsInvalid}
									disabled={createPreview.isPending}
									id="workflow-description"
									maxLength={8000}
									onChange={handleDescriptionChange}
									placeholder="例如：根据我的工作经历生成一份面向高级前端工程师岗位的中文简历，并检查表达和结构。"
									rows={7}
									value={description}
								/>
								<FieldDescription>
									写清目标、已有材料和最终希望得到的结果。
								</FieldDescription>
								{descriptionIsInvalid ? (
									<FieldError>需求描述至少需要 10 个字符。</FieldError>
								) : null}
							</Field>
						</CardContent>
						<CardFooter className="mt-4 justify-between gap-4">
							<p aria-live="polite" className="text-muted-foreground text-xs">
								{createPreview.isPending
									? "正在拆分需求并匹配 Agent…"
									: "生成预览后，你可以检查每一步再确认执行。"}
							</p>
							<Button
								disabled={
									createPreview.isPending ||
									trimmedDescription.length < MIN_DESCRIPTION_LENGTH
								}
								type="submit"
							>
								{createPreview.isPending ? (
									<Loader2 className="animate-spin" data-icon="inline-start" />
								) : (
									<Send data-icon="inline-start" />
								)}
								{createPreview.isPending ? "生成中" : "生成执行方案"}
							</Button>
						</CardFooter>
					</form>
				</Card>

				<section
					aria-label="平台工作流程"
					className="grid gap-3 md:grid-cols-3"
				>
					{platformCapabilities.map((capability, index) => {
						const Icon = capability.icon;
						return (
							<div
								className="relative border bg-card p-5"
								key={capability.title}
							>
								<div className="mb-4 flex items-center justify-between">
									<span className="flex size-9 items-center justify-center bg-muted">
										<Icon aria-hidden="true" className="size-4" />
									</span>
									<span className="text-muted-foreground text-xs">
										0{index + 1}
									</span>
								</div>
								<h2 className="font-medium">{capability.title}</h2>
								<p className="mt-2 text-muted-foreground text-sm leading-6">
									{capability.description}
								</p>
								{index < platformCapabilities.length - 1 ? (
									<ArrowRight
										aria-hidden="true"
										className="absolute top-1/2 -right-5 z-10 hidden size-4 text-muted-foreground md:block"
									/>
								) : null}
							</div>
						);
					})}
				</section>
			</div>
		</main>
	);
}
