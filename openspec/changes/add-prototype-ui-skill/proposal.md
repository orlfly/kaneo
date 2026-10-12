## Why

Product design 与 UI design 两个 agent 角色目前只能产出 markdown（PRD、设计规格）。团队在写实现之前无法看到界面结构、跳转路径和状态覆盖，评审只能靠文字想象，结构分歧往往拖到编码阶段才暴露。

现状证据：`roles/product-design/AGENTS.md` 的核心产出被限定为需求文档，`roles/ui-design/AGENTS.md` 限定为设计规格；两个角色的技能集里没有任何可视化产物；`openspec/specs/` 全库搜索"原型"零命中。

## What Changes

- 新增技能 `prototype-ui`，`for_roles: [product-design, ui-design]`，定义产物契约：`repo/docs/prototypes/<feature-slug>/index.html` 单文件自包含、离线可开、不联网、不引入构建依赖。
- 明确两个保真度档位与分工：`product-design` 出低保真结构原型（信息架构、导航路径、状态覆盖），`ui-design` 在其页面结构上出高保真视觉原型（design tokens 落地、微交互状态）。
- 明确产物 DONE 标准：覆盖每条用户故事、覆盖 default/empty/loading/error、待决问题在 `README.md` 显式列出。
- 修订 `roles/product-design/AGENTS.md` 与 `roles/ui-design/AGENTS.md`：职责加入原型产出，"允许的操作"显式豁免 `repo/docs/prototypes/**`，禁止事项补上"不得把原型代码搬进应用源码、不得为原型引入 npm 依赖或构建流程"。
- 同步主 specs：`role-scoped-skill-installation`（19 个技能、两个设计角色各 7 个技能、API 过滤场景）、`install-role-persona`（product-design / ui-design 落盘场景）。

## Capabilities

### New Capabilities

- `prototype-ui`: agent 产出可交互 HTML 原型的产物契约、保真度分工、状态覆盖要求与验收标准。

### Modified Capabilities

- `role-scoped-skill-installation`: 技能总数从 18 增至 19；`product-design` 与 `ui-design` 的解析技能集各增加 `prototype-ui`；API 下载过滤与 templates 元数据场景同步。
- `install-role-persona`: 两个设计人格的安装落盘场景补充 `prototype-ui`。

## Impact

- **技能模板**：`apps/api/src/agent/agents/templates/skills/prototype-ui/SKILL.md`（新增）。
- **角色规范**：`apps/api/src/agent/agents/templates/roles/product-design/AGENTS.md`、`apps/api/src/agent/agents/templates/roles/ui-design/AGENTS.md`。
- **API**：无代码改动。`buildAgentConfigZip` / `skillAppliesToRole` / `parseSkillFrontmatter` / `install.sh` 均已支持多角色 `for_roles`，无需修改。
- **数据库**：无迁移。
- **测试**：`tests/api/agent/agents-config.test.ts` 增加三项断言（`forRoles` 精确值、按角色打包的包含/排除、产物契约字符串）。
- **非目标**：不做原型在线预览、不引入截图或浏览器工具、不改动 `coding` 等其他角色的技能集。
