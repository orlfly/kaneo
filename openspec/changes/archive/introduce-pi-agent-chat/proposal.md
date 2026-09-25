## Why

Kaneo 项目管理缺少 AI 辅助能力。团队需要一个能理解项目上下文的 AI 角色，帮助创建任务、分析执行瓶颈、回答项目相关问题，减少项目管理的手动操作。

## What Changes

- 在项目页面（Board、Backlog、Gantt 标签后）新增 Chat 标签页
- Chat 页面提供与 pi-agent 的对话界面，pi-agent 扮演项目管理员角色
- pi-agent 能读取项目任务列表、看板状态、任务详情，能创建新任务
- 新增 API 端点 `/api/project/:projectId/chat`，支持 SSE 流式响应
- pi-agent 通过调用已有 API 端点（task CRUD、project 查询）获取项目数据并执行操作
- 对话历史按项目维度存储在数据库中
- LLM 配置（启用开关、API base URL、API key、模型）通过系统管理员的 AI 设置页管理，加密存入 `chat_config` 表，而非环境变量

## Capabilities

### New Capabilities
- `project-chat`: 项目内 AI 对话功能，包括 chat 标签页 UI、SSE 流式 API、对话历史持久化、pi-agent 项目管理员工具调用（查询任务、创建任务、分析项目状态）

### Modified Capabilities
## Impact

- `apps/web`: 新增 `project/$projectId/chat.tsx` 路由和 chat 组件；`ProjectLayout` 的 `activeView` 类型扩展为 `"backlog" | "board" | "gantt" | "chat"`
- `apps/api`: 新增 `apps/api/src/chat/` 模块（路由、控制器、SSE 流式端点）；新增 `chat_message` 数据库表和迁移
- `apps/api/src/database/schema.ts`: 新增 `chatMessageTable` 和关系
- `apps/api/src/index.ts`: 挂载 chat 路由并加入 AppType
- `i18n`: 新增 `chat` 命名空间
- 新增 `chat_config` 数据库表（含迁移），AI 配置加密存储；实例需配置 `NOTIFICATION_SECRET_ENCRYPTION_KEY` 以支持 API key 加密