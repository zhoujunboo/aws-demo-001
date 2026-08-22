import { Badge } from "@aws-demo-001/ui/components/badge";
import { Button } from "@aws-demo-001/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@aws-demo-001/ui/components/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@aws-demo-001/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@aws-demo-001/ui/components/field";
import { Skeleton } from "@aws-demo-001/ui/components/skeleton";
import { Textarea } from "@aws-demo-001/ui/components/textarea";
import { cn } from "@aws-demo-001/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Bot,
	Check,
	CircleAlert,
	Clock3,
	FileText,
	Loader2,
	RefreshCw,
	Send,
	Sparkles,
	Users,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import {
	type Agent,
	type AgentExecution,
	type AgentTask,
	createAgentTask,
	listAgents,
} from "@/lib/agent-api";

export const Route = createFileRoute("/")({
	component: AgentMarketplacePage,
});

const MIN_DESCRIPTION_LENGTH = 10;

const statusLabels: Record<string, string> = {
	active: "可用",
	completed_with_errors: "部分完成",
	failed: "失败",
	pending: "等待中",
	running: "执行中",
	succeeded: "已完成",
};

const getStatusVariant = (
	status: string
): "default" | "destructive" | "outline" | "secondary" => {
	if (status === "failed") {
		return "destructive";
	}
	if (status === "succeeded") {
		return "default";
	}
	if (status === "active") {
		return "secondary";
	}
	return "outline";
};

function AgentCard({ agent }: { agent: Agent }) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Bot aria-hidden="true" />
					{agent.name}
				</CardTitle>
				<CardDescription>{agent.description}</CardDescription>
				<CardAction>
					<Badge variant={getStatusVariant(agent.status)}>
						{statusLabels[agent.status] ?? agent.status}
					</Badge>
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-1.5">
				{agent.capabilities.slice(0, 4).map((capability) => (
					<Badge key={capability} variant="outline">
						{capability}
					</Badge>
				))}
			</CardContent>
		</Card>
	);
}

function AgentsPanel() {
	const agents = useQuery({
		queryFn: listAgents,
		queryKey: ["agents"],
		staleTime: 60_000,
	});
	const handleRetry = useCallback(() => {
		agents.refetch();
	}, [agents.refetch]);

	return (
		<section aria-labelledby="agents-title" className="flex flex-col gap-3">
			<div>
				<h2 className="font-medium text-sm" id="agents-title">
					平台 Agent
				</h2>
				<p className="text-muted-foreground text-xs">
					平台根据任务描述匹配，并同时调用最合适的三个 Agent。
				</p>
			</div>

			{agents.isPending ? (
				<div className="flex flex-col gap-3">
					{["agent-one", "agent-two", "agent-three"].map((key) => (
						<Card key={key} size="sm">
							<CardHeader>
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-full" />
							</CardHeader>
						</Card>
					))}
				</div>
			) : null}

			{agents.isError ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<CircleAlert />
						</EmptyMedia>
						<EmptyTitle>Agent 列表加载失败</EmptyTitle>
						<EmptyDescription>{agents.error.message}</EmptyDescription>
					</EmptyHeader>
					<Button onClick={handleRetry} size="sm" variant="outline">
						<RefreshCw data-icon="inline-start" />
						重新加载
					</Button>
				</Empty>
			) : null}

			{agents.data?.map((agent) => (
				<AgentCard agent={agent} key={agent.id} />
			))}
		</section>
	);
}

function TaskComposer({
	onTaskCreated,
}: {
	onTaskCreated: (task: AgentTask) => void;
}) {
	const [description, setDescription] = useState("");
	const [resume, setResume] = useState("");
	const trimmedDescription = description.trim();
	const descriptionIsInvalid =
		trimmedDescription.length > 0 &&
		trimmedDescription.length < MIN_DESCRIPTION_LENGTH;

	const createTask = useMutation({
		mutationFn: createAgentTask,
		onError: (error) => toast.error(error.message),
		onSuccess: (task) => {
			onTaskCreated(task);
			toast.success("三个 Agent 已完成任务");
		},
	});

	const handleDescriptionChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			setDescription(event.target.value);
		},
		[]
	);
	const handleResumeChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			setResume(event.target.value);
		},
		[]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) {
				return;
			}
			createTask.mutate({
				description: trimmedDescription,
				...(resume.trim() ? { resume: resume.trim() } : {}),
			});
		},
		[createTask, resume, trimmedDescription]
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<FileText aria-hidden="true" />
					发布简历任务
				</CardTitle>
				<CardDescription>
					告诉平台你要什么，平台会匹配并并行执行三个 Agent。
				</CardDescription>
			</CardHeader>
			<form onSubmit={handleSubmit}>
				<CardContent>
					<FieldGroup>
						<Field data-invalid={descriptionIsInvalid}>
							<FieldLabel htmlFor="task-description">任务描述</FieldLabel>
							<Textarea
								aria-invalid={descriptionIsInvalid}
								disabled={createTask.isPending}
								id="task-description"
								maxLength={8000}
								onChange={handleDescriptionChange}
								placeholder="例如：为一名有三年 React 和 TypeScript 经验的前端工程师生成专业简历，突出项目成果。"
								rows={5}
								value={description}
							/>
							<FieldDescription>
								描述岗位、经验和希望突出的能力，结果会更准确。
							</FieldDescription>
							{descriptionIsInvalid ? (
								<FieldError>任务描述至少需要 10 个字符。</FieldError>
							) : null}
						</Field>

						<Field>
							<FieldLabel htmlFor="existing-resume">
								已有简历（可选）
							</FieldLabel>
							<Textarea
								disabled={createTask.isPending}
								id="existing-resume"
								maxLength={30_000}
								onChange={handleResumeChange}
								placeholder="如果已经有简历，可以粘贴到这里，让 Agent 进行优化和润色。"
								rows={4}
								value={resume}
							/>
						</Field>
					</FieldGroup>
				</CardContent>
				<CardFooter className="mt-4 justify-between gap-4">
					<p aria-live="polite" className="text-muted-foreground text-xs">
						{createTask.isPending
							? "三个 Agent 正在并行生成，通常需要十几秒。"
							: "第一版同步执行，提交后直接返回三份结果。"}
					</p>
					<Button
						disabled={
							createTask.isPending ||
							trimmedDescription.length < MIN_DESCRIPTION_LENGTH
						}
						type="submit"
					>
						{createTask.isPending ? (
							<Loader2 className="animate-spin" data-icon="inline-start" />
						) : (
							<Send data-icon="inline-start" />
						)}
						{createTask.isPending ? "生成中" : "匹配并生成"}
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}

