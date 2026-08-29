---
for_roles: [coding, devops, testing]
description: 同步仓库到最新状态，确保干净的工作基础
---

# Skill: Repo Sync

> 在开始工作前将项目仓库同步到最新状态，确保在干净的代码基础上工作。

## 触发时机

- 认领任务后、开始编码前
- 长时间工作后需要同步其他人的变更

## 前置条件

- agent 工作目录已通过 `agent_clone_repo` 克隆了仓库
- git 远程配置正确（origin 指向项目仓库）

## 工作流程

### 1. 检查工作树状态

```bash
git status --porcelain
```

- 输出为空 → 工作树干净，继续同步
- 有未提交改动 → 先提交或 stash，不要直接 pull

### 2. 拉取最新代码

```bash
# 优先 rebase，保持线性历史
git pull --rebase origin main
# 如果主分支不是 main，替换为 master / develop / trunk
```

### 3. 冲突处理

如果 rebase 冲突：

```bash
# 查看冲突文件
git diff --name-only --diff-filter=U

# 逐文件解决冲突标记（<<<<<<< / ======= / >>>>>>>）
# 解决后：
git add <resolved-file>
git rebase --continue

# 如果无法解决：
git rebase --abort
# 暂停任务并报告阻塞
```

### 4. 验证同步成功

```bash
# 确认 HEAD 在最新 commit
git log --oneline -3

# 确认工作树干净
git status
```

### 5. 记录 base commit

```bash
# 记录当前 commit hash，供 submit-pr 时作为 base
git rev-parse HEAD
```

## 关键约束

- 不要 force push
- 不要在 main/master 分支上直接提交
- 同步失败时暂停任务并报告阻塞，不要继续在过时代码上工作
- 如果工作目录未克隆仓库，先使用 `agent_clone_repo` 工具克隆