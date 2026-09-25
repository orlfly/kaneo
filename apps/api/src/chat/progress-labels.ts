// Short, user-visible labels for the progress events emitted while pi-agent is
// making tool calls. Only the tool name reaches the client; arguments and
// results stay on the server. Keep labels short, present-tense, and in the
// same locale as the rest of the chat UI so the chat panel can render them
// verbatim without an extra translation layer.

const PROGRESS_LABELS: Record<string, string> = {
  list_tasks: "正在查询任务列表",
  get_task: "正在查看任务详情",
  create_task: "正在创建任务",
  create_task_relation: "正在建立任务关系",
  get_task_relations: "正在查询任务关系",
  delete_task_relation: "正在删除任务关系",
  update_task_status: "正在更新任务状态",
  get_project_summary: "正在汇总项目状态",
  list_blocked_tasks: "正在查看阻塞任务",
  list_merge_requests: "正在查询合并请求",
  agent_clone_repo: "正在克隆代码仓库",
  agent_list_files: "正在浏览工作目录",
  agent_read_file: "正在读取文件",
  agent_write_file: "正在写入文件",
  agent_search_files: "正在搜索文件",
  agent_delete_file: "正在删除文件",
  agent_run_command: "正在执行命令",
};

const FALLBACK_PROGRESS_LABEL = "正在处理";

export function progressLabelFor(toolName: string): string {
  return PROGRESS_LABELS[toolName] ?? FALLBACK_PROGRESS_LABEL;
}

export function knownProgressToolNames(): readonly string[] {
  return Object.keys(PROGRESS_LABELS);
}
