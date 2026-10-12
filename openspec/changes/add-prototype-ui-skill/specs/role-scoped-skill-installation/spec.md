## MODIFIED Requirements

### Requirement: Skills are redistributed across persona roles

The 19 bundled skills SHALL be redistributed as follows across the persona roles:

- `claim-task`: applicable to all 7 roles (every persona must claim work)
- `continuous-work`: applicable to all 7 roles (autonomous loop discipline, universal guardrail)
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
- `prototype-ui`: applicable to `product-design` and `ui-design` (interactive HTML prototypes; low-fidelity structural for product-design, high-fidelity visual for ui-design)

The resolved skill set per persona SHALL be:

- `coding` → `claim-task`, `continuous-work`, `code-search`, `repo-sync`, `run-tests`, `submit-pr` (6 skills)
- `product-design` → `claim-task`, `continuous-work`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`, `prototype-ui` (7 skills)
- `architecture-design` → `claim-task`, `continuous-work`, `write-adr` (3 skills)
- `devops` → `claim-task`, `continuous-work`, `repo-sync`, `submit-pr`, `write-iac` (5 skills)
- `ui-design` → `claim-task`, `continuous-work`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`, `prototype-ui` (7 skills)
- `testing` → `claim-task`, `continuous-work`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-test-suite` (7 skills)
- `code-review` → `claim-task`, `continuous-work`, `code-search`, `review-pr` (4 skills)

#### Scenario: product-design persona receives the prototype skill

- **WHEN** the installer resolves skills for the `product-design` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`, `prototype-ui`
- **AND** `run-tests`, `submit-pr`, `code-search`, `repo-sync`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`, `frontend-design`, `make-interfaces-feel-better`, `accessibility` are skipped

#### Scenario: ui-design persona receives the prototype skill

- **WHEN** the installer resolves skills for the `ui-design` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`, `prototype-ui`
- **AND** `write-prd`, `write-adr`, `write-iac`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development` are skipped

#### Scenario: non-design personas do not receive the prototype skill

- **WHEN** the installer resolves skills for `coding`, `architecture-design`, `devops`, `testing`, or `code-review`
- **THEN** `prototype-ui` is skipped for every one of those personas

### Requirement: API endpoint exposes skills filtered by role

The `GET /api/agent/agents-config/download` endpoint SHALL accept an optional `role` query parameter. When `role` is provided, the returned zip SHALL contain only skills whose `for_roles` includes that role. When `role` is omitted, the endpoint SHALL return all skills (backward compatibility).

#### Scenario: Download filtered by product-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=product-design`
- **THEN** the zip contains `claim-task`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`, `prototype-ui`

#### Scenario: Download filtered by ui-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=ui-design`
- **THEN** the zip contains `claim-task`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`, `prototype-ui`
- **AND** `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-iac`, `write-adr`, `write-prd`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development` are excluded

#### Scenario: Download filtered by coding role excludes the prototype skill

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=coding`
- **THEN** the zip contains `claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`
- **AND** every role-specific skill, including `prototype-ui`, is excluded

### Requirement: Templates metadata includes skill role scope

The `GET /api/agent/agents-config/templates` endpoint SHALL include a `forRoles` field on each skill entry. The `forRoles` array SHALL reflect the frontmatter declared roles of that skill. Frontmatter parsing SHALL follow the same fallback rules as the installer (missing frontmatter ⇒ universal scope).

#### Scenario: Templates listing exposes the prototype skill scope

- **WHEN** the client requests `GET /api/agent/agents-config/templates`
- **THEN** each skill entry contains a `forRoles` array listing every role the skill applies to
- **AND** `prototype-ui` lists `["product-design", "ui-design"]`
