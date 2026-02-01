/**
 * hs-conductor - Event-Driven Multi-Agent Orchestration
 *
 * Main entry point for the development server.
 * Serves Inngest functions via Express.
 */
import express from 'express';
import { serve } from 'inngest/express';
import chalk from 'chalk';
import boxen from 'boxen';
import { inngest } from './inngest/client.js';
import { getConfig, getServerConfig, getInngestConfig, getPathsConfig } from './lib/config.js';
import { aiWorker } from './workers/ai-worker.js';
import { execWorker } from './workers/exec-worker.js';
import { fetchWorker } from './workers/fetch-worker.js';
import { countdownWorker } from './workers/countdown-worker.js';
import { alertWorker } from './workers/alert-worker.js';
import { planOrchestrator, taskProgressHandler } from './workers/task-manager.js';
import { schedulerWorker, scheduledWorkloadHandler } from './workers/scheduler.js';
import { listWorkloads, getWorkload, reloadWorkloads, getWorkloadPath, getValidationErrors } from './lib/workload-loader.js';
import { validateWorkload } from './types/workload-schemas.js';
import YAML from 'yaml';
import { executeWorkload } from './lib/executor.js';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { CronExpressionParser } from 'cron-parser';

const app = express();
const config = getConfig();
const serverConfig = getServerConfig();
const pathsConfig = getPathsConfig();
const port = serverConfig.port;

// Enable CORS for admin UI
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// Parse JSON bodies
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get current configuration (read-only view)
app.get('/config', (_req, res) => {
  const cfg = config;
  // Return sanitized config (no secrets in clear text)
  res.json({
    env: cfg.env,
    server: {
      port: cfg.server.port,
      corsOrigin: cfg.server.corsOrigin,
    },
    inngest: {
      baseUrl: cfg.inngest.baseUrl,
      eventKey: cfg.inngest.eventKey ? '••••••••' : undefined,
      signingKey: cfg.inngest.signingKey ? '••••••••' : undefined,
    },
    ai: cfg.ai,
    paths: cfg.paths,
    logging: cfg.logging,
    workers: cfg.workers,
  });
});

// List all workloads
app.get('/workloads', (_req, res) => {
  const all = listWorkloads();
  const validationErrors = getValidationErrors();
  
  // Build a map of file path -> errors for quick lookup
  const errorsByFile = new Map<string, { errors: string[]; warnings: string[] }>();
  for (const ve of validationErrors) {
    errorsByFile.set(ve.file, { errors: ve.errors, warnings: ve.warnings });
  }
  
  res.json(
    all.map((w) => {
      // Find validation issues for this workload
      const path = getWorkloadPath(w.id);
      const issues = path ? errorsByFile.get(path) : undefined;
      
      // Extract folder from relative path (e.g., "tasks/news-digest.yaml" -> "tasks")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const relativePath = (w as any)._relativePath as string | undefined;
      const folder = relativePath ? relativePath.replace(/\/[^/]+$/, '').replace(/\\[^\\]+$/, '') : '';
      // If no subfolder (file in root), folder will be the filename itself, so check
      const folderPath = folder.includes('.yaml') || folder.includes('.yml') ? '' : folder;
      
      return {
        id: w.id,
        name: w.name,
        folder: folderPath,
        description: w.description,
        tags: w.tags,
        validationErrors: issues?.errors,
        validationWarnings: issues?.warnings,
      };
    })
  );
});

// Get all validation errors (including files that failed to load)
app.get('/workloads/errors', (_req, res) => {
  const errors = getValidationErrors();
  res.json(errors);
});

// Get workload details
app.get('/workloads/:id', (req, res) => {
  const workload = getWorkload(req.params.id);
  if (!workload) {
    res.status(404).json({ error: 'Workload not found' });
    return;
  }
  
  // Include raw YAML content
  const yamlPath = getWorkloadPath(req.params.id);
  let yaml = '';
  if (yamlPath) {
    try {
      yaml = readFileSync(yamlPath, 'utf-8');
    } catch {
      yaml = '# Error reading YAML file';
    }
  }
  
  res.json({ ...workload, yaml });
});

