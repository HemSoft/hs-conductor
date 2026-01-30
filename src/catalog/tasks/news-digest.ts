/**
 * Workload: News Digest
 * Type: task
 *
 * Fetches news from multiple sources and creates a summary.
 */
import type { TaskDefinition } from '../../types/workload.js';

export const newsDigest: TaskDefinition = {
  id: 'news-digest',
  name: 'News Digest',
  description: 'Fetches news from RSS feeds and creates an AI-summarized digest',
  type: 'task',
  version: '1.0.0',
  tags: ['news', 'summary'],

  steps: [
    {
      id: 'fetch-news',
      name: 'Fetch RSS Feeds',
      worker: 'fetch-worker',
      config: {
        urls: [
          'https://hnrss.org/frontpage',
          'https://feeds.arstechnica.com/arstechnica/technology-lab',
        ],
        format: 'rss',
      },
      output: 'raw-news.json',
    },
    {
      id: 'summarize',
      name: 'Summarize News',
      worker: 'ai-worker',
      config: {
        prompt: 'Summarize these news items into a digest with top 5 stories',
      },
      input: ['raw-news.json'],
      output: 'digest.md',
    },
  ],
};
