# continuous-work-loop

## ADDED Requirements

### Requirement: 新增 universal 持续工作循环 skill

`apps/api/src/agent/agents/templates/skills/` 下 SHALL 增加 `continuous-work/SKILL.md`。该 skill 的 `for_roles` SHALL 显式列出全部 7 个 Kaneo role（`coding`、`product-design`、`architecture-design`、`devops`、`ui-design`、`testing`、`code-review`），保证 install.sh 对所有 persona 都下发它。

#### Scenario: continuous-work 在 7 个 role 下都被识别

- **WHEN** 调用 `listSkillsForRole(role)` 对每个 role ∈ {coding, product-design, architecture-design, devops, ui-design, testing, code-review}
- **THEN** 返回集合 SHALL 包含 `continuous-work`

### Requirement: 单任务循环契约

skill SHALL 定义一个严格的循环：`claim_next_task` → 工作 → `update_task_status({status:"done"})` → 再次 `claim_next_task`。每个 cycle SHALL 只包含一次 claim 调用，不允许在 work 中途额外调用 `claim_next_task` 或 `claim_task`。

#### Scenario: 单 cycle 只调用一次 claim

- **WHEN** agent 在完成一个任务并更新状态为 `done` 之前调用 `claim_next_task` 第二次
- **THEN** skill 文档 SHALL 描述该行为为反模式并说明违反契约的后果（如：当前未完成任务被强制中断）

#### Scenario: 必须显式完成才能领下一个

- **WHEN** agent 想要从 task A 进入 task B
- **THEN** 必须先调用 `update_task_status({taskId: A, status:"done"})` 或 `pause_task({taskId: A, reason})`；在调用 `claim_next_task` 之前 SHALL 已经收到 done / paused 状态确认

### Requirement: 空任务处理

skill SHALL 描述当 `claim_next_task` 返回 404（无可领任务）时的处理：sleep 一段时间后重试，禁止进入 tight retry loop。

#### Scenario: claim_next_task 返回 404

- **WHEN** `claim_next_task` 返回 404
- **THEN** agent SHALL sleep 一个有限时长（推荐 30–120 秒）后重试；禁止每秒多次重试

### Requirement: 失败任务处理

skill SHALL 描述工作失败时的处理：调用 `pause_task({reason})` 释放任务再 claim 下一个，禁止"放弃不释放"。

#### Scenario: work 中遇到不可恢复错误

- **WHEN** agent 在任务工作中遇到不可恢复错误
- **THEN** agent SHALL 调用 `pause_task({taskId, reason})` 释放任务，然后才发起下一次 `claim_next_task`

### Requirement: frontmatter 一致性

新 skill 的 frontmatter SHALL 包含 `for_roles` 字段（列出全部 7 个 role）、`description`、`metadata.origin: kaneo-internal`、可选 `metadata.source` 字段。`for_roles` 字段 SHALL 通过现有 `parseSkillFrontmatter` 正确解析，且每个 role 的 `skillAppliesToRole` 返回 true。

#### Scenario: parseSkillFrontmatter 正确解析

- **WHEN** 对 `continuous-work/SKILL.md` 调用 `parseSkillFrontmatter`
- **THEN** 返回 `forRoles: ['coding','product-design','architecture-design','devops','ui-design','testing','code-review']`

#### Scenario: 对任意 role 都被识别

- **WHEN** 对 7 个 role 中的任意一个调用 `skillAppliesToRole(parseSkillFrontmatter(content), role)`
- **THEN** SHALL 返回 true

### Requirement: install.sh 仍能正确处理

新 skill SHALL 正确通过现有 `install.sh` 的 frontmatter 解析 + 角色过滤逻辑。`buildAgentConfigZip` 在无 `roleFilter` 时 SHALL 把 `continuous-work` 包含在 zip 中。

#### Scenario: install.sh 对 universal role 安装

- **WHEN** 用 `--role coding` 跑 install.sh
- **THEN** `.opencode/skills/continuous-work/SKILL.md` SHALL 被创建

#### Scenario: buildAgentConfigZip 无过滤包含

- **WHEN** 调用 `buildAgentConfigZip()`（无参数）
- **THEN** 生成的 zip SHALL 含 `skills/continuous-work/SKILL.md`