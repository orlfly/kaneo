## Why

pi-agent 和各任务执行 agent 在创建新任务时，无法声明新任务与已有任务之间的关系。Kaneo 平台本身已经具备任务依赖关系管理（`task_relation` 表，支持 `subtask` / `blocks` / `related` 三种关系）和甘特图显示，但 agent 侧的能力是缺失的：

- **对话 agent（pi-agent）**：`apps/api/src/chat/tools.ts` 的工具集里没有任务关系工具，无法在创建任务时建立依赖，也无法查询/删除已有关系。
- **MCP 工具**：虽然已有 `create_task_relation` / `get_task_relations` / `delete_task_relation`，但 `create_task` 不接受依赖参数，agent 无法在创建任务的同时声明其与已有任务的关系。
- **角色 agent 模板与 skill**：`AGENTS.md` 和 `claim-task` skill 没有指导 agent 在创建后续任务时声明依赖关系。

结果：agent 创建的任务彼此孤立，甘特图和依赖视图无法反映真实的任务先后关系，任务执行 agent 无法识别"前置任务"或"阻塞关系"。

## What Changes

- 为对话 agent（pi-agent）新增任务关系工具，与 MCP 工具对齐：
  - `create_task_relation`：在两个任务之间建立关系（`subtask` / `blocks` / `related`）
  - `get_task_relations`：查询某个任务的所有关系
  - `delete_task_relation`：删除一个关系
- 扩展 `create_task`（对话工具与 MCP 工具）接受可选的依赖/关系参数，使 agent 能在创建任务的同时声明其与已有任务的关系。
- 更新 pi-agent 系统提示词，指导其在创建任务时识别并声明任务依赖关系。
- 更新角色 agent 模板（`AGENTS.md`）与 `claim-task` skill，指导 agent 在创建后续任务时建立依赖关系。
- 新增/更新测试覆盖 agent 任务关系管理能力。

## Capabilities

### New Capabilities

- `agent-task-dependency-management`: agent（pi-agent 与角色 agent）创建、查询、删除任务依赖关系的能力，以及在创建任务时声明依赖

### Modified Capabilities

- `project-chat`: 对话工具集新增任务关系工具；`create_task` 支持依赖参数；系统提示词指导建立依赖
- `agent-roles`: 角色 agent 模板与 `claim-task` skill 增加任务依赖管理指导

## Impact

- **对话工具**: `apps/api/src/chat/tools.ts` 新增任务关系工具并扩展 `create_task`
- **系统提示词**: `apps/api/src/chat/controllers/send-message.ts` 的 `buildSystemPrompt` 增加依赖管理指导
- **MCP 工具**: `apps/api/src/mcp/tools.ts` 的 `create_task` 增加依赖参数
- **角色模板**: `apps/api/src/agent/agents/templates/roles/*/AGENTS.md` 与 `skills/claim-task/SKILL.md` 增加依赖管理指导
- **测试**: 新增对话工具与 MCP 工具的任务关系测试
