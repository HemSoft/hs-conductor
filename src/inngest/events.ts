import { z } from 'zod';

// Event schemas for type safety
export const PlanCreatedSchema = z.object({
  planId: z.string(),
  templateId: z.string(),
  runPath: z.string(),
});

export const TaskReadySchema = z.object({
  planId: z.string(),
  taskId: z.string(),
  worker: z.enum(['fetch-worker', 'file-worker', 'ai-worker']),
  config: z.record(z.unknown()),
  input: z.array(z.string()).optional(),
  output: z.string(),
  runPath: z.string(),
});

export const TaskCompletedSchema = z.object({
  planId: z.string(),
  taskId: z.string(),
  output: z.string(),
  runPath: z.string(),
});

export const TaskFailedSchema = z.object({
  planId: z.string(),
  taskId: z.string(),
  error: z.string(),
  runPath: z.string(),
});

export const PlanCompletedSchema = z.object({
  planId: z.string(),
  runPath: z.string(),
});

// Event name constants
export const EVENTS = {
  PLAN_CREATED: 'conductor/plan.created',
  PLAN_COMPLETED: 'conductor/plan.completed',
  TASK_READY: 'conductor/task.ready',
  TASK_CLAIMED: 'conductor/task.claimed',
  TASK_COMPLETED: 'conductor/task.completed',
  TASK_FAILED: 'conductor/task.failed',
} as const;

// Type exports for event data
export type PlanCreatedEvent = z.infer<typeof PlanCreatedSchema>;
export type TaskReadyEvent = z.infer<typeof TaskReadySchema>;
export type TaskCompletedEvent = z.infer<typeof TaskCompletedSchema>;
export type TaskFailedEvent = z.infer<typeof TaskFailedSchema>;
export type PlanCompletedEvent = z.infer<typeof PlanCompletedSchema>;
