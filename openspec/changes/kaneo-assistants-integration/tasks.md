# Tasks: kaneo-assistants-integration

## 1. Kaneo 客户端模块

- [x] 1.1 实现 `fetchKaneoTemplates(baseUrl, apiKey)`：调用 `GET /api/agent/agents-config/templates`，区分 unreachable / 401 / 形状不符三类错误
- [x] 1.2 实现 `fetchKaneoConfigZip(baseUrl, apiKey)`：下载 zip 并解包为 `{ roles: Record<role, {agentsMd: string}>, skills: Record<name, {skillMd: string, files: File[]}> }`
- [x] 1.3 单元测试：zip 解包映射（roles/skills 路径约定）、错误分类、API key 不进入任何返回的数据结构

## 2. Skill 转换与导入

- [x] 2.1 实现 `importKaneoSkills(skills)`：按 `kaneo-<skill>` 命名写入 AionUi custom skills（复用 skills import IPC），已存在则覆盖
- [x] 2.2 实现 `skillsForRole(role)`：优先使用 templates 响应的 `forRoles` 字段，zip 直导时回退解析 SKILL.md frontmatter（语义一致：缺省/空 = 通用），返回该角色应启用的 skill 名列表
- [x] 2.3 单元测试：frontmatter 解析（有/无/空 for_roles）、覆盖导入幂等、skill 文件随包带入

## 3. Assistant 同步

- [x] 3.1 实现认领 prompt 模板生成（按角色名渲染，引用 kaneo-claim-task skill 与 KANEO_API_URL 约定）
- [x] 3.2 实现 `syncKaneoAssistants(baseUrl, selection)`：按 `Kaneo · <role>` upsert（create 或 update context/prompts/custom_skill_names），逐角色 try/catch 收集结果
- [x] 3.3 实现同步结果报告：per-role 成功/失败 + 重试单个角色的路径
- [x] 3.4 单元测试：新建 vs 更新分支、非 Kaneo 命名的 assistant 不被触碰、部分失败不影响其余角色、API key 不出现在任何 assistant 字段

## 4. UI 入口

- [x] 4.1 assistants 管理页新增 "从 Kaneo 导入" 入口按钮
- [x] 4.2 连接表单：base URL + API key（可选记住 base URL），连接后展示角色多选与 skill 概览（数量 + 名称）
- [x] 4.3 同步进行中状态、结果报告视图（成功列表 + 失败重试按钮）
- [x] 4.4 i18n：新增全部用户可见文案的 en-US 与 zh-CN key，并跑 i18n 校验脚本

## 5. 验证

- [x] 5.1 集成测试：对本地 Kaneo 实例跑一次完整同步（7 角色全选），断言 7 个 assistant 创建、context 含 AGENTS.md 正文、skill 启用符合 for_roles
- [x] 5.2 幂等测试：同一实例二次同步，断言 update 而非 duplicate（assistant 总数不变）
- [ ] 5.3 手动冒烟：在 AionUi 中用同步出的 "Kaneo · coding" assistant 发起一次认领对话，确认 context 与 skill 生效
