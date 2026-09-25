## Context

GitLab 集成当前的验证流程 (`POST /api/gitlab-integration/verify`) 只能告诉用户两件事：

- `isInstalled`: 仓库能 GET 到
- `hasRequiredPermissions`: 推断的权限是否足够

用户遇到「验证失败」时拿不到任何线索：是 token 无效（401）、权限不足（403）、仓库不存在（404）、还是网络/SSRF 阻挡？而且即便成功，用户也不知道这枚 token 究竟是哪个 GitLab 账号，将来改 token 时也容易误把生产 token 改成失效 token。

调用栈现状：

- `apps/api/src/plugins/gitlab/utils/gitlab-api.ts` 提供 `gitlabFetch<T>()` 和 `createGitLabClient()`，后者只暴露项目/issue/MR/labels 相关方法
- 验证控制器 `verify-gitlab-access.ts` 当前只调用 `client.getRepo()`，从 `visibility` 派生 `hasRequiredPermissions`
- Web 端 `gitlab-integration-settings.tsx` 用 react-hook-form 的 `Form` 包装，验证按钮的 `disabled` 用了 `formState.isValid`，但默认 RHF `mode: 'onSubmit'` 下 `formState.isValid` 在首次 submit 前是 `false`，造成按钮永远 disabled
- Web 端 fetcher `verify-gitlab-access.ts` 在非 2xx 响应里只读 `response.json()`，GitLab 在某些错误（404 HTML 错误页）返回非 JSON 时会直接抛 `SyntaxError` → 用户看到模糊的「Request failed」

补充约束：

- `assertPublicDestination` 仍然在所有对外调用前把关，RFC1918 / loopback 等私网地址默认会被拒。本地开发用 `KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS=true` opt-out（**仅本地**，不在生产配置里）
- 自托管 GitLab 常见做法：`/personal_access_tokens/self` 在用户级 PAT 上不返回 scopes（GitLab 14 之前完全没这端点），仅有 OAuth token 在 `X-Oauth-Scopes` 头返回 scopes。需优雅降级
- GitLab `/user` 端点权限要求最低，只要 token 还能 GET 自己就算有效

## Goals / Non-Goals

**Goals:**

- 验证响应携带 token 身份（`/user`）与可见性信息，让用户在连接前能看到「这枚 token 是谁、能看到什么」
- 失败原因细分到 `unauthorized | forbidden | not_found | redirected | network_error`，便于上层做差异化提示
- 自托管 GitLab 不返回 PAT scopes 时，UI 给一条中性提示而不是空白
- 修复验证按钮 disabled 卡死的可用性 bug
- 修复 fetcher 在非 JSON 错误响应下的报错信息

**Non-Goals:**

- 不重新设计 GitLab 集成的 token 存储或加密策略
- 不引入新的 token 类型或 scope 校验机制
- 不在服务端缓存 `/user` 或 scopes 结果（每次 verify 都实时查 GitLab，简单优先）
- 不为这次改动增加数据库迁移

## Decisions

### 1. 把身份查询拆成独立的 `getGitLabTokenInfo`

**选择**: 在 `gitlab-api.ts` 顶层新增 `getGitLabTokenInfo(baseUrl, token): Promise<GitLabTokenInfo>`，与 `createGitLabClient` 平级，不放进 client 对象。
**理由**: 验证流程不需要完整的 `createGitLabClient`（issue/MR 操作），只需一个轻量函数去问 GitLab「这枚 token 是谁」。独立函数便于复用，也便于未来其他场景（例如 token 健康巡检）单独调用。

**`GitLabTokenInfo` 结构**:
```ts
export type GitLabTokenInfo = {
  user: {
    id: number;
    username: string;
    name?: string;
    avatar_url?: string | null;
    bot?: boolean;
  };
  scopes: string[]; // 来自 X-Oauth-Scopes header，空数组 = GitLab 不广告
};
```

### 2. scopes 来自响应头，缺失返回空数组

**选择**: 解析 `/api/v4/user` 的响应头 `X-Oauth-Scopes`，没有该头时 `scopes = []`。
**理由**: GitLab OAuth token 在该头返回 scopes；PAT 绝大多数情况没这头（也不该有 — PAT 是 user-bound，不是 app-bound）。返回空数组 + 让 UI 显示「Not advertised by the GitLab instance」是符合 GitLab 真实行为的诚实选择，而不是假装拿得到。
**不做的**: 不调 `/personal_access_tokens/self`（自托管多数不开启该端点；调了反而要处理 404）。OAuth 头已能覆盖最常见场景，PAT 用户从身份本身就能判断 token 所属人。

### 3. 失败原因映射

```
GitLabApiError status / kind → failureReason
- status 401                 → "unauthorized"
- status 403                 → "forbidden"
- status 404                 → "not_found"
- kind REDIRECT              → "redirected"
- kind TIMEOUT | network     → "network_error"
```

**选择**: 把映射放在控制器层，工具层只负责抛出 `GitLabApiError`。
**理由**: 工具层是单一职责的「GitLab HTTP 客户端」，不应该知道「未授权」在上层产品语义里叫什么名字。

### 4. `hasRequiredPermissions` 的语义收紧

**选择**: 之前是「`isInstalled && visibility 能推断到读写权限`」。现在改为：
```
hasRequiredPermissions = isInstalled
  && repositoryHasIssueAccess(repo.permissions)
  && repo.permissions.pull === true
```

