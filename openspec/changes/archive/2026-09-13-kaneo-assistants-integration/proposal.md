## Why

Kaneo 平台已有完整的 agent 任务执行体系：七种 agent 角色（coding、product-design、architecture-design、devops、ui-design、testing、code-review）、`requiredRole` 任务标记、角色匹配认领、API key 身份，以及可下载的 agent 配置包（角色 AGENTS.md + skills + 安装脚本）。但用户若使用 AionUi 作为客户端，需要在 AionUi 中手动创建 Assistants 并逐个配置 prompt、skills 和上下文，才能让这些 assistant 按 Kaneo 的角色规范认领并执行任务。这一过程繁琐且容易偏离 Kaneo 的角色定义。

需要一个集成方案：让 AionUi 的 Assistants 能按 Kaneo 任务体系（角色 + skills + 工作规范）一键创建/同步，使每个 assistant 精确对应一个 Kaneo agent 角色，并内置认领任务、更新状态、提交 PR 的工作流 skill。

## What Changes

- 新增 Kaneo 集成模块：从 Kaneo 实例拉取 agent 配置模板（`GET /api/agent/agents-config/templates`：七角色 + skills 列表）
- 新增 "从 Kaneo 创建 Assistants" 流程：用户填写 Kaneo 实例 URL + API key 后，为每个（或选定的）Kaneo 角色创建一个对应的 AionUi Assistant
- Assistant 配置映射规则：
  - `name` = 角色名（如 "Kaneo · coding"），`description` = 角色职责描述
  - `context` = 对应角色的 AGENTS.md 内容（职责、工作规范、禁止事项、质量标准）
  - `prompts` = 预置认领任务指令（结合 claim-task skill 的工作流）
  - `enabled_skills` / `custom_skill_names` = Kaneo skills 对应的 AionUi skills（repo-sync、claim-task、submit-pr、run-tests、code-search 等，以 AionUi 自定义 skill 形式导入）
- skills 导入：将 Kaneo 的 SKILL.md（含 `for_roles` frontmatter）转换为 AionUi 自定义 skill（通过现有 skills import 通道），并按 assistant 角色过滤启用
- 保留映射元数据：assistant 的 prompts/context 中嵌入 Kaneo 实例 URL 与角色名，便于后续同步与去重（按 `Kaneo · <role>` 命名约定识别已有 assistant，避免重复创建）
- API key 安全：Kaneo API key 不落入 assistant 配置正文，仅写入认领工作流所要求的环境约定说明（用户自行配置到运行环境），配置表单中的 key 仅用于创建时验证与模板拉取

## Capabilities

### New Capabilities

- `kaneo-assistant-sync`: 从 Kaneo 实例拉取角色/技能模板，按角色批量创建对应的 AionUi Assistants，含命名约定、内容映射、skills 导入与去重规则

### Modified Capabilities

（无 — 全部为新增能力，不改既有 AionUi assistant 行为）

## Impact

- **新增**：AionUi 侧一个 Kaneo 集成设置入口（实例 URL + key 表单）、同步逻辑模块、Kaneo skills → AionUi 自定义 skills 的转换器
- **复用**：AionUi 现有 `POST /api/assistants`、skills import、custom skills 机制；Kaneo 现有 templates/download 端点（不修改 Kaneo 代码即可工作）
- **风险**：Kaneo skills 与 AionUi skill 格式差异（frontmatter → AionUi skill 目录结构）需要转换层；assistant 的执行端（ACP agent）需用户自行指定，不在本方案内自动配置
