## 1. 上游 SKILL.md 取回与校验

- [ ] 1.1 从 `affaan-m/ECC/skills/product-lens/SKILL.md` 抓取原文到 `apps/api/src/agent/agents/templates/skills/product-lens/SKILL.md`
- [ ] 1.2 从 `affaan-m/ECC/skills/product-capability/SKILL.md` 抓取原文到 `apps/api/src/agent/agents/templates/skills/product-capability/SKILL.md`
- [ ] 1.3 从 `affaan-m/ECC/skills/intent-driven-development/SKILL.md` 抓取原文到 `apps/api/src/agent/agents/templates/skills/intent-driven-development/SKILL.md`
- [ ] 1.4 从 `anthropics/skills/skills/frontend-design/SKILL.md` 抓取原文到 `apps/api/src/agent/agents/templates/skills/frontend-design/SKILL.md`
- [ ] 1.5 从 `affaan-m/ECC/skills/make-interfaces-feel-better/SKILL.md` 抓取原文到 `apps/api/src/agent/agents/templates/skills/make-interfaces-feel-better/SKILL.md`
- [ ] 1.6 从 `affaan-m/ECC/skills/accessibility/SKILL.md` 抓取原文到 `apps/api/src/agent/agents/templates/skills/accessibility/SKILL.md`

## 2. frontmatter `for_roles` 注入

- [ ] 2.1 给 `product-lens/SKILL.md` 加 `for_roles: [product-design]`（保留 `metadata.origin`）
- [ ] 2.2 给 `product-capability/SKILL.md` 加 `for_roles: [product-design]`
- [ ] 2.3 给 `intent-driven-development/SKILL.md` 加 `for_roles: [product-design]`
- [ ] 2.4 给 `frontend-design/SKILL.md` 加 `for_roles: [ui-design]`（保留 `license` 字段）
- [ ] 2.5 给 `make-interfaces-feel-better/SKILL.md` 加 `for_roles: [ui-design]`
- [ ] 2.6 给 `accessibility/SKILL.md` 加 `for_roles: [ui-design]`

## 3. 解析与过滤验证

- [ ] 3.1 对 6 个新 SKILL.md 跑 `parseSkillFrontmatter`，确认每个返回 `forRoles: ['product-design' | 'ui-design']`
- [ ] 3.2 跑 `listSkillsForRole('product-design')` 与 `listSkillsForRole('ui-design')` 确认返回集合
- [ ] 3.3 跑 `buildAgentConfigZip('product-design')` 与 `buildAgentConfigZip('ui-design')` 确认 zip 内 skill 文件清单
- [ ] 3.4 跑 `listSkillsForRole` 对 5 个非目标角色，确认数量不变

## 4. 端到端 install.sh 验证

- [ ] 4.1 `bash install.sh --role product-design --agent opencode --install-dir /tmp/test-pm`，验证 4 个产品向 skill 落盘
- [ ] 4.2 `bash install.sh --role ui-design --agent opencode --install-dir /tmp/test-ui`，验证 4 个 UI 向 skill 落盘
- [ ] 4.3 跑 typecheck（`pnpm --filter @kaneo/api typecheck`）

## 5. 主 spec 同步

- [ ] 5.1 更新 `openspec/specs/role-scoped-skill-installation/spec.md` 中"角色分布表"为新数字（product-design: 1→4、ui-design: 1→4）
- [ ] 5.2 更新 `openspec/specs/install-role-persona/spec.md` 中产物期望数量

## 6. 归档

- [ ] 6.1 git commit：`feat(agent): enhance pm and ui design skills` + `chore(openspec): archive enhance-pm-ui-skills`
- [ ] 6.2 跑 `openspec archive enhance-pm-ui-skills --yes`
- [ ] 6.3 验证 archive 目录含 proposal/design/specs/tasks；主 spec 已同步