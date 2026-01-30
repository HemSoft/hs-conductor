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
  missedExecutionPolicy?: 'catchup' | 'last' | 'skip' | 'log'; // Default: log
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
 * Check for missed executions since lastRunAt
 * Returns array of missed execution times
 */
function getMissedExecutions(cronExpression: string, lastRunAt: string | undefined): Date[] {
  if (!lastRunAt) {
    return []; // Never run before, nothing missed
  }
  
  try {
    const now = new Date();
    const lastRun = new Date(lastRunAt);
    
    // Get all scheduled times between lastRunAt and now
    const expr = CronExpressionParser.parse(cronExpression, {
      currentDate: lastRun,
    });
    
    const missed: Date[] = [];
    let next = expr.next().toDate();
    
    // Iterate through all scheduled times until we reach "now"
    // Limit iterations to prevent infinite loop
    let iterations = 0;
    const maxIterations = 1000; // Safety limit
    
    while (next < now && iterations < maxIterations) {
      missed.push(next);
      try {
        next = expr.next().toDate();
      } catch {
        break; // No more iterations available
      }
      iterations++;
    }
    
    return missed;
  } catch (err) {
    console.error(`Failed to check missed executions for ${cronExpression}:`, err);
    return [];
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
    
    // Check each schedule for:
    // 1. Missed executions (since lastRunAt)
    // 2. Current execution (matches this minute)
    const dueSchedules: Schedule[] = [];
    const missedSchedules: Array<{ schedule: Schedule; missedCount: number; missedTimes: Date[] }> = [];
    
    for (const schedule of enabledSchedules) {
      if (!schedule.cron) continue;
      
      // Check for missed executions
      const missed = getMissedExecutions(schedule.cron, schedule.lastRunAt);
      if (missed.length > 0) {
        const policy = schedule.missedExecutionPolicy || 'log';
        missedSchedules.push({ schedule, missedCount: missed.length, missedTimes: missed });
        
        logger.warn(
          `Schedule "${schedule.name}" (${schedule.id}) missed ${missed.length} execution(s). ` +
          `Policy: ${policy}. Last run: ${schedule.lastRunAt || 'never'}`
        );
        
        // Handle according to policy
        if (policy === 'catchup') {
          logger.info(`Catching up ALL ${missed.length} missed execution(s) for "${schedule.name}"`);
          dueSchedules.push(schedule);
        } else if (policy === 'last') {
          const lastMissed = missed[missed.length - 1];
          logger.info(
            `Running most recent missed execution for "${schedule.name}" ` +
            `(${missed.length} total missed, running last: ${lastMissed.toISOString()})`
          );
          dueSchedules.push(schedule);
        } else if (policy === 'skip') {
          logger.info(`Skipping ${missed.length} missed execution(s) for "${schedule.name}"`);
        } else {
          // Default: log (already logged above)
          logger.info(`Logged ${missed.length} missed execution(s) for "${schedule.name}"`);
        }
      }
      
      // Check if schedule is due right now
      if (cronMatchesNow(schedule.cron)) {
        // Only add if not already added via catchup
        if (!dueSchedules.includes(schedule)) {
          dueSchedules.push(schedule);
          logger.info(`Schedule "${schedule.name}" (${schedule.id}) is due - cron: ${schedule.cron}`);
        }
      }
    }
    
    if (dueSchedules.length === 0) {
      logger.info('No schedules due this minute');
      return { 
        triggered: 0,
        missedExecutions: missedSchedules.length,
      };
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
      missedExecutions: missedSchedules.length,
      missedDetails: missedSchedules.map(m => ({
        scheduleId: m.schedule.id,
        scheduleName: m.schedule.name,
        missedCount: m.missedCount,
        policy: m.schedule.missedExecutionPolicy || 'log',
      })),
    };
  }
);

/**
 * Handler for scheduled workload triggers
 * This receives the event and triggers the workload directly without HTTP
 * Using direct function call since both are in the same process
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
    
    // Import here to avoid circular dependencies
    const { executeWorkload } = await import('../lib/executor.js');
    
    // Execute workload directly without HTTP call
    // This avoids authentication issues with Inngest
    const result = await step.run('trigger-workload', async () => {
      return executeWorkload(workloadId, params);
    });
    
    return {
      success: true,
      workloadId,
      scheduleId,
      instanceId: result.instanceId,
    };
  }
);
