---
for_roles: [testing]
description: 编写单元、集成和 E2E 测试用例，生成覆盖率报告
---

# Skill: Write Test Suite

> 编写高质量的测试套件（单元 / 集成 / E2E），覆盖正常流程、边界情况和异常处理，生成覆盖率报告。

## 触发时机

- 收到 testing 角色的任务
- 需要为新增功能编写测试
- 需要为 bug 修复编写回归测试
- 需要补充关键路径的测试覆盖

## 前置条件

- 已通过 `claim-task` 认领 testing 任务
- 已使用 `repo-sync` skill 拉取最新代码
- 已阅读被测代码的接口契约和现有测试约定
- 已使用 `run-tests` skill 识别项目的测试框架（vitest / jest / playwright / 等）

## 工作流程

### 1. 理解测试框架

```bash
# 检查测试框架
cat package.json | jq '.devDependencies | to_entries | map(select(.key | test("vitest|jest|playwright|mocha")))'

# 查看现有测试约定
ls tests/api tests/api-integration 2>/dev/null
cat apps/api/vitest.config.ts 2>/dev/null

# 查看测试命名风格
find tests/ -name "*.test.ts" | head -5 | xargs grep -h "^describe\|^test\|^it"
```

### 2. 编写单元测试

每个被测单元（函数 / 类）至少 3 个用例：

```typescript
import { describe, test, expect } from "vitest";
import { claimNextTask } from "./claim-task";

describe("claimNextTask", () => {
  test("should return the highest-priority unclaimed task", async () => {
    const task = await claimNextTask({ agentRole: "coding" });
    expect(task).toMatchObject({
      status: "to-do",
      requiredRole: "coding",
    });
  });

  test("should return 404 when no unclaimed tasks available", async () => {
    await expect(claimNextTask({ agentRole: "ui-design" })).rejects.toThrow(
      /No unclaimed tasks available/,
    );
  });

  test("should skip tasks with requiredRole set to other roles", async () => {
    // 准备：插入一个 requiredRole=coding 的任务，agent 角色=testing
    // 期望：该任务不被返回
    const task = await claimNextTask({ agentRole: "testing" });
    expect(task?.requiredRole).not.toBe("coding");
  });
});
```

### 3. 编写集成测试

集成测试使用真实数据库（testcontainers 或 fixture）：

```typescript
import { describe, test, expect, beforeEach } from "vitest";
import { setupTestDb, teardownTestDb } from "../helpers/db";
import { createTask, claimNextTask } from "@kaneo/api";

describe("Task claiming integration", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  test("end-to-end: create then claim", async () => {
    const created = await createTask({
      projectId: "test-project",
      title: "Implement feature X",
      requiredRole: "coding",
    });
    expect(created.status).toBe("to-do");

    const claimed = await claimNextTask({ agentRole: "coding" });
    expect(claimed.id).toBe(created.id);
    expect(claimed.status).toBe("in-progress");
  });
});
```

### 4. 编写 E2E 测试（可选）

```typescript
import { test, expect } from "@playwright/test";

test("user creates project via web UI", async ({ page }) => {
  await page.goto("/projects");
  await page.click("text=New Project");
  await page.fill('[name="name"]', "Test Project");
  await page.click('button:has-text("Create")');
  await expect(page.locator("text=Test Project")).toBeVisible();
});
```

### 5. 测试命名约定

使用描述性命名，明确表达「验证的行为」：

- ✅ `should reject invalid token`
- ✅ `should return 404 for non-existent task`
- ✅ `should cascade delete tasks when project is removed`
- ❌ `test1`
- ❌ `works correctly`
- ❌ `should work`

### 6. 主动发现边界情况

每个被测单元，主动覆盖：

- **空值**：`null`、`undefined`、空字符串、空数组
- **边界值**：0、1、负数、最大值
- **并发**：同时调用、race condition
- **超时**：慢响应、网络中断
- **权限**：未授权、跨用户访问、提权攻击
- **状态**：初始、中间、终止、错误状态
- **数据**：特殊字符、超长字符串、Unicode

### 7. 运行测试 + 覆盖率报告

```bash
# 运行所有测试
pnpm test

# 运行特定文件的测试
pnpm test claim-task.test.ts

# 生成覆盖率报告
pnpm test --coverage

# 覆盖率阈值检查（可选）
pnpm test --coverage --coverage.threshold.lines=80
```

目标：**新增代码的分支覆盖率 ≥ 80%**。

### 8. 测试隔离

每个测试必须独立：
- ✅ 不依赖其他测试的执行顺序
- ✅ 不留下共享状态（使用 `beforeEach` 清理）
- ✅ 可重复执行（idempotent）
- ✅ 真实数据库连接（用 testcontainers），不要 mock 数据库

## 关键约束

- **不要修改生产代码**（非测试文件），除非是修复测试本身发现的 bug
- **不要为了提高覆盖率而写无意义的测试**
- **不要 skip/xit 测试来绕过失败**（必须修复或删除）
- **不要 mock 真实数据库连接**（使用 testcontainers 或 fixture）
- **不要修改 API 路由或数据库 schema**

## 质量标准

- 测试通过率 100%（预存失败除外，需标注为 known issue）
- 新增代码的分支覆盖率 ≥ 80%
- 测试命名清晰描述验证的行为（`should <action> when <condition>`）
- 测试执行时间合理（单测 < 5s，集成测试 < 30s）
- 测试报告包含：通过/失败/跳过数量、覆盖率摘要
- 主动覆盖边界情况（空值、并发、超时、权限）

## 完成后

1. 运行完整测试套件：`pnpm test`
2. 生成覆盖率报告：`pnpm test --coverage`
3. 使用 `submit-pr` skill 提交 PR，PR 描述包含测试报告（通过率 + 覆盖率）
4. 调用 `PUT /api/task/status/{taskId}` 将任务状态更新为 `in-review`
5. 如果测试发现 bug，使用 `claim-task` skill 创建后续任务并设置 `requiredRole: coding`