## ADDED Requirements

### Requirement: Agent can clone the project's connected VCS repository

The system SHALL provide an `agent_clone_repo` tool that clones the project's active VCS integration repository (GitHub, GitLab, or Gitea) into the project's working directory under a `repo` folder, using the stored integration config and credentials. When a clone already exists, the tool SHALL update it (pull) instead of re-cloning. The system SHALL reuse the existing SSRF guard for outbound HTTP.

#### Scenario: Clone GitLab repository

- **WHEN** the agent calls `agent_clone_repo` for a project with an active GitLab integration
- **THEN** the repository is cloned (default branch, shallow) into `<project workdir>/repo`
- **AND** the tool returns the clone location and current branch

#### Scenario: Clone Gitea repository

- **WHEN** the agent calls `agent_clone_repo` for a project with an active Gitea integration
- **THEN** the repository is cloned from the configured Gitea base URL

#### Scenario: Clone GitHub repository

- **WHEN** the agent calls `agent_clone_repo` for a project with an active GitHub integration
- **THEN** the repository is cloned from GitHub using the App installation credentials

#### Scenario: Re-clone refreshes instead of failing

- **WHEN** the agent calls `agent_clone_repo` and a clone already exists in the workdir
- **THEN** the tool pulls the latest changes rather than throwing

#### Scenario: No active VCS integration

- **WHEN** the agent calls `agent_clone_repo` for a project with no active VCS integration
- **THEN** the tool returns a helpful error explaining no repository is configured

#### Scenario: Private/internal repository blocked by SSRF guard

- **WHEN** the configured repository host resolves to a private address and the SSRF guard is active
- **THEN** the tool returns an error consistent with the existing integration SSRF behavior

### Requirement: Agent can read and analyze repository files

The system SHALL allow pi-agent to read source code and documentation from the cloned repository through the existing file tools (`agent_read_file`, `agent_search_files`, `agent_list_files`), which operate within the project working directory containing the cloned repo.

#### Scenario: Read a source file from the cloned repo

- **WHEN** the agent calls `agent_read_file` on a path inside the cloned `repo` directory
- **THEN** the tool returns the file content

#### Scenario: Search the repository for a symbol

- **WHEN** the agent calls `agent_search_files` for a content keyword inside the repository
- **THEN** the tool returns matching files and line numbers

### Requirement: Agent can run commands in the working directory

The system SHALL provide an `agent_run_command` tool that runs a shell command with the project working directory as `cwd`, capturing stdout/stderr and exit code, with a configurable timeout (default 60s) and an output-size cap. Running commands SHALL be gated behind an `enableCommandExecution` configuration flag (default disabled).

#### Scenario: Run a command in the working directory

- **WHEN** `enableCommandExecution` is true and the agent runs a command
- **THEN** the command runs with cwd set to the project working directory
- **AND** the tool returns `{ stdout, stderr, exitCode }`

#### Scenario: Command times out

- **WHEN** a command runs longer than the configured timeout
- **THEN** the process is killed and the tool returns a `timedOut: true` result

#### Scenario: Output exceeds the cap

- **WHEN** a command's combined output exceeds the output cap
- **THEN** the captured output is truncated and a truncation note is returned

#### Scenario: Command execution disabled

- **WHEN** `enableCommandExecution` is false (default)
- **THEN** the `agent_run_command` tool returns an error indicating command execution is not enabled

### Requirement: Agent code capability tool registration

The agent file, clone, and command tools SHALL be registered on the conversation tool set (`apps/api/src/chat/tools.ts`) and mirrored on the MCP servers (modern `apps/api/src/mcp/tools.ts` and legacy `packages/mcp/src/tools/register.ts`) following the existing dual-registrar pattern.

#### Scenario: Tools available in chat

- **WHEN** pi-agent is asked to clone the repo, read a file, or run a command
- **THEN** the corresponding agent tool is available in the conversation tool set

#### Scenario: Tools mirrored on MCP servers

- **WHEN** the MCP tool catalog is inspected on the modern and legacy servers
- **THEN** the agent working-dir, clone, and command tools are present on both
