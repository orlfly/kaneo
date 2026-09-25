## Why

GitLab 集成的「验证访问并连接」目前只返回 `isInstalled` + `hasRequiredPermissions` 两项布尔结果。用户报错时难以判断到底是「token 无效」「仓库不存在」还是「权限不够」，也无法确认这个 token 究竟绑定到哪个 GitLab 账号、能看到哪些仓库范围。本次增强让验证响应带上 token 的真实身份与可见性信息，让用户在连接前就能确认「这枚 token 是谁、能看到什么」。

## What Changes

- 验证响应（`POST /api/gitlab-integration/verify`）在原有字段之外新增：
  - `authenticatedAs`: GitLab `/user` 返回的身份对象（`id`、`username`、`name`、`avatarUrl`、`bot`），null 表示 token 鉴权失败
  - `tokenScopes`: 来自 `/personal_access_tokens/self` 的 scope 列表；当 GitLab 实例不暴露该端点时返回空数组（自托管 GitLab 常见）
  - `repositoryPrivate`: 项目仓库是否为 private；仓库不存在时返回 null
  - `repositoryExists`: 仓库是否可访问
  - 现有 `hasRequiredPermissions` 现在综合 `repositoryExists && repositoryPrivate !== null && (api scope 足够 || user 是项目成员)`
- 失败原因 `failureReason` 区分更细：`unauthorized`（token 无效）、`forbidden`（鉴权通过但权限不足）、`not_found`（仓库不存在）、`redirected`（基地址返回跳转）、`network_error`
- Web 端的验证结果卡新增「Authenticated as」（头像 + `username (name)` + `bot` 徽标）、「Visibility」（Private/Public）、「Token scopes」三行；token scopes 为空数组且 token 验证通过时显示提示文案「Not advertised by the GitLab instance (common for personal access tokens)」
- 修正验证按钮原本用 `formState.isValid` 判定 disabled 导致默认 RHF `mode: 'onSubmit'` 下永远 disabled 的问题，改为显式检查四个必填字段
- 修正 Web 端 fetcher 在响应为非 JSON（500 文本错误）时统一展示「Request failed (HTTP <status>)」，避免吞掉真实错误

## Capabilities

### New Capabilities
- `gitlab-verification-identity`: GitLab 集成验证响应携带 token 真实身份（`/user`）、token scopes（`/personal_access_tokens/self`）、仓库可见性、失败原因细分，并在 UI 验证结果卡上呈现

### Modified Capabilities

## Impact

- `apps/api/src/plugins/gitlab/utils/gitlab-api.ts`: 新增 `getAuthenticatedUser`、`getTokenScopes`、`getRepositoryVisibility` 三个 GitLab 调用；`verifyAccess` 改为组合调用并返回新结构
- `apps/api/src/gitlab-integration/controllers/verify-gitlab-access.ts`: 路由 validator 与 controller 同步新字段；细化 `failureReason` 映射
- `apps/api/src/gitlab-integration/index.ts`: OpenAPI/valibot schema 更新
- `apps/web/src/fetchers/gitlab-integration/verify-gitlab-access.ts`: 解析失败时读 `response.text()` 区分 JSON 错误和纯文本错误
- `apps/web/src/components/project/gitlab-integration-settings.tsx`: 渲染 Authenticated as / Visibility / Token scopes 三行；修正验证按钮 disabled 条件
- `packages/libs`: 客户端类型自动从 valibot 推导，无需手改
- `i18n/en-US.json`: 新增 `authedAs`、`repoVisibility`、`repoPrivate`、`repoPublic`、`tokenScopes`、`tokenScopesNotAdvertised` 文案键
- 测试：建议在 `tests/api-integration` 补充针对 mock GitLab 服务器（成功/401/403/404）的端到端用例；当前已在真实内网 GitLab 端到端验证
- 安全：`KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS` 仍是 SSRF 守卫的 opt-out；本改动不绕过守卫，仅是验证流程调用同一守卫
