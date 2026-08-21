import { env } from "@aws-demo-001/env/server";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

import type { ProfileGenerationEvent } from "./profile-generation-event";

const snsClient = new SNSClient({ region: env.AWS_REGION });

export const publishProfileGenerationEvent = async (
	event: ProfileGenerationEvent
): Promise<void> => {
	if (!env.PROFILE_EVENTS_TOPIC_ARN) {
		throw new Error("PROFILE_EVENTS_TOPIC_ARN is not configured.");
	}

	await snsClient.send(
		new PublishCommand({
			Message: JSON.stringify(event),
			TopicArn: env.PROFILE_EVENTS_TOPIC_ARN,
		})
	);
};
