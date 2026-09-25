---
for_roles: [code-review]
description: 结构化 PR 评审，按 Blocker/Major/Minor/Info 分级提供反馈
---

# Skill: Review PR

> 对 PR/MR 的代码变更进行结构化评审，按严重级别（Blocker / Major / Minor / Info）分级提供反馈，输出可操作的修改建议。

## 触发时机

- 收到 code-review 角色的任务（任务状态为 `in-review`）
- 团队请求评审 PR
- 自动化 CI 标记需要人工评审

## 前置条件

- 已通过 `claim-task` 认领 code-review 任务（自动认领 `in-review` 状态任务）
- 已阅读项目的 lint / typecheck / test 配置
- 已知团队的代码规范和评审标准

## 工作流程

### 1. 查看 PR diff

```bash
# 克隆并查看 PR（如果还没有）
gh pr checkout <pr-number>

# 查看变更范围
git diff main...HEAD --stat

# 查看完整 diff
git diff main...HEAD
```

### 2. 结构化评审：按严重级别分类

每个问题必须分级：

| 级别 | 含义 | 是否阻塞合并 |
|------|------|-------------|
| 🔴 **Blocker** | 安全漏洞、逻辑错误、数据丢失风险、API breaking change | **是** — 必须修复 |
| 🟡 **Major** | 性能问题、缺失错误处理、测试不足、缺少事务 | 强烈建议 — 应修复 |
| 🟢 **Minor** | 命名、注释、代码风格、可读性 | 可选 — 后续改进 |
| ℹ️ **Info** | 设计模式提示、替代方案、知识分享 | 信息性 — 不阻塞 |

### 3. 检查项清单

#### 3.1 代码正确性

- 逻辑是否正确，边界情况是否处理
- 数据结构选择是否合理
- 算法复杂度是否可接受

```markdown
🔴 Blocker: `apps/api/src/task/claim.ts:42`
删除任务时未处理级联删除，导致 column 引用悬空。
修复建议：使用事务 + cascade，或显式删除 column。
```

#### 3.2 安全性

- 是否有注入风险（SQL / NoSQL / 命令注入）
- 是否有越权风险（用户能否访问未授权资源）
- 是否有信息泄露（错误信息暴露内部结构、日志泄露密钥）
- 输入验证是否充分（zod / valibot schema）

```markdown
🔴 Blocker: `apps/api/src/auth/login.ts:18`
用户输入未经验证直接拼接到 SQL，存在注入风险。
修复建议：使用 Drizzle ORM 参数化查询，或增加 valibot 验证。
```

#### 3.3 测试覆盖

- 是否有对应测试（单元 + 集成）
- 测试是否验证了关键路径
- 测试是否覆盖边界情况
- 覆盖率是否达到项目阈值（≥ 80%）

```markdown
🟡 Major: 新增 `claim-task` 控制器无测试覆盖
修复建议：添加单元测试（`claim-task.test.ts`），覆盖：
- 正常流程：认领匹配角色任务
- 边界情况：无任务、requiredRole 不匹配
- 异常：数据库错误
```

#### 3.4 API 兼容性

- 是否有 breaking change（删除字段、修改类型、改路径）
- OpenAPI 描述是否更新
- 错误响应格式是否符合 RFC 7807

```markdown
🔴 Blocker: 删除 `/api/task/:id/status` 字段 `previousStatus`
这是 breaking change，前端依赖此字段显示操作历史。
修复建议：保留字段并标记 deprecated，或在 OpenAPI 描述中标注迁移路径。
```

#### 3.5 数据库变更

- migration 是否向前兼容（旧版本可运行新 schema）
- 是否有回滚方案（down migration）
- 索引是否合理（避免全表扫描）
- 事务边界是否正确

```markdown
🟡 Major: `migrations/0042_add_priority.sql` 未添加索引
`tasks.priority` 字段新增，但 WHERE priority='high' 查询无索引。
修复建议：CREATE INDEX CONCURRENTLY idx_tasks_priority ON tasks(priority);
```

#### 3.6 性能

- N+1 查询
- 不必要的同步阻塞
- 缺少缓存（但不要过度缓存）
- 大循环 / 大文件处理