// Validate workload YAML without saving
app.post('/workloads/:id/validate', (req, res) => {
  const { yaml: yamlContent } = req.body;
  
  if (!yamlContent || typeof yamlContent !== 'string') {
    res.status(400).json({ error: 'YAML content required' });
    return;
  }
  
  // Parse YAML
  let parsed;
  try {
    parsed = YAML.parse(yamlContent);
  } catch (parseError) {
    res.status(400).json({
      error: 'Invalid YAML syntax',
      details: parseError instanceof Error ? parseError.message : 'Parse error'
    });
    return;
  }
  
  // Validate against schema
  const validation = validateWorkload(parsed, 'workload.yaml');
  if (!validation.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: validation.error
    });
    return;
  }
  
  res.json({ valid: true });
});

// Update workload YAML
app.put('/workloads/:id', (req, res) => {
  const { id } = req.params;
  const { yaml: yamlContent } = req.body;
  
  if (!yamlContent || typeof yamlContent !== 'string') {
    res.status(400).json({ error: 'YAML content required' });
    return;
  }
  
  const yamlPath = getWorkloadPath(id);
  if (!yamlPath) {
    res.status(404).json({ error: 'Workload not found' });
    return;
  }
  
  // Parse and validate the YAML
  let parsed;
  try {
    parsed = YAML.parse(yamlContent);
  } catch (parseError) {
    res.status(400).json({
      error: 'Invalid YAML syntax',
      details: parseError instanceof Error ? parseError.message : 'Parse error'
    });
    return;
  }
  
  // Validate against schema
  const validation = validateWorkload(parsed, `${id}.yaml`);
  if (!validation.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: validation.error
    });
    return;
  }
  
  try {
    writeFileSync(yamlPath, yamlContent, 'utf-8');
    // Reload workloads to pick up changes
    reloadWorkloads();
    res.json({ success: true, message: 'Workload saved' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to save workload',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new workload
app.post('/workloads', (req, res) => {
  const { yaml: yamlContent } = req.body;
  
  if (!yamlContent || typeof yamlContent !== 'string') {
    res.status(400).json({ error: 'YAML content required' });
    return;
  }
  
  // Parse YAML to get id and type
  let parsed;
  try {
    parsed = YAML.parse(yamlContent);
  } catch (parseError) {
    res.status(400).json({
      error: 'Invalid YAML syntax',
      details: parseError instanceof Error ? parseError.message : 'Parse error'
    });
    return;
  }
  
  if (!parsed.id || !parsed.type) {
    res.status(400).json({ error: 'Workload must have id and type fields' });
    return;
  }
  
  // Validate against schema
  const validation = validateWorkload(parsed, `${parsed.id}.yaml`);
  if (!validation.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: validation.error
    });
    return;
  }
  
  // Check if workload already exists
  if (getWorkload(parsed.id)) {
    res.status(409).json({ error: `Workload with id "${parsed.id}" already exists` });
    return;
  }
  
  // Map type to folder
  const categoryMap: Record<string, string> = {
    'ad-hoc': 'ad-hoc',
    task: 'tasks',
    workflow: 'workflows',
  };
  
  const category = categoryMap[parsed.type];
  if (!category) {
    res.status(400).json({ error: `Invalid workload type: ${parsed.type}. Must be ad-hoc, task, or workflow.` });
    return;
  }
  
  const filePath = `workloads/${category}/${parsed.id}.yaml`;
  
  try {
    // Create the file
    writeFileSync(filePath, yamlContent, 'utf-8');
    reloadWorkloads();
    
    res.json({ success: true, message: 'Workload created', id: parsed.id });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to create workload',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a workload
app.delete('/workloads/:id', (req, res) => {
  const { id } = req.params;
  
  const yamlPath = getWorkloadPath(id);
  if (!yamlPath) {
    res.status(404).json({ error: 'Workload not found' });
    return;
  }
  
  try {
    require('fs').unlinkSync(yamlPath);
    reloadWorkloads();
    res.json({ success: true, message: `Deleted workload ${id}` });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete workload',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Move a workload to a different folder
app.post('/workloads/:id/move', (req, res) => {
  const { id } = req.params;
  const { targetFolder } = req.body;
  
  if (typeof targetFolder !== 'string') {
    res.status(400).json({ error: 'Target folder required' });
    return;
  }
  
  const yamlPath = getWorkloadPath(id);
  if (!yamlPath) {
    res.status(404).json({ error: 'Workload not found' });
    return;
  }
  
  // Get the filename from current path
  const filename = yamlPath.split(/[/\\]/).pop();
  if (!filename) {
    res.status(500).json({ error: 'Could not determine filename' });
    return;
  }
  
  // Sanitize target folder - only allow alphanumeric, dash, underscore, and forward slash
  const sanitizedFolder = targetFolder
    .replace(/[^a-zA-Z0-9-_/]/g, '')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  
  // Build new path
  const WORKLOADS_BASE = pathsConfig.workloads;
  const newPath = sanitizedFolder 
    ? join(WORKLOADS_BASE, sanitizedFolder, filename)
    : join(WORKLOADS_BASE, filename);
  
  // Check if target already exists
  if (existsSync(newPath) && newPath !== yamlPath) {
    res.status(409).json({ error: 'A workload with that name already exists in the target folder' });
    return;
  }
  
  // Ensure target directory exists
  const targetDir = dirname(newPath);
  if (!existsSync(targetDir)) {
    try {
      mkdirSync(targetDir, { recursive: true });
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to create target folder',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
      return;
    }
  }
  
  try {
    renameSync(yamlPath, newPath);
    reloadWorkloads();
    res.json({ 
      success: true, 
      message: `Moved workload to ${sanitizedFolder || 'root'}`,
      newFolder: sanitizedFolder || ''
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to move workload',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============ FOLDER MANAGEMENT ============

const WORKLOADS_DIR = pathsConfig.workloads;

/**
 * Helper to get all folders recursively
 */
function getAllFolders(basePath: string, relativePath: string = ''): string[] {
  const folders: string[] = [];
  const fullPath = relativePath ? join(basePath, relativePath) : basePath;
  
  if (!existsSync(fullPath)) return folders;
  
  const entries = readdirSync(fullPath);
  for (const entry of entries) {
    const entryPath = join(fullPath, entry);
    const relPath = relativePath ? `${relativePath}/${entry}` : entry;
    
    if (statSync(entryPath).isDirectory()) {
      folders.push(relPath);
      folders.push(...getAllFolders(basePath, relPath));
    }
  }
  
  return folders;
}

/**
 * Check if a folder is empty (no files, only empty subfolders count as empty)
 */
function isFolderEmpty(folderPath: string): boolean {
  if (!existsSync(folderPath)) return true;
  
  const entries = readdirSync(folderPath);
  for (const entry of entries) {
    const entryPath = join(folderPath, entry);
    const stat = statSync(entryPath);
    
    if (stat.isFile()) return false;
    if (stat.isDirectory() && !isFolderEmpty(entryPath)) return false;
  }
  
  return true;
}

// List all folders in workloads directory
app.get('/folders', (_req, res) => {
  try {
    const folders = getAllFolders(WORKLOADS_DIR);
    
    // Get workload count per folder
    const workloads = listWorkloads();
    const folderCounts: Record<string, number> = { '': 0 };
    
    for (const folder of folders) {
      folderCounts[folder] = 0;
    }
    
    for (const w of workloads) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const relativePath = (w as any)._relativePath as string | undefined;
      const folder = relativePath ? dirname(relativePath).replace(/\\/g, '/') : '';
      const normalizedFolder = folder === '.' ? '' : folder;
      if (folderCounts[normalizedFolder] !== undefined) {
        folderCounts[normalizedFolder]++;
      } else {
        folderCounts['']++;
      }
    }
    
    res.json(folders.map(f => ({
      path: f,
      workloadCount: folderCounts[f] || 0,
      isEmpty: isFolderEmpty(join(WORKLOADS_DIR, f)),
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// Create a new folder
app.post('/folders', (req, res) => {
  const { path: folderPath } = req.body;
  
  if (!folderPath || typeof folderPath !== 'string') {
    res.status(400).json({ error: 'Folder path required' });
    return;
  }
  
  // Sanitize path - only allow alphanumeric, dash, underscore, and forward slash
  const sanitized = folderPath.replace(/[^a-zA-Z0-9-_/]/g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  if (!sanitized) {
    res.status(400).json({ error: 'Invalid folder path' });
    return;
  }
  
  const fullPath = join(WORKLOADS_DIR, sanitized);
  
  if (existsSync(fullPath)) {
    res.status(409).json({ error: 'Folder already exists' });
    return;
  }
  
  try {
    mkdirSync(fullPath, { recursive: true });
    reloadWorkloads();
    res.json({ success: true, path: sanitized, message: `Created folder: ${sanitized}` });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create folder',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Rename a folder
app.put('/folders/*', (req, res) => {
  const oldPath = (req.params as unknown as Record<string, string>)[0];
  const { newName } = req.body;
  
  if (!oldPath) {
    res.status(400).json({ error: 'Folder path required' });
    return;
  }
  
  if (!newName || typeof newName !== 'string') {
    res.status(400).json({ error: 'New name required' });
    return;
  }
  
  // Sanitize new name - only allow alphanumeric, dash, underscore
  const sanitizedName = newName.replace(/[^a-zA-Z0-9-_]/g, '');
  if (!sanitizedName) {
    res.status(400).json({ error: 'Invalid folder name' });
    return;
  }
  
  const fullOldPath = join(WORKLOADS_DIR, oldPath);
  
  if (!existsSync(fullOldPath)) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }
  
  // Calculate new path (keep parent directory, change only the folder name)
  const parentDir = dirname(oldPath);
  const newPath = parentDir === '.' ? sanitizedName : `${parentDir}/${sanitizedName}`;
  const fullNewPath = join(WORKLOADS_DIR, newPath);
  
  if (existsSync(fullNewPath)) {
    res.status(409).json({ error: 'A folder with that name already exists' });
    return;
  }
  
  try {
    renameSync(fullOldPath, fullNewPath);
    reloadWorkloads();
    res.json({ success: true, oldPath, newPath, message: `Renamed folder: ${oldPath} → ${newPath}` });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to rename folder',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a folder (optionally with contents if force=true)
app.delete('/folders/*', (req, res) => {
  const folderPath = (req.params as unknown as Record<string, string>)[0];
  const force = req.query.force === 'true';
  
  if (!folderPath) {
    res.status(400).json({ error: 'Folder path required' });
    return;
  }
  
  const fullPath = join(WORKLOADS_DIR, folderPath);
  
  if (!existsSync(fullPath)) {
    res.status(404).json({ error: 'Folder not found' });
    return;
  }
  
  const isEmpty = isFolderEmpty(fullPath);
  
  if (!isEmpty && !force) {
    res.status(400).json({ error: 'Cannot delete non-empty folder. Use force=true to delete with contents.' });
    return;
  }
  
  try {
    // Recursively delete directory and all contents
    const deleteRecursive = (path: string) => {
      const entries = readdirSync(path);
      for (const entry of entries) {
        const entryPath = join(path, entry);
        if (statSync(entryPath).isDirectory()) {
          deleteRecursive(entryPath);
        } else {
          unlinkSync(entryPath);
        }
      }
      rmdirSync(path);
    };
    
    deleteRecursive(fullPath);
    reloadWorkloads();
    res.json({ success: true, message: `Deleted folder: ${folderPath}`, force });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete folder',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Execute a workload
app.post('/run/:workloadId', async (req, res) => {
  try {
    const { workloadId } = req.params;
    const input = req.body || {};

    const instance = await executeWorkload(workloadId, input);

    res.json({
      success: true,
      instanceId: instance.instanceId,
      status: instance.status,
      message: `Workload ${workloadId} started`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Reload workloads (hot reload YAML files)
app.post('/reload', (_req, res) => {
  reloadWorkloads();
  const count = listWorkloads().length;
  res.json({ success: true, message: `Reloaded ${count} workloads` });
});

// List recent runs
app.get('/runs', (_req, res) => {
  const runsDir = 'data/runs';
  if (!existsSync(runsDir)) {
    res.json([]);
    return;
  }
  
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  
  // Helper to extract summary from content
  const extractSummary = (runPath: string, files: string[]): string | null => {
    // Priority order for finding content to summarize
    const resultFiles = files.filter(f => 
      f.startsWith('result.') || 
      f.endsWith('.md') ||
      f === 'digest.md' ||
      f === 'report.md'
    );
    
    if (resultFiles.length === 0) return null;
    
    try {
      const filePath = `${runPath}/${resultFiles[0]}`;
      const content = readFileSync(filePath, 'utf-8');
      
      // For JSON files, try to extract meaningful content
      if (resultFiles[0].endsWith('.json')) {
        const json = JSON.parse(content);
        if (json.summary) return json.summary.slice(0, 80);
        if (json.title) return json.title.slice(0, 80);
        if (json.result) return String(json.result).slice(0, 80);
        // Weather-specific: combine location and conditions
        if (json.location && json.conditions) {
          const temp = json.temperature?.value ? ` ${json.temperature.value}°${json.temperature.unit || 'F'}` : '';
          return `${json.location}: ${json.conditions}${temp}`.slice(0, 80);
        }
        if (json.location) return json.location.slice(0, 80);
        // Try to get first string value from JSON
        const firstValue = Object.values(json).find(v => typeof v === 'string' && v.length > 5);
        if (firstValue) return String(firstValue).slice(0, 80);
        return null;
      }
      
      // For markdown/text files, get first meaningful line
      const lines = content.split('\n')
        .map(l => l.trim())
        .filter(l => {
          if (!l) return false;
          // Keep numbered headlines like "## 1. Title" - check this BEFORE filtering all headers
          if (/^##?\s*\d+\./.test(l)) return true;
          if (l.startsWith('#')) return false;
          if (l.startsWith('**Generated')) return false;
          if (l.startsWith('---')) return false;
          if (/^\*\*[A-Z][a-z]+ \d+, \d{4}\*\*$/.test(l)) return false; // **January 28, 2026**
          return true;
        });
      
      if (lines.length === 0) return null;
      
      // Get first content line, strip markdown formatting
      let summary = lines[0]
        .replace(/^##+\s*\d+\.\s*/, '') // Remove "## 1. " or "# 1. " prefix
        .replace(/^\*\*.*?\*\*\s*/, '') // Remove bold markers with content
        .replace(/\*\*/g, '')  // Remove remaining bold markers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](link) -> text
        .replace(/`/g, '')  // Remove code ticks
        .trim();
      
      // Truncate and add ellipsis
      if (summary.length > 80) {
        summary = summary.slice(0, 77) + '...';
      }
      
      return summary || null;
    } catch {
      return null;
    }
  };
  
  try {
    const entries = readdirSync(runsDir);
    const runs = entries
      .map(name => {
        const runPath = `${runsDir}/${name}`;
        const stats = statSync(runPath);
        
        // Try to read plan.json for status
        let status = 'pending';
        
        // Extract workloadId from instanceId
        // Handles both formats:
        // - New: workload-id-YYYY-MM-DD-HHmmss (e.g., joke-2026-01-28-032639)
        // - Old: workload-id-unixTimestamp (e.g., joke-1769578817399)
        const parts = name.split('-');
        let workloadId = name;
        
        // Check if it matches new format (last 4 parts are date-time)
        if (parts.length >= 5 && /^\d{4}$/.test(parts[parts.length - 4])) {
          // New format: YYYY-MM-DD-HHmmss
          workloadId = parts.slice(0, -4).join('-');
        } else if (parts.length >= 2 && /^\d{10,}$/.test(parts[parts.length - 1])) {
          // Old format: Unix timestamp (10+ digits)
          workloadId = parts.slice(0, -1).join('-');
        }
        
        // Get files list for status check and summary
        let files: string[] = [];
        try {
          files = readdirSync(runPath);
        } catch { /* ignore */ }
        
        // Try to read run.json manifest (new format)
        let duration: number | undefined;
        const manifestPath = `${runPath}/run.json`;
        if (existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
            status = manifest.status || 'pending';
            duration = manifest.duration;
          } catch { /* ignore */ }
        } else {
          // Fall back to plan.json (old format)
          const planPath = `${runPath}/plan.json`;
          if (existsSync(planPath)) {
            try {
              const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
              status = plan.status || 'pending';
            } catch { /* ignore */ }
          } else {
            // Check for result files to determine completion
            // Look for result.*, *.md (excluding README), or meaningful output files
            const hasResults = files.some(f => 
              f.startsWith('result.') || 
              (f.endsWith('.md') && f !== 'README.md') ||
              f === 'digest.md' ||
              f === 'report.md' ||
              f === 'daily-report.md'
            );
            if (hasResults) {
              status = 'completed';
            }
          }
        }
        
        // Mark stale pending runs as failed (orphaned jobs)
        const age = now - stats.birthtime.getTime();
        if (status === 'pending' && age > STALE_THRESHOLD_MS) {
          status = 'failed';
        }
        
        // Extract summary from result content
        const summary = status === 'completed' ? extractSummary(runPath, files) : null;
        
        // Count output files (excluding run.json, plan.json, .keep)
        const outputCount = files.filter(f => 
          f !== 'run.json' && f !== 'plan.json' && f !== '.keep'
        ).length;
        
        return {
          instanceId: name,
          workloadId,
          status,
          createdAt: stats.birthtime.toISOString(),
          summary,
          duration,
          outputCount,
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20); // Limit to 20 most recent
    
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// Get run status and files
app.get('/runs/:instanceId', (req, res) => {
  const { instanceId } = req.params;
  const runPath = `data/runs/${instanceId}`;
  
  if (!existsSync(runPath)) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  
  try {
    const files = readdirSync(runPath);
    let status = 'pending';
    let plan = null;
    let manifest = null;
    
    // Try to read run.json manifest (new format)
    const manifestPath = `${runPath}/run.json`;
    if (existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        status = manifest.status || 'pending';
      } catch { /* ignore */ }
    }
    
    // Fall back to plan.json (old format)
    if (!manifest) {
      const planPath = `${runPath}/plan.json`;
      if (existsSync(planPath)) {
        plan = JSON.parse(readFileSync(planPath, 'utf-8'));
        status = plan.status || 'pending';
      } else if (files.some(f => f.startsWith('result.'))) {
        status = 'completed';
      }
    }
    
    // Categorize files (exclude run.json, plan.json, .keep from assets)
    const results = files.filter(f => (f.startsWith('result.') || f.endsWith('.md')) && f !== '.keep');
    const assets = files.filter(f => f.endsWith('.json') && f !== 'plan.json' && f !== 'run.json');
    
    // Build file details with sizes and types (exclude .keep)
    const filteredFiles = files.filter(f => f !== '.keep');
    const fileDetails = filteredFiles.map(f => {
      const filePath = `${runPath}/${f}`;
      try {
        const stats = statSync(filePath);
        return {
          name: f,
          size: stats.size,
          type: f.endsWith('.json') ? 'json' : f.endsWith('.md') ? 'markdown' : 'text',
          isResult: f.startsWith('result.') || f.endsWith('.md'),
          isAsset: f.endsWith('.json') && f !== 'plan.json' && f !== 'run.json',
          isManifest: f === 'run.json',
        };
      } catch {
        return { name: f, size: 0, type: 'unknown', isResult: false, isAsset: false, isManifest: false };
      }
    });
    
    res.json({
      instanceId,
      status,
      files: { results, assets, all: files, details: fileDetails },
      plan,
      manifest,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read run' });
  }
});

// Delete a run
app.delete('/runs/:instanceId', (req, res) => {
  const { instanceId } = req.params;
  const runPath = `data/runs/${instanceId}`;
  
  if (!existsSync(runPath)) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  
  try {
    // Recursively delete the run directory
    const deleteRecursive = (path: string) => {
      if (statSync(path).isDirectory()) {
        for (const file of readdirSync(path)) {
          deleteRecursive(`${path}/${file}`);
        }
        require('fs').rmdirSync(path);
      } else {
        require('fs').unlinkSync(path);
      }
    };
    deleteRecursive(runPath);
    res.json({ success: true, message: `Deleted run ${instanceId}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete run' });
  }
});

// Delete all failed runs
app.delete('/runs', (_req, res) => {
  const runsDir = 'data/runs';
  if (!existsSync(runsDir)) {
    res.json({ success: true, deleted: 0 });
    return;
  }
  
  const STALE_THRESHOLD_MS = 5 * 60 * 1000;
  const now = Date.now();
  let deleted = 0;
  
  try {
    const entries = readdirSync(runsDir);
    for (const name of entries) {
      const runPath = `${runsDir}/${name}`;
      const stats = statSync(runPath);
      const planPath = `${runPath}/plan.json`;
      const files = readdirSync(runPath);
      
      let status = 'pending';
      if (existsSync(planPath)) {
        try {
          const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
          status = plan.status || 'pending';
        } catch { /* ignore */ }
      } else {
        const hasResults = files.some(f => 
          f.startsWith('result.') || 
          (f.endsWith('.md') && f !== 'README.md') ||
          f === 'digest.md' ||
          f === 'report.md' ||
          f === 'daily-report.md'
        );
        if (hasResults) {
          status = 'completed';
        }
      }
      
      const age = now - stats.birthtime.getTime();
      const isFailed = status === 'failed' || (status === 'pending' && age > STALE_THRESHOLD_MS);
      
      if (isFailed) {
        const deleteRecursive = (path: string) => {
          if (statSync(path).isDirectory()) {
            for (const file of readdirSync(path)) {
              deleteRecursive(`${path}/${file}`);
            }
            require('fs').rmdirSync(path);
          } else {
            require('fs').unlinkSync(path);
          }
        };
        deleteRecursive(runPath);
        deleted++;
      }
    }
    
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete failed runs' });
  }
});

// Get a specific file from a run
app.get('/runs/:instanceId/file/:filename', (req, res) => {
  const { instanceId, filename } = req.params;
  const filePath = `data/runs/${instanceId}/${filename}`;
  
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const isJson = filename.endsWith('.json');
    
    if (isJson) {
      res.json({ content: JSON.parse(content), raw: content });
    } else {
      res.json({ content, raw: content });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// ============ SCHEDULES ============

const SCHEDULES_DIR = 'data/schedules';

// Ensure schedules directory exists
if (!existsSync(SCHEDULES_DIR)) {
  require('fs').mkdirSync(SCHEDULES_DIR, { recursive: true });
}

// List all schedules
app.get('/schedules', (_req, res) => {
  try {
    if (!existsSync(SCHEDULES_DIR)) {
      res.json([]);
      return;
    }
    
    const files = readdirSync(SCHEDULES_DIR).filter(f => f.endsWith('.json'));
    const schedules = files.map(file => {
      const content = readFileSync(`${SCHEDULES_DIR}/${file}`, 'utf-8');
      return JSON.parse(content);
    });
    
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list schedules' });
  }
});

// Get upcoming scheduled runs with next occurrence times
// IMPORTANT: This must come BEFORE /schedules/:id to avoid matching 'upcoming' as an id
app.get('/schedules/upcoming', (_req, res) => {
  try {
    if (!existsSync(SCHEDULES_DIR)) {
      res.json([]);
      return;
    }
    
    const files = readdirSync(SCHEDULES_DIR).filter(f => f.endsWith('.json'));
    const upcoming: Array<{
      scheduleId: string;
      scheduleName: string;
      workloadId: string;
      cron: string;
      nextOccurrence: string;
      previousOccurrence?: string;
      enabled: boolean;
    }> = [];
    
    for (const file of files) {
      try {
        const content = readFileSync(`${SCHEDULES_DIR}/${file}`, 'utf-8');
        const schedule = JSON.parse(content);
        
        if (schedule.enabled && schedule.cron) {
          try {
            const expr = CronExpressionParser.parse(schedule.cron);
            const next = expr.next().toDate();
            
            // Calculate previous occurrence for progress bar
            let previousOccurrence: string | undefined;
            try {
              const prevExpr = CronExpressionParser.parse(schedule.cron);
              const prev = prevExpr.prev().toDate();
              previousOccurrence = prev.toISOString();
            } catch {
              // Previous occurrence calculation failed, leave undefined
            }
            
            upcoming.push({
              scheduleId: schedule.id,
              scheduleName: schedule.name,
              workloadId: schedule.workloadId,
              cron: schedule.cron,
              nextOccurrence: next.toISOString(),
              previousOccurrence,
              enabled: schedule.enabled,
            });
          } catch (cronErr) {
            // Skip invalid cron expressions
            console.error(`Invalid cron for schedule ${schedule.id}:`, cronErr);
          }
        }
      } catch (parseErr) {
        console.error(`Failed to parse schedule ${file}:`, parseErr);
      }
    }
    
    // Sort by next occurrence (soonest first)
    upcoming.sort((a, b) => new Date(a.nextOccurrence).getTime() - new Date(b.nextOccurrence).getTime());
    
    res.json(upcoming);
  } catch (err) {
    res.status(500).json({ error: 'Failed to get upcoming schedules' });
  }
});

// Get a specific schedule
app.get('/schedules/:id', (req, res) => {
  const { id } = req.params;
  const filePath = `${SCHEDULES_DIR}/${id}.json`;
  
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read schedule' });
  }
});

// Create or update a schedule
app.post('/schedules', (req, res) => {
  try {
    const schedule = req.body;
    
    if (!schedule.id || !schedule.workloadId) {
      res.status(400).json({ error: 'Schedule requires id and workloadId' });
      return;
    }
    
    // Add defaults
    const fullSchedule = {
      id: schedule.id,
      name: schedule.name || schedule.workloadId,
      workloadId: schedule.workloadId,
      cron: schedule.cron || null,
      interval: schedule.interval || null, // e.g., "5m", "1h", "1d"
      enabled: schedule.enabled ?? true,
      params: schedule.params || {},
      createdAt: schedule.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    const filePath = `${SCHEDULES_DIR}/${schedule.id}.json`;
    require('fs').writeFileSync(filePath, JSON.stringify(fullSchedule, null, 2));
    
    res.json({ success: true, schedule: fullSchedule });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

// Delete a schedule
app.delete('/schedules/:id', (req, res) => {
  const { id } = req.params;
  const filePath = `${SCHEDULES_DIR}/${id}.json`;
  
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }
  
  try {
    require('fs').unlinkSync(filePath);
    res.json({ success: true, message: `Deleted schedule ${id}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

// Toggle schedule enabled/disabled
app.patch('/schedules/:id/toggle', (req, res) => {
  const { id } = req.params;
  const filePath = `${SCHEDULES_DIR}/${id}.json`;
  
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'Schedule not found' });
    return;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const schedule = JSON.parse(content);
    schedule.enabled = !schedule.enabled;
    schedule.updatedAt = new Date().toISOString();
    require('fs').writeFileSync(filePath, JSON.stringify(schedule, null, 2));
    res.json({ success: true, schedule });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle schedule' });
  }
});

// Serve Inngest functions
app.use(
  '/api/inngest',
  serve({
    client: inngest,
    functions: [aiWorker, execWorker, fetchWorker, countdownWorker, alertWorker, planOrchestrator, taskProgressHandler, schedulerWorker, scheduledWorkloadHandler],
  })
);

// Start server
app.listen(port, () => {
  const inngestConfig = getInngestConfig();
  const inngestUrl = inngestConfig.baseUrl;

  console.log(
    boxen(
      `${chalk.bold.cyan('hs-conductor')} ${chalk.gray('v0.1.0')}\n\n` +
        `${chalk.green('▸')} Server:   ${chalk.yellow(`http://localhost:${port}`)}\n` +
        `${chalk.green('▸')} Inngest:  ${chalk.yellow(`${inngestUrl}/api/inngest`)}\n` +
        `${chalk.green('▸')} Health:   ${chalk.yellow(`http://localhost:${port}/health`)}\n\n` +
        `${chalk.dim('Dashboard:')} ${chalk.blue(inngestUrl)}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      }
    )
  );
});
