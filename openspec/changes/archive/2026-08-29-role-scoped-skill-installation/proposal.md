## Why

当前 `install.sh` 安装脚本为每个角色（agent persona）安装**所有** skills，无论该角色是否需要这些 skills。结果是一个 `ui-design` persona 也获得了 `submit-pr`，而它的工作流定义明确禁止提交代码；`product-design` persona 没有专门的 PRD 编写 skill，只能用 `claim-task` 凭直觉产出需求文档。

更深层的问题：**当前 5 个 skills 全部面向编码流程**，没有为 4 个非编码角色（product-design、architecture-design、ui-design、code-review）提供专属技能。devops 和 testing 角色也只有部分覆盖。这导致非编码角色要么无法按照规范工作，要么被迫使用不属于其职责范围的 skill。

## What Changes

- **SKILL.md 元数据扩展**：每个 SKILL.md 顶部添加 frontmatter 声明该 skill 适用的角色列表（如 `for_roles: [coding, testing]`），未列出的角色不得使用此 skill
- **新增 6 个角色专属 skills**：为 product-design、architecture-design、ui-design、devops、testing、code-review 各添加一个专属 skill，覆盖其核心交付物
- **安装脚本按角色筛选**：修改 `install.sh`，只安装该角色 persona 对应的 skills（通过 `for_roles` 字段匹配）
- **Skill 重新分类**：将 11 个 skills 重新分配到合适的角色范围：
  - `claim-task`: 所有 7 个角色（核心交互）
  - `code-search`: coding, testing, code-review（需要查看代码）
  - `repo-sync`: coding, devops, testing（需要操作仓库）
  - `run-tests`: coding, testing（需要跑测试）
  - `submit-pr`: coding, testing, devops（提交代码或配置变更）
  - `write-prd`: product-design（产品需求文档）
  - `write-adr`: architecture-design（架构决策记录）
  - `write-design-spec`: ui-design（组件规格 + design tokens）
  - `write-iac`: devops（Dockerfile / Helm / CI）
  - `write-test-suite`: testing（编写测试用例）
  - `review-pr`: code-review（结构化 PR 评审）
- **新 API 端点**：在 templates 响应中按角色返回 skill 列表，前端可基于角色选择下载内容
- **打包逻辑调整**：`buildAgentConfigZip` 现在接受角色列表参数（默认所有），只打包选中角色的 skills

## Capabilities

### New Capabilities

- `role-scoped-skill-installation`: 按角色限定 SKILL.md 的适用范围，安装脚本只安装与所选 persona 角色匹配的 skills

### Modified Capabilities

- `install-role-persona`: 安装行为从"随角色安装全部 skills"扩展为"按角色范围筛选安装 skills"

## Impact

- **新增文件**（6 个角色专属 SKILL.md）：
  - `apps/api/src/agent/agents/templates/skills/write-prd/SKILL.md` — product-design 专属
  - `apps/api/src/agent/agents/templates/skills/write-adr/SKILL.md` — architecture-design 专属
  - `apps/api/src/agent/agents/templates/skills/write-design-spec/SKILL.md` — ui-design 专属
  - `apps/api/src/agent/agents/templates/skills/write-iac/SKILL.md` — devops 专属
  - `apps/api/src/agent/agents/templates/skills/write-test-suite/SKILL.md` — testing 专属
  - `apps/api/src/agent/agents/templates/skills/review-pr/SKILL.md` — code-review 专属
- **修改文件**：
  - 5 个现有 SKILL.md 添加 frontmatter 元数据
  - `submit-pr/SKILL.md` frontmatter 调整为 `[coding, testing, devops]`
  - `apps/api/src/agent/agents/install.sh.template`：筛选 skills 安装逻辑
  - `apps/api/src/agent/agents/package.ts`：接受角色参数，按角色打包 skills
  - `apps/api/src/agent/agents/index.ts`：下载端点支持 `?role=` 查询参数
  - `apps/api/src/agent/agents/templates.ts`：新增 `listSkillsForRole(role)` 函数和 `parseSkillFrontmatter()` 解析器
- **API 行为变化**：
  - `GET /api/agent/agents-config/download?role=coding` 只打包 `coding` 角色对应的 5 个 skills
  - `GET /api/agent/agents-config/download?role=product-design` 只打包 2 个 skills（claim-task + write-prd）
  - `GET /api/agent/agents-config/download?role=ui-design` 只打包 2 个 skills（claim-task + write-design-spec）
  - 前端"Agent 配置"面板可按角色过滤 skill 列表
- **破坏性变更**：无（默认行为仍是安装所有 skills，未传 `?role=` 时打包全部）