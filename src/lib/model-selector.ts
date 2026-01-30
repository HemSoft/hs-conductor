/**
 * Model Selection Utilities
 *
 * Fetches available models from Copilot CLI and filters to latest versions
 * grouped by vendor, model family, and specialization.
 */
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Parsed model components
 */
interface ModelInfo {
  original: string; // Full model name
  vendor: string; // claude, gpt, gemini
  modelFamily: string; // sonnet, opus, haiku, 5, 4, 3-pro
  version: string; // 4, 4.5, 5, 5.1, 5.2
  specialization?: string; // codex, codex-max, mini
  cost: string; // 1x, 0.33x, 3x, etc.
  groupKey: string; // Unique key for grouping
}

/**
 * Parse a model name into components
 *
 * Examples:
 * - claude-sonnet-4.5 → { vendor: 'claude', modelFamily: 'sonnet', version: '4.5' }
 * - gpt-5.2 → { vendor: 'gpt', modelFamily: '5', version: '5.2' }
 * - gpt-5.1-codex-max → { vendor: 'gpt', modelFamily: '5', version: '5.1', specialization: 'codex-max' }
 */
function parseModelName(name: string, cost: string): ModelInfo | null {
  // Common patterns:
  // claude-<model>-<version>
  // gpt-<version>[-<specialization>]
  // gemini-<version>-<model>

  const claudeMatch = name.match(/^(claude)-(sonnet|opus|haiku)-(\d+(?:\.\d+)?)$/);
  if (claudeMatch) {
    const [, vendor, modelFamily, version] = claudeMatch;
    return {
      original: name,
      vendor,
      modelFamily,
      version,
      cost,
      groupKey: `${vendor}-${modelFamily}`,
    };
  }

  const gptMatch = name.match(/^(gpt)-(\d+(?:\.\d+)?)(?:-(.+))?$/);
  if (gptMatch) {
    const [, vendor, version, specialization] = gptMatch;
    const modelFamily = version.split('.')[0]; // e.g., "5" from "5.2"
    return {
      original: name,
      vendor,
      modelFamily,
      version,
      specialization,
      cost,
      groupKey: specialization
        ? `${vendor}-${modelFamily}-${specialization}`
        : `${vendor}-${modelFamily}`,
    };
  }

  const geminiMatch = name.match(/^(gemini)-(\d+)-(.+)$/);
  if (geminiMatch) {
    const [, vendor, version, modelFamily] = geminiMatch;
    return {
      original: name,
      vendor,
      modelFamily,
      version,
      cost,
      groupKey: `${vendor}-${modelFamily}`,
    };
  }

  // Fallback - treat entire name as model family
  return {
    original: name,
    vendor: name.split('-')[0] || 'unknown',
    modelFamily: name,
    version: '0',
    cost,
    groupKey: name,
  };
}

/**
 * Compare version strings (semantic versioning)
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLength; i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }

  return 0;
}

/**
 * Fetch available models from Copilot CLI
 */
async function fetchModelsFromCLI(): Promise<ModelInfo[]> {
  try {
    // Run copilot CLI to get models
    // Note: This assumes copilot CLI is in PATH
    const { stdout } = await execAsync('copilot /model --output json 2>&1', {
      timeout: 10000,
    });

    // Try to parse JSON output first
    try {
      const data = JSON.parse(stdout);
      if (Array.isArray(data)) {
        return data
          .map((item) =>
            parseModelName(item.name || item.model, item.cost || '1x')
          )
          .filter((m): m is ModelInfo => m !== null);
      }
    } catch {
      // JSON parse failed, try text parsing
    }

    // Fallback: Parse text output
    // Expected format:
    // 1. Claude Sonnet 4.5 (default)    1x
    // 2. Claude Haiku 4.5                0.33x
    const lines = stdout.split('\n');
    const models: ModelInfo[] = [];

    for (const line of lines) {
      // Match: number. ModelName ... cost
      const match = line.match(/^\s*\d+\.\s+(.+?)\s+([\d.]+x)/);
      if (match) {
        const [, nameRaw, cost] = match;
        // Clean up name: "Claude Sonnet 4.5 (default)" → "claude-sonnet-4.5"
        let name = nameRaw
          .toLowerCase()
          .replace(/\s*\(.*?\)\s*/g, '') // Remove (default), (preview)
          .replace(/\s+/g, '-'); // Spaces to dashes

        const parsed = parseModelName(name, cost);
        if (parsed) {
          models.push(parsed);
        }
      }
    }

    return models;
  } catch (error) {
    console.error('[model-selector] Failed to fetch models from CLI:', error);
    // Return fallback list
    return getFallbackModels();
  }
}

