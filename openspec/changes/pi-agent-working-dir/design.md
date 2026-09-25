## Context

pi-agent 目前的对话工具集（`apps/api/src/chat/tools.ts`）只覆盖项目数据：任务（list/get/create/summary/blocked）和 MR（`list_merge_requests`）。用户实测反馈它「没有克隆 Git 仓库、读取/搜索项目文件、运行代码、分析源码」的能力，对项目实际代码是盲的。

Kaneo 已有可复用的能力：

- `apps/api/src/vcs/resolve.ts` 提供 `resolveVcsIntegration(projectId, type)`：解析项目激活的 GitHub/GitLab/Gitea 集成配置（GitLab/Gitea 有 `baseUrl + accessToken + repositoryOwner + repositoryName`；GitHub 用 App installation）。
- `gitlabFetch` / `giteaFetch` / `getInstallationOctokit` 已封装鉴权、SSRF 守卫（`assertPublicDestination`）和超时。
- `chat_config` 表存 pi-agent 配置（启用、baseUrl、加密 apiKey、model），已有加密工具 `encryptSecret/decryptSecret`。
- 对话工具在服务端 `executeTool()` 内执行，继承当前用户的项目/团队权限。

运行时约束（关键）：

- **生产 API 镜像（`apps/api/Dockerfile` runtime 阶段）是 `node:20-alpine`，只装了 Python/gcc，没有 `git` 二进制**。不能用 `child_process` 调 `git` 完成克隆，否则生产跑不起来。
- 运行时以非 root `appuser` 运行，`/app/apps/api/data` 已创建并 chown 给 appuser。生产没有为工作目录挂持久卷（当前用 DB 存数据），工作目录默认落在容器本地文件系统（`<data>/agent-workdir`），跨重启不保证保留；需要持久化时由 Helm 挂卷（见 Risks）。
- Node 20 有内置 `fetch`、`fs/promises`、`child_process`、`crypto`。

## Goals / Non-Goals

**Goals:**

- 给 pi-agent 一个服务端工作目录，可读/写/列/搜索/删除文件。
- 能克隆项目已激活 VCS 仓库到工作目录，读取/分析源码与文档。
- 能在工作目录内运行命令/脚本（带超时、输出上限、仅限工作目录的沙箱约束）。
- 对话中支持文件上传，落盘到工作目录供 pi-agent 分析。
- 文件操作严格限制在项目工作目录内，杜绝目录穿越。

**Non-Goals:**

- 不做多 agent 并发写同一工作目录的复杂锁（单用户驱动，先加简单互斥）。
- 不做工作目录的跨节点分布式同步（单实例先行）。
- 不做跨项目的全局文件访问。
- 不在本改动内实现 git push/创建 MR 等"写回仓库"（只克隆、读、分析；写回留给后续）。
- 不实现任意系统命令执行——命令只在工作目录内、带白名单/超时，且默认需配置启用。

## Decisions

### 1. 运行时用 `isomorphic-git` 而非系统 `git`

**选择**: 用 `isomorphic-git`（纯 JS 实现，Node 原生支持）做克隆/拉取，不依赖运行时安装 git binary。
**理由**: 生产 runtime 镜像是 `node:20-alpine`，没有 git binary。加 git 进镜像要改 Dockerfile（增层、增镜像体积）；`isomorphic-git` 是纯 JS，直接 `pnpm add` 即可，能用 HTTP(S) 克隆 GitLab/Gitea/GitHub 公开与私有仓库，支持凭证（`onAuth` 回调注入 token）。
**替代**: 系统 `git clone`（需改 Dockerfile，且要处理镜像里 git 的 CA 证书）、`dugite`（依赖编译，重）。`isomorphic-git` 最贴合「纯 Node + 少运维」约束。

### 2. 工作目录根：每项目 `agent/<projectId>/`，根路径可配

**选择**: 配置一个工作区根（默认 `<data>/agent-workdir`），每个项目在根下用 `agent-<projectId>/` 目录隔离。文件工具只允许在该项目目录内操作。
**理由**: 单根 + 项目子目录便于统一授权与清理；根路径放进 `chat_config`（或独立 agent 配置）便于管理员改位置（例如挂到持久卷）。
**路径沙箱**: 所有用户/工具提供的相对路径先 `path.normalize()` + `path.resolve()` 到项目根，再用 `path.relative(projectRoot, resolved)` 校验不以 `..` 开头且不 escape。写文件同理。

### 3. 命令执行：`child_process.spawn` + 超时 + 输出上限，默认关闭

**选择**: `agent_run_command` 用 `child_process.spawn(shell, ['-c', cmd], { cwd: projectWorkdir })`，收集 stdout/stderr 到 Buffer（上限如 256KB），超时（默认 60s，可配）后 `SIGKILL`，返回 `{ stdout, stderr, exitCode, timedOut }`。
**理由**: 这是让 pi-agent "运行代码/脚本"的最小可靠实现。`spawn` 不缓冲大输出（相对 `exec`），配合上限和超时可防失控。
**安全**: 命令只允许 `cwd` 在工作目录内；命令内容本身是用户/pi-agent 提供的，等同用户在项目环境执行脚本——这与 `agent_write_file` 后让 agent 运行是一致的信任模型。默认 `enableCommandExecution=false`，管理员开。

