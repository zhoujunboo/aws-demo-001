package agent

import (
	"sort"
	"strings"
)

const maxMatchedAgents = 3

var agentKeywords = map[string][]string{
	"ats-resume": {
		"ats", "jd", "岗位", "职位", "关键词", "匹配", "招聘", "job description",
	},
	"resume-polisher": {
		"已有简历", "修改简历", "优化表达", "润色", "改写", "精简", "专业简洁", "polish", "rewrite",
	},
	"tech-resume": {
		"ai", "react", "typescript", "前端", "后端", "工程师", "开发", "技术", "软件", "数据", "生成", "engineer",
	},
}

var baseScores = map[string]int{
	"ats-resume":      6,
	"resume-polisher": 4,
	"tech-resume":     8,
}

func MatchAgents(agents []Agent, input CreateTaskInput) []Match {
	content := strings.ToLower(input.Description)
	if input.Resume != nil {
		content += " " + strings.ToLower(*input.Resume)
	}

	matches := make([]Match, 0, len(agents))
	for _, candidate := range agents {
		if candidate.Status != "active" || !candidate.AutoAcceptJobs {
			continue
		}

		score := baseScores[candidate.ID]
		for _, keyword := range agentKeywords[candidate.ID] {
			if strings.Contains(content, keyword) {
				score += 10
			}
		}
		if input.Resume != nil && candidate.ID == "resume-polisher" {
			score += 8
		}
		matches = append(matches, Match{Agent: candidate, Score: score})
	}

	sort.Slice(matches, func(left, right int) bool {
		if matches[left].Score == matches[right].Score {
			return matches[left].Agent.ID < matches[right].Agent.ID
		}
		return matches[left].Score > matches[right].Score
	})
	if len(matches) > maxMatchedAgents {
		matches = matches[:maxMatchedAgents]
	}
	for index := range matches {
		matches[index].Rank = index + 1
	}
	return matches
}
