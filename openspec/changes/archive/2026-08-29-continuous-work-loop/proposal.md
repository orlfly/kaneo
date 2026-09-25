## Why

Kaneo 的 `claim-task` skill 已经教会 agent 怎么 claim / 提交任务，但没有强制**持续工作纪律**：

1. agent 可能 claim 一个任务后陷入 context 膨胀 / 自检循环，迟迟不调用 `update_task_status`
2. agent 可能用 `claim_task`（指定 ID）一次领多个 task，攒到一起"批量做完再统一提交"
3. agent 在"没有可领任务"时可能进入 tight retry loop，浪费 API quota
4. 多 persona（coding / ui-design / testing / …）各自跑自主循环时缺少统一的循环模板，导致行为漂移

需要一个 **universal 行为护栏 skill**：在 `claim-task` 之上叠加一个明确的循环契约 — **单任务、单周期、必须显式完成才能领下一个**。该 skill 对所有 7 个角色都适用，因为持续工作模式不属于任何单一 persona。

## What Changes

- **新增 1 个 universal skill**：`continuous-work`
  - 位置：`apps/api/src/agent/agents/templates/skills/continuous-work/SKILL.md`
  - `for_roles` 显式列出全部 7 个 persona（与 `claim-task` 一致）
  - `metadata.origin: kaneo-internal`（与上游 third-party 区分）
- **核心契约**：
  - 单任务循环：`claim_next_task` → work → `update_task_status({status:"done"})` → 下一个 cycle
  - **禁止批量领取**：单次 cycle 只允许一次 `claim_next_task` 或 `claim_task({taskId})` 调用
  - **完成令牌**：未拿到 done 状态确认前禁止发起下一次 claim
  - **空任务处理**：claim 返回 404 → sleep 后重试，避免 tight loop
  - **失败处理**：task 工作失败 → `pause_task({reason})` 释放，再 claim 下一个
- **不修改**：现有 `claim-task`、`update_task_status`、`pause_task` MCP 工具与 `/api/task/claim-next` API
- **不修改**：`parseSkillFrontmatter`、`validateRoles`、`skillAppliesToRole`、`buildAgentConfigZip`、`install.sh` — 新 skill 通过现有 frontmatter 机制自动分发

## Behavior Contract

| 步骤 | MCP / API | 禁止行为 |
|---|---|---|
| 1. 启动 | `claim_next_task` (MCP) 或 `POST /api/task/claim-next` (REST) | 不要用 `list_tasks` 拉清单再 `claim_task` 批量领 — 这是反模式 |
| 2. 工作中 | 角色专属 skill（write-prd / write-design-spec / 等等） | 不要在 work 中途再次 `claim_*` |
| 3. 完成 | `update_task_status({taskId, status:"done"})` | 禁止省略 done 状态就进入下一 cycle |
| 4. 失败 | `pause_task({taskId, reason})` | 禁止放弃任务不释放 |
| 5. 空任务 | `claim_next_task` → 404 → sleep N 秒 → 重试 | 禁止 tight loop |

## Out of Scope

- agent 退出 / 暂停循环的外部信号（通过 host 进程 SIGTERM 而非 skill 控制）
- 多 agent 协同（每个 agent 实例独立循环）
- 心跳 / 健康上报（agent 通过现有 `list_notifications` / activity 自检）