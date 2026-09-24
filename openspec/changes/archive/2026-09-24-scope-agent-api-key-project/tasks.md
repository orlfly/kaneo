## 1. API：绑定解析与验证

- [x] 1.1 `apps/api/src/utils/agent-role.ts`（或同目录新 helper）新增 `resolveProjectId(metadata)`，返回 `string | null`
- [x] 1.2 `verify-api-key.ts`：metadata 解析后附带 projectId；带绑定时 join project 表校验项目存在且未归档，失败时返回可定位的错误（binding missing）
- [x] 1.3 `authenticate-api-request.ts`：ApiKeyContext 增加 `projectId`，随认证上下文透传
- [x] 1.4 测试：无绑定 key 行为不变；绑定 key 正常（集成测试覆盖 parse 与 claim 行为；缺失/归档校验由 verify-api-key join 实现）

## 2. API：任务路由作用域强制

- [x] 2.1 新增共享 helper `assertProjectScope(apiKey, projectId)`：绑定不匹配 → 403
- [x] 2.2 claim-next：绑定 key 时以绑定 projectId 收窄候选查询（复用现有 projectId 分支）
- [x] 2.3 任务 read/create/update/status/claim/release 等控制器接入 helper（按路由逐个接入，集中列出改动清单）
- [x] 2.4 单测：跨项目 read/create/update/claim/status 各 403；绑定项目内正常；claim-next 只在绑定项目内找候选

## 3. Web：key 管理入口

- [x] 3.1 开发者设置创建/编辑 API key 表单增加可选项目选择器（仅用户所属 team 的项目），保存到 metadata.projectId
- [x] 3.2 key 列表展示绑定项目（未绑定显示"全部项目"），en-US.json 文案 + i18n key
- [x] 3.3 组件测试：选择器数据源、保存 payload、列表展示

## 4. MCP 与 agent 配置

- [x] 4.1 `mcp/tools.ts`：`claim_next_task` 描述追加项目作用域说明
- [x] 4.2 agent 配置面板/README 文案提示 key 可绑定项目（en-US.json）
- [x] 4.3 MCP 工具描述快照测试更新

## 5. 验证与收尾

- [x] 5.1 集成测试：绑定 key 端到端（claim-next 只领绑定项目任务；跨项目操作 403；项目删除后 403）
- [x] 5.2 相关包 typecheck + biome（目标文件）+ agent/任务相关测试全绿
- [x] 5.3 更新 `openspec/specs`（archive 时同步）与必要文档