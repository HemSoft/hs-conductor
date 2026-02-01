/**
 * Task Manager
 *
 * Orchestrates multi-step workloads by:
 * 1. Handling PLAN_CREATED events to initialize task tracking
 * 2. Handling TASK_COMPLETED events to dispatch next ready tasks
 *
 * Supports both sequential tasks (inputs depend on previous outputs)
 * and parallel tasks (no dependencies between them).
 */
import { inngest } from '../inngest/client.js';
import { EVENTS } from '../inngest/events.js';
import {
  markRunStarted,
  markRunCompleted,
  updateStepStatus,
} from '../lib/run-manifest.js';
import type { Step } from '../types/workload.js';

// Alias for clarity in task manager context
type TaskStep = Step;

interface PlanCreatedData {
  planId: string;
  templateId: string;
  runPath: string;
  steps: TaskStep[];
  input?: Record<string, unknown>;
  isWorkflow?: boolean;
}

interface TaskCompletedData {
  planId: string;
  taskId: string;
  output: string;
  runPath: string;
}

/**
 * In-memory tracking of plan states
 * Maps planId -> { steps, completedTasks, runPath, input }
 */
const planStates = new Map<
  string,
  {
    steps: TaskStep[];
    completedTasks: Set<string>;
    runPath: string;
    input: Record<string, unknown>;
  }
>();

/**
 * Interpolate {{variable}} placeholders in config values using input parameters
 */
