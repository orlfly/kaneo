## Context

Kaneo 已有 `install.sh` 安装脚本（`apps/api/src/agent/agents/install.sh.template`），它为所选 agent 工具实例安装一个角色 persona 的 AGENTS.md，并附带安装包内所有 SKILL.md。当前实现：

- 包内 skills 放在 `apps/api/src/agent/agents/templates/skills/<skill>/SKILL.md`，由 `buildAgentConfigZip()` 全部打包
- `install.sh` 调用 `install_skills()` 函数，遍历 `skills/*/` 目录，复制每个 SKILL.md 到目标工具的 skills 目录
- 现有 5 个 skills：`claim-task`, `code-search`, `repo-sync`, `run-tests`, `submit-pr`

**两类问题**：

1. **范围错配**：所有 persona 角色都获得了所有 skills。例如 `ui-design` persona 获得了 `submit-pr` skill，但 UI 设计师不应提交代码；`product-design` persona 获得了 `run-tests` skill，但产品设计师不应跑测试。
2. **缺乏角色专属技能**：现有 5 个 skills 全部面向编码流程。非编码角色（product-design、architecture-design、ui-design、devops、testing、code-review）的核心交付物（PRD、ADR、设计规格、IaC、测试套件、PR 评审）没有专门的 skill，只能依赖 `claim-task` 凭直觉工作。

## Goals / Non-Goals

**Goals:**
- 每个 SKILL.md 顶部添加 frontmatter `for_roles` 字段，明确该 skill 的适用范围
- `install.sh` 只安装与所选 persona 角色匹配的 skills
- `claim-task` skill 保留所有角色可见（任何角色都需要认领任务）
- API 下载端点支持按角色过滤 skill 列表
- **新增 6 个角色专属 skills**，覆盖各角色的核心交付物：
  - `write-prd` — product-design（产品需求文档）
  - `write-adr` — architecture-design（架构决策记录）
  - `write-design-spec` — ui-design（组件规格 + design tokens）
  - `write-iac` — devops（Dockerfile / Helm / CI/CD）
  - `write-test-suite` — testing（编写测试用例 + 覆盖率报告）
  - `review-pr` — code-review（结构化 PR 评审：Blocker/Major/Minor/Info）

**Non-Goals:**
- 不修改 7 个角色 AGENTS.md 的内容（保持各角色的工作规范不变）
- 不修改每个 SKILL.md 的内部内容（仅添加 frontmatter 元数据 + 新增 6 个 SKILL.md）
- 不引入新的 skill 发现机制（如 runtime hot-reload）
- 不修改 pi-agent 的工具调用或任务状态流转逻辑

## Decisions

### Decision 1: 使用 YAML frontmatter 作为 skill 元数据格式

SKILL.md 顶部添加 4 行 YAML frontmatter：

```markdown
---
for_roles: [coding, testing, code-review]
description: 在代码库中搜索符号、定义和用法
---

# Skill: Code Search
...
```

**Rationale**: YAML frontmatter 是 Markdown 生态中常见的元数据格式（与 Jekyll、Next.js MDX 等兼容），无需额外解析逻辑。`install.sh` 和 API 都可通过 `sed -n '/^---$/,/^---$/p'` 或简单的行扫描提取 `for_roles` 数组。

**Alternative**: 在每个 SKILL.md 顶部添加 `# for_roles: ...` 注释行 → Bash 解析更简单，但与 Markdown 生态兼容性差。

### Decision 2: 默认仍安装所有角色共有的 skills（claim-task）

`claim-task` skill 的 `for_roles` 字段列出全部 7 个角色。安装任何角色 persona 时，`claim-task` 都会被安装。

**Rationale**: 任何 agent persona 都需要认领任务才能开始工作。这是平台核心交互流程。

**Alternative**: 不强制安装 `claim-task` → 与现有 claim-task 工作流冲突。

### Decision 3: install.sh 通过简单的 grep 提取 for_roles

`install_skills()` 函数修改为：

```bash
install_skills() {
  local skills_dir="$1"
  local role="$2"  # 新增参数：当前 persona 角色
  for skill_dir in "${SCRIPT_DIR}/skills"/*/; do
    skill="$(basename "${skill_dir}")"
    skill_md="${skill_dir}/SKILL.md"
    [ -f "$skill_md" ] || continue
    # 提取 frontmatter 中的 for_roles
    for_roles=$(awk '/^---$/{f=!f; next} f && /^for_roles:/{print; exit}' "$skill_md")
    # 解析数组 [a, b, c]
    if echo "$for_roles" | grep -q "$role"; then
      # 复制到目标
      ...
    else
      echo "  跳过 ${skill}（不适用于角色 ${role}）"
    fi
  done
}
```

**Rationale**: 无需引入额外依赖（如 `yq`），纯 awk/grep 即可解析简单 YAML 数组。SKILL.md 的 frontmatter 数组是单行格式 `[a, b, c]`，正则匹配足够。

**Alternative**: 引入 `yq` 解析器 → 增加外部依赖，跨平台兼容性问题。

