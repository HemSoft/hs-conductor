/**
 * Alert Worker
 *
 * Sends alerts and notifications through various channels.
 * Use to notify the user when something completes or needs attention:
 * - Windows toast notifications
 * - System sounds/beeps
 * - Log-based alerts (persisted to data/alerts/)
 *
 * Config options:
 * - title: Alert title (required)
 * - message: Alert message body (required)
 * - type: Alert type - "toast" | "sound" | "log" | "all" (default: "toast")
 * - sound: Sound type for audio alerts - "default" | "reminder" | "alarm" (default: "default")
 * - priority: Priority level - "low" | "normal" | "high" | "urgent" (default: "normal")
 * - persist: Whether to persist alert to data/alerts/ (default: true)
 *
 * Combine with countdown-worker for timed reminders!
 */
import { spawn } from 'node:child_process';
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { writeAsset } from '../lib/file-storage.js';
import { updateManifestStepStatus } from '../lib/run-manifest.js';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Alert configuration
 */
interface AlertConfig {
  title: string;
  message: string;
  type?: 'toast' | 'sound' | 'log' | 'all';
  sound?: 'default' | 'reminder' | 'alarm' | 'none';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  persist?: boolean;
}

/**
 * Result of alert delivery
 */
interface AlertResult {
  success: boolean;
  alertId: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  deliveredAt: string;
  channels: {
    toast?: { success: boolean; error?: string };
    sound?: { success: boolean; error?: string };
    log?: { success: boolean; path?: string; error?: string };
  };
  error?: string;
}

/**
 * Generate a unique alert ID
 */
function generateAlertId(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 6);
  return `alert-${timestamp}-${random}`;
}

/**
 * Send Windows toast notification via PowerShell
 */
async function sendToastNotification(
  title: string,
  message: string,
  _priority: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Use PowerShell's built-in toast notification capability
    // This uses Windows.UI.Notifications which is available on Windows 10+
    const script = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
      
      $template = @"
      <toast>
        <visual>
          <binding template="ToastText02">
            <text id="1">${title.replace(/"/g, '&quot;')}</text>
            <text id="2">${message.replace(/"/g, '&quot;')}</text>
          </binding>
        </visual>
      </toast>
"@
      
      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $xml.LoadXml($template)
      
      $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
      
      $appId = "hs-conductor"
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
    `;

    const child = spawn('powershell', ['-NoProfile', '-Command', script], {
      windowsHide: true,
    });

    let stderr = '';
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[alert-worker] Toast notification sent: "${title}"`);
        resolve({ success: true });
      } else {
        console.warn(`[alert-worker] Toast failed (code ${code}): ${stderr}`);
        // Fall back to BurntToast if available
        void tryBurntToast(title, message).then(resolve);
      }
    });

    child.on('error', (err) => {
      console.warn(`[alert-worker] Toast error: ${err.message}`);
      void tryBurntToast(title, message).then(resolve);
    });
  });
}

/**
 * Try BurntToast PowerShell module as fallback
 */
async function tryBurntToast(
  title: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const script = `
      if (Get-Module -ListAvailable -Name BurntToast) {
        New-BurntToastNotification -Text "${title.replace(/"/g, '`"')}", "${message.replace(/"/g, '`"')}"
        exit 0
      } else {
        exit 1
      }
    `;

    const child = spawn('powershell', ['-NoProfile', '-Command', script], {
      windowsHide: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[alert-worker] BurntToast notification sent`);
        resolve({ success: true });
      } else {
        // Final fallback: console message
        console.log(`[alert-worker] ⚠️ ALERT: ${title} - ${message}`);
        resolve({
          success: true,
          error: 'Toast unavailable, logged to console',
        });
      }
    });

    child.on('error', () => {
      resolve({ success: false, error: 'PowerShell not available' });
    });
  });
}

/**
 * Play a system sound via PowerShell
 */
