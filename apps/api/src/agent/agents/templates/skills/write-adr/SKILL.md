---
for_roles: [architecture-design]
description: 编写架构决策记录（ADR），输出到 docs/decisions/
---

# Skill: Write ADR

> 编写架构决策记录（ADR），使用标准 Context/Decision/Consequences 格式，记录技术选型和服务边界决策。

## 触发时机

- 收到 architecture-design 角色的任务
- 需要做出影响系统架构的技术决策
- 需要为现有架构决策补充背景和理由
- 需要定义新服务的边界、API 契约、数据所有权

## 前置条件

- 已通过 `claim-task` 认领 architecture-design 任务
- 已阅读项目架构文档、服务列表、数据流图
- 已知决策的影响范围（影响哪些服务、API、数据库）

## 工作流程

### 1. 理解现有架构

```bash
# 阅读架构文档
ls docs/architecture/ docs/decisions/ 2>/dev/null

# 理解服务列表
find apps/ -name "package.json" -type f

# 理解 API 边界
rg "app\.(get|post|put|delete)" apps/api/src --type ts -l
```

### 2. 编写 ADR（标准格式）

ADR 输出到 `docs/decisions/NNNN-<kebab-case-title>.md`，编号递增。结构：

```markdown
# NNNN. <决策标题>

## 状态
<Proposed | Accepted | Deprecated | Superseded by NNNN>

## 上下文（Context）
<问题背景、技术约束、影响范围>
<为什么现在需要做这个决策>
<相关方、利益相关者>

## 决策（Decision）
<明确陈述决策内容>
<关键选择：选了什么，为什么>

## 理由（Rationale）
<为什么这个方案优于替代方案>
<量化对比：性能、复杂度、维护成本>
<关键 trade-off>

## 后果（Consequences）
### 正面
- <可预期的收益>

### 负面
- <技术债务、约束、未来成本>
- <不可逆的影响>

## 替代方案（Alternatives Considered）
### 方案 A：<替代方案>
- 优点：<...>
- 缺点：<...>
- 否决理由：<...>

### 方案 B：<替代方案>
- ...

## 兼容性影响
<breaking change 标注、迁移路径、回滚方案>
```

### 3. 服务边界定义

如果是新增/调整服务，输出到 `docs/architecture/services/<service-name>.md`：

```markdown
# <服务名>

## 职责
<一句话描述服务的核心职责>

## API 边界
- 输入：<接受的请求类型>
- 输出：<返回的数据/事件>
- 依赖：<调用的下游服务>

## 数据所有权
- 拥有：<数据库表、消息主题>
- 引用：<只读引用的其他服务数据>

## SLO
- 可用性：<百分比>
- 延迟：<p99 毫秒>
- 错误率：<百分比>

## 部署拓扑
<独立部署 / 共享集群 / Sidecar>
```

### 4. 量化对比

技术选型决策必须量化对比至少 2 个候选方案：

| 维度 | 方案 A | 方案 B | 说明 |
|------|--------|--------|------|
| 性能 | X req/s | Y req/s | <基准测试数据> |
| 复杂度 | 高 | 中 | <学习曲线、API 复杂度> |
| 维护成本 | 5 人/月 | 2 人/月 | <社区活跃度、文档> |
| 团队熟悉度 | 高 | 低 | <既有项目使用情况> |

## 关键约束

- **不要直接编写实现代码**（.ts/.tsx/.py/.go 等）
- **不要修改数据库 schema 或 API 路由**（决策记录，不实施）
- **不要运行测试或构建**
- **不要创建包含代码变更的 PR**（仅文档变更可提交 PR）
- 必须考虑现有系统的影响，明确标注 breaking change

## 质量标准

- ADR 遵循 Context/Decision/Consequences 标准格式
- 每个决策至少对比 2 个候选方案，给出量化数据
- 服务边界文档包含职责、API、数据所有权、SLO
- 设计可被开发团队直接参照实施
- 文档使用中文描述，技术术语保留英文

## 完成后

1. 确认 ADR 文件已保存到 `docs/decisions/NNNN-<title>.md`
2. 如果设计需要拆分为多个开发任务，使用 `claim-task` skill 创建子任务并设置 `requiredRole: coding`（或 `devops`）
3. 调用 `PUT /api/task/status/{taskId}` 将任务状态更新为 `in-review`