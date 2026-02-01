/**
 * Copilot SDK Tools
 *
 * Custom tools that enable the Copilot agent to accomplish tasks.
 * The SDK is agentic - it works by invoking tools to complete work.
 *
 * Tool Types:
 * - completeTask: Return a completed response to the user
 * - fetchUrl: Fetch content from a URL (for web-enabled tasks)
 * - getCurrentTime: Get current date/time
 * - Skill Tools: Progressive disclosure for Agent Skills (agentskills.io)
 *
 * NOTE: Using raw JSON Schema instead of Zod because SDK requires toJSONSchema()
 * method which Zod doesn't provide natively.
 */

import { type Tool, type ToolHandler } from '@github/copilot-sdk';
import { resolve, normalize } from 'path';
import {
  getAllSkillMetadata,
  activateSkill,
  readSkillResource,
  listSkillResources,
} from './skill-loader.js';
import { getPathsConfig } from './config.js';

// ============================================================================
// WRITE SANDBOX CONFIGURATION
// ============================================================================

/**
 * Get the allowed write path from configuration or use default (data/)
 * Set paths.allowedWritePath in config.yaml to customize, or set to "*" to allow all paths
 */
function getAllowedWritePath(): string {
  const configPath = getPathsConfig().allowedWritePath;
  if (configPath === '*') return '*'; // Allow all paths (trust mode)
  if (configPath) return resolve(configPath);
  return resolve(process.cwd(), 'data');
}

/**
 * Validate that a path is within the allowed write sandbox
 * Returns { valid: true, resolvedPath } or { valid: false, error }
 */
function validateWritePath(targetPath: string): { valid: true; resolvedPath: string } | { valid: false; error: string } {
  const allowedPath = getAllowedWritePath();
  
  // Trust mode - allow all paths
  if (allowedPath === '*') {
    return { valid: true, resolvedPath: resolve(targetPath) };
  }

  const resolvedTarget = resolve(targetPath);
  const normalizedTarget = normalize(resolvedTarget);
  const normalizedAllowed = normalize(allowedPath);

  // Check if target is within allowed path
  if (!normalizedTarget.startsWith(normalizedAllowed)) {
    return {
      valid: false,
      error: `Write access denied. Path must be within '${normalizedAllowed}'. ` +
             `Attempted to write to '${normalizedTarget}'. ` +
             `Set paths.allowedWritePath in config.yaml to change or use '*' for unrestricted access.`,
    };
  }

  return { valid: true, resolvedPath: resolvedTarget };
}

/**
 * Result collector - stores the agent's response for retrieval
 */
let taskResult: string | null = null;
let taskCompleted = false;

export function getTaskResult(): string | null {
  return taskResult;
}

export function isTaskCompleted(): boolean {
  return taskCompleted;
}

export function resetTaskState(): void {
  taskResult = null;
  taskCompleted = false;
}

/**
 * Complete Task Tool
 *
 * The agent calls this to submit its final response.
 * This is how we capture the agent's output.
 */
export const completeTaskTool: Tool<{ response: string }> = {
  name: 'complete_task',
  description:
    'Submit your final response to complete the current task. You MUST call this tool with your answer.',
  parameters: {
    type: 'object',
    properties: {
      response: {
        type: 'string',
        description: 'Your complete response/answer to the task.',
      },
    },
    required: ['response'],
  },
  handler: (async ({ response }) => {
    console.log('[tool:complete_task] Received response of length:', response.length);
    taskResult = response;
    taskCompleted = true;
    return { success: true, message: 'Task completed successfully' };
  }) as ToolHandler<{ response: string }>,
};

/**
 * Fetch URL Tool
 *
 * Enables the agent to fetch web content.
 * Useful for weather, news, and other web-enabled tasks.
 */
