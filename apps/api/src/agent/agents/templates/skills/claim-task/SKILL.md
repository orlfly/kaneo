---
for_roles: [coding, product-design, architecture-design, devops, ui-design, testing, code-review]
description: 通过 Kaneo API 认领任务、管理任务状态和创建后续任务
---

# Skill: Claim Task

> 通过 Kaneo API 认领任务、管理任务状态和创建后续任务。这是 agent 与 Kaneo 平台交互的核心 skill。

## 触发时机

- agent 启动后认领第一个任务
- 当前任务状态转 `done` / `paused` 之后：
  - **持续模式（autonomous / loop）**：host 进程会在下一 cycle 重新发起 `claim_next_task`，agent 不需要主动循环
  - **交互模式（chat / 单次调用）**：等待用户下一条指令，**不**主动 claim 下一个
- 遇到阻塞时暂停任务
- 发现角色不匹配时释放任务
- 实现过程中发现需要创建后续任务

## 前置条件

- 已配置 Kaneo API key（通过环境变量 `KANEO_API_KEY` 或 `KANEO_API_TOKEN`）
- API key 的 `metadata.agentRole` 已设置（默认 `coding`）
- 已知 Kaneo API base URL（通过环境变量 `KANEO_API_URL` 或默认 `http://localhost:1337`）

## 工作流程

### 1. 认领任务

```bash
# 认领匹配当前角色的最佳任务
curl -X POST "${KANEO_API_URL}/api/task/claim-next" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json"

# 响应 200: { id, title, description, status, priority, number, projectId, requiredRole, ... }
# 响应 404: { message: "No unclaimed tasks available" }
```

认领成功后，读取任务详情：

```bash
curl -X GET "${KANEO_API_URL}/api/task/${taskId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}"
```

### 2. 更新任务状态

```bash
# 更新状态（如提交 PR 后设为 in-review）。使用专用的状态端点，只传 status
curl -X PUT "${KANEO_API_URL}/api/task/status/${taskId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in-review"
  }'
```

状态流转：`to-do` → `in-progress` → `in-review` → `done`

> **requiredRole 自动流转**：服务端会按目标状态自动设置 requiredRole，无需手动传值：
> - → `in-progress`：requiredRole 设为 agent 的设定角色
> - → `in-review`：requiredRole 设为 `code-review`
> - → `done`：requiredRole 清空（NULL）

**code-review 的 review 认领（特殊）**：

`code-review` agent 认领 `in-review` 任务时，服务端只加「**评审锁**」（review claim），用于多个评审 agent 之间的互斥。它**不会**改动任务的 `userId` / `claimedBy` / `claimedAt`（实现者归属不变），也**不会**改变任务状态（保持 `in-review`）。`claim_next_task` / `claim` 返回 409 表示该任务已被另一个评审 agent 锁定。

> **重要提醒（code-review）**：`in-review` 任务的 `assignee` / `claimed_by` **必然**是原实现者（例如 coding key），**这不代表任务被占用，评审 agent 照常认领**。直接 claim 会得到评审锁（200，状态仍为 `in-review`）；不要因为任务详情里 `claimed_by` / `assignee` 有值就跳过、误判为"已认领"或等待实现者释放。只有 `claim` 返回 409（"already claimed by another reviewer"）才表示评审锁被别的评审 agent 占用。

评审完成时，评审 agent 通过更新任务状态来释放评审锁：
- **评审通过**：`PUT /api/task/status/{taskId}` `{"status":"done"}`（任务完成）
- **需要返工**：`PUT /api/task/status/{taskId}` `{"status":"in-progress"}`（任务回到实现者手中，`requiredRole` 清空）
- 评审过程中放弃：`POST /api/task/release/{taskId}`（只清除评审锁，任务仍保持 `in-review`，其它评审可接手）

> **返工后如何重新领取（实现者）**：评审将任务置回 `in-progress`（`requiredRole` 清空）时，任务仍分配在**原实现者**名下。实现者无需新建任务——调用 `claim_next_task`（或 `claim/{taskId}`）会直接回到这个 `in-progress` 的返工任务（返回 `status: in-progress`），修复后再次 `PUT /api/task/status/{taskId}` `{"status":"in-review"}` 提交复审。

