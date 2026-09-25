# Design

## Goal

把 6 个上游公开 SKILL.md 以**最小变动**并入 Kaneo 的 skill 树，使现有角色过滤管线无需改动即可下发给 product-design 与 ui-design。

## Approach

每个新 SKILL.md 满足以下约束：

1. **frontmatter 与现有模板一致**
   ```yaml
   ---
   name: <skill-name>
   description: <与上游一致的 description 字符串>
   for_roles: [<单一角色>]
   metadata:
     origin: <upstream origin>
     license: <license identifier>
     source: <upstream URL>
   ---
   ```
   - `for_roles` 是**新增字段**；其他字段保留上游原值
   - 上游已有的 `metadata` 子对象与 Kaneo 的字段不冲突，保留
   - 不会破坏 `parseSkillFrontmatter`（它只读 `for_roles`）

2. **正文不变**：复制上游 SKILL.md 的 `# ...` 标题下的全部内容

3. **不新增 scripts / assets**：上游 `frontend-design`、`accessibility` 等没有附带脚本；如有 mermaid 图等内联资产，复制

## File Layout

```
apps/api/src/agent/agents/templates/skills/
  ... 已有 11 个 skill ...
  product-lens/SKILL.md              ← 新增
  product-capability/SKILL.md        ← 新增
  intent-driven-development/SKILL.md ← 新增
  frontend-design/SKILL.md           ← 新增
  make-interfaces-feel-better/SKILL.md ← 新增
  accessibility/SKILL.md             ← 新增
```

## Pipeline Impact

| 组件 | 影响 |
|---|---|
| `parseSkillFrontmatter` | 0 改动（仍只解析 `for_roles`） |
| `validateRoles` | 0 改动（仍校验 against 7 个 known roles） |
| `listSkillTemplates` | 自动包含 6 个新文件 |
| `listSkillsForRole('product-design')` | 从 1 → 4（+product-lens, product-capability, intent-driven-development） |
| `listSkillsForRole('ui-design')` | 从 1 → 4（+frontend-design, make-interfaces-feel-better, accessibility） |
| `buildAgentConfigZip(roleFilter?)` | 0 改动；自动通过 `skillAppliesToRole` 过滤 |
| `/api/agent/agents-config/templates` | 自动返回 17 个 skill（11 + 6） |
| `/api/agent/agents-config/download?role=` | 自动按新过滤规则打包 |
| `install.sh` 的 awk frontmatter 解析 | 0 改动；自动识别新 skill 的 `for_roles` |
| 角色分布表（specs/role-scoped-skill-installation） | **追加** 修改 |

## Per-Role Skill Count After This Change

| 角色 | 现有 | 之后 |
|---|---|---|
| coding | 5 | 5（无变化） |
| product-design | 1 | **4** (+product-lens, product-capability, intent-driven-development) |
| architecture-design | 1 | 1（无变化） |
| devops | 3 | 3（无变化） |
| ui-design | 1 | **4** (+frontend-design, make-interfaces-feel-better, accessibility) |
| testing | 4 | 4（无变化） |
| code-review | 2 | 2（无变化） |

## Risk Assessment

| 风险 | 评估 | 缓解 |
|---|---|---|
| 上游 SKILL.md 含破坏性指令 | 低：所有 6 个均为纯 instruction，无可执行脚本 | 复制前检查无 `bash`/`sh`/可执行位 |
| License 合规 | 低：MIT / Apache 2.0 均允许 | 保留 `metadata.origin`、`license`、`source` 字段 |
| frontmatter 冲突 | 低：现有 parser 只读 `for_roles` | 在 staging 路径用 grep 二次校验 |
| Skill 体积膨胀 install.sh 体积 | 中：3 个 product-design skill 总计约 25 KB，3 个 ui-design 约 16 KB | install.sh 是模板，预渲染后单包 < 50 KB，可接受 |
| Skill 内容与 Kaneo AGENTS.md 角色定义冲突 | 低：所有 skill 是"做什么"指南，未限定"不允许做什么" | 在归档前对照 product-design/ui-design 的 AGENTS.md 检查 |

## Validation Strategy

1. **结构验证**：`parseSkillFrontmatter` 对所有 6 个新 SKILL.md 解析成功，输出含 `for_roles`
2. **过滤验证**：`listSkillsForRole('product-design')` 返回 4 项；`listSkillsForRole('ui-design')` 返回 4 项
3. **打包验证**：`buildAgentConfigZip('product-design')` 生成的 zip 含 4 个 skill；`buildAgentConfigZip('ui-design')` 同理
4. **端到端**：用 install.sh 以 `--role product-design --agent opencode` 实际跑一次，确认 `.opencode/skills/{claim-task,write-prd,product-lens,product-capability,intent-driven-development}/SKILL.md` 落盘
5. **回归**：现有 5 角色（coding/architecture-design/devops/testing/code-review）的 skill 集合不变
6. **类型**：apps/api typecheck 干净

## Rollback

如发现某个 skill 实际触发问题，移除对应 `apps/api/src/agent/agents/templates/skills/<name>/` 目录即可，无需 spec 变更（spec 只描述角色分布，不绑定具体 skill 文件名）。