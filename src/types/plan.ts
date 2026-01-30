/**
 * Plan and Task Type Definitions
 */

export type PlanStatus =
  | 'pending' // Created, not yet started
  | 'approved' // Approved, ready to run
  | 'running' // Tasks in progress
  | 'completed' // All tasks finished
  | 'failed'; // Plan failed

export type TaskStatus =
  | 'pending' // Waiting for dependencies
  | 'ready' // Dependencies satisfied
  | 'running' // Worker executing
  | 'completed' // Finished successfully
  | 'failed'; // Task failed

export type WorkerType = 'fetch-worker' | 'file-worker' | 'ai-worker';

export interface TaskDefinition {
  id: string; // e.g., "TASK-001"
  name: string; // e.g., "Fetch RSS Feeds"
  worker: WorkerType;
  dependsOn: string[]; // Task IDs this depends on
  config: Record<string, unknown>;
  input?: string[]; // File paths for input
  output: string; // Output file path
}

export interface PlanTemplate {
  templateId: string; // e.g., "TODAYS-NEWS"
  name: string;
  description: string;
  schedule?: string; // Cron expression
  approval: 'auto' | 'always' | 'dangerous-only';
  version: string;
  tasks: TaskDefinition[];
  resultSchema: {
    format: 'markdown' | 'json';
    sections?: string[];
  };
}

export interface TaskInstance extends TaskDefinition {
  status: TaskStatus;
  worker: WorkerType;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  retries: number;
}

export interface PlanInstance {
  planId: string; // e.g., "TODAYS-NEWS-2026-01-27"
  templateId: string;
  status: PlanStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  trigger: 'manual' | 'schedule';
  tasks: TaskInstance[];
  eventLog: EventLogEntry[];
}

export interface EventLogEntry {
  timestamp: Date;
  event: string;
  data: Record<string, unknown>;
}

// News item type for the POC
export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  timestamp: string;
  score?: number;
  comments?: number;
  summary?: string;
  category?: string;
}
