# hs-conductor

> Event-Driven Multi-Agent Orchestration with Inngest

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2+-f472b6.svg)](https://bun.sh/)
[![Inngest](https://img.shields.io/badge/Inngest-Self--Hosted-purple.svg)](https://www.inngest.com/docs/self-hosting)
[![GitHub Copilot](https://img.shields.io/badge/AI-GitHub%20Copilot%20SDK-orange.svg)](https://github.com/github/copilot-sdk)

## Overview

`hs-conductor` is an event-driven multi-agent orchestration system that uses Inngest for workflow management and GitHub Copilot SDK for AI inference.

## Features

- **GitHub Copilot SDK**: Enterprise-grade AI through your existing Copilot subscription
- **Event-Driven Architecture**: Parallel task execution with dependency resolution
- **File-Based State**: Markdown plans with JSON assets
- **Reusable Workers**: Fetch, File, and AI workers for common operations

## Prerequisites

- Bun 1.2+
- GitHub Copilot CLI (`copilot` command) installed and authenticated

## Quick Start

### 1. Clone & Setup

```powershell
# Clone the repository
git clone https://github.com/HemSoft/hs-conductor.git
cd hs-conductor

# Run setup script (installs dependencies, copies demo workloads)
.\setup.ps1
```

### 2. Configure Environment

```powershell
# Copy example config
Copy-Item .env.example .env

# Generate secure keys
openssl rand -hex 32  # Use for INNGEST_SIGNING_KEY
```

Edit `.env` with your keys.

### 3. Start Development

```powershell
# Start the conductor server (includes Inngest dev server)
bun run dev

# In terminal 2: Run a plan
coStart the conductor server and Inngest dev
.\run.ps1

# Or manually:
# Terminal 1: Start conductor server
bun run dev

# Terminal 2: Access via HTTP
# The server will be running at http://localhost:2900
```

### 5. Run Your First Workload

```powershell
# In a new terminal while server is running
# Try a simple example
curl -X POST http://localhost:2900/run/joke

# Or run news digest
curl -X POST http://localhost:2900/run/news-digest
```

### 6
## Architecture
. Monitor

- **Inngest Dashboard**: http://localhost:2901
- **Plan Status**: Check execution logs in the terminal

```
┌─────────────────────────────────────────────────────────────────┐
│                      hs-conductor                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   CLI Commands           Inngest Functions                      │
│   ──────────────         ─────────────────────────────          │
│   conductor run     ──►  conductor/plan.created                 │
│   conductor status       conductor/task.ready                   │
│   conductor list         conductor/task.completed               │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │         INNGEST DEV SERVER (npx inngest-cli)            │   │
│   │                   localhost:2901                        │   │
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

## Commands

| Command | Description |
|---------|-------------|
| `conductor run <template>` | Run a plan from a template |
| `conductor status [plan-id]` | Check status of a plan |
| `conductor list` | List all plan runs |
| `conductor templates` | List available templates |
| `conductor dev` | Start development server |

## Infrastructure

The conductor runs with minimal external dependencies:

- **Inngest Dev Server**: Runs via `npx inngest-cli dev` on port 2901 (auto-started by `run.ps1`)
- **Express App**: Bun server on port 2900 hosting Inngest workers
- **File Storage**: Local filesystem for plans, results, and workload definitions

### Development Commands

```powershell
# Start everything (Inngest + Express)
bun run dev

# Stop with Ctrl+C or close the terminal
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `INNGEST_EVENT_KEY` | Event key for authentication | Required |
| `INNGEST_SIGNING_KEY` | Signing key (hex, 32 bytes) | Required |
| `INNGEST_BASE_URL` | Inngest dev server URL | `http://localhost:2901` |
| `COPILOT_MODEL` | Default AI model | `claude-sonnet-4.5` |
| `CONDUCTOR_DATA_PATH` | Data directory | `./data` |

## AI Integration

The AI Worker uses GitHub Copilot SDK, which requires:

1. **Copilot CLI**: Install via `npm install -g @github/copilot-cli`  
2. **Authentication**: Run `copilot auth` to authenticate (or use VS Code Copilot extension)

No API keys or paid subscription required - works with the free Copilot tier (50 requests/month) or any paid plan.

### Available Models

Models are fetched dynamically from the Copilot CLI at runtime. The system automatically filters to the latest version of each model family:

**Claude (Anthropic):**
- `claude-sonnet-4.5` (default) - Best balance of speed/quality
- `claude-opus-4.5` - Most capable, highest quality
- `claude-haiku-4.5` - Fastest, most cost-effective

**GPT (OpenAI):**
- `gpt-5.2` - Latest GPT model
- `gpt-5.1-codex` - Code-specialized
- `gpt-5` - Stable baseline
- `gpt-5-mini` - Cost-effective

**Gemini (Google):**
- `gemini-3-pro` - Google's latest

*Note: Available models depend on your Copilot subscription tier.*

## Development

```powershell
# Build
bun run build

# Type check
bun run typecheck

# Lint
bun run lint

# Format
bun run format
```

## Project Structure

```
hs-conductor/
├── src/
│   ├── inngest/
│   │   ├── client.ts       # Inngest client configuration
│   │   └── events.ts       # Event definitions
│   ├── workers/
│   │   └── ai-worker.ts    # AI worker (Copilot SDK)
│   ├── lib/
│   │   └── file-storage.ts # Plan & asset storage
│   └── types/
│       └── plan.ts         # TypeScript definitions
├── data/
│   ├── templates/          # Plan templates
│   └── runs/               # Execution instances
└── PLAN.md                 # Implementation plan
```

## License

MIT © HemSoft Developments
