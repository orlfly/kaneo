## ADDED Requirements

### Requirement: Per-project agent working directory

The system SHALL provide a server-side working directory for each project (`agent-<projectId>` under a configurable workspace root, default `<data>/agent-workdir`), isolated per project. pi-agent and file tools SHALL only read and write within that project's directory.

#### Scenario: Working directory is created lazily per project

- **WHEN** a file operation tool runs for a project that has no working directory yet
- **THEN** the directory is created on first use
- **AND** all subsequent file operations are scoped to that project's directory

#### Scenario: File operations reject paths outside the project directory

- **WHEN** a tool is given a path that escapes the project's working directory (for example `../other` or an absolute path)
- **THEN** the tool returns an error
- **AND** no file outside the project directory is read or written

### Requirement: List files in the agent working directory

The system SHALL provide an `agent_list_files` tool that lists the contents of the project's working directory (or a subdirectory), returning entries with name, type (file/directory), and size where available.

#### Scenario: List root of the working directory

- **WHEN** the agent lists the working directory root
- **THEN** the tool returns the top-level files and directories with their types

#### Scenario: List a subdirectory

- **WHEN** the agent lists a relative subdirectory inside the working directory
- **THEN** the tool returns that directory's contents

#### Scenario: List a non-existent path

- **WHEN** the agent lists a path that does not exist
- **THEN** the tool returns an error

### Requirement: Agent read file

The system SHALL provide an `agent_read_file` tool that reads a file inside the project's working directory as text, honoring a byte limit and optional offset/limit for paging.

#### Scenario: Read a text file

- **WHEN** the agent reads a text file within the working directory
- **THEN** the tool returns the file content

#### Scenario: Read respects the byte limit

- **WHEN** the agent reads a file larger than the configured `maxBytes`
- **THEN** the tool returns the truncated portion and notes that truncation occurred

#### Scenario: Read a non-existent file

- **WHEN** the agent reads a file that does not exist
- **THEN** the tool returns an error

### Requirement: Agent write file

The system SHALL provide an `agent_write_file` tool that creates or overwrites a file inside the project's working directory.

#### Scenario: Write a new file

- **WHEN** the agent writes a file path inside the working directory
- **THEN** the file is created (with parent directories as needed) with the given content

#### Scenario: Overwrite an existing file

- **WHEN** the agent writes to an existing file path inside the working directory
- **THEN** the file content is replaced

#### Scenario: Write rejects an out-of-bounds path

- **WHEN** the agent writes to a path that escapes the working directory
- **THEN** the tool returns an error and no file is created

### Requirement: Agent search files

The system SHALL provide an `agent_search_files` tool that recursively searches the project's working directory by filename and/or content keyword, honoring common ignore rules (`.git`, `node_modules`, etc.).

#### Scenario: Search by filename

- **WHEN** the agent searches for a filename fragment
- **THEN** the tool returns matching file paths

#### Scenario: Search by content keyword

- **WHEN** the agent searches for a content keyword
- **THEN** the tool returns files whose content contains the keyword, with matching line numbers

#### Scenario: Ignored directories are skipped

- **WHEN** the search runs over a tree containing `.git` or `node_modules`
- **THEN** those directories are not searched

### Requirement: Agent delete file

The system SHALL provide an `agent_delete_file` tool that deletes a file (or empty directory) inside the project's working directory, and SHALL refuse to delete outside the project directory.

#### Scenario: Delete a file

- **WHEN** the agent deletes a file inside the working directory
- **THEN** the file is removed and the tool confirms the deletion path

#### Scenario: Delete rejects an out-of-bounds path

- **WHEN** the agent deletes a path that escapes the working directory
- **THEN** the tool returns an error and nothing is deleted

### Requirement: Agent working-dir file upload in chat

The system SHALL provide a `POST /api/chat/project/:projectId/upload` endpoint, protected by team membership, that stores an uploaded file into the project's working directory under `uploads/`. The upload SHALL enforce a maximum size and a supported MIME-type allowlist, and SHALL return the stored relative path.

#### Scenario: Team member uploads a file

- **WHEN** a team member posts a file to the upload endpoint
- **THEN** the file is stored under the project working directory's `uploads/` folder
- **AND** the response returns the relative path and a success indicator

#### Scenario: Upload exceeds the size limit

- **WHEN** an upload exceeds the configured maximum size
- **THEN** the endpoint rejects it with an error

#### Scenario: Non-team member denied

- **WHEN** a user who is not a member of the project's team posts a file
- **THEN** the endpoint returns `403 Forbidden`
