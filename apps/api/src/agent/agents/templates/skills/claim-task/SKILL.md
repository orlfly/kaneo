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
curl -X POST "${KANEO_API_URL}/api/task/${projectId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "实现 auth-center SSO 登录接口",
    "description": "...",
    "priority": "high"
  }'
```

## 关键约束

- API key 的 agent role 决定能认领哪些任务：
  - 非 `code-review` 角色：只认领 `to-do` 任务，且 `requiredRole` 为 null 或等于 agent 角色
  - `code-review` 角色：只认领 `in-review` 任务，忽略 `requiredRole`
- 每次只认领一个任务，完成后再认领下一个
  - 持续模式下 host 会自动驱动下一次 claim（见 `continuous-work` skill）
  - 交互模式下由用户下一条指令触发
- 暂停任务必须写明原因，便于项目经理巡检
- 释放任务前确保没有未提交的代码变更
- 创建后续任务时，服务端默认将 `requiredRole` 设为 agent 的设定角色；如需指定其它角色，显式传 `requiredRole`