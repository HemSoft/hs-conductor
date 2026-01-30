/**
 * AI Worker
 *
 * Processes AI tasks using GitHub Copilot SDK with tool-based execution.
 * The SDK is agentic - it works by invoking tools to complete tasks.
 *
 * Key Pattern:
 * - Register tools with the session (including complete_task)
 * - Send prompt instructing agent to use complete_task when done
 * - Agent processes request and calls complete_task with its response
 *
 * Supports two modes:
 * - Ad-hoc: Just a prompt, no input files
 * - Task: Prompt with input files to process
 */
import { CopilotClient, type Tool } from '@github/copilot-sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { readAsset, writeResult } from '../lib/file-storage.js';
import { recordOutput, markRunCompleted } from '../lib/run-manifest.js';
import { getWorkload } from '../lib/workload-loader.js';
import type { AlertConfig } from '../types/workload.js';
import {
  getToolsForSession,
  getTaskResult,
  isTaskCompleted,
  resetTaskState,
} from '../lib/copilot-tools.js';
import {
  discoverAllSkills,
  generateSkillsXml,
  isInitialized as skillsInitialized,
  getSkillCount,
} from '../lib/skill-loader.js';

// Singleton Copilot client
let copilotClient: CopilotClient | null = null;

/**
 * Evaluate alert condition and write alert file if triggered
 */
async function evaluateAndTriggerAlert(
  workloadId: string,
  workloadName: string,
  output: string,
  alert: AlertConfig
): Promise<boolean> {
  // Evaluate condition
  let shouldTrigger = false;
  
  if (alert.condition === 'always') {
    shouldTrigger = true;
  } else {
    // Evaluate as JavaScript expression with 'output' variable
    try {
      // Create a safe evaluation context
      const evalFn = new Function('output', `return ${alert.condition}`);
      shouldTrigger = Boolean(evalFn(output));
    } catch (err) {
      console.error('[ai-worker] Alert condition evaluation failed:', err);
      shouldTrigger = false;
    }
  }
  
  if (shouldTrigger) {
    // Ensure alerts directory exists
    const alertsDir = 'data/alerts';
    await mkdir(alertsDir, { recursive: true });
    
    // Write alert file
    const alertData = {
      workloadId,
      workloadName,
      message: alert.message || `${workloadName} completed`,
      timestamp: new Date().toISOString(),
      outputPreview: output.substring(0, 200),
    };
    
    const alertFile = join(alertsDir, `${workloadId}-${Date.now()}.json`);
    await writeFile(alertFile, JSON.stringify(alertData, null, 2));
    console.log('[ai-worker] Alert triggered:', alertFile);
    return true;
  }
  
  return false;
}

/**
 * Build the system prompt with available skills injected
 */
function buildSystemPrompt(): string {
  const skillsXml = generateSkillsXml();
  const skillCount = getSkillCount();

  const skillInstructions = skillCount > 0
    ? `
## Available Skills

You have access to ${skillCount} skills that extend your capabilities. Skills follow progressive disclosure:

1. **Discovery**: Use list_available_skills to see what skills are available
2. **Activation**: Use activate_skill to load a skill's full instructions when you identify a task that matches
3. **Resources**: Use read_skill_resource to access scripts, references, or assets from an activated skill
4. **Execution**: Use run_powershell to execute PowerShell scripts from skills

${skillsXml}

When a task matches a skill's description, activate that skill first to get detailed instructions.
`
    : '';

  return `You are a helpful AI assistant that completes tasks by using tools.

When given a task, you MUST:
1. Check if the task matches any available skills (if skills are available)
2. If a skill matches, activate it and follow its instructions
3. Process the user's request using available tools
4. Call the 'complete_task' tool with your final response

CRITICAL: Do NOT respond with text messages. ALWAYS use the complete_task tool to submit your answer.

## Core Tools
- complete_task(response: string): Submit your final answer using this tool
- fetch_url(url: string): Fetch content from URLs
- get_current_time(): Get current date/time
- read_workspace_file(path: string): Read files from the workspace
- run_powershell(script: string): Execute PowerShell commands

## File Editing Tools
- write_file(path, content): Create or overwrite a file
- replace_string_in_file(path, oldString, newString): Replace text in a file
- list_directory(path, recursive?): List directory contents

## Search Tools
- grep_search(pattern, path?, filePattern?, isRegex?): Search for text/patterns in files
- file_search(pattern, path?): Find files by name pattern

## Skill Tools
- list_available_skills(): See all available skills
- activate_skill(skillName): Load a skill's full instructions
- read_skill_resource(skillName, resourcePath): Read scripts/references/assets from a skill
- list_skill_resources(skillName): List available resources in a skill
${skillInstructions}
Example: If asked "What is 2+2?", call complete_task with response "4".
`;
}

