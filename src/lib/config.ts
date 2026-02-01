/**
 * Configuration System for hs-conductor
 *
 * Provides centralized, type-safe configuration with:
 * - YAML file-based configuration (config.yaml)
 * - Environment-specific overrides (config.{env}.yaml)
 * - Environment variable overrides (highest priority)
 * - Runtime reloading capability
 *
 * Priority (highest to lowest):
 * 1. Environment variables
 * 2. Environment-specific config file (config.dev.yaml, config.prod.yaml)
 * 3. Default config file (config.yaml)
 * 4. Built-in defaults
 */

import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

// ============ Configuration Schema ============

const ServerConfigSchema = z.object({
  /** HTTP server port */
  port: z.number().default(2900),
  /** CORS allowed origins ('*' for all) */
  corsOrigin: z.string().default('*'),
});

const InngestConfigSchema = z.object({
  /** Inngest dashboard/API URL */
  baseUrl: z.string().default('http://localhost:2901'),
  /** Event key for authentication */
  eventKey: z.string().optional(),
  /** Signing key for webhooks */
  signingKey: z.string().optional(),
});

const AIConfigSchema = z.object({
  /** Default model for AI workers */
  defaultModel: z.string().default('claude-sonnet-4.5'),
  /** Use mock AI responses instead of real API */
  useMock: z.boolean().default(false),
  /** Concurrency limit for AI workers */
  concurrency: z.number().default(1),
  /** Number of retries for failed AI requests */
  retries: z.number().default(2),
});

const PathsConfigSchema = z.object({
  /** Data directory for runs, alerts, schedules */
  data: z.string().default('./data'),
  /** Workloads directory */
  workloads: z.string().default('./workloads'),
  /** Skill folders (comma-separated or array) */
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  /** Allowed write paths for AI tools */
  allowedWritePath: z.string().optional(),
});

const LoggingConfigSchema = z.object({
  /** Log level: debug, info, warn, error */
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Include timestamps in logs */
  timestamps: z.boolean().default(true),
  /** Use colors in console output */
  colors: z.boolean().default(true),
});

const WorkersConfigSchema = z.object({
  /** Exec worker settings */
  exec: z.object({
    /** Timeout for exec commands in milliseconds */
    timeout: z.number().default(30000),
    /** Shell to use for exec commands */
    shell: z.string().default('pwsh'),
  }).default({}),
  /** Fetch worker settings */
  fetch: z.object({
    /** Timeout for fetch requests in milliseconds */
    timeout: z.number().default(30000),
    /** User agent for HTTP requests */
    userAgent: z.string().default('hs-conductor/0.1.0'),
  }).default({}),
});

const ConfigSchema = z.object({
  /** Environment name */
  env: z.enum(['development', 'staging', 'production']).default('development'),
  server: ServerConfigSchema.default({}),
  inngest: InngestConfigSchema.default({}),
  ai: AIConfigSchema.default({}),
  paths: PathsConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  workers: WorkersConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type InngestConfig = z.infer<typeof InngestConfigSchema>;
export type AIConfig = z.infer<typeof AIConfigSchema>;
export type PathsConfig = z.infer<typeof PathsConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type WorkersConfig = z.infer<typeof WorkersConfigSchema>;

// ============ Configuration Loading ============

let cachedConfig: Config | null = null;

/**
 * Find the project root by looking for package.json
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Load and parse a YAML config file
 */
function loadYamlFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    return YAML.parse(content) as Record<string, unknown>;
  } catch (err) {
    console.error(`[config] Error loading ${filePath}:`, err);
    return null;
  }
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key as keyof T];
    
    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key as keyof T] = deepMerge(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>
      ) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key as keyof T] = sourceValue as T[keyof T];
    }
  }
  
  return result;
}

/**
 * Apply environment variable overrides
 * Maps env vars to config paths:
 * - PORT -> server.port
 * - INNGEST_BASE_URL -> inngest.baseUrl
 * - COPILOT_MODEL -> ai.defaultModel
 * - etc.
 */
