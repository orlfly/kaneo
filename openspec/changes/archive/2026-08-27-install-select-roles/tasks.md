## 1. Install Script Persona Role Selection

- [x] 1.1 Rewrite `apps/api/src/agent/agents/install.sh.template` `--role` parsing to a single role value (no comma-separated/all)
- [x] 1.2 Add valid-role validation (7 requiredRole values) that rejects unknown roles and requires a role
- [x] 1.3 Map the selected role's AGENTS.md to each tool's primary instruction file: opencode → AGENT.md, claude → CLAUDE.md, codex → AGENTS.md
- [x] 1.4 Write the selected persona to the tool's primary instruction file with backup of any existing file
- [x] 1.5 Install skills to the tool's skills directory alongside the persona
- [x] 1.6 Update the script's usage/help header to document the single-value `--role` persona behavior

## 2. Config Generation

- [x] 2.1 Update `apps/api/src/agent/agents/package.ts` to generate per-tool persona configs for a selected role rather than registering all roles as subagents

## 3. Tests

- [x] 3.1 Write a test verifying `--role coding --agent opencode` writes the coding persona to `.opencode/AGENT.md`
- [x] 3.2 Write a test verifying `--role testing --agent claude` writes the testing persona to `CLAUDE.md`
- [x] 3.3 Write a test verifying `--role devops --agent codex` writes the devops persona to `AGENTS.md`
- [x] 3.4 Write a test verifying an invalid role name is rejected
- [x] 3.5 Write a test verifying skills are installed alongside the persona
