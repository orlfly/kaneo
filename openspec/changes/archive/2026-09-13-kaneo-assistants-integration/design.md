# Design: kaneo-assistants-integration

## Context

Kaneo 已有的基础设施（本方案只消费、不修改 Kaneo 服务端代码）：

- **角色词汇表**：`@kaneo/permissions` 导出 `AGENT_ROLES`（7 角色），任务 `required_role` 标记，API key `metadata.agentRole` 声明身份
- **配置模板**：`apps/api/src/agent/agents/templates/` 下 `roles/<role>/AGENTS.md` × 7 + `skills/<skill>/SKILL.md` × 11（frontmatter `for_roles` 声明适用角色，缺省为通用）
- **HTTP 端点**：`GET /api/agent/agents-config/templates` 返回 `{ roles: [{name, description}], skills: [{name, description, forRoles}] }`；`GET /api/agent/agents-config/download` 返回完整 zip（AGENTS.md × 7 + skills + install 脚本）
- **认领工作流**：claim-task skill 定义了 `KANEO_API_KEY` / `KANEO_API_URL` 环境变量约定、claim → work → PR → `PUT /api/task/:id` 状态机

AionUi 已有的基础设施（本方案的落点）：

- **Assistants API**：`POST /api/assistants`（`CreateAssistantRequest`：name/description/context/prompts/enabled_skills/custom_skill_names/models/defaults…），经 `ipcBridge.assistants.create` 调用
- **Custom skills**：`skills` IPC 面（import/delete/paths），`custom_skill_names` 挂到 assistant；skill 为目录 + SKILL.md 结构
- **Assistant 识别**：`source: 'user'`，按 name 唯一性由上层保证（无服务端唯一约束）

## Goals / Non-Goals

- **Goal**: AionUi 内一键按 Kaneo 角色批量创建配置正确的 Assistants
- **Goal**: 重复同步幂等（更新而非重建）
- **Non-Goal**: 不在 AionUi 内自动运行 agent 或认领循环（执行仍由用户驱动）
- **Non-Goal**: 不修改 Kaneo 服务端任何端点
- **Non-Goal**: 不自动配置 agent 运行环境（KANEO_API_KEY 等环境变量由用户按 skill 说明自行设置）

## Decisions

### 1. 拉取通道：zip 下载端点 + templates 端点组合

templates 端点只给 `{name, description}` 元数据，**不含 AGENTS.md 与 SKILL.md 正文**；skills 条目含 `forRoles: string[] | null`（可直接用于角色过滤）。正文从 `GET /api/agent/agents-config/download` 的 zip 解包获得，zip 路径布局为 `roles/<role>/AGENTS.md` 与 `skills/<skill>/SKILL.md`（由 `buildAgentConfigZip` 打包，包内还含 `install.sh` / `install.bat` / `THIRD_PARTY_NOTICES.md`，本方案忽略这些文件）。注意：zip 中每个 skill 只打包 `SKILL.md` 单文件，转换器只需处理 `SKILL.md`。

**理由**: 不需要在 Kaneo 侧加任何新端点；一次下载同时获得全部正文，模板列表用于 UI 展示与角色过滤选择。

### 2. 实现位置：AionUi 渲染层独立模块 + 复用 skills import

新增 `kaneo-sync` 模块（service 层）：
- `fetchKaneoTemplates(baseUrl, apiKey)` — 调 templates 端点
- `fetchKaneoConfigZip(baseUrl, apiKey)` — 下载并解包 zip（浏览器端用现有 zip 处理能力；桌面端走已有文件工具）
- `importKaneoSkills(skills)` — 逐个转换为 AionUi custom skill（`SKILL.md` 正文保留 frontmatter，AionUi skill 解析兼容；转换时生成 skill 目录名 `kaneo-<skill>`）
- `syncKaneoAssistants(selection)` — 按命名约定 `Kaneo · <role>` upsert

入口 UI 挂在 AionUi assistants 管理页，新增 "从 Kaneo 导入" 对话框（连接表单 → 角色/技能选择 → 结果报告）。

**理由**: 全部走既有 HTTP 与 IPC 面，无后端/主进程改动；Kaneo 端零改动。

### 3. 内容映射

| Kaneo | AionUi Assistant |
|---|---|
| role `AGENTS.md` 正文 | `context` |
| role description（templates） | `description` |
| `Kaneo · <role>` | `name` |
| 预置认领指令模板（引用角色名 + `KANEO_API_URL`） | `prompts[0]` |
| 匹配 `for_roles` 的 skills | `custom_skill_names` = `kaneo-<skill>` |

认领 prompt 模板（示例）：
> 认领你的下一个 Kaneo 任务并按角色规范完成它。使用 kaneo-claim-task skill：先 claim，再依 AGENTS.md 工作规范执行，最后提交 PR 并更新任务状态为 in-review。Kaneo API 地址默认 `http://localhost:1337`。

### 4. Skill 转换规则

- 目录名：`kaneo-<skill-name>`（前缀避免与既有 skill 冲突）
- 正文：Kaneo `SKILL.md` 原样保留（含 `for_roles` frontmatter，AionUi 忽略未知 frontmatter 键）
- 已存在同名 custom skill 时：覆盖（幂等）
- skill 内相对路径引用的其他文件：从 zip 原样带入

### 5. 幂等与安全

- Upsert 键：name 精确等于 `Kaneo · <role>` 的 assistant；命中则 update（context/prompts/custom_skill_names），未命中则 create
- API key 只在同步会话内存中使用；成功后不落盘（连 base URL 持久化都做成可选记住）
- 单角色失败（如某 skill import 被限制大小拒绝）不中断整批，逐角色报告 + 重试

## Open Questions

（无 — 均已在决策中给出合理默认，可在 review 时调整：例如 `Kaneo · <role>` 分隔符、skill 前缀 `kaneo-`）
