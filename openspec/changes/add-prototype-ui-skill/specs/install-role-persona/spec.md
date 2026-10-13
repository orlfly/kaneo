## MODIFIED Requirements

### Requirement: Installer copies only skills matching the persona role

The `install.sh` script SHALL copy each SKILL.md from the staging directory to the target tool's skills directory only if the SKILL.md's `for_roles` includes the persona role selected via `--role`. Skills whose `for_roles` does not include the persona role SHALL be skipped. The script SHALL print a log line for each skipped skill identifying the skill name and the active persona role.

#### Scenario: install.sh filters skills for ui-design persona

- **WHEN** the user runs `./install.sh --agent opencode --role ui-design`
- **THEN** `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-iac`, `write-adr`, `write-prd`, `write-test-suite`, `review-pr` are skipped because none of their `for_roles` includes `ui-design`
- **AND** `claim-task`, `write-design-spec`, and `prototype-ui` are installed

#### Scenario: install.sh filters skills for product-design persona

- **WHEN** the user runs `./install.sh --agent opencode --role product-design`
- **THEN** `claim-task`, `write-prd`, `product-lens`, `product-capability`, `intent-driven-development`, and `prototype-ui` are installed
- **AND** `code-search`, `repo-sync`, `run-tests`, `submit-pr`, `write-adr`, `write-design-spec`, `write-iac`, `write-test-suite`, `review-pr`, `frontend-design`, `make-interfaces-feel-better`, `accessibility` are skipped

#### Scenario: install.sh excludes the prototype skill for coding persona

- **WHEN** the user runs `./install.sh --agent opencode --role coding`
- **THEN** `skills/prototype-ui/SKILL.md` is not written to `.opencode/skills/`
- **AND** the installer logs `prototype-ui` as skipped with the `coding` role
