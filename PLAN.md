# hs-conductor: Implementation Plan

> **Proof-of-Concept for Event-Driven Multi-Agent Orchestration**

## Overview

`hs-conductor` is an event-driven multi-agent orchestration system using Inngest. The POC validates the architecture by implementing a "Today's News" plan that fetches news from multiple sources, aggregates, and summarizes them.

## Goals

1. **Validate Inngest** as the event backbone for agent orchestration
2. **Prove dependency resolution** - parallel tasks and sequential dependencies
3. **Establish file-based state** - markdown plans, tasks, results, and JSON assets
4. **Create reusable worker patterns** - Fetch Worker, File Worker, AI Worker
5. **Build foundation** for future Dashboard integration

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Bun 1.2+ | TypeScript with ESM |
| CLI Framework | Commander.js | Standard HemSoft CLI |
| Event Bus | **Inngest Dev Server** | npx inngest-cli (local development) |
| HTTP Client | fetch | Native fetch for RSS/API |
| AI Integration | **GitHub Copilot SDK** | Enterprise-grade AI via Copilot subscription |
| File Storage | Local filesystem | JSON + Markdown |
| UI | chalk, boxen, ora, cli-table3 | Standard HemSoft CLI styling |

### Development Infrastructure

| Component | Invocation | Purpose |
|-----------|------------|----------|
| Inngest Dev Server | `npx inngest-cli dev` | Event orchestration, dashboard (port 2901) |
| Express App | `bun run src/index.ts` | Inngest worker host (port 2900) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           hs-conductor                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   CLI Commands                     Inngest Functions                    │
│   ────────────────                 ─────────────────                    │
│   conductor run <template>    ──►  conductor/plan.created               │
│   conductor status [plan-id]       conductor/task.ready                 │
│   conductor list                   conductor/task.completed             │
│   conductor templates              conductor/plan.completed             │
│   conductor dev                                                         │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                     INNGEST DEV SERVER                          │   │
│   │   http://localhost:2901                                         │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   Workers (Inngest Functions)                                           │
│   ─────────────────────────────                                         │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                   │
│   │ Fetch Worker │ │ File Worker  │ │  AI Worker   │                   │
│   │  (HTTP/RSS)  │ │ (Aggregate)  │ │ (Summarize)  │                   │
│   └──────────────┘ └──────────────┘ └──────────────┘                   │
│                                                                         │
│   Storage (Local Filesystem)                                            │
│   ─────────────────────────────                                         │
│   data/                                                                 │
│     templates/                    # Plan templates                      │
│       TODAYS-NEWS.template.md                                           │
│     runs/                         # Plan execution instances            │
│       TODAYS-NEWS-2026-01-27/                                           │
│         PLAN.md                   # Plan manifest with status           │
│         tasks/                                                          │
│           TASK-001-fetch-rss.md                                         │
│           TASK-002-fetch-reddit.md                                      │
│           TASK-003-fetch-hackernews.md                                  │
│           TASK-004-aggregate.md                                         │
│           TASK-005-summarize.md                                         │
│         assets/                                                         │
│           rss-raw.json                                                  │
│           reddit-raw.json                                               │
│           hackernews-raw.json                                           │
│           aggregated.json                                               │
│         results/                                                        │
│           RESULT.md               # Final output                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
hs-conductor/
├── .husky/                       # Pre-commit hooks
├── data/                         # Plan storage (gitignored except templates)
│   ├── templates/                # Plan templates
│   │   └── TODAYS-NEWS.template.md
│   └── runs/                     # Execution instances (gitignored)
├── src/
│   ├── index.ts                  # CLI entry point
│   ├── commands/
│   │   ├── run.ts                # Run a plan template
│   │   ├── status.ts             # Check plan status
│   │   ├── list.ts               # List all runs
│   │   ├── templates.ts          # List available templates
│   │   └── dev.ts                # Start Inngest dev server
│   ├── inngest/
│   │   ├── client.ts             # Inngest client
│   │   ├── events.ts             # Event type definitions
│   │   ├── functions.ts          # All Inngest functions
│   │   └── serve.ts              # HTTP server for Inngest
│   ├── workers/
│   │   ├── fetch-worker.ts       # HTTP/RSS fetching
│   │   ├── file-worker.ts        # File aggregation
│   │   └── ai-worker.ts          # LLM summarization
│   ├── lib/
│   │   ├── banner.ts             # HemSoft branding
│   │   ├── config.ts             # CLI configuration
│   │   ├── plan-parser.ts        # Parse template markdown
│   │   ├── plan-instantiator.ts  # Create run from template
│   │   ├── task-manager.ts       # Dependency resolution
│   │   ├── file-storage.ts       # Read/write plan files
│   │   └── openrouter.ts         # OpenRouter API client
│   ├── types/
│   │   ├── plan.ts               # Plan, Task, Result types
│   │   ├── events.ts             # Event payload types
│   │   └── config.ts             # Configuration types
│   └── utils/
│       ├── markdown.ts           # Markdown parsing/writing
│       └── date.ts               # Date formatting
├── package.json
├── tsconfig.json
├── eslint.config.js
├── .prettierrc
├── .gitignore
├── AGENTS.md                     # Agent/contributor instructions
├── README.md
└── PLAN.md                       # This file
```

---

## Implementation Phases

### Phase 0: Project Setup

**Estimated: 30 minutes**

- [ ] Clone hs-cli-template to hs-cli-conductor
- [ ] Update package.json (name, description, bin, dependencies)
- [ ] Add Inngest dependencies: `inngest`, `express` (for dev server)
- [ ] Add OpenRouter/fetch dependencies: `undici`, `zod`
- [ ] Update branding (banner.ts, config.ts)
- [ ] Initialize git, create AGENTS.md
- [ ] Create data/ folder structure

**Commands:**
```powershell
Set-Location "D:\github\HemSoft"
Copy-Item -Recurse -Path "hs-cli-template" -Destination "hs-conductor"
Set-Location hs-conductor
Remove-Item -Recurse -Force .git
git init
```

**package.json updates:**
```json
{
  "name": "@hemsoft/conductor",
  "description": "Event-driven multi-agent orchestration CLI",
  "bin": {
    "conductor": "dist/index.js"
  },
  "dependencies": {
    "inngest": "^3.31.0",
    "@github/copilot-sdk": "^0.1.9",
    "express": "^4.x",
    "zod": "^3.x"
  }
}
```

**Development Setup:**
```powershell
# Start Inngest dev server and Express app
bun run dev

