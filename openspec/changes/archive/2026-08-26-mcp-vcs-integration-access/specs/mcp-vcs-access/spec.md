## ADDED Requirements

### Requirement: MCP agent can read integrated VCS repositories and issues

The system SHALL expose MCP tools that let the signed-in agent read the project's integrated VCS systems (GitHub, GitLab, Gitea). The agent SHALL reference a project by `projectId`; the system SHALL resolve the project's active integration of the requested type and use its stored config to reach the VCS. The system SHALL provide read tools for listing repositories, listing issues, getting a single issue, listing issue comments, listing pull requests, and listing labels.

#### Scenario: Agent lists issues for a project with an active GitLab integration

- **WHEN** the agent calls the VCS list-issues tool with a `projectId` whose active integration is GitLab
- **THEN** the system resolves the stored GitLab config and returns the configured repository's issues

#### Scenario: Agent lists issues for a project with an active GitHub integration

- **WHEN** the agent calls the VCS list-issues tool with a `projectId` whose active integration is GitHub
- **THEN** the system resolves the GitHub App installation and returns the configured repository's issues

#### Scenario: Agent gets a single issue

- **WHEN** the agent calls the VCS get-issue tool with a `projectId` and an issue number
- **THEN** the system returns that issue from the configured repository

#### Scenario: Agent lists issue comments

- **WHEN** the agent calls the VCS list-comments tool with a `projectId` and an issue number
- **THEN** the system returns the comments on that issue

#### Scenario: Agent lists pull requests

- **WHEN** the agent calls the VCS list-pull-requests tool with a `projectId`
- **THEN** the system returns the open pull requests for the configured repository

#### Scenario: Agent lists labels

- **WHEN** the agent calls the VCS list-labels tool with a `projectId`
- **THEN** the system returns the labels defined in the configured repository

### Requirement: MCP agent can write to integrated VCS systems

The system SHALL expose MCP tools that let the signed-in agent create and update issues, comments, and labels on the project's integrated VCS systems, and manage labels on issues. The system SHALL resolve the active integration and use its stored config, and SHALL surface failures as MCP error results.

#### Scenario: Agent creates an issue

- **WHEN** the agent calls the VCS create-issue tool with a `projectId`, title, and optional body
- **THEN** the system creates an issue in the configured repository and returns it

#### Scenario: Agent updates an issue

- **WHEN** the agent calls the VCS update-issue tool with a `projectId`, issue number, and fields to change
- **THEN** the system updates the issue in the configured repository

#### Scenario: Agent creates an issue comment

- **WHEN** the agent calls the VCS create-comment tool with a `projectId`, issue number, and body
- **THEN** the system adds a comment to the issue

#### Scenario: Agent creates a label

- **WHEN** the agent calls the VCS create-label tool with a `projectId`, name, and color
- **THEN** the system creates the label in the configured repository

#### Scenario: Agent manages labels on an issue

- **WHEN** the agent calls a VCS add/replace/remove-label tool with a `projectId` and issue number
- **THEN** the system applies the requested label change to the issue

#### Scenario: VCS write fails

- **WHEN** the VCS returns an error (for example, unauthorized or not found)
- **THEN** the system returns an MCP error result with a readable message

### Requirement: MCP agent can import VCS issues into a Kaneo project

The system SHALL expose an MCP tool that imports issues from the project's active VCS integration into Kaneo tasks, reusing the existing import controllers. The system SHALL return a summary of imported, updated, and skipped issues.

#### Scenario: Agent imports issues

- **WHEN** the agent calls the VCS import-issues tool with a `projectId`
- **THEN** the system imports the configured repository's issues into Kaneo tasks and returns an import summary

### Requirement: VCS access is scoped to the signed-in user's accessible projects

The system SHALL only resolve and operate on integrations for projects the signed-in user can access. The system SHALL NOT expose VCS credentials (tokens, base URLs, installation IDs) in tool inputs or tool results. The system SHALL reuse the existing SSRF guard for GitLab and Gitea outbound calls.

#### Scenario: Agent references an inaccessible project

- **WHEN** the agent calls a VCS tool with a `projectId` the signed-in user cannot access
- **THEN** the system rejects the call with an authorization error

#### Scenario: Agent references a project with no active integration

- **WHEN** the agent calls a VCS tool with a `projectId` that has no active integration of the requested type
- **THEN** the system returns an error indicating the integration is not found or not active

#### Scenario: Credentials are not exposed

- **WHEN** the agent calls any VCS tool
- **THEN** the tool inputs and results do not contain access tokens, base URLs, or installation IDs
