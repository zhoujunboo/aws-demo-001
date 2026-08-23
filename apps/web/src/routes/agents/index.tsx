import { Badge } from "@aws-demo-001/ui/components/badge";
import { Button } from "@aws-demo-001/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
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
import { Input } from "@aws-demo-001/ui/components/input";
import { Skeleton } from "@aws-demo-001/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Bot,
	CircleAlert,
	Database,
	Plus,
	RefreshCw,
	Search,
} from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { type Agent, listAgents } from "@/lib/agent-api";

export const Route = createFileRoute("/agents/")({
	component: AgentsPage,
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
	dateStyle: "medium",
	timeStyle: "short",
});

const formatDate = (value: string): string =>
	dateTimeFormatter.format(new Date(value));

const classificationLabels: Record<Agent["classification"], string> = {
	automation: "流程自动化",
	content: "内容创作",
	data: "数据处理",
	development: "开发工具",
	general: "通用助手",
	research: "研究分析",
};

function AgentItem({ agent }: { agent: Agent }) {
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Bot aria-hidden="true" />
					{agent.name}
				</CardTitle>
				<CardDescription>{agent.id}</CardDescription>
				<CardAction className="flex items-center gap-1.5">
					<Badge variant="outline">{agent.isFree ? "免费" : "合约结算"}</Badge>
					<Badge variant={agent.vectorIndexed ? "default" : "destructive"}>
						{agent.vectorIndexed ? "向量已入库" : "等待向量"}
					</Badge>
					<Badge className="hidden sm:inline-flex" variant="secondary">
						{agent.status === "active" ? "可用" : agent.status}
					</Badge>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
				<div>
					<p className="text-sm leading-6">{agent.description}</p>
					<div className="mt-3 flex flex-wrap gap-1.5">
						<Badge variant="secondary">
							{classificationLabels[agent.classification]}
						</Badge>
						{agent.capabilities.map((capability) => (
							<Badge key={capability} variant="outline">
								{capability}
							</Badge>
						))}
					</div>
				</div>
				<dl className="grid content-start gap-2 border-t pt-4 text-xs md:border-t-0 md:border-l md:pt-0 md:pl-4">
					<div>
						<dt className="text-muted-foreground">任务接入</dt>
						<dd className="mt-0.5 font-medium">
							{agent.autoAcceptJobs ? "自动接单" : "仅手动选择"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">输出</dt>
						<dd className="mt-0.5 font-medium">
							{agent.outputTypes.join(" / ")}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Embedding 模型</dt>
						<dd className="mt-0.5 break-words font-medium">
							{agent.embeddingModel ?? "尚未生成"}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">更新时间</dt>
						<dd className="mt-0.5 font-medium">
							{formatDate(agent.updatedAt)}
						</dd>
					</div>
				</dl>
			</CardContent>
		</Card>
	);
}

function AgentListSkeleton() {
	return (
		<div className="grid gap-3">
			{["agent-one", "agent-two", "agent-three"].map((key) => (
				<Card key={key} size="sm">
					<CardHeader>
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-3 w-28" />
					</CardHeader>
					<CardContent>
						<Skeleton className="h-14 w-full" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function AgentsPage() {
	const [searchText, setSearchText] = useState("");
	const agents = useQuery({
		queryFn: listAgents,
		queryKey: ["agents"],
		staleTime: 60_000,
	});
	const filteredAgents = useMemo(() => {
		const query = searchText.trim().toLowerCase();
		if (!query) {
			return agents.data ?? [];
		}
		return (agents.data ?? []).filter((agent) =>
			[agent.id, agent.name, agent.description, ...agent.capabilities]
				.join(" ")
				.toLowerCase()
				.includes(query)
		);
	}, [agents.data, searchText]);
	const indexedCount = (agents.data ?? []).filter(
		(agent) => agent.vectorIndexed
	).length;
	const handleSearchChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
		[]
	);
	const handleRetry = useCallback(() => {
		agents.refetch();
	}, [agents.refetch]);

	return (
		<main className="overflow-y-auto">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12">
				<header className="flex flex-wrap items-end justify-between gap-4">
					<div className="flex flex-col gap-2">
						<Badge className="w-fit" variant="outline">
							<Database data-icon="inline-start" />
							Agent Registry
						</Badge>
						<h1 className="font-semibold text-2xl">Agent 列表</h1>
						<p className="text-muted-foreground text-sm">
							管理平台可匹配的 Agent 及其能力向量状态。
						</p>
					</div>
					<Button nativeButton={false} render={<Link to="/agents/register" />}>
						<Plus data-icon="inline-start" />
						注册 Agent
					</Button>
				</header>

				<div className="grid border md:grid-cols-3">
					<div className="p-4">
						<p className="text-muted-foreground text-xs">可用 Agent</p>
						<p className="mt-1 font-semibold text-xl">
							{agents.data?.length ?? "-"}
						</p>
					</div>
					<div className="border-t p-4 md:border-t-0 md:border-l">
						<p className="text-muted-foreground text-xs">向量已入库</p>
						<p className="mt-1 font-semibold text-xl">
							{agents.data ? indexedCount : "-"}
						</p>
					</div>
					<div className="border-t p-4 md:border-t-0 md:border-l">
						<p className="text-muted-foreground text-xs">匹配策略</p>
						<p className="mt-1 font-medium text-sm">向量召回 + Rerank</p>
					</div>
				</div>

				<div className="relative max-w-md">
					<Search
						aria-hidden="true"
						className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						aria-label="搜索 Agent"
						className="pl-8"
						onChange={handleSearchChange}
						placeholder="搜索名称、ID 或能力标签"
						value={searchText}
					/>
				</div>

				{agents.isPending ? <AgentListSkeleton /> : null}

				{agents.isError ? (
					<Empty className="min-h-64 border">
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

				{!(agents.isPending || agents.isError) &&
				filteredAgents.length === 0 ? (
					<Empty className="min-h-64 border">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<Bot />
							</EmptyMedia>
							<EmptyTitle>
								{searchText ? "没有匹配的 Agent" : "还没有 Agent"}
							</EmptyTitle>
							<EmptyDescription>
								{searchText
									? "换一个关键词试试。"
									: "注册第一个 Agent 后会显示在这里。"}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : null}

				{filteredAgents.length > 0 ? (
					<section aria-label="Agent 数据" className="grid gap-3">
						{filteredAgents.map((agent) => (
							<AgentItem agent={agent} key={agent.id} />
						))}
					</section>
				) : null}
			</div>
		</main>
	);
}
