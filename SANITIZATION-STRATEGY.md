# Repository Sanitization Strategy

> Making hs-conductor ready for a wider audience

**Created:** January 29, 2026  
**Status:** Planning Phase

---

## Vision

Transform `hs-conductor` from a personal automation tool into a professional, presentation-ready project that:

- **Showcases capabilities** through compelling example workloads
- **Provides smooth onboarding** for new users pulling the repo
- **Protects personal data** while keeping it backed up
- **Maintains separation** between examples and personal usage

---

## Current State Analysis

### Workloads Inventory

| Workload | Type | Status | Assessment |
|----------|------|--------|------------|
| `joke.yaml` | ad-hoc | ✅ Good for demo | Clean, fun, showcases AI worker |
| `weather.yaml` | ad-hoc | ✅ Good for demo | Practical utility, shows JSON output |
| `skill-test.yaml` | ad-hoc | ⚠️ Dev/testing only | Internal testing, not user-facing |
| `egg-inc-cm.yaml` | ad-hoc + task | ❌ Personal only | Game-specific, no general value |
| `news-digest.yaml` | task | ✅ Good for demo | Shows fetch + AI workers, multi-step |
| `daily-report.yaml` | workflow | ⚠️ Needs evaluation | May contain personal references |

### Problems Identified

1. **Mixed Purpose**: Personal workloads alongside demo workloads
2. **No "First Run" Experience**: Users unclear what to run first
3. **Personal Data Exposure**: Schedules and runs may contain personal info
4. **Unclear Capabilities**: No obvious showcase of what the system can do
5. **Missing Examples**: Limited diversity in workload types

---

## Proposed Architecture

### Directory Structure

```
workloads-demo/            # 🌟 Checked into git - showcase workloads
├── ad-hoc/
│   ├── joke.yaml          # Simple AI demo
│   └── weather.yaml       # Utility demo
├── tasks/
│   ├── news-digest.yaml   # Multi-worker orchestration
│   ├── code-review.yaml   # Developer workflow
│   └── github-activity.yaml # API integration
└── workflows/
    └── morning-brief.yaml # Complex multi-task

workloads/                 # ❌ Gitignored - your private workloads
├── ad-hoc/
├── tasks/
└── workflows/

data/
├── runs/                  # ❌ Gitignored - execution data
├── schedules/             # ❌ Gitignored - personal schedules
└── alerts/                # ❌ Gitignored - personal alerts
```

### How It Works

**First-time setup:**

```powershell
# Copy demo workloads to your personal folder
Copy-Item -Recurse workloads-demo\* workloads\
```

**Workload Resolution:**

1. System searches `workloads/` first (personal)
2. Falls back to `workloads-demo/` (examples)
3. Personal workloads can override demo workloads by ID

**Privacy:**

- `workloads/` is gitignored - your automation stays private
- `data/runs/`, `data/schedules/`, `data/alerts/` also gitignored
- Only `workloads-demo/` is checked into git as examples

### Backup Strategy

**Personal Data to Backup:**

- `workloads/` - All your custom automation
- `data/schedules/` - Cron schedules
- `data/alerts/` - Alert history (optional)
- `data/runs/` - Usually temporary, backup optional

### Recommended: OneDrive Symlink

```powershell
# Symlink personal workloads to OneDrive
New-Item -ItemType SymbolicLink `
  -Path "workloads" `
  -Target "F:\OneDrive\User-Backup\conductor-workloads"

# Or backup just the schedules
New-Item -ItemType SymbolicLink `
  -Path "data\schedules" `
  -Target "F:\OneDrive\User-Backup\conductor-schedules"
```

**Alternative: Private Git Repo**
Create `hs-conductor-personal` private repo containing:

- `workloads/` folder
- `data/schedules/` folder
- Clone alongside main repo

---

## Example Workload Showcase✅ Created

- **Showcases:** Simple AI worker, user input
- **Use case:** Quick win for testing installation
- **Path:** `workloads-demo/ad-hoc/`

### 2. **weather.yaml** (ad-hoc) - ✅ Created

- **Showcases:** JSON output, real-time data
- **Use case:** Practical utility example
- **Path:** `workloads-demo/ad-hoc/`

### 3. **news-digest.yaml** (task) - ✅ Created

- **Showcases:** Multi-worker orchestration, fetch + AI
- **Use case:** Information aggregation
- **Path:** `workloads-demo/tasks/`

#### 4. **code-review.yaml** (task) - ✅ Created

- **Showcases:** Exec worker, file analysis, AI feedback
- **Use case:** Developer workflow
- **Path:** `workloads-demo/tasks/`
- **Steps:**
  1. Get git diff (exec-worker)
  2. Analyze code quality (ai-worker)