# View Inngest dashboard at http://localhost:2901
```

---

### Phase 1: Core Types & Event Definitions

**Estimated: 1 hour**

Define TypeScript types for plans, tasks, events, and workers.

#### 1.1 Plan Types (`src/types/plan.ts`)

```typescript
export type PlanStatus = 
  | 'pending'      // Created, not yet started
  | 'approved'     // Approved, ready to run
  | 'running'      // Tasks in progress
  | 'completed'    // All tasks finished
  | 'failed';      // Plan failed

export type TaskStatus = 
  | 'pending'      // Waiting for dependencies
  | 'ready'        // Dependencies satisfied
  | 'running'      // Worker executing
  | 'completed'    // Finished successfully
  | 'failed';      // Task failed

export type WorkerType = 
  | 'fetch-worker'
  | 'file-worker'
  | 'ai-worker';

export interface TaskDefinition {
  id: string;                    // e.g., "TASK-001"
  name: string;                  // e.g., "Fetch RSS Feeds"
  worker: WorkerType;
  dependsOn: string[];           // Task IDs this depends on
  config: Record<string, unknown>;
  input?: string[];              // File paths for input
  output: string;                // Output file path
}

export interface PlanTemplate {
  templateId: string;            // e.g., "TODAYS-NEWS"
  name: string;
  description: string;
  schedule?: string;             // Cron expression
  approval: 'auto' | 'always' | 'dangerous-only';
  version: string;
  tasks: TaskDefinition[];
  resultSchema: {
    format: 'markdown' | 'json';
    sections?: string[];
  };
}

export interface TaskInstance extends TaskDefinition {
  status: TaskStatus;
  worker?: string;               // Worker instance that claimed it
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retries: number;
}

export interface PlanInstance {
  planId: string;                // e.g., "TODAYS-NEWS-2026-01-27"
  templateId: string;
  status: PlanStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  trigger: 'manual' | 'schedule';
  tasks: TaskInstance[];
  eventLog: EventLogEntry[];
}

