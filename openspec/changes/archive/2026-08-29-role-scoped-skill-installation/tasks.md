## 1. Add YAML frontmatter to existing SKILL.md files

- [ ] 1.1 Add `for_roles: [coding, product-design, architecture-design, devops, ui-design, testing, code-review]` frontmatter to `apps/api/src/agent/agents/templates/skills/claim-task/SKILL.md`
- [ ] 1.2 Add `for_roles: [coding, testing, code-review]` frontmatter to `apps/api/src/agent/agents/templates/skills/code-search/SKILL.md`
- [ ] 1.3 Add `for_roles: [coding, devops, testing]` frontmatter to `apps/api/src/agent/agents/templates/skills/repo-sync/SKILL.md`
- [ ] 1.4 Add `for_roles: [coding, testing]` frontmatter to `apps/api/src/agent/agents/templates/skills/run-tests/SKILL.md`
- [ ] 1.5 Update `for_roles` frontmatter to `[coding, testing, devops]` on `apps/api/src/agent/agents/templates/skills/submit-pr/SKILL.md`

## 2. Author 6 role-specific SKILL.md files

- [ ] 2.1 Create `apps/api/src/agent/agents/templates/skills/write-prd/SKILL.md` (product-design) with `for_roles: [product-design]`. Sections: 触发时机, 前置条件, 工作流程 (read context → write user stories → write acceptance criteria → output to `docs/requirements/<feature>.md`), 关键约束, 质量标准, 完成后
- [ ] 2.2 Create `apps/api/src/agent/agents/templates/skills/write-adr/SKILL.md` (architecture-design) with `for_roles: [architecture-design]`. Sections include Context/Decision/Consequences format; output to `docs/decisions/NNNN-<title>.md`
- [ ] 2.3 Create `apps/api/src/agent/agents/templates/skills/write-design-spec/SKILL.md` (ui-design) with `for_roles: [ui-design]`. Sections cover component Props/states/responsive breakpoints, CSS variable design tokens, WCAG 2.1 AA accessibility; output to `docs/design/components/<component>.md`
- [ ] 2.4 Create `apps/api/src/agent/agents/templates/skills/write-iac/SKILL.md` (devops) with `for_roles: [devops]`. Sections cover multi-stage Dockerfile, Helm values.yaml, GitHub Actions workflow; validation via `docker build` / `helm lint` / `kubectl --dry-run`
- [ ] 2.5 Create `apps/api/src/agent/agents/templates/skills/write-test-suite/SKILL.md` (testing) with `for_roles: [testing]`. Sections cover unit/integration/e2e test patterns, coverage report, edge cases (空值/并发/超时/权限)
- [ ] 2.6 Create `apps/api/src/agent/agents/templates/skills/review-pr/SKILL.md` (code-review) with `for_roles: [code-review]`. Sections cover `git diff` review, Blocker/Major/Minor/Info severity, structured feedback to PR comments

## 3. Implement SKILL.md frontmatter parser in TypeScript

- [ ] 3.1 Create `parseSkillFrontmatter(content: string): { forRoles: string[] | null }` helper in `apps/api/src/agent/agents/templates.ts`
- [ ] 3.2 Update `listSkillTemplates()` to include `forRoles` field in each skill entry, returning `null` when frontmatter is missing
- [ ] 3.3 Add `listSkillsForRole(role: string): Promise<SkillTemplate[]>` function that filters skills by `for_roles` matching the role

## 4. Update API endpoint to expose role-scoped skills

- [ ] 4.1 Update `GET /api/agent/agents-config/templates` handler in `apps/api/src/agent/agents/index.ts` to include `forRoles` in skill response
- [ ] 4.2 Update `GET /api/agent/agents-config/download` to accept `?role=<name>` query parameter
- [ ] 4.3 Validate role value against `AGENT_ROLES`; return HTTP 400 with error listing valid roles when invalid
- [ ] 4.4 Update Valibot schema for query parameters in the download endpoint

## 5. Update zip packaging to filter by role

- [ ] 5.1 Modify `buildAgentConfigZip(roleFilter?: string)` in `apps/api/src/agent/agents/package.ts` to accept optional role
- [ ] 5.2 When `roleFilter` is provided, only stage skills whose `for_roles` includes the role; when omitted, include all skills
- [ ] 5.3 Update call site in `apps/api/src/agent/agents/index.ts` to pass `?role=` value to `buildAgentConfigZip`

## 6. Update install.sh to filter skills by role

- [ ] 6.1 Modify `install_skills()` in `apps/api/src/agent/agents/install.sh.template` to accept the active persona role
- [ ] 6.2 Implement Bash frontmatter extraction using `awk` to read `for_roles` line between the first two `---` markers
- [ ] 6.3 When `for_roles` is present, only copy SKILL.md if the role appears in the list; otherwise skip with log line
- [ ] 6.4 When frontmatter is absent, install the SKILL.md (backward compatibility)
- [ ] 6.5 Update all three `case "$AGENT"` branches to pass the persona role into `install_skills`

## 7. Verify and document

- [ ] 7.1 Run `pnpm --filter @kaneo/api typecheck` to confirm TypeScript changes compile
- [ ] 7.2 Manually test `GET /api/agent/agents-config/templates` and confirm `forRoles` field appears on every skill (including 6 new ones)
- [ ] 7.3 Manually test `GET /api/agent/agents-config/download?role=coding` and confirm zip contains 5 skills (claim-task, code-search, repo-sync, run-tests, submit-pr)
- [ ] 7.4 Manually test `GET /api/agent/agents-config/download?role=product-design` and confirm zip contains 2 skills (claim-task, write-prd)
- [ ] 7.5 Manually test `GET /api/agent/agents-config/download?role=ui-design` and confirm zip contains 2 skills (claim-task, write-design-spec)
- [ ] 7.6 Manually test `GET /api/agent/agents-config/download?role=devops` and confirm zip contains 4 skills (claim-task, repo-sync, submit-pr, write-iac)
- [ ] 7.7 Manually test `GET /api/agent/agents-config/download?role=testing` and confirm zip contains 6 skills
- [ ] 7.8 Manually test `GET /api/agent/agents-config/download?role=code-review` and confirm zip contains 3 skills (claim-task, code-search, review-pr)
- [ ] 7.9 Manually test `GET /api/agent/agents-config/download?role=architecture-design` and confirm zip contains 2 skills (claim-task, write-adr)
- [ ] 7.10 Manually test `GET /api/agent/agents-config/download?role=bogus` and confirm HTTP 400 with valid role list
- [ ] 7.11 Manually test `./install.sh --agent opencode --role ui-design` in a temp dir and confirm only `claim-task` and `write-design-spec` are copied
- [ ] 7.12 Manually test `./install.sh --agent opencode --role coding` and confirm 5 coding skills are copied
- [ ] 7.13 Manually test `./install.sh --agent opencode --role product-design` and confirm only `claim-task` and `write-prd` are copied