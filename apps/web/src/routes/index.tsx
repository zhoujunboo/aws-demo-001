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
import {
	type ChangeEvent,
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { queryClient, trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

const profilesQueryKey = trpc.githubProfiles.list.queryKey();
type GithubProfile =
	inferRouterOutputs<AppRouter>["githubProfiles"]["list"][number];

interface Particle {
	baseAlpha: number;
	radius: number;
	vx: number;
	vy: number;
	x: number;
	y: number;
}

function createParticles(
	count: number,
	width: number,
	height: number
): Particle[] {
	const particles: Particle[] = [];
	for (let i = 0; i < count; i += 1) {
		particles.push({
			baseAlpha: Math.random() * 0.4 + 0.2,
			radius: Math.random() * 1.5 + 0.8,
			vx: (Math.random() - 0.5) * 0.4,
			vy: (Math.random() - 0.5) * 0.4,
			x: Math.random() * width,
			y: Math.random() * height,
		});
	}
	return particles;
}

function updateParticle(
	p: Particle,
	width: number,
	height: number,
	mouseX: number,
	mouseY: number
) {
	p.x += p.vx;
	p.y += p.vy;

	if (p.x < 0) {
		p.x = width;
	}
	if (p.x > width) {
		p.x = 0;
	}
	if (p.y < 0) {
		p.y = height;
	}
	if (p.y > height) {
		p.y = 0;
	}

	const dx = mouseX - p.x;
	const dy = mouseY - p.y;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 120 && dist > 0) {
		p.x -= (dx / dist) * 0.6;
		p.y -= (dy / dist) * 0.6;
	}
}

function drawConnections(
	ctx: CanvasRenderingContext2D,
	particles: Particle[],
	lineColor: string
) {
	const count = particles.length;
	for (let i = 0; i < count; i += 1) {
		const p1 = particles[i];
		for (let j = i + 1; j < count; j += 1) {
			const p2 = particles[j];
			const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
			if (d < 110) {
				const alpha = (1 - d / 110) * 0.18;
				ctx.beginPath();
				ctx.moveTo(p1.x, p1.y);
				ctx.lineTo(p2.x, p2.y);
				ctx.strokeStyle = `${lineColor}${alpha})`;
				ctx.lineWidth = 0.75;
				ctx.stroke();
			}
		}
	}
}

function BackgroundEffects() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		let animationFrameId: number;
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		let { height, width } = canvas;

		const handleResize = () => {
			if (!canvas) {
				return;
			}
			canvas.width = window.innerWidth;
			canvas.height = window.innerHeight;
			({ height, width } = canvas);
		};

		window.addEventListener("resize", handleResize);

		const particleCount = Math.min(Math.floor((width * height) / 22_000), 45);
		const particles = createParticles(particleCount, width, height);

		let mouseX = -1000;
		let mouseY = -1000;
		const handleMouseMove = (e: MouseEvent) => {
			mouseX = e.clientX;
			mouseY = e.clientY;
		};
		const handleMouseLeave = () => {
			mouseX = -1000;
			mouseY = -1000;
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseleave", handleMouseLeave);

		const render = () => {
			ctx.clearRect(0, 0, width, height);

			const isDark = document.documentElement.classList.contains("dark");
			const particleColor = isDark
				? "rgba(56, 189, 248, "
				: "rgba(99, 102, 241, ";
			const lineColor = isDark ? "rgba(99, 102, 241, " : "rgba(168, 85, 247, ";

			for (const p of particles) {
				updateParticle(p, width, height, mouseX, mouseY);
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
				ctx.fillStyle = `${particleColor}${p.baseAlpha})`;
				ctx.fill();
			}

			drawConnections(ctx, particles, lineColor);

			animationFrameId = requestAnimationFrame(render);
		};

		render();

		return () => {
			cancelAnimationFrame(animationFrameId);
			window.removeEventListener("resize", handleResize);
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseleave", handleMouseLeave);
		};
	}, []);

	return (
		<div className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden">
			<style>
				{`
					@keyframes float-orb-1 {
						0%, 100% { transform: translate(0px, 0px) scale(1); }
						50% { transform: translate(20px, -25px) scale(1.08); }
					}
					@keyframes float-orb-2 {
						0%, 100% { transform: translate(0px, 0px) scale(1.05); }
						50% { transform: translate(-25px, 20px) scale(0.95); }
					}
					@keyframes float-orb-3 {
						0%, 100% { opacity: 0.35; transform: scale(1); }
						50% { opacity: 0.7; transform: scale(1.1); }
					}
					.bg-grid-cyber {
						background-size: 36px 36px;
						background-image: linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
															linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
					}
					:root:not(.dark) .bg-grid-cyber {
						background-image: linear-gradient(to right, rgba(0, 0, 0, 0.04) 1px, transparent 1px),
															linear-gradient(to bottom, rgba(0, 0, 0, 0.04) 1px, transparent 1px);
					}
				`}
			</style>

			{/* Ambient Glowing Orbs */}
			<div
				className="absolute -top-[15%] left-[10%] size-[520px] rounded-full bg-linear-to-tr from-cyan-500/20 via-indigo-500/15 to-transparent blur-3xl dark:from-cyan-500/12 dark:via-indigo-500/12"
				style={{ animation: "float-orb-1 14s ease-in-out infinite" }}
			/>
			<div
				className="absolute top-[30%] -right-[10%] size-[620px] rounded-full bg-linear-to-bl from-purple-500/20 via-pink-500/15 to-transparent blur-3xl dark:from-purple-500/12 dark:via-pink-500/12"
				style={{ animation: "float-orb-2 18s ease-in-out infinite" }}
			/>
			<div
				className="absolute -bottom-[10%] left-[25%] size-[560px] rounded-full bg-linear-to-t from-emerald-500/15 via-teal-500/10 to-transparent blur-3xl dark:from-emerald-500/10 dark:via-teal-500/10"
				style={{ animation: "float-orb-3 10s ease-in-out infinite" }}
			/>

			{/* Cyber Subtle Grid Pattern */}
			<div className="absolute inset-0 bg-grid-cyber opacity-40 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_40%,#000_60%,transparent_100%)] dark:opacity-25" />

			{/* Interactive Constellation Canvas */}
			<canvas
				className="absolute inset-0 block size-full opacity-80"
				ref={canvasRef}
			/>
		</div>
	);
}

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
		<Card className="relative overflow-hidden border-border/50 bg-card/60 shadow-sm backdrop-blur-md">
			<div className="h-1 w-full bg-linear-to-r from-muted via-muted/60 to-muted" />
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
	const introductionQueryKey = trpc.profileIntroductions.get.queryKey({
		profileId: profile.id,
	});
	const introduction = useQuery(
		trpc.profileIntroductions.get.queryOptions({ profileId: profile.id })
	);
	const generateIntroduction = useMutation(
		trpc.profileIntroductions.generate.mutationOptions({
			onSuccess: (result) => {
				queryClient.setQueryData(introductionQueryKey, result);
				toast.success(`已生成 @${profile.login} 的个人简介`);
			},
		})
	);
	const handleDelete = useCallback(
		() => deleteProfile(profile.id),
		[deleteProfile, profile.id]
	);
	const handleGenerateIntroduction = useCallback(() => {
		generateIntroduction.mutate({ profileId: profile.id });
	}, [generateIntroduction, profile.id]);

	return (
		<Card className="group relative flex flex-col justify-between overflow-hidden border-border/60 bg-card/75 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-indigo-500/10 hover:shadow-lg">
			{/* Top ambient color accent line */}
			<div className="h-1 w-full bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-70 transition-opacity duration-300 group-hover:opacity-100" />

			<CardHeader className="pt-4 pb-3">
				<div className="flex min-w-0 items-center gap-3">
					<div className="relative shrink-0">
						<img
							alt={`${profile.name || profile.login} 的头像`}
							className="size-12 rounded-full border border-border/60 object-cover shadow-xs ring-2 ring-background transition-transform duration-300 group-hover:scale-105"
							height={48}
							src={profile.avatarUrl}
							width={48}
						/>
						<span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-background bg-emerald-500" />
					</div>
					<div className="min-w-0 flex-1">
						<CardTitle className="truncate font-semibold text-base tracking-tight">
							{profile.name || profile.login}
						</CardTitle>
						<CardDescription className="truncate font-mono text-xs">
							@{profile.login}
						</CardDescription>
					</div>
				</div>
				<CardAction className="flex gap-1">
					<Button
						aria-label={`在 GitHub 上查看 ${profile.login} 的主页`}
						className="transition-colors hover:bg-muted"
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
						<ExternalLink className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
					</Button>
					<Button
						aria-label={`删除 ${profile.login} 的名片`}
						className="opacity-70 transition-all hover:opacity-100"
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

				<dl className="grid grid-cols-3 gap-2 rounded-xl border border-border/50 bg-muted/30 py-2.5 text-center backdrop-blur-xs transition-colors group-hover:border-border/80">
					<div>
						<dt className="text-muted-foreground text-xs">公开仓库</dt>
						<dd className="mt-0.5 font-bold font-mono text-foreground text-sm">
							{profile.publicRepos}
						</dd>
					</div>
					<div className="border-border/40 border-x">
						<dt className="text-muted-foreground text-xs">关注者</dt>
						<dd className="mt-0.5 font-bold font-mono text-foreground text-sm">
							{profile.followers}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">正在关注</dt>
						<dd className="mt-0.5 font-bold font-mono text-foreground text-sm">
							{profile.following}
						</dd>
					</div>
				</dl>

				<div className="flex flex-wrap items-center justify-between gap-2 border-border/40 border-t pt-2.5 text-muted-foreground text-xs">
					<div className="flex items-center gap-1.5 truncate">
						<MapPin className="size-3.5 shrink-0 text-muted-foreground/70" />
						<span className="truncate">{profile.location || "未设置位置"}</span>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						<Calendar className="size-3.5 shrink-0 text-muted-foreground/70" />
						<span>{formatJoinDate(profile.githubCreatedAt)}</span>
					</div>
				</div>

				{introduction.data ? (
					<div
						aria-live="polite"
						className="relative grid gap-1.5 overflow-hidden rounded-lg border border-purple-500/25 bg-linear-to-br from-purple-500/10 via-indigo-500/5 to-transparent p-3 shadow-xs"
					>
						<div className="flex items-center gap-1.5 font-medium text-purple-600 text-xs dark:text-purple-300">
							<Sparkles className="size-3.5 text-purple-500" />
							<span>个人简介</span>
						</div>
						<p className="text-foreground/90 text-sm leading-relaxed">
							{introduction.data.content}
						</p>
					</div>
				) : null}

				{generateIntroduction.error ? (
					<div
						className="flex items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-destructive text-xs"
						role="alert"
					>
						<AlertCircle className="size-4 shrink-0" />
						<span>{generateIntroduction.error.message}</span>
					</div>
				) : null}

				<Button
					className="w-full gap-1.5 transition-all duration-200 hover:border-purple-500/50 hover:bg-purple-500/5 dark:hover:bg-purple-500/10"
					disabled={generateIntroduction.isPending || introduction.isPending}
					onClick={handleGenerateIntroduction}
					variant="outline"
				>
					{generateIntroduction.isPending ? (
						<Loader2 className="size-4 animate-spin text-purple-500" />
					) : (
						<Sparkles className="size-4 text-purple-500" />
					)}
					{generateIntroduction.isPending ? "正在生成简介..." : "生成简介"}
				</Button>
			</CardContent>
		</Card>
	);
}

