# enhance-pm-ui-skills

## Purpose

把 6 个公开上游 SKILL.md（来自 affaan-m/ECC 仓库 MIT 与 anthropics/skills 仓库 Apache 2.0）并入 Kaneo skill 树，使 product-design 与 ui-design 角色获得**前置**（产品诊断、能力契约、验收标准）与**后置**（设计方向、UI 打磨、无障碍）能力。

## Requirements

### Requirement: SKILL.md 数量与归属

`apps/api/src/agent/agents/templates/skills/` 下 SHALL 增加 6 个 SKILL.md 文件，分别归属 `product-design` 与 `ui-design` 两个角色。

#### Scenario: product-design 获得 3 个新增 skill

- **WHEN** 调用 `listSkillsForRole('product-design')`
- **THEN** 返回的 skill 集合 SHALL 包含 `product-lens`、`product-capability`、`intent-driven-development`，加上原有 `claim-task` 与 `write-prd`，总数为 5

#### Scenario: ui-design 获得 3 个新增 skill

- **WHEN** 调用 `listSkillsForRole('ui-design')`
- **THEN** 返回的 skill 集合 SHALL 包含 `frontend-design`、`make-interfaces-feel-better`、`accessibility`，加上原有 `claim-task` 与 `write-design-spec`，总数为 5

### Requirement: 上游 attribution 保留

每个新增 SKILL.md 的 frontmatter SHALL 保留上游 metadata（`origin`、`license`、`source`），并仅在原 frontmatter 基础上**追加** `for_roles` 字段。

#### Scenario: ECC skill 保留 metadata.origin

- **WHEN** 解析 `product-lens/SKILL.md`
- **THEN** frontmatter SHALL 含 `metadata.origin: ECC` 与 `metadata.source: https://github.com/affaan-m/ECC/...`；另含 `for_roles: [product-design]`

#### Scenario: Anthropic skill 保留 license 字段

- **WHEN** 解析 `frontend-design/SKILL.md`
- **THEN** frontmatter SHALL 含 `license: Complete terms in LICENSE.txt`（上游字段），与 `for_roles: [ui-design]`（新增字段）共存

### Requirement: 现有管线零改动

本次变更 SHALL **不修改** `parseSkillFrontmatter`、`validateRoles`、`skillAppliesToRole`、`listSkillsForRole`、`buildAgentConfigZip`、`/api/agent/agents-config/templates`、`/api/agent/agents-config/download`、`install.sh` 的 awk 解析逻辑。

#### Scenario: parseSkillFrontmatter 对新 SKILL.md 仍返回合法结果

- **WHEN** 对所有 6 个新 SKILL.md 各自调用 `parseSkillFrontmatter(content)`
- **THEN** SHALL 返回非 null，且 `forRoles` 字段值与预期一致

#### Scenario: install.sh 仍能 awk 解析新 frontmatter

- **WHEN** install.sh 在 staging 目录扫描新 SKILL.md 的 frontmatter
- **THEN** awk `BEGIN{p="..."}/^---$/{...}` 块 SHALL 正确识别 6 个新 skill 的 `for_roles` 行，并据此过滤

### Requirement: 其他角色不受影响

`coding`、`architecture-design`、`devops`、`testing`、`code-review` 5 个角色的 skill 集合 SHALL 在本次变更后保持不变。

#### Scenario: 5 个非目标角色的 skill 数不变

- **WHEN** 对 5 个非目标角色调用 `listSkillsForRole(<role>)`
- **THEN** 返回的 skill 数与 `role-scoped-skill-installation` 归档后记录的数量一致（coding=5、architecture-design=2、devops=4、testing=6、code-review=3）

### Requirement: 端到端 install 验证

`install.sh --role product-design --agent opencode` SHALL 实际把 4 个产品向 skill（含原有 + 新增）落到 `.opencode/skills/<name>/` 目录；`install.sh --role ui-design --agent opencode` SHALL 实际把 4 个 UI 向 skill 落盘。

#### Scenario: product-design install 落盘

- **WHEN** 以 `--role product-design --agent opencode` 运行 install.sh 到 `/tmp` 测试目录
- **THEN** SHALL 出现 `.opencode/skills/{claim-task,write-prd,product-lens,product-capability,intent-driven-development}/SKILL.md`

#### Scenario: ui-design install 落盘

- **WHEN** 以 `--role ui-design --agent opencode` 运行 install.sh 到 `/tmp` 测试目录
- **THEN** SHALL 出现 `.opencode/skills/{claim-task,write-design-spec,frontend-design,make-interfaces-feel-better,accessibility}/SKILL.md`