export interface EventLogEntry {
  timestamp: Date;
  event: string;
  data: Record<string, unknown>;
}
```

#### 1.2 Event Types (`src/inngest/events.ts`)

```typescript
import { z } from 'zod';

// Event schemas for type safety
export const PlanCreatedSchema = z.object({
  planId: z.string(),
  templateId: z.string(),
  runPath: z.string(),
});

export const TaskReadySchema = z.object({
  planId: z.string(),
  taskId: z.string(),
  worker: z.enum(['fetch-worker', 'file-worker', 'ai-worker']),
  config: z.record(z.unknown()),
  input: z.array(z.string()).optional(),
  output: z.string(),
  runPath: z.string(),
});

export const TaskCompletedSchema = z.object({
  planId: z.string(),
  taskId: z.string(),
  output: z.string(),
  runPath: z.string(),
});

export const TaskFailedSchema = z.object({
  planId: z.string(),
  taskId: z.string(),
  error: z.string(),
  runPath: z.string(),
});

// Event name constants
export const EVENTS = {
  PLAN_CREATED: 'conductor/plan.created',
  PLAN_COMPLETED: 'conductor/plan.completed',
  TASK_READY: 'conductor/task.ready',
  TASK_CLAIMED: 'conductor/task.claimed',
  TASK_COMPLETED: 'conductor/task.completed',
  TASK_FAILED: 'conductor/task.failed',
} as const;
```

---

### Phase 2: Inngest Infrastructure

**Estimated: 2 hours**

Set up Inngest client, dev server, and core event handlers.

#### 2.1 Inngest Client (`src/inngest/client.ts`)

```typescript
import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'hs-conductor',
  name: 'Conductor',
});
```

#### 2.2 Express Server for Inngest (`src/inngest/serve.ts`)

```typescript
import express from 'express';
import { serve } from 'inngest/express';
import { inngest } from './client.js';
import { allFunctions } from './functions.js';

export function startInngestServer(port = 3333) {
  const app = express();
  
  app.use(
    '/api/inngest',
    serve({
      client: inngest,
      functions: allFunctions,
    })
  );
  
  app.listen(port, () => {
    console.log(`Inngest server listening on http://localhost:${port}`);
    console.log(`Run: npx inngest-cli@latest dev -u http://localhost:${port}/api/inngest`);
  });
  
  return app;
}
```

#### 2.3 Task Manager Function (`src/inngest/functions.ts`)

The Task Manager listens for task completions and dispatches next tasks:

```typescript
import { inngest } from './client.js';
import { EVENTS } from './events.js';
import { updateTaskStatus, getPlan, getReadyTasks } from '../lib/file-storage.js';

export const taskManager = inngest.createFunction(
  {
    id: 'task-manager',
    concurrency: { limit: 1 }, // Only one task manager at a time
  },
  { event: EVENTS.TASK_COMPLETED },
  async ({ event, step }) => {
    const { planId, taskId, runPath } = event.data;

    // Update task status
    await step.run('update-task-status', async () => {
      await updateTaskStatus(runPath, taskId, 'completed');
    });

    // Check for newly ready tasks
    const readyTasks = await step.run('check-ready-tasks', async () => {
      return getReadyTasks(runPath);
    });

    // Dispatch ready tasks
    for (const task of readyTasks) {
      await step.sendEvent(`dispatch-${task.id}`, {
        name: EVENTS.TASK_READY,
        data: {
          planId,
          taskId: task.id,
          worker: task.worker,
          config: task.config,
          input: task.input,
          output: task.output,
          runPath,
        },
      });
    }

    // Check if plan is complete
    const plan = await step.run('check-plan-complete', async () => {
      return getPlan(runPath);
    });

    const allComplete = plan.tasks.every(t => t.status === 'completed');
    if (allComplete) {
      await step.sendEvent('plan-complete', {
        name: EVENTS.PLAN_COMPLETED,
        data: { planId, runPath },
      });
    }

    return { dispatched: readyTasks.length, complete: allComplete };
  }
);
```

---

### Phase 3: Workers Implementation

**Estimated: 3 hours**

Implement the three worker types needed for the POC.

#### 3.1 Fetch Worker (`src/workers/fetch-worker.ts`)

Handles HTTP requests, RSS parsing, and API calls.

```typescript
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { writeAsset } from '../lib/file-storage.js';

