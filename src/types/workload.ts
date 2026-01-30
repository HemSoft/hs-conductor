/**
 * Workload Type Definitions
 *
 * Three categories of workloads:
 * - ad-hoc: Single AI execution, no dependencies
 * - task: Sequential steps (A → B → C)
 * - workflow: Complex with conditionals and branching
 *
 * These types map to YAML definitions in workloads/
 */

export type WorkloadType = 'ad-hoc' | 'task' | 'workflow';

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
  condition: 'always' | string;
  
  /**
   * Custom message for the alert (optional)
   * If not provided, uses workload name + "completed"
   */
  message?: string;
}

/**
 * Base definition shared by all workload types
 */
export interface WorkloadBase {
  id: string; // Unique identifier, e.g., "weather"
  name: string; // Human-readable name
  description: string;
  type: WorkloadType;
  version: string;
  tags?: string[];
  
  /**
   * Optional alert configuration
   * When specified, triggers a Windows toast notification based on the condition
   */
  alert?: AlertConfig;
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
 * Ad-hoc: Single AI execution
 * Use when: You just need AI to do one thing
 */
export interface AdHocDefinition extends WorkloadBase {
  type: 'ad-hoc';
  prompt: string; // The AI prompt template (supports {{variable}})
  model?: string; // Optional model override
  input?: Record<string, InputField>; // Expected inputs
  output: {
    format: 'json' | 'markdown' | 'text';
  };
}

/**
 * Task: Sequential steps
 * Use when: Multiple steps that run in order
 */
export interface TaskDefinition extends WorkloadBase {
  type: 'task';
  steps: TaskStep[];
}

export interface TaskStep {
  id: string;
  name: string;
  worker: 'exec-worker' | 'fetch-worker' | 'file-worker' | 'ai-worker';
  config: Record<string, unknown>;
  input?: string[]; // References to previous step outputs
  output: string;
}

/**
 * Workflow: Complex with conditionals
 * Use when: Branching logic, parallel execution, or complex dependencies
 */
export interface WorkflowDefinition extends WorkloadBase {
  type: 'workflow';
  steps: WorkflowStep[];
}

export interface WorkflowStep extends TaskStep {
  dependsOn?: string[]; // Step IDs this depends on
  condition?: string; // Expression to evaluate (e.g., "steps.fetch.status == 'success'")
  parallel?: boolean; // Can run in parallel with siblings
}

/**
 * Union type for all workload definitions
 */
export type WorkloadDefinition = AdHocDefinition | TaskDefinition | WorkflowDefinition;

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
  workloadType: WorkloadType; // ad-hoc, task, workflow
  
  // Status
  status: RunStatus;
  startedAt: string; // ISO timestamp
  completedAt?: string;
  duration?: number; // milliseconds
  error?: string;
  
  // Input
  input: Record<string, unknown>; // User-provided inputs
  
  // Execution (for tasks/workflows)
  steps?: RunStepRecord[];
  
  // Outputs
  outputs: RunOutputRecord[];
  primaryOutput?: string; // Filename of main output
  
  // Metadata
  version: string; // Workload version at time of run
  createdBy?: string; // 'manual' | 'schedule' | schedule name
}
