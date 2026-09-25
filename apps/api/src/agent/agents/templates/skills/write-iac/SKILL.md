---
for_roles: [devops]
description: 编写 Dockerfile、Helm chart、CI/CD 流水线配置
---

# Skill: Write IaC

> 编写基础设施即代码（IaC）配置：Dockerfile、Helm charts、CI/CD 流水线。所有变更通过 PR 提交并经 dry-run 验证。

## 触发时机

- 收到 devops 角色的任务
- 需要新增/更新 Dockerfile
- 需要新增/更新 Helm chart
- 需要新增/更新 CI/CD workflow（GitHub Actions / GitLab CI / 等）
- 需要编写或更新部署脚本

## 前置条件

- 已通过 `claim-task` 认领 devops 任务
- 已使用 `repo-sync` skill 拉取最新代码
- 已阅读项目现有 Dockerfile、docker-compose、Helm charts、CI 配置
- 已确认目标部署环境（Kubernetes 版本、容器运行时、镜像仓库）

## 工作流程

### 1. 理解现有基础设施

```bash
# 列出所有部署相关文件
find . -name "Dockerfile*" -o -name "*.yaml" -path "*/charts/*" -o -name "*.yml" -path "*/workflows/*" 2>/dev/null | grep -v node_modules

# 查看现有 Dockerfile
cat apps/api/Dockerfile apps/web/Dockerfile 2>/dev/null

# 查看 Helm chart 结构
find charts/ -type f | head -20
```

### 2. Dockerfile 最佳实践

新建 `Dockerfile` 时遵循：

```dockerfile
# 多阶段构建
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 最小基础镜像
FROM node:20-alpine AS runtime
WORKDIR /app

# 非 root 用户
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app

# 缓存优化：先复制 package.json，再复制源码
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:1337/health || exit 1

EXPOSE 1337
CMD ["node", "dist/index.js"]
```

### 3. Helm chart 结构

```
charts/myapp/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-prod.yaml
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    ├── configmap.yaml
    ├── secret.yaml
    └── _helpers.tpl
```

`values.yaml` 必须可配置化（不硬编码环境值）：

```yaml
image:
  repository: myregistry/myapp
  tag: ""  # 由 CI 注入
  pullPolicy: IfNotPresent

replicaCount: 2

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

probes:
  liveness:
    httpGet:
      path: /health
      port: http
    initialDelaySeconds: 30
    periodSeconds: 10
  readiness:
    httpGet:
      path: /health
      port: http
    initialDelaySeconds: 5
    periodSeconds: 5
```

`deployment.yaml` 模板示例：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: 1337
              protocol: TCP
          livenessProbe:
            {{- toYaml .Values.probes.liveness | nindent 12 }}
          readinessProbe:
            {{- toYaml .Values.probes.readiness | nindent 12 }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

### 4. CI/CD 流水线

GitHub Actions 示例（`.github/workflows/deploy.yml`）：

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ secrets.REGISTRY_USERNAME }}
          password: ${{ secrets.REGISTRY_PASSWORD }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ env.REGISTRY }}/myapp:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: azure/setup-kubectl@v3
      - name: Deploy to staging
        run: |
          kubectl --context=staging \
            set image deployment/myapp \
            myapp=${{ env.REGISTRY }}/myapp:${{ github.sha }}
          kubectl --context=staging rollout status deployment/myapp
```

流水线顺序：**lint → test → build → push → deploy**，每个阶段失败快速反馈。

### 5. 验证

```bash
# Dockerfile 验证
docker build -t myapp:test .

# Helm chart 验证
helm lint charts/myapp
helm template myapp charts/myapp --values charts/myapp/values-dev.yaml

# Kubernetes 资源验证（dry-run）
kubectl apply --dry-run=server -f charts/myapp/templates/

# CI 配置本地验证（可选）
act -j test  # 使用 nektos/act 本地运行 GitHub Actions
```

## 关键约束

- **不要修改业务逻辑代码**（.ts/.tsx/.py 等应用代码）
- **不要修改数据库 schema 或 API 路由**
- **不要在生产环境直接执行变更**（仅 PR + CI 部署）
- **不要在 CI 配置中硬编码密钥或凭证**（使用 secrets）
- 部署脚本必须支持重复执行不产生副作用（幂等性）
- 每次部署必须可回滚到上一个版本（保留 previous replica）

## 质量标准

- Dockerfile 通过 `docker build` 验证（多阶段、非 root、最小基础镜像）
- Helm chart 通过 `helm lint` 验证，`values.yaml` 可配置化
- CI/CD 配置在 dry-run 模式下通过
- 所有变更通过 PR 提交，不直接修改集群
- 配置文件模板化（values.yaml / env vars），不硬编码环境特定值
- 健康检查端点（liveness/readiness probe）已配置

## 完成后

1. 运行验证命令（`docker build` / `helm lint` / `kubectl dry-run`）
2. 使用 `submit-pr` skill 提交 PR
3. 调用 `PUT /api/task/status/{taskId}` 将任务状态更新为 `in-review`