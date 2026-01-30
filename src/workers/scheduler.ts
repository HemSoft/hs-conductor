/**
 * Scheduler Worker - Runs every minute and triggers due schedules
 * 
 * This is the production-ready approach that:
 * - Works with distributed Inngest (only one instance runs each tick)
 * - Has retry/observability built-in
 * - Scales horizontally
 */

import { inngest } from '../inngest/client.js';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { CronExpressionParser } from 'cron-parser';

const SCHEDULES_DIR = join(process.cwd(), 'data', 'schedules');

interface Schedule {
  id: string;
  name: string;
  workloadId: string;
  cron: string | null;
  interval: string | null;
  enabled: boolean;
  params?: Record<string, unknown>;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Check if a cron expression matches the current minute
 */
function cronMatchesNow(cronExpression: string): boolean {
  try {
    const now = new Date();
    // Round down to the current minute
    now.setSeconds(0);
    now.setMilliseconds(0);
    
    // Create a reference point slightly AFTER the start of this minute
    // so that prev() will return this minute if it matches
    const checkTime = new Date(now.getTime() + 1000); // 1 second into this minute
    
    const expr = CronExpressionParser.parse(cronExpression, {
      currentDate: checkTime,
    });
    
    // Get the previous scheduled time (which could be this minute)
    const prev = expr.prev().toDate();
    
    // Check if the previous occurrence matches this minute exactly
    // (prev should be rounded to the start of a minute)
    const diffMs = Math.abs(now.getTime() - prev.getTime());
    return diffMs < 1000; // Within 1 second means same minute
  } catch (err) {
    console.error(`Invalid cron expression: ${cronExpression}`, err);
    return false;
  }
}

/**
 * Load all schedules from the data/schedules directory
 */
function loadSchedules(): Schedule[] {
  if (!existsSync(SCHEDULES_DIR)) {
    return [];
  }
  
  const files = readdirSync(SCHEDULES_DIR).filter(f => f.endsWith('.json'));
  const schedules: Schedule[] = [];
  
  for (const file of files) {
    try {
      const content = readFileSync(join(SCHEDULES_DIR, file), 'utf-8');
      const schedule = JSON.parse(content) as Schedule;
      schedules.push(schedule);
    } catch (err) {
      console.error(`Failed to load schedule ${file}:`, err);
    }
  }
  
  return schedules;
}

/**
 * Update a schedule's lastRunAt timestamp
 */
function updateLastRunAt(scheduleId: string): void {
  const filePath = join(SCHEDULES_DIR, `${scheduleId}.json`);
  if (!existsSync(filePath)) return;
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const schedule = JSON.parse(content);
    schedule.lastRunAt = new Date().toISOString();
    writeFileSync(filePath, JSON.stringify(schedule, null, 2));
  } catch (err) {
    console.error(`Failed to update lastRunAt for ${scheduleId}:`, err);
  }
}

/**
 * Scheduler function - runs every minute via Inngest cron
 */
export const schedulerWorker = inngest.createFunction(
  {
    id: 'scheduler',
    name: 'Schedule Scanner',
  },
  { cron: '* * * * *' }, // Every minute
  async ({ step, logger }) => {
    const schedules = await step.run('load-schedules', () => {
      return loadSchedules();
    });
    
    logger.info(`Loaded ${schedules.length} schedules`);
    
    const enabledSchedules = schedules.filter(s => s.enabled && s.cron);
    logger.info(`${enabledSchedules.length} enabled schedules with cron expressions`);
    
    // Check each schedule
    const dueSchedules: Schedule[] = [];
    
    for (const schedule of enabledSchedules) {
      if (schedule.cron && cronMatchesNow(schedule.cron)) {
        dueSchedules.push(schedule);
        logger.info(`Schedule "${schedule.name}" (${schedule.id}) is due - cron: ${schedule.cron}`);
      }
    }
    
    if (dueSchedules.length === 0) {
      logger.info('No schedules due this minute');
      return { triggered: 0 };
    }
    
    // Trigger each due schedule
    const triggered: string[] = [];
    
    for (const schedule of dueSchedules) {
      await step.run(`trigger-${schedule.id}`, async () => {
        // Send an event to trigger the workload
        // The workload loader will pick this up and route to the correct worker
        await inngest.send({
          name: 'workload/scheduled.trigger',
          data: {
            scheduleId: schedule.id,
            scheduleName: schedule.name,
            workloadId: schedule.workloadId,
            params: schedule.params || {},
          },
        });
        
        // Update lastRunAt
        updateLastRunAt(schedule.id);
        
        triggered.push(schedule.id);
        logger.info(`Triggered workload "${schedule.workloadId}" for schedule "${schedule.name}"`);
      });
    }
    
    return { 
      triggered: triggered.length,
      scheduleIds: triggered,
    };
  }
);

/**
 * Handler for scheduled workload triggers
 * This receives the event and runs the workload via HTTP
 */
export const scheduledWorkloadHandler = inngest.createFunction(
  {
    id: 'scheduled-workload-handler',
    name: 'Scheduled Workload Handler',
  },
  { event: 'workload/scheduled.trigger' },
  async ({ event, step, logger }) => {
    const { scheduleId, scheduleName, workloadId, params } = event.data;
    
    logger.info(`Executing scheduled workload: ${workloadId} (schedule: ${scheduleName})`);
    
    // Call the existing /run/:id endpoint which handles all workload types correctly
    const result = await step.run('trigger-workload', async () => {
      const port = process.env.PORT || 2900;
      const response = await fetch(`http://localhost:${port}/run/${workloadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to trigger workload: ${errorText}`);
      }
      
      return response.json();
    });
    
    return {
      success: true,
      workloadId,
      scheduleId,
      instanceId: result.instanceId,
    };
  }
);
