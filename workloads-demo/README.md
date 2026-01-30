# Demo Workloads

This folder contains example workloads to help you get started with hs-conductor.

## Getting Started

**First-time setup:** Copy these examples to your personal workloads folder:

```powershell
# Copy all demo workloads to your personal workloads folder
Copy-Item -Recurse workloads-demo\* workloads\
```

Or copy individual examples:

```powershell
# Copy just one workload
Copy-Item workloads-demo\ad-hoc\joke.yaml workloads\ad-hoc\
```

## Available Examples

### Ad-Hoc Workloads (Simple AI prompts)

- **joke.yaml** - Generates a programming joke on a given topic
  - Perfect first example - quick, fun, shows AI worker
  - Run: `conductor run joke`

- **weather.yaml** - Fetches current weather for a location
  - Demonstrates JSON output and real-time data
  - Run: `conductor run weather`

### Task Workloads (Multi-step orchestration)

- **news-digest.yaml** - Fetches and summarizes news from multiple sources
  - Shows fetch-worker → AI-worker orchestration
  - Multi-step workflow with dependencies
  - Run: `conductor run news-digest`

## Creating Your Own

1. Copy an example as a starting point
2. Modify it to suit your needs
3. Save in `workloads/` (gitignored, for your personal use)

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed workload authoring guide.

## Note

The `workloads/` folder is gitignored to keep your personal automation private. These demo workloads in `workloads-demo/` are checked into git as examples for the community.
