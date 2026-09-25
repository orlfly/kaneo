## ADDED Requirements

### Requirement: SKILL.md frontmatter declares applicable roles

Each SKILL.md file SHALL begin with a YAML frontmatter block declaring the `for_roles` array. The `for_roles` field MUST list every Kaneo `requiredRole` (from `@kaneo/permissions` `AGENT_ROLES`) for which the skill is intended. Skills listed in frontmatter that are missing the `for_roles` field SHALL be treated as applicable to all roles by the installer (backward compatibility).

#### Scenario: Skill declares a single role

- **WHEN** the installer reads `skills/review-pr/SKILL.md` whose frontmatter is `for_roles: [code-review]`
- **THEN** the SKILL.md is recognized as applicable to `code-review` only

#### Scenario: Skill declares all roles

- **WHEN** the installer reads `skills/claim-task/SKILL.md` whose frontmatter is `for_roles: [coding, product-design, architecture-design, devops, ui-design, testing, code-review]`
- **THEN** the SKILL.md is recognized as applicable to every Kaneo role

#### Scenario: Skill without frontmatter is treated as universal

- **WHEN** the installer reads a SKILL.md that does not begin with a `---` frontmatter block
- **THEN** the SKILL.md is installed regardless of the chosen persona role

#### Scenario: Invalid role value in frontmatter is ignored

- **WHEN** a SKILL.md frontmatter lists `for_roles: [coding, made-up-role]`
- **THEN** `coding` is treated as a valid role and `made-up-role` is ignored during matching

### Requirement: Each non-coding persona has a role-specific skill

The bundled skills SHALL include one role-specific skill for every non-coding persona role. The role-specific skill MUST be applicable only to that single role via its `for_roles` frontmatter. The system SHALL ship the following role-specific skills:

- `write-prd` — applicable to `product-design`
- `write-adr` — applicable to `architecture-design`
- `write-design-spec` — applicable to `ui-design`
- `write-iac` — applicable to `devops`
- `write-test-suite` — applicable to `testing`
- `review-pr` — applicable to `code-review`

Each role-specific skill SHALL be authored as a SKILL.md document under `apps/api/src/agent/agents/templates/skills/<skill>/SKILL.md` following the existing skill document structure (title, triggering conditions, prerequisites, workflow, constraints, quality criteria).

#### Scenario: product-design persona receives write-prd skill

- **WHEN** the installer resolves skills for the `product-design` persona
- **THEN** the `write-prd/SKILL.md` is included
- **AND** `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr` are NOT included

#### Scenario: code-review persona receives review-pr skill

