---
for_roles: [coding, product-design, architecture-design, devops, ui-design, testing, code-review]
description: 自主持续工作循环 — 单任务单周期，禁止批量领取，禁止 tight retry loop
metadata:
  origin: kaneo-internal
  applies_to: all agent personas running in autonomous / loop mode
---

# Skill: Continuous Work

> 在自主（autonomous）模式下持续认领并完成任务的标准循环契约。叠加在 `claim-task` 之上，定义**单任务 / 单周期 / 必须显式完成才能领下一个**的纪律。所有 7 个 persona 都适用。

## 触发时机

- agent 以 `--mode autonomous` 或 `--loop` 启动
- 用户/调度器要求"持续工作直到被显式中断"
- 在 `claim-task` 之后、循环退出条件到达之前的每个 cycle
- 当前 cycle 完成（task 状态转 done / paused）并准备进入下一个 cycle

## 前置条件

- 已通过 `claim-task` skill 学会调用 `claim_next_task` / `update_task_status` / `pause_task`
- API key 的 `metadata.agentRole` 已设置（默认 `coding`）
- 单 agent 实例一次只跑一个循环；多 agent 并行由 host 进程管理（不是本 skill 的责任）
- 已选择 backoff 策略：固定间隔（30/60/120 秒）或指数退避（30 → 60 → 120 → 300 秒）

## 工作流程

### 1. Cycle 入口：认领下一个任务

**首选方式**：调用 MCP `claim_next_task`，由服务端按 due date / priority / role 自动选 best candidate。

```bash
# MCP 调用（推荐）
# 工具名：claim_next_task
# 参数：{ projectId?: string, priorities?: string[], requiredRole?: enum }
# 返回 200：{ id, title, description, status, priority, number, projectId, requiredRole, ... }
# 返回 404：无可领任务 — 进入空任务分支（见 step 4）
```

或用 REST 兜底：

```bash
curl -X POST "${KANEO_API_URL}/api/task/claim-next" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json"
```

**反模式警告**：不要用 `list_tasks` 拉清单再对每个任务 `claim_task({taskId})` 批量领取。这违反本 skill 的单任务契约。

### 2. Cycle 中：只完成当前任务

调用角色专属 skill 执行工作（例如 coding → `submit-pr`、testing → `run-tests`、code-review → `review-pr`）。

**关键纪律**：

- 一个 cycle 只调一次 `claim_next_task` / `claim_task`
- 在当前任务未转入 `done` / `paused` 前，**禁止**再次 claim
- 在 work 中途不要切换到另一个 task — 当前 cycle 必须终结

#### 2.1 Work skill vs helper skill 的职责边界

skill 分两层，agent 必须明确自己处在哪一层：

| 层 | 例子 | 是否调用 `update_task_status` |
|---|---|---|
| **outer work skill**（产出可交付物） | `submit-pr`, `write-prd`, `write-adr`, `write-iac`, `write-design-spec`, `write-test-suite`, `review-pr` | ✅ 由它负责在末尾把状态推到 `done` / `in-review` |
| **helper skill**（分析、检查、辅助） | `run-tests`, `repo-sync`, `code-search`, `frontend-design`, `make-interfaces-feel-better`, `accessibility`, `product-lens`, `product-capability`, `intent-driven-development` | ❌ **禁止**自己改 task 状态 |

**契约要点**：

- helper skill 只产生中间产物（代码改动、设计草稿、检查报告）。任何 status 更新由调用 helper 的 outer work skill 在最终步骤统一处理。
- 如果当前 task 没有对应的 outer work skill（例如 task 描述只要求"跑测试并报告"），agent 必须**在 helper 调用结束后自己决定**是 `done`、`in-review` 还是 `pause`，不能省略这一步。
- 绝对禁止 helper skill 在循环内部反复调用 `claim_next_task` —— 那是 cycle 入口，不是 helper 的职责。

#### 2.2 Race condition 处理

`update_task_status` / `pause_task` 可能在返回非 200 时遇到以下场景：