export const fetchUrlTool: Tool<{ url: string; method?: string }> = {
  name: 'fetch_url',
  description:
    'Fetch content from a URL. Use this to retrieve web pages, API responses, or other online resources.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch',
      },
      method: {
        type: 'string',
        enum: ['GET', 'POST'],
        default: 'GET',
        description: 'HTTP method to use',
      },
    },
    required: ['url'],
  },
  handler: (async ({ url, method = 'GET' }) => {
    console.log(`[tool:fetch_url] Fetching ${method} ${url}`);
    try {
      const response = await fetch(url, { method });
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const json = await response.json();
        return { success: true, data: json, contentType: 'json' };
      }

      const text = await response.text();
      const truncated = text.length > 10000 ? text.substring(0, 10000) + '...' : text;
      return { success: true, data: truncated, contentType: 'text' };
    } catch (err) {
      const error = err as Error;
      console.error('[tool:fetch_url] Error:', error.message);
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{ url: string; method?: string }>,
};

/**
 * Get Current Time Tool
 *
 * Returns the current date and time.
 */
export const getCurrentTimeTool: Tool<{ timezone?: string }> = {
  name: 'get_current_time',
  description: 'Get the current date and time. Optionally specify a timezone.',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional timezone (e.g., "America/New_York", "UTC")',
      },
    },
    required: [],
  },
  handler: (async ({ timezone }) => {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    };

    if (timezone) {
      options.timeZone = timezone;
    }

    return {
      iso: now.toISOString(),
      formatted: now.toLocaleString('en-US', options),
      timestamp: now.getTime(),
    };
  }) as ToolHandler<{ timezone?: string }>,
};

/**
 * Read File Tool
 *
 * Read content from a file in the workspace.
 */
export const readFileTool: Tool<{ path: string }> = {
  name: 'read_workspace_file',
  description: 'Read the contents of a file from the current workspace/project directory.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path to the file within the workspace',
      },
    },
    required: ['path'],
  },
  handler: (async ({ path }) => {
    console.log(`[tool:read_workspace_file] Reading ${path}`);
    try {
      const file = Bun.file(path);
      const content = await file.text();
      return { success: true, content, size: content.length };
    } catch (err) {
      const error = err as Error;
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{ path: string }>,
};

// ============================================================================
// AGENT SKILLS TOOLS (agentskills.io standard)
// Progressive disclosure: metadata → instructions → resources
// ============================================================================

/**
 * List Available Skills Tool (Level 1 - Metadata)
 *
 * Returns all discovered skills with name and description.
 * This is the first level of progressive disclosure.
 */
export const listSkillsTool: Tool<Record<string, never>> = {
  name: 'list_available_skills',
  description:
    'List all available skills with their names and descriptions. Use this to discover what skills are available before activating one.',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler: (async () => {
    console.log('[tool:list_available_skills] Listing skills');
    const skills = getAllSkillMetadata();
    return {
      success: true,
      count: skills.length,
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        hasLicense: !!s.license,
        hasCompatibility: !!s.compatibility,
      })),
    };
  }) as ToolHandler<Record<string, never>>,
};

/**
 * Activate Skill Tool (Level 2 - Full Instructions)
 *
 * Loads the complete instructions from a skill's SKILL.md file.
 * Call this when a task matches a skill's description.
 */
export const activateSkillTool: Tool<{ skillName: string }> = {
  name: 'activate_skill',
  description:
    'Load the full instructions from a skill. Call this when you need to use a specific skill to complete a task.',
  parameters: {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'The name of the skill to activate (from list_available_skills)',
      },
    },
    required: ['skillName'],
  },
  handler: (async ({ skillName }) => {
    console.log(`[tool:activate_skill] Activating skill: ${skillName}`);
    const skill = await activateSkill(skillName);
    if (!skill) {
      return { success: false, error: `Skill not found: ${skillName}` };
    }
    return {
      success: true,
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      license: skill.license,
      compatibility: skill.compatibility,
    };
  }) as ToolHandler<{ skillName: string }>,
};

/**
 * Read Skill Resource Tool (Level 3 - On-Demand Resources)
 *
 * Reads files from a skill's scripts/, references/, or assets/ directories.
 */
