## ADDED Requirements

### Requirement: Verify response exposes the authenticated user

The system SHALL, when verifying a GitLab access token, call GitLab's `/api/v4/user` endpoint and surface the authenticated user in the verify response as `authenticatedAs`. The `authenticatedAs` field MUST be `null` when the token is unauthorized; otherwise it MUST include the user's `id`, `username`, optional `name`, optional `avatarUrl`, and `bot` flag. The system MUST NOT proceed with permission checks until the user identity is known.

#### Scenario: Valid personal access token

- **WHEN** a user with a valid personal access token submits a verify request
- **THEN** the response contains a non-null `authenticatedAs`
- **AND** `authenticatedAs.username` equals the GitLab login of the token owner
- **AND** `authenticatedAs.avatarUrl` (when present) is the avatar URL returned by GitLab

#### Scenario: Invalid or expired token

- **WHEN** a user submits a verify request with an invalid or expired token
- **THEN** the response sets `authenticatedAs` to `null`
- **AND** `failureReason` is `unauthorized`
- **AND** `hasRequiredPermissions` is `false`

#### Scenario: Self-hosted GitLab that does not advertise user name

- **WHEN** a GitLab instance returns a user without the `name` field set
- **THEN** the response sets `authenticatedAs.name` to `undefined` (omitted from the JSON payload)
- **AND** the UI renders only the username (no empty parentheses)

### Requirement: Verify response exposes token scopes when advertised

The system SHALL, when verifying a GitLab access token, parse the `X-Oauth-Scopes` response header returned by `/api/v4/user` and surface the scopes as a `tokenScopes` array of strings in the verify response. When the header is absent or empty, the system MUST return `tokenScopes` as an empty array (not `null`).

#### Scenario: OAuth token with scopes

- **WHEN** the GitLab response includes `X-Oauth-Scopes: api read_api`
- **THEN** the response contains `tokenScopes: ["api", "read_api"]`

#### Scenario: Personal access token (no scopes advertised)

- **WHEN** the GitLab response does not include `X-Oauth-Scopes` (typical for PATs)
- **THEN** the response contains `tokenScopes: []`
- **AND** the UI shows the explanatory line "Not advertised by the GitLab instance (common for personal access tokens)."

#### Scenario: Header parsing ignores whitespace and empty entries

- **WHEN** the header contains a comma-separated list with surrounding whitespace
- **THEN** the array contains the trimmed, non-empty entries in order

### Requirement: Verify response exposes repository visibility

The system SHALL report whether the configured repository exists and whether it is private. `repositoryExists` MUST be `true` only when the project API returns the project; `repositoryPrivate` MUST be the GitLab `visibility` mapped to a boolean (`visibility !== "public"` ⇒ `true`), or `null` when the repository cannot be read.

#### Scenario: Private repository visible to the token

- **WHEN** the token can read a private repository
- **THEN** `repositoryExists` is `true`
- **AND** `repositoryPrivate` is `true`

#### Scenario: Public repository

- **WHEN** the token can read a public repository
- **THEN** `repositoryExists` is `true`
- **AND** `repositoryPrivate` is `false`

#### Scenario: Repository does not exist or token cannot read it

- **WHEN** the project API responds with 404 or the token has no project access
- **THEN** `repositoryExists` is `false`
- **AND** `repositoryPrivate` is `null`

### Requirement: Verify response classifies the failure reason

The system SHALL map GitLab API failures to a finite `failureReason` value so the UI can render specific guidance. The mapping MUST be: `401` ⇒ `unauthorized`; `403` ⇒ `forbidden`; `404` ⇒ `not_found`; 3xx redirects ⇒ `redirected`; network timeouts or connection errors ⇒ `network_error`. A successful verify MUST set `failureReason` to `null`.

#### Scenario: Token rejected

- **WHEN** `/api/v4/user` responds with `401`
- **THEN** `failureReason` is `unauthorized`
- **AND** `isInstalled` is `false`

#### Scenario: Token accepted but repository forbidden

- **WHEN** `/api/v4/user` succeeds but `/projects/:path` responds with `403`
- **THEN** `failureReason` is `forbidden`

#### Scenario: Repository not found

- **WHEN** `/api/v4/user` succeeds but `/projects/:path` responds with `404`
- **THEN** `failureReason` is `not_found`

#### Scenario: Base URL responds with a redirect

- **WHEN** any GitLab request responds with a 3xx redirect
- **THEN** `failureReason` is `redirected`

#### Scenario: Network timeout

- **WHEN** a GitLab request times out or the connection is refused
- **THEN** `failureReason` is `network_error`

### Requirement: Verify response reports permission availability

