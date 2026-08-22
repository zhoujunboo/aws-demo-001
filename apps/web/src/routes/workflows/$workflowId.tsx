import { Badge } from "@aws-demo-001/ui/components/badge";
import { Button } from "@aws-demo-001/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@aws-demo-001/ui/components/card";
import { Skeleton } from "@aws-demo-001/ui/components/skeleton";
import { cn } from "@aws-demo-001/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	Bot,
	Check,
	CircleAlert,
	Clock3,
	Loader2,
	Play,
	ShieldCheck,
} from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import {
	type AgentWorkflow,
	type AgentWorkflowStep,
	executeWorkflow,
	getWorkflow,
} from "@/lib/agent-api";

export const Route = createFileRoute("/workflows/$workflowId")({
	component: WorkflowPage,
});

const terminalStatuses = new Set(["failed", "succeeded"]);

const statusLabels: Record<string, string> = {
	failed: "执行失败",
	pending: "等待执行",
	preview: "方案预览",
	queued: "排队中",
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
	if (status === "running") {
		return "secondary";
	}
	return "outline";
};

const getStepIcon = (status: string) => {
	if (status === "succeeded") {
		return Check;
	}
	if (status === "failed") {
		return CircleAlert;
	}
	if (status === "running") {
		return Loader2;
	}
	return Clock3;
};

