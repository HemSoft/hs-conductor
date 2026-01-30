/**
 * Workload Loader
 *
 * Loads workload definitions from YAML files in the workloads/ and workloads-demo/ directories.
 * - workloads/: Personal workloads (gitignored)
 * - workloads-demo/: Example workloads (checked into git)
 * 
 * No code changes needed to add new workloads - just add a YAML file.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { WorkloadDefinition } from '../types/workload.js';
import { validateWorkload } from '../types/workload-schemas.js';

// Search paths in priority order (personal first, then demo)
const WORKLOAD_PATHS = [
  process.env.WORKLOADS_DIR || 'workloads',
  'workloads-demo',
];

// Cache loaded workloads
let workloadCache: Map<string, WorkloadDefinition> | null = null;

/**
 * Load all workloads from YAML files
 * Searches both personal (workloads/) and demo (workloads-demo/) directories
 * Personal workloads override demo workloads if IDs conflict
 */
function loadWorkloads(): Map<string, WorkloadDefinition> {
  if (workloadCache) {
    return workloadCache;
  }

  workloadCache = new Map();

  const categories = ['ad-hoc', 'tasks', 'workflows'];

  // Load from all search paths (reverse order so personal overrides demo)
  for (const basePath of [...WORKLOAD_PATHS].reverse()) {
    for (const category of categories) {
      const categoryPath = join(basePath, category);

      if (!existsSync(categoryPath)) {
        continue;
      }

      const files = readdirSync(categoryPath).filter(
        (f) => f.endsWith('.yaml') || f.endsWith('.yml')
      );

      for (const file of files) {
        try {
          const filePath = join(categoryPath, file);
          const content = readFileSync(filePath, 'utf-8');
          const parsed = parseYaml(content);

          // Validate with Zod schema
          const validation = validateWorkload(parsed, filePath);

          if (!validation.success) {
            console.error(validation.error);
            continue;
          }

          const workload = validation.data;

          // Verify type matches directory
          const expectedType =
            category === 'ad-hoc' ? 'ad-hoc' : category === 'tasks' ? 'task' : 'workflow';
          if (workload.type !== expectedType) {
            console.warn(
              `Warning: ${file} has type "${workload.type}" but is in ${category}/ directory (expected "${expectedType}")`
            );
          }

          // Store with source info (for debugging)
          (workload as any)._source = basePath;
          workloadCache.set(workload.id, workload);
        } catch (error) {
          console.error(`Error loading ${file}:`, error instanceof Error ? error.message : error);
        }
      }
    }
  }

  return workloadCache;
}

/**
 * Reload workloads (useful for development)
 */
export function reloadWorkloads(): void {
  workloadCache = null;
  loadWorkloads();
}

/**
 * Get a workload by ID
 */
export function getWorkload(id: string): WorkloadDefinition | undefined {
  return loadWorkloads().get(id);
}

/**
 * List all workloads, optionally filtered by type
 */
export function listWorkloads(type?: 'ad-hoc' | 'task' | 'workflow'): WorkloadDefinition[] {
  const all = Array.from(loadWorkloads().values());
  if (type) {
    return all.filter((w) => w.type === type);
  }
  return all;
}

/**
 * Searches both personal and demo directories
 */
export function getWorkloadPath(id: string): string | undefined {
  const workload = getWorkload(id);
  if (!workload) return undefined;

  const categoryMap = {
    'ad-hoc': 'ad-hoc',
    task: 'tasks',
    workflow: 'workflows',
  };

  const category = categoryMap[workload.type];
  
  // Check personal workloads first
  for (const basePath of WORKLOAD_PATHS) {
    const path = join(basePath, category, `${id}.yaml`);
    if (existsSync(path)) {
      return path;
    }
  }
  
  return undefined
  const categoryMap = {
    'ad-hoc': 'ad-hoc',
    task: 'tasks',
    workflow: 'workflows',
  };

  const category = categoryMap[workload.type];
  return join(WORKLOADS_DIR, category, `${id}.yaml`);
}