The system SHALL set `hasRequiredPermissions` to `true` only when the repository is reachable AND the token has at least push-level access on the project (`permissions.push || permissions.admin`). When the repository cannot be reached, the system MUST set `hasRequiredPermissions` to `false`.

#### Scenario: Token with developer access

- **WHEN** the token has Developer-or-higher access on the project
- **THEN** `hasRequiredPermissions` is `true`
- **AND** the UI enables the "Connect" button

#### Scenario: Token with reporter access only

- **WHEN** the token has only Reporter access on the project (read-only)
- **THEN** `hasRequiredPermissions` is `false`
- **AND** the UI shows a warning that the token cannot push

### Requirement: Verify UI surfaces authenticated user identity

The verify result card on the project integrations page SHALL render an "Authenticated as" line containing the user's avatar (when an `avatarUrl` is present), `username`, and `name` in parentheses (when present). A `bot` user MUST display a "bot" badge next to the username. The line MUST NOT render when `authenticatedAs` is `null`.

#### Scenario: Human user with display name

- **WHEN** the verify response contains `authenticatedAs: { username: "xiaofei", name: "肖飞", avatarUrl: "https://..." }`
- **THEN** the UI shows the avatar, `xiaofei (肖飞)`, and no bot badge

#### Scenario: Bot user

- **WHEN** the verify response contains `authenticatedAs.bot === true`
- **THEN** the UI shows a "bot" badge next to the username

#### Scenario: Unauthorized token

- **WHEN** the verify response sets `authenticatedAs` to `null`
- **THEN** the "Authenticated as" line is not rendered

### Requirement: Verify UI surfaces token scopes with a self-hosted fallback

The verify result card SHALL render a "Token scopes" line. When `tokenScopes` is non-empty, the system MUST render the scopes as a comma-separated list. When `tokenScopes` is empty AND the user was authenticated, the system MUST render the explanatory line "Not advertised by the GitLab instance (common for personal access tokens)." When the user was not authenticated, the system MUST NOT render the line.

#### Scenario: OAuth scopes listed

- **WHEN** the response contains `tokenScopes: ["api", "read_api"]`
- **THEN** the UI renders `api, read_api`

#### Scenario: PAT scopes fallback message

- **WHEN** the response contains an empty `tokenScopes` and a non-null `authenticatedAs`
- **THEN** the UI renders the "Not advertised" fallback message

#### Scenario: No scopes line when unauthorized

- **WHEN** the response contains `authenticatedAs: null`
- **THEN** the "Token scopes" line is not rendered

### Requirement: Verify UI surfaces repository visibility

The verify result card SHALL render a "Visibility" line showing "Private" or "Public" when `repositoryPrivate` is non-null. The line MUST NOT render when the repository cannot be read.

#### Scenario: Private repository

- **WHEN** the response contains `repositoryPrivate: true`
- **THEN** the UI renders "Private"

#### Scenario: Public repository

- **WHEN** the response contains `repositoryPrivate: false`
- **THEN** the UI renders "Public"

#### Scenario: Repository unreadable

- **WHEN** the response contains `repositoryPrivate: null`
- **THEN** the "Visibility" line is not rendered

### Requirement: Verify button enables when required fields are filled

The "Verify" button on the GitLab integration form MUST be enabled when every required field (`baseUrl`, `accessToken`, `repositoryOwner`, `repositoryName`) is non-empty after trimming and the verify request is not already in flight. The button MUST NOT depend on react-hook-form's `formState.isValid`.

#### Scenario: All fields filled, no verify in progress

- **WHEN** the user has typed non-empty values into every required field
- **THEN** the "Verify" button is enabled

#### Scenario: A required field is empty

- **WHEN** any required field is empty or whitespace
- **THEN** the "Verify" button is disabled

#### Scenario: Verify request in flight

- **WHEN** a verify request is currently pending
- **THEN** the "Verify" button is disabled and shows a spinner

### Requirement: Verify fetcher surfaces readable error messages for non-JSON responses

The web verify fetcher MUST read the response body as text first when the HTTP status is not OK. When the body parses as JSON and contains a `message` field, the fetcher MUST use that string as the thrown error message. When the body is not JSON, the fetcher MUST throw an `Error` whose message is `Request failed (HTTP <status>)`. The fetcher MUST NOT throw `SyntaxError` to the caller.

#### Scenario: 500 with JSON error body

- **WHEN** the API responds with HTTP 500 and a JSON body `{"message":"GitLab destination resolves to a non-routable address"}`
- **THEN** the fetcher throws an `Error` with the message `GitLab destination resolves to a non-routable address`

#### Scenario: 502 with HTML body

- **WHEN** the API responds with HTTP 502 and a non-JSON body
- **THEN** the fetcher throws an `Error` with the message `Request failed (HTTP 502)`