function interpolateConfig(
  config: Record<string, unknown>,
  input: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      // Replace {{variable}} patterns with input values
      let interpolated = value;
      for (const [inputKey, inputValue] of Object.entries(input)) {
        interpolated = interpolated.replace(
          new RegExp(`\\{\\{\\s*${inputKey}\\s*\\}\\}`, 'g'),
          String(inputValue)
        );
      }
      result[key] = interpolated;
    } else if (Array.isArray(value)) {
      // Handle arrays of strings
      result[key] = value.map(item => {
        if (typeof item === 'string') {
          let interpolated = item;
          for (const [inputKey, inputValue] of Object.entries(input)) {
            interpolated = interpolated.replace(
              new RegExp(`\\{\\{\\s*${inputKey}\\s*\\}\\}`, 'g'),
              String(inputValue)
            );
          }
          return interpolated;
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      // Recursively interpolate nested objects
      result[key] = interpolateConfig(value as Record<string, unknown>, input);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Get tasks that are ready to execute (all dependencies satisfied)
 */
function getReadyTasks(
  steps: TaskStep[],
  completedTasks: Set<string>
): TaskStep[] {
  return steps.filter((step) => {
    // Already completed?
    if (completedTasks.has(step.id)) return false;

    // Check explicit dependsOn (for workflow steps)
    const workflowStep = step as TaskStep & { dependsOn?: string[] };
    if (workflowStep.dependsOn && workflowStep.dependsOn.length > 0) {
      const allDependsSatisfied = workflowStep.dependsOn.every((depId) =>
        completedTasks.has(depId)
      );
      if (!allDependsSatisfied) return false;
    }

    // Check if all input dependencies are satisfied
    if (step.input && step.input.length > 0) {
      // Find which tasks produce these outputs
      const requiredOutputs = new Set(step.input);
      const availableOutputs = new Set<string>();

      for (const s of steps) {
        if (completedTasks.has(s.id) && s.output) {
          availableOutputs.add(s.output);
        }
      }

      // All required inputs must be available
      for (const required of requiredOutputs) {
        if (!availableOutputs.has(required)) {
          return false;
        }
      }
    }

    return true;
  });
}

/**
 * Handle plan creation - start first task(s)
 */
export const planOrchestrator = inngest.createFunction(
  {
    id: 'plan-orchestrator',
    concurrency: { limit: 10 },
  },
  { event: EVENTS.PLAN_CREATED },
  async ({ event, step }) => {
    const data = event.data as PlanCreatedData;
    const { planId, steps, runPath, input = {} } = data;

    console.log(`[task-manager] Plan created: ${planId} with ${steps.length} steps`);

    // Mark run as started in manifest
    await step.run('mark-run-started', async () => {
      await markRunStarted(runPath);
    });

    // Initialize plan state (including input for interpolation)
    planStates.set(planId, {
      steps,
      completedTasks: new Set(),
      runPath,
      input,
    });

    // Find initially ready tasks (no input dependencies)
    const readyTasks = getReadyTasks(steps, new Set());

    console.log(
      `[task-manager] Ready tasks: ${readyTasks.map((t) => t.id).join(', ')}`
    );

    // Mark ready tasks as ready in manifest
    await step.run('mark-tasks-ready', async () => {
      for (const task of readyTasks) {
        await updateStepStatus(runPath, task.id, 'running');
      }
    });

    // Dispatch all ready tasks
    if (readyTasks.length > 0) {
      await step.sendEvent(
        'dispatch-ready-tasks',
        readyTasks.map((task) => ({
          name: EVENTS.TASK_READY,
          data: {
            planId,
            taskId: task.id,
            worker: task.worker,
            config: interpolateConfig(task.config || {}, input),
            input: task.input || [],
            output: task.output,
            runPath,
          },
        }))
      );
    }

    return { planId, dispatchedTasks: readyTasks.map((t) => t.id) };
  }
);

/**
 * Handle task completion - dispatch next task(s)
 */
export const taskProgressHandler = inngest.createFunction(
  {
    id: 'task-progress-handler',
    concurrency: { limit: 10 },
  },
  { event: EVENTS.TASK_COMPLETED },
  async ({ event, step }) => {
    const data = event.data as TaskCompletedData;
    const { planId, taskId, runPath } = data;

    console.log(`[task-manager] Task completed: ${taskId} in plan ${planId}`);

    // Mark step as completed in manifest
    await step.run('mark-step-completed', async () => {
      await updateStepStatus(runPath, taskId, 'completed');
    });

    // Get or reconstruct plan state
    let state = planStates.get(planId);

    if (!state) {
      console.warn(`[task-manager] Plan state not found for ${planId}, skipping`);
      return { planId, taskId, skipped: true };
    }

    // Mark task as completed
    state.completedTasks.add(taskId);

    // Check if all tasks are done
    if (state.completedTasks.size === state.steps.length) {
      console.log(`[task-manager] Plan ${planId} completed!`);

      // Mark run as completed in manifest
      await step.run('mark-run-completed', async () => {
        await markRunCompleted(runPath);
      });

      // Clean up state
      planStates.delete(planId);

      // Emit plan completed event
      await step.sendEvent('plan-completed', {
        name: EVENTS.PLAN_COMPLETED,
        data: { planId, runPath },
      });

      return { planId, status: 'completed' };
    }

    // Find next ready tasks
    const readyTasks = getReadyTasks(state.steps, state.completedTasks);

    if (readyTasks.length > 0) {
      console.log(
        `[task-manager] Next ready tasks: ${readyTasks.map((t) => t.id).join(', ')}`
      );

      // Mark next tasks as running in manifest
      await step.run('mark-next-tasks-running', async () => {
        for (const task of readyTasks) {
          await updateStepStatus(runPath, task.id, 'running');
        }
      });

      await step.sendEvent(
        'dispatch-next-tasks',
        readyTasks.map((task) => ({
          name: EVENTS.TASK_READY,
          data: {
            planId,
            taskId: task.id,
            worker: task.worker,
            config: interpolateConfig(task.config || {}, state!.input),
            input: task.input || [],
            output: task.output,
            runPath,
          },
        }))
      );
    }

    return {
      planId,
      completedTask: taskId,
      nextTasks: readyTasks.map((t) => t.id),
      progress: `${state.completedTasks.size}/${state.steps.length}`,
    };
  }
);
