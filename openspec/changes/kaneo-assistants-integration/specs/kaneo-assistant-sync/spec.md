# kaneo-assistant-sync Specification

## Purpose

Defines how AionUi creates and maintains Assistants that mirror the Kaneo agent role system: fetching role and skill templates from a Kaneo instance, mapping each role to one Assistant (context, prompts, skills), importing Kaneo skills as AionUi custom skills with role filtering, and de-duplicating repeated syncs.

## ADDED Requirements

### Requirement: Kaneo connection configuration

The system SHALL let the user configure a Kaneo instance connection consisting of a base URL and an API key, validate the connection against `GET /api/agent/agents-config/templates`, and store the base URL locally. The API key SHALL be used only for the validate/fetch/skills-import operations and SHALL NOT be written into any Assistant's context, prompts, or description.

#### Scenario: Successful connection validation

- **WHEN** the user submits a reachable Kaneo base URL with a valid API key
- **THEN** the system fetches the templates endpoint successfully
- **AND** shows the returned roles and skills for selection

#### Scenario: Connection failure surfaced

- **WHEN** the Kaneo instance is unreachable, returns 401, or the templates endpoint is missing
- **THEN** the system shows a distinct error (unreachable / unauthorized / unsupported instance) and does not create any Assistant

#### Scenario: API key never persisted into assistants

- **WHEN** Assistants are created from a Kaneo sync
- **THEN** no Assistant's context, prompts, name, or description contains the API key value

### Requirement: One Assistant per Kaneo role

The system SHALL create one AionUi Assistant per user-selected Kaneo role, named `Kaneo · <role>` (role is one of the seven Kaneo roles: `coding`, `product-design`, `architecture-design`, `devops`, `ui-design`, `testing`, `code-review`). The Assistant's description SHALL be the role's description from the templates endpoint, and the Assistant's context SHALL be the full content of that role's AGENTS.md definition.

#### Scenario: Create assistants for selected roles

- **WHEN** the user selects one or more roles and confirms creation
- **THEN** one Assistant is created per selected role with the `Kaneo · <role>` name
- **AND** the Assistant description matches the role description
- **AND** the Assistant context contains the role's AGENTS.md content (responsibilities, working rules, prohibitions, quality standards)

#### Scenario: Claim-task prompt preconfigured

- **WHEN** a role Assistant is created
- **THEN** it includes at least one recommended prompt instructing the assistant to claim its next role-matched task via the Kaneo API and work it according to its role rules

### Requirement: Kaneo skills import with role filtering

The system SHALL convert Kaneo skill packages (a `SKILL.md` with optional `for_roles` frontmatter, as packaged in the config zip) into AionUi custom skills, and enable on a role Assistant exactly the Kaneo skills whose `for_roles` includes that role (or whose `for_roles` is absent or empty, meaning universal). Role filtering MAY use the `forRoles` field from the templates listing response; when importing from a downloaded zip directly, it SHALL fall back to parsing each skill's `SKILL.md` frontmatter.

#### Scenario: Skills imported once

- **WHEN** a sync creates Assistants for multiple roles
- **THEN** each Kaneo skill is imported as one AionUi custom skill (not duplicated per role)

#### Scenario: Role-filtered skill enablement

- **WHEN** the `coding` Assistant is created and Kaneo skill `submit-pr` declares `for_roles: [coding, devops]` while `product-lens` declares `for_roles: [product-design]`
- **THEN** the coding Assistant enables `submit-pr` and does not enable `product-lens`

#### Scenario: Universal skill enabled everywhere

- **WHEN** a Kaneo skill has no `for_roles` frontmatter
- **THEN** every role Assistant created in the same sync enables that skill

### Requirement: Sync idempotence and update

The system SHALL recognize previously created Kaneo Assistants by the `Kaneo · <role>` naming convention. A repeated sync SHALL offer to update the context, prompts, and skill enablement of existing Kaneo Assistants instead of creating duplicates, and SHALL never modify Assistants that do not follow the naming convention.

#### Scenario: Re-sync updates instead of duplicating

- **WHEN** a sync runs and an Assistant named `Kaneo · coding` already exists
- **THEN** the system updates that Assistant's context and skill enablement to match the current Kaneo templates
- **AND** no second coding Assistant is created

#### Scenario: User assistants untouched

- **WHEN** a sync runs
- **THEN** Assistants not named `Kaneo · <role>` are not modified or deleted

#### Scenario: Partial failure reported

- **WHEN** a sync creates or updates multiple Assistants and one role fails (e.g. skill import error)
- **THEN** the other roles still complete
- **AND** the failure is reported per role with a retry option
