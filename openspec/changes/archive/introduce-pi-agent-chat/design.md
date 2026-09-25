## Context

Kaneo 当前没有 AI 辅助能力。项目页面有 Board、Backlog、Gantt 三个标签页，但没有对话式交互入口。pi-agent 是一个外部 AI 服务（兼容 OpenAI API 格式），可以作为项目管理员助手嵌入到项目中。

现有技术栈：Hono API、React/Vite 前端、PostgreSQL、TanStack Router/Query。API 已有完整的 task/project CRUD 端点和 team 访问控制中间件。

## Goals / Non-Goals

**Goals:**
- 在项目页面新增 Chat 标签页，提供流式对话界面
- pi-agent 能查询项目任务、创建任务、分析项目状态
- 对话历史按项目维度持久化到 PostgreSQL
- 复用现有的 `teamAccess` 和 `requireTeamRole` 中间件做授权
- 支持流式响应（SSE），用户能实时看到 pi-agent 的输出

**Non-Goals:**
- 不实现 pi-agent 的 LLM 推理逻辑（由外部 OpenAI 兼容服务提供，配置于 AI 设置页）
- 不支持多 agent 编排或复杂工作流
- 不实现对话的编辑/删除/搜索功能（首版只做创建和列表）
- 不支持文件上传或富文本输入（首版纯文本对话）
- 不实现跨项目的全局对话

## Decisions

### 1. SSE 流式响应而非 WebSocket

**选择**: Server-Sent Events (SSE)
**理由**: 对话是请求-响应模式，不需要双向实时通信。SSE 比 WebSocket 更简单，Hono 原生支持 `streamSSE`，不需要额外的 WebSocket 连接管理。
**替代方案**: WebSocket（过度设计）、长轮询（延迟高）。

### 2. 对话历史存储方案

**选择**: 新增 `chat_message` 表，按 `projectId` 维度存储
**理由**: 对话与项目强绑定，查询简单，不依赖额外服务。表结构：`id, projectId, role(user/assistant), content, createdAt`。
**替代方案**: 使用现有的 `activity` 表（语义不符，activity 是项目事件记录不是对话）。

### 3. pi-agent 工具调用

**选择**: 使用 OpenAI function-calling 格式，在服务端定义工具函数
**理由**: pi-agent 兼容 OpenAI API，function-calling 是成熟方案。服务端将工具调用映射到内部 API 调用（task CRUD、project 查询），不暴露 API key 给前端。
**工具集**:
- `list_tasks`: 查询项目任务列表（支持按状态/优先级过滤）
- `get_task`: 获取单个任务详情
- `create_task`: 创建新任务
- `get_project_summary`: 获取项目概览（任务总数、各状态分布、逾期任务数）

### 4. 认证和授权

**选择**: 复用 `authenticateApiRequest` + `teamAccess.fromProject()`
**理由**: 用户必须是项目所属团队的成员才能发起对话。pi-agent 的操作（创建任务等）也在同一个请求上下文中执行，自动继承用户权限。
**注意**: pi-agent 的服务端 API key 不会暴露给前端，仅服务端使用（加密存储于数据库）。

### 5. 前端 Chat UI

**选择**: 自建轻量聊天组件，不引入第三方 chat UI 库
**理由**: Kaneo 已有 UI 组件体系（Button、Input、Avatar 等），自建可保持一致性且避免额外依赖。布局：消息列表 + 底部输入框，支持 markdown 渲染（复用已有的 markdown 渲染组件）。

### 6. 配置存储：数据库表而非环境变量

**选择**: 通过系统管理员的 AI 设置页（Settings → System → AI）配置启用开关、API base URL、API key、模型，加密存入 `chat_config` 单例行表
**理由**: 配置可运行时修改无需重启服务，多实例部署共享同一配置，沿用通知偏好已用的 `encryptSecret`/`decryptSecret` 加密工具。未配置时 Chat 标签页显示"未启用"占位状态而非报错。

## Risks / Trade-offs

- **pi-agent 不可用时用户体验** → 前端检测 503 状态并显示"AI 助手暂不可用"提示，不影响其他项目功能
- **对话历史无限增长** → 首版不限制，后续可加分页或自动截断旧消息
- **工具调用安全性** → pi-agent 的工具调用在服务端执行，继承当前用户权限，无法越权操作
- **SSE 连接超时** → 设置 5 分钟超时，超时后提示用户重新发送