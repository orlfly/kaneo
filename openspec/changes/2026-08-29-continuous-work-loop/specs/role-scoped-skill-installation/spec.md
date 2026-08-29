# role-scoped-skill-installation

## MODIFIED Requirements

### Requirement: Skills are redistributed across persona roles

The 18 bundled skills SHALL be redistributed as follows across the persona roles:

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

The resolved skill set per persona SHALL be:

- `coding` → `claim-task`, `continuous-work`, `code-search`, `repo-sync`, `run-tests`, `submit-pr` (6 skills)
- `product-design` → `claim-task`, `continuous-work`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development` (6 skills)
- `architecture-design` → `claim-task`, `continuous-work`, `write-adr` (3 skills)
- `devops` → `claim-task`, `continuous-work`, `repo-sync`, `submit-pr`, `write-iac` (5 skills)
- `ui-design` → `claim-task`, `continuous-work`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility` (6 skills)
- `testing` → `claim-task`, `continuous-work`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-test-suite` (7 skills)
- `code-review` → `claim-task`, `continuous-work`, `code-search`, `review-pr` (4 skills)

#### Scenario: ui-design persona receives claim-task and write-design-spec

- **WHEN** the installer resolves skills for the `ui-design` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `write-design-spec`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`
- **AND** `write-prd`, `write-adr`, `write-iac`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development` are skipped

#### Scenario: coding persona receives all coding skills

- **WHEN** the installer resolves skills for the `coding` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`
- **AND** every role-specific skill (`write-prd`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`, `product-lens`, `product-capability`, `intent-driven-development`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`) is skipped

#### Scenario: product-design persona receives claim-task and write-prd

- **WHEN** the installer resolves skills for the `product-design` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`
- **AND** `run-tests`, `submit-pr`, `code-search`, `repo-sync`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`, `frontend-design`, `make-interfaces-feel-better`, `accessibility` are skipped

#### Scenario: devops persona receives infra-oriented skills

- **WHEN** the installer resolves skills for the `devops` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `repo-sync`, `submit-pr`, `write-iac`
- **AND** `code-search`, `run-tests`, and the other role-specific skills are skipped

#### Scenario: testing persona receives full test tooling

- **WHEN** the installer resolves skills for the `testing` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-test-suite`

#### Scenario: code-review persona receives review tooling

- **WHEN** the installer resolves skills for the `code-review` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `code-search`, `review-pr`

#### Scenario: architecture-design persona receives claim-task and write-adr

- **WHEN** the installer resolves skills for the `architecture-design` persona
- **THEN** the installed skills are `claim-task`, `continuous-work`, `write-adr`