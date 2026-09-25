---
for_roles: [coding, testing]
description: 检测测试框架、运行测试并解读结果
---

# Skill: Run Tests

> 检测项目的测试框架、运行相关测试、解读结果，确保变更不破坏现有测试。

## 触发时机

- 代码变更完成后
- 提交 PR 前

## 前置条件

- repo-sync 已完成，工作树有改动
- 依赖已安装（如果项目需要 install 步骤）

## 工作流程

### 1. 检测测试框架

```bash
# Node.js 项目
cat package.json | grep -E '"jest"|"vitest"|"mocha"'

# Python 项目
ls pytest.ini setup.cfg pyproject.toml 2>/dev/null

# Java 项目
ls pom.xml build.gradle 2>/dev/null

# Go 项目
ls go.mod 2>/dev/null
```

如果没有检测到测试框架，报告"项目无测试框架"并跳过。

### 2. 运行测试

#### 全量运行（首次或 CI 前）

```bash
# jest
npx jest --ci --reporters=default

# vitest
npx vitest run --reporter=verbose

# pytest
python -m pytest -v

# maven
mvn test

# go
go test ./...
```

#### 针对性运行（只跑受影响的测试）

```bash
# jest — 按文件名模式
npx jest --testPathPattern="<changed-file>"

# vitest — 指定文件
npx vitest run <changed-file>

# pytest — 指定文件
python -m pytest <changed-file> -v
```

### 3. 解读结果

解析输出中的通过/失败/跳过数量：

```
✅ 45 passed, 0 failed (2.3s)

❌ 3 failed:
  - test/auth/login.test.ts:23 — "should reject invalid token"
    AssertionError: expected 401, got 200
  - test/api/user.test.ts:67 — "should not leak email"
    TypeError: Cannot read property 'email' of undefined
  - test/utils/date.test.ts:12 — "should format ISO date"
    Timeout: exceeded 5000ms
```

### 4. 测试不通过时的决策

- agent 的变更导致失败 → 修复代码后重新运行
- 预存失败（main 分支也失败）→ 记录为 known issue，继续提交
- 测试框架缺失 → 跳过并在 PR 描述中注明"无测试框架"

## 关键约束

- 不要修改测试文件来让测试通过（除非任务本身就是修测试）
- 不要 skip 或 xit 测试来绕过失败
- 测试运行超时时不要无限重试，3 次后报告阻塞
- 运行测试时设置合理超时（默认 60s 单测试，300s 全量）