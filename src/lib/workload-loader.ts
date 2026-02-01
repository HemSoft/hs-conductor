/**
 * Workload Loader
 *
 * Loads workload definitions from YAML files in the workloads/ and workloads-demo/ directories.
 * - workloads/: Personal workloads (gitignored)
 * - workloads-demo/: Example workloads (checked into git)
 * 
 * Supports arbitrary folder organization - workloads can be nested in any folder structure.
 * Execution mode is inferred from structure (prompt vs steps), not from type field.
 * 
 * No code changes needed to add new workloads - just add a YAML file anywhere in workloads/.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, relative } from 'path';
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

// Track file paths for each workload (for getWorkloadPath)
let workloadPaths: Map<string, string> = new Map();

// Track validation errors for each workload file
export interface WorkloadError {
  file: string;
  errors: string[];
  warnings: string[];
}
let validationErrors: WorkloadError[] = [];

/**
 * Get all validation errors from the last load
 */
export function getValidationErrors(): WorkloadError[] {
  // Ensure workloads are loaded first
  loadWorkloads();
  return validationErrors;
}

/**
 * Recursively find all YAML files in a directory
 */
function findYamlFiles(dir: string, basePath: string): string[] {
  const results: string[] = [];
  
  if (!existsSync(dir)) {
    return results;
  }
  
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Recurse into subdirectories
      results.push(...findYamlFiles(fullPath, basePath));
    } else if (entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      results.push(fullPath);
    }
  }
  
  return results;
}

/**
 * Load all workloads from YAML files
 * Recursively searches workloads/ and workloads-demo/ directories
 * Personal workloads override demo workloads if IDs conflict
 */
function loadWorkloads(): Map<string, WorkloadDefinition> {
  if (workloadCache) {
    return workloadCache;
  }

  workloadCache = new Map();
  workloadPaths = new Map();
  validationErrors = [];

  // Load from all search paths (reverse order so personal overrides demo)
  for (const basePath of [...WORKLOAD_PATHS].reverse()) {
    const yamlFiles = findYamlFiles(basePath, basePath);

    for (const filePath of yamlFiles) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = parseYaml(content);

        // Validate with Zod schema
        const validation = validateWorkload(parsed, filePath);

        if (!validation.success) {
          console.error(validation.error);
          validationErrors.push({
            file: filePath,
            errors: [validation.error],
            warnings: [],
          });
          continue;
        }

        const workload = validation.data;

        // Store with source info (for debugging)
        (workload as any)._source = basePath;
        (workload as any)._relativePath = relative(basePath, filePath);
        
        workloadCache.set(workload.id, workload);
        workloadPaths.set(workload.id, filePath);
      } catch (error) {
        console.error(`Error loading ${filePath}:`, error instanceof Error ? error.message : error);
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
  workloadPaths = new Map();
  validationErrors = [];
  loadWorkloads();
}

/**
 * Get a workload by ID
 */
export function getWorkload(id: string): WorkloadDefinition | undefined {
  return loadWorkloads().get(id);
}

/**
 * List all workloads
 */
export function listWorkloads(): WorkloadDefinition[] {
  return Array.from(loadWorkloads().values());
}

/**
 * Get the file path for a workload by ID
 */
export function getWorkloadPath(id: string): string | undefined {
  // Ensure workloads are loaded
  loadWorkloads();
  return workloadPaths.get(id);
}
