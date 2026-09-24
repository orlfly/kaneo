## Context

Agent API key 目前通过 `metadata.agentRole` 声明角色（`apps/api/src/utils/agent-role.ts` 的 `resolveAgentRole`），认证链路在 `apps/api/src/utils/authenticate-api-request.ts` / `verify-api-key.ts`。`claim_next_task`（`apps/api/src/task/controllers/claim-next-task.ts`）按 userId 查 teamMembership → 全部 team 的全部 project → 三规则找候选。用户加入多 team 或 team 下多项目时，同一 key 的会话可能跨项目领任务，造成上下文污染。

apikey 表已有 `metadata`（text，JSON）列，`verifyApiKey` 已解析 metadata 并返回；无需 schema 迁移即可承载 `metadata.projectId`。

## Goals / Non-Goals

**Goals:**
- 一个 key 可绑定一个项目；绑定后任务操作严格限定在该项目内。
- claim-next 在绑定 key 下只在绑定项目内找候选。
- 绑定项目删除/归档后 key 自动失效，错误信息可定位。
- 创建/编辑 key 的 UI 可选绑定项目；列表展示绑定关系。
- MCP `claim_next_task` 描述说明项目作用域。

**Non-Goals:**
- 不做多项目绑定（一个 key 多个 projectId）。
- 不改变未绑定 key 的现有行为（跨 team/项目全量搜索）。
- 不引入 team 级绑定（projectId 已隐含 team 归属）。
- 不改动会话（session cookie）人类用户的行为。

## Decisions

1. **绑定存储：`metadata.projectId`（string）而非新列。**
   - 理由：apikey.metadata 已存在并被解析、透传；无需迁移，`verify-api-key.ts` 的 `parsePermissions` 同路数即可。若未来要索引/约束再升级为列。
   - 创建时校验：better-auth apiKey 插件 `enableMetadata: true`，`auth.ts` 的 `databaseHooks.apikey.create.before` 已有 agentRole 校验先例；在同 hook 校验 projectId 非空字符串、项目存在且调用者是该 team 成员，防止写入无权限或无效的绑定。
2. **作用域解析时机：认证时读出，中间件统一校验。**
   - `authenticate-api-request.ts` 在构造 ApiKeyContext 时附带 `projectId`；新增一个任务路由共用的检查（或在各 controller 入口）比对路径/body 的 projectId（或任务的所属项目）与绑定值，不符返回 403。
   - claim-next 无 projectId 时直接以绑定值作为 projectId 收窄查询（复用现有 `projectId ? ... : 全部` 分支）。
3. **失效行为：验证时 join project 表。**
   - `verifyApiKey` 对带绑定 projectId 的 key join projectTable（id、deleted/归档标记）；项目不存在或归档 → 认证失败（401/403，错误说明绑定项目缺失）。避免在每次任务操作时重复校验。
4. **创建/编辑入口：开发者设置 key 表单加可选项目选择器。**
   - 数据源为用户所属 team 的项目列表（现有 fetcher）。默认空 = 不绑定。编辑已有 key 时可改/清绑定（走 update metadata）。
5. **MCP/文案：`claim_next_task` 描述与 agent 配置面板文案追加一句项目作用域说明；install 脚本不硬编码 projectId，由用户在 key 元数据里配置。**

## Risks / Trade-offs

- 未绑定 key 的行为不变，存量 key 不受影响（无破坏性数据迁移，metadata 缺省即旧行为）。
- metadata 是 text JSON，无法外键约束项目删除级联 → 靠验证时 join 兜底（决策 3）。
- 控制器数量多，逐个比对 projectId 有遗漏风险 → 以共享 helper（如 `assertProjectScope(ctx, projectId)`）收敛，任务相关路由集中接入，测试覆盖 read/create/update/claim/status 五类。
- 403 vs 404：跨项目越界统一 403（存在性不泄露给无权限 key）。