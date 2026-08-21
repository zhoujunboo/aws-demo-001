import { profileGenerationEventSchema } from "@aws-demo-001/api/profile-generation-event";
import { generateProfileIntroduction } from "@aws-demo-001/api/profile-service";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

const parseRecord = (record: SQSRecord) => {
	const body: unknown = JSON.parse(record.body);
	return profileGenerationEventSchema.parse(body);
};

const processRecord = async (record: SQSRecord): Promise<void> => {
	const event = parseRecord(record);
	const receiveCount = record.attributes.ApproximateReceiveCount;

	console.info("[ProfileGenerationWorker] Processing task", {
		eventId: event.eventId,
		profileId: event.profileId,
		receiveCount,
	});

	await generateProfileIntroduction(event.profileId, event.previewId);

	console.info("[ProfileGenerationWorker] Task completed", {
		eventId: event.eventId,
		profileId: event.profileId,
	});
};

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
	const results = await Promise.all(
		event.Records.map(async (record) => {
			try {
				await processRecord(record);
				return null;
			} catch (error) {
				console.error("[ProfileGenerationWorker] Task failed", {
					error,
					messageId: record.messageId,
					receiveCount: record.attributes.ApproximateReceiveCount,
				});
				return { itemIdentifier: record.messageId };
			}
		})
	);
	const batchItemFailures = results.filter(
		(failure): failure is { itemIdentifier: string } => failure !== null
	);

	return { batchItemFailures };
};
