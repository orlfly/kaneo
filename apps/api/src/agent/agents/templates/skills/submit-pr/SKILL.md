---
for_roles: [coding, testing, devops]
description: 创建分支、提交变更、推送并创建 PR
---

# Skill: Submit PR

> 创建特性分支、提交代码变更、推送并创建合并请求，将 PR 链接回 Kaneo 任务。

## 触发时机

- 代码变更完成
- 测试通过后

## 前置条件

- repo-sync 完成
- run-tests 通过
- 工作树有未提交的变更

## 工作流程

### 1. 创建特性分支

```bash
# 分支命名：{task-number}-{slugified-title}
# 例：KIA-3-add-auth-center-sso
git checkout -b ${taskNumber}-$(echo "${taskTitle}" | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
```

### 2. 暂存和提交

```bash
# 检查改动范围
git diff --stat

# 分组提交（按逻辑变更拆分 commit）
git add <files-for first change>
git commit -m "feat(auth): add SSO login with JWT RS256

- Add /api/auth/sso endpoint
- Support JWKS rotation
- Add integration tests for token validation

Closes KIA-3"
```

Conventional Commit 前缀：
- `feat:` 新功能
- `fix:` 修 bug
- `refactor:` 重构
- `test:` 测试
- `docs:` 文档
- `chore:` 杂项

### 3. 推送分支

```bash
git push -u origin ${branch-name}

# 如果 push 被拒（远端有新 commit）
git pull --rebase origin main
git push -u origin ${branch-name}
```

### 4. 创建合并请求

通过项目连接的 VCS（GitHub/GitLab/Gitea）创建 MR。

MR 描述模板：

```markdown
## 关联任务
Closes #{task-number}

## 变更内容
- {变更要点 1}
- {变更要点 2}

## 测试
- {测试结果摘要}

## 检查清单
- [x] 代码通过 lint
- [x] 测试通过
- [x] 无新增依赖（或已说明原因）
```

### 5. 回写 Kaneo 任务

```bash
# 更新任务状态为 in-review（使用专用的状态更新端点，只传 status）
curl -X PUT "${KANEO_API_URL}/api/task/status/${taskId}" \
  -H "Authorization: Bearer ${KANEO_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in-review"
  }'
```

> 注：PR/MR 的外部链接由 VCS 集成（GitHub/GitLab/Gitea）自动创建，
> 无需手动调用 external-link API。external-link 目前只有 GET 端点用于查询，
> 没有手动创建端点。
>
> 注：将状态设为 `in-review` 时，服务端会自动把任务的 `requiredRole` 设为
> `code-review`，无需手动传值。

## 关键约束

- 不要 force push 到 main/master
- 不要直接 push 到 main 分支，必须通过 PR
- commit message 必须包含任务编号（Closes #KIA-3）
- PR 必须关联到 Kaneo 任务，通过 API 更新状态和创建 external link
- 如果 VCS 集成不可用，仅做 git push 并在任务描述中注明分支名
- 不要删除本地分支（CI 可能需要）