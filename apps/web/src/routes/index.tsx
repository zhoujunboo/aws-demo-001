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
	Code2,
	ExternalLink,
	Loader2,
	MapPin,
	RefreshCw,
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

function ProfileSkeleton() {
	return (
		<Card>
			<CardContent className="flex items-center gap-4">
				<Skeleton className="size-12 shrink-0" />
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
		<Card>
			<CardHeader>
				<div className="flex min-w-0 items-center gap-3">
					<img
						alt={`${profile.login} avatar`}
						className="size-12 shrink-0 border object-cover"
						height={48}
						src={profile.avatarUrl}
						width={48}
					/>
					<div className="min-w-0">
						<CardTitle className="truncate">
							{profile.name || profile.login}
						</CardTitle>
						<CardDescription className="truncate">
							@{profile.login}
						</CardDescription>
					</div>
				</div>
				<CardAction className="flex gap-1">
					<Button
						aria-label={`Open ${profile.login} on GitHub`}
						render={
							<a
								href={profile.profileUrl}
								rel="noopener noreferrer"
								target="_blank"
							/>
						}
						size="icon-sm"
						title="Open GitHub profile"
						variant="ghost"
					>
						<ExternalLink />
					</Button>
					<Button
						aria-label={`Delete ${profile.login}`}
						disabled={isDeleting}
						onClick={handleDelete}
						size="icon-sm"
						title="Delete saved profile"
						variant="destructive"
					>
						<Trash2 />
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="grid gap-4">
				{profile.bio ? (
					<p className="line-clamp-2 min-h-10 text-muted-foreground">
						{profile.bio}
					</p>
				) : null}
				<dl className="grid grid-cols-3 gap-3 border-y py-3 text-center">
					<div>
						<dt className="text-muted-foreground">Repositories</dt>
						<dd className="mt-1 font-medium text-base">
							{profile.publicRepos}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Followers</dt>
						<dd className="mt-1 font-medium text-base">{profile.followers}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Following</dt>
						<dd className="mt-1 font-medium text-base">{profile.following}</dd>
					</div>
				</dl>
				<div className="flex min-h-4 items-center gap-1.5 text-muted-foreground">
					{profile.location ? (
						<>
							<MapPin className="size-3.5" />
							<span className="truncate">{profile.location}</span>
						</>
					) : (
						<span>
							GitHub member since{" "}
							{new Date(profile.githubCreatedAt).getFullYear()}
						</span>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

function HomeComponent() {
	const [token, setToken] = useState("");
	const profiles = useQuery(trpc.githubProfiles.list.queryOptions());
	const saveProfile = useMutation(
		trpc.githubProfiles.saveFromToken.mutationOptions({
			onSuccess: async (profile) => {
				setToken("");
				await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
				toast.success(`Saved @${profile?.login ?? "GitHub user"}`);
			},
		})
	);
	const deleteProfile = useMutation(
		trpc.githubProfiles.delete.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: profilesQueryKey });
				toast.success("Profile deleted");
			},
		})
	);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const normalizedToken = token.trim();
			if (!normalizedToken) {
				toast.error("Enter a GitHub token");
				return;
			}
			saveProfile.mutate({ token: normalizedToken });
		},
		[saveProfile, token]
	);
	const handleTokenChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			setToken(event.target.value);
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

	return (
		<main className="overflow-y-auto bg-muted/30">
			<div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:px-6">
				<header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
					<div className="grid gap-1">
						<p className="font-medium text-muted-foreground text-xs uppercase">
							Account directory
						</p>
						<h1 className="font-semibold text-2xl">GitHub profiles</h1>
					</div>
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						<span
							className={`size-2 ${profiles.isError ? "bg-destructive" : "bg-emerald-500"}`}
						/>
						{profiles.isError ? "Database unavailable" : "Service connected"}
					</div>
				</header>

				<section aria-labelledby="add-profile-heading">
					<Card>
						<CardHeader className="border-b">
							<CardTitle id="add-profile-heading">
								Add or refresh profile
							</CardTitle>
							<CardDescription>
								Use a GitHub personal access token for the account.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form
								className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end"
								onSubmit={handleSubmit}
							>
								<div className="grid gap-2">
									<Label htmlFor="github-token">Personal access token</Label>
									<Input
										autoComplete="off"
										id="github-token"
										name="github-token"
										onChange={handleTokenChange}
										placeholder="github_pat_..."
										type="password"
										value={token}
									/>
								</div>
								<Button
									disabled={saveProfile.isPending || !token.trim()}
									type="submit"
								>
									{saveProfile.isPending ? (
										<Loader2 className="animate-spin" />
									) : (
										<Code2 />
									)}
									{saveProfile.isPending ? "Fetching" : "Fetch and save"}
								</Button>
							</form>
							{saveProfile.error ? (
								<p className="mt-3 text-destructive text-xs" role="alert">
									{saveProfile.error.message}
								</p>
							) : null}
						</CardContent>
					</Card>
				</section>

				<section
					aria-labelledby="saved-profiles-heading"
					className="grid gap-3"
				>
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="font-medium text-base" id="saved-profiles-heading">
								Saved profiles
							</h2>
							<p className="text-muted-foreground text-xs">
								{profiles.data?.length ?? 0}{" "}
								{profiles.data?.length === 1 ? "account" : "accounts"}
							</p>
						</div>
						<Button
							aria-label="Refresh saved profiles"
							disabled={profiles.isFetching}
							onClick={handleRefresh}
							size="icon"
							title="Refresh saved profiles"
							variant="outline"
						>
							<RefreshCw
								className={profiles.isFetching ? "animate-spin" : ""}
							/>
						</Button>
					</div>

					{profiles.isLoading ? (
						<div className="grid gap-3">
							<ProfileSkeleton />
							<ProfileSkeleton />
						</div>
					) : null}

					{profiles.isError ? (
						<Card>
							<CardContent className="flex items-center justify-between gap-4">
								<p className="text-destructive">{profiles.error.message}</p>
								<Button onClick={handleRefresh} variant="outline">
									Retry
								</Button>
							</CardContent>
						</Card>
					) : null}

					{profiles.data?.length === 0 ? (
						<Empty className="border">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Code2 />
								</EmptyMedia>
								<EmptyTitle>No saved profiles</EmptyTitle>
								<EmptyDescription>
									Profiles fetched from GitHub will appear here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : null}

					<div className="grid gap-3 md:grid-cols-2">
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
