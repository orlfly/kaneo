---
for_roles: [ui-design]
description: 编写组件规格、design tokens 和无障碍要求，输出到 docs/design/
---

# Skill: Write Design Spec

> 编写组件设计规格，定义 design tokens 和无障碍（WCAG 2.1 AA）要求，输出可被前端开发直接参照的规格文档。

## 触发时机

- 收到 ui-design 角色的任务
- 需要为新组件编写设计规格
- 需要为现有组件补充 Props、状态、响应式说明
- 需要定义或更新 design tokens（颜色、字体、间距、圆角、阴影）

## 前置条件

- 已通过 `claim-task` 认领 ui-design 任务
- 已阅读项目现有组件库、design tokens、CSS 变量定义
- 已知目标用户、设备断点（mobile / tablet / desktop）

## 工作流程

### 1. 理解现有设计体系

```bash
# 查看现有组件
ls apps/web/src/components/

# 查看 design tokens
rg "(--color-|--font-|--space-)" apps/web/src --type ts --type tsx -l

# 查看 Tailwind 配置（如果使用）
cat apps/web/tailwind.config.* 2>/dev/null
```

### 2. 编写组件规格

组件规格输出到 `docs/design/components/<component-name>.md`：

```markdown
# <Component Name>

## 用途
<一句话描述组件的核心用途>

## Props 定义
| Prop | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| variant | "primary" \| "secondary" \| "ghost" | 否 | "primary" | 视觉变体 |
| size | "sm" \| "md" \| "lg" | 否 | "md" | 尺寸规格 |
| disabled | boolean | 否 | false | 是否禁用 |
| onClick | () => void | 否 | - | 点击回调 |

## 状态
### default
<视觉描述：背景色、边框、文本色、阴影>

### hover
<hover 状态视觉变化>

### active
<按下状态视觉变化>

### disabled
<禁用状态视觉变化：透明度、cursor、pointer-events>

### loading（如果适用）
<loading 状态：spinner、骨架屏、文本>

### error（如果适用）
<error 状态：错误边框、错误文本、aria-invalid>

## 响应式断点
| 断点 | 宽度 | 行为 |
|------|------|------|
| mobile | < 640px | <简化的布局、堆叠> |
| tablet | 640px - 1024px | <中等布局> |
| desktop | ≥ 1024px | <完整布局> |

## 无障碍要求
- **键盘操作**：<Tab 顺序、Enter/Space 触发、Escape 关闭>
- **ARIA 属性**：<role、aria-label、aria-describedby、aria-invalid>
- **对比度**：<文字 vs 背景 ≥ 4.5:1（大文字 3:1）>
- **焦点指示**：<focus-visible 样式，可见且与设计系统一致>
- **屏幕阅读器**：<朗读文本、状态变化通知>

## 使用示例
\`\`\`tsx
<Component variant="primary" size="md" onClick={handleClick}>
  Click me
</Component>
\`\`\`

## Design Tokens 使用
- 颜色：`var(--color-primary-500)`
- 间距：`var(--space-4)`
- 圆角：`var(--radius-md)`
- 字体：`var(--font-size-base)`
```

### 3. 定义 Design Tokens

如果新增 tokens，更新 `apps/web/src/styles/tokens.css`（或 Tailwind 配置）：

```css
:root {
  /* 颜色 */
  --color-primary-500: #3b82f6;
  --color-neutral-100: #f5f5f5;
  /* 字体 */
  --font-size-base: 1rem;
  --font-weight-medium: 500;
  /* 间距 */
  --space-1: 0.25rem;
  --space-4: 1rem;
  /* 圆角 */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
}
```

**不要硬编码值**：所有视觉值必须使用 CSS 变量或 Tailwind 配置。

### 4. 无障碍检查清单

每个组件规格必须确认：

- ✅ **WCAG 2.1 AA 标准**：
  - 文字对比度 ≥ 4.5:1（大文字 3:1）
  - 非文字元素对比度 ≥ 3:1
- ✅ **键盘可达性**：
  - Tab 可达
  - Enter/Space 触发主操作
  - 焦点可见（`focus-visible`）
- ✅ **ARIA 属性**：
  - 交互元素有合适的 `role`
  - 图标按钮有 `aria-label`
  - 表单控件有关联的 `<label>` 或 `aria-label`
- ✅ **响应式**：
  - mobile (≥ 320px) 可正常使用
  - 触摸目标 ≥ 44×44 px
- ✅ **减少动态**：
  - 尊重 `prefers-reduced-motion`

## 关键约束

- **不要直接修改前端组件代码**（.tsx 文件中的组件实现）
- **不要修改后端代码或 API 路由**
- **不要修改数据库 schema**
- **不要运行测试或构建**
- 所有视觉值必须使用 design tokens，不硬编码
- 文档使用中文描述，技术术语保留英文

## 质量标准

- 组件规格包含完整的 Props 定义（类型、必填、默认值、说明）
- 状态说明覆盖 default/hover/active/disabled + loading/error（如果适用）
- Design tokens 使用变量化定义
- 无障碍要求明确标注键盘操作、ARIA 属性、对比度
- 附带使用示例代码片段
- 设计可被前端开发直接参照实施

## 完成后

1. 确认设计规格文档已保存到 `docs/design/components/<component>.md`
2. 如果新增了 design tokens，确认 CSS 变量已定义（如果允许更新 tokens 文件）
3. 如果设计需要拆分为多个前端开发任务，使用 `claim-task` skill 创建子任务并设置 `requiredRole: coding`
4. 调用 `PUT /api/task/status/{taskId}` 将任务状态更新为 `in-review`