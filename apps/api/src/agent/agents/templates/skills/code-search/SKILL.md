---
for_roles: [coding, testing, code-review]
description: 使用 ripgrep 定位代码、理解项目结构
---

# Skill: Code Search

> 使用 ripgrep 高效定位代码，理解项目结构，找到需要修改的文件和函数。

## 触发时机

- 需要理解代码结构
- 定位函数/类/类型定义
- 查找某个函数的调用方
- 发现技术债和待办标记
- 概览项目结构

## 工具

ripgrep (`rg`)，在 agent 工作目录内执行。

## 搜索模式

### 1. 查找定义

```bash
# 函数定义
rg "function\s+myFunction" --type ts
rg "def my_function" --type py

# 类定义
rg "class\s+MyClass"

# 类型定义
rg "type\s+MyType|interface\s+MyInterface"

# 常量定义
rg "const\s+MY_CONST|export\s+const\s+MY_CONST"
```

### 2. 查找用法（引用追踪）

```bash
# 谁调用了某函数
rg "myFunction\(" --type ts

# 谁导入了某模块
rg "from.*['\"].*my-module['\"]"

# 某文件被谁引用
rg "my-file-name"
```

### 3. 发现技术债

```bash
# TODO/FIXME 标记
rg "TODO|FIXME|HACK|XXX" --type-not md

# 过期注释
rg "@deprecated"

# 未实现的桩代码
rg "throw new Error\(['\"]not implemented|NotImplemented"
```

### 4. 按文件类型过滤

```bash
# 仅 TypeScript
rg "pattern" --type ts --type tsx

# 排除测试文件
rg "pattern" --glob '!*.test.*'

# 仅配置文件
rg "pattern" --glob '*.json' --glob '*.yaml'
```

### 5. 项目结构概览

```bash
# 入口文件
rg "export default|export \*|module.exports" --glob 'index.*'

# 路由定义
rg "app\.(get|post|put|delete|patch)\("

# 数据库 schema
rg "pgTable\(|text\(|integer\(|boolean\(" --glob 'schema.*'
```

## 输出格式

- 列出匹配的文件路径 + 行号 + 匹配内容
- 对大量匹配结果（>50），先汇总统计（按文件分组计数），再逐文件展开

## 关键约束

- 搜索范围限定在 agent 工作目录内
- rg 默认跳过 .gitignore 文件
- 对超过 50 个匹配的结果先汇总，避免上下文溢出
- 不要搜索 .git 目录