export const readSkillResourceTool: Tool<{ skillName: string; resourcePath: string }> = {
  name: 'read_skill_resource',
  description:
    'Read a resource file from an activated skill (scripts, references, or assets). Use relative paths like "scripts/extract.py" or "references/REFERENCE.md".',
  parameters: {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'The name of the skill',
      },
      resourcePath: {
        type: 'string',
        description: 'Relative path to the resource within the skill folder',
      },
    },
    required: ['skillName', 'resourcePath'],
  },
  handler: (async ({ skillName, resourcePath }) => {
    console.log(`[tool:read_skill_resource] Reading ${resourcePath} from ${skillName}`);
    const content = await readSkillResource(skillName, resourcePath);
    if (content === null) {
      return { success: false, error: `Resource not found: ${resourcePath} in skill ${skillName}` };
    }
    return {
      success: true,
      skillName,
      resourcePath,
      content,
      size: content.length,
    };
  }) as ToolHandler<{ skillName: string; resourcePath: string }>,
};

/**
 * List Skill Resources Tool
 *
 * Lists available resources in a skill's directories.
 */
export const listSkillResourcesTool: Tool<{ skillName: string }> = {
  name: 'list_skill_resources',
  description:
    'List all available resources (scripts, references, assets) in a skill. Useful to see what files are available before reading them.',
  parameters: {
    type: 'object',
    properties: {
      skillName: {
        type: 'string',
        description: 'The name of the skill',
      },
    },
    required: ['skillName'],
  },
  handler: (async ({ skillName }) => {
    console.log(`[tool:list_skill_resources] Listing resources for ${skillName}`);
    const resources = await listSkillResources(skillName);
    return {
      success: true,
      skillName,
      resources,
      count: resources.length,
    };
  }) as ToolHandler<{ skillName: string }>,
};

/**
 * Run PowerShell Script Tool
 *
 * Executes a PowerShell command or script.
 * This enables skills to run PowerShell scripts.
 */
