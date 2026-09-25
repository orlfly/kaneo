## Context

Kaneo 平台已有 agent 工作目录基础设施（`apps/api/src/agent/`），支持克隆仓库、读写文件、执行命令。pi-agent 可以通过 chat 工具创建任务。任务有 `requiredRole` 字段标记需要的 agent 角色。API 有 claim-task / claim-next-task 端点供外部 agent 通过 API key 认领匹配角色的任务。

当前缺失：项目仓库中没有 AGENTS.md 角色定义文件，外部 code agent（如 OpenCode）没有明确的角色行为规范。也没有通用的 skills 来指导跨角色共享工作流。安装这些配置到项目工作目录是一个手动过程。

## Goals / Non-Goals

**Goals:**
- 为 7 个 `requiredRole` 各提供一份 AGENTS.md 角色定义，包含职责、工具权限、工作规范
- 提供一组通用 skills（SKILL.md），覆盖仓库同步、代码搜索、测试运行、PR 提交等共享工作流
- 提供安装脚本，将角色定义 + skills + opencode.jsonc 配置安装到项目 agent 工作目录
- API 端点暴露配置状态，前端可查看安装情况

**Non-Goals:**
- 不实现外部 code agent 的自动调度循环（agent poll loop / runner）
- 不修改 pi-agent 的 chat 工具或 system prompt
- 不引入新的 agent 执行引擎
- 不修改 claim-task 的匹配逻辑
- 不实现 skills 的热加载或运行时更新

## Decisions

### Decision 1: 角色定义文件存储在 API 包内，作为模板

角色定义和 skills 模板存储在 `apps/api/src/agent/agents/templates/` 目录下，作为 API 的一部分打包。安装时从模板目录复制到项目工作目录的 `.opencode/agents/` 和 `.opencode/skills/` 中。

**Rationale**: 模板与 API 版本绑定，确保角色定义随平台升级而更新。不依赖外部文件系统路径。

**Alternative**: 存储在数据库中按实例配置 → 过度复杂，模板更新困难。

### Decision 2: opencode.jsonc 由安装脚本动态生成

安装脚本根据项目已有的 VCS 集成情况生成 `opencode.jsonc`，注册 7 个角色的 subagent，链接 skills 路径，配置权限。

**Rationale**: 不同项目的 VCS 集成不同（GitHub/GitLab/Gitea），opencode 配置需要适配。动态生成比静态模板更灵活。

**Alternative**: 提供固定模板 → 无法适配不同项目的 MCP 配置需求。

### Decision 3: 配置通过下载包分发，用户手动执行安装脚本

配置以 zip 包形式通过 `GET /api/agent/agents-config/download` 端点下载。zip 包含角色定义、skills、各 agent 的配置文件（opencode.jsonc / CLAUDE.md / AGENTS.md）和一个 `install.sh` 脚本。用户下载后解压到目标目录，手动执行 `./install.sh` 完成安装。

**Rationale**: 用户希望控制配置安装到哪个目录，而不是由后端强制写入服务器目录。下载包方式让用户自主决定安装位置，脚本负责将文件复制到对应 agent 的目录结构。

**Alternative**: 后端直接写入服务器目录 → 用户无法控制安装位置，且服务器可能无法访问目标目录。

### Decision 3b: 安装脚本适配三种 agent

`install.sh` 支持三种 agent：**opencode**、**claude code**、**codex**。脚本通过 `--agent` 参数指定目标 agent，或自动检测当前目录已存在的 agent 配置目录（`.opencode/`、`.claude/`、`.codex/`）来决定安装目标。三种 agent 的目录结构：

- **opencode**: `.opencode/agents/<role>/AGENTS.md` + `.opencode/skills/<skill>/SKILL.md` + `opencode.jsonc`
- **claude code**: `.claude/agents/<role>.md` + `.claude/skills/<skill>/SKILL.md` + `CLAUDE.md`
- **codex**: `.codex/agents/<role>.md` + `.codex/skills/<skill>/SKILL.md` + `AGENTS.md`

**Rationale**: 三种 agent 使用不同的配置目录和文件格式，安装脚本需要分别处理。角色定义（AGENTS.md）和 skills（SKILL.md）是通用的，只是安装位置不同。

**Alternative**: 只支持 opencode → 无法满足用户对 claude code 和 codex 的需求。

### Decision 4: AGENTS.md 角色定义使用中文 + 英文双语

角色定义文件使用中文描述（贴合团队习惯），关键术语保留英文（如 tool names、命令名）。

**Rationale**: 目标用户是中文团队。agent 模型能理解中英混合。

### Decision 5: Skills 使用 SKILL.md 格式（OpenCode 兼容）

每个 skill 是一个目录，包含 `SKILL.md` 文件，遵循 OpenCode 的 skill 发现约定（`**/SKILL.md` 递归扫描）。

**Rationale**: 与 OpenCode 的 skill 机制兼容，无需额外解析逻辑。

## Risks / Trade-offs

- **模板版本不一致**: 项目安装后模板更新需手动触发重新安装 → 安装端点支持 force 覆盖，前端显示版本号
- **角色定义可能与项目特定需求冲突**: 角色定义是通用的，项目可能需要定制 → AGENTS.md 安装后可被项目自行修改，重新安装时提示覆盖确认
- **opencode.jsonc 覆盖风险**: 项目可能有自定义 opencode.jsonc → 安装时检查文件是否存在，已存在则备份后覆盖
- **安全**: 安装脚本写入工作目录的文件可能被恶意修改 → 文件在 agent 沙箱目录内，受现有路径安全约束保护