function ResultCard({
	execution,
	isSelected,
	onSelect,
}: {
	execution: AgentExecution;
	isSelected: boolean;
	onSelect: (executionId: string) => void;
}) {
	const succeeded = execution.status === "succeeded";
	const handleSelect = useCallback(() => {
		onSelect(execution.id);
	}, [execution.id, onSelect]);

	return (
		<Card
			className={cn(isSelected && "ring-2 ring-primary")}
			data-selected={isSelected}
		>
			<CardHeader>
				<CardTitle>{execution.agentName}</CardTitle>
				<CardDescription>
					匹配排名 #{execution.rank} · 匹配分 {execution.score}
				</CardDescription>
				<CardAction>
					<Badge variant={getStatusVariant(execution.status)}>
						{statusLabels[execution.status] ?? execution.status}
					</Badge>
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col gap-3">
				<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<Clock3 aria-hidden="true" />
					{execution.durationMs === null
						? "暂无耗时"
						: `${(execution.durationMs / 1000).toFixed(1)} 秒`}
				</div>
				{execution.output ? (
					<div className="max-h-96 overflow-y-auto whitespace-pre-wrap border bg-muted/30 p-4 text-sm leading-7">
						{execution.output}
					</div>
				) : (
					<Empty className="min-h-52 border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<CircleAlert />
							</EmptyMedia>
							<EmptyTitle>没有生成结果</EmptyTitle>
							<EmptyDescription>
								{execution.errorCode ?? "Agent 执行失败"}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</CardContent>
			<CardFooter className="mt-4 justify-between gap-3">
				<span className="text-muted-foreground text-xs">
					{isSelected ? "当前选择" : "不满意可以不选"}
				</span>
				<Button
					disabled={!succeeded}
					onClick={handleSelect}
					size="sm"
					variant={isSelected ? "default" : "outline"}
				>
					<Check data-icon="inline-start" />
					{isSelected ? "已选择" : "选择此结果"}
				</Button>
			</CardFooter>
		</Card>
	);
}

function ResultsSection({ task }: { task: AgentTask | null }) {
	const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(
		null
	);

	const handleSelect = useCallback((executionId: string) => {
		setSelectedExecutionId(executionId);
		toast.success("已选择这份结果（当前为演示状态）");
	}, []);
	const handleClearSelection = useCallback(() => {
		setSelectedExecutionId(null);
	}, []);

	return (
		<section aria-labelledby="results-title" className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="font-medium text-lg" id="results-title">
						结果对比
					</h2>
					<p className="text-muted-foreground text-sm">
						三份结果独立保存，可以选择一份，也可以全部不选。
					</p>
				</div>
				{task ? (
					<div className="flex items-center gap-2">
						<Badge variant={getStatusVariant(task.status)}>
							任务{statusLabels[task.status] ?? task.status}
						</Badge>
						{selectedExecutionId ? (
							<Button onClick={handleClearSelection} size="sm" variant="ghost">
								暂不选择
							</Button>
						) : null}
					</div>
				) : null}
			</div>

			{task ? (
				<div className="grid gap-4 lg:grid-cols-3">
					{task.executions.map((execution) => (
						<ResultCard
							execution={execution}
							isSelected={selectedExecutionId === execution.id}
							key={execution.id}
							onSelect={handleSelect}
						/>
					))}
				</div>
			) : (
				<Empty className="min-h-72 border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Sparkles />
						</EmptyMedia>
						<EmptyTitle>还没有生成结果</EmptyTitle>
						<EmptyDescription>
							填写上方任务，平台会把三个 Agent 的结果放到这里对比。
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
}

function AgentMarketplacePage() {
	const [task, setTask] = useState<AgentTask | null>(null);

	return (
		<main className="overflow-y-auto">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 md:px-6 md:py-12">
				<header className="flex max-w-3xl flex-col gap-3">
					<Badge className="w-fit" variant="outline">
						<Users data-icon="inline-start" />
						Agent Marketplace MVP
					</Badge>
					<h1 className="font-semibold text-3xl tracking-tight md:text-4xl">
						一个需求，比较三个 Agent 的结果
					</h1>
					<p className="text-base text-muted-foreground leading-7">
						平台负责匹配、调用和保存结果。你只需要描述目标，然后选择最满意的一份。
					</p>
				</header>

				<div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
					<TaskComposer onTaskCreated={setTask} />
					<AgentsPanel />
				</div>

				<ResultsSection key={task?.id ?? "empty"} task={task} />
			</div>
		</main>
	);
}
