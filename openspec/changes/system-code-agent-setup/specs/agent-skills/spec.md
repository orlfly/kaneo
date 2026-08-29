## ADDED Requirements

### Requirement: Shared skills for cross-role workflows

The system SHALL provide a set of SKILL.md files covering common workflows shared across all agent roles: task lifecycle management, repository sync, code search, test execution, and PR/MR submission.

#### Scenario: Skills directory structure

- **WHEN** the skills template directory is inspected
- **THEN** it contains subdirectories each with a SKILL.md file
- **AND** the subdirectories cover: claim-task, repo-sync, code-search, run-tests, submit-pr

### Requirement: claim-task skill (full task lifecycle)

The claim-task skill SHALL guide agents through the complete task lifecycle: authenticate with Kaneo API key, claim a role-matched task, read task details, update task status on progress/completion, pause with reason if blocked, release the task, and create follow-up tasks.

#### Scenario: Claim a task

- **WHEN** the agent starts work
- **THEN** it calls `POST /api/task/claim-next` with its API key to claim the best matching task
- **AND** reads task details via `GET /api/task/:id`

#### Scenario: Update task status after PR

- **WHEN** the agent has submitted a PR/MR for the task
- **THEN** it calls `PUT /api/task/:id` to update the task status to `in-review`
- **AND** the task description is updated with a link to the PR if applicable

#### Scenario: Pause task when blocked

- **WHEN** the agent cannot complete the task due to a blocker
- **THEN** it calls `POST /api/task/:id/pause` with a `reason` describing the blocker
- **AND** the task becomes visible in blocked-task inspections

#### Scenario: Release task

- **WHEN** the agent determines it is not the right role for the task after reading details
- **THEN** it calls `POST /api/task/:id/release` to make the task available to other agents

#### Scenario: Create follow-up task

- **WHEN** the agent discovers additional work during implementation
- **THEN** it calls `POST /api/task` with a title, description, and optional `requiredRole` for the follow-up task
- **AND** links it as a subtask or relation if applicable

### Requirement: repo-sync skill

The repo-sync skill SHALL guide agents on synchronizing the project repository in the working directory, including pulling latest changes and handling merge conflicts.

#### Scenario: SKILL.md content for repo-sync

- **WHEN** the repo-sync SKILL.md is read
- **THEN** it describes using `git pull --rebase`, resolving conflicts, and verifying clean working tree before starting work

### Requirement: code-search skill

The code-search skill SHALL guide agents on searching code using ripgrep or equivalent tools, with patterns for finding definitions, usages, and TODO markers.

#### Scenario: SKILL.md content for code-search

- **WHEN** the code-search SKILL.md is read
- **THEN** it describes using `rg` with patterns for function definitions, import tracking, and grep-based TODO/FIXME discovery

### Requirement: run-tests skill

The run-tests skill SHALL guide agents on running the project's test suite, interpreting results, and reporting failures.

#### Scenario: SKILL.md content for run-tests

- **WHEN** the run-tests SKILL.md is read
- **THEN** it describes detecting the test runner (jest, vitest, pytest, mvn test), running targeted tests, and reporting pass/fail counts

### Requirement: submit-pr skill

The submit-pr skill SHALL guide agents on creating branches, committing changes, and submitting merge requests through the project's connected VCS.

#### Scenario: SKILL.md content for submit-pr

- **WHEN** the submit-pr SKILL.md is read
- **THEN** it describes creating feature branches, writing conventional commit messages, and using the Kaneo API to create external links to the MR

### Requirement: Skills stored as templates

Skill templates SHALL be stored in `apps/api/src/agent/agents/templates/skills/<skill-name>/SKILL.md`. Templates are copied to project working directories on install.

#### Scenario: Template path for skills

- **WHEN** the system packages skill templates
- **THEN** each skill has its own directory under `templates/skills/`
- **AND** each directory contains a `SKILL.md` file