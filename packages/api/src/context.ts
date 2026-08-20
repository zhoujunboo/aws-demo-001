import { auth } from "@aws-demo-001/auth";
import type { Context as HonoContext } from "hono";

const PREVIEW_HEADER_NAME = "X-Preview-PR";
const PREVIEW_ID_PATTERN = /^pr-[1-9][0-9]{0,4}$/;

export interface CreateContextOptions {
	context: HonoContext;
}

export async function createContext({ context }: CreateContextOptions) {
	const previewHeader = context.req.header(PREVIEW_HEADER_NAME)?.trim();
	const previewId =
		previewHeader && PREVIEW_ID_PATTERN.test(previewHeader)
			? previewHeader
			: undefined;
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});
	return {
		auth: null,
		previewId,
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
