## ADDED Requirements

### Requirement: Install script persona role selection

The `install.sh` script SHALL support a `--role <name>` flag that selects a Kaneo pre-defined agent persona and writes it to the selected tool's primary instruction file, so that one tool instance works according to one persona. The role SHALL be one of the 7 `requiredRole` values. Skills SHALL be installed alongside the selected role.

#### Scenario: Install persona for opencode

- **WHEN** the user runs `./install.sh --agent opencode --role coding`
- **THEN** the `coding` role's AGENTS.md content is written to `.opencode/AGENT.md`
- **AND** skills are installed to `.opencode/skills/`

#### Scenario: Install persona for claude code

- **WHEN** the user runs `./install.sh --agent claude --role testing`
- **THEN** the `testing` role's AGENTS.md content is written to `CLAUDE.md`
- **AND** skills are installed to `.claude/skills/`

#### Scenario: Install persona for codex

- **WHEN** the user runs `./install.sh --agent codex --role devops`
- **THEN** the `devops` role's AGENTS.md content is written to `AGENTS.md`
- **AND** skills are installed to `.codex/skills/`

#### Scenario: One tool instance corresponds to one persona

- **WHEN** the user runs `./install.sh --agent opencode --role coding`
- **THEN** the opencode instance is configured to work as the `coding` persona
- **AND** no additional role subagents are registered

#### Scenario: Invalid role rejected

- **WHEN** the user runs `./install.sh --role bogus-role --agent opencode`
- **THEN** the script reports an error listing the 7 valid roles
- **AND** exits with a non-zero status

#### Scenario: No role provided

- **WHEN** the user runs `./install.sh --agent opencode` without `--role`
- **THEN** the script reports that a role is required to configure the persona
- **AND** exits with a non-zero status, or prompts for a role

#### Scenario: Existing instruction file backed up

- **WHEN** the user runs `./install.sh --agent opencode --role coding` and a `.opencode/AGENT.md` already exists
- **THEN** the existing file is backed up with a `.bak` suffix before overwriting
