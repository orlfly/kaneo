# 实现任务（GitLab verify 响应携带 token 身份与可见性）

## 1. API 工具层（apps/api/src/plugins/gitlab/utils/gitlab-api.ts）

- [x] 1.1 顶层导出 `GitLabTokenInfo` 类型：`{ user: { id, username, name?, avatar_url?, bot? }, scopes: string[] }`
- [x] 1.2 实现 `getGitLabTokenInfo(baseUrl, token)`：调用 `/api/v4/user`，复用既有 SSRF/超时/重定向策略；401/403/404 等错误由既有 `GitLabApiError` 抛出
- [x] 1.3 解析响应头 `X-Oauth-Scopes`（大小写不敏感，也兼容 `x-gitlab-scopes`）；逗号/空格分隔，过滤空段；缺省返回 `[]`
- [x] 1.4 导出便捷 `verifyGitLabToken(baseUrl, token)`：返回 `GitLabTokenInfo["user"]`（供未来其他场景复用）

## 2. 验证控制器（apps/api/src/gitlab-integration/controllers/verify-gitlab-access.ts）

- [x] 2.1 controller 串行调用 `getGitLabTokenInfo` → `client.getRepo`；任一失败按 status/kind 映射 `failureReason`：`401 → unauthorized`、`403 → forbidden`、`404 → not_found`、REDIRECT → `redirected`、TIMEOUT/network → `network_error`
- [x] 2.2 成功路径组装响应：`isInstalled`、`hasRequiredPermissions`（基于 `repo.permissions.push || repo.permissions.admin`）、`authenticatedAs`、`tokenScopes`、`repositoryPrivate`、`repositoryExists`、`failureReason`、`message`
- [x] 2.3 token 鉴权失败（`unauthorized`）时短路：响应里 `authenticatedAs = null`、`tokenScopes = []`、`repositoryPrivate = null`、`repositoryExists = false`

## 3. 路由 schema（apps/api/src/gitlab-integration/index.ts）

- [x] 3.1 valibot 响应 schema 增加 `authenticatedAs` 对象（可空，含 `id`/`username`/`name?`/`avatarUrl?`/`bot?`）、`tokenScopes: string[]`、`repositoryPrivate: boolean | null`、`repositoryExists: boolean`
- [x] 3.2 OpenAPI `description` 同步：解释字段语义、`failureReason` 取值约定、scopes 缺省语义

## 4. Web fetcher（apps/web/src/fetchers/gitlab-integration/verify-gitlab-access.ts）

- [x] 4.1 非 2xx 分支先 `response.text()`，再用 `JSON.parse` 尝试；JSON 成功且带 `message` 字段时使用 `parsed.message`；解析失败时 `throw new Error(`Request failed (HTTP ${response.status})`)`
- [x] 4.2 typed client 通过 `@kaneo/libs` 自动从 valibot 推导，无需手改

## 5. Web UI（apps/web/src/components/project/gitlab-integration-settings.tsx）

- [x] 5.1 在已有 `verificationResult` 区块下方按需渲染三行：「Authenticated as」（头像 + `username (name)` + 可选 `bot` 徽标）、「Visibility」、「Token scopes」
- [x] 5.2 `Token scopes` 三态：非空列表 → 逗号分隔；空数组且鉴权通过 → 「Not advertised by the GitLab instance (common for personal access tokens).」；鉴权失败 → 不渲染
- [x] 5.3 `avatar` 用 `<img referrerPolicy="no-referrer">`，避免 referrer 泄漏
- [x] 5.4 修复验证按钮 disabled 卡死 bug：用 `!baseUrl.trim() || !accessToken.trim() || !repositoryOwner.trim() || !repositoryName.trim() || isVerifying` 替代 `!form.formState.isValid`

## 6. i18n

- [x] 6.1 `i18n/en-US.json` 新增：`settings:gitlabIntegration.authedAs`、`repoVisibility`、`repoPrivate`、`repoPublic`、`tokenScopes`、`tokenScopesNotAdvertised`
- [x] 6.2 16 个 locale 的同步策略：保持与项目既有惯例一致；本改动仅英文已确认，其它 locale 由后续 PR 补齐（key 不缺即可 fallback 到 en）

## 7. 端到端验证（本地内网 GitLab `gitlab.kingsware.cn`）

- [x] 7.1 直接浏览器 fetch（携带 cookie）调用 `/api/gitlab-integration/verify`，返回 200 且包含完整 `authenticatedAs` + `tokenScopes`（实测 `xiaofei` + `肖飞` + 空 scopes）
- [x] 7.2 通过 UI 点击验证按钮，验证结果卡视觉确认：`Token verified as xiaofei.` + `Authenticated as xiaofei (肖飞)` + `Visibility Private` + `Token scopes Not advertised ...`
- [x] 7.3 头像 gravatar 在 headless 浏览器中加载失败属环境问题（公网 gravatar 受限），不影响代码正确性；实际浏览器会正常显示

## 8. 收尾

- [x] 8.1 API 与 Web typecheck 全绿
- [x] 8.2 文档与 OpenAPI 字段对齐（commit message 注明）
- [x] 8.3 `.env` 加 `KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS=true` 仅用于本地 dev，commit message 注明**不进生产配置 / .env.example / Helm**
- [x] 8.4 `tests/api/gitlab-integration` 补充针对 mock GitLab（200/401/403/404/无 scopes 头）的端到端用例：`gitlab-api.test.ts` 覆盖 `getGitLabTokenInfo`/`verifyGitLabToken` 的 scopes 解析与 user 形状；`verify-gitlab-access-fetch.test.ts` 覆盖 `authenticatedAs`/`tokenScopes` 成功路径、404 `repository_not_found`、401 抛错
- [ ] 8.5 （可选）同步 spec 到 main `openspec/specs/gitlab-verification-identity/` 并归档本 change（用户确认后）
