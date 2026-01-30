/**
 * Inngest Client Configuration for Self-Hosted Server
 */
import { Inngest } from 'inngest';

// Event key and signing key for self-hosted Inngest
const eventKey = process.env.INNGEST_EVENT_KEY || 'test-event-key-12345678';
const signingKey = process.env.INNGEST_SIGNING_KEY;

export const inngest = new Inngest({
  id: 'hs-conductor',
  name: 'Conductor',
  eventKey,
  // For self-hosted, we use the base URL
  baseUrl: process.env.INNGEST_BASE_URL || 'http://localhost:2901',
});

// Re-export for convenience
export { eventKey, signingKey };