通过 `getRepo()` 已经返回的 `permissions: { admin, push, pull }` 计算：
- `repo.permissions.push || repo.permissions.admin` 表示有 issue 写入权限
- 这样 `hasRequiredPermissions` 与实际能力对齐，不再依赖 visibility 推测

**理由**: GitLab `permissions` 字段（来自 `project_access`/`group_access` 的 access_level 推断）才是事实，用户实际能不能写 issue/PR 不取决于仓库是否 private。

### 5. UI 渲染：新增三行 + 头像

**选择**: 在已有 `verificationResult` 区块下方，按 `authenticatedAs` / `repositoryPrivate` / `tokenScopes` 条件渲染三行：
- `Authenticated as`: `<img avatar 5x5>` + `username (name)` + 可选 `bot` 徽标
- `Visibility`: `Private` / `Public`
- `Token scopes`: 三种状态——
  1. `tokenScopes.length > 0` → `scope1, scope2, …` 逗号分隔
  2. `tokenScopes.length === 0 && authenticatedAs` → 「Not advertised by the GitLab instance (common for personal access tokens)」
  3. `!authenticatedAs` → 不渲染（鉴权失败时整行没意义）

**理由**: 第三种状态是「诚实的留白」 — 不假装知道。`avatar_url` 用 `<img referrerPolicy="no-referrer">` 因为部分 gravatar/CDN 在缺 referrer 时会返回默认头像或 404。

### 6. 验证按钮 disabled 改为显式字段检查

**选择**: 替换 `!form.formState.isValid || ...` 为 `!baseUrl.trim() || !accessToken.trim() || !repositoryOwner.trim() || !repositoryName.trim() || isVerifying`。
**理由**: RHF 默认 `mode: 'onSubmit'` 下 `formState.isValid` 在首次 submit 前一直是 `false`，验证按钮在「未连接」状态下 disabled 不可点击，导致用户没法点验证。「显式字段非空」是最直接、最便宜的修复，不需要切到 `mode: 'onChange'`（那个模式有副作用，触发表单整体重新计算更频繁）。

### 7. Fetcher 在非 JSON 错误响应下读 `text()`

**选择**:
```ts
if (!response.ok) {
  let message: string;
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    message = typeof parsed.message === "string" ? parsed.message : "Request failed";
  } catch {
    message = `Request failed (HTTP ${response.status})`;
  }
  throw new Error(message);
}
```

**理由**: Hono 在 5xx 时可能返回 HTML/纯文本（特别是未捕获异常的 fallback），浏览器 `response.json()` 会 throw `SyntaxError: Unexpected token`。降级到读 text 后用 `JSON.parse` 试一次，能拿到结构化错误就拿，拿不到就用 HTTP 状态码兜底。

## Risks / Trade-offs

- **[Risk] 增加两次 GitLab 往返**（`/user` + `/projects/...`）→ **Mitigation**: 两次都走同一个超时控制器且不并行（保持顺序，方便在 `isInstalled=false` 时短路）。自托管 GitLab 在内网一般 < 200ms，整体验证响应仍 < 2s。如果未来发现慢，可在 `verifyAccess` 加 `Promise.all` 并行化。
- **[Risk] `name` 字段在 GitLab user 对象里可能未设置**（自托管默认关闭 display name）→ **Mitigation**: 渲染时 `name` 缺省则只显示 `username`，不显示空括号。
- **[Risk] `X-Oauth-Scopes` 在反代后丢失**（nginx 默认会过滤 `X-` 前缀的非标准头）→ **Mitigation**: 这是 GitLab 实例运维问题，不是产品 bug；UI 的「Not advertised」文案让用户能区分「token 没 scopes」与「拿不到 scopes 信息」。
- **[Risk] avatar URL 是用户提供的，可能指向 gravatar/任意公网，渲染 `<img>` 会触发外部请求** → **Mitigation**: `<img referrerPolicy="no-referrer">` 避免泄漏当前页面 URL；如果未来要严格 SSRF，需把头像 URL 也走 `assertPublicDestination`（本改动不做，权衡是头像通常来自可信 CDN 且用户已选择信任此 GitLab）。
- **[Risk] 拆分 `getGitLabTokenInfo` 与 `createGitLabClient` 造成两处都各自实现超时/重定向逻辑** → **Mitigation**: 抽象了局部 lambda 风格，未来可重构为共享 `_request<T>()`，但当前 YAGNI；两者行为差异（一个只看头，一个看 body）暂不值得合并。

## Migration

无数据库 schema 变更。仅前/后端代码改动，部署即生效。回滚通过 git revert 即可。

只有一个**本地开发配置**变更需要在 commit message 里说明：`apps/api` 验证流程对内网 GitLab（RFC1918）需要 `KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS=true` 才能跑通；这条环境变量仅用于本地 dev，**不进 Helm values、不进 .env.example**。SSRF 守卫本身不动。

## Open Questions

- 是否要在以后把 `bot` 用户的 token 默认禁用（GitLab 机器账号 token 不应该用来驱动人工流程）？当前 spec 不做，但 `authenticatedAs.bot === true` 已在响应里暴露，后续可在 controller 加拒绝策略。
- 是否把 `getGitLabTokenInfo` 改名 `getGitLabIdentity`？当前命名强调「token」语义（包含 scopes），但 GitLab PAT 不返回 scopes 会被误解为「token 没 scopes」与「GitLab 不广告 scopes」两种状态混在一起。暂保持现状。
