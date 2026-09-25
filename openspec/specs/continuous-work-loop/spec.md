# continuous-work-loop

## Purpose

定义 agent 在 Kaneo 上以**自主 / 循环模式**持续领取并完成任务的行为契约，覆盖单任务单周期、helper-vs-outer skill 职责边界、race condition 处理、空任务处理、失败处理、退出条件。该能力由 `continuous-work` skill（universal，7 个角色适用）和 `claim-task` skill 共同实现。

> 历史：本 spec 最初随 `2026-08-29-continuous-work-loop` change 提交（archive）。本次 `2026-08-29-loop-contract-clarifications` change 通过 MODIFIED 增加 Work/helper skill 职责边界 + Race condition 处理两个 Requirement，并把原 capability 同步到 main specs。

---

## ADDED Requirements（首次建立，原 change 内容）

### Requirement: 新增 universal 持续工作循环 skill

`apps/api/src/agent/agents/templates/skills/` 下 SHALL 增加 `continuous-work/SKILL.md`。该 skill 的 `for_roles` SHALL 显式列出全部 7 个 Kaneo role（`coding`、`product-design`、`architecture-design`、`devops`、`ui-design`、`testing`、`code-review`），保证 install.sh 对所有 persona 都下发它。

#### Scenario: continuous-work 在 7 个 role 下都被识别

- **WHEN** 调用 `listSkillsForRole(role)` 对每个 role ∈ {coding, product-design, architecture-design, devops, ui-design, testing, code-review}
- **THEN** 返回集合 SHALL 包含 `continuous-work`

### Requirement: 单任务循环契约

skill SHALL 定义一个严格的循环：`claim_next_task` → 工作 → `update_task_status({status:"done"})` → 再次 `claim_next_task`。每个 cycle SHALL 只包含一次 claim 调用，不允许在 work 中途额外调用 `claim_next_task` 或 `claim_task`。

#### Scenario: 单 cycle 只调用一次 claim

- **WHEN** agent 在完成一个任务并更新状态为 `done` 之前调用 `claim_next_task` 第二次
- **THEN** skill 文档 SHALL 描述该行为为反模式并说明违反契约的后果

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

---

## MODIFIED Requirements（本次 change 改动）

### Requirement: Work skill vs helper skill 职责边界 <sup>[MODIFIED 2026-08-29]</sup>

`continuous-work/SKILL.md` SHALL 明确区分两层 skill：

- **outer work skill**：产出可交付物（commit、文档、ADR、IaC、设计稿、测试报告、PR review 结论），由它负责在末尾把 task 状态推到 `done` 或 `in-review`
- **helper skill**：产生中间产物（代码改动、检查报告、设计草稿），**禁止**自己修改 task 状态

outer work skill 集合 SHALL 至少包含：`submit-pr`、`write-prd`、`write-adr`、`write-iac`、`write-design-spec`、`write-test-suite`、`review-pr`。

helper skill 集合 SHALL 至少包含：`run-tests`、`repo-sync`、`code-search`、`frontend-design`、`make-interfaces-feel-better`、`accessibility`、`product-lens`、`product-capability`、`intent-driven-development`。

#### Scenario: outer work skill 正确推 finish 状态

- **WHEN** agent 完成 `submit-pr`（一个 outer work skill）的全部步骤
- **THEN** SKILL.md SHALL 描述该 skill 在末尾负责调用 `update_task_status({taskId, status:"in-review"})` 或 `done`

#### Scenario: helper skill 禁止改 status

- **WHEN** agent 单独使用 helper skill（如 `run-tests`）作为任务完成的全部步骤，且该 task 不存在外层 outer work skill
- **THEN** SKILL.md SHALL 描述 agent 必须在 helper 调用结束后**自行**调用 `update_task_status` 决定 `done` / `in-review` / `pause`；不能省略

#### Scenario: helper skill 内部禁止反复 claim

- **WHEN** helper skill 在执行中
- **THEN** 它 SHALL **不**调用 `claim_next_task` / `claim_task` —— 那是 cycle 入口，不是 helper 的职责

### Requirement: Race condition 处理 <sup>[MODIFIED 2026-08-29]</sup>

当 `update_task_status` 或 `pause_task` 返回非 200 时（典型状态码 403 / 409 / 404），SKILL.md SHALL 描述 agent 的标准化处理：

- **403**：当前 task 的 `userId` 已被改走（其他 agent claim / 人类 release）— task 已被接管
- **409**：状态机不兼容（例如想从 `done` 改回 `in-review`）— 服务端拒绝状态转换
- **404**：task 已被删除 — 不存在

收到以上状态码时，agent SHALL：

1. **不**重试同一调用
2. **不**自动 fallback 到 `claim_next_task` 抢新任务
3. 把"task 已被接管"视同本 cycle 完成，记录到 task comment / activity，再让 host 进入下一 cycle

#### Scenario: 403 状态码处理

- **WHEN** `update_task_status` 返回 403（task 的 owner 不是当前 agent）
- **THEN** SKILL.md SHALL 描述 agent 视同 done，记录 task comment，进入下一 cycle

#### Scenario: 409 状态码处理

- **WHEN** `update_task_status` 返回 409（状态机不兼容）
- **THEN** SKILL.md SHALL 描述 agent 视同 done，不重试

#### Scenario: 404 状态码处理

- **WHEN** `update_task_status` 返回 404（task 已删除）
- **THEN** SKILL.md SHALL 描述 agent 视同 done，不重试

### Requirement: claim-task 区分持续模式 vs 交互模式 <sup>[MODIFIED 2026-08-29]</sup>

`claim-task/SKILL.md` SHALL 在"触发时机"和"关键约束"两节区分两种工作模式下"认领下一个任务"的语义：

- **持续模式（autonomous / loop）**：host 进程会在下一 cycle 重新发起 `claim_next_task`，agent 不需要主动循环；"完成当前任务后认领下一个"由 host 实现
- **交互模式（chat / 单次调用）**：agent 等待用户下一条指令，**不**主动 claim 下一个；"完成当前任务后认领下一个"由用户触发

#### Scenario: 交互模式不自动 claim

- **WHEN** agent 在交互模式下完成当前 task 并把状态设为 `done`
- **THEN** SKILL.md SHALL 明确说明 agent **不**主动调用 `claim_next_task`，等待用户指令

#### Scenario: 持续模式由 host 驱动

- **WHEN** agent 在持续模式下完成当前 task 并把状态设为 `done`
- **THEN** SKILL.md SHALL 说明 host 进程负责下一 cycle 的 `claim_next_task` 调用，agent 本身不发起新 claim

---

## Out of Scope

- agent 退出 / 暂停循环的外部信号（通过 host 进程 SIGTERM 而非 skill 控制）
- 多 agent 协同（每个 agent 实例独立循环）
- 心跳 / 健康上报（agent 通过现有 `list_notifications` / activity 自检）
- 服务端对 race condition 的补偿机制（仅文档约定 agent 行为）
