# Example Workloads Guide

> Comprehensive guide to all example workloads included with hs-conductor

**Last Updated:** January 29, 2026

---

## Quick Reference

| Workload | Type | Complexity | Time | Best For |
|----------|------|------------|------|----------|
| [joke](#joke) | ad-hoc | ⭐ Beginner | ~5s | Testing installation, quick AI demo |
| [weather](#weather) | ad-hoc | ⭐ Beginner | ~10s | JSON output, real-time data |
| [news-digest](#news-digest) | task | ⭐⭐ Intermediate | ~30s | Multi-worker orchestration |
| [code-review](#code-review) | task | ⭐⭐ Intermediate | ~45s | Developer workflow, file analysis |
| [github-activity](#github-activity) | task | ⭐⭐ Intermediate | ~60s | API integration |
| [morning-brief](#morning-brief) | workflow | ⭐⭐⭐ Advanced | ~90s | Complex dependencies |

---

## Ad-Hoc Examples

### joke

**Path:** `workloads/examples/ad-hoc/joke.yaml`

**What it does:**  
Generates a programming joke on a given topic using AI.

**Why it's useful:**  
Perfect first example - runs fast, shows AI worker in action, demonstrates user input.

**Usage:**

```powershell
# Default topic
conductor run joke

# Custom topic
conductor run joke --input topic:JavaScript

# Or interactively
conductor run joke
# Prompt: Enter topic: recursion
```

**Expected Output:**

```markdown
# Joke Result

**Topic:** recursion

To understand recursion, you must first understand recursion.

But seriously, here's a joke:
Why do programmers prefer dark mode?
Because light attracts bugs! 🐛
```

**Learning Points:**

- ✅ Simple ad-hoc workload structure
- ✅ AI worker usage
- ✅ User input handling
- ✅ Markdown output format

---

### weather

**Path:** `workloads/examples/ad-hoc/weather.yaml`

**What it does:**  
Fetches current weather conditions for a location and returns structured JSON.

**Why it's useful:**  
Demonstrates JSON output format, real-time data fetching, and conditionally triggered alerts.

**Usage:**

```powershell
# Get weather for a city
conductor run weather --input location:"Mooresville, NC"

# Or interactively
conductor run weather
# Prompt: Enter location: New York, NY
```

**Expected Output:**

```json
{
  "location": "Mooresville, NC",
  "temperature": { "value": 68, "unit": "F" },
  "conditions": "Partly cloudy",
  "humidity": "45%",
  "wind": { "speed": 8, "unit": "mph", "direction": "NW" },
  "timestamp": "2026-01-29T14:30:00Z"
}
```

**Alert Trigger:**  
If conditions include "severe", "storm", or "warning", you'll get a notification:

```
⚠️ Severe weather alert!
```

**Learning Points:**

- ✅ JSON output format
- ✅ Conditional alerts based on output content
- ✅ Real-time data integration
- ✅ Required input validation

---

## Task Examples

### news-digest

**Path:** `workloads/examples/tasks/news-digest.yaml`

**What it does:**  
Fetches news from multiple RSS feeds and creates an AI-summarized digest with top stories.

**Why it's useful:**  
Shows multi-worker orchestration (fetch → AI), dependency between steps, and information aggregation.

**Usage:**

```powershell
conductor run news-digest
```

**Steps:**

1. **fetch-news** (fetch-worker): Pulls from Hacker News and Ars Technica RSS feeds
2. **summarize** (ai-worker): Analyzes and creates digest with top 10 stories

**Expected Output:**

```markdown
# News Digest

**Generated:** 2026-01-29 14:30 UTC

## Top 10 Stories

1. **New AI Model Breaks Records** - OpenAI announces...
   [Read more](https://...)

2. **Python 3.13 Released** - New features include...
   [Read more](https://...)

...

## Technology Trends
- AI/ML: 12 articles
- Web Development: 8 articles
- Cybersecurity: 5 articles
```

**Learning Points:**

- ✅ Multi-step task execution
- ✅ Fetch worker for RSS feeds
- ✅ AI worker for summarization
- ✅ Input/output file chaining
- ✅ Dependency management

---

### code-review

**Path:** `workloads/examples/tasks/code-review.yaml`  
**Status:** 🆕 Coming Soon

**What it does:**  
Reviews your local git changes and provides AI-powered code quality feedback.

**Why it's useful:**  
Developer workflow example, shows file worker reading local files, demonstrates AI analysis capabilities.

**Planned Steps:**

1. **get-diff** (exec-worker): Runs `git diff` to get uncommitted changes
2. **analyze-quality** (ai-worker): Reviews code for issues, best practices, security
3. **generate-report** (file-worker): Creates formatted markdown report

**Expected Output:**

```markdown
# Code Review Report

**Commit Range:** HEAD~1..HEAD  
**Files Changed:** 3

## Summary
✅ 2 files look good  
⚠️ 1 file needs attention

## Detailed Feedback

### src/workers/ai-worker.ts
**Grade:** B+

**Strengths:**
- Good error handling
- Clear separation of concerns

**Suggestions:**
- Line 42: Consider extracting magic number to constant
- Consider adding unit tests for edge cases

...
```

**Learning Points:**

- ✅ Exec worker for running system commands
- ✅ File worker for local file operations
- ✅ AI worker for analysis
- ✅ Practical developer workflow

---

### github-activity

**Path:** `workloads/examples/tasks/github-activity.yaml`  
**Status:** 🆕 Coming Soon

**What it does:**  
Fetches your GitHub activity and generates a summary of recent repos, commits, and contributions.

**Why it's useful:**  
Demonstrates API integration, authenticated requests, and data aggregation across multiple endpoints.

**Planned Steps:**

1. **fetch-repos** (fetch-worker): GET /user/repos (authenticated)
2. **fetch-commits** (fetch-worker): GET recent commits for active repos
3. **summarize-activity** (ai-worker): Create readable summary with insights

**Expected Output:**

```markdown
# GitHub Activity Summary

**Period:** Last 7 days  
**User:** your-username

## Statistics
- 📦 Repositories: 12 active
- 💻 Commits: 47
- 🌿 Branches created: 3
- 🔀 Pull requests: 2

## Most Active Repositories
1. **hs-conductor** - 23 commits
2. **dashboard** - 15 commits
3. **hs-cli-template** - 9 commits

## Insights
Your most productive day was Tuesday with 18 commits.
Primary languages: TypeScript (65%), PowerShell (20%), Markdown (15%)
```

**Learning Points:**

- ✅ API authentication (GitHub token)
- ✅ Multiple fetch-worker calls
- ✅ Data aggregation across endpoints
- ✅ Real-world API integration

---

## Workflow Examples

### morning-brief

**Path:** `workloads/examples/workflows/morning-brief.yaml`  
**Status:** 🆕 Coming Soon

**What it does:**  
Comprehensive morning briefing combining weather, news, calendar, and priorities.

**Why it's useful:**  
Showcases complex workflow with parallel tasks, dependency chains, and real-world utility.

**Planned Steps:**

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Weather   │   │    News     │   │  Calendar   │
│ (fetch-wkr) │   │ (fetch-wkr) │   │ (fetch-wkr) │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                   ┌──────▼──────┐
                   │  Aggregate  │
                   │ (file-wkr)  │
                   └──────┬──────┘
                          │
                   ┌──────▼──────┐
                   │  Generate   │
                   │  Briefing   │
                   │  (ai-wkr)   │
                   └─────────────┘
```

1. **Parallel Execution:**
   - fetch-weather
   - fetch-news
   - fetch-calendar
2. **Aggregation:** combine-data (waits for all 3)
3. **Generation:** create-briefing (waits for aggregation)

**Expected Output:**

```markdown
# Morning Brief - January 29, 2026

## Weather
☀️ Mooresville, NC: 68°F, Partly Cloudy
High: 72°F | Low: 55°F
Good day for outdoor activities!

## Top News Headlines
1. Major tech announcement from...
2. Market update: S&P 500...
3. Local: New development in...

## Your Calendar
📅 3 events today:
- 9:00 AM - Team Standup (30min)
- 2:00 PM - One-on-One with Sarah (60min)
- 4:00 PM - Code Review (30min)

## Priorities
Based on your calendar and deadlines:
1. Finish PR review before 4pm meeting
2. Prepare talking points for Sarah 1:1
3. Review team standup notes
```

**Learning Points:**

- ✅ Complex workflow orchestration
- ✅ Parallel task execution
- ✅ Dependency chain management
- ✅ Multiple workers collaborating
- ✅ Real-world automation use case

---

## Running Examples

### Basic Execution

```powershell
# Run any example
conductor run <workload-id>

# With input parameters
conductor run weather --input location:"Seattle, WA"

# Interactive mode (prompts for inputs)
conductor run joke
```

### Monitoring Execution

```powershell
# Check status during execution
conductor status

# Watch live (refreshes every 2s)
conductor status --watch

# Get specific plan
conductor status <plan-id>
```

### Viewing Results

```powershell
# List recent runs
conductor list

# Show result for latest run
conductor result

# Show result for specific run
conductor result <plan-id>
```

---

## Creating Your Own

Want to create a custom workload based on these examples?

1. **Copy an example** that's closest to your needs
2. **Modify the config** - change inputs, prompts, outputs
3. **Save to** `workloads/personal/` (gitignored)
4. **Test it:** `conductor run your-workload-id`

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed workload authoring guide.

---

## Troubleshooting Examples

### Example won't run

```powershell
# Check if workload is loaded
conductor list --examples-only

# Validate workload YAML
conductor validate workloads/examples/ad-hoc/joke.yaml

# Check logs
conductor logs <plan-id>
```

### Wrong output format

Make sure `output.format` in the workload matches what you expect:

- `markdown` - Rich text with formatting
- `json` - Structured data
- `text` - Plain text

### AI worker timeout

Some examples may take longer depending on:

- Model selected (claude-opus is slower than haiku)
- Prompt complexity
- Current API load

You can adjust timeout in the workload config:

```yaml
config:
  timeout: 120  # seconds
```

---

## Next Steps

1. **Try all examples** in order of complexity
2. **Modify an example** to customize it
3. **Create your own** workload in `workloads/personal/`
4. **Share feedback** - Which examples were most helpful?

---

*For more details, see [README.md](../README.md) and [CONTRIBUTING.md](./CONTRIBUTING.md)*