async function playSound(
  soundType: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Map sound types to Windows system sounds or beep patterns
    const soundCommands: Record<string, string> = {
      default: '[System.Media.SystemSounds]::Asterisk.Play()',
      reminder: '[System.Media.SystemSounds]::Exclamation.Play()',
      alarm: `
        [System.Media.SystemSounds]::Hand.Play()
        Start-Sleep -Milliseconds 300
        [System.Media.SystemSounds]::Hand.Play()
      `,
      none: 'exit 0',
    };

    const command = soundCommands[soundType] || soundCommands.default;

    const child = spawn('powershell', ['-NoProfile', '-Command', command], {
      windowsHide: true,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[alert-worker] Sound played: ${soundType}`);
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `Sound failed with exit code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Persist alert to data/alerts/ directory
 */
function persistAlert(
  alertId: string,
  title: string,
  message: string,
  priority: string,
  planId: string,
  taskId: string
): { success: boolean; path?: string; error?: string } {
  try {
    const alertsDir = 'data/alerts';
    if (!existsSync(alertsDir)) {
      mkdirSync(alertsDir, { recursive: true });
    }

    const alertFile = join(alertsDir, `${alertId}.json`);
    const alertData = {
      id: alertId,
      title,
      message,
      priority,
      source: {
        planId,
        taskId,
      },
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };

    writeFileSync(alertFile, JSON.stringify(alertData, null, 2));
    console.log(`[alert-worker] Alert persisted to ${alertFile}`);

    return { success: true, path: alertFile };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[alert-worker] Failed to persist alert: ${error}`);
    return { success: false, error };
  }
}

export const alertWorker = inngest.createFunction(
  {
    id: 'alert-worker',
    concurrency: { limit: 5 },
    retries: 2,
  },
  {
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "alert-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, output, runPath } = TaskReadySchema.parse(event.data);

    const title = config.title as string;
    const message = config.message as string;
    const type = (config.type as AlertConfig['type']) || 'toast';
    const sound = (config.sound as AlertConfig['sound']) || 'default';
    const priority = (config.priority as AlertConfig['priority']) || 'normal';
    const persist = config.persist !== false; // Default to true

    if (!title || !message) {
      throw new Error('alert-worker requires "title" and "message" in config');
    }

    const alertId = generateAlertId();
    console.log(`[alert-worker] Creating alert ${alertId}: "${title}"`);

    const channels: AlertResult['channels'] = {};

    // Determine which channels to use
    const useToast = type === 'toast' || type === 'all';
    const useSound = type === 'sound' || type === 'all' || sound !== 'none';
    const useLog = type === 'log' || type === 'all' || persist;

    // Send toast notification
    if (useToast) {
      channels.toast = await step.run('send-toast', async () => {
        return sendToastNotification(title, message, priority);
      });
    }

    // Play sound (after toast so they don't overlap)
    if (useSound && sound !== 'none') {
      channels.sound = await step.run('play-sound', async () => {
        return playSound(sound);
      });
    }

    // Persist to log
    if (useLog) {
      channels.log = await step.run('persist-alert', () => {
        return persistAlert(alertId, title, message, priority, planId, taskId);
      });
    }

    // Build result
    const result: AlertResult = {
      success: true,
      alertId,
      title,
      message,
      type,
      priority,
      deliveredAt: new Date().toISOString(),
      channels,
    };

    // Check if any channel failed
    const failures = Object.entries(channels)
      .filter(([, ch]) => !ch.success)
      .map(([name, ch]) => `${name}: ${ch.error}`);

    if (failures.length > 0 && failures.length === Object.keys(channels).length) {
      result.success = false;
      result.error = `All channels failed: ${failures.join('; ')}`;
    }

    // Write output
    await step.run('write-output', async () => {
      await writeAsset(runPath, output, result);
      console.log(`[alert-worker] Wrote result to ${runPath}/${output}`);

      await updateManifestStepStatus(
        runPath,
        taskId,
        result.success ? 'completed' : 'failed',
        result.error
      );
    });

    // Emit completion event
    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return {
      success: result.success,
      planId,
      alertId,
      channels: Object.keys(channels),
    };
  }
);
