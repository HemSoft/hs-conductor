# Port Configuration

## hs-conductor Port Range: 2900-2909

| Port | Service | Description |
|------|---------|-------------|
| **2900** | Express App | Function host - serves Inngest workers |
| **2901** | Inngest Dev Server | Event orchestrator + Dashboard (npx inngest-cli) |

## Endpoints

### Express App (2900)

- `GET  /health` - Health check
- `POST /api/inngest` - Inngest function invocations (called by Inngest server)

### Inngest Server (2901)

- `GET  /` - Dashboard UI
- `POST /e/{eventKey}` - Event ingestion endpoint (send events here)
- `GET  /v1/events` - Event API

## Flow

```
CLI/User → POST event to Inngest (2901) → Inngest calls Express (2900) → Worker executes
```
