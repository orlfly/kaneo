## Why

现阶段 agent API key 只声明了 `agentRole`，没有作用域约束。当同一个用户加入多个 team、或 team 下有多个项目时，`claim_next_task` 会在用户全部 team 的全部项目里找任务，agent 会话可能先后领到两个不同项目的任务，造成明显的上下文污染（混入无关仓库、无关业务域的指令与记忆）。用户、团队、项目与 agent 角色的管理需要把"一个会话只服务一个项目"变成平台保证，而不是靠 agent 自觉。

## What Changes

- **BREAKING**：agent API key 新增可选的 `metadata.projectId` 绑定；绑定后该 key 的所有任务操作（claim/claim-next、任务读写、状态更新）都限定在该项目内。
- `claim_next_task` 在 key 绑定 projectId 时只在绑定项目内找候选；未绑定时保持现状（用户全部 team 项目）。
- key 验证时校验绑定项目仍然存在（未删除/未归档），项目被删除后 key 自动失效（401/403）。
- 开发者设置创建/编辑 API key 时可选择绑定项目（可选，默认不绑定）。
- MCP 工具描述与 agent 安装配置（install.sh/install.bat 生成的环境与说明）提示 key 的项目作用域。
- 用户、团队、项目管理 UI 中展示 key 的项目绑定关系，避免误配。

## Capabilities

### New Capabilities
- `agent-key-project-scope`: agent API key 与项目的绑定、验证时的作用域解析、失效行为，以及创建/编辑入口。

### Modified Capabilities
- `agent-roles`: `claim-next` 与角色匹配规则需要叠加项目作用域过滤；MCP `claim_next_task` 描述需说明项目绑定语义。