function applyEnvOverrides(config: Record<string, unknown>): Record<string, unknown> {
  const envMappings: Array<[string, string[], (v: string) => unknown]> = [
    // Environment
    ['NODE_ENV', ['env'], (v) => v === 'production' ? 'production' : v === 'staging' ? 'staging' : 'development'],
    ['CONDUCTOR_ENV', ['env'], (v) => v],
    
    // Server
    ['PORT', ['server', 'port'], (v) => parseInt(v, 10)],
    ['CORS_ORIGIN', ['server', 'corsOrigin'], (v) => v],
    
    // Inngest
    ['INNGEST_BASE_URL', ['inngest', 'baseUrl'], (v) => v],
    ['INNGEST_EVENT_KEY', ['inngest', 'eventKey'], (v) => v],
    ['INNGEST_SIGNING_KEY', ['inngest', 'signingKey'], (v) => v],
    
    // AI
    ['COPILOT_MODEL', ['ai', 'defaultModel'], (v) => v],
    ['USE_MOCK_AI', ['ai', 'useMock'], (v) => v === 'true'],
    ['AI_CONCURRENCY', ['ai', 'concurrency'], (v) => parseInt(v, 10)],
    ['AI_RETRIES', ['ai', 'retries'], (v) => parseInt(v, 10)],
    
    // Paths
    ['CONDUCTOR_DATA_PATH', ['paths', 'data'], (v) => v],
    ['WORKLOADS_DIR', ['paths', 'workloads'], (v) => v],
    ['SKILL_FOLDERS', ['paths', 'skills'], (v) => v],
    ['ALLOWED_WRITE_PATH', ['paths', 'allowedWritePath'], (v) => v],
    
    // Logging
    ['LOG_LEVEL', ['logging', 'level'], (v) => v],
  ];
  
  for (const [envKey, path, transform] of envMappings) {
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      let current: Record<string, unknown> = config;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
      }
      current[path[path.length - 1]] = transform(envValue);
    }
  }
  
  return config;
}

/**
 * Load configuration with proper layering
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }
  
  const projectRoot = findProjectRoot();
  
  // 1. Start with empty config (defaults come from schema)
  let config: Record<string, unknown> = {};
  
  // 2. Load base config.yaml
  const baseConfigPath = join(projectRoot, 'config.yaml');
  const baseConfig = loadYamlFile(baseConfigPath);
  if (baseConfig) {
    config = deepMerge(config, baseConfig);
    console.log('[config] Loaded config.yaml');
  }
  
  // 3. Load environment-specific config
  const env = process.env.NODE_ENV || process.env.CONDUCTOR_ENV || 'development';
  const envShort = env === 'production' ? 'prod' : env === 'staging' ? 'staging' : 'dev';
  const envConfigPath = join(projectRoot, `config.${envShort}.yaml`);
  const envConfig = loadYamlFile(envConfigPath);
  if (envConfig) {
    config = deepMerge(config, envConfig);
    console.log(`[config] Loaded config.${envShort}.yaml`);
  }
  
  // 4. Apply environment variable overrides
  config = applyEnvOverrides(config);
  
  // 5. Validate and apply defaults
  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    console.error('[config] Invalid configuration:', result.error.flatten());
    throw new Error('Invalid configuration');
  }
  
  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Get the current configuration
 */
export function getConfig(): Config {
  return cachedConfig ?? loadConfig();
}

/**
 * Reload configuration from files
 */
export function reloadConfig(): Config {
  cachedConfig = null;
  return loadConfig();
}

/**
 * Reset configuration cache (for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}

// ============ Convenience Accessors ============

/** Get server configuration */
export function getServerConfig(): ServerConfig {
  return getConfig().server;
}

/** Get Inngest configuration */
export function getInngestConfig(): InngestConfig {
  return getConfig().inngest;
}

/** Get AI configuration */
export function getAIConfig(): AIConfig {
  return getConfig().ai;
}

/** Get paths configuration */
export function getPathsConfig(): PathsConfig {
  return getConfig().paths;
}

/** Get logging configuration */
export function getLoggingConfig(): LoggingConfig {
  return getConfig().logging;
}

/** Get workers configuration */
export function getWorkersConfig(): WorkersConfig {
  return getConfig().workers;
}

/**
 * Get skill folders as an array
 */
export function getSkillFolders(): string[] {
  const skills = getPathsConfig().skills;
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  return skills.split(',').map((s) => s.trim()).filter(Boolean);
}
