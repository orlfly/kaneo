# delta spec for role-scoped-skill-installation

## Modified Requirements

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

#### Scenario: product-design persona receives product diagnostics and capability contracts

- **WHEN** the installer resolves skills for the `product-design` persona
- **THEN** the installed skills include `product-lens`, `product-capability`, and `intent-driven-development` in addition to `claim-task` and `write-prd`
- **AND** the total is 5 skills

#### Scenario: ui-design persona receives frontend design direction and accessibility

- **WHEN** the installer resolves skills for the `ui-design` persona
- **THEN** the installed skills include `frontend-design`, `make-interfaces-feel-better`, and `accessibility` in addition to `claim-task` and `write-design-spec`
- **AND** the total is 5 skills

#### Scenario: ui-design persona receives claim-task and the 3 new design skills

- **WHEN** the installer resolves skills for the `ui-design` persona
- **THEN** the installed skills are `claim-task`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`
- **AND** `write-prd`, `write-adr`, `write-iac`, `write-test-suite`, `review-pr` are skipped

### Requirement: API endpoint exposes skills filtered by role

The `GET /api/agent/agents-config/download` endpoint SHALL accept an optional `role` query parameter. When `role` is provided, the returned zip SHALL contain only skills whose `for_roles` includes that role. When `role` is omitted, the endpoint SHALL return all skills (backward compatibility).

#### Scenario: Download filtered by product-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=product-design`
- **THEN** the zip contains `claim-task`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`

#### Scenario: Download filtered by ui-design role

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=ui-design`
- **THEN** the zip contains `claim-task`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`
- **AND** `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-iac`, `write-adr`, `write-prd`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development` are excluded