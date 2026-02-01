/**
 * Inngest Client Configuration
 */
import { Inngest } from 'inngest';
import { getInngestConfig } from '../lib/config.js';

// Get Inngest configuration
const inngestConfig = getInngestConfig();
const eventKey = inngestConfig.eventKey || 'test-event-key-12345678';
const signingKey = inngestConfig.signingKey;

export const inngest = new Inngest({
  id: 'hs-conductor',
  name: 'Conductor',
  eventKey,
  baseUrl: inngestConfig.baseUrl,
});

// Re-export for convenience
export { eventKey, signingKey };
