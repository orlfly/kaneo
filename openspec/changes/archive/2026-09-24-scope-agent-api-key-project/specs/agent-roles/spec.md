## MODIFIED Requirements

### Requirement: Claim-next prioritization

The system SHALL offer `POST /api/task/claim-next` which claims the best candidate among the caller's rule-matched tasks. Tasks assigned to the caller SHALL be prioritized over role-matched unassigned tasks; within each group the existing ordering (due date ascending, priority descending, creation ascending) applies. When the caller authenticates with a project-bound API key, candidate search SHALL be limited to the bound project.

#### Scenario: Assigned task picked first

- **WHEN** the caller has an assigned claimable task and role-matched unassigned tasks
- **THEN** the assigned task is claimed first

#### Scenario: None available returns 404

- **WHEN** no matching candidate exists
- **THEN** the API returns 404 with a "no tasks available" message

#### Scenario: Explicit role narrows candidates

- **WHEN** the caller passes an explicit `requiredRole` filter in the request body
- **THEN** candidates are narrowed to generic tasks plus tasks of that role
- **AND** the filter cannot grant access to roles the caller does not have

#### Scenario: Project-bound caller sees only bound project

- **WHEN** the caller authenticates with an API key bound to a project and calls claim-next
- **THEN** candidates are drawn only from the bound project