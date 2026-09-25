## ADDED Requirements

### Requirement: Agent configuration list endpoint

The system SHALL provide `GET /api/agent/agents-config/templates` returning the available role definitions and skills templates bundled with the API.

#### Scenario: List templates

- **WHEN** the templates endpoint is called
- **THEN** it returns `roles` (array of `{ name, description }`) and `skills` (array of `{ name, description }`) from the bundled templates

### Requirement: Agent configuration download endpoint

The system SHALL provide `GET /api/agent/agents-config/download` returning a zip package containing role definitions, skills, `opencode.jsonc`, and `install.sh`. The response SHALL have `Content-Type: application/zip` and `Content-Disposition: attachment; filename="kaneo-agent-config.zip"`.

#### Scenario: Download returns zip

- **WHEN** a user calls the download endpoint
- **THEN** the response is a zip file with the correct content type and attachment disposition

#### Scenario: Download requires authentication

- **WHEN** an unauthenticated user calls the download endpoint
- **THEN** the API returns 401

### Requirement: Frontend agent configuration panel

The web app SHALL show an "Agent 配置" panel in the project settings page, displaying available roles and skills, with a download button that triggers the config package download.

#### Scenario: Panel shows available roles and skills

- **WHEN** a team member opens the project settings Agent 配置 panel
- **THEN** it shows the available roles and skills from the templates endpoint

#### Scenario: Download button triggers download

- **WHEN** the team member clicks the download button
- **THEN** the browser downloads the config zip package
- **AND** a toast confirms the download started

#### Scenario: Download error displayed

- **WHEN** the download API returns an error
- **THEN** the panel shows the error message with a retry option