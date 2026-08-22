package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

type sqsSender interface {
	SendMessage(context.Context, *sqs.SendMessageInput, ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
}

type SQSWorkflowPublisher struct {
	client   sqsSender
	queueURL string
}

func NewSQSWorkflowPublisher(client sqsSender, queueURL string) (*SQSWorkflowPublisher, error) {
	trimmedQueueURL := strings.TrimSpace(queueURL)
	if client == nil || trimmedQueueURL == "" {
		return nil, errors.New("workflow SQS client and queue URL are required")
	}
	return &SQSWorkflowPublisher{client: client, queueURL: trimmedQueueURL}, nil
}

func (publisher *SQSWorkflowPublisher) Publish(ctx context.Context, workflowID string) error {
	body, err := json.Marshal(map[string]string{"workflowId": workflowID})
	if err != nil {
		return fmt.Errorf("encode workflow message: %w", err)
	}
	_, err = publisher.client.SendMessage(ctx, &sqs.SendMessageInput{
		MessageBody:            stringPointer(string(body)),
		MessageDeduplicationId: stringPointer(workflowID),
		MessageGroupId:         stringPointer(workflowID),
		QueueUrl:               stringPointer(publisher.queueURL),
	})
	if err != nil {
		return fmt.Errorf("publish workflow execution: %w", err)
	}
	return nil
}

func stringPointer(value string) *string {
	return &value
}