- **WHEN** the installer resolves skills for the `code-review` persona
- **THEN** the `review-pr/SKILL.md` is included
- **AND** `write-prd`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite` are NOT included

#### Scenario: architecture-design persona receives write-adr skill

- **WHEN** the installer resolves skills for the `architecture-design` persona
- **THEN** the `write-adr/SKILL.md` is included
- **AND** every other role-specific skill is NOT included

#### Scenario: ui-design persona receives write-design-spec skill

- **WHEN** the installer resolves skills for the `ui-design` persona
- **THEN** the `write-design-spec/SKILL.md` is included
- **AND** every other role-specific skill is NOT included

#### Scenario: devops persona receives write-iac skill

- **WHEN** the installer resolves skills for the `devops` persona
- **THEN** the `write-iac/SKILL.md` is included
- **AND** every other role-specific skill is NOT included

#### Scenario: testing persona receives write-test-suite skill

- **WHEN** the installer resolves skills for the `testing` persona
- **THEN** the `write-test-suite/SKILL.md` is included
- **AND** every other role-specific skill is NOT included

### Requirement: Role-specific skill documentation follows shared structure

Each role-specific SKILL.md SHALL contain the following sections in this order:

1. **触发时机** — when the agent should invoke the skill
2. **前置条件** — tools, files, or context required
3. **工作流程** — numbered steps the agent should follow
4. **关键约束** — boundaries, forbidden actions, validation rules
5. **质量标准** — quality bar for the deliverable
6. **完成后** — handoff steps including Kaneo task status updates

The documentation SHALL be written in Chinese (with English technical terms preserved) to match the existing 5 skill documents and the 7 persona AGENTS.md files.

#### Scenario: write-prd follows shared structure

- **WHEN** a reviewer reads `skills/write-prd/SKILL.md`
- **THEN** the document contains sections titled 触发时机, 前置条件, 工作流程, 关键约束, 质量标准, 完成后
- **AND** the workflow step instructs the agent to write the PRD to `docs/requirements/<feature>.md`

#### Scenario: write-adr follows shared structure

- **WHEN** a reviewer reads `skills/write-adr/SKILL.md`
- **THEN** the document contains sections titled 触发时机, 前置条件, 工作流程, 关键约束, 质量标准, 完成后
- **AND** the workflow step instructs the agent to follow Context/Decision/Consequences format

#### Scenario: review-pr follows shared structure

- **WHEN** a reviewer reads `skills/review-pr/SKILL.md`
- **THEN** the document contains sections titled 触发时机, 前置条件, 工作流程, 关键约束, 质量标准, 完成后
- **AND** the workflow step instructs the agent to use Blocker/Major/Minor/Info severity levels

### Requirement: Installer copies only skills matching the persona role

The `install.sh` script SHALL copy each SKILL.md from the staging directory to the target tool's skills directory only if the SKILL.md's `for_roles` includes the persona role selected via `--role`. Skills whose `for_roles` does not include the persona role SHALL be skipped. The script SHALL print a log line for each skipped skill identifying the skill name and the active persona role.

#### Scenario: install.sh filters skills for coding persona

- **WHEN** the user runs `./install.sh --agent opencode --role coding`
- **THEN** only skills whose `for_roles` contains `coding` are written to `.opencode/skills/`
- **AND** skills whose `for_roles` does not contain `coding` are skipped
- **AND** the installer logs each skipped skill with the skill name and the `coding` role

#### Scenario: install.sh filters skills for ui-design persona

- **WHEN** the user runs `./install.sh --agent opencode --role ui-design`
- **THEN** `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-iac`, `write-adr`, `write-prd`, `write-test-suite`, `review-pr` are skipped because none of their `for_roles` includes `ui-design`
- **AND** `claim-task` and `write-design-spec` are installed

#### Scenario: install.sh filters skills for code-review persona

- **WHEN** the user runs `./install.sh --agent claude --role code-review`
- **THEN** `submit-pr` is skipped (its `for_roles` is `[coding, testing, devops]`, not `code-review`)
- **AND** `claim-task`, `code-search`, and `review-pr` are installed

### Requirement: Skills are redistributed across persona roles

The 11 bundled skills SHALL be redistributed as follows across the persona roles:

- `claim-task`: applicable to all 7 roles (every persona must claim work)
- `code-search`: applicable to `coding`, `testing`, `code-review`
- `repo-sync`: applicable to `coding`, `devops`, `testing`
- `run-tests`: applicable to `coding`, `testing`
- `submit-pr`: applicable to `coding`, `testing`, `devops`
- `write-prd`: applicable to `product-design`
- `write-adr`: applicable to `architecture-design`
- `write-design-spec`: applicable to `ui-design`
- `write-iac`: applicable to `devops`
- `write-test-suite`: applicable to `testing`
- `review-pr`: applicable to `code-review`

The resolved skill set per persona SHALL be:

- `coding` → `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr` (5 skills)
- `product-design` → `claim-task`, `write-prd` (2 skills)
- `architecture-design` → `claim-task`, `write-adr` (2 skills)
- `devops` → `claim-task`, `repo-sync`, `submit-pr`, `write-iac` (4 skills)
- `ui-design` → `claim-task`, `write-design-spec` (2 skills)
- `testing` → `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-test-suite` (6 skills)
- `code-review` → `claim-task`, `code-search`, `review-pr` (3 skills)

#### Scenario: ui-design persona receives claim-task and write-design-spec

- **WHEN** the installer resolves skills for the `ui-design` persona
- **THEN** the installed skills are `claim-task` and `write-design-spec`
- **AND** `write-prd`, `write-adr`, `write-iac`, `write-test-suite`, `review-pr` are skipped

#### Scenario: coding persona receives all coding skills

- **WHEN** the installer resolves skills for the `coding` persona
- **THEN** the installed skills are `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`
- **AND** every role-specific skill (`write-prd`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`) is skipped

