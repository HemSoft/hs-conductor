/**
 * Exec Worker
 *
 * Executes commands and captures output.
 * Use for deterministic tasks that don't require AI:
 * - PowerShell scripts
 * - Bash commands
 * - Executables (.exe, .bat, etc.)
 *
 * Config options:
 * - command: The executable to run (e.g., "pwsh", "bash", "node")
 * - args: Array of arguments to pass
 * - cwd: Working directory (optional)
 * - env: Environment variables to inject (optional)
 * - timeout: Max execution time in ms (default: 30000)
 * - filter: Regex pattern to filter output lines (optional)
 */
import { spawn } from 'node:child_process';
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { writeAsset } from '../lib/file-storage.js';
import { updateManifestStepStatus } from '../lib/run-manifest.js';

/**
 * Result of command execution
 */
interface ExecResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
  duration: number;
  filtered?: boolean;
  error?: string;
}

/**
 * Execute a command and capture output
 */
function executeCommand(
  command: string,
  args: string[] = [],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = options.timeout || 30000;
    const fullCommand = `${command} ${args.join(' ')}`;

    console.log(`[exec-worker] Executing: ${fullCommand}`);
    if (options.cwd) {
      console.log(`[exec-worker] Working directory: ${options.cwd}`);
    }

    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      shell: true,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Set timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);

    // Capture stdout
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    // Capture stderr
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle completion
    child.on('close', (exitCode) => {
      clearTimeout(timeoutHandle);
      const duration = Date.now() - startTime;

      if (timedOut) {
        resolve({
          success: false,
          exitCode: -1,
          stdout,
          stderr,
          command: fullCommand,
          duration,
          error: `Command timed out after ${timeout}ms`,
        });
        return;
      }

      console.log(`[exec-worker] Command completed in ${duration}ms with exit code ${exitCode}`);

      resolve({
        success: exitCode === 0,
        exitCode: exitCode || 0,
        stdout,
        stderr,
        command: fullCommand,
        duration,
      });
    });

    // Handle errors
    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      const duration = Date.now() - startTime;

      console.error(`[exec-worker] Error executing command:`, err);

      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        command: fullCommand,
        duration,
        error: err.message,
      });
    });
  });
}

/**
 * Filter output lines by regex pattern
 */
function filterOutput(output: string, pattern: string): string {
  try {
    const regex = new RegExp(pattern, 'i');
    const lines = output.split('\n');
    const matched = lines.filter((line) => regex.test(line));
    return matched.join('\n');
  } catch (err) {
    console.error('[exec-worker] Invalid filter pattern:', err);
    return output;
  }
}

export const execWorker = inngest.createFunction(
  {
    id: 'exec-worker',
    concurrency: { limit: 3 },
    retries: 2,
  },
  {
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "exec-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, output, runPath } = TaskReadySchema.parse(event.data);

    // Extract config
    const command = config.command as string;
    const args = (config.args as string[]) || [];
    const cwd = config.cwd as string | undefined;
    const env = config.env as Record<string, string> | undefined;
    const timeout = (config.timeout as number) || 30000;
    const filter = config.filter as string | undefined;

    if (!command) {
      throw new Error('exec-worker requires "command" in config');
    }

    // Execute command
    const result = await step.run('execute-command', async () => {
      return executeCommand(command, args, { cwd, env, timeout });
    });

    // Process result
    const finalResult = await step.run('process-result', async () => {
      if (!result.success) {
        console.error('[exec-worker] Command failed:', result.error || `Exit code ${result.exitCode}`);
        if (result.stderr) {
          console.error('[exec-worker] stderr:', result.stderr);
        }
      }

      // Apply filter if specified
      let processedOutput = result.stdout;
      let filtered = false;

      if (filter && result.success) {
        processedOutput = filterOutput(result.stdout, filter);
        filtered = true;
        console.log(`[exec-worker] Applied filter: ${filter}`);
        console.log(`[exec-worker] Filtered output: ${processedOutput.length} chars (from ${result.stdout.length})`);
      }

      return {
        ...result,
        stdout: processedOutput,
        filtered,
      };
    });

    // Write output
    await step.run('write-output', async () => {
      await writeAsset(runPath, output, finalResult);
      console.log(`[exec-worker] Wrote result to ${runPath}/${output}`);

      // Update manifest with step completion
      await updateManifestStepStatus(
        runPath,
        taskId,
        finalResult.success ? 'completed' : 'failed',
        finalResult.error
      );
    });

    // Emit completion event
    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return {
      success: finalResult.success,
      planId,
      exitCode: finalResult.exitCode,
      duration: finalResult.duration,
    };
  }
);
