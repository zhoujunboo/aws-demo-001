import type { AppRouter } from "@aws-demo-001/api/routers/index";
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
import { Label } from "@aws-demo-001/ui/components/label";
import { Skeleton } from "@aws-demo-001/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import {
	AlertCircle,
	Calendar,
	Code2,
	ExternalLink,
	Loader2,
	MapPin,
	Plus,
	RefreshCw,
	Sparkles,
	Trash2,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

const profilesQueryKey = trpc.githubProfiles.list.queryKey();
type GithubProfile =
	inferRouterOutputs<AppRouter>["githubProfiles"]["list"][number];

function formatJoinDate(dateString: string | Date) {
	try {
		const date = new Date(dateString);
		return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月加入 GitHub`;
	} catch {
		return "已加入 GitHub";
	}
}

function ProfileSkeleton() {
	return (
		<Card className="overflow-hidden">
			<CardContent className="flex items-center gap-4 p-5">
				<Skeleton className="size-12 shrink-0 rounded-full" />
				<div className="grid flex-1 gap-2">
					<Skeleton className="h-4 w-36" />
					<Skeleton className="h-3 w-52 max-w-full" />
				</div>
			</CardContent>
		</Card>
	);
}

interface ProfileCardProps {
	deleteProfile: (id: string) => void;
	isDeleting: boolean;
	profile: GithubProfile;
}

function ProfileCard({ deleteProfile, isDeleting, profile }: ProfileCardProps) {
	const handleDelete = useCallback(
		() => deleteProfile(profile.id),
		[deleteProfile, profile.id]
	);

	return (
		<Card className="flex flex-col justify-between transition-shadow hover:shadow-md">
			<CardHeader className="pb-3">
				<div className="flex min-w-0 items-center gap-3">
					<img
						alt={`${profile.name || profile.login} 的头像`}
						className="size-12 shrink-0 rounded-full border object-cover shadow-xs"
						height={48}
						src={profile.avatarUrl}
						width={48}
					/>
					<div className="min-w-0">
						<CardTitle className="truncate text-base">
							{profile.name || profile.login}
						</CardTitle>
						<CardDescription className="truncate text-xs">
							@{profile.login}
						</CardDescription>
					</div>
				</div>
				<CardAction className="flex gap-1">
					<Button
						aria-label={`在 GitHub 上查看 ${profile.login} 的主页`}
						render={
							<a
								href={profile.profileUrl}
								rel="noopener noreferrer"
								target="_blank"
							/>
						}
						size="icon-sm"
						title="在 GitHub 打开个人主页"
						variant="ghost"
					>
						<ExternalLink className="size-4" />
					</Button>
					<Button
						aria-label={`删除 ${profile.login} 的名片`}
						disabled={isDeleting}
						onClick={handleDelete}
						size="icon-sm"
						title="删除此名片"
						variant="destructive"
					>
						<Trash2 className="size-4" />
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-3.5 pt-0">
				{profile.bio ? (
					<p className="line-clamp-2 min-h-10 text-muted-foreground text-sm leading-relaxed">
						{profile.bio}
					</p>
				) : (
					<p className="line-clamp-2 min-h-10 text-muted-foreground/60 text-xs italic">
						暂未填写个人简介
					</p>
				)}
				<dl className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 py-2.5 text-center">
					<div>
						<dt className="text-muted-foreground text-xs">公开仓库</dt>
						<dd className="mt-0.5 font-semibold text-sm">
							{profile.publicRepos}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">关注者</dt>
						<dd className="mt-0.5 font-semibold text-sm">
							{profile.followers}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">正在关注</dt>
						<dd className="mt-0.5 font-semibold text-sm">
							{profile.following}
						</dd>
					</div>
				</dl>
				<div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-muted-foreground text-xs">
					<div className="flex items-center gap-1.5 truncate">
						<MapPin className="size-3.5 shrink-0" />
						<span className="truncate">{profile.location || "未设置位置"}</span>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<Calendar className="size-3.5 shrink-0" />
						<span>{formatJoinDate(profile.githubCreatedAt)}</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

const getServiceStatus = (isError: boolean, isLoading: boolean) => {
	if (isError) {
		return { className: "bg-destructive", label: "服务连接异常" };
	}
	if (isLoading) {
		return {
			className: "animate-pulse bg-amber-500",
			label: "数据加载中...",
		};
	}
	return { className: "bg-emerald-500", label: "服务正常运行" };
};

function HomeComponent() {
	const [generatedIntroduction, setGeneratedIntroduction] = useState("");
	const [username, setUsername] = useState("");
	const profiles = useQuery(trpc.githubProfiles.list.queryOptions());
	const generateProfile = useMutation(
		trpc.githubProfiles.generateFromUsername.mutationOptions({
			onSuccess: async (result) => {
				setUsername("");
				setGeneratedIntroduction(result.introduction);
				await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
				toast.success(`已生成 @${result.profile.login} 的个人介绍`);
			},
		})
	);
	const deleteProfile = useMutation(
		trpc.githubProfiles.delete.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
				toast.success("名片已删除");
			},
		})
	);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const normalizedUsername = username.trim();
			if (!normalizedUsername) {
				toast.error("请输入有效的 GitHub 用户名");
				return;
			}
			generateProfile.mutate({ username: normalizedUsername });
		},
		[generateProfile, username]
	);
	const handleUsernameChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			setUsername(event.target.value);
		},
		[]
	);
	const handleRefresh = useCallback(() => {
		profiles.refetch();
	}, [profiles]);
	const handleDelete = useCallback(
		(id: string) => {
			deleteProfile.mutate({ id });
		},
		[deleteProfile]
	);
	const serviceStatus = getServiceStatus(profiles.isError, profiles.isLoading);

	return (
		<main className="min-h-full overflow-y-auto bg-muted/30 pb-12">
			<div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:px-6">
				<header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
					<div className="grid gap-1">
						<div className="flex items-center gap-2">
							<span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
								开发者名片簿
							</span>
						</div>
						<h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
							GitHub 开发者名片夹
						</h1>
						<p className="text-muted-foreground text-sm">
							一键同步 GitHub 用户个人资料与公开统计数据，沉淀云端开发者名片。
						</p>
					</div>
					<div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-muted-foreground text-xs shadow-xs">
						<span
							className={`size-2 rounded-full ${serviceStatus.className}`}
						/>
						{serviceStatus.label}
					</div>
				</header>

				<section aria-labelledby="add-profile-heading">
					<Card className="shadow-xs">
						<CardHeader className="border-b bg-muted/10 pb-4">
							<CardTitle className="text-lg" id="add-profile-heading">
								用 GitHub 用户名生成个人介绍
							</CardTitle>
							<CardDescription>
								输入公开用户名，Go 服务会读取 GitHub
								资料、生成中文介绍，并保存至 Aurora PostgreSQL。
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-4 pt-4">
							<div className="flex items-center gap-2 rounded-md bg-muted/50 px-3.5 py-2.5 text-muted-foreground text-xs">
								<Sparkles className="size-4 shrink-0 text-amber-500" />
								<span>
									无需 Token。用户名只用于读取 GitHub
									公开资料，不会访问私有仓库。
								</span>
							</div>

							<form
								className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
								onSubmit={handleSubmit}
							>
								<div className="grid gap-2">
									<Label htmlFor="github-username">GitHub 用户名</Label>
									<Input
										autoComplete="username"
										id="github-username"
										name="github-username"
										onChange={handleUsernameChange}
										placeholder="例如：junbozhou88"
										value={username}
									/>
								</div>
								<Button
									className="gap-1.5"
									disabled={generateProfile.isPending || !username.trim()}
									type="submit"
								>
									{generateProfile.isPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Plus className="size-4" />
									)}
									{generateProfile.isPending
										? "正在生成介绍..."
										: "生成个人介绍"}
								</Button>
							</form>

							{generateProfile.error ? (
								<div
									className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive text-xs"
									role="alert"
								>
									<AlertCircle className="size-4 shrink-0" />
									<span>
										{generateProfile.error.message ||
											"生成介绍失败，请检查用户名或稍后重试。"}
									</span>
								</div>
							) : null}

							{generatedIntroduction ? (
								<div
									aria-live="polite"
									className="grid gap-2 border-primary border-l-2 bg-muted/30 px-4 py-3"
								>
									<div className="flex items-center gap-2 font-medium text-sm">
										<Sparkles className="size-4 text-primary" />
										生成的个人介绍
									</div>
									<p className="text-muted-foreground text-sm leading-relaxed">
										{generatedIntroduction}
									</p>
								</div>
							) : null}
						</CardContent>
					</Card>
				</section>

				<section
					aria-labelledby="saved-profiles-heading"
					className="grid gap-4"
				>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2.5">
							<h2 className="font-semibold text-lg" id="saved-profiles-heading">
								已保存的名片
							</h2>
							<span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground text-xs">
								共 {profiles.data?.length ?? 0} 张
							</span>
						</div>
						<Button
							aria-label="刷新名片列表"
							disabled={profiles.isFetching}
							onClick={handleRefresh}
							size="icon"
							title="刷新名片列表"
							variant="outline"
						>
							<RefreshCw
								className={`size-4 ${profiles.isFetching ? "animate-spin" : ""}`}
							/>
						</Button>
					</div>

					{profiles.isLoading ? (
						<div className="grid gap-4 md:grid-cols-2">
							<ProfileSkeleton />
							<ProfileSkeleton />
						</div>
					) : null}

					{profiles.isError ? (
						<Card>
							<CardContent className="flex items-center justify-between gap-4 p-6">
								<div className="flex items-center gap-2 text-destructive text-sm">
									<AlertCircle className="size-4 shrink-0" />
									<span>{profiles.error.message}</span>
								</div>
								<Button onClick={handleRefresh} size="sm" variant="outline">
									重新加载
								</Button>
							</CardContent>
						</Card>
					) : null}

					{profiles.data?.length === 0 ? (
						<Empty className="border border-dashed py-12">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Code2 className="size-8" />
								</EmptyMedia>
								<EmptyTitle>暂无已保存的开发者名片</EmptyTitle>
								<EmptyDescription>
									在上方输入 GitHub
									用户名并生成个人介绍，同步的数据将收录在此处。
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}

					<div className="grid gap-4 md:grid-cols-2">
						{profiles.data?.map((profile) => (
							<ProfileCard
								deleteProfile={handleDelete}
								isDeleting={deleteProfile.isPending}
								key={profile.id}
								profile={profile}
							/>
						))}
					</div>
				</section>
			</div>
		</main>
	);
}
