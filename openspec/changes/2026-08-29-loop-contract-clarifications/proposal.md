## Why

`continuous-work` 和 `claim-task` 两个 universal skill 在 `2026-08-29-continuous-work-loop` change 中定义，但端到端两模式（持续 vs 交互）走查发现 3 个契约层 gap：

1. **Work skill vs helper skill 职责模糊**：当前文档没有区分 outer work skill（如 `submit-pr`、`write-prd`）与 helper skill（如 `run-tests`、`frontend-design`、`accessibility`）的 finish 责任。在持续模式下，agent 可能用 helper skill 完成任务后忘记调用 `update_task_status`，违反"完成令牌"约束。

2. **Race condition 处理未文档化**：当别的 agent / 人类修改了当前 task 状态（userId 被改走 / 状态机不兼容 / task 被删除）时，`update_task_status` / `pause_task` 会返回 403 / 409 / 404。当前 skill 只说"接收响应继续当前 cycle"，没有说明要不要自动重 claim、要不要回退状态。

3. **两种工作模式下的 claim 行为混淆**：`claim-task` SKILL.md 笼统说"完成当前任务后认领下一个任务"，对持续模式（host 驱动循环）和交互模式（用户驱动单次）行为相同描述。交互模式下 agent 不应主动 claim 下一个。

## What Changes

- **MODIFY** `continuous-work-loop` 能力（`openspec/specs/continuous-work-loop/spec.md`）— 新增 2 个 Requirement：
  - `Work skill vs helper skill 职责边界`：明确 outer work skill 负责 finish status，helper skill 禁止自己调 status
  - `Race condition 处理`：403 / 409 / 404 时不重试、不 fallback 重 claim、视同本 cycle 完成
- **MODIFY** `continuous-work-loop` capability 中的 `continuous-work/SKILL.md`：新增 §2.1（work vs helper）和 §2.2（race condition）
- **MODIFY** `claim-task` skill 文档：在"触发时机"和"关键约束"两节区分持续模式（host 驱动）与交互模式（用户驱动）的"认领下一个"语义
- **不修改**：MCP 工具集、REST API 端点、`parseSkillFrontmatter`、`buildAgentConfigZip`、`install.sh` — 纯文档层补完

## Behavior Contract（追加后）

| 场景 | 当前行为（gap） | 修复后行为 |
|---|---|---|
| agent 用 helper skill（run-tests 等）做完 | 状态不变，可能违规 | agent 必须自行判定 status 或确保 outer work skill 会收尾 |
| update_task_status 返回 403 / 409 / 404 | "接收响应继续 cycle" — 含义不清 | 视同本 cycle done；不重试；不 fallback 重 claim；写 task comment 记录 |
| 交互模式下当前 task 完成 | 文档说"认领下一个" | 等待用户下一条指令，**不**主动 claim |
| 持续模式下当前 task 完成 | 文档说"认领下一个" | 由 host 进程在下一 cycle 重新发起 `claim_next_task`（已是现状，但显式声明） |

## Out of Scope

- 不修改 MCP `update_task_status` / `pause_task` 的 HTTP 状态码语义
- 不引入新的 race-condition 检测 / 补偿机制（服务端没有提供，回退只是文档契约）
- 不修改 host runner（仍是 host 进程责任）
