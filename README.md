# hs-conductor

> Event-Driven Multi-Agent Orchestration with Inngest

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-f472b6.svg)](https://bun.sh/)
[![Inngest](https://img.shields.io/badge/Inngest-Self--Hosted-purple.svg)](https://www.inngest.com/docs/self-hosting)
[![GitHub Copilot](https://img.shields.io/badge/AI-GitHub%20Copilot%20SDK-orange.svg)](https://github.com/github/copilot-sdk)

## Overview

`hs-conductor` is an event-driven multi-agent orchestration system that uses Inngest for workflow management and GitHub Copilot SDK for AI inference.

---

## Getting Started

### Prerequisites

Before you begin, make sure you have these installed:

| Requirement | Version | How to Check | Install |
|------------|---------|--------------|---------|
| **Node.js** | 22+ | `node --version` | [nodejs.org](https://nodejs.org/) |
| **Bun** | 1.2+ | `bun --version` | `powershell -c "irm bun.sh/install.ps1 \| iex"` |
| **GitHub Copilot CLI** | Latest | `copilot --version` | `npm install -g @github/copilot-cli` |

After installing Copilot CLI, authenticate once:

```powershell
copilot auth
```

---

## Installation

### Step 1: Clone & Setup

```powershell
git clone https://github.com/HemSoft/hs-conductor.git
cd hs-conductor
.\setup.ps1
```

The setup script will:

- ✅ Verify Bun is installed
- ✅ Install all dependencies
- ✅ Copy demo workloads to get you started
- ✅ Create a `.env` file from the template

### Step 2: Configure Environment (Optional)

For local development, the default `.env` values work out of the box — no changes needed.

If deploying to production with Inngest Cloud, edit `.env` and generate real keys:

```powershell
openssl rand -hex 32  # Use for INNGEST_SIGNING_KEY
```

### Step 3: Run Conductor

You have two options for running Conductor:

#### Option A: Manual (Development)

Run when you need it, stop with Ctrl+C:

```powershell
.\run.ps1
```

This starts all services in the foreground:

- Backend server: <http://localhost:2900>
- Inngest dashboard: <http://localhost:2901>
- Admin UI: <http://localhost:5173>

#### Option B: Background Service (Always-On)

For 24/7 operation that starts automatically with Windows:

```powershell
# Requires Administrator privileges
.\setup-service.ps1
```

This creates a Windows Scheduled Task that:

- ✅ Starts automatically when Windows boots
- ✅ Monitors and restarts services if they crash
- ✅ Runs silently in the background

To remove the background service later:

```powershell
# Requires Administrator privileges
.\uninstall-service.ps1
```

---

## Running Your First Workload

With the server running, try a simple example:

```powershell
# Tell a joke
curl -X POST http://localhost:2900/run/joke

# Get a weather report
curl -X POST http://localhost:2900/run/weather

# Run news digest
curl -X POST http://localhost:2900/run/news-digest
```

---

## Script Reference

| Script | Purpose | Admin Required |
|--------|---------|:--------------:|
| `setup.ps1` | First-time setup: install deps, copy workloads, create .env | No |
| `run.ps1` | Start all services (backend + Inngest + admin UI) | No |
| `run-server.ps1` | Start backend services only (no admin UI) | No |
| `run-app.ps1` | Start admin UI only (requires backend running) | No |
| `setup-service.ps1` | Install background service for 24/7 operation | **Yes** |
| `update-service.ps1` | Restart background service after changes | **Yes** |
| `uninstall-service.ps1` | Remove background service | **Yes** |

**Running as Administrator:** Right-click PowerShell → "Run as administrator"

---

## Keyboard Shortcuts

### Global

| Shortcut | Action |
|----------|--------|
| `F11` | Toggle fullscreen mode |

### YAML Editor

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` / `Cmd+S` | Save changes |

### Result View

| Shortcut | Action |
|----------|--------|
| `Escape` | Close embedded web view |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      hs-conductor                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   HTTP API               Inngest Functions                      │
│   ────────────           ─────────────────────────────          │
│   POST /run/:id    ──►   conductor/plan.created                 │
│   GET /status/:id        conductor/task.ready                   │
│   GET /workloads         conductor/task.completed               │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │         INNGEST DEV SERVER (localhost:2901)             │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Workers                                                       │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│   │ Fetch Worker │ │ File Worker  │ │  AI Worker   │           │
│   │  (HTTP/RSS)  │ │ (Aggregate)  │ │ (Copilot SDK)│           │
│   └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `INNGEST_EVENT_KEY` | Event key for authentication | Required |
| `INNGEST_SIGNING_KEY` | Signing key (hex, 32 bytes) | Required |
| `INNGEST_BASE_URL` | Inngest dev server URL | `http://localhost:2901` |
| `COPILOT_MODEL` | Default AI model | `claude-sonnet-4.5` |
| `CONDUCTOR_DATA_PATH` | Data directory | `./data` |

### Available AI Models

Models are fetched dynamically from your Copilot subscription:

| Provider | Models |
|----------|--------|
| **Anthropic** | `claude-sonnet-4.5` (default), `claude-opus-4.5`, `claude-haiku-4.5` |
| **OpenAI** | `gpt-5.2`, `gpt-5.1-codex`, `gpt-5`, `gpt-5-mini` |
| **Google** | `gemini-3-pro` |

*Available models depend on your Copilot subscription tier.*

---

## Project Structure

```
hs-conductor/
├── src/
│   ├── inngest/          # Inngest client & events
│   ├── workers/          # AI, Fetch, File workers
│   ├── lib/              # Utilities & storage
│   └── types/            # TypeScript definitions
├── admin/                # Electron admin UI
├── workloads/            # Your workload definitions
├── workloads-demo/       # Example workloads
└── data/
    ├── runs/             # Execution history
    ├── schedules/        # Cron schedules
    └── alerts/           # Alert history
```

---

## Development

```powershell
bun run build       # Build
bun run typecheck   # Type check
bun run lint        # Lint
bun run format      # Format
```

---

## Documentation

- [Adding Workloads](docs/ADDING-WORKLOADS.md) - Create your own workloads
- [Examples](docs/EXAMPLES.md) - Detailed examples
- [Demo Workloads](workloads-demo/README.md) - Included examples

---

## License

MIT © HemSoft Developments
