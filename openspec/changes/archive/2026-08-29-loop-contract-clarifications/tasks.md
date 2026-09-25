## 1. 文档补丁

- [x] 1.1 在 `apps/api/src/agent/agents/templates/skills/continuous-work/SKILL.md` §2 后插入 §2.1（work vs helper skill 职责边界）和 §2.2（race condition 处理）
- [x] 1.2 在 `apps/api/src/agent/agents/templates/skills/claim-task/SKILL.md` "触发时机" 拆分持续模式 / 交互模式；"关键约束" 同步补充模式说明
- [x] 1.3 在 `continuous-work/SKILL.md` "关键约束" 末尾把 race condition 一行指向 §2.2

## 2. 验证

- [x] 2.1 `parseSkillFrontmatter` 对两个改动的 SKILL.md 都仍能解析（forRoles=7）
- [x] 2.2 `listSkillsForRole(r)` 对 7 个 role 仍都包含 claim-task + continuous-work
- [x] 2.3 `buildAgentConfigZip(r)` 对 7 个 role 都把两个 SKILL.md 写入 zip
- [x] 2.4 install.sh 端到端对 7 个 role 跑通：`/tmp/agent-installed-<r>/.opencode/skills/continuous-work/SKILL.md` 与 `claim-task/SKILL.md` 都存在

## 3. OpenSpec 同步

- [ ] 3.1 新建 `openspec/changes/2026-08-29-loop-contract-clarifications/` change 目录
- [ ] 3.2 `proposal.md` 写 Why / What Changes / Behavior Contract / Out of Scope
- [ ] 3.3 `specs/continuous-work-loop/spec.md` 用 MODIFIED 标记 3 个 Requirement（work/helper 边界、race condition、claim-task 双模式）
- [ ] 3.4 把 capability 同步到 `openspec/specs/continuous-work-loop/spec.md`（首次）
- [ ] 3.5 `tasks.md` 跟踪 1.x、2.x、3.x、4.x 步骤

## 4. 归档

- [ ] 4.1 git commit：`docs(agent): clarify continuous-work / claim-task contract for two-mode + race`
- [ ] 4.2 `openspec archive 2026-08-29-loop-contract-clarifications --yes`（或 mv fallback）
- [ ] 4.3 主 spec 同步：continuous-work-loop capability 加入 `openspec/specs/`