#### Scenario: product-design persona receives claim-task and write-prd

- **WHEN** the installer resolves skills for the `product-design` persona
- **THEN** the installed skills are `claim-task` and `write-prd`
- **AND** `run-tests`, `submit-pr`, `code-search`, `repo-sync`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr` are skipped

#### Scenario: devops persona receives infra-oriented skills

- **WHEN** the installer resolves skills for the `devops` persona
- **THEN** the installed skills are `claim-task`, `repo-sync`, `submit-pr`, `write-iac`
- **AND** `code-search`, `run-tests`, and the other role-specific skills are skipped

#### Scenario: testing persona receives full test tooling

- **WHEN** the installer resolves skills for the `testing` persona
- **THEN** the installed skills are `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-test-suite`

#### Scenario: code-review persona receives review tooling

- **WHEN** the installer resolves skills for the `code-review` persona
- **THEN** the installed skills are `claim-task`, `code-search`, `review-pr`

#### Scenario: architecture-design persona receives claim-task and write-adr

- **WHEN** the installer resolves skills for the `architecture-design` persona
- **THEN** the installed skills are `claim-task` and `write-adr`

### Requirement: API endpoint exposes skills filtered by role

The `GET /api/agent/agents-config/download` endpoint SHALL accept an optional `role` query parameter. When `role` is provided, the returned zip SHALL contain only skills whose `for_roles` includes that role. When `role` is omitted, the endpoint SHALL return all skills (backward compatibility).

#### Scenario: Download filtered by coding role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=coding`
- **THEN** the zip contains `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`
- **AND** every role-specific skill (`write-prd`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`) is excluded

#### Scenario: Download filtered by product-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=product-design`
- **THEN** the zip contains `claim-task` and `write-prd` only

#### Scenario: Download filtered by ui-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=ui-design`
- **THEN** the zip contains `claim-task` and `write-design-spec` only

#### Scenario: Download filtered by devops role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=devops`
- **THEN** the zip contains `claim-task`, `repo-sync`, `submit-pr`, `write-iac`

#### Scenario: Download filtered by testing role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=testing`
- **THEN** the zip contains `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-test-suite`

#### Scenario: Download filtered by code-review role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=code-review`
- **THEN** the zip contains `claim-task`, `code-search`, `review-pr`

#### Scenario: Download filtered by architecture-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=architecture-design`
- **THEN** the zip contains `claim-task` and `write-adr`

#### Scenario: Download without role returns all skills

- **WHEN** the client requests `GET /api/agent/agents-config/download`
- **THEN** the zip contains every bundled skill regardless of `for_roles`

#### Scenario: Download with invalid role returns error

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=bogus`
- **THEN** the endpoint responds with HTTP 400 and a message listing valid roles

### Requirement: Templates metadata includes skill role scope

The `GET /api/agent/agents-config/templates` endpoint SHALL include a `forRoles` field on each skill entry. The `forRoles` array SHALL reflect the frontmatter declared roles of that skill. Frontmatter parsing SHALL follow the same fallback rules as the installer (missing frontmatter ⇒ universal scope).

#### Scenario: Templates listing exposes skill roles

- **WHEN** the client requests `GET /api/agent/agents-config/templates`
- **THEN** each skill entry contains a `forRoles` array listing every role the skill applies to
- **AND** `submit-pr` lists `["coding", "testing", "devops"]`
- **AND** `claim-task` lists all seven roles
- **AND** `write-prd` lists `["product-design"]`
- **AND** `review-pr` lists `["code-review"]`