async function getCopilotClient(): Promise<CopilotClient> {
  if (!copilotClient) {
    copilotClient = new CopilotClient();
    await copilotClient.start();
    console.log('[ai-worker] Copilot client started');

    // Initialize skills if not already done
    if (!skillsInitialized()) {
      await discoverAllSkills();
      console.log(`[ai-worker] Discovered ${getSkillCount()} skills`);
    }
  }
  return copilotClient;
}

/**
 * Process a prompt using GitHub Copilot SDK with tool execution
 *
 * The agent is instructed to use the complete_task tool to provide its response.
 * This allows us to capture structured output from the agentic execution.
 */
async function processPromptWithCopilot(prompt: string): Promise<string> {
  try {
    const client = await getCopilotClient();
    const model = process.env.COPILOT_MODEL || 'claude-sonnet-4.5';

    console.log('[ai-worker] Creating Copilot session with model:', model);

    // Reset task state before each request
    resetTaskState();

    // Get tools for this session
    const tools = getToolsForSession();
    console.log(
      '[ai-worker] Registering tools:',
      tools.map((t) => t.name).join(', ')
    );

    // Create session with tools registered
    const session = await client.createSession({
      model,
      tools: tools as Tool<unknown>[],
      // Use REPLACE mode to completely override SDK's default system message
      systemMessage: {
        mode: 'replace',
        content: buildSystemPrompt(),
      },
    });

    // Subscribe to events for debugging
    session.on((event) => {
      const eventType = (event as { type: string }).type;
      console.log(`[ai-worker] Event: ${eventType}`);
      
      if (eventType === 'tool.call' || eventType === 'tool.execution_start') {
        const toolEvent = event as { data?: { toolName?: string } };
        console.log(`[ai-worker] Tool called: ${toolEvent.data?.toolName}`);
      }
    });

    // Send prompt using proper MessageOptions format
    console.log('[ai-worker] Sending prompt to Copilot...');
    const response = await session.sendAndWait({
      prompt: prompt,
    });

    console.log('[ai-worker] Response type:', (response as { type?: string })?.type);

    // Check if the agent called complete_task
    if (isTaskCompleted()) {
      const result = getTaskResult();
      console.log('[ai-worker] Task completed via tool, result length:', result?.length);
      return result || 'No response captured';
    }

    // If no tool was called, try to extract from response content
    const resp = response as { data?: { content?: string } };
    if (resp?.data?.content) {
      console.log('[ai-worker] Using response content (tool not called)');
      return resp.data.content;
    }

    // Check message history for any content
    const messages = await session.getMessages();
    console.log('[ai-worker] Checking', messages.length, 'messages in history');

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as { type: string; data?: { content?: string } };
      if (msg.type === 'assistant.message' && msg.data?.content) {
        const content = msg.data.content;
        // Skip greetings
        if (!content.includes('ready to help') && !content.includes('What would you like')) {
          return content;
        }
      }
    }

    return 'No response from Copilot agent';
  } catch (err) {
    console.error('[ai-worker] Copilot error:', err);
    throw err;
  }
}

/**
 * Mock response fallback
 */
