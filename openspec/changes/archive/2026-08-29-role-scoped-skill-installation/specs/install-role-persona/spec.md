## MODIFIED Requirements

### Requirement: Install script persona role selection

The `install.sh` script SHALL support a `--role <name>` flag that selects a Kaneo pre-defined agent persona and writes it to the selected tool's primary instruction file, so that one tool instance works according to one persona. The role SHALL be one of the 7 `requiredRole` values. The script SHALL install only those SKILL.md files whose `for_roles` frontmatter includes the selected persona role. Skills whose `for_roles` does not include the role SHALL be skipped. SKILL.md files without a `for_roles` frontmatter SHALL be installed regardless of the role (backward compatibility). The script SHALL log every skipped skill with the skill name and active persona role.

#### Scenario: Install persona for opencode

- **WHEN** the user runs `./install.sh --agent opencode --role coding`
- **THEN** the `coding` role's AGENTS.md content is written to `.opencode/AGENT.md`
- **AND** only skills whose `for_roles` contains `coding` are installed to `.opencode/skills/`

#### Scenario: Install persona for claude code

- **WHEN** the user runs `./install.sh --agent claude --role testing`
- **THEN** the `testing` role's AGENTS.md content is written to `CLAUDE.md`
- **AND** only skills whose `for_roles` contains `testing` are installed to `.claude/skills/`

#### Scenario: Install persona for codex

- **WHEN** the user runs `./install.sh --agent codex --role devops`
- **THEN** the `devops` role's AGENTS.md content is written to `AGENTS.md`
- **AND** only skills whose `for_roles` contains `devops` are installed to `.codex/skills/`

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

#### Scenario: Persona role determines skill selection

- **WHEN** the user runs `./install.sh --agent opencode --role ui-design`
- **THEN** `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-prd`, `write-adr`, `write-iac`, `write-test-suite`, `review-pr` are skipped because none of their `for_roles` includes `ui-design`
- **AND** `claim-task` is installed because its `for_roles` includes all roles
- **AND** `write-design-spec` is installed because its `for_roles` is `[ui-design]`
- **AND** the script logs each skipped skill with the skill name and `ui-design`

#### Scenario: Product-design persona installs write-prd only

- **WHEN** the user runs `./install.sh --agent opencode --role product-design`
- **THEN** `claim-task` and `write-prd` are installed
- **AND** every other skill (`code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`) is skipped

#### Scenario: Devops persona installs write-iac and submit-pr

- **WHEN** the user runs `./install.sh --agent opencode --role devops`
- **THEN** `claim-task`, `repo-sync`, `submit-pr`, `write-iac` are installed
- **AND** `code-search`, `run-tests`, and the role-specific skills for non-devops roles are skipped

#### Scenario: Code-review persona installs review-pr

- **WHEN** the user runs `./install.sh --agent opencode --role code-review`
- **THEN** `claim-task`, `code-search`, `review-pr` are installed
- **AND** `submit-pr` is skipped because `code-review` is not in `submit-pr`'s `for_roles`

#### Scenario: SKILL.md without frontmatter is always installed

- **WHEN** the user runs `./install.sh --agent opencode --role product-design`
- **AND** a SKILL.md in the staging area lacks a `for_roles` frontmatter
- **THEN** that SKILL.md is installed regardless of the persona role
- **AND** no skill-scope log line is printed for that SKILL.md