function WorkflowStepCard({ step }: { step: AgentWorkflowStep }) {
	const StepIcon = getStepIcon(step.status);
	const isRunning = step.status === "running";

	return (
		<Card
			className={cn(
				"w-full min-w-0 md:flex-1",
				isRunning && "border-primary shadow-sm ring-2 ring-primary/20"
			)}
		>
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<span
						className={cn(
							"flex size-9 shrink-0 items-center justify-center bg-muted",
							isRunning && "bg-primary text-primary-foreground"
						)}
					>
						<StepIcon
							aria-hidden="true"
							className={cn("size-4", isRunning && "animate-spin")}
						/>
					</span>
					<Badge variant={getStatusVariant(step.status)}>
						{statusLabels[step.status] ?? step.status}
					</Badge>
				</div>
				<CardTitle className="mt-3 text-base">
					{step.stepOrder}. {step.title}
				</CardTitle>
				<CardDescription>{step.instruction}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<div className="flex items-center gap-2 text-sm">
					<Bot aria-hidden="true" className="size-4 text-muted-foreground" />
					<span className="font-medium">{step.agentName}</span>
				</div>
				<div className="grid grid-cols-2 gap-2 text-xs">
					<div className="border bg-muted/30 p-2">
						<span className="text-muted-foreground">匹配分</span>
						<strong className="mt-1 block text-sm">{step.matchScore}</strong>
					</div>
					<div className="border bg-muted/30 p-2">
						<span className="text-muted-foreground">综合公平分</span>
						<strong className="mt-1 block text-sm">{step.fairnessScore}</strong>
					</div>
				</div>
				{step.output ? (
					<div className="max-h-72 overflow-y-auto whitespace-pre-wrap border bg-muted/20 p-3 text-sm leading-6">
						{step.output}
					</div>
				) : null}
				{step.errorCode ? (
					<p className="text-destructive text-sm">{step.errorCode}</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function WorkflowPlan({ workflow }: { workflow: AgentWorkflow }) {
	return (
		<section aria-labelledby="workflow-steps-title">
			<h2 className="mb-4 font-medium text-lg" id="workflow-steps-title">
				执行步骤
			</h2>
			<div className="flex flex-col items-center gap-3 md:flex-row md:items-stretch">
				{workflow.steps.map((step, index) => (
					<div
						className="flex w-full flex-col items-center gap-3 md:min-w-0 md:flex-1 md:flex-row"
						key={step.id}
					>
						<WorkflowStepCard step={step} />
						{index < workflow.steps.length - 1 ? (
							<>
								<ArrowDown
									aria-hidden="true"
									className="size-5 shrink-0 text-muted-foreground md:hidden"
								/>
								<ArrowRight
									aria-hidden="true"
									className="hidden size-5 shrink-0 self-center text-muted-foreground md:block"
								/>
							</>
						) : null}
					</div>
				))}
			</div>
		</section>
	);
}

function WorkflowPage() {
	const { workflowId } = Route.useParams();
	const queryClient = useQueryClient();
	const workflowQuery = useQuery({
		queryFn: () => getWorkflow(workflowId),
		queryKey: ["agent-workflow", workflowId],
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			if (!status || status === "preview" || terminalStatuses.has(status)) {
				return false;
			}
			return 2000;
		},
	});

	const executeMutation = useMutation({
		mutationFn: () => executeWorkflow(workflowId),
		onError: (error) => toast.error(error.message),
		onSuccess: (queuedWorkflow) => {
			queryClient.setQueryData(["agent-workflow", workflowId], queuedWorkflow);
			toast.success("方案已进入执行队列");
		},
	});

	const handleExecute = useCallback(() => {
		executeMutation.mutate();
	}, [executeMutation]);

	if (workflowQuery.isPending) {
		return (
			<main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-10 md:px-6">
				<Skeleton className="h-40 w-full" />
				<Skeleton className="h-80 w-full" />
			</main>
		);
	}

	if (workflowQuery.isError || !workflowQuery.data) {
		return (
			<main className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-4 py-20 text-center">
				<CircleAlert className="size-8 text-destructive" />
				<h1 className="font-semibold text-2xl">无法加载执行方案</h1>
				<p className="text-muted-foreground">
					{workflowQuery.error?.message ?? "请稍后重试。"}
				</p>
				<Button nativeButton={false} render={<Link to="/" />} variant="outline">
					<ArrowLeft data-icon="inline-start" />
					返回工作台
				</Button>
			</main>
		);
	}

	const workflow = workflowQuery.data;
	const isExecuting =
		workflow.status === "queued" || workflow.status === "running";

	return (
		<main className="overflow-y-auto">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 md:px-6 md:py-12">
				<div>
					<Button
						nativeButton={false}
						render={<Link to="/" />}
						size="sm"
						variant="ghost"
					>
						<ArrowLeft data-icon="inline-start" />
						返回工作台
					</Button>
				</div>

				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div className="max-w-3xl">
								<CardTitle className="text-2xl">执行方案预览</CardTitle>
								<CardDescription className="mt-2 text-sm leading-6">
									{workflow.description}
								</CardDescription>
							</div>
							<Badge variant={getStatusVariant(workflow.status)}>
								{isExecuting ? (
									<Loader2 className="animate-spin" data-icon="inline-start" />
								) : null}
								{statusLabels[workflow.status] ?? workflow.status}
							</Badge>
						</div>
					</CardHeader>
					<CardContent className="flex flex-wrap items-end justify-between gap-5">
						<div className="flex flex-wrap gap-3">
							<div className="min-w-28 border bg-muted/30 p-3">
								<span className="text-muted-foreground text-xs">可靠度</span>
								<strong className="mt-1 flex items-center gap-1 text-lg">
									<ShieldCheck className="size-4" />
									{workflow.reliabilityScore}%
								</strong>
							</div>
							<div className="min-w-28 border bg-muted/30 p-3">
								<span className="text-muted-foreground text-xs">预估价格</span>
								<strong className="mt-1 block text-lg">
									{workflow.estimatedPriceCents > 0
										? `¥${(workflow.estimatedPriceCents / 100).toFixed(2)}`
										: "待报价"}
								</strong>
							</div>
						</div>
						<Button
							disabled={
								workflow.status !== "preview" || executeMutation.isPending
							}
							onClick={handleExecute}
						>
							{executeMutation.isPending ? (
								<Loader2 className="animate-spin" data-icon="inline-start" />
							) : (
								<Play data-icon="inline-start" />
							)}
							{workflow.status === "preview" ? "确认并执行" : "执行已提交"}
						</Button>
					</CardContent>
				</Card>

				<WorkflowPlan workflow={workflow} />
			</div>
		</main>
	);
}
