## Why

pi-agent 在对话里反馈自己「没有克隆 Git 仓库、读取/搜索项目文件、运行代码、分析源码」的能力。它只能读任务数据、查 MR 列表。这意味着 pi-agent 对项目真正的代码/仓库内容是盲的：无法阅读源码、无法看文档、无法跑脚本验证，很多研发类提问只能靠猜。团队需要一个能访问项目代码的 agent。

## What Changes

- 为每个 Kaneo 项目提供一个**服务端工作目录**（`agent` 工作区），pi-agent 可在其中读、写、列目录、搜索文件。
- 新增 `agent` 文件工具集（在对话工具 `apps/api/src/chat/tools.ts` 注册，也同步到 MCP 工具）：
  - `agent_list_files`：列工作目录（或子目录）
  - `agent_read_file`：读取文件内容（文本，带行号可选）
  - `agent_write_file`：写入/创建文件（限制在工作目录内）
  - `agent_search_files`：按文件名 / 内容关键词递归搜索（含忽略规则：node_modules、.git 等）
  - `agent_delete_file`：删除工作目录内文件
- 新增**代码版本管理能力**：`agent_clone_repo`——解析项目已激活的 VCS 集成（GitHub/GitLab/Gitea）配置，把仓库克隆到工作目录；重复调用时检查已有克隆并 `git pull` 更新。
- 新增**运行能力**：`agent_run_command`（或 `agent_run_script`）——在工作目录内以指定 shell 运行命令，返回 stdout/stderr/exit code，带超时与输出大小上限。
- 对话中支持**文件上传**：Web Chat 输入框增加附件按钮，上传文件落入工作目录（`uploads/`），pi-agent 可读取分析。
- 所有文件操作严格限制在项目的 `agent` 工作目录内（路径规范化 + 前缀校验，防目录穿越）。
- 新增配置项：工作目录根路径（默认 `<data>/agent-workdir`）、是否启用命令执行、命令超时。

## Capabilities

### New Capabilities
- `agent-working-dir`: pi-agent 的每项目服务端工作目录与文件操作（列/读/写/搜索/删除），以及对话中文件上传
- `agent-code-capability`: 克隆项目已激活的 VCS 仓库到工作目录、读取/分析源码与文档、在工作目录内运行命令/脚本（带超时与沙箱约束）

### Modified Capabilities
- `project-chat`: 在现有对话工具集基础上增加 agent 文件/克隆/命令工具；对话输入框支持文件上传

## Impact

- `apps/api/src/chat/tools.ts`：注册 agent 文件/克隆/命令工具并实现
- 新增 `apps/api/src/agent/` 模块：工作目录路径解析、沙箱/路径校验、git clone 封装、命令执行封装（超时/输出上限/仅限工作目录）
- `apps/api/src/database/schema.ts` + 迁移：`chat_config` 增加 `workdirRoot`、`enableCommandExecution`、`commandTimeoutMs` 字段（或独立 agent_config 表）
- `apps/api/src/chat/controllers/send-message.ts`：工具执行注入工作目录路径；上传端点
- 新增上传端点（`/api/chat/project/:projectId/upload`）与 Web 上传按钮
- `apps/api/src/vcs/resolve.ts`：`resolveVcsIntegration` 供克隆复用（GitLab/Gitea 的 baseUrl+token、GitHub 的 App）
- 新增 `isomorphic-git` 或运行时安装 `git`（见 design 权衡）
- Web：`chat-panel.tsx` 增加上传按钮与附件展示
- `i18n`：新增 `chat` 上传与工具相关文案
- 测试：文件操作沙箱/路径穿越、clone、命令执行（mock git）、上传
