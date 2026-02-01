/**
 * Model Selection Utilities
 *
 * Fetches available models from Copilot SDK and returns them formatted for UI.
 */
import { CopilotClient, type ModelInfo } from '@github/copilot-sdk';

// Cached client instance
let cachedClient: CopilotClient | null = null;
let cachedModels: Array<{ value: string; label: string; cost: string }> | null = null;

/**
 * Get or create the Copilot client
 */
async function getClient(): Promise<CopilotClient> {
  if (!cachedClient) {
    cachedClient = new CopilotClient();
    await cachedClient.start();
  }
  return cachedClient;
}

/**
 * Format billing multiplier to human-readable cost string
 */
function formatCost(multiplier: number | undefined): string {
  if (multiplier === undefined) return '1x';
  if (multiplier === 0) return '0x';
  if (multiplier === 1) return '1x';
  if (multiplier < 1) return `${multiplier}x`;
  return `${multiplier}x`;
}

/**
 * Format a friendly label for a model
 */
function formatModelLabel(model: ModelInfo): string {
  const cost = formatCost(model.billing?.multiplier);
  return `${model.name} (${cost})`;
}

/**
 * Get available models from Copilot SDK
 */
export async function getAvailableModels(): Promise<
  Array<{ value: string; label: string; cost: string }>
> {
  // Return cached models if available
  if (cachedModels) {
    return cachedModels;
  }

  try {
    const client = await getClient();
    const models = await client.listModels();

    // Filter to enabled models and format for UI
    cachedModels = models
      .filter(m => m.policy?.state !== 'disabled')
      .map(model => ({
        value: model.id,
        label: formatModelLabel(model),
        cost: formatCost(model.billing?.multiplier),
      }));

    // Sort: Claude first, then GPT, then others
    cachedModels.sort((a, b) => {
      const aVendor = a.value.startsWith('claude') ? 0 : a.value.startsWith('gpt') ? 1 : 2;
      const bVendor = b.value.startsWith('claude') ? 0 : b.value.startsWith('gpt') ? 1 : 2;
      if (aVendor !== bVendor) return aVendor - bVendor;
      return a.value.localeCompare(b.value);
    });

    console.log(`[model-selector] Loaded ${cachedModels.length} models from SDK`);
    return cachedModels;
  } catch (error) {
    console.error('[model-selector] Failed to fetch models from SDK:', error);
    // Return fallback list
    return getFallbackModels();
  }
}

/**
 * Fallback model list if SDK fetch fails
 */
function getFallbackModels(): Array<{ value: string; label: string; cost: string }> {
  return [
    { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (1x)', cost: '1x' },
    { value: 'claude-opus-4.5', label: 'Claude Opus 4.5 (3x)', cost: '3x' },
    { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5 (0.33x)', cost: '0.33x' },
    { value: 'gpt-5.2', label: 'GPT 5.2 (1x)', cost: '1x' },
    { value: 'gpt-5', label: 'GPT 5 (1x)', cost: '1x' },
  ];
}

/**
 * Get the default model
 */
export function getDefaultModel(): string {
  return 'claude-sonnet-4.5';
}

/**
 * Clear the model cache (useful if models list changes)
 */
export function clearModelCache(): void {
  cachedModels = null;
}
