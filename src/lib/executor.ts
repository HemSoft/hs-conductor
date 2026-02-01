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
  WorkloadDefinition,
  WorkloadInstance,
} from '../types/workload.js';
import { isPromptWorkload, hasParallelSteps } from '../types/workload.js';

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

  // Dispatch based on structure
  if (isPromptWorkload(definition)) {
    await executePromptWorkload(definition, instance, runPath);
  } else if (definition.steps && definition.steps.length > 0) {
    await executeStepWorkload(definition, instance, runPath);
  }

  return instance;
}

/**
 * Execute a prompt-based workload (single AI call)
 */
async function executePromptWorkload(
  definition: WorkloadDefinition,
  instance: WorkloadInstance,
  runPath: string
): Promise<void> {
  // Interpolate input into prompt
  let prompt = definition.prompt!;
  for (const [key, value] of Object.entries(instance.input)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }

  const outputFormat = definition.output?.format || 'text';

  // Send directly to AI worker
  await inngest.send({
    name: EVENTS.TASK_READY,
    data: {
      planId: instance.instanceId,
      taskId: 'prompt-001',
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
 * Execute a step-based workload (sequential or parallel)
 */
async function executeStepWorkload(
  definition: WorkloadDefinition,
  instance: WorkloadInstance,
  runPath: string
): Promise<void> {
  // Send a plan.created event and let task-manager handle sequencing/parallel execution
  await inngest.send({
    name: EVENTS.PLAN_CREATED,
    data: {
      planId: instance.instanceId,
      templateId: definition.id,
      runPath,
      steps: definition.steps,
      input: instance.input, // Pass input for variable interpolation
      // Has parallel execution if any step has dependsOn or parallel flag
      isWorkflow: hasParallelSteps(definition),
    },
  });
}