export const fetchWorker = inngest.createFunction(
  {
    id: 'fetch-worker',
    concurrency: { limit: 3 }, // Max 3 parallel fetches
    retries: 3,
  },
  { 
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "fetch-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, output, runPath } = TaskReadySchema.parse(event.data);

    const result = await step.run('fetch-data', async () => {
      // Determine fetch type from config
      if (config.sources) {
        // RSS feed fetching
        return fetchRssFeeds(config.sources as string[]);
      } else if (config.subreddits) {
        // Reddit API
        return fetchReddit(config.subreddits as string[]);
      } else if (config.endpoint === 'top-stories') {
        // Hacker News API
        return fetchHackerNews(config.limit as number || 30);
      }
      throw new Error(`Unknown fetch config: ${JSON.stringify(config)}`);
    });

    await step.run('write-output', async () => {
      await writeAsset(runPath, output, result);
    });

    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return { itemCount: result.length };
  }
);

async function fetchRssFeeds(sources: string[]): Promise<NewsItem[]> {
  // Implementation: fetch and parse RSS feeds
  const items: NewsItem[] = [];
  for (const source of sources) {
    const url = RSS_SOURCES[source];
    if (!url) continue;
    const response = await fetch(url);
    const xml = await response.text();
    items.push(...parseRss(xml, source));
  }
  return items;
}