### 3. 克隆复用 `resolveVcsIntegration`，凭证经 `isomorphic-git` onAuth 注入

**选择**: `agent_clone_repo` 调 `resolveVcsIntegration(projectId, type)` 拿到 config，构造克隆 URL（GitLab/Gitea：`${baseUrl}/${owner}/${name}.git`；GitHub：`https://github.com/${owner}/${name}.git`），用 `isomorphic-git` 的 `clone`（`onAuth` 注入 token）到工作目录 `repo/` 子目录。已存在则 `git.pull`。
**理由**: 复用既有 SSRF 守卫与配置解析，凭证不进工具参数/上下文（沿用 VCS 设计原则）。私有仓库用集成 token 认证；公开仓库无需。
**注意**: `isomorphic-git` 的 HTTP 请求也要走 `assertPublicDestination`（GitLab/Gitea 内网集成场景）——统一在工作目录/克隆封装里对 URL host 做 SSRF 校验，复用 `assert-public-destination.ts`。

### 4. 工具注册位置：对话工具 + 同步 MCP 工具

**选择**: agent 文件/克隆/命令工具在 `apps/api/src/chat/tools.ts` 注册（供 Chat 对话），同时按既有模式在 `apps/api/src/mcp/tools.ts`（modern）与 `packages/mcp/src/tools/register.ts`（legacy）镜像注册，保持一致。
**理由**: pi-agent 通过对话工具执行；但同一套 VCS/文件能力也应可供 MCP 客户端（Claude Code 等）调用。沿用双 registrar 同步既有约定。

### 5. 配置存储

**选择**: 在 `chat_config` 行（单例）增列：`workdirRoot`（text，默认空→用 `<data>/agent-workdir`）、`enableCommandExecution`（boolean 默认 false）、`commandTimeoutMs`（int 默认 60000）。
**理由**: 与 pi-agent 配置同处一行，天然随实例生效，复用现有 config API/加密。无需新建表。
**迁移**: drizzle 生成 `ALTER TABLE chat_config ADD COLUMN ...`。

### 6. 文件上传

**选择**: 新增 `POST /api/chat/project/:projectId/upload`（受 `teamAccess` 保护），multipart/form-data 或 base64 JSON 上传，落盘到项目工作区 `uploads/`，返回相对路径；pi-agent 可用 `agent_read_file` 读取。
**理由**: 满足"对话中能上传文件给 pi-agent"。复用 `decodeAvatarUpload` 式校验思路（MIME/大小上限），但对文本/文档放宽到常见类型并做大小上限（如 10MB）。
**Web**: `chat-panel.tsx` 输入框旁加附件按钮，选择后先上传再随消息发送；消息中引用上传文件的相对路径。

## Risks / Trade-offs

- **[Risk] 生产容器无持久卷，工作目录跨重启丢失** → **Mitigation**: 默认根在容器内；文档与配置支持把 `workdirRoot` 指向挂载的持久卷（Helm 可加一个 emptyDir 或 PVC）。克隆的仓库丢失后可让 agent 重新 clone。这是「代码分析」类特性可接受的折衷；如需强持久化，后续给 charts 加 PVC。
- **[Risk] `isomorphic-git` 对超大仓库慢** → **Mitigation**: clone 只取默认分支 + 浅克隆（`depth: 1`，`singleBranch`），够分析源码用，显著减少耗时/磁盘。
- **[Risk] 命令执行被滥用（命令注入/逃逸）** → **Mitigation**: 命令沙箱仅在项目目录内运行；默认关闭 `enableCommandExecution`；有超时+输出上限；且命令由当前用户授权的会话触发，与"运行测试脚本"等价。若担心任意命令，可在后续加命令白名单。文档需明示启用该能力的运维风险。
- **[Risk] 路径穿越/读任意文件** → **Mitigation**: 集中一个 `resolveInProject(projectRoot, rel)` 工具做 normalize+resolve+prefix 校验，所有文件工具共用，绝不直接 join 用户路径。
- **[Risk] 工具参数巨大（整个文件内容进模型上下文）** → **Mitigation**: `agent_read_file` 提供 `maxBytes`（默认如 50KB）+ 可选 `offset/limit` 分页；搜索只返回匹配行/文件名，不整读。
- **[Risk] 并发 / 破坏性**：`agent_delete_file` 可能误删** → **Mitigation**: 只允许删工作目录内文件；工具结果明确标注删除路径；不在本阶段加回收站（纳入后续）。

## Migration

- `chat_config` 加 3 列（workdir_root / enable_command_execution / command_timeout_ms），生成并检查 SQL。
- 无需数据迁移；默认值保证存量实例行为不变（命令执行仍关闭、工作目录用默认根）。

## Open Questions

- 上传文件上限与允许类型（先定 1MB、常见文本/压缩/图片类型，后续可放宽）。
- 是否要给命令执行加「危险命令黑名单」（rm -rf、dd 等）——当前靠沙箱目录 + 默认关闭兜底，若要求更严再加。
