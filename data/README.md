# Data Directory

This folder contains runtime data for hs-conductor.

## Structure

```
data/
├── runs/       # 🔒 Execution results (gitignored)
├── schedules/  # 🔒 Cron schedules (gitignored) 
└── alerts/     # 🔒 Alert history (gitignored)
```

## What Gets Stored Where

### runs/

**Gitignored** - Contains execution results for each run

```
runs/
└── <workload-id>-<timestamp>/
    ├── run.json       # Run metadata
    ├── result.md      # Generated result
    └── assets/        # Intermediate files
```

Example: `data/runs/news-digest-2026-01-29-145259/`

### schedules/

**Gitignored** - Cron schedule configurations (personal automation)

Each schedule is a JSON file defining when a workload should run:

```json
{
  "id": "morning-news",
  "workload": "news-digest",
  "cron": "0 6 * * *",
  "enabled": true
}
```

### alerts/

**Gitignored** - Alert history and notification logs

Stores records of triggered alerts from workload executions.

## Privacy & Backup

All personal data (`runs/`, `schedules/`, `alerts/`) is gitignored to keep your automation private.

**Backup Strategy:**

- `runs/` - Usually not needed, results are temporary
- `schedules/` - **Important!** Back these up if you have custom schedules
- `alerts/` - Optional, can be recreated

Recommended backup: Include `data/schedules/` in your OneDrive backup or personal git repo.

## First-Time Setup

When you first clone the repo, these folders will be empty. They'll be created automatically when:

- You run a workload (creates `runs/`)
- You create a schedule (creates `schedules/`)
- An alert triggers (creates `alerts/`)

No manual setup needed!
