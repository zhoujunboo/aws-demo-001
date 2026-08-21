import { z } from "zod";

export const PROFILE_GENERATION_EVENT_TYPE =
	"profile.introduction.requested" as const;

export const profileGenerationEventSchema = z.object({
	eventId: z.uuid(),
	eventType: z.literal(PROFILE_GENERATION_EVENT_TYPE),
	previewId: z
		.string()
		.regex(/^pr-[1-9][0-9]{0,4}$/)
		.optional(),
	profileId: z.uuid(),
	requestedAt: z.iso.datetime(),
});

export type ProfileGenerationEvent = z.infer<
	typeof profileGenerationEventSchema
>;
