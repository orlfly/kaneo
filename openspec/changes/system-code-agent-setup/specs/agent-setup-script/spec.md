## ADDED Requirements

### Requirement: Downloadable agent configuration package

The system SHALL provide a downloadable zip package containing role definitions, skills, per-agent config files (opencode.jsonc / CLAUDE.md / AGENTS.md), and an `install.sh` script. Users download the package and manually run the install script in their chosen target directory.

#### Scenario: Package contains role definitions

- **WHEN** the download endpoint is called
- **THEN** the returned zip contains all 7 role AGENTS.md files under `roles/<role>/AGENTS.md`

#### Scenario: Package contains skills

- **WHEN** the download endpoint is called
- **THEN** the returned zip contains all skill directories with SKILL.md under `skills/<skill-name>/SKILL.md`

#### Scenario: Package contains per-agent configs

- **WHEN** the download endpoint is called
- **THEN** the returned zip contains `opencode.jsonc`, `CLAUDE.md`, and `AGENTS.md` config files for the three supported agents

#### Scenario: Package contains install.sh

- **WHEN** the download endpoint is called
- **THEN** the returned zip contains an `install.sh` script that supports installing to opencode, claude code, or codex

### Requirement: Install script supports three agents

The `install.sh` script SHALL support installing agent configuration to three agents: opencode, claude code, and codex. The target agent is selected via a `--agent` flag or auto-detected from existing config directories. The target installation directory is selected via a `--target` flag or defaults to the current working directory.

#### Scenario: Install to opencode

- **WHEN** the user runs `./install.sh --agent opencode` in the target directory
- **THEN** role AGENTS.md files are copied to `.opencode/agents/<role>/AGENTS.md`
- **AND** skill SKILL.md files are copied to `.opencode/skills/<skill-name>/SKILL.md`
- **AND** `opencode.jsonc` is placed at the target root

#### Scenario: Install to claude code

- **WHEN** the user runs `./install.sh --agent claude` in the target directory
- **THEN** role definitions are copied to `.claude/agents/<role>.md`
- **AND** skill SKILL.md files are copied to `.claude/skills/<skill-name>/SKILL.md`
- **AND** `CLAUDE.md` is placed at the target root

#### Scenario: Install to codex

- **WHEN** the user runs `./install.sh --agent codex` in the target directory
- **THEN** role definitions are copied to `.codex/agents/<role>.md`
- **AND** skill SKILL.md files are copied to `.codex/skills/<skill-name>/SKILL.md`
- **AND** `AGENTS.md` is placed at the target root

#### Scenario: Auto-detect agent from existing config

- **WHEN** the user runs `./install.sh` without `--agent` and a `.opencode/`, `.claude/`, or `.codex/` directory already exists
- **THEN** the script installs to the detected agent's directory structure

#### Scenario: Install all agents

- **WHEN** the user runs `./install.sh --agent all`
- **THEN** the script installs to all three agents' directory structures

#### Scenario: Install to a specified target directory

- **WHEN** the user runs `./install.sh --target <dir> --agent opencode`
- **THEN** the script installs the configuration to `<dir>` instead of the current working directory
- **AND** if `<dir>` does not exist, the script reports an error and exits

### Requirement: Install script behavior

The `install.sh` script SHALL be idempotent and back up existing files with a `.bak` suffix.

#### Scenario: Install script backs up existing files

- **WHEN** the user runs `./install.sh` and files already exist
- **THEN** existing files are backed up with a `.bak` suffix before overwriting

#### Scenario: Install script is idempotent

- **WHEN** the user runs `./install.sh` twice
- **THEN** the second run produces the same result without accumulating backup files

### Requirement: Download via API endpoint

The download operation SHALL be triggered via `GET /api/agent/agents-config/download`, returning a zip file with `Content-Type: application/zip` and a `Content-Disposition: attachment` header.

#### Scenario: Download returns zip

- **WHEN** a user calls the download endpoint
- **THEN** the response is a zip file with the correct content type and attachment disposition

#### Scenario: Download requires authentication

- **WHEN** an unauthenticated user calls the download endpoint
- **THEN** the API returns 401