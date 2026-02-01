# Adding Workloads

Add new workloads by creating YAML files - no code changes required.

## Workload Types

| Type | Use Case | Description |
|------|----------|-------------|
| **ad-hoc** | Single AI call | Quick prompts with optional inputs |
| **task** | Sequential steps | Multi-step pipelines (A → B → C) |
| **workflow** | Complex with conditionals | Parallel execution, dependencies, branching |

## Folder Organization

Workloads live in `workloads/` (personal, gitignored) or `workloads-demo/` (examples).

You can organize workloads however you like - flat or in subfolders:

```
workloads/
  joke.yaml              # Flat at root
  weather.yaml
  daily/                  # Grouped by use case
    morning-brief.yaml
    news-digest.yaml
  dev-tools/              # Grouped by domain
    code-review.yaml
    pr-summary.yaml
```

The `type` field in each YAML determines how it runs, not the folder location.

## Adding an Ad-Hoc Workload

Create a YAML file anywhere in `workloads/`:

```yaml
# workloads/my-task.yaml
id: my-task
name: My Task
description: What it does
type: ad-hoc
version: 1.0.0
tags:
  - category

prompt: |
  Your AI prompt here.
  Use {{variableName}} for inputs.

input:
  variableName:
    type: string
    required: true
    description: What this input is for

output:
  format: json  # or markdown, text
```

That's it! The workload is automatically available.

## Adding a Task (Sequential Steps)

```yaml
# workloads/my-pipeline.yaml
id: my-pipeline
name: My Pipeline
description: Multi-step process
type: task
version: 1.0.0

steps:
  - id: step-1
    name: Fetch Data
    worker: fetch-worker
    config:
      url: https://api.example.com/data
    output: data.json

  - id: step-2
    name: Process with AI
    worker: ai-worker
    config:
      prompt: Summarize this data
    input:
      - data.json
    output: summary.md
```

## Adding a Workflow (Parallel + Conditionals)

```yaml
# workloads/my-workflow.yaml
id: my-workflow
name: My Workflow
description: Complex process
type: workflow
version: 1.0.0

steps:
  - id: parallel-a
    worker: fetch-worker
    config: { url: "..." }
    output: a.json
    parallel: true

  - id: parallel-b
    worker: fetch-worker
    config: { url: "..." }
    output: b.json
    parallel: true

  - id: combine
    worker: ai-worker
    config: { prompt: "Combine results" }
    input: [a.json, b.json]
    output: result.md
    dependsOn: [parallel-a, parallel-b]
```

## Available Workers

| Worker | Purpose | When to Use |
|--------|---------|-------------|
| `exec-worker` | Execute commands, scripts, binaries | PowerShell, bash, .exe (deterministic tasks) |
| `fetch-worker` | HTTP requests, RSS feeds | API calls, data retrieval |
| `file-worker` | File aggregation, transformation | File I/O operations |
| `ai-worker` | AI inference via Copilot SDK | Tasks requiring intelligence |

### Worker: exec-worker

Execute commands and capture output. Use for deterministic tasks that don't require AI.

**Config:**

- `command`: Executable to run (e.g., "pwsh", "bash", "node")
- `args`: Array of arguments
- `cwd`: Working directory (optional)
- `env`: Environment variables (optional)
- `timeout`: Max execution time in ms (default: 30000)
- `filter`: Regex pattern to filter output lines (optional)

**Example:**

```yaml
steps:
  - id: run-script
    name: Execute PowerShell Script
    worker: exec-worker
    config:
      command: pwsh
      args:
        - "-File"
        - "D:\\scripts\\my-script.ps1"
      filter: "^SUCCESS:"  # Only return lines starting with SUCCESS:
      timeout: 60000
    output: script-result.txt
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workloads` | List all workloads |
| GET | `/workloads/:id` | Get workload details |
| POST | `/run/:id` | Execute a workload |
| POST | `/reload` | Hot reload YAML files |

## Hot Reload

After editing YAML files, reload without restarting:

```bash
curl -X POST http://localhost:2900/reload
```
