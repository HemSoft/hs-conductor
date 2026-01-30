/**
 * Zod Schemas for Workload Validation
 *
 * Runtime validation for YAML-defined workloads.
 * Provides detailed error messages for invalid configurations.
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
 * Base workload schema (shared fields)
 */
const WorkloadBaseSchema = z.object({
  id: z.string().min(1, 'Workload ID is required'),
  name: z.string().min(1, 'Workload name is required'),
  description: z.string().min(1, 'Workload description is required'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be in semver format (e.g., 1.0.0)'),
  tags: z.array(z.string()).optional(),
  alert: AlertConfigSchema.optional(),
});

/**
 * Ad-hoc workload schema
 */
export const AdHocDefinitionSchema = WorkloadBaseSchema.extend({
  type: z.literal('ad-hoc'),
  prompt: z.string().min(1, 'Prompt is required for ad-hoc workloads'),
  model: z.string().optional(),
  input: z.record(InputFieldSchema).optional(),
  output: z.object({
    format: z.enum(['json', 'markdown', 'text'], {
      errorMap: () => ({ message: 'Output format must be json, markdown, or text' }),
    }),
  }),
});

/**
 * Task step schema
 */
export const TaskStepSchema = z.object({
  id: z.string().min(1, 'Step ID is required'),
  name: z.string().min(1, 'Step name is required'),
  worker: z.enum(['exec-worker', 'fetch-worker', 'file-worker', 'ai-worker'], {
    errorMap: () => ({ message: 'Worker must be exec-worker, fetch-worker, file-worker, or ai-worker' }),
  }),
  config: z.record(z.unknown()),
  input: z.array(z.string()).optional(),
  output: z.string().min(1, 'Output path is required'),
});

/**
 * Task workload schema
 */
export const TaskDefinitionSchema = WorkloadBaseSchema.extend({
  type: z.literal('task'),
  steps: z
    .array(TaskStepSchema)
    .min(1, 'Task workload must have at least one step')
    .refine(
      (steps) => {
        const ids = steps.map((s) => s.id);
        return ids.length === new Set(ids).size;
      },
      { message: 'Step IDs must be unique' }
    ),
});

/**
 * Workflow step schema (extends task step with dependencies)
 */
export const WorkflowStepSchema = TaskStepSchema.extend({
  dependsOn: z.array(z.string()).optional(),
  condition: z.string().optional(),
  parallel: z.boolean().optional(),
});

/**
 * Workflow workload schema
 */
export const WorkflowDefinitionSchema = WorkloadBaseSchema.extend({
  type: z.literal('workflow'),
  steps: z
    .array(WorkflowStepSchema)
    .min(1, 'Workflow must have at least one step')
    .refine(
      (steps) => {
        const ids = steps.map((s) => s.id);
        return ids.length === new Set(ids).size;
      },
      { message: 'Step IDs must be unique' }
    )
    .refine(
      (steps) => {
        // Validate that dependsOn references exist
        const ids = new Set(steps.map((s) => s.id));
        for (const step of steps) {
          if (step.dependsOn) {
            for (const depId of step.dependsOn) {
              if (!ids.has(depId)) {
                return false;
              }
            }
          }
        }
        return true;
      },
      { message: 'Step dependencies must reference valid step IDs' }
    )
    .refine(
      (steps) => {
        // Detect circular dependencies
        const graph = new Map<string, string[]>();
        steps.forEach((step) => {
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

        for (const step of steps) {
          if (hasCycle(step.id, new Set(), new Set())) {
            return false;
          }
        }
        return true;
      },
      { message: 'Workflow contains circular dependencies' }
    ),
});

/**
 * Discriminated union of all workload types
 */
export const WorkloadDefinitionSchema = z.discriminatedUnion('type', [
  AdHocDefinitionSchema,
  TaskDefinitionSchema,
  WorkflowDefinitionSchema,
]);

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
export type AdHocDefinitionSchemaType = z.infer<typeof AdHocDefinitionSchema>;
export type TaskDefinitionSchemaType = z.infer<typeof TaskDefinitionSchema>;
export type WorkflowDefinitionSchemaType = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkloadDefinitionSchemaType = z.infer<typeof WorkloadDefinitionSchema>;
