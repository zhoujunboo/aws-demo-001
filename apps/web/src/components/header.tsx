import { Button } from "@aws-demo-001/ui/components/button";
import { Link } from "@tanstack/react-router";
import { Bot, Database, Plus } from "lucide-react";
import { ModeToggle } from "./mode-toggle";

export default function Header() {
	return (
		<header className="flex h-12 items-center justify-between gap-2 border-b px-3 md:px-6">
			<div className="flex min-w-0 items-center gap-2 md:gap-4">
				<Link
					className="flex shrink-0 items-center gap-2 font-semibold text-sm"
					to="/"
				>
					<span className="size-2 bg-primary" />
					<span className="hidden sm:inline">Agent Marketplace</span>
				</Link>
				<nav aria-label="主导航" className="flex items-center gap-1">
					<Button
						aria-label="任务工作台"
						nativeButton={false}
						render={<Link to="/" />}
						size="sm"
						variant="ghost"
					>
						<Bot data-icon="inline-start" />
						<span className="hidden sm:inline">任务工作台</span>
					</Button>
					<Button
						aria-label="Agent 列表"
						nativeButton={false}
						render={<Link to="/agents" />}
						size="sm"
						variant="ghost"
					>
						<Database data-icon="inline-start" />
						<span className="hidden sm:inline">Agent 列表</span>
					</Button>
					<Button
						aria-label="注册 Agent"
						nativeButton={false}
						render={<Link to="/agents/register" />}
						size="sm"
						variant="ghost"
					>
						<Plus data-icon="inline-start" />
						<span className="hidden sm:inline">注册 Agent</span>
					</Button>
				</nav>
			</div>
			<ModeToggle />
		</header>
	);
}