```markdown
🟡 Major: `apps/api/src/project/list.ts:23`
循环中查询每个项目的任务数，存在 N+1 查询。
修复建议：使用 LEFT JOIN 一次性查询，或使用 `select { ..., taskCount: count(tasks.id) }`。
```

### 4. 不重复 lint 能自动修复的问题

如果项目有 lint 配置（biome / eslint / prettier），**不报告**以下问题：
- 缩进、引号、分号
- 导入顺序
- 命名风格（如 `camelCase` vs `snake_case`）

但要报告**业务逻辑相关的命名**问题（如变量名与含义不符）。

### 5. 给出可操作建议

每个问题必须附带：
- **代码位置**：`file:line`
- **问题描述**：清晰说明违反了什么原则或标准
- **修复建议**：具体的代码片段或方向，不是"建议改进"

```markdown
🟡 Major: `apps/api/src/auth/login.ts:42`
错误处理使用 `console.error`，生产环境日志无法聚合。
修复建议：使用项目日志工具（如 pino），并补充结构化字段：
```ts
logger.error({ err, userId }, "login failed");
```
```

### 6. 输出评审报告

评审报告作为 PR 评论提交：

```markdown
## Code Review

### 🔴 Blockers（必须修复才能合并）

1. **`apps/api/src/task/delete.ts:18`** — 删除任务未级联删除关联 column
   - 修复：使用 Drizzle `onDelete: 'cascade'`，或在 controller 中事务删除

2. **`apps/api/src/auth/login.ts:42`** — SQL 注入风险
   - 修复：使用 Drizzle ORM 参数化查询

### 🟡 Major（强烈建议修复）

1. **`apps/api/src/project/list.ts:23`** — N+1 查询
   - 修复：使用 `select { ..., taskCount: count() }`

### 🟢 Minor（可选改进）

1. **`apps/api/src/utils/format.ts:8`** — 函数名 `fmtDate` 不清晰
   - 建议：重命名为 `formatIsoDate`

### ℹ️ Info（信息性）

1. 考虑使用 `zod` 替代手写验证 — 当前 schema 分散在多处

---

**总结**：修复所有 🔴 Blocker 后可合并。🟡 Major 建议本 PR 处理，避免后续技术债务。
```

## 关键约束

- **不要直接修改代码**（不编辑任何文件，仅评审）
- **不要跳过审查项以加快进度**
- **不要给出模糊反馈**（如"代码质量不高"）
- **不要合并 PR**（评审只提供反馈，合并由人完成）
- 区分事实性问题（逻辑错误）和主观偏好（风格选择）

## 质量标准

- 每个 🔴 Blocker 和 🟡 Major 问题附带具体的代码位置（`file:line`）和修复建议
- 评审覆盖所有变更文件，不遗漏
- 反馈使用结构化格式（Markdown 表格或列表）
- 区分事实性问题（逻辑错误）和主观偏好（风格选择）
- 评审报告在 PR 评论中提交（不是 email / Slack / 其他渠道）

## 完成后

1. 将评审报告作为 PR 评论提交（`gh pr review <number> --comment --body-file review.md`）
2. 通过 `claim-task` 认领任务时，code-review 领到的是 `in-review` 任务（评审锁），**不会**改动 `userId` / `claimedBy`；评审结束要通过变更任务状态来释放评审锁：
   - **评审通过**：调用 `PUT /api/task/status/{taskId}`，`{"status":"done"}`（任务完成）
   - **发现必须修复的问题（Blocker / 关键 Major）**：调用 `PUT /api/task/status/{taskId}`，`{"status":"in-progress"}`，让任务回到实现者手中返工，之后原实现 agent 修复并重新提交 `in-review`
   - **评审过程中决定放弃**：`POST /api/task/release/{taskId}`（释放评审锁，任务仍保持 `in-review`，其它评审可接手）
3. 如果发现需要修复的问题，使用 `claim-task` skill 创建后续任务并设置 `requiredRole: coding`
4. 如果发现测试不足，使用 `claim-task` skill 创建后续任务并设置 `requiredRole: testing`

> 不要直接修改代码（仅评审）。评审通过后任务进入 `done`；要求返工时任务回到 `in-progress`，由实现 agent 处理后再提交 `in-review`。