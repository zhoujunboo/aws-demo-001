package agent

import "testing"

func TestMatchAgentsRanksATSRequestFirst(t *testing.T) {
	agents := testAgents()
	resume := "前端工程师，负责 React 项目"
	matches := MatchAgents(agents, CreateTaskInput{
		Description: "请针对这个岗位 JD 优化 ATS 关键词匹配",
		Resume:      &resume,
	})

	if len(matches) != 3 {
		t.Fatalf("expected 3 matches, got %d", len(matches))
	}
	if matches[0].Agent.ID != "ats-resume" {
		t.Fatalf("expected ats-resume first, got %q", matches[0].Agent.ID)
	}
	for index, match := range matches {
		if match.Rank != index+1 {
			t.Fatalf("expected rank %d, got %d", index+1, match.Rank)
		}
	}
}

func TestMatchAgentsRanksPolisherFirstWithExistingResume(t *testing.T) {
	agents := testAgents()
	resume := "我做了一个后台系统"
	matches := MatchAgents(agents, CreateTaskInput{
		Description: "请润色这份已有简历，让表达专业简洁",
		Resume:      &resume,
	})

	if matches[0].Agent.ID != "resume-polisher" {
		t.Fatalf("expected resume-polisher first, got %q", matches[0].Agent.ID)
	}
}

func testAgents() []Agent {
	return []Agent{
		{AutoAcceptJobs: true, ID: "tech-resume", Status: "active"},
		{AutoAcceptJobs: true, ID: "ats-resume", Status: "active"},
		{AutoAcceptJobs: true, ID: "resume-polisher", Status: "active"},
	}
}
