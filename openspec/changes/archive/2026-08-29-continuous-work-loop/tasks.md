## 1. 写 SKILL.md

- [ ] 1.1 在 `apps/api/src/agent/agents/templates/skills/continuous-work/SKILL.md` 创建文件
- [ ] 1.2 frontmatter：`for_roles: [coding, product-design, architecture-design, devops, ui-design, testing, code-review]`、`metadata.origin: kaneo-internal`
- [ ] 1.3 6 个章节：触发时机、前置条件、工作流程（含循环契约表）、关键约束（含单 cycle 规则）、质量标准、完成后

## 2. 验证

- [ ] 2.1 `parseSkillFrontmatter` 对新 SKILL.md 返回 `forRoles` 长度=7
- [ ] 2.2 `listSkillsForRole(role)` 对每个 role 都包含 `continuous-work`
- [ ] 2.3 `buildAgentConfigZip()` 无过滤时 zip 内含 `continuous-work/SKILL.md`
- [ ] 2.4 `install.sh` bash 镜像对每个 role 都识别 continuous-work 为 applicable

## 3. 主 spec 同步

- [ ] 3.1 更新 `openspec/specs/role-scoped-skill-installation/spec.md` 的角色分布表（continuous-work 同时计入所有 7 个 role）
- [ ] 3.2 追加 `continuous-work: applicable to all 7 roles` 到 skill 重分布列表

## 4. 归档

- [ ] 4.1 git commit：`feat(agent): add continuous-work loop skill`
- [ ] 4.2 `openspec archive 2026-08-29-continuous-work-loop --yes`
- [ ] 4.3 验证主 spec 同步成功、archive 目录就位