const getServiceStatus = (isError: boolean, isLoading: boolean) => {
	if (isError) {
		return {
			className: "bg-destructive",
			label: "服务连接异常",
			pingClass: "bg-destructive/70",
		};
	}
	if (isLoading) {
		return {
			className: "bg-amber-500",
			label: "数据加载中...",
			pingClass: "bg-amber-400",
		};
	}
	return {
		className: "bg-emerald-500",
		label: "服务正常运行",
		pingClass: "bg-emerald-400",
	};
};

function HomeComponent() {
	const [username, setUsername] = useState("");
	const profiles = useQuery(trpc.githubProfiles.list.queryOptions());
	const createProfile = useMutation(
		trpc.githubProfiles.createFromUsername.mutationOptions({
			onSuccess: async (profile) => {
				setUsername("");
				await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
				toast.success(`已生成 @${profile.login} 的名片`);
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
			createProfile.mutate({ username: normalizedUsername });
		},
		[createProfile, username]
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
		<main className="relative min-h-full overflow-y-auto pb-16">
			{/* Dynamic Background Animation Layer */}
			<BackgroundEffects />

			{/* Main Content Area */}
			<div className="relative z-10 mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:px-6">
				<header className="flex flex-wrap items-end justify-between gap-4 border-border/40 border-b pb-5">
					<div className="grid gap-1">
						<div className="flex items-center gap-2">
							<span className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
								开发者名片簿
							</span>
						</div>
						<h1 className="bg-linear-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text font-bold text-2xl text-transparent tracking-tight sm:text-3xl">
							GitHub 开发者名片夹
						</h1>
						<p className="text-muted-foreground text-sm">
							一键同步 GitHub 用户个人资料与公开统计数据，沉淀云端开发者名片。
						</p>
					</div>

					<div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-muted-foreground text-xs shadow-xs backdrop-blur-md">
						<span className="relative flex size-2">
							<span
								className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${serviceStatus.pingClass}`}
							/>
							<span
								className={`relative inline-flex size-2 rounded-full ${serviceStatus.className}`}
							/>
						</span>
						{serviceStatus.label}
					</div>
				</header>

				<section aria-labelledby="add-profile-heading">
					<Card className="overflow-hidden border-border/60 bg-card/75 shadow-indigo-500/5 shadow-lg backdrop-blur-xl transition-all duration-300 hover:border-primary/30">
						<CardHeader className="border-border/40 border-b bg-muted/20 pb-4">
							<CardTitle className="text-lg" id="add-profile-heading">
								生成 GitHub 名片
							</CardTitle>
							<CardDescription>
								输入公开用户名，同步 GitHub 资料并保存名片。
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
										className="h-10 border-border/60 bg-background/60 shadow-xs backdrop-blur-sm transition-all focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
										id="github-username"
										name="github-username"
										onChange={handleUsernameChange}
										placeholder="例如：junbozhou88"
										value={username}
									/>
								</div>
								<Button
									className="h-10 gap-1.5 bg-linear-to-r from-indigo-600 via-purple-600 to-indigo-600 font-medium text-white shadow-indigo-500/20 shadow-md transition-all hover:opacity-90 hover:shadow-indigo-500/30 active:scale-[0.98]"
									disabled={createProfile.isPending || !username.trim()}
									type="submit"
								>
									{createProfile.isPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Plus className="size-4" />
									)}
									{createProfile.isPending ? "正在生成名片..." : "生成名片"}
								</Button>
							</form>

							{createProfile.error ? (
								<div
									className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive text-xs"
									role="alert"
								>
									<AlertCircle className="size-4 shrink-0" />
									<span>
										{createProfile.error.message ||
											"生成名片失败，请检查用户名或稍后重试。"}
									</span>
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
							<span className="rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 font-medium font-mono text-muted-foreground text-xs">
								共 {profiles.data?.length ?? 0} 张
							</span>
						</div>
						<Button
							aria-label="刷新名片列表"
							className="border-border/60 bg-card/60 backdrop-blur-md transition-all hover:bg-muted"
							disabled={profiles.isFetching}
							onClick={handleRefresh}
							size="icon"
							title="刷新名片列表"
							variant="outline"
						>
							<RefreshCw
								className={`size-4 ${profiles.isFetching ? "animate-spin text-indigo-500" : "text-muted-foreground"}`}
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
						<Card className="border-destructive/30 bg-destructive/5 backdrop-blur-md">
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
						<Empty className="rounded-2xl border-2 border-border/60 border-dashed bg-card/40 py-12 backdrop-blur-xl">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Code2 className="size-8 text-indigo-500" />
								</EmptyMedia>
								<EmptyTitle>暂无已保存的开发者名片</EmptyTitle>
								<EmptyDescription>
									在上方输入 GitHub 用户名并生成名片，同步的数据将收录在此处。
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}

					<div className="grid gap-4 md:grid-cols-2">
						{profiles.data?.map((profile) => (
							<ProfileCard
								deleteProfile={handleDelete}
								isDeleting={
									deleteProfile.isPending &&
									deleteProfile.variables?.id === profile.id
								}
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
