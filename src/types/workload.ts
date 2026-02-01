/**
 * Workload Type Definitions
 *
 * Unified workload model - execution mode is inferred from structure:
 * - Has `prompt` → simple AI execution
 * - Has `steps` → multi-step execution (sequential or parallel based on dependsOn)
 *
 * These types map to YAML definitions in workloads/
 */

/**
 * Alert configuration for workloads
 * Triggers Windows toast notifications when conditions are met
 */
export interface AlertConfig {
  /**
   * Condition to evaluate:
   * - 'always': Always trigger alert when workload completes
   * - JavaScript expression: Evaluated with `output` variable containing the result string
   *   Example: "output.includes('severe weather')"
   */
  condition: string;
  
  /**
   * Custom message for the alert (optional)
   * If not provided, uses workload name + "completed"
   */
  message?: string;
}

/**
 * Input field definition (for YAML)
 */
export interface InputField {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  description?: string;
  default?: unknown;
}

/**
 * Step definition - supports sequential and parallel execution
 */
export interface Step {
  id: string;
  name: string;
  worker: 'exec-worker' | 'fetch-worker' | 'file-worker' | 'ai-worker';
  config: Record<string, unknown>;
  input?: string[]; // References to previous step outputs
  output: string;
  // Optional parallel execution support
  dependsOn?: string[]; // Step IDs this depends on
  condition?: string; // Expression to evaluate
  parallel?: boolean; // Can run in parallel with siblings
}

/**
 * Unified Workload Definition
 * 
 * Either has:
 * - `prompt` + `output` for simple AI workloads
 * - `steps` for multi-step workloads
 */
export interface WorkloadDefinition {
  // Required fields
  id: string;
  name: string;
  description: string;
  version: string;
  
  // Optional metadata
  tags?: string[];
  alert?: AlertConfig;
  input?: Record<string, InputField>;
  
  // Simple workload (prompt-based)
  prompt?: string;
  model?: string;
  output?: {
    format: 'json' | 'markdown' | 'text';
  };
  
  // Step-based workload
  steps?: Step[];
  
  // Internal metadata (added by loader)
  _source?: string;
  _relativePath?: string;
}

/**
 * Helper to determine if workload is prompt-based
 */
export function isPromptWorkload(workload: WorkloadDefinition): boolean {
  return !!workload.prompt;
}

/**
 * Helper to determine if workload has parallel steps
 */
export function hasParallelSteps(workload: WorkloadDefinition): boolean {
  if (!workload.steps) return false;
  return workload.steps.some(s => s.dependsOn || s.parallel);
}

/**
 * Runtime instance of an executing workload
 */
export interface WorkloadInstance {
  instanceId: string; // e.g., "weather-2026-01-27-001"
  definitionId: string; // Reference to the definition
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: Record<string, unknown>; // User-provided inputs
  output?: unknown; // Final result
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

// ============================================================================
// RUN MANIFEST (Self-documenting run folder)
// ============================================================================

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Step execution record in the manifest
 */
export interface RunStepRecord {
  id: string;
  name: string;
  worker: string;
  status: StepStatus;
  output?: string; // Output filename
  startedAt?: string; // ISO timestamp
  completedAt?: string;
  duration?: number; // milliseconds
  error?: string;
}

/**
 * Output file record
 */
export interface RunOutputRecord {
  file: string; // Filename in run folder
  step: string; // Step ID that produced it
  type: 'intermediate' | 'primary'; // Primary = final output
  format: 'json' | 'markdown' | 'text';
  size?: number; // bytes
}

/**
 * Run Manifest - Self-documenting record of a workload execution
 * 
 * Stored as run.json in each run folder. Contains everything needed
 * to understand what happened without referencing the original YAML.
 */
export interface RunManifest {
  // Identity
  instanceId: string; // e.g., "news-digest-2026-01-28-045744"
  workloadId: string; // Reference to definition
  workloadName: string; // Human-readable name
  
  // Status
  status: RunStatus;
  startedAt: string; // ISO timestamp
  completedAt?: string;
  duration?: number; // milliseconds
  error?: string;
  
  // Input
  input: Record<string, unknown>; // User-provided inputs
  
  // Execution (for step-based workloads)
  steps?: RunStepRecord[];
  
  // Outputs
  outputs: RunOutputRecord[];
  primaryOutput?: string; // Filename of main output
  
  // Metadata
  version: string; // Workload version at time of run
  createdBy?: string; // 'manual' | 'schedule' | schedule name
}
