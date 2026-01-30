# Copilot Instructions for hs-conductor

**Project Name**: hs-conductor (not hs-cli-conductor)

This project is an event-driven multi-agent orchestration system built with Inngest, Bun runtime, and GitHub Copilot SDK for AI inference.

## Restricted Files

The following files have exclusive ownership and must NOT be modified directly:

| File | Owner | Notes |
|------|-------|-------|
| `CHANGELOG.md` | `.claude/skills/version/` skill | All changelog updates go through the version skill |

## Guiding Principles

### Simplicity Over Cleverness

Use the simplest tool that accomplishes the task. Don't reach for complex solutions when simple ones suffice. Prefer explicit, readable code over clever abstractions.

### AI as a Last Resort

Only invoke AI when the task genuinely requires:

- Reasoning or decision-making
- Natural language understanding
- Content generation or transformation
- Pattern recognition beyond simple regex

DO NOT use AI for:

- Executing scripts or commands
- Simple data fetching
- File I/O operations
- Deterministic transformations

### Composable Primitives

Build complex workflows from simple, single-purpose workers:

- **exec-worker**: Run commands and executables (PowerShell, bash, .exe)
- **fetch-worker**: HTTP requests and API calls
- **file-worker**: File system operations
- **ai-worker**: Tasks requiring intelligence

Each worker should do one thing well. Combine them in `task` or `workflow` definitions.

### Clean Architecture

- **One method, one concern**: Each function should have a single, well-defined purpose
- **One class, a few concerns**: Classes should be cohesive but not overloaded
- **Separation of concerns**: Keep business logic, I/O, and orchestration separate
- **Small, focused files**: If a file exceeds 200-300 lines, consider splitting it

### Explicit Worker Selection

The workload definition should make it obvious which workers are involved:

- `ad-hoc`: Quick AI prompts (use sparingly for genuinely simple AI tasks)
- `task`: Sequential steps with explicit worker assignment
- `workflow`: Complex orchestration with dependencies

### Cost Consciousness

LLM tokens are a resource. Prefer deterministic workers (exec, fetch, file) for tasks that don't require intelligence. Track token usage and optimize prompts.

## Architecture

- **Runtime**: Bun 1.2+ (ES2022 modules, `type: "module"`)
- **Event Orchestration**: Inngest (local dev via `npx inngest-cli dev`)
- **AI**: GitHub Copilot SDK (`@github/copilot-sdk`) - uses your Copilot subscription
- **State**: File-based (Markdown plans, JSON assets in `data/runs/`)
- **Ports**: App server 2900, Inngest dashboard 2901

## GitHub Copilot SDK Integration

The SDK is **agentic** - it expects to use tools to accomplish tasks. Key patterns:

### Tool Definition (JSON Schema Required)

```typescript
// MUST use raw JSON Schema - Zod schemas don't have toJSONSchema()
const myTool: Tool<{ arg: string }> = {
  name: 'my_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      arg: { type: 'string', description: 'Argument description' }
    },
    required: ['arg']
  },
  handler: async ({ arg }) => {
    return { success: true, result: arg };
  }
};
```

### Session Configuration

```typescript
const session = await client.createSession({
  model: 'claude-sonnet-4.5', // or 'gpt-4o'
  tools: [myTool],
  systemMessage: {
    mode: 'replace', // Override default SDK behavior
    content: 'Your system prompt instructing tool usage'
  }
});
```

### Response Capture Pattern

- Define a `complete_task` tool for the agent to call with its response
- Use global state to capture tool invocation results
- Check `isTaskCompleted()` after `sendAndWait()` completes

## Code Patterns

### Event Definitions

- Define events in `src/inngest/events.ts` with Zod schemas
- Use `EVENTS` constant for event names: `EVENTS.TASK_READY`, `EVENTS.TASK_COMPLETED`
- Export inferred types: `export type TaskReadyEvent = z.infer<typeof TaskReadySchema>`

### Workers (Inngest Functions)

- Create workers with `inngest.createFunction()` in `src/workers/`
- Filter by worker type: `if: 'event.data.worker == "ai-worker"'`
- Use `step.run()` for all side effects (file I/O, API calls)
- Emit events via `step.sendEvent()`, not direct `inngest.send()`

### File Storage

- Use `src/lib/file-storage.ts` helpers: `readAsset()`, `writeResult()`, `updateTaskStatus()`
- Assets stored as JSON in `data/runs/{planId}/assets/`
- Results stored in `data/runs/{planId}/results/`

### Types

- Define all types in `src/types/plan.ts`
- Use string literal unions for status: `type TaskStatus = 'pending' | 'ready' | 'running'`
- Worker types: `'exec-worker' | 'fetch-worker' | 'file-worker' | 'ai-worker'`

## Conventions

- Use `.js` extensions in imports (required for ESM)
- Prefer `async/await` over callbacks
- Use `chalk` for CLI output colors, `ora` for spinners
- Environment config via `process.env` with sensible defaults
- Local Inngest dev: `npx inngest-cli dev --port 2901 -u http://localhost:2900/api/inngest`

## Dependencies

When adding dependencies, prefer: `inngest` for workflows, `zod` for validation, `commander` for CLI, `express` for serving Inngest functions.

## User Preferences

- **Testing**: The user prefers to run tests and scripts themselves. Do NOT run `run.ps1` or similar startup scripts - leave that to the user.
- **Implementation over testing**: Focus on making code changes; let the user verify them.