export const runPowerShellTool: Tool<{ script: string; workingDir?: string }> = {
  name: 'run_powershell',
  description:
    'Execute a PowerShell command or script. Use for automation tasks, especially when a skill requires running PowerShell scripts.',
  parameters: {
    type: 'object',
    properties: {
      script: {
        type: 'string',
        description: 'The PowerShell command or script to execute',
      },
      workingDir: {
        type: 'string',
        description: 'Optional working directory for the script',
      },
    },
    required: ['script'],
  },
  handler: (async ({ script, workingDir }) => {
    console.log(`[tool:run_powershell] Executing: ${script.substring(0, 100)}...`);
    try {
      const proc = Bun.spawn(['powershell', '-NoProfile', '-Command', script], {
        cwd: workingDir || process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      return {
        success: exitCode === 0,
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    } catch (err) {
      const error = err as Error;
      console.error('[tool:run_powershell] Error:', error.message);
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{ script: string; workingDir?: string }>,
};

// ============================================================================
// FILE EDITING TOOLS
// ============================================================================

/**
 * Write File Tool
 *
 * Creates or overwrites a file with the given content.
 */
export const writeFileTool: Tool<{ path: string; content: string }> = {
  name: 'write_file',
  description:
    'Create a new file or overwrite an existing file with the specified content. Use for creating new files or completely replacing file contents.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path (relative or absolute)',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  handler: (async ({ path, content }) => {
    console.log(`[tool:write_file] Writing to ${path}`);
    
    // Validate path is within sandbox
    const validation = validateWritePath(path);
    if (!validation.valid) {
      console.warn('[tool:write_file] Sandbox violation:', validation.error);
      return { success: false, error: validation.error };
    }
    
    try {
      await Bun.write(validation.resolvedPath, content);
      return {
        success: true,
        path: validation.resolvedPath,
        bytesWritten: content.length,
      };
    } catch (err) {
      const error = err as Error;
      console.error('[tool:write_file] Error:', error.message);
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{ path: string; content: string }>,
};

/**
 * Replace String in File Tool
 *
 * Find and replace text in a file (similar to VS Code Copilot's replace_string_in_file).
 */
export const replaceInFileTool: Tool<{
  path: string;
  oldString: string;
  newString: string;
}> = {
  name: 'replace_string_in_file',
  description:
    'Replace a specific string in a file. The oldString must match exactly (including whitespace and indentation). Include enough context to uniquely identify the location.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to edit',
      },
      oldString: {
        type: 'string',
        description: 'The exact text to find and replace (must match exactly)',
      },
      newString: {
        type: 'string',
        description: 'The text to replace it with',
      },
    },
    required: ['path', 'oldString', 'newString'],
  },
  handler: (async ({ path, oldString, newString }) => {
    console.log(`[tool:replace_string_in_file] Editing ${path}`);
    
    // Validate path is within sandbox
    const validation = validateWritePath(path);
    if (!validation.valid) {
      console.warn('[tool:replace_string_in_file] Sandbox violation:', validation.error);
      return { success: false, error: validation.error };
    }
    
    try {
      const file = Bun.file(validation.resolvedPath);
      if (!(await file.exists())) {
        return { success: false, error: `File not found: ${path}` };
      }

      const content = await file.text();
      const occurrences = content.split(oldString).length - 1;

      if (occurrences === 0) {
        return {
          success: false,
          error: 'String not found in file. Ensure exact match including whitespace.',
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          error: `String found ${occurrences} times. Add more context to uniquely identify the location.`,
        };
      }

      const newContent = content.replace(oldString, newString);
      await Bun.write(validation.resolvedPath, newContent);

      return {
        success: true,
        path: validation.resolvedPath,
        replacements: 1,
      };
    } catch (err) {
      const error = err as Error;
      console.error('[tool:replace_string_in_file] Error:', error.message);
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{ path: string; oldString: string; newString: string }>,
};

/**
 * List Directory Tool
 *
 * List contents of a directory.
 */
export const listDirTool: Tool<{ path: string; recursive?: boolean }> = {
  name: 'list_directory',
  description:
    'List the contents of a directory. Returns file and folder names.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list',
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to list recursively (default: false)',
      },
    },
    required: ['path'],
  },
  handler: (async ({ path, recursive = false }) => {
    console.log(`[tool:list_directory] Listing ${path}`);
    try {
      const glob = new Bun.Glob(recursive ? '**/*' : '*');
      const entries: string[] = [];

      for await (const entry of glob.scan({ cwd: path, dot: false })) {
        entries.push(entry);
        if (entries.length >= 500) break; // Limit results
      }

      return {
        success: true,
        path,
        entries,
        count: entries.length,
        truncated: entries.length >= 500,
      };
    } catch (err) {
      const error = err as Error;
      console.error('[tool:list_directory] Error:', error.message);
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{ path: string; recursive?: boolean }>,
};

// ============================================================================
// SEARCH TOOLS
// ============================================================================

/**
 * Grep Search Tool
 *
 * Search for text patterns across files in a directory.
 */
export const grepSearchTool: Tool<{
  pattern: string;
  path?: string;
  filePattern?: string;
  isRegex?: boolean;
  maxResults?: number;
}> = {
  name: 'grep_search',
  description:
    'Search for text or regex patterns across files. Returns matching lines with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The text or regex pattern to search for',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: current directory)',
      },
      filePattern: {
        type: 'string',
        description: 'Glob pattern for files to search (e.g., "**/*.ts")',
      },
      isRegex: {
        type: 'boolean',
        description: 'Whether pattern is a regex (default: false)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 50)',
      },
    },
    required: ['pattern'],
  },
  handler: (async ({ pattern, path = '.', filePattern = '**/*', isRegex = false, maxResults = 50 }) => {
    console.log(`[tool:grep_search] Searching for "${pattern}" in ${path}`);
    try {
      const glob = new Bun.Glob(filePattern);
      const matches: Array<{ file: string; line: number; content: string }> = [];
      const regex = isRegex ? new RegExp(pattern, 'gi') : null;

      // Directories to skip
      const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__'];
      
      for await (const filePath of glob.scan({ cwd: path, dot: false })) {
        if (matches.length >= maxResults) break;

        // Skip files in excluded directories
        if (skipDirs.some(dir => filePath.includes(`${dir}/`) || filePath.includes(`${dir}\\`))) {
          continue;
        }

        try {
          const fullPath = `${path}/${filePath}`;
          const file = Bun.file(fullPath);
          
          // Skip binary files and large files
          const size = file.size;
          if (size > 512 * 1024) continue; // Skip files > 512KB

          const content = await file.text();
          
          // Skip files that look binary (contain null bytes)
          if (content.includes('\0')) continue;
          
          const lines = content.split('\n');

          for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
            const line = lines[i];
            const found = regex
              ? regex.test(line)
              : line.toLowerCase().includes(pattern.toLowerCase());

            if (found) {
              matches.push({
                file: filePath,
                line: i + 1,
                content: line.trim().substring(0, 200),
              });
            }
            
            // Reset regex lastIndex for next iteration
            if (regex) regex.lastIndex = 0;
          }
        } catch {
          // Skip files that can't be read (binary, permissions, etc.)
        }
      }

      return {
        success: true,
        pattern,
        matches,
        count: matches.length,
        truncated: matches.length >= maxResults,
      };
    } catch (err) {
      const error = err as Error;
      console.error('[tool:grep_search] Error:', error.message);
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{
    pattern: string;
    path?: string;
    filePattern?: string;
    isRegex?: boolean;
    maxResults?: number;
  }>,
};

/**
 * File Search Tool
 *
 * Search for files by name pattern.
 */
export const fileSearchTool: Tool<{
  pattern: string;
  path?: string;
  maxResults?: number;
}> = {
  name: 'file_search',
  description:
    'Search for files by name pattern (glob). Returns matching file paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern to match file names (e.g., "**/*.ts", "**/test*.js")',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: current directory)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default: 100)',
      },
    },
    required: ['pattern'],
  },
  handler: (async ({ pattern, path = '.', maxResults = 100 }) => {
    console.log(`[tool:file_search] Searching for files matching "${pattern}"`);
    try {
      const glob = new Bun.Glob(pattern);
      const files: string[] = [];

      for await (const filePath of glob.scan({ cwd: path, dot: false })) {
        files.push(filePath);
        if (files.length >= maxResults) break;
      }

      return {
        success: true,
        pattern,
        files,
        count: files.length,
        truncated: files.length >= maxResults,
      };
    } catch (err) {
      const error = err as Error;
      console.error('[tool:file_search] Error:', error.message);
      return { success: false, error: error.message };
    }
  }) as ToolHandler<{ pattern: string; path?: string; maxResults?: number }>,
};

/**
 * Get all tools for registration with a session
 */
export function getAllTools(): Tool<unknown>[] {
  return [
    completeTaskTool as Tool<unknown>,
    fetchUrlTool as Tool<unknown>,
    getCurrentTimeTool as Tool<unknown>,
    readFileTool as Tool<unknown>,
    // Agent Skills tools (agentskills.io)
    listSkillsTool as Tool<unknown>,
    activateSkillTool as Tool<unknown>,
    readSkillResourceTool as Tool<unknown>,
    listSkillResourcesTool as Tool<unknown>,
    // PowerShell execution
    runPowerShellTool as Tool<unknown>,
    // File editing tools
    writeFileTool as Tool<unknown>,
    replaceInFileTool as Tool<unknown>,
    listDirTool as Tool<unknown>,
    // Search tools
    grepSearchTool as Tool<unknown>,
    fileSearchTool as Tool<unknown>,
  ];
}

/**
 * Create tools array for session config
 */
export function getToolsForSession(): Tool<unknown>[] {
  return getAllTools();
}
