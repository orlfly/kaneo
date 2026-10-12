## ADDED Requirements

### Requirement: Prototype skill produces a self-contained HTML artifact

The bundled skills SHALL include a `prototype-ui` skill applicable to both design personas (`product-design`, `ui-design`). The skill SHALL require the agent to write its deliverable to `docs/prototypes/<feature-slug>/index.html` inside the task's integrated repository, and the artifact SHALL be a single self-contained HTML file that opens directly in a browser without a build step and without any network dependency.

#### Scenario: artifact path and single-file constraint

- **WHEN** a reviewer reads `skills/prototype-ui/SKILL.md`
- **THEN** the workflow instructs the agent to write `docs/prototypes/<feature-slug>/index.html`
- **AND** the constraints forbid referencing external network resources and forbid introducing a bundler or npm dependency for the prototype

#### Scenario: prototype is not implementation

- **WHEN** the prototype skill completes
- **THEN** the prototype code lives only under `docs/prototypes/**` and is not copied into application source
- **AND** no application build, test, or deployment step consumes it

### Requirement: Fidelity lanes are split between the two design personas

The `prototype-ui` skill SHALL define two fidelity lanes and assign each to one persona. `product-design` SHALL own the low-fidelity structural prototype (information architecture, navigation paths, interaction flow, state coverage). `ui-design` SHALL own the high-fidelity visual prototype (visual language, type hierarchy, spacing rhythm, design tokens, micro-interaction states) and SHALL build on the structural prototype's page structure when one exists.

#### Scenario: product-design delivers the low-fidelity lane

- **WHEN** a `product-design` agent runs the skill
- **THEN** the deliverable is a low-fidelity structural prototype
- **AND** precise visual design is explicitly out of scope for that lane

#### Scenario: ui-design delivers the high-fidelity lane

- **WHEN** a `ui-design` agent runs the skill
- **THEN** the deliverable is a high-fidelity visual prototype whose visual values come from the project's design tokens rather than hard-coded literals

### Requirement: Prototype covers PRD stories and key states

The `prototype-ui` skill SHALL require the agent to map every user story in scope to a page before writing markup, and to cover the `default`, `empty`, `loading`, and `error` states. States that do not apply SHALL be explained in the prototype's `README.md`.

#### Scenario: user stories are mapped and covered

- **WHEN** the prototype is complete
- **THEN** each in-scope user story appears as an annotated screen or section
- **AND** the annotation names the user story and the states it demonstrates

#### Scenario: open questions are explicit

- **WHEN** the prototype leaves a product decision unresolved
- **THEN** the unresolved item is listed under 待决问题 in `docs/prototypes/<feature-slug>/README.md`

### Requirement: Prototype skill is scoped to the two design personas only

The `prototype-ui` skill SHALL declare `for_roles: [product-design, ui-design]`. The installer and the role-filtered package endpoint SHALL include it for exactly those two personas and skip it for `coding`, `architecture-design`, `devops`, `testing`, and `code-review`.

#### Scenario: templates metadata exposes the scope

- **WHEN** the client requests `GET /api/agent/agents-config/templates`
- **THEN** the `prototype-ui` entry lists `["product-design", "ui-design"]`

#### Scenario: filtered download includes the skill for both design personas

- **WHEN** the client requests `GET /api/agent/agents-config/download?role=product-design` or `?role=ui-design`
- **THEN** the zip contains `skills/prototype-ui/SKILL.md`

#### Scenario: filtered download excludes the skill for the other personas

- **WHEN** the client requests the download for `coding`, `architecture-design`, `devops`, `testing`, or `code-review`
- **THEN** the zip does not contain `skills/prototype-ui/SKILL.md`
