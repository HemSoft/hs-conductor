/**
 * Workload: Weather
 * Type: ad-hoc
 *
 * Gets current weather for a location and returns formatted JSON.
 */
import type { AdHocDefinition } from '../../types/workload.js';

export const weather: AdHocDefinition = {
  id: 'weather',
  name: 'Get Weather',
  description: 'Fetches current weather for a location and returns well-formatted JSON',
  type: 'ad-hoc',
  version: '1.0.0',
  tags: ['weather', 'utility'],

  prompt: `Get the current weather for {{location}}.

Return the response as a JSON object with this structure:
{
  "location": "city, state/country",
  "temperature": { "value": number, "unit": "F" },
  "conditions": "description",
  "humidity": "percentage",
  "wind": { "speed": number, "unit": "mph", "direction": "N/S/E/W" },
  "timestamp": "ISO 8601 timestamp"
}

Be accurate and use real-time data if available. If you cannot access real-time data, clearly indicate that in a "note" field.`,

  input: {
    location: {
      type: 'string',
      required: true,
      description: 'City and state/country',
    },
  },

  output: {
    format: 'json',
  },
};
