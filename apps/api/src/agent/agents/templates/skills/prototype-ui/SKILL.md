---
name: prototype-ui
description: 产出可交互的 HTML 界面原型（低保真结构原型或高保真视觉原型），用于在写实现前验证信息架构、交互流程与状态覆盖。当任务要求"原型""交互稿""页面结构验证"，或在 PRD/设计规格之后、开发之前需要可视化确认时使用。
for_roles: [product-design, ui-design]
---

# Skill: Prototype UI

> 产出**单文件、可直接在浏览器打开**的 HTML 原型，把 PRD 的用户故事和设计规格变成可点击、可评审的界面。
> 原型用于**验证**，不是实现。它不进构建、不进测试、不部署。

## 两个保真度档位

先确认档位，不要默认做高保真：

| 档位 | 归属角色 | 关注点 | 明确不做 |
|------|----------|--------|----------|
| **低保真结构原型** | `product-design` | 信息架构、页面层级、导航路径、交互流程、状态覆盖 | 精细视觉、动效、真实数据 |
| **高保真视觉原型** | `ui-design` | 视觉语言、排版层级、间距节奏、design tokens 落地、微交互状态 | 后端逻辑、真实接口 |

`product-design` 交付低保真即可，高保真交给 `ui-design`；两者可以针对同一 feature 先后产出，后者复用前者的页面结构。

## 触发时机

- 任务要求"原型""交互稿""页面结构验证""点击流程"
- PRD 已写清用户故事，但团队对界面结构和跳转仍有分歧
- 设计规格已定，需要在写实现前确认视觉与状态
- 需要快速对比两套布局方案

不要用于：已有明确设计规格的纯实现任务（交给 `coding`）、组件级 Props 规格（交给 `write-design-spec`）。

## 前置条件

- 已通过 `claim-task` 认领任务
- **已调用 `agent_sync_project` 同步项目集成仓库**（工作目录 `repo/`；不要在本地文件系统里搜索项目代码）
- 已阅读相关 PRD / 设计文档：
  ```bash
  ls repo/docs/requirements/ repo/docs/design/ 2>/dev/null
  ```
- 已知原型要覆盖的用户故事清单
- 高保真档位还需读取现有 design tokens：
  ```bash
  rg "(--color-|--font-|--space-|--radius-)" repo/apps/web/src -l
  ```

## 工作流程

### 1. 把用户故事映射到页面

先列出"页面 ↔ 用户故事 ↔ 涉及状态"的映射表，再动手写 HTML。缺映射表直接开写会导致原型只覆盖主路径。

```markdown
| 页面 | 覆盖的用户故事 | 状态 |
|------|----------------|------|
| 任务列表 | 作为成员，我希望按状态筛选任务 | default / empty / loading |
| 任务详情 | 作为成员，我希望查看并编辑任务 | default / editing / error |
```

### 2. 建立原型目录

```bash
mkdir -p repo/docs/prototypes/<feature-slug>
```

单文件约定：`repo/docs/prototypes/<feature-slug>/index.html`

### 3. 编写原型页面

硬性要求：

- **单文件自包含**：CSS 与 JS 内联，**不引用任何外部网络资源**（无 CDN、无外链字体、无远程图片）。原型必须能离线双击打开。
- **纯静态数据**：不调用真实接口，用内联的示例数组。
- **语义化 HTML**：`button`、`nav`、`main`、`label` 等语义标签，不堆 `div` + `onclick`。
- **标出状态**：每个页面顶部放一个标注块，写明覆盖的用户故事与状态。

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>任务列表原型</title>
  <style>
    /* 高保真档位：从 repo 的 design tokens 复制为 CSS 变量，不要硬编码 */
    :root {
      --color-bg: #ffffff;
      --color-fg: #111827;
      --color-primary: #3b82f6;
      --space-2: 0.5rem;
      --space-4: 1rem;
      --radius-md: 0.5rem;
    }
    * { box-sizing: border-box; }
    :focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
    body { margin: 0; font-family: system-ui, sans-serif; color: var(--color-fg); background: var(--color-bg); }
    .prototype-note { padding: var(--space-2) var(--space-4); background: #fef3c7; font-size: 13px; }
  </style>
</head>
<body>
  <!-- 原型标注：评审时说明这个屏幕在验证什么 -->
  <div class="prototype-note">
    用户故事：作为成员，我希望按状态筛选任务 ｜ 状态：default / empty
  </div>

  <main>
    <!-- 页面结构 -->
  </main>

  <script>
    // 交互用内联静态数据，不请求网络
    const tasks = [
      { id: 1, title: "示例任务", status: "todo" },
    ];
  </script>
</body>
</html>
```

### 4. 覆盖关键状态

每个 feature 至少覆盖：

- **default**：正常数据
- **empty**：无数据时的引导文案与主操作
- **loading**：加载占位（低保真可用灰块示意）
- **error**：失败提示与恢复路径

边界与异常路径是评审最容易发现问题的地方，不要只做"数据好看"的那一屏。

### 5. 记录待决问题

在原型里写不下的决策，落到同目录 `README.md`：

```markdown
# <feature> 原型说明

## 覆盖范围
- 页面：...
- 用户故事：...

## 待决问题
- [ ] 筛选条件是否需要持久化到 URL？
- [ ] 空状态的主操作是"新建任务"还是"导入"？

## 取舍记录
- 选择了横向筛选条而非下拉，理由是 ...
```

## 关键约束

- **不改实现代码**：不修改 `repo/apps/web/**` 下的 .tsx/.ts 实现文件，也**不要**把原型代码搬进应用源码
- **不加构建依赖**：不引入打包器、npm 依赖、Tailwind 构建流程。原型是静态文件
- **不联网**：原型不得依赖任何远程资源，确保离线可开
- **不跑测试/构建**：不执行 `pnpm test`、`pnpm build`
- **不动数据库、不动 API**
- **不要为了"像真的"而伪造复杂业务逻辑**：原型验证的是结构与流程，不是正确性
- 标注与说明使用中文，技术术语保留英文

## 质量标准

- `index.html` 双击即可在浏览器打开，无网络请求，无控制台报错
- 覆盖 PRD 中该 feature 的**每一条**用户故事，标注块能对应上
- 覆盖 default / empty / loading / error 四类状态（不适用需在 README 说明）
- 页面结构与跳转路径自洽，评审者能在不口头解释的情况下走完主流程
- 高保真档位的视觉值全部来自 design tokens，无硬编码散值
- 无障碍基线：语义标签、键盘可达、`:focus-visible` 可见、文字对比度 ≥ 4.5:1
- 待决问题显式列出，不留隐含假设

## 完成后

1. 确认原型文件已保存到 `repo/docs/prototypes/<feature-slug>/index.html`（项目集成仓库内）
2. 确认 `README.md` 列出覆盖范围、待决问题与取舍记录
3. 在提交说明里写明保真度档位与覆盖的用户故事
4. 如需要进入实现，使用 `claim-task` 创建子任务并设置 `requiredRole: coding`，并在描述里链接原型路径
5. 调用 `PUT /api/task/status/{taskId}` 将任务状态更新为 `in-review`
