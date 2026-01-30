# Template: Today's News

## Metadata
- Template-ID: TODAYS-NEWS
- Schedule: "0 6 * * *"
- Approval: auto
- Version: 1.0

## Description
Fetches news from multiple sources, aggregates, deduplicates, and produces a daily digest with AI-powered summarization using GitHub Copilot SDK.

## Tasks

### TASK-001: Fetch RSS Feeds
- Worker: fetch-worker
- Depends-On: none
- Config:
  - sources: [techcrunch, verge, arstechnica]
- Output: assets/rss-raw.json

### TASK-002: Fetch Reddit
- Worker: fetch-worker
- Depends-On: none
- Config:
  - subreddits: [technology, programming, artificial]
- Output: assets/reddit-raw.json

### TASK-003: Fetch Hacker News
- Worker: fetch-worker
- Depends-On: none
- Config:
  - endpoint: top-stories
  - limit: 30
- Output: assets/hackernews-raw.json

### TASK-004: Aggregate Sources
- Worker: file-worker
- Depends-On: [TASK-001, TASK-002, TASK-003]
- Input: [assets/rss-raw.json, assets/reddit-raw.json, assets/hackernews-raw.json]
- Output: assets/aggregated.json

### TASK-005: Summarize & Rank
- Worker: ai-worker
- Depends-On: [TASK-004]
- Config:
  - model: claude-sonnet-4.5
  - prompt: "Analyze these news items and create a summary with: 1) Top 10 most important stories, 2) Stories by category, 3) Trending topics. Be concise but informative."
- Input: [assets/aggregated.json]
- Output: results/RESULT.md

## Result Schema
- Format: markdown
- Sections: [top-stories, by-category, trending-topics]