#### 5. **github-activity.yaml** (task) - ✅ Created

- **Showcases:** API integration, authenticated requests
- **Use case:** Developer metrics
- **Path:** `workloads-demo/tasks/`
- **Steps:**
  1. Fetch repos (fetch-worker)
  2. Fetch events (fetch-worker)
  3. Summarize activity (ai-worker)

#### 6. **morning-brief.yaml** (workflow) - ✅ Created

- **Showcases:** Complex workflow, parallel execution, dependencies
- **Use case:** Daily automation
- **Path:** `workloads-demo/workflows/`
- **Steps:**
  1. Parallel: Fetch weather, news, calendar
  2. Aggregate all data
  3. Generate briefing
- **Steps:**
  1. Fetch weather (fetch-worker)
  2. Fetch news (fetch-worker)
  3. Check calendar (fetch-worker)
  4. Aggregate data (file-worker)
  5. Generate briefing (ai-worker)

### Nice-to-Have Examples

- **translate.yaml**: Input validation, language support
- **sentiment.yaml**: Text analysis demonstration
- **weekly-report.yaml**: Scheduled workflow example
- **image-analysis.yaml**: Future: Multi-modal AI (if supported)

---

## Onboarding Experience

### First-Run Wizard Concept

When a new user runs `conductor` for the first time:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Welcome to hs-conductor! 🎭                            │
│                                                         │
│  Let's get you started with a quick demo.              │
│                                                         │
│  I can run a simple example to show you how this works: │
│                                                         │
│  [1] Tell me a joke (Quick AI demo)                    │
│  [2] Get current weather (Practical utility)           │
│  [3] Run news digest (Multi-worker showcase)           │
│  [4] Skip - I'll explore on my own                     │
│                                                         │
│  Choose an option [1-4]:                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Updated README Features

1. **Quick Start Section** - Zero to running in 5 minutes
2. **Example Showcase** - Table of all examples with descriptions
3. **Architecture Diagram** - Visual explanation
4. **Video/GIF Demos** - Screen recordings of examples
5. **FAQ Section** - Common questions

### Documentation Improvements

- **EXAMPLES.md** - Detailed guide to each example workload
- **CONTRIBUTING.md** - How to create custom workloads
- **ARCHITECTURE.md** - Deep dive into the system
- **TROUBLESHOOTING.md** - Common issues and fixes

---
✅ Phase 1: Structure Reorganization - COMPLETED

**Actions:**

- [x] Create `workloads-demo/` directory structure
- [x] Create `workloads/` directory (gitignored)
- [x] Move existing demo workloads to `workloads-demo/`
- [x] Update `.gitignore` to exclude `workloads/`, `data/runs/`, `data/schedules/`, `data/alerts/`
- [x] Create `workloads-demo/README.md` with usage instructions
- [x] Create `data/README.md` explaining data structure
- [ ] Create `workloads/personal/` directory structure
- [ ] Move existing workloads to appropriate locations
- [ ] Update `.gitignore` to exclude `workloads/personal/`, `data/runs/`, `data/schedules/`

**Git Operations:**

```powershell
# Create directories
New-Item -ItemType Directory -Path "workloads\examples\ad-hoc", "workloads\examples\tasks", "workloads\examples\workflows"
New-Item -ItemType Directory -Path "workloads\personal\ad-hoc", "workloads\personal\tasks", "workloads\personal\workflows"

# Move examples to examples/
Move-Item workloads\ad-hoc\joke.yaml workloads\examples\ad-hoc\
Move-Item workloads\ad-hoc\weather.yaml workloads\examples\ad-hoc\
Move-Item workloads\tasks\news-digest.yaml workloads\examples\tasks\

# Move personal to personal/
Move-Item workloads\ad-hoc\egg-inc-cm.yaml workloads\personal\ad-hoc\
Move-Item workloads\ad-hoc\skill-test.yaml workloads\personal\ad-hoc\
Move-Item workloads\tasks\egg-inc-cm.yaml workloads\personal\tasks\
Move-Item workloads\workflows\daily-report.yaml workloads\personal\workflows\

# Remove old directories
Remove-Item workloads\ad-hoc, workloads\tasks, workloads\workflows -Recurse
```

**Update `.gitignore`:**

```gitignore
# Personal workloads and data
workloads/personal/
data/runs/
data/schedules/
data/alerts/

# Environment
.env
.env.local

# Build
dist/
node_modules/

# IDE
.vscode/
.idea/
```✅ Phase 2: Code Updates - COMPLETED

