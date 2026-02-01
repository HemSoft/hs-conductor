# hs-conductor TODO

| # | Item | Priority | Status |
|---|------|----------|--------|
| 1 | Fix Admin Panel Hover Text Styling | High | ✅ Done |
| 2 | Remove Redundant "Run History" Nav Entry | High | ✅ Done |
| 3 | Consolidate Workloads Structure | Medium | ✅ Done |
| 4 | Folder Management UI | Medium | Not Started |
| 5 | Drag-and-Drop Workload Organization | Medium | Not Started |
| 6 | Configuration System | Medium | Not Started |
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

### 4. Folder Management UI

Add UI controls for managing workload folders:
- Create new folders via context menu or button
- Rename folders
- Delete empty folders
- Visual feedback for folder operations

**Location:** `admin/src/components/Explorer.tsx`

---

### 5. Drag-and-Drop Workload Organization

Enable drag-and-drop for organizing workloads:
- Drag workloads into/out of folders
- Drag workloads between folders
- Visual drop indicators
- Backend API to move workload files

**Considerations:**
- Use react-dnd or native HTML5 drag API
- Need new endpoint: `POST /workloads/:id/move`
- Handle file system operations safely

---

### 6. Configuration System

Need a proper configuration system for managing:
- Environment-specific settings (dev, staging, prod)
- Port configurations
- Model preferences and defaults
- Worker behaviors
- Logging levels

**Considerations:**
- File format (YAML, JSON, TOML?)
- Environment variable overrides
- Secrets management (separate from config)
- Runtime reloading capability

---

### 7. Address Sanitization Strategy

Review and clean up the sanitization approach documented in [SANITIZATION-STRATEGY.md](SANITIZATION-STRATEGY.md). Determine what's still relevant, what needs updating, and implement or remove as appropriate.

---

## Future Ideas

- None yet
