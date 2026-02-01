# Demo Workloads

Example workloads to help you get started with hs-conductor.

## Getting Started

Copy examples to your personal workloads folder:

```powershell
# Copy all demo workloads
Copy-Item workloads-demo\*.yaml workloads\

# Or copy just one
Copy-Item workloads-demo\joke.yaml workloads\
```

## Available Examples

| File | Type | Description |
|------|------|-------------|
| `joke.yaml` | ad-hoc | Generates a programming joke - perfect first example |
| `weather.yaml` | ad-hoc | Fetches current weather, demonstrates JSON output |
| `code-review.yaml` | task | AI-powered code review of git changes |
| `github-activity.yaml` | task | Summarizes recent GitHub activity |
| `news-digest.yaml` | task | Fetches and summarizes news from multiple sources |
| `morning-brief.yaml` | workflow | Comprehensive daily briefing (weather + news + calendar) |

## Folder Organization

Workloads can be organized however you like:

```
workloads/
  joke.yaml           # Flat at root
  daily/              # Or grouped in folders
    news-digest.yaml
    weather.yaml
```

The `type` field in each YAML determines behavior, not folder location.

## Note

The `workloads/` folder is gitignored for your personal automation. These demo workloads serve as community examples.
