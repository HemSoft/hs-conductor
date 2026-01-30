/**
 * Workload: Daily Report (Example)
 * Type: workflow
 *
 * Complex workflow demonstrating conditionals and parallel execution.
 * This is a placeholder to show the structure.
 */
import type { WorkflowDefinition } from '../../types/workload.js';

export const dailyReport: WorkflowDefinition = {
  id: 'daily-report',
  name: 'Daily Report',
  description: 'Generates a comprehensive daily report with weather, news, and tasks',
  type: 'workflow',
  version: '1.0.0',
  tags: ['daily', 'report', 'aggregate'],

  steps: [
    {
      id: 'fetch-weather',
      name: 'Get Weather',
      worker: 'ai-worker',
      config: { prompt: 'Get weather for Mooresville, NC as JSON' },
      output: 'weather.json',
      parallel: true, // Can run in parallel
    },
    {
      id: 'fetch-news',
      name: 'Fetch News',
      worker: 'fetch-worker',
      config: { urls: ['https://hnrss.org/frontpage'], format: 'rss' },
      output: 'news.json',
      parallel: true, // Can run in parallel
    },
    {
      id: 'fetch-tasks',
      name: 'Get Todoist Tasks',
      worker: 'fetch-worker',
      config: { type: 'todoist', filter: 'today' },
      output: 'tasks.json',
      parallel: true, // Can run in parallel
    },
    {
      id: 'compile-report',
      name: 'Compile Report',
      worker: 'ai-worker',
      config: {
        prompt: 'Create a daily briefing from weather, news, and tasks',
      },
      input: ['weather.json', 'news.json', 'tasks.json'],
      output: 'daily-report.md',
      dependsOn: ['fetch-weather', 'fetch-news', 'fetch-tasks'], // Wait for all
    },
  ],
};
