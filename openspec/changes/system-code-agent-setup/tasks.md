## 1. Role Definition Templates

- [x] 1.1 Create `apps/api/src/agent/agents/templates/roles/` directory structure with one subdirectory per role (coding, product-design, architecture-design, devops, ui-design, testing, code-review)
- [x] 1.2 Write `coding/AGENTS.md` — implement features/bugfixes, run tests, conventional commits, no scope creep
- [x] 1.3 Write `product-design/AGENTS.md` — product requirements docs, user stories, acceptance criteria, no code edits
- [x] 1.4 Write `architecture-design/AGENTS.md` — architecture design docs, ADRs, service boundaries, no implementation code
- [x] 1.5 Write `devops/AGENTS.md` — Dockerfile, Helm charts, CI/CD pipelines, deployment scripts, no feature code
- [x] 1.6 Write `ui-design/AGENTS.md` — component design specs, design tokens, accessibility requirements, no backend code
- [x] 1.7 Write `testing/AGENTS.md` — write/run test suites, coverage reports, edge case discovery, no production code
- [x] 1.8 Write `code-review/AGENTS.md` — review diffs, structured feedback with severity, coverage check, no direct edits

## 2. Skills Templates

- [x] 2.1 Create `apps/api/src/agent/agents/templates/skills/` directory structure
- [x] 2.2 Write `claim-task/SKILL.md` — authenticate with Kaneo API key, call POST /api/task/claim-next to claim a role-matched task, read task details, update task status on completion
- [x] 2.3 Write `repo-sync/SKILL.md` — git pull --rebase, conflict resolution, clean tree verification
- [x] 2.4 Write `code-search/SKILL.md` — ripgrep patterns for definitions, usages, TODO/FIXME, import tracking
- [x] 2.5 Write `run-tests/SKILL.md` — detect test runner (jest/vitest/pytest/mvn), run targeted tests, report pass/fail
- [x] 2.6 Write `submit-pr/SKILL.md` — feature branch creation, conventional commits, Kaneo API external link creation

## 3. Template Loading and Download Logic

- [x] 3.1 Create `apps/api/src/agent/agents/templates.ts` — load role names and skill names from the templates directory at startup
- [x] 3.2 Create `apps/api/src/agent/agents/install.ts` — copy templates to project workdir, generate opencode.jsonc, handle backup/force logic (later removed: superseded by download package)
- [x] 3.3 Generate `opencode.jsonc` with all 7 roles as subagents, skills paths, and basic permissions
- [x] 3.4 Create `apps/api/src/agent/agents/package.ts` — build a zip package containing roles, skills, opencode.jsonc, and install.sh
- [x] 3.5 Create `apps/api/src/agent/agents/install.sh.template` — shell script that copies files into .opencode/agents and .opencode/skills, backs up existing files
- [x] 3.6 Update `package.ts` to generate per-agent config files (opencode.jsonc / CLAUDE.md / AGENTS.md) in the zip
- [x] 3.7 Update `install.sh.template` to support `--agent` flag (opencode / claude / codex / all) and auto-detection
- [x] 3.8 Update `install.sh.template` to support `--target <dir>` flag to specify the target installation directory

## 4. API Endpoints

- [x] 4.1 Create `apps/api/src/agent/agents/index.ts` route file with `GET /templates` and `GET /download` (status + install endpoints later removed as unused)
- [x] 4.2 Mount agent config routes in `apps/api/src/index.ts` under `/api/agent/agents-config`
- [x] 4.3 Add Valibot validation for install endpoint body (later removed with install endpoint)
- [x] 4.4 Add workspace permission check (later removed with install endpoint)
- [x] 4.5 Add `GET /download` endpoint returning the zip package with Content-Type application/zip and Content-Disposition attachment

## 5. Frontend Agent Config Panel

- [x] 5.1 Create `apps/web/src/fetchers/agent/agents-config.ts` — fetch templates, trigger download (status + install fetchers later removed)
- [x] 5.2 Create `apps/web/src/hooks/queries/agent/use-agents-config.ts` — TanStack Query hooks for templates and download (status + install hooks later removed)
- [x] 5.3 Create `apps/web/src/components/project/agent-config-panel.tsx` — display roles/skills, download button (install UI later replaced by download)
- [x] 5.4 Add agent config panel to project integrations settings page
- [x] 5.5 Add i18n keys for agent config panel to `i18n/en-US.json`
- [x] 5.6 Update agent-config-panel to show a download button instead of install button
- [x] 5.7 Add download fetcher function and hook

## 6. Tests

- [x] 6.1 Write API test for `GET /api/agent/agents-config/templates` returning all 7 roles and 4 skills
- [x] 6.2 Write API test for `GET /api/agent/agents-config?projectId=` (later removed with status endpoint)
- [x] 6.3 Write API test for `POST /api/agent/agents-config/install` (later removed with install endpoint)
- [x] 6.4 Write API test for install with `force: false` (later removed with install endpoint)
- [x] 6.5 Write API test for install permission check (later removed with install endpoint)
- [x] 6.6 Write API test for `GET /api/agent/agents-config/download` returning a zip with correct content type
- [x] 6.7 Write test for install.sh template content