function getMockResponse(prompt: string): string {
  console.log('[ai-worker] Using mock response');

  if (prompt.toLowerCase().includes('joke')) {
    const jokes = [
      "Why do programmers prefer dark mode? Because light attracts bugs!",
      "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
      "Why do Java developers wear glasses? Because they can't C#!",
      "There are only 10 types of people in the world: those who understand binary and those who don't.",
      "A programmer's wife tells him: 'Go to the store and buy a loaf of bread. If they have eggs, buy a dozen.' He comes home with 12 loaves of bread.",
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  if (prompt.toLowerCase().includes('weather')) {
    return JSON.stringify({
      location: "Mooresville, NC",
      temperature: { value: 72, unit: "F" },
      conditions: "Partly cloudy",
      humidity: "45%",
      wind: { speed: 8, unit: "mph", direction: "NW" },
      timestamp: new Date().toISOString(),
      note: "Mock data - Copilot SDK unavailable"
    }, null, 2);
  }

  return `[Mock Response]\n\nPrompt: "${prompt.substring(0, 200)}..."`;
}

/**
 * Process prompt - tries Copilot first, falls back to mock
 */
async function processPrompt(prompt: string): Promise<string> {
  // Check if we should use mock mode
  if (process.env.USE_MOCK_AI === 'true') {
    return getMockResponse(prompt);
  }

  try {
    return await processPromptWithCopilot(prompt);
  } catch (err) {
    console.warn('[ai-worker] Copilot failed, using mock:', err);
    return getMockResponse(prompt);
  }
}

export const aiWorker = inngest.createFunction(
  {
    id: 'ai-worker',
    concurrency: { limit: 1 },
    retries: 2,
  },
  {
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "ai-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, input, output, runPath } =
      TaskReadySchema.parse(event.data);

    const prompt = config.prompt as string;
    if (!prompt) {
      throw new Error('AI worker requires a prompt in config');
    }

    // Read input data if provided (optional for ad-hoc tasks)
    const inputData = await step.run('read-input', async () => {
      if (!input || input.length === 0) {
        return null;
      }
      
      // Read all input files and combine them
      const allInputs: Record<string, unknown> = {};
      for (const inputFile of input) {
        try {
          const data = await readAsset(runPath, inputFile);
          allInputs[inputFile] = data;
        } catch (err) {
          console.warn(`[ai-worker] Could not read input ${inputFile}:`, err);
          allInputs[inputFile] = { error: 'Could not read file' };
        }
      }
      return allInputs;
    });

    // Generate response
    const result = await step.run('generate-response', async () => {
      let fullPrompt = prompt;

      if (inputData) {
        fullPrompt += `\n\nInput data:\n${JSON.stringify(inputData, null, 2)}`;
      }

      console.log('[ai-worker] Processing:', fullPrompt.substring(0, 100) + '...');
      return processPrompt(fullPrompt);
    });

    // Write result
    await step.run('write-result', async () => {
      // Determine output format from config or infer from filename
      let outputFormat = config.outputFormat as string | undefined;
      if (!outputFormat) {
        if (output.endsWith('.json')) {
          outputFormat = 'json';
        } else if (output.endsWith('.md')) {
          outputFormat = 'markdown';
        } else {
          outputFormat = 'text';
        }
      }
      const content = formatOutput(planId, result, outputFormat);
      await writeResult(runPath, output, content);
      console.log('[ai-worker] Result written to:', `${runPath}/${output}`);

      // Record output in manifest
      const isAdHoc = taskId === 'ad-hoc-001';
      await recordOutput(runPath, {
        file: output,
        step: taskId,
        type: isAdHoc ? 'primary' : (!input || input.length === 0 ? 'intermediate' : 'primary'),
        format: outputFormat as 'json' | 'markdown' | 'text',
        size: content.length,
      });

      // For ad-hoc workloads, mark run as completed (no task-manager)
      if (isAdHoc) {
        await markRunCompleted(runPath);
      }
    });

    // Evaluate alert if configured
    await step.run('evaluate-alert', async () => {
      // Extract workload ID from planId (format: workloadId-timestamp)
      const workloadId = planId.split('-').slice(0, -4).join('-'); // Remove timestamp parts
      const definition = getWorkload(workloadId);
      
      if (definition?.alert) {
        await evaluateAndTriggerAlert(
          workloadId,
          definition.name,
          result,
          definition.alert
        );
      }
    });

    // Emit completion event
    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return { success: true, planId, output };
  }
);

function formatOutput(planId: string, content: string, format: string): string {
  const timestamp = new Date().toISOString();

  if (format === 'json') {
    // Try to extract JSON from the response
    const jsonMatch =
      content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[1] || jsonMatch[0];
    }
    return content;
  }

  return `# ${planId} - Results

**Generated:** ${timestamp}

---

${content}

---

*Generated by hs-conductor*
`;
}
