import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../index";
import {
	deleteProfile,
	generateProfileIntroduction,
	listProfiles,
	ProfileServiceError,
} from "../profile-service";

type TRPCErrorCode = ConstructorParameters<typeof TRPCError>[0]["code"];

const profileErrorCodes: Partial<Record<number, TRPCErrorCode>> = {
	400: "BAD_REQUEST",
	404: "NOT_FOUND",
	429: "TOO_MANY_REQUESTS",
	502: "BAD_GATEWAY",
	503: "TIMEOUT",
	504: "TIMEOUT",
};

const toTRPCError = (error: unknown): TRPCError => {
	if (!(error instanceof ProfileServiceError)) {
		return new TRPCError({
			cause: error,
			code: "INTERNAL_SERVER_ERROR",
			message: "Profile service returned an invalid response.",
		});
	}

	const code = profileErrorCodes[error.statusCode] ?? "INTERNAL_SERVER_ERROR";

	return new TRPCError({ cause: error, code, message: error.message });
};

const callProfileService = async <Result>(
	operation: () => Promise<Result>
): Promise<Result> => {
	try {
		return await operation();
	} catch (error) {
		throw toTRPCError(error);
	}
};

export const appRouter = router({
	githubProfiles: router({
		delete: publicProcedure
			.input(z.object({ id: z.uuid() }))
			.mutation(({ input }) =>
				callProfileService(() => deleteProfile(input.id))
			),
		generateFromUsername: publicProcedure
			.input(
				z.object({
					username: z.string().trim().min(1, "请输入 GitHub 用户名。").max(39),
				})
			)
			.mutation(({ input }) =>
				callProfileService(() => generateProfileIntroduction(input.username))
			),
		list: publicProcedure.query(() => callProfileService(listProfiles)),
	}),
	healthCheck: publicProcedure.query(() => "OK"),
	privateData: protectedProcedure.query(({ ctx }) => ({
		message: "This is private",
		user: ctx.session.user,
	})),
});
export type AppRouter = typeof appRouter;
