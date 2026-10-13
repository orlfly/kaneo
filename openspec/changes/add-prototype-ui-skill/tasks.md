## 1. 技能与角色规范

- [x] 1.1 新增 `apps/api/src/agent/agents/templates/skills/prototype-ui/SKILL.md`，frontmatter `for_roles: [product-design, ui-design]`，按共享结构包含 触发时机 / 前置条件 / 工作流程 / 关键约束 / 质量标准 / 完成后。
- [x] 1.2 技能内定义产物契约：`repo/docs/prototypes/<feature-slug>/index.html`，单文件自包含、离线可开、不联网、不引入构建依赖。
- [x] 1.3 技能内定义两个保真度档位及角色分工（product-design 低保真结构、ui-design 高保真视觉）。
- [x] 1.4 技能内定义状态覆盖（default / empty / loading / error）与待决问题 `README.md` 要求。
- [x] 1.5 修订 `roles/product-design/AGENTS.md`：职责加入低保真原型、允许操作豁免 `docs/prototypes/**`、工作规范新增原型条目、质量标准与完成后同步。
- [x] 1.6 修订 `roles/ui-design/AGENTS.md`：同上，档位为高保真视觉原型，视觉值必须取自 design tokens。

## 2. 测试

- [x] 2.1 `tests/api/agent/agents-config.test.ts` 增加断言：`prototype-ui` 的 `forRoles` 精确等于 `["product-design", "ui-design"]`。
- [x] 2.2 增加断言：按 `product-design` 与 `ui-design` 打包时包含 `skills/prototype-ui/SKILL.md`，按其余 5 个角色打包时不包含。
- [x] 2.3 增加断言：技能文档包含产物路径与两个保真度档位说明。

## 3. 规范同步

- [x] 3.1 更新 `openspec/specs/role-scoped-skill-installation/spec.md`：技能总数 18 → 19，新增 `prototype-ui` 归属行，两个设计角色解析技能集 6 → 7，API 过滤与 templates 场景同步。
- [x] 3.2 更新 `openspec/specs/install-role-persona/spec.md`：product-design 与 ui-design 落盘场景补充 `prototype-ui`。

## 4. 验证

- [x] 4.1 运行 `pnpm --filter @kaneo/api test -- tests/api/agent/agents-config.test.ts`，11 项断言通过。
- [x] 4.2 真实 `install.sh` 端到端落盘验证：`product-design` 与 `ui-design` 均出现 `prototype-ui`，`coding` 不出现。
