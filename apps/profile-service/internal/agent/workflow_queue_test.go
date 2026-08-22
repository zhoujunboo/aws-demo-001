package agent

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

type recordingSQSSender struct {
	input *sqs.SendMessageInput
}

func (sender *recordingSQSSender) SendMessage(
	_ context.Context,
	input *sqs.SendMessageInput,
	_ ...func(*sqs.Options),
) (*sqs.SendMessageOutput, error) {
	sender.input = input
	return &sqs.SendMessageOutput{}, nil
}

func TestSQSWorkflowPublisherUsesWorkflowAsFIFOKey(t *testing.T) {
	sender := &recordingSQSSender{}
	publisher, err := NewSQSWorkflowPublisher(sender, "https://sqs.example.com/workflows.fifo")
	if err != nil {
		t.Fatalf("NewSQSWorkflowPublisher returned an error: %v", err)
	}
	workflowID := "9f51a8de-ec31-4d12-9a71-ab907908600b"
	if err := publisher.Publish(context.Background(), workflowID); err != nil {
		t.Fatalf("Publish returned an error: %v", err)
	}
	if sender.input == nil || sender.input.MessageGroupId == nil ||
		sender.input.MessageDeduplicationId == nil {
		t.Fatal("expected FIFO message identifiers")
	}
	if *sender.input.MessageGroupId != workflowID ||
		*sender.input.MessageDeduplicationId != workflowID {
		t.Fatalf("unexpected FIFO identifiers: %#v", sender.input)
	}
	var body map[string]string
	if err := json.Unmarshal([]byte(*sender.input.MessageBody), &body); err != nil {
		t.Fatalf("decode message body: %v", err)
	}
	if body["workflowId"] != workflowID {
		t.Fatalf("unexpected message body: %#v", body)
	}
}