> 只有持有评审锁的 agent（或人类）能结束 `in-review` 状态的评审；评审 agent 不能把任务重新设回 `in-review`（防止评审死循环）。

### 3. 暂停任务（遇到阻塞）

```bash
# 注意：pause 在路径中，不是 /api/task/{taskId}/pause
curl -X POST "${KANEO_API_URL}/api/task/pause/${taskId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"reason": "等待 auth-center API 设计完成后才能继续"}'
```

### 4. 释放任务（角色不匹配）

```bash
# 注意：release 在路径中，不是 /api/task/{taskId}/release
curl -X POST "${KANEO_API_URL}/api/task/release/${taskId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}"
```

### 5. 创建后续任务

```bash
# 注意：projectId 在路径中（/api/task/:projectId），不在请求体
# 未显式传 requiredRole 时，服务端会默认设为 agent 的设定角色
# startDate/dueDate 必填排期（ISO 8601）：没有排期的任务不会出现在甘特图上
curl -X POST "${KANEO_API_URL}/api/task/${projectId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "实现 auth-center SSO 登录接口",
    "description": "...",
    "priority": "high",
    "startDate": "2025-09-02",
    "dueDate": "2025-09-05"
  }'
```

排期规则：

- `startDate`：任务可以开始的日子。无明确信息时用当天日期
- `dueDate`：预计完成日。按任务规模估算（小任务 1-2 天，中等 3-5 天，大型拆分后再排期）
- 依赖前置任务时，`startDate` 应在前置任务预期完成之后
- `startDate` 不能晚于 `dueDate`（API 会返回 400）

创建后续任务后，若它与已有任务存在依赖关系，使用任务关系 API 声明依赖，使甘特图和依赖视图反映真实的任务先后关系：

```bash
# 关系类型：
#   subtask  → 新任务是 target 的子任务（source 是父任务，target 是子任务）
#   blocks   → 新任务阻塞 target
#   related  → 双向关联
curl -X POST "${KANEO_API_URL}/api/task-relation" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceTaskId": "<新任务 id>",
    "targetTaskId": "<被依赖任务 id>",
    "relationType": "blocks"
  }'
```

- 新任务依赖某个前置任务时，用 `blocks`（新任务阻塞前置任务）或 `related`
- 新任务是某个任务的子任务时，用 `subtask`（source = 父任务，target = 新任务）
- 查询任务依赖：`GET ${KANEO_API_URL}/api/task-relation/<taskId>`
- 删除依赖：`DELETE ${KANEO_API_URL}/api/task-relation/<relationId>`

## 关键约束

- API key 的 agent role 决定能认领哪些任务：
  - 非 `code-review` 角色：只认领 `to-do` 任务，且 `requiredRole` 为 null 或等于 agent 角色
  - `code-review` 角色：只认领 `in-review` 任务（忽略 `requiredRole` 与 `claim_by`/`userId`），领取时**不修改**原实现者的 `userId` / `claimedBy`，任务状态保持 `in-review`
- code-review 评审期间任务处于「评审锁」状态：同一任务同时只能有一个评审 agent 持有锁，其它评审 agent `claim` 会得到 409
- 评审结束必须显式变更任务状态（`done` = 通过，`in-progress` = 返工）来释放评审锁，全程不改 `claim_by`
- 每次只认领一个任务，完成后再认领下一个
  - 持续模式下 host 会自动驱动下一次 claim（见 `continuous-work` skill）
  - 交互模式下由用户下一条指令触发
- 暂停任务必须写明原因，便于项目经理巡检
- 释放任务前确保没有未提交的代码变更
- 创建后续任务时，服务端默认将 `requiredRole` 设为 agent 的设定角色；如需指定其它角色，显式传 `requiredRole`
- 创建后续任务时必须传 `startDate` / `dueDate` 排期（ISO 8601），没有排期的任务不会出现在甘特图上