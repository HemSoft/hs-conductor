/**
 * Workload Registry
 *
 * Central registry of all available workloads.
 * To add a new workload:
 * 1. Create a file in the appropriate category folder (ad-hoc/, tasks/, workflows/)
 * 2. Import and add it to the registry below
 */
import type { WorkloadDefinition } from '../types/workload.js';

// Ad-hoc workloads (single AI execution)
import { weather } from './ad-hoc/weather.js';

// Task workloads (sequential steps)
import { newsDigest } from './tasks/news-digest.js';

// Workflow workloads (complex with conditionals)
// import { dailyReport } from './workflows/daily-report.js';

/**
 * All registered workloads
 */
export const workloads: Map<string, WorkloadDefinition> = new Map([
  ['weather', weather as WorkloadDefinition],
  ['news-digest', newsDigest as WorkloadDefinition],
]);

/**
 * Get a workload by ID
 */
export function getWorkload(id: string): WorkloadDefinition | undefined {
  return workloads.get(id);
}

/**
 * List all workloads, optionally filtered by type
 */
export function listWorkloads(type?: 'ad-hoc' | 'task' | 'workflow'): WorkloadDefinition[] {
  const all = Array.from(workloads.values());
  if (type) {
    return all.filter((w) => w.type === type);
  }
  return all;
}

/**
 * Check if a workload exists
 */
export function hasWorkload(id: string): boolean {
  return workloads.has(id);
}