### Decision 4: buildAgentConfigZip 接受可选角色参数

```typescript
export async function buildAgentConfigZip(roleFilter?: AgentRole): Promise<Buffer>
```

- `roleFilter === undefined`：打包全部 skills（向后兼容）
- `roleFilter === "coding"`：只打包 `for_roles` 包含 `coding` 的 skills

**Rationale**: 默认行为不变保证向后兼容；显式传 role 才执行筛选。

### Decision 5: API 端点支持 `?role=<name>` 查询参数

`GET /api/agent/agents-config/download?role=coding` 现在只打包 `coding` 角色对应的 skills。

**Rationale**: 前端可基于用户选择的角色过滤下载包内容。`GET /templates` 端点增加 `role` 字段到每个 skill 元数据中。

### Decision 6: 新增 6 个角色专属 SKILL.md 文件

每个非编码角色获得一个专属 skill，覆盖其核心交付物的工作流。这些 skill 都是 Markdown 格式，与现有 5 个 skill 的格式保持一致（标题、触发时机、前置条件、工作流程、关键约束、质量标准）。

| Skill | 适用角色 | 核心交付物 | 主要工作流 |
|-------|---------|-----------|-----------|
| `write-prd` | product-design | 产品需求文档（PRD） | 阅读背景 → 编写用户故事 → 编写验收标准 → 输出 `docs/requirements/<feature>.md` |
| `write-adr` | architecture-design | 架构决策记录（ADR） | 分析问题 → 对比候选方案 → 记录决策与后果 → 输出 `docs/decisions/NNNN-<title>.md` |
| `write-design-spec` | ui-design | 组件规格 + design tokens | 列出 Props/状态/响应式断点 → 定义 CSS 变量 → 标注 a11y 要求 → 输出 `docs/design/components/<component>.md` |
| `write-iac` | devops | Dockerfile/Helm chart/CI 配置 | 编写多阶段 Dockerfile → values.yaml → GitHub Actions workflow → 通过 `docker build` / `helm lint` 验证 |
| `write-test-suite` | testing | 测试代码 + 覆盖率报告 | 编写测试用例（正常/边界/异常） → 运行覆盖率工具 → 输出 `tests/` 或 `e2e/` |
| `review-pr` | code-review | 结构化 PR 评审报告 | `git diff` 查看变更 → 按 Blocker/Major/Minor/Info 分级 → 输出 PR 评论 |

**Rationale**: 每个角色 AGENTS.md 都定义了核心交付物（PRD/ADR/组件规格/Dockerfile/测试/PR 评审），但 agent 缺乏结构化的工作流指引。新增专属 skill 让 agent 知道「拿到任务后该读哪些信息、按什么格式产出、放在仓库哪个目录」。所有 skill 文档都用中文，与 AGENTS.md 保持一致。

**非目标**：不修改现有 5 个 SKILL.md 的内部内容（仅添加 frontmatter）。

## Risks / Trade-offs

- **frontmatter 解析错误**: Bash awk 解析失败会默认安装所有 skills（fail-open） → 安全降级，比 fail-closed（不安装任何 skill）更友好
- **现有 SKILL.md 没有 frontmatter**: 添加 frontmatter 后旧版 install.sh 可能无法识别 → 在 frontmatter 缺失时默认安装（兼容旧版本脚本）
- **角色枚举不一致**: `for_roles` 中的字符串必须与 `AGENT_ROLES` 常量一致 → 安装脚本和 API 校验 frontmatter 中的角色值是否在 `AGENT_ROLES` 中，无效值警告但仍尝试匹配
- **覆盖已有 skill**: 用户工作目录中已有的 SKILL.md 不会被角色筛选覆盖，仍按现有备份逻辑处理
- **部分技能跨角色使用**: 某些 skill 可能被多个角色需要 → 通过 `for_roles` 列表精确表达，不强制 one-to-one 映射

## Migration Plan

无需特殊迁移。变更向后兼容：
1. 已安装的项目：现有 AGENTS.md 和 SKILL.md 不受影响，前端可重新下载角色特定包
2. 前端：可选择是否在 UI 中按角色过滤 skill 列表展示
3. 新安装：默认行为不变（`for_roles` 缺失则视为适用所有角色）

回滚策略：删除 `install.sh` 中的 frontmatter 解析逻辑，恢复为遍历所有 skills。

## Open Questions

1. **是否在前端 UI 中显示每个 skill 适用于哪些角色？** → 当前设计是仅在 API 响应中包含，前端可选择性展示。建议实现时在 settings 页面增加 skill → role 的可视化矩阵
2. **是否需要 `for_tools` 字段（限定 skill 适用的工具）？** → 当前不需要，skills 内容是工具无关的；如果未来某个 skill 仅适用于特定工具可扩展
3. **是否需要 skill 的依赖关系？**（如 `submit-pr` 依赖 `repo-sync`）→ 当前不实现，由 AGENTS.md 中的工作流描述隐式表达