/**
 * Fallback model list if CLI fetch fails
 */
function getFallbackModels(): ModelInfo[] {
  const fallback = [
    { name: 'claude-sonnet-4.5', cost: '1x' },
    { name: 'claude-opus-4.5', cost: '3x' },
    { name: 'claude-haiku-4.5', cost: '0.33x' },
    { name: 'gpt-5.2', cost: '1x' },
    { name: 'gpt-5', cost: '1x' },
    { name: 'gpt-5.1-codex', cost: '1x' },
    { name: 'gpt-5-mini', cost: '0x' },
  ];

  return fallback
    .map((item) => parseModelName(item.name, item.cost))
    .filter((m): m is ModelInfo => m !== null);
}

/**
 * Filter models to only keep the latest version of each (vendor, model, specialization) group
 */
function filterToLatestVersions(models: ModelInfo[]): ModelInfo[] {
  // Group by groupKey
  const groups = new Map<string, ModelInfo[]>();

  for (const model of models) {
    const existing = groups.get(model.groupKey) || [];
    existing.push(model);
    groups.set(model.groupKey, existing);
  }

  // For each group, keep only the latest version
  const latest: ModelInfo[] = [];

  for (const [, groupModels] of groups) {
    groupModels.sort((a, b) => compareVersions(b.version, a.version));
    latest.push(groupModels[0]); // Highest version first
  }

  // Sort final list: Claude first, then GPT, then others
  latest.sort((a, b) => {
    // Vendor priority
    const vendorOrder = { claude: 0, gpt: 1, gemini: 2, unknown: 3 };
    const aVendor = vendorOrder[a.vendor as keyof typeof vendorOrder] ?? 3;
    const bVendor = vendorOrder[b.vendor as keyof typeof vendorOrder] ?? 3;

    if (aVendor !== bVendor) return aVendor - bVendor;

    // Within same vendor, sort by model family
    return a.modelFamily.localeCompare(b.modelFamily);
  });

  return latest;
}

/**
 * Get available models, filtered to latest versions
 */
export async function getAvailableModels(): Promise<
  Array<{ value: string; label: string; cost: string }>
> {
  const allModels = await fetchModelsFromCLI();
  const filteredModels = filterToLatestVersions(allModels);

  return filteredModels.map((model) => ({
    value: model.original,
    label: formatModelLabel(model),
    cost: model.cost,
  }));
}

/**
 * Format a friendly label for a model
 */
function formatModelLabel(model: ModelInfo): string {
  const parts: string[] = [];

  // Vendor
  if (model.vendor === 'claude') {
    parts.push('Claude');
    // Model family
    parts.push(
      model.modelFamily.charAt(0).toUpperCase() + model.modelFamily.slice(1)
    );
    // Version
    parts.push(model.version);
  } else if (model.vendor === 'gpt') {
    parts.push('GPT');
    // Version
    parts.push(model.version);
    // Specialization
    if (model.specialization) {
      const spec = model.specialization
        .split('-')
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' ');
      parts.push(spec);
    }
  } else if (model.vendor === 'gemini') {
    parts.push('Gemini');
    parts.push(model.modelFamily.toUpperCase());
  }

  const label = parts.join(' ');
  return `${label} (${model.cost})`;
}

/**
 * Get the default model
 */
export function getDefaultModel(): string {
  return 'claude-sonnet-4.5';
}