**Update workload loader** to search both `workloads/` and `workloads-demo/`:
- [x] Modified `src/lib/workload-loader.ts`
- [x] Searches personal workloads first, then demo
- [x] Personal workloads can override demo by same ID
- [x] Added source tracking for debuggingconductor list --personal-only
// conductor list --all (default)
```

### Phase 3: New Example Workloads (3 hours)

Create new example workloads:

- [ ] `code-review.yaml` - Developer workflow
- [ ] `github-activity.yaml` - API integration
- [ ] `morning-brief.yaml` - Complex workflow
- [ ] `translate.yaml` - Input validation
- [ ] `sentiment.yaml` - Text analysis

### Phase 4: Documentation Overhaul (3 hours)

- [ ] Update README.md with Quick Start and Examples table
- [ ] Create EXAMPLES.md with detailed workload guides
- [ ] Create CONTRIBUTING.md with custom workload guide
- [ ] Add architecture diagrams (Mermaid)
- [ ] Record demo GIFs for top 3 examples

### Phase 5: Onboarding Features (2 hours)

- [ ] Add first-run detection
- [ ✅ Phase 3: New Example Workloads - COMPLETED

Created new example workloads:

- [x] `code-review.yaml` - Developer workflow (exec → AI)
- [x] `github-activity.yaml` - API integration (fetch → AI)
- [x] `morning-brief.yaml` - Complex workflow (parallel fetch → aggregate → AI)

All stored in `workloads-demo/` and ready for users to copy. backup

- [ ] Add backup instructions to README

---

## Implementation Timeline

| Phase | Duration | Priority | Blocker |
|-------|----------|----------|---------|
| Phase 1: Structure | 1 hour | 🔴 Critical | None |
| Phase 2: Code Updates | 2 hours | 🔴 Critical | Phase 1 |
| Phase 6: Backup Setup | 30 min | 🔴 Critical | Phase 1 |
| Phase 4: Documentation | 3 hours | 🟡 High | Phase 2 |
| Phase 3: New Examples | 3 hours | 🟡 High | Phase 2 |
| Phase 5: Onboarding | 2 hours | 🟢 Medium | Phase 3, 4 |

**Total Estimated Time:** 11.5 hours (can be done in 2-3 sessions)

**Critical Path:** 3.5 hours (Phases 1, 2, 6)

---

## Success Criteria

### User Experience Goals

- [ ] New user can clone repo and run first example in < 5 minutes
- [ ] Example workloads demonstrate all core capabilities
- [ ] No personal data visible in public repo
- [ ] Documentation clearly explains how to create custom workloads
- [ ] Personal workloads remain backed up and functional

### Technical Goals

- [ ] Workload loader supports both `examples/` and `personal/`
- [ ] Git status is clean (no personal files tracked)
- [ ] All example workloads execute successfully
- [ ] CI/CD can validate example workloads
- [ ] Personal workloads continue to work without changes

### Community Goals

- [ ] README attracts interest with clear value proposition
- [ ] Examples inspire custom workload creation
- [ ] Architecture diagram helps developers understand system
- [ ] Contributing guide lowers barrier to contribution

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lose personal workloads during migration | 🔴 High | Backup before any moves, test recovery |
| Breaking existing personal workflows | 🟡 Medium | Keep personal/ structure identical to old |
| Examples not compelling enough | 🟡 Medium | Get feedback on example selection |
| Onboarding too complex | 🟢 Low | Keep first example simple (joke) |
| Documentation becomes stale | 🟢 Low | Add doc review to release checklist |

---

## Future Enhancements

### Post-Sanitization Features

1. **Example Gallery Website**
   - GitHub Pages site showcasing all examples
   - Live demos or videos
   - Search and filter capabilities

2. **Workload Marketplace**
   - Community-contributed workloads
   - Rating and review system
   - One-click install from marketplace

3. **Template Generator**
   - CLI wizard to scaffold new workloads
   - Best practices baked in
   - Validation and testing helpers

4. **Testing Framework**
   - Validate example workloads in CI
   - Automated testing of new contributions
   - Performance benchmarks

5. **Admin Dashboard Integration**
   - Visual workload editor
   - Drag-and-drop workflow builder
   - Real-time execution monitoring

---

## Questions to Resolve

- [ ] Do we want a `workloads/community/` folder for third-party examples?
- [ ] Should personal workloads support auto-migration from old structure?
- [ ] Do we need a "personal config" file separate from `.env`?
- [ ] Should examples have different default models (faster/cheaper)?

---

## Next Steps

1. **Review this strategy** - Does this align with your vision?
2. **Prioritize phases** - Which phases are must-have vs nice-to-have?
3. **Begin Phase 1** - Reorganize directories and update gitignore
4. **Setup backup** - OneDrive symlink or alternative
5. **Iterate** - Test the new structure with existing workflows

---

*This is a living document. Update as implementation progresses.*
