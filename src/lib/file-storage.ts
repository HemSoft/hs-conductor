/**
 * File Storage Operations
 *
 * Handles reading/writing plan files, assets, and results.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import type { PlanInstance, TaskStatus } from '../types/plan.js';

const DATA_PATH = process.env.CONDUCTOR_DATA_PATH || './data';

/**
 * Ensure directory exists
 */
async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Read a JSON asset file
 */
export async function readAsset<T = unknown>(
  runPath: string,
  assetPath: string
): Promise<T> {
  const fullPath = join(runPath, assetPath);
  const content = await readFile(fullPath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write a JSON asset file
 */
export async function writeAsset(
  runPath: string,
  assetPath: string,
  data: unknown
): Promise<void> {
  const fullPath = join(runPath, assetPath);
  await ensureDir(dirname(fullPath));
  await writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Write a markdown result file
 */
export async function writeResult(
  runPath: string,
  resultPath: string,
  content: string
): Promise<void> {
  const fullPath = join(runPath, resultPath);
  await ensureDir(dirname(fullPath));
  await writeFile(fullPath, content, 'utf-8');
}

/**
 * Read the plan manifest (plan.json)
 */
export async function getPlan(runPath: string): Promise<PlanInstance> {
  const planPath = join(runPath, 'plan.json');
  const content = await readFile(planPath, 'utf-8');
  return JSON.parse(content) as PlanInstance;
}

/**
 * Write the plan manifest
 */
export async function writePlan(
  runPath: string,
  plan: PlanInstance
): Promise<void> {
  const planPath = join(runPath, 'plan.json');
  await ensureDir(dirname(planPath));
  await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
}

/**
 * Update a task's status in the plan
 */
export async function updateTaskStatus(
  runPath: string,
  taskId: string,
  status: TaskStatus
): Promise<void> {
  const plan = await getPlan(runPath);
  const task = plan.tasks.find((t) => t.id === taskId);

  if (task) {
    task.status = status;
    if (status === 'running' && !task.startedAt) {
      task.startedAt = new Date();
    }
    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date();
    }

    // Update plan status based on tasks
    const hasRunning = plan.tasks.some((t) => t.status === 'running');
    const allCompleted = plan.tasks.every((t) => t.status === 'completed');
    const hasFailed = plan.tasks.some((t) => t.status === 'failed');

    if (allCompleted) {
      plan.status = 'completed';
      plan.completedAt = new Date();
    } else if (hasFailed) {
      plan.status = 'failed';
    } else if (hasRunning) {
      plan.status = 'running';
    }

    await writePlan(runPath, plan);
  }
}

/**
 * Get tasks that are ready to run (dependencies satisfied)
 */
export async function getReadyTasks(runPath: string): Promise<PlanInstance['tasks']> {
  const plan = await getPlan(runPath);

  const completedTaskIds = new Set(
    plan.tasks.filter((t) => t.status === 'completed').map((t) => t.id)
  );

  return plan.tasks.filter((task) => {
    // Only pending tasks can become ready
    if (task.status !== 'pending') return false;

    // All dependencies must be completed
    return task.dependsOn.every((depId) => completedTaskIds.has(depId));
  });
}

/**
 * Get the latest plan ID
 */
export async function getLatestPlanId(): Promise<string | null> {
  const runsPath = join(DATA_PATH, 'runs');

  try {
    const entries = await readdir(runsPath);
    const planDirs = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(runsPath, entry);
        const stats = await stat(entryPath);
        return { name: entry, mtime: stats.mtime };
      })
    );

    // Sort by modification time, newest first
    planDirs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return planDirs[0]?.name || null;
  } catch {
    return null;
  }
}

/**
 * Get all plan runs
 */
export async function getAllPlanRuns(): Promise<
  Array<{ planId: string; createdAt: Date }>
> {
  const runsPath = join(DATA_PATH, 'runs');

  try {
    const entries = await readdir(runsPath);
    const plans = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(runsPath, entry);
        const stats = await stat(entryPath);
        return { planId: entry, createdAt: stats.birthtime };
      })
    );

    // Sort by creation time, newest first
    plans.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return plans;
  } catch {
    return [];
  }
}
