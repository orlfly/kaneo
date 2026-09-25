## Why

在 `role-scoped-skill-installation` change 完成之后，每个 agent persona 已获得一个核心产出 skill（`write-prd` 给 product-design、`write-design-spec` 给 ui-design），但这些 skill 只覆盖"产出物本身"的写作，没有覆盖其**前置**（验证为什么做、拆解能力、定义验收）与**后置**（视觉方向、打磨、无障碍）能力。

公开 skill 生态（SkillsMP、Anthropic 官方 skills、affaan-m/ECC 社区）已经沉淀了被广泛验证的高质量 SKILL.md。本次 change 把其中 **6 个**与 product-design / ui-design 角色最匹配的 skill 并入 Kaneo 自带 skill 树，使 install 流程自动把它们下发给目标角色。

不重新发明这些已经在上游被实践检验的 skill；保留上游 attribution（MIT / Apache 2.0 都允许再分发），只在其 frontmatter 上**追加** `for_roles` 以适配 Kaneo 的角色过滤机制。

## What Changes

- **新增 3 个 product-design skill**（来源：affaan-m/ECC，MIT）
  - `product-lens` — 在写 PRD 前做产品诊断：用户/痛点/时机/MVP/反目标/成功指标
  - `product-capability` — 把 PRD 翻译成 SRS 能力契约：约束/不变量/接口/状态/开放问题
  - `intent-driven-development` — 把模糊需求转成可验证的 AC：场景/动作/期望/副作用/验证方式
- **新增 3 个 ui-design skill**
  - `frontend-design`（来源：Anthropic 官方，Apache 2.0）— 设计方向：避免模板感、token 系统、签名元素
  - `make-interfaces-feel-better`（来源：affaan-m/ECC，MIT）— 微观打磨：concentric radius、tabular-nums、hit area、transition 范围
  - `accessibility`（来源：affaan-m/ECC，MIT）— WCAG 2.2 Level AA：24×24 焦点、focus 可见性、modal focus trap、ARIA 映射

- **不修改**现有 5 个 coding-oriented skill 与已存在的 6 个角色专属 skill
- **不修改**`parseSkillFrontmatter` / `validateRoles` / `skillAppliesToRole` / `listSkillsForRole` / `buildAgentConfigZip(roleFilter?)` / `?role=` API / `install.sh` 的 awk 过滤逻辑
- **不修改**任何 Valibot schema；新 SKILL.md 的 frontmatter 是 name + description + `for_roles` + 可选 `metadata`/`license`，与现有模板一致

## Source Provenance

| Skill | 上游仓库 | 许可证 | 来源路径 |
|---|---|---|---|
| product-lens | github.com/affaan-m/ECC | MIT | `skills/product-lens/SKILL.md` |
| product-capability | github.com/affaan-m/ECC | MIT | `skills/product-capability/SKILL.md` |
| intent-driven-development | github.com/affaan-m/ECC | MIT | `skills/intent-driven-development/SKILL.md` |
| frontend-design | github.com/anthropics/skills | Apache 2.0 | `skills/frontend-design/SKILL.md` |
| make-interfaces-feel-better | github.com/affaan-m/ECC | MIT | `skills/make-interfaces-feel-better/SKILL.md` |
| accessibility | github.com/affaan-m/ECC | MIT | `skills/accessibility/SKILL.md` |

两个许可证均允许在保留版权与许可证声明的前提下复制、修改、再分发。本次集成**保留**上游 SKILL.md 的 `metadata.origin` 与 `license` 字段，并在 frontmatter 上**追加** `for_roles`（这是适配性元数据，不是对上游内容的实质性修改）。

## Out of Scope

- 多角色映射（同一 skill 同时给 product-design + architecture-design）：留作后续 `shared-role-skills` change
- 上游 skill 内容裁剪 / 翻译：本次保持原文，仅补 `for_roles`
- 在 web UI 中显示 skill 来源徽章 / 第三方标记
- 引入 Anthropic / SkillsMP 的运行时：本次只复制 SKILL.md 静态内容