/**
 * Countdown Worker
 *
 * Waits for a specified duration or until a specific time.
 * Use to delay subsequent tasks in a workflow:
 * - Wait X seconds/minutes/hours before proceeding
 * - Wait until a specific time (e.g., "2026-02-01T09:00:00")
 * - Combine with alert-worker to create timed reminders
 *
 * Config options:
 * - duration: Wait duration (e.g., "30s", "5m", "1h", "2h30m")
 * - until: ISO 8601 datetime to wait until (alternative to duration)
 * - message: Optional message describing what we're waiting for
 *
 * Note: Only one of `duration` or `until` should be specified.
 * If both are provided, `until` takes precedence.
 */
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { writeAsset } from '../lib/file-storage.js';
import { updateManifestStepStatus } from '../lib/run-manifest.js';

/**
 * Result of countdown completion
 */
interface CountdownResult {
  success: boolean;
  startedAt: string;
  completedAt: string;
  waitedMs: number;
  waitedHuman: string;
  mode: 'duration' | 'until';
  target?: string;
  message?: string;
  error?: string;
}

/**
 * Parse duration string into milliseconds
 * Supports: "30s", "5m", "1h", "2h30m", "1d", "1h30m15s"
 */
function parseDuration(duration: string): number {
  const regex = /(\d+)(d|h|m|s)/gi;
  let totalMs = 0;
  let match;

  while ((match = regex.exec(duration)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'd':
        totalMs += value * 24 * 60 * 60 * 1000;
        break;
      case 'h':
        totalMs += value * 60 * 60 * 1000;
        break;
      case 'm':
        totalMs += value * 60 * 1000;
        break;
      case 's':
        totalMs += value * 1000;
        break;
    }
  }

  return totalMs;
}

/**
 * Format milliseconds into human-readable duration
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours % 24 > 0) parts.push(`${hours % 24}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

/**
 * Calculate wait time in milliseconds
 */
function calculateWaitMs(config: { duration?: string; until?: string }): {
  waitMs: number;
  mode: 'duration' | 'until';
  target?: string;
} {
  // If 'until' is specified, calculate time until that moment
  if (config.until) {
    const targetDate = new Date(config.until);
    if (isNaN(targetDate.getTime())) {
      throw new Error(`Invalid date format for 'until': ${config.until}`);
    }

    const now = Date.now();
    const waitMs = targetDate.getTime() - now;

    if (waitMs < 0) {
      // Target time has already passed
      return { waitMs: 0, mode: 'until', target: config.until };
    }

    return { waitMs, mode: 'until', target: config.until };
  }

  // Parse duration string
  if (config.duration) {
    const waitMs = parseDuration(config.duration);
    if (waitMs <= 0) {
      throw new Error(`Invalid or zero duration: ${config.duration}`);
    }
    return { waitMs, mode: 'duration', target: config.duration };
  }

  throw new Error('countdown-worker requires either "duration" or "until" in config');
}

export const countdownWorker = inngest.createFunction(
  {
    id: 'countdown-worker',
    concurrency: { limit: 10 }, // Allow many concurrent countdowns
    retries: 1, // Minimal retries - sleep failures are rare
  },
  {
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "countdown-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, output, runPath } = TaskReadySchema.parse(event.data);

    const duration = config.duration as string | undefined;
    const until = config.until as string | undefined;
    const message = config.message as string | undefined;

    const startedAt = new Date().toISOString();
    console.log(`[countdown-worker] Starting countdown for task ${taskId}`);

    // Calculate how long to wait
    const { waitMs, mode, target } = await step.run('calculate-wait', () => {
      return calculateWaitMs({ duration, until });
    });

    // Log what we're waiting for
    await step.run('log-countdown', () => {
      const humanDuration = formatDuration(waitMs);
      if (mode === 'until') {
        console.log(`[countdown-worker] Waiting until ${target} (${humanDuration})`);
      } else {
        console.log(`[countdown-worker] Waiting for ${target} (${humanDuration})`);
      }
      if (message) {
        console.log(`[countdown-worker] Reason: ${message}`);
      }
    });

    // Use Inngest's step.sleep for reliable waiting
    // This survives server restarts and handles long durations properly
    if (waitMs > 0) {
      await step.sleep('countdown', waitMs);
    }

    const completedAt = new Date().toISOString();

    // Build result
    const result: CountdownResult = await step.run('build-result', () => {
      const actualWaitMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      return {
        success: true,
        startedAt,
        completedAt,
        waitedMs: actualWaitMs,
        waitedHuman: formatDuration(actualWaitMs),
        mode,
        target,
        message,
      };
    });

    console.log(`[countdown-worker] Countdown complete after ${result.waitedHuman}`);

    // Write output
    await step.run('write-output', async () => {
      await writeAsset(runPath, output, result);
      console.log(`[countdown-worker] Wrote result to ${runPath}/${output}`);

      await updateManifestStepStatus(runPath, taskId, 'completed');
    });

    // Emit completion event
    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return {
      success: true,
      planId,
      waitedMs: result.waitedMs,
      waitedHuman: result.waitedHuman,
    };
  }
);
