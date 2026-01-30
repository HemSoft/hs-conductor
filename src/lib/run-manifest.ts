/**
 * Run Manifest Management
 *
 * Handles creation and updates of run.json manifest files.
 * The manifest makes each run folder self-documenting.
 */

import { join } from 'path';
import type {
  RunManifest,
  RunOutputRecord,
  RunStatus,
  StepStatus,
  WorkloadDefinition,
  TaskStep,
  WorkflowStep,
} from '../types/workload.js';

const MANIFEST_FILENAME = 'run.json';

/**
 * Create initial manifest for a new run
 */
export function createManifest(
  instanceId: string,
  definition: WorkloadDefinition,
  input: Record<string, unknown>,
  createdBy: string = 'manual'
): RunManifest {
  const manifest: RunManifest = {
    instanceId,
    workloadId: definition.id,
    workloadName: definition.name,
    workloadType: definition.type,
    status: 'pending',
    startedAt: new Date().toISOString(),
    input,
    outputs: [],
    version: definition.version,
    createdBy,
  };

  // Initialize steps for tasks/workflows
  if (definition.type === 'task' || definition.type === 'workflow') {
    const steps = definition.steps as (TaskStep | WorkflowStep)[];
    manifest.steps = steps.map((step) => ({
      id: step.id,
      name: step.name,
      worker: step.worker,
      status: 'pending' as StepStatus,
      output: step.output,
    }));

    // Determine primary output (last step's output)
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      manifest.primaryOutput = lastStep.output;
    }
  }

  // For ad-hoc, set the expected output
  if (definition.type === 'ad-hoc') {
    const format = definition.output?.format || 'text';
    const outputFile = `result.${format === 'json' ? 'json' : 'md'}`;
    manifest.primaryOutput = outputFile;
  }

  return manifest;
}

/**
 * Read manifest from a run folder
 */
export async function readManifest(runPath: string): Promise<RunManifest | null> {
  try {
    const manifestPath = join(runPath, MANIFEST_FILENAME);
    const file = Bun.file(manifestPath);
    if (!(await file.exists())) {
      return null;
    }
    const content = await file.text();
    return JSON.parse(content) as RunManifest;
  } catch (err) {
    console.error('[run-manifest] Error reading manifest:', err);
    return null;
  }
}

/**
 * Write manifest to a run folder
 */
export async function writeManifest(runPath: string, manifest: RunManifest): Promise<void> {
  const manifestPath = join(runPath, MANIFEST_FILENAME);
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Update run status
 */
export async function updateRunStatus(
  runPath: string,
  status: RunStatus,
  error?: string
): Promise<void> {
  const manifest = await readManifest(runPath);
  if (!manifest) {
    console.warn('[run-manifest] Cannot update status - manifest not found:', runPath);
    return;
  }

  manifest.status = status;
  
  if (status === 'running' && !manifest.startedAt) {
    manifest.startedAt = new Date().toISOString();
  }

  if (status === 'completed' || status === 'failed') {
    manifest.completedAt = new Date().toISOString();
    manifest.duration = new Date(manifest.completedAt).getTime() - new Date(manifest.startedAt).getTime();
  }

  if (error) {
    manifest.error = error;
  }

  await writeManifest(runPath, manifest);
}

/**
 * Update step status
 */
export async function updateStepStatus(
  runPath: string,
  stepId: string,
  status: StepStatus,
  error?: string
): Promise<void> {
  const manifest = await readManifest(runPath);
  if (!manifest || !manifest.steps) {
    console.warn('[run-manifest] Cannot update step - manifest or steps not found:', runPath);
    return;
  }

  const step = manifest.steps.find((s) => s.id === stepId);
  if (!step) {
    console.warn('[run-manifest] Step not found:', stepId);
    return;
  }

  step.status = status;

  if (status === 'running') {
    step.startedAt = new Date().toISOString();
  }

  if (status === 'completed' || status === 'failed') {
    step.completedAt = new Date().toISOString();
    if (step.startedAt) {
      step.duration = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
    }
  }

  if (error) {
    step.error = error;
  }

  await writeManifest(runPath, manifest);
}

/**
 * Record an output file
 */
export async function recordOutput(
  runPath: string,
  output: RunOutputRecord
): Promise<void> {
  const manifest = await readManifest(runPath);
  if (!manifest) {
    console.warn('[run-manifest] Cannot record output - manifest not found:', runPath);
    return;
  }

  // Remove existing entry for same file if present
  manifest.outputs = manifest.outputs.filter((o) => o.file !== output.file);
  manifest.outputs.push(output);

  await writeManifest(runPath, manifest);
}

/**
 * Mark run as started
 */
export async function markRunStarted(runPath: string): Promise<void> {
  await updateRunStatus(runPath, 'running');
}

/**
 * Mark run as completed
 */
export async function markRunCompleted(runPath: string): Promise<void> {
  await updateRunStatus(runPath, 'completed');
}

/**
 * Mark run as failed
 */
export async function markRunFailed(runPath: string, error: string): Promise<void> {
  await updateRunStatus(runPath, 'failed', error);
}

/**
 * Get the primary output file path
 */
export async function getPrimaryOutput(runPath: string): Promise<string | null> {
  const manifest = await readManifest(runPath);
  if (!manifest?.primaryOutput) {
    return null;
  }
  return join(runPath, manifest.primaryOutput);
}

/**
 * Get all output files
 */
export async function getAllOutputs(runPath: string): Promise<RunOutputRecord[]> {
  const manifest = await readManifest(runPath);
  return manifest?.outputs || [];
}

/**
 * Check if a run is complete
 */
export async function isRunComplete(runPath: string): Promise<boolean> {
  const manifest = await readManifest(runPath);
  return manifest?.status === 'completed' || manifest?.status === 'failed';
}

/**
 * Get run summary for display
 */
export async function getRunSummary(runPath: string): Promise<{
  instanceId: string;
  workloadName: string;
  status: RunStatus;
  duration?: number;
  outputCount: number;
  primaryOutput?: string;
} | null> {
  const manifest = await readManifest(runPath);
  if (!manifest) {
    return null;
  }

  return {
    instanceId: manifest.instanceId,
    workloadName: manifest.workloadName,
    status: manifest.status,
    duration: manifest.duration,
    outputCount: manifest.outputs.length,
    primaryOutput: manifest.primaryOutput,
  };
}

// Alias for clearer naming when used in workers
export { updateStepStatus as updateManifestStepStatus };
