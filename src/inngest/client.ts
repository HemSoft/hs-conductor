/**
 * Inngest Client Configuration
 */
import { Inngest } from 'inngest';

// Event key and signing key for Inngest
const eventKey = process.env.INNGEST_EVENT_KEY || 'test-event-key-12345678';
const signingKey = process.env.INNGEST_SIGNING_KEY;

export const inngest = new Inngest({
  id: 'hs-conductor',
  name: 'Conductor',
  eventKey,
  baseUrl: process.env.INNGEST_BASE_URL || 'http://localhost:2901',
});

// Re-export for convenience
export { eventKey, signingKey };
