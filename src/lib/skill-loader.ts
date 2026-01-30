/**
 * Skill Loader
 *
 * Implements Agent Skills standard (agentskills.io) with progressive disclosure:
 * 1. Metadata (~100 tokens): name + description loaded at startup
 * 2. Instructions (<5000 tokens): full SKILL.md body on activation
 * 3. Resources (as needed): scripts/, references/, assets/ on demand
 *
 * Configuration:
 * - SKILL_FOLDERS env var (comma-separated paths)
 * - Default: ~/.claude/skills
 */

import { homedir } from 'os';
import { join, resolve } from 'path';
import { readdir } from 'fs/promises';

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
}

export interface SkillContent extends SkillMetadata {
  instructions: string;
}

// In-memory cache of discovered skills
let skillCache: Map<string, SkillMetadata> = new Map();
let skillFolders: string[] = [];
let initialized = false;

/**
 * Get configured skill folders from environment or use default
 */
function getSkillFolders(): string[] {
  const envFolders = process.env.SKILL_FOLDERS;
  if (envFolders) {
    return envFolders.split(',').map((p) => p.trim()).filter(Boolean);
  }
  // Default: ~/.claude/skills
  return [join(homedir(), '.claude', 'skills')];
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    // No frontmatter, treat entire content as body
    return { frontmatter: {}, body: content };
  }

  const yamlStr = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Simple YAML parser for frontmatter (handles basic key: value pairs)
  const frontmatter: Record<string, unknown> = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentKey: string | null = null;
  let nestedObj: Record<string, string> | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const keyValueMatch = line.match(/^(\s*)([a-zA-Z_-]+):\s*(.*)$/);

    if (keyValueMatch) {
      const [, spaces, key, value] = keyValueMatch;
      const lineIndent = spaces?.length || 0;

      if (lineIndent === 0) {
        // Top-level key
        if (nestedObj && currentKey) {
          frontmatter[currentKey] = nestedObj;
        }
        currentKey = key;
        nestedObj = null;

        if (value) {
          frontmatter[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes
        }
      } else if (lineIndent > 0 && currentKey) {
        // Nested key (for metadata field)
        if (!nestedObj) nestedObj = {};
        nestedObj[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  // Don't forget the last nested object
  if (nestedObj && currentKey && !frontmatter[currentKey]) {
    frontmatter[currentKey] = nestedObj;
  }

  return { frontmatter, body };
}

/**
 * Discover a single skill from its directory
 */
async function discoverSkill(skillPath: string): Promise<SkillMetadata | null> {
  try {
    const skillMdPath = join(skillPath, 'SKILL.md');
    const file = Bun.file(skillMdPath);
    
    if (!(await file.exists())) {
      return null;
    }

    const content = await file.text();
    const { frontmatter } = parseFrontmatter(content);

    const name = frontmatter.name as string;
    const description = frontmatter.description as string;

    if (!name || !description) {
      console.warn(`[skill-loader] Skill at ${skillPath} missing required name or description`);
      return null;
    }

    return {
      name,
      description,
      path: skillPath,
      license: frontmatter.license as string | undefined,
      compatibility: frontmatter.compatibility as string | undefined,
      metadata: frontmatter.metadata as Record<string, string> | undefined,
      allowedTools: frontmatter['allowed-tools']
        ? (frontmatter['allowed-tools'] as string).split(/\s+/)
        : undefined,
    };
  } catch (err) {
    console.warn(`[skill-loader] Error reading skill at ${skillPath}:`, err);
    return null;
  }
}

/**
 * Discover all skills in configured folders
 * This implements Level 1 (metadata only) of progressive disclosure
 */
export async function discoverAllSkills(): Promise<SkillMetadata[]> {
  skillFolders = getSkillFolders();
  skillCache.clear();

  console.log('[skill-loader] Discovering skills in:', skillFolders.join(', '));

  for (const folder of skillFolders) {
    try {
      const resolvedFolder = resolve(folder.replace(/^~/, homedir()));
      const entries = await readdir(resolvedFolder, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = join(resolvedFolder, entry.name);
          const skill = await discoverSkill(skillPath);
          if (skill) {
            skillCache.set(skill.name, skill);
          }
        }
      }
    } catch (err) {
      console.warn(`[skill-loader] Could not read skill folder ${folder}:`, err);
    }
  }

  initialized = true;
  console.log(`[skill-loader] Discovered ${skillCache.size} skills`);
  return Array.from(skillCache.values());
}

/**
 * Get all discovered skills (metadata only)
 */
export function getAllSkillMetadata(): SkillMetadata[] {
  return Array.from(skillCache.values());
}

/**
 * Get a specific skill's metadata by name
 */
export function getSkillMetadata(name: string): SkillMetadata | undefined {
  return skillCache.get(name);
}

/**
 * Activate a skill - load full SKILL.md content
 * This implements Level 2 (full instructions) of progressive disclosure
 */
export async function activateSkill(name: string): Promise<SkillContent | null> {
  const metadata = skillCache.get(name);
  if (!metadata) {
    console.warn(`[skill-loader] Skill not found: ${name}`);
    return null;
  }

  try {
    const skillMdPath = join(metadata.path, 'SKILL.md');
    const content = await Bun.file(skillMdPath).text();
    const { body } = parseFrontmatter(content);

    return {
      ...metadata,
      instructions: body.trim(),
    };
  } catch (err) {
    console.error(`[skill-loader] Error activating skill ${name}:`, err);
    return null;
  }
}

/**
 * Read a resource file from an activated skill
 * This implements Level 3 (on-demand resources) of progressive disclosure
 */
export async function readSkillResource(
  skillName: string,
  relativePath: string
): Promise<string | null> {
  const metadata = skillCache.get(skillName);
  if (!metadata) {
    console.warn(`[skill-loader] Skill not found: ${skillName}`);
    return null;
  }

  // Prevent path traversal attacks
  const normalizedPath = relativePath.replace(/\\/g, '/');
  if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
    console.warn(`[skill-loader] Invalid resource path: ${relativePath}`);
    return null;
  }

  try {
    const resourcePath = join(metadata.path, normalizedPath);
    const file = Bun.file(resourcePath);
    
    if (!(await file.exists())) {
      return null;
    }

    return await file.text();
  } catch (err) {
    console.error(`[skill-loader] Error reading resource ${relativePath} from ${skillName}:`, err);
    return null;
  }
}

/**
 * List resources available in a skill
 */
export async function listSkillResources(skillName: string): Promise<string[]> {
  const metadata = skillCache.get(skillName);
  if (!metadata) {
    return [];
  }

  const resources: string[] = [];
  const dirs = ['scripts', 'references', 'assets'];

  for (const dir of dirs) {
    try {
      const dirPath = join(metadata.path, dir);
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          resources.push(`${dir}/${entry.name}`);
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return resources;
}

/**
 * Generate XML for system prompt injection
 * This follows the Agent Skills standard format for tool-based agents
 */
export function generateSkillsXml(): string {
  const skills = getAllSkillMetadata();
  
  if (skills.length === 0) {
    return '';
  }

  const skillEntries = skills
    .map(
      (s) => `  <skill>
    <name>${escapeXml(s.name)}</name>
    <description>${escapeXml(s.description)}</description>
  </skill>`
    )
    .join('\n');

  return `<available_skills>
${skillEntries}
</available_skills>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Check if skills have been initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Get skill count
 */
export function getSkillCount(): number {
  return skillCache.size;
}