async function fetchReddit(subreddits: string[]): Promise<NewsItem[]> {
  // Implementation: fetch from Reddit JSON API
  const items: NewsItem[] = [];
  for (const sub of subreddits) {
    const response = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`);
    const data = await response.json();
    items.push(...parseReddit(data, sub));
  }
  return items;
}

async function fetchHackerNews(limit: number): Promise<NewsItem[]> {
  // Implementation: fetch from HN API
  const idsResponse = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids = await idsResponse.json();
  const items: NewsItem[] = [];
  for (const id of ids.slice(0, limit)) {
    const itemResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    const item = await itemResponse.json();
    items.push(parseHNItem(item));
  }
  return items;
}
```

#### 3.2 File Worker (`src/workers/file-worker.ts`)

Handles file aggregation and transformation.

```typescript
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { readAsset, writeAsset } from '../lib/file-storage.js';

export const fileWorker = inngest.createFunction(
  {
    id: 'file-worker',
    concurrency: { limit: 3 },
    retries: 2,
  },
  { 
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "file-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, input, output, runPath } = TaskReadySchema.parse(event.data);

    const result = await step.run('aggregate-files', async () => {
      if (!input || input.length === 0) {
        throw new Error('File worker requires input files');
      }

      // Read all input files
      const allItems: NewsItem[] = [];
      for (const inputPath of input) {
        const data = await readAsset(runPath, inputPath);
        allItems.push(...data);
      }

      // Deduplicate by URL
      const seen = new Set<string>();
      const unique = allItems.filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      });

      // Sort by timestamp (newest first)
      unique.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return unique;
    });

    await step.run('write-output', async () => {
      await writeAsset(runPath, output, result);
    });

    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return { itemCount: result.length };
  }
);
```

#### 3.3 AI Worker (`src/workers/ai-worker.ts`)

Handles LLM calls using GitHub Copilot SDK for summarization.

```typescript
import { CopilotClient } from '@github/copilot-sdk';
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { readAsset, writeResult } from '../lib/file-storage.js';

// Singleton Copilot client
let copilotClient: CopilotClient | null = null;

async function getCopilotClient(): Promise<CopilotClient> {
  if (!copilotClient) {
    copilotClient = new CopilotClient();
    await copilotClient.start();
  }
  return copilotClient;
}

export const aiWorker = inngest.createFunction(
  {
    id: 'ai-worker',
    concurrency: { limit: 1 }, // Only 1 AI call at a time
    retries: 2,
  },
  { 
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "ai-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, input, output, runPath } = TaskReadySchema.parse(event.data);

    const inputData = await step.run('read-input', async () => {
      if (!input || input.length === 0) {
        throw new Error('AI worker requires input');
      }
      return readAsset(runPath, input[0]);
    });

    const summary = await step.run('generate-summary', async () => {
      const client = await getCopilotClient();
      const model = (config.model as string) || process.env.COPILOT_MODEL || 'claude-sonnet-4.5';
      const prompt = config.prompt as string;
      
      const session = await client.createSession({ model });
      
      try {
        const systemPrompt = `You are a news summarizer. Given a list of news items, 
create a well-organized markdown summary with:
1. Top 10 most important stories
2. Stories grouped by category
3. Trending topics

Be concise but informative. Include links to original sources.`;

        const userPrompt = `${prompt}

News items to summarize:
${JSON.stringify(inputData, null, 2)}`;

        await session.send({ prompt: `${systemPrompt}\n\n${userPrompt}` });
        const messages = await session.getMessages();
        return messages[messages.length - 1]?.content || 'No summary generated';
      } finally {
        await session.close();
      }
    });

    await step.run('write-result', async () => {
      const markdown = formatResultMarkdown(planId, summary);
      await writeResult(runPath, output, markdown);
    });

    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return { success: true };
  }
);

function formatResultMarkdown(planId: string, summary: string): string {
  return `# ${planId} - Results

Generated: ${new Date().toISOString()}
Model: GitHub Copilot SDK

---

${summary}
`;
}
```

---

### Phase 4: CLI Commands

**Estimated: 2 hours**

Implement the CLI interface following HemSoft standards.

#### 4.1 Main Entry Point (`src/index.ts`)

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { showBanner } from './lib/banner.js';
import { runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { listCommand } from './commands/list.js';
import { templatesCommand } from './commands/templates.js';
import { devCommand } from './commands/dev.js';

const program = new Command();

program
  .name('conductor')
  .description('Event-driven multi-agent orchestration CLI')
  .version('0.1.0');

program
  .command('run <template>')
  .description('Run a plan from a template')
  .option('--approval <mode>', 'Approval mode: auto|always|dangerous-only', 'auto')
  .action(runCommand);

program
  .command('status [plan-id]')
  .description('Check status of a plan (latest if no ID)')
  .action(statusCommand);

program
  .command('list')
  .description('List all plan runs')
  .option('-n, --limit <n>', 'Limit results', '10')
  .action(listCommand);

program
  .command('templates')
  .description('List available plan templates')
  .action(templatesCommand);

program
  .command('dev')
  .description('Start Inngest dev server')
  .option('-p, --port <port>', 'Server port', '3333')
  .action(devCommand);

// Show banner before help
program.addHelpText('beforeAll', () => {
  showBanner({ version: 'v0.1.0', showTaglines: true });
  return '';
});

program.parse();
```

#### 4.2 Run Command (`src/commands/run.ts`)

```typescript
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { inngest } from '../inngest/client.js';
import { EVENTS } from '../inngest/events.js';
import { loadTemplate, instantiatePlan } from '../lib/plan-instantiator.js';
import { getReadyTasks } from '../lib/file-storage.js';

interface RunOptions {
  approval: 'auto' | 'always' | 'dangerous-only';
}

export async function runCommand(templateName: string, options: RunOptions) {
  const spinner = ora();

  try {
    // Load template
    spinner.start(`Loading template: ${templateName}`);
    const template = await loadTemplate(templateName);
    spinner.succeed(`Template loaded: ${template.name}`);

    // Create plan instance
    spinner.start('Creating plan instance...');
    const { planId, runPath } = await instantiatePlan(template);
    spinner.succeed(`Plan created: ${planId}`);

    console.log(boxen(
      chalk.cyan(`Plan ID: ${planId}\nPath: ${runPath}`),
      { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));

    // Send plan.created event
    spinner.start('Dispatching to Inngest...');
    await inngest.send({
      name: EVENTS.PLAN_CREATED,
      data: { planId, templateId: template.templateId, runPath },
    });

    // Get initial ready tasks (those with no dependencies)
    const readyTasks = await getReadyTasks(runPath);
    
    // Dispatch initial tasks
    for (const task of readyTasks) {
      await inngest.send({
        name: EVENTS.TASK_READY,
        data: {
          planId,
          taskId: task.id,
          worker: task.worker,
          config: task.config,
          input: task.input,
          output: task.output,
          runPath,
        },
      });
    }

    spinner.succeed(`Plan running! ${readyTasks.length} tasks dispatched.`);

    console.log('');
    console.log(chalk.dim('Check status with:'), chalk.cyan(`conductor status ${planId}`));
    console.log(chalk.dim('View Inngest dashboard:'), chalk.cyan('http://localhost:2901'));

  } catch (error) {
    spinner.fail('Failed to run plan');
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}
```

#### 4.3 Status Command (`src/commands/status.ts`)

```typescript
import chalk from 'chalk';
import Table from 'cli-table3';
import { getPlan, getLatestPlanId } from '../lib/file-storage.js';

export async function statusCommand(planId?: string) {
  try {
    const id = planId || await getLatestPlanId();
    if (!id) {
      console.log(chalk.yellow('No plans found. Run one with: conductor run <template>'));
      return;
    }

    const plan = await getPlan(`data/runs/${id}`);

    // Plan header
    console.log('');
    console.log(chalk.bold(`Plan: ${plan.planId}`));
    console.log(chalk.dim(`Template: ${plan.templateId}`));
    console.log(chalk.dim(`Status: `) + statusBadge(plan.status));
    console.log(chalk.dim(`Created: ${plan.createdAt}`));
    console.log('');

    // Task table
    const table = new Table({
      head: [
        chalk.cyan('Task'),
        chalk.cyan('Worker'),
        chalk.cyan('Status'),
        chalk.cyan('Duration'),
      ],
      style: { head: [], border: ['cyan'] },
    });

    for (const task of plan.tasks) {
      const duration = task.completedAt && task.startedAt
        ? `${((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000).toFixed(1)}s`
        : '—';

      table.push([
        task.id,
        task.worker,
        statusBadge(task.status),
        duration,
      ]);
    }

    console.log(table.toString());

    // If complete, show result path
    if (plan.status === 'completed') {
      console.log('');
      console.log(chalk.green('✓ Plan completed!'));
      console.log(chalk.dim('Result:'), chalk.cyan(`data/runs/${id}/results/RESULT.md`));
    }

  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
    process.exit(1);
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'completed': return chalk.green('✓ completed');
    case 'running': return chalk.yellow('⟳ running');
    case 'ready': return chalk.blue('● ready');
    case 'pending': return chalk.dim('○ pending');
    case 'failed': return chalk.red('✗ failed');
    default: return chalk.dim(status);
  }
}
```

#### 4.4 Dev Command (`src/commands/dev.ts`)

```typescript
import chalk from 'chalk';
import { spawn } from 'child_process';
import { startInngestServer } from '../inngest/serve.js';

interface DevOptions {
  port: string;
}

export async function devCommand(options: DevOptions) {
  const port = parseInt(options.port, 10);

  console.log(chalk.cyan('Starting Conductor development environment...'));
  console.log('');

  // Start our Express server
  startInngestServer(port);

  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Start Inngest dev server
  console.log(chalk.cyan('Starting Inngest dev server...'));
  const inngestDev = spawn('npx', [
    'inngest-cli@latest',
    'dev',
    '-u',
    `http://localhost:${port}/api/inngest`,
  ], {
    stdio: 'inherit',
    shell: true,
  });

  inngestDev.on('error', (err) => {
    console.error(chalk.red('Failed to start Inngest dev server:'), err.message);
  });

  console.log('');
  console.log(chalk.green('Development environment ready!'));
  console.log('');
  console.log(chalk.dim('Conductor API:'), chalk.cyan(`http://localhost:${port}/api/inngest`));
  console.log(chalk.dim('Inngest Dashboard:'), chalk.cyan('http://localhost:2901'));
  console.log('');
  console.log(chalk.dim('Run a plan:'), chalk.cyan('conductor run TODAYS-NEWS'));
}
```

---

### Phase 5: Plan Template

**Estimated: 30 minutes**

Create the "Today's News" template.

#### 5.1 Template File (`data/templates/TODAYS-NEWS.template.md`)

```markdown
# Template: Today's News

## Metadata
- Template-ID: TODAYS-NEWS
- Schedule: "0 6 * * *"
- Approval: auto
- Version: 1.0

## Description
Fetches news from multiple sources, aggregates, deduplicates, and produces a daily digest with AI-powered summarization.

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
  - model: openai/gpt-4o-mini
  - prompt: "Analyze these news items and create a summary with: 1) Top 10 most important stories, 2) Stories by category, 3) Trending topics. Be concise but informative."
- Input: [assets/aggregated.json]
- Output: results/RESULT.md

## Result Schema
- Format: markdown
- Sections: [top-stories, by-category, trending-topics]
```

---

### Phase 6: Testing & Verification

**Estimated: 1 hour**

#### 6.1 Manual Testing Checklist

- [ ] Start dev environment: `conductor dev`
- [ ] Verify Inngest dashboard accessible at http://localhost:2901
- [ ] Run plan: `conductor run TODAYS-NEWS`
- [ ] Verify TASK-001, 002, 003 start in parallel
- [ ] Verify TASK-004 waits for all three to complete
- [ ] Verify TASK-005 waits for TASK-004
- [ ] Check final RESULT.md output
- [ ] Check status: `conductor status`
- [ ] List runs: `conductor list`

#### 6.2 Expected Output Structure

After successful run:
```
data/runs/TODAYS-NEWS-2026-01-27/
├── PLAN.md                    # Updated with completion status
├── tasks/
│   ├── TASK-001-fetch-rss.md      # status: completed
│   ├── TASK-002-fetch-reddit.md   # status: completed
│   ├── TASK-003-fetch-hackernews.md # status: completed
│   ├── TASK-004-aggregate.md      # status: completed
│   └── TASK-005-summarize.md      # status: completed
├── assets/
│   ├── rss-raw.json           # ~50 items
│   ├── reddit-raw.json        # ~75 items
│   ├── hackernews-raw.json    # 30 items
│   └── aggregated.json        # ~100 deduplicated items
└── results/
    └── RESULT.md              # AI-generated summary
```

---

## Phase 7: Repository Sanitization (Pre-Release)

**Estimated: 11.5 hours**

Before presenting to a wider audience, separate personal workloads from example workloads.

See [SANITIZATION-STRATEGY.md](./SANITIZATION-STRATEGY.md) for complete details.

### 7.1 Directory Restructure (1 hour)

**Create new structure:**
```
workloads/
├── examples/     # ✅ Checked into git - showcase workloads
│   ├── ad-hoc/
│   ├── tasks/
│   └── workflows/
└── personal/     # ❌ Gitignored - private workloads
    ├── ad-hoc/
    ├── tasks/
    └── workflows/
```

**Migration:**
- [ ] Create `examples/` and `personal/` directory trees
- [ ] Move `joke.yaml`, `weather.yaml`, `news-digest.yaml` → `examples/`
- [ ] Move `egg-inc-cm.yaml`, `skill-test.yaml` → `personal/`
- [ ] Update `.gitignore` to exclude `workloads/personal/`, `data/runs/`, `data/schedules/`

### 7.2 Code Updates (2 hours)

- [ ] Update `workload-loader.ts` to search both `examples/` and `personal/`
- [ ] Add `--examples-only` and `--personal-only` flags to `conductor list`
- [ ] Update catalog indexer to separate example vs personal
- [ ] Test workload loading from both directories

### 7.3 Backup Strategy (30 minutes)

**Recommended: OneDrive Symlink**
```powershell
# Symlink personal workloads to OneDrive
New-Item -ItemType SymbolicLink `
  -Path "workloads\personal" `
  -Target "F:\OneDrive\User-Backup\conductor-workloads"
```

Alternative: Document private git repo or encrypted archive approach.

### 7.4 New Example Workloads (3 hours)

Create compelling examples that showcase capabilities:

- [ ] `code-review.yaml` - Developer workflow (git diff → AI analysis)
- [ ] `github-activity.yaml` - API integration (GitHub API → summary)
- [ ] `morning-brief.yaml` - Complex workflow (weather + news + calendar)
- [ ] `translate.yaml` - Input validation showcase
- [ ] `sentiment.yaml` - Text analysis demonstration

### 7.5 Documentation Overhaul (3 hours)

- [ ] Create `docs/EXAMPLES.md` - Detailed guide to each example (DONE ✅)
- [ ] Create `CONTRIBUTING.md` - How to create custom workloads
- [ ] Update README with "Quick Start" and "Example Showcase" sections
- [ ] Add architecture diagrams using Mermaid
- [ ] Record demo GIFs for top 3 examples

### 7.6 Onboarding Features (2 hours)

- [ ] Add first-run detection
- [ ] Create `conductor examples` command (interactive picker)
- [ ] Add `conductor init` for personal workload setup
- [ ] Improve `conductor --help` with clearer examples

### Success Criteria

- [ ] New user can run first example in < 5 minutes after clone
- [ ] No personal data visible in public repo
- [ ] All example workloads execute successfully
- [ ] Personal workloads backed up and functional
- [ ] README attracts interest with clear value proposition

---

## Configuration

### Environment Variables

```bash
# Inngest (generate with: openssl rand -hex 32)
INNGEST_EVENT_KEY=your-event-key-here
INNGEST_SIGNING_KEY=your-signing-key-here
INNGEST_BASE_URL=http://localhost:2901
INNGEST_DEV=0

# GitHub Copilot SDK (uses Copilot CLI authentication)
# No API key needed - uses existing Copilot subscription
COPILOT_MODEL=claude-sonnet-4.5

# Optional
CONDUCTOR_DATA_PATH=./data        # Default: ./data
CONDUCTOR_PORT=3333               # Default: 3333
```

### Config File (`~/.conductor/config.json`)

```json
{
  "dataPath": "./data",
  "defaultApproval": "auto",
  "maxConcurrentWorkers": 3,
  "copilotModel": "claude-sonnet-4.5"
}
```

---

## Success Criteria

| Criterion | Metric |
|-----------|--------|
| **Event flow works** | Events visible in Inngest dashboard |
| **Parallel execution** | Tasks 001-003 start within 1 second of each other |
| **Dependency resolution** | Task 004 only starts after 001-003 complete |
| **State persistence** | All .md and .json files created correctly |
| **Result quality** | RESULT.md contains valid markdown summary |
| **Error handling** | Failed tasks show error in status command |
| **CLI usability** | All commands work as documented |

---

## Future Enhancements

### Post-Sanitization (Phase 7+)

1. **Schedule Agent** - Inngest cron function to auto-trigger templates
2. **Approval Gates** - Pause before dangerous tasks, wait for CLI/UI approval
3. **Cross-Plan Dependencies** - Plan B waits for Plan A
4. **Dashboard Integration** - Widget and page in main Dashboard app
5. **More Workers** - Browser worker (Playwright), Database worker, Notification worker
6. **Retry UI** - Retry failed tasks from CLI
7. **Real-time Updates** - WebSocket for live status in CLI

### Community Features

1. **Example Gallery Website** - GitHub Pages showcasing all examples with demos
2. **Workload Marketplace** - Community-contributed workloads with ratings
3. **Template Generator** - CLI wizard to scaffold new workloads
4. **Testing Framework** - Validate example workloads in CI
5. **Visual Workflow Builder** - Drag-and-drop in admin dashboard

---

## Timeline Estimate

| Phase | Duration | Cumulative | Prerequisites |
|-------|----------|------------|---------------|
| Phase 0: Setup | 30 min | 30 min | - |
| Phase 1: Types | 1 hour | 1.5 hours | Phase 0 |
| Phase 2: Inngest | 2 hours | 3.5 hours | Phase 1 |
| Phase 3: Workers | 3 hours | 6.5 hours | Phase 2 |
| Phase 4: CLI | 2 hours | 8.5 hours | Phase 3 |
| Phase 5: Template | 30 min | 9 hours | Phase 4 |
| Phase 6: Testing | 1 hour | **10 hours** | Phase 5 |
| **Phase 7: Sanitization** | **11.5 hours** | **21.5 hours** | Phase 6 ✅ |

**POC Complete:** ~10 hours (can be done in 2-3 focused sessions)  
**Public-Ready:** ~21.5 hours total (includes sanitization for wider audience)

---

## Quick Start (After Implementation)

```powershell
# In one terminal - start development environment
conductor dev

# In another terminal - run the POC plan
conductor run TODAYS-NEWS

# Watch status
conductor status

# View result when complete
cat data/runs/TODAYS-NEWS-*/results/RESULT.md
```

---

*Created: 2026-01-27*
*Author: HemSoft Developments*
