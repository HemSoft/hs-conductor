# hs-conductor TODO

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Fix Admin Panel Hover Text Styling | High | ✅ Done |
| 2 | Remove Redundant "Run History" Nav Entry | High | ✅ Done |
| 3 | Consolidate Workloads Structure | Medium | ✅ Done |
| 4 | Folder Management UI | Medium | ✅ Done |
| 5 | Drag-and-Drop Workload Organization | Medium | ✅ Done |
| 6 | Configuration System | Medium | ✅ Done |
| 7 | Address Sanitization Strategy | Medium | Not Started |

---

## High Priority

### 1. Fix Admin Panel Hover Text Styling ✅

**Completed:** Replaced native browser `title` tooltips with custom CSS tooltips matching VS Code dark theme aesthetic.

**Location:** `admin/src/components/ActivityBar.tsx`, `ActivityBar.css`

---

### 2. Remove Redundant "Run History" Nav Entry ✅

**Completed:** Removed the Play icon "Run History" entry from ActivityBar since run history is always visible in the right sidebar.

**Location:** `admin/src/components/ActivityBar.tsx`

---

## Architecture

### 3. Consolidate Workloads Structure ✅

**Completed:** Workloads now use a unified schema with folder-based organization.

**Changes Made:**

- Removed `type` field from all workload YAML files and schemas
- Execution mode (prompt-based vs step-based) is now inferred from structure:
  - Has `prompt` field → runs as single AI execution
  - Has `steps` field → runs as sequential/parallel steps
- `workload-loader.ts` recursively scans `workloads/` and `workloads-demo/` at any depth
- Explorer UI now shows folder-based hierarchy instead of type-based groups
- Editor modal uses "Structure" selector (Prompt / Steps / Steps + Dependencies) instead of "Type"
- StatusBar shows simple totals instead of type breakdown
- All admin panel components updated for folder-based grouping

**New Structure:**

```
workloads/
  joke.yaml              # Flat at root
  weather.yaml
  daily/                 # Or grouped by use case
    news-digest.yaml
  dev-tools/             # Or by domain
    code-review.yaml
```

Workload organization is completely flexible - structure your folders however you prefer.

---

### 4. Folder Management UI ✅

**Completed:** Added full folder management capabilities to the Admin Panel.

**Backend API Endpoints:**

- `GET /folders` - List all folders with workload counts
- `POST /folders` - Create new folder (supports nested paths with `/`)
- `PUT /folders/:path` - Rename folder
- `DELETE /folders/:path` - Delete empty folder

**Frontend Features:**

- New Folder button (📁) in workloads header
- Right-click context menu on folders with:
  - Rename Folder
  - Delete Folder
  - New Folder
- Modal dialog for creating/renaming folders
- Input validation and error feedback
- Automatic refresh after folder operations

**Location:** `src/index.ts`, `admin/src/components/Explorer.tsx`, `admin/src/components/Explorer.css`

---

### 5. Drag-and-Drop Workload Organization ✅

**Completed:** Implemented native HTML5 drag-and-drop for workload organization.

**Backend:**

- `POST /workloads/:id/move` - Moves workload YAML file to target folder
- Handles folder validation, path sanitization, and auto-creates folders if needed

**Frontend Features:**

- Workload items are draggable with grab cursor indicator
- Folders act as drop targets with visual feedback (blue dashed outline)
- Dragging workload becomes semi-transparent to indicate drag state
- Target folder automatically expands after drop to show moved workload
- Works with nested folder hierarchies

**Location:** `src/index.ts`, `admin/src/components/Explorer.tsx`, `admin/src/components/Explorer.css`

---

### 6. Configuration System ✅

**Completed:** Implemented a centralized, type-safe configuration system with YAML files and environment variable overrides.

**Configuration Files:**

- `config.yaml` - Default configuration with all settings documented
- `config.dev.yaml` - Development environment overrides (optional)
- `config.prod.yaml` - Production environment overrides (optional)

**Configuration Module:** `src/lib/config.ts`

**Features:**

- **YAML-based**: Consistent with workload definitions
- **Type-safe**: Zod schemas with TypeScript inference
- **Layered loading**: defaults → config.yaml → config.{env}.yaml → env vars (highest priority)
- **Environment variable mapping**: All existing env vars still work (PORT, COPILOT_MODEL, etc.)
- **Runtime reloading**: `reloadConfig()` for hot reload capability
- **Convenience accessors**: `getServerConfig()`, `getAIConfig()`, `getInngestConfig()`, etc.

**Configuration Sections:**

- `server`: port, corsOrigin
- `inngest`: baseUrl, eventKey, signingKey
- `ai`: defaultModel, useMock, concurrency, retries
- `paths`: data, workloads, skills, allowedWritePath
- `logging`: level, timestamps, colors
- `workers.exec`: timeout, shell
- `workers.fetch`: timeout, userAgent

**Files Updated:**

- `src/index.ts` - Server configuration
- `src/inngest/client.ts` - Inngest configuration
- `src/workers/ai-worker.ts` - AI/model configuration
- `src/lib/file-storage.ts` - Data paths
- `src/lib/skill-loader.ts` - Skill folders
- `src/lib/copilot-tools.ts` - Write sandbox path
- `src/lib/workload-loader.ts` - Workloads path

---

### 7. Address Sanitization Strategy

Review and clean up the sanitization approach documented in [SANITIZATION-STRATEGY.md](SANITIZATION-STRATEGY.md). Determine what's still relevant, what needs updating, and implement or remove as appropriate.

---

## Future Ideas

- None yet
