# delta spec for role-scoped-skill-installation

## MODIFIED Requirements

### Requirement: Skills are redistributed across persona roles

The 17 bundled skills SHALL be redistributed as follows across the persona roles:

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
- `product-lens`: applicable to `product-design` (product diagnostic before PRD)
- `product-capability`: applicable to `product-design` (PRD-to-SRS capability contracts)
- `intent-driven-development`: applicable to `product-design` (acceptance criteria generation)
- `frontend-design`: applicable to `ui-design` (Anthropic visual direction guidance)
- `make-interfaces-feel-better`: applicable to `ui-design` (micro-interaction polish)
- `accessibility`: applicable to `ui-design` (WCAG 2.2 Level AA)

The resolved skill set per persona SHALL be:

- `coding` → `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr` (5 skills)
- `product-design` → `claim-task`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development` (5 skills)
- `architecture-design` → `claim-task`, `write-adr` (2 skills)
- `devops` → `claim-task`, `repo-sync`, `submit-pr`, `write-iac` (4 skills)
- `ui-design` → `claim-task`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility` (5 skills)
- `testing` → `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-test-suite` (6 skills)
- `code-review` → `claim-task`, `code-search`, `review-pr` (3 skills)

#### Scenario: ui-design persona receives claim-task and write-design-spec

- **WHEN** the installer resolves skills for the `ui-design` persona
- **THEN** the installed skills are `claim-task`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`
- **AND** `write-prd`, `write-adr`, `write-iac`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development` are skipped

#### Scenario: coding persona receives all coding skills

- **WHEN** the installer resolves skills for the `coding` persona
- **THEN** the installed skills are `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`
- **AND** every role-specific skill (`write-prd`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`) is skipped

#### Scenario: product-design persona receives claim-task and write-prd

- **WHEN** the installer resolves skills for the `product-design` persona
- **THEN** the installed skills are `claim-task`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`
- **AND** `run-tests`, `submit-pr`, `code-search`, `repo-sync`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`, `frontend-design`, `make-interfaces-feel-better`, `accessibility` are skipped

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
- **AND** every role-specific skill (`write-prd`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`) is excluded

#### Scenario: Download filtered by product-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=product-design`
- **THEN** the zip contains `claim-task`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`

#### Scenario: Download filtered by ui-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=ui-design`
- **THEN** the zip contains `claim-task`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`
- **AND** `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-iac`, `write-adr`, `write-prd`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development` are excluded

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
- **AND** `frontend-design` lists `["ui-design"]`
- **AND** `product-lens` lists `["product-design"]`
- **AND** `accessibility` lists `["ui-design"]`