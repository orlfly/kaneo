## ADDED Requirements

### Requirement: Role definition files for each agent role

The system SHALL provide an AGENTS.md file for each of the 7 agent roles (coding, product-design, architecture-design, devops, ui-design, testing, code-review). Each file SHALL describe the role's responsibilities, allowed tools, prohibited actions, and quality standards.

#### Scenario: All roles have definitions

- **WHEN** the system packages agent role templates
- **THEN** exactly 7 AGENTS.md files exist, one per role
- **AND** each file references the role's canonical name from the `@kaneo/permissions` vocabulary

### Requirement: Role definition content structure

Each AGENTS.md file SHALL contain: role name, responsibility summary, allowed tools and commands, prohibited actions, output quality requirements, and handoff instructions for the next role.

#### Scenario: Coding role definition

- **WHEN** the coding role AGENTS.md is read
- **THEN** it describes implementing features and bug fixes, running tests before completion, and committing with conventional commit messages

#### Scenario: Code-review role definition

- **WHEN** the code-review role AGENTS.md is read
- **THEN** it describes reviewing diffs, checking test coverage, and providing structured feedback with severity levels
- **AND** it prohibits direct code edits

#### Scenario: Testing role definition

- **WHEN** the testing role AGENTS.md is read
- **THEN** it describes writing and running test suites, verifying edge cases, and reporting coverage gaps

### Requirement: Role definitions stored as templates

Role definition templates SHALL be stored in `apps/api/src/agent/agents/templates/roles/<role>/AGENTS.md`. Templates are versioned with the API package and copied to project working directories on install.

#### Scenario: Template directory structure

- **WHEN** the template directory is inspected
- **THEN** it contains `templates/roles/coding/AGENTS.md`, `templates/roles/product-design/AGENTS.md`, etc. for all 7 roles

### Requirement: Role definitions are bilingual

Each AGENTS.md SHALL use Chinese for descriptive text and English for technical terms (tool names, command names, file paths).

#### Scenario: Mixed language content

- **WHEN** any role definition file is read
- **THEN** descriptive paragraphs are in Chinese
- **AND** tool names, command examples, and file paths are in English