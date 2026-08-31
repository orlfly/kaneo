## Context

Kaneo 平台已具备任务依赖关系管理：`task_relation` 表（`source_task_id` / `target_task_id` / `relation_type`），支持三种关系类型 `subtask`（source 是父任务，target 是子任务）、`blocks`（source 阻塞 target）、`related`（双向）。API 路由 `/api/task-relation` 提供创建、查询、删除，控制器 `create-task-relation.ts` 校验同任务自环、跨团队访问、重复关系，并发布 `task-relation.created` 事件。Web 端有 `task-relations.tsx` 组件和甘特图显示。

MCP 工具已暴露 `create_task_relation` / `get_task_relations` / `delete_task_relation`，但对话 agent（pi-agent）的工具集（`apps/api/src/chat/tools.ts`）没有这些工具，且 `create_task`（对话与 MCP）都不接受依赖参数。角色 agent 模板与 `claim-task` skill 也没有依赖管理指导。

## Goals / Non-Goals

**Goals:**
- 对话 agent（pi-agent）获得与 MCP 对齐的任务关系工具：`create_task_relation` / `get_task_relations` / `delete_task_relation`
- `create_task`（对话与 MCP）支持可选的依赖参数，agent 可在创建任务时声明其与已有任务的关系
- pi-agent 系统提示词指导其在创建任务时识别并声明依赖关系
- 角色 agent 模板与 `claim-task` skill 增加依赖管理指导
- 测试覆盖新增能力

**Non-Goals:**
- 不修改 `task_relation` 表结构或关系类型（沿用现有 `subtask` / `blocks` / `related`）
- 不修改任务关系 API 路由与控制器（复用现有 `/api/task-relation`）
- 不改变甘特图或 Web 端依赖 UI（已有）
- 不引入新的关系类型

## Decisions

### Decision 1: 对话工具复用现有 task-relation 控制器

`apps/api/src/chat/tools.ts` 新增三个工具，直接调用现有控制器 `createTaskRelation` / `getTaskRelations` / `deleteTaskRelation`（与 MCP 工具一致），而不是重复实现数据库逻辑。

**Rationale**: 复用已验证的控制器，保证对话 agent 与 MCP 工具行为一致，避免逻辑分叉。

### Decision 2: create_task 支持可选依赖参数

`create_task`（对话与 MCP）新增可选参数 `dependencies`（或 `relations`），接受一个数组，每项含 `targetTaskId` 与 `relationType`。创建任务成功后，对每个依赖项调用 `createTaskRelation`（source = 新任务，target = 依赖任务）。若依赖任务不存在或跨团队，返回错误并回滚已创建的关系。

**Rationale**: 让 agent 在创建任务的同时声明依赖，减少往返调用，且依赖关系与任务创建原子性一致。

### Decision 3: 系统提示词指导依赖管理

`buildSystemPrompt` 增加指导：创建任务时，若新任务依赖已有任务（前置任务、阻塞关系、父子关系），应使用 `create_task_relation` 声明；查询任务时可用 `get_task_relations` 查看依赖。

**Rationale**: 让 pi-agent 主动识别并声明依赖，而非仅被动响应。

### Decision 4: 角色 agent 模板与 skill 增加依赖指导

`AGENTS.md` 与 `claim-task` skill 增加：创建后续任务时，若与已有任务存在依赖关系，使用 `create_task_relation` 声明（`subtask` / `blocks` / `related`）。

**Rationale**: 让角色 agent 在创建后续任务时建立依赖，使甘特图反映真实任务关系。

### Decision 5: 依赖参数校验与回滚

`create_task` 的依赖参数在创建任务后逐个建立关系。若任一关系建立失败（如目标任务不存在、跨团队、重复），则删除已建立的关系并返回错误，保证不产生半成品依赖。

**Rationale**: 保证依赖声明的原子性，避免任务存在但依赖缺失或部分建立。

## Risks / Trade-offs

- **依赖参数增加 create_task 复杂度**: 通过可选参数 + 失败回滚控制，不破坏现有调用。
- **对话工具与 MCP 工具重复**: 两者都调用同一控制器，逻辑单一来源，仅工具定义不同。
- **依赖关系跨团队**: 复用 `createTaskRelation` 的团队校验，跨团队依赖被拒绝。
