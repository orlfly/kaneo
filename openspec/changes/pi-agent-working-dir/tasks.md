# 实现任务（pi-agent 工作目录 + 代码能力）

## 1. 运行时与依赖

- [x] 1.1 `apps/api` 安装 `isomorphic-git`（纯 JS，生产镜像无需 git binary）
- [x] 1.2 确认 `isomorphic-git` 在 Node 20 下可用、`pnpm install` 后 lockfile 更新

## 2. 工作目录与路径沙箱

- [x] 2.1 新增 `apps/api/src/agent/` 模块，导出 `defaultWorkdirRoot()`（读 `chat_config.workdirRoot`，默认 `<cwd>/data/agent-workdir`）
- [x] 2.2 新增 `projectWorkdir(workdirRoot, projectId)`：`<root>/agent-<projectId>`，首次使用时 `mkdir -p`（递归）
- [x] 2.3 新增 `resolveInProject(projectRoot, rel)` 路径工具：`path.resolve` + `path.relative` 校验（必须落在 root 内），供所有文件工具共用
- [x] 2.4 单测：正常路径、`../` 穿越、绝对路径均被拒绝；root 本身（`.`）放行

## 3. 文件操作工具（对话工具集）

- [x] 3.1 在 `apps/api/src/chat/tools.ts` 注册并实现 `agent_list_files`
- [x] 3.2 注册并实现 `agent_read_file`（maxBytes 默认 50KB，offset/limit 分页，截断注明）
- [x] 3.3 注册并实现 `agent_write_file`（创建/覆盖，递归建父目录，仅限项目目录）
- [x] 3.4 注册并实现 `agent_search_files`（按文件名 + 内容关键词递归，忽略 `.git`/`node_modules`，返回文件+行号）
- [x] 3.5 注册并实现 `agent_delete_file`
- [x] 3.6 单测：每工具的正常路径 + 越界拒绝 + 不存在报错

## 4. 克隆能力

- [x] 4.1 注册并实现 `agent_clone_repo`：用 `resolveVcsIntegration` 解析激活集成
- [x] 4.2 构造克隆 URL（GitLab/Gitea `${baseUrl}/${owner}/${name}.git`；GitHub `https://github.com/${owner}/${name}.git`）
- [x] 4.3 用 `isomorphic-git` 浅克隆（depth 1、singleBranch）到 `<project>/repo`，`onAuth` 注入 token
- [x] 4.4 已存在克隆时改为 `git.pull`（刷新）而非失败
- [x] 4.5 无激活集成时返回友好错误

## 5. 命令执行

- [x] 5.1 注册并实现 `agent_run_command`：`child_process.spawn("/bin/sh", ["-c", command], { cwd })`
- [x] 5.2 输出收集（上限 256KB，截断注明），默认超时 60s（可配），超时 `SIGKILL`，返回 `{ stdout, stderr, exitCode, timedOut }`
- [x] 5.3 用 `enableCommandExecution` 门控：默认关闭，关闭时返回「命令执行未启用」

## 6. 配置存储与迁移

- [x] 6.1 `chat_config` 表新增 `workdir_root`、`enable_command_execution`、`command_timeout_ms` 列
- [x] 6.2 生成迁移 `0048_add_chat_agent_config.sql`，更新 drizzle journal
- [x] 6.3 `apps/api/src/chat/config.ts` 扩展 `ChatConfig` 类型与 load/save，暴露新字段；config API/validator 同步

## 7. 文件上传

- [x] 7.1 新增 `POST /api/chat/project/:projectId/upload`（受 `teamAccess` + `requireTeamRole` 保护）
- [x] 7.2 校验大小上限（默认 1MB）与 MIME 白名单，落盘到 `<project>/uploads/`，返回相对路径
- [x] 7.3 Web `chat-panel.tsx` 加附件按钮：先上传再写入消息引用上传路径
- [x] 7.4 上传 fetcher `uploadChatFile` 与 base64 编码

## 8. MCP 镜像注册（可选/后续）

- [ ] 8.1 在 `apps/api/src/mcp/tools.ts`（modern）镜像注册 agent 工具（走对话工具同一实现）
- [ ] 8.2 在 `packages/mcp/src/tools/register.ts`（legacy）镜像注册
- [ ] 8.3 更新 MCP/对话工具清单测试

## 9. i18n 与文档

- [x] 9.1 `i18n/en-US.json` 新增 `chat` attachFile/fileUploaded/uploadError 文案
- [x] 9.2 `i18n/check --fix` 同步 16 个 locale
- [ ] 9.3 更新 `apps/docs/core/functional/chat-with-ai-assistant.mdx`：说明新能力与安全注意

## 10. 验证收尾

- [x] 10.1 API typecheck、agent+chat 测试全绿；受影响文件 biome 干净
- [ ] 10.2 端到端（本地内网 GitLab）：`agent_clone_repo` 克隆 `ki-agent-v2` → `agent_search_files` 搜索 → `agent_read_file` 读源码 → 上传文件
- [ ] 10.3 明确记录：生产容器默认无持久卷，工作目录在容器本地；`enableCommandExecution` 默认关闭
