/**
 * Workload Executor
 *
 * Executes workloads by dispatching them to the appropriate handlers.
 */
import { inngest } from '../inngest/client.js';
import { EVENTS } from '../inngest/events.js';
import { getWorkload } from './workload-loader.js';
import { createManifest, writeManifest } from './run-manifest.js';
import type {
  AdHocDefinition,
  TaskDefinition,
  WorkflowDefinition,
  WorkloadInstance,
} from '../types/workload.js';

/**
 * Generate a human-readable timestamp for instance IDs (local timezone)
 * Format: YYYY-MM-DD-HHmmss (e.g., 2026-01-28-014630)
 */
function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/**
 * Execute a workload by ID
 */
export async function executeWorkload(
  workloadId: string,
  input: Record<string, unknown> = {},
  createdBy: string = 'manual'
): Promise<WorkloadInstance> {
  const definition = getWorkload(workloadId);

  if (!definition) {
    throw new Error(`Workload not found: ${workloadId}`);
  }

  const instanceId = `${workloadId}-${generateTimestamp()}`;
  const runPath = `data/runs/${instanceId}`;

  const instance: WorkloadInstance = {
    instanceId,
    definitionId: workloadId,
    status: 'pending',
    input,
    startedAt: new Date(),
  };

  // Create run directory and manifest
  const manifest = createManifest(instanceId, definition, input, createdBy);
  await writeManifest(runPath, manifest);
  console.log(`[executor] Created manifest: ${runPath}/run.json`);

  // Dispatch based on type
  switch (definition.type) {
    case 'ad-hoc':
      await executeAdHoc(definition, instance, runPath);
      break;
    case 'task':
      await executeTask(definition, instance, runPath);
      break;
    case 'workflow':
      await executeWorkflow(definition, instance, runPath);
      break;
  }

  return instance;
}

/**
 * Execute an ad-hoc workload (single AI call)
 */
async function executeAdHoc(
  definition: AdHocDefinition,
  instance: WorkloadInstance,
  runPath: string
): Promise<void> {
  // Interpolate input into prompt
  let prompt = definition.prompt;
  for (const [key, value] of Object.entries(instance.input)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }

  const outputFormat = definition.output?.format || 'text';

  // Send directly to AI worker
  await inngest.send({
    name: EVENTS.TASK_READY,
    data: {
      planId: instance.instanceId,
      taskId: 'ad-hoc-001',
      worker: 'ai-worker',
      config: {
        prompt,
        model: definition.model,
        outputFormat,
      },
      input: [],
      output: `result.${outputFormat === 'json' ? 'json' : 'md'}`,
      runPath,
    },
  });
}

/**
 * Execute a task workload (sequential steps)
 */
async function executeTask(
  definition: TaskDefinition,
  instance: WorkloadInstance,
  runPath: string
): Promise<void> {
  // For tasks, we send a plan.created event and let task-manager handle sequencing
  await inngest.send({
    name: EVENTS.PLAN_CREATED,
    data: {
      planId: instance.instanceId,
      templateId: definition.id,
      runPath,
      steps: definition.steps,
    },
  });
}

/**
 * Execute a workflow (complex with conditionals)
 */
async function executeWorkflow(
  definition: WorkflowDefinition,
  instance: WorkloadInstance,
  runPath: string
): Promise<void> {
  // For workflows, same pattern but with dependency tracking
  await inngest.send({
    name: EVENTS.PLAN_CREATED,
    data: {
      planId: instance.instanceId,
      templateId: definition.id,
      runPath,
      steps: definition.steps,
      isWorkflow: true,
    },
  });
}
