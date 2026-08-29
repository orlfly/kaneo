## 1. Claim Logic (claim-next-task)

- [x] 1.1 In `apps/api/src/task/controllers/claim-next-task.ts`, make `claimableStatuses` depend on `agentRole`: `["in-review"]` for `code-review`, `["to-do"]` otherwise
- [x] 1.2 For `code-review`, skip the `requiredRole` match constraint in `baseUnassignedConditions` (claim any in-review task)
- [x] 1.3 Ensure non-code-review still requires `requiredRole` NULL or equal to agentRole

## 2. Claim Logic (claim-task)

- [x] 2.1 In `apps/api/src/task/controllers/claim-task.ts`, adjust status check: `in-review` for `code-review`, `to-do` otherwise
- [x] 2.2 For `code-review`, skip the `requiredRole` constraint in both the candidate check and the locked UPDATE WHERE clause

## 3. Status Change requiredRole flow

- [x] 3.1 In `apps/api/src/task/controllers/update-task-status.ts`, accept an optional `agentRole` parameter
- [x] 3.2 When target status is `in-progress` and `agentRole` present, set `requiredRole = agentRole`
- [x] 3.3 When target status is `in-review`, set `requiredRole = "code-review"`
- [x] 3.4 When target status is `done`, set `requiredRole = null`
- [x] 3.5 For other statuses, leave `requiredRole` unchanged

## 4. Create Task requiredRole flow

- [x] 4.1 In `apps/api/src/task/controllers/create-task.ts`, accept an optional `agentRole` parameter
- [x] 4.2 When `requiredRole` not explicitly provided and `agentRole` present, set `requiredRole = agentRole`

## 5. Route propagation

- [x] 5.1 In `apps/api/src/task/index.ts`, pass `apiKey?.agentRole` to `updateTaskStatus` in the `/status/:id` route
- [x] 5.2 In `apps/api/src/task/index.ts`, pass `apiKey?.agentRole` to `createTask` in the `/:projectId` route

## 6. Tests

- [x] 6.1 Write test: coding agent claims matching to-do task
- [x] 6.2 Write test: coding agent refuses role-mismatched to-do task
- [x] 6.3 Write test: code-review agent claims in-review task ignoring requiredRole
- [x] 6.4 Write test: code-review agent does not claim to-do tasks
- [x] 6.5 Write test: status to in-progress sets requiredRole to agent role
- [x] 6.6 Write test: status to in-review sets requiredRole to code-review
- [x] 6.7 Write test: status to done clears requiredRole
- [x] 6.8 Write test: agent-created task gets requiredRole set to agent role
