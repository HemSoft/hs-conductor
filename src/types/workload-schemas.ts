/**
 * Zod Schemas for Workload Validation
 *
 * Runtime validation for YAML-defined workloads.
 * Unified schema - execution mode is inferred from structure:
 * - Has `prompt` → simple AI execution
 * - Has `steps` → multi-step execution (sequential or parallel based on dependsOn)
 */
import { z } from 'zod';

/**
 * Alert configuration schema
 */
export const AlertConfigSchema = z.object({
  condition: z.union([
    z.literal('always'),
    z.string().min(1, 'Alert condition cannot be empty'),
  ]),
  message: z.string().optional(),
});

/**
 * Input field schema (for YAML)
 */
export const InputFieldSchema = z.object({
  type: z.enum(['string', 'number', 'boolean'], {
    errorMap: () => ({ message: 'Input type must be string, number, or boolean' }),
  }),
  required: z.boolean().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
});

/**
 * Step schema - supports sequential and parallel execution
 */
export const StepSchema = z.object({
  id: z.string().min(1, 'Step ID is required'),
  name: z.string().min(1, 'Step name is required'),
  worker: z.enum(['exec-worker', 'fetch-worker', 'file-worker', 'ai-worker'], {
    errorMap: () => ({ message: 'Worker must be exec-worker, fetch-worker, file-worker, or ai-worker' }),
  }),
  config: z.record(z.unknown()),
  input: z.array(z.string()).optional(),
  output: z.string().min(1, 'Output path is required'),
  // Optional parallel execution support
  dependsOn: z.array(z.string()).optional(),
  condition: z.string().optional(),
  parallel: z.boolean().optional(),
});

/**
 * Output configuration schema
 */
export const OutputConfigSchema = z.object({
  format: z.enum(['json', 'markdown', 'text'], {
    errorMap: () => ({ message: 'Output format must be json, markdown, or text' }),
  }),
});

/**
 * Unified Workload Schema
 * 
 * Either has:
 * - `prompt` + `output` for simple AI workloads
 * - `steps` for multi-step workloads
 */
export const WorkloadDefinitionSchema = z.object({
  // Required fields
  id: z.string().min(1, 'Workload ID is required'),
  name: z.string().min(1, 'Workload name is required'),
  description: z.string().min(1, 'Workload description is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  
  // Optional metadata
  tags: z.array(z.string()).optional(),
  alert: AlertConfigSchema.optional(),
  input: z.record(InputFieldSchema).optional(),
  
  // Simple workload (prompt-based)
  prompt: z.string().optional(),
  model: z.string().optional(),
  output: OutputConfigSchema.optional(),
  
  // Step-based workload
  steps: z.array(StepSchema).optional(),
}).refine(
  (data) => {
    // Must have either prompt or steps
    const hasPrompt = !!data.prompt;
    const hasSteps = data.steps && data.steps.length > 0;
    return hasPrompt || hasSteps;
  },
  { message: 'Workload must have either a prompt or steps' }
).refine(
  (data) => {
    // If has prompt, must have output config
    if (data.prompt && !data.output) {
      return false;
    }
    return true;
  },
  { message: 'Prompt-based workloads must have an output configuration' }
).refine(
  (data) => {
    // Step IDs must be unique
    if (data.steps) {
      const ids = data.steps.map((s) => s.id);
      return ids.length === new Set(ids).size;
    }
    return true;
  },
  { message: 'Step IDs must be unique' }
).refine(
  (data) => {
    // Validate that dependsOn references exist
    if (data.steps) {
      const ids = new Set(data.steps.map((s) => s.id));
      for (const step of data.steps) {
        if (step.dependsOn) {
          for (const depId of step.dependsOn) {
            if (!ids.has(depId)) {
              return false;
            }
          }
        }
      }
    }
    return true;
  },
  { message: 'Step dependencies must reference valid step IDs' }
).refine(
  (data) => {
    // Detect circular dependencies
    if (!data.steps) return true;
    
    const graph = new Map<string, string[]>();
    data.steps.forEach((step) => {
      graph.set(step.id, step.dependsOn || []);
    });

    function hasCycle(node: string, visited: Set<string>, recStack: Set<string>): boolean {
      visited.add(node);
      recStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor, visited, recStack)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          return true;
        }
      }

      recStack.delete(node);
      return false;
    }

    for (const step of data.steps) {
      if (hasCycle(step.id, new Set(), new Set())) {
        return false;
      }
    }
    return true;
  },
  { message: 'Workload contains circular dependencies' }
);

/**
 * Validation helper with detailed error messages
 */
export function validateWorkload(data: unknown, filePath: string): {
  success: true;
  data: z.infer<typeof WorkloadDefinitionSchema>;
} | {
  success: false;
  error: string;
} {
  try {
    const result = WorkloadDefinitionSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((err) => {
        const path = err.path.join('.');
        return `  • ${path ? `${path}: ` : ''}${err.message}`;
      });
      
      return {
        success: false,
        error: `Invalid workload definition in ${filePath}:\n${messages.join('\n')}`,
      };
    }
    return {
      success: false,
      error: `Failed to parse workload in ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Type exports (inferred from schemas)
 */
export type WorkloadDefinitionSchemaType = z.infer<typeof WorkloadDefinitionSchema>;
export type StepSchemaType = z.infer<typeof StepSchema>;
