/**
 * Fetch Worker
 *
 * Handles HTTP fetch operations including RSS feed parsing.
 * Used by task workloads to retrieve external data.
 */
import { inngest } from '../inngest/client.js';
import { EVENTS, TaskReadySchema } from '../inngest/events.js';
import { writeAsset } from '../lib/file-storage.js';
import { updateManifestStepStatus } from '../lib/run-manifest.js';

interface RssItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
}

interface FetchResult {
  url: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Parse RSS/Atom XML into structured items
 */
function parseRssFeed(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // Simple regex-based RSS parsing (works for most feeds)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = itemXml.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1] || '';
    const link = itemXml.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/i)?.[1] || '';
    const description =
      itemXml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] || '';
    const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1] || '';

    if (title || link) {
      items.push({
        title: decodeHtmlEntities(title),
        link: link.trim(),
        description: decodeHtmlEntities(description.substring(0, 500)),
        pubDate,
      });
    }
  }

  // Try Atom format if no RSS items found
  if (items.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];

      const title = entryXml.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] || '';
      const link = entryXml.match(/<link[^>]*href="([^"]*)"[^>]*\/>/i)?.[1] || '';
      const summary = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '';
      const published = entryXml.match(/<published>(.*?)<\/published>/i)?.[1] || '';

      if (title || link) {
        items.push({
          title: decodeHtmlEntities(title),
          link: link.trim(),
          description: decodeHtmlEntities(summary.substring(0, 500)),
          pubDate: published,
        });
      }
    }
  }

  return items;
}

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/**
 * Fetch a URL and optionally parse as RSS
 */
async function fetchUrl(url: string, format?: string): Promise<FetchResult> {
  try {
    console.log(`[fetch-worker] Fetching: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'hs-conductor/1.0 (RSS Reader)',
        Accept: format === 'rss' ? 'application/rss+xml, application/xml, text/xml' : '*/*',
      },
    });

    if (!response.ok) {
      return {
        url,
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const text = await response.text();

    if (format === 'rss') {
      const items = parseRssFeed(text);
      console.log(`[fetch-worker] Parsed ${items.length} RSS items from ${url}`);
      return { url, success: true, data: items };
    }

    // Try to parse as JSON if it looks like JSON
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        return { url, success: true, data: JSON.parse(text) };
      } catch {
        // Not valid JSON, return as text
      }
    }

    return { url, success: true, data: text };
  } catch (err) {
    console.error(`[fetch-worker] Error fetching ${url}:`, err);
    return {
      url,
      success: false,
      error: err instanceof Error ? err.message : 'Unknown fetch error',
    };
  }
}

export const fetchWorker = inngest.createFunction(
  {
    id: 'fetch-worker',
    concurrency: { limit: 5 },
    retries: 3,
  },
  {
    event: EVENTS.TASK_READY,
    if: 'event.data.worker == "fetch-worker"',
  },
  async ({ event, step }) => {
    const { planId, taskId, config, output, runPath } = TaskReadySchema.parse(event.data);

    const urls = config.urls as string[] | undefined;
    const url = config.url as string | undefined;
    const format = config.format as string | undefined;
    const fetchType = config.type as string | undefined;

    // Handle special fetch types
    if (fetchType === 'todoist') {
      // Return stub data for todoist (would integrate with Todoist API)
      const stubResult = await step.run('stub-todoist', async () => ({
        timestamp: new Date().toISOString(),
        source: 'todoist-stub',
        items: [
          { id: '1', content: 'Review PRs', priority: 1, due: 'today' },
          { id: '2', content: 'Update documentation', priority: 2, due: 'today' },
          { id: '3', content: 'Team standup', priority: 1, due: 'today' },
        ],
        note: 'Stub data - Todoist integration not yet implemented',
      }));

      await step.run('write-stub', async () => {
        await writeAsset(runPath, output, stubResult);
        console.log(`[fetch-worker] Wrote stub todoist data to ${runPath}/${output}`);
        
        // Update manifest with step completion
        await updateManifestStepStatus(runPath, taskId, 'completed', output);
      });

      await step.sendEvent('task-complete', {
        name: EVENTS.TASK_COMPLETED,
        data: { planId, taskId, output, runPath },
      });

      return { success: true, planId, stubbed: true };
    }

    if (!urls && !url) {
      throw new Error('Fetch worker requires either url or urls in config');
    }

    // Fetch all URLs
    const results = await step.run('fetch-urls', async () => {
      const targetUrls = urls || [url!];
      const fetchPromises = targetUrls.map((u) => fetchUrl(u, format));
      return Promise.all(fetchPromises);
    });

    // Aggregate results
    const aggregated = await step.run('aggregate-results', async () => {
      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      if (failed.length > 0) {
        console.warn('[fetch-worker] Some fetches failed:', failed.map((f) => f.url).join(', '));
      }

      // Combine all data
      const allData = successful.flatMap((r) => {
        if (Array.isArray(r.data)) {
          return r.data;
        }
        return [r.data];
      });

      return {
        timestamp: new Date().toISOString(),
        sources: successful.map((r) => r.url),
        failedSources: failed.map((f) => ({ url: f.url, error: f.error })),
        itemCount: allData.length,
        items: allData,
      };
    });

    // Write output
    await step.run('write-output', async () => {
      await writeAsset(runPath, output, aggregated);
      console.log(`[fetch-worker] Wrote ${aggregated.itemCount} items to ${runPath}/${output}`);
      
      // Update manifest with step completion
      await updateManifestStepStatus(runPath, taskId, 'completed', output);
    });

    // Emit completion event
    await step.sendEvent('task-complete', {
      name: EVENTS.TASK_COMPLETED,
      data: { planId, taskId, output, runPath },
    });

    return { success: true, planId, itemCount: aggregated.itemCount };
  }
);