- **403** — 当前 task 的 `userId` 已被改走（别人 claim / release）
- **409** — 状态机不兼容（例如想从 `done` 改回 `in-review`）
- **404** — task 已被删除

收到这些状态码时：

1. **不要**重试同一调用
2. **不要**自动 fallback 到 `claim_next_task` 抢新任务
3. 把"task 已被接管"作为本 cycle 的结果（视同 done），记录到审计日志 / task comment，然后 host 进入下一 cycle

### 3. Cycle 出口：显式更新任务状态

只有**显式收到 done / paused 状态确认**后，才能发起下一次 claim。

```bash
# 完成（首选 done 状态）
curl -X PUT "${KANEO_API_URL}/api/task/status/${taskId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'

# 或在 work 中遇到不可恢复错误时暂停
curl -X POST "${KANEO_API_URL}/api/task/pause/${taskId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "<具体原因，便于项目经理巡检>"}'
```

> MCP 等价工具：`update_task_status({taskId, status})`、`pause_task({taskId, reason})`。

### 4. 空任务分支（无可领任务）

当 `claim_next_task` 返回 404：

1. 记录 cycle 结束（不要重试同一调用）
2. sleep 一个有限时长（推荐 30–120 秒，**禁止**秒级 tight loop）
3. 回到 step 1

```text
cycle_finished_empty → sleep 60s → next cycle
```

### 5. 失败处理分支

如果工作流内部抛出不可恢复异常（例如所有角色专属 skill 都报错）：

1. 调用 `pause_task({taskId, reason: "<错误摘要>"})` 释放任务
2. **必须**收到 pause 状态确认后才能进入下一次 claim
3. 回到 step 1

> **禁止**"放弃不释放" — 任务停留在 `in-progress` 会阻塞其他 agent / 人类接手。

### 6. 退出条件

只有 host 进程发出的信号（SIGTERM / 显式 `--once` 标志 / 用户中断）才能退出；本 skill 不在内部决定退出。退出前：

- 当前 cycle 必须已经终止（task 状态为 done / paused）
- 记录最后处理的 taskId 便于审计

## 关键约束

- **单任务单周期**：一个 cycle 只 claim 一次；不允许 `claim_next_task` 后又调用 `claim_task({taskId})` 抢别的
- **完成令牌**：未收到 `update_task_status({status: "done"})` 或 `pause_task` 的状态确认前，禁止发起下一次 claim
- **禁止 tight retry loop**：`claim_next_task` 返回 404 后必须 sleep 至少 30 秒再重试
- **禁止放弃不释放**：work 中抛错必须调用 `pause_task({reason})`，不能直接 `claim_next_task` 下一个
- **禁止用 `list_tasks` 批量领**：这是单任务契约的反面，永远不要做
- **不修改 API key**：循环中 role 由 API key 决定，禁止 attempt 切换 role 来扩展可领任务范围（违反授权边界）
- **不重写已认领任务的状态**：如果别的 agent / 人类修改了当前 task 状态（race condition），按 §2.2 处理 — 不要重 claim

## 质量标准

- 每个 cycle 必须以 done / paused 状态明确结束（不是隐式 timeout / context 满 / 被中断）
- 暂停任务时必须写明 `reason`，长度 ≥ 20 字符
- 空任务分支的 sleep 时长随重试次数合理增长，避免长期紧 loop（建议指数退避）
- 完成的任务应当留下可审计痕迹：通过 `create_task_comment` 或 activity 记录关键决策（见角色专属 skill）
- 失败 / 暂停的任务必须包含足够的上下文（错误堆栈、阻塞原因），方便后续接手

## 完成后

1. 收到 task `done` / `paused` 状态响应后立即进入下一 cycle（sleep 0）
2. 收到 404（空任务）后 sleep 一段时间进入下一 cycle
3. 收到 pause 响应后回到 step 1 重新 claim — **不要**因为失败就退出循环
4. host 进程发出退出信号（SIGTERM / `--once`）时，停止新 cycle；正在进行的 cycle 让其自然结束
5. 审计可由团队通过 `list_task_activity({taskId})` 或 `list_notifications` 复查每次 cycle 的输入与结果