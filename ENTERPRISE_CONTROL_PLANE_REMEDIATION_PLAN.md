---
title: DockerProxy Enterprise Control Plane Remediation Plan
document_type: remediation-plan
status: draft
execution_state: planning-only
content_mode: verbatim-plan-copy
repo: DockerProxy
workspace: E:\work\vscode\DockerProxy
created_at: 2026-04-06
timezone: Asia/Shanghai
source_context:
  - enterprise-system-planning
  - gateway-runtime-model
  - compose-first-migration-model
  - environment-access-governance
source_plan_title: DockerProxy 企业级控制面规范规划（环境 / 网关 / 迁移一体化）
source_plan_mode: proposed_plan
related_docs:
  - docs/project-prompt.md
  - docs/iteration-log.md
  - docs/frontend-standards.md
note: 本文档仅为整改计划记录，不代表当前系统已经完成整改或已进入实施阶段。
---

# DockerProxy 企业级整改计划

> 说明：本文档仅用于记录当前阶段确认的企业级整改计划与系统规划。
> 本文档内容属于整改方案，不代表相关能力已经开发完成、联调完成或上线验收通过。
> 除文档元数据和本说明外，其余内容为既有规划原文保留，不做摘要化改写。

# DockerProxy 企业级控制面规范规划（环境 / 网关 / 迁移一体化）

## Summary
- 当前方向里，`环境接入 = 连接目标`、`迁移 = Compose-first`、`网关 = 运行时发现优先` 这三条主线是对的，**而且对后续 Docker 迁移是有直接帮助的**。
- 但它们现在还停留在实现层规则，没上升为平台级契约。企业级版本需要补两层：`资源模型分层` 和 `托管级别分层`。
- 规划结论：
  - `workdir/configDir` 不能再被理解成“查询边界”，只能是“平台托管落盘边界”。
  - `nginx host` 和 `dockerized nginx` 必须统一纳入同一个网关运行时模型。
  - `域名 -> 目标地址` 不能再是扁平字符串，必须建模成 `upstream kind`，否则无法支撑企业级迁移和回滚。
- 对后续 Docker 迁移的核心帮助在于：
  - 能明确区分哪些资源是 `可发现`、`可托管`、`可重建`、`仅可展示`。
  - 能把 `docker service 名称型 upstream`、网络依赖、卷依赖、配置依赖显式纳入迁移计划。
  - 能防止把 Docker 内部路径、容器 writable layer、只存在容器内的网关配置误当成可迁移资产。

## Key Changes
### 1. 平台资源模型统一
- `Environment` 定义为：连接目标 + 能力画像 + 托管工作区。
- `managedWorkspace` 取代当前用户心智里的 `workdir`：
  - 用于部署落盘、迁移恢复目录、平台工件目录。
  - **不是** Docker/Compose/Nginx 的可见性边界。
- `Gateway` 定义为独立资源，必须包含运行时画像：
  - `runtimeKind: host-nginx | docker-nginx`
  - `configPersistence: host-fs | docker-bind-mount | container-only`
  - `inspectMethod: host-command | docker-exec`
  - `applyMethod: host-write | docker-copy`
- `Project` 定义为 Compose 应用资源：
  - 来源仅允许 `runtime-discovered | manually-registered | platform-managed`
  - 不再允许运行态猜测式单容器模型回流。
- `Route` 定义为平台路由资源，不再只是 `domain + target`：
  - `origin: managed | adopted | readonly-imported`
  - `upstreamKind: host-endpoint | docker-service | upstream-block | variable-proxy | external-url`
  - `upstreamValue`
  - `resolvedTarget?`
  - `sourceConfPath?`
  - `renderProfile: host-http | host-https | docker-service-http | docker-service-https`

### 2. 网关层企业级规范
- 网关保持 `Nginx-first`，但内部模型必须是“运行时驱动 + 托管级别”两层。
- 发现顺序固定：
  1. `nginx -T`
  2. `docker exec <nginx-container> nginx -T`
  3. 仅在前两者失败时回退到配置目录扫描
- 导入策略固定为三档：
  - `managed`：平台生成并完全负责写入、更新、删除、回滚
  - `adopted`：从 Nginx 导入后转换为平台托管
  - `readonly-imported`：只能展示和预检查，不允许平台直接改写
- 解析策略固定：
  - 支持常见反向代理模式，包括同域名 `80 -> 443`、`set $var literal`、`proxy_pass http://$var`
  - 遇到 `map/include/复杂 upstream/动态变量链/多语义 location`，直接降级为 `readonly-imported`
  - 不再用“尽量猜出来”替代明确建模
- 反解析/下发策略固定：
  - 平台新增路由统一生成标准化 conf
  - 下发时按 `Gateway.runtimeKind + configPersistence` 决定：
    - 宿主机 Nginx：写宿主机路径并 reload
    - Docker Nginx 且 bind mount：写宿主机挂载目录并 reload 容器
    - Docker Nginx 且 container-only：允许发现，不允许标记为 fully managed
- 删除策略固定：
  - 只有 `managed` / `adopted` 路由允许真实删除
  - 删除必须基于 `sourceConfPath` 或平台托管路径，且必须执行真实 Nginx reload
  - `readonly-imported` 不允许 destructive delete

### 3. 迁移层企业级规范
- 迁移继续保持 `Compose-first`，这是正确方向，不改回运行态猜测。
- 迁移资产边界固定：
  - 支持：Compose 文件、env 文件、named volume、bind mount、镜像
  - 阻断：anonymous volume、writable layer、Docker 内部路径、containerd 路径、临时系统路径
- 迁移计划必须显式增加两类依赖：
  - `networkDependencies`
    - Docker 网络
    - 依赖的服务名型 upstream（例如 `new-api:3000`）
  - `gatewayDependencies`
    - 域名路由
    - 证书
    - 反向代理托管状态
- 迁移和网关的协同规则固定：
  - `upstreamKind = docker-service` 的路由，必须在迁移预检查里校验目标侧网络与服务名可达
  - `readonly-imported` 网关配置不得自动纳入“平台可重建资产”，只能作为迁移风险提示或人工步骤
  - `managed` / `adopted` 路由可以在迁移后自动重建或校验
- `managedWorkspace` 对迁移的帮助是实质性的：
  - 统一目标落盘目录
  - 统一临时工件、归档、校验和、回滚文件位置
  - 但它不负责“发现项目”，发现仍以 `docker compose ls` + `docker compose config` 为主

### 4. 控制面与 UI 规范
- 环境接入页：
  - 主表单只展示连接信息
  - `managedWorkspace` 进入高级设置
  - 文案明确写成“平台托管工作区”，禁止继续暗示目录读取范围
- 网关页：
  - 顶部展示 `runtime profile`
  - 路由列表按 `managed / adopted / readonly-imported` 分组或筛选
  - 导入结果必须区分 `imported / updated / skipped / readonly`
  - 显示 `upstream kind` 和 `resolved target`
- 迁移控制台：
  - 在计划页增加“外部依赖”分区，显示网关、证书、网络、DNS 依赖
  - 对不可自动重建的网关配置给出显式阻断或人工步骤
- 审计和可追踪性：
  - 所有导入、adopt、删除、下发、reload、迁移预检查都必须写审计事件
  - 事件对象至少包含：环境、网关、项目、路径、操作者、时间、结果

## Public APIs / Interfaces / Types
- `EnvironmentSummary`
  - 保留 `workdir` 字段作为兼容输入，但产品语义统一为 `managedWorkspace`
  - 后续 UI 与文档全部用“平台托管工作区”
- `GatewaySummary / GatewayDetails`
  - 新增 `runtimeKind`
  - 新增 `configPersistence`
  - 新增 `inspectMethod`
  - 新增 `applyMethod`
  - 新增 `managedCapabilities`
- `ProxyRoute`
  - 新增 `origin`
  - 新增 `upstreamKind`
  - 新增 `upstreamValue`
  - 新增 `resolvedTarget`
  - 保留 `sourceConfPath`
  - 保留 `managedState`，但语义统一到 `managed | adopted | readonly-imported`
- `MigrationPlan`
  - 新增 `networkDependencies`
  - 新增 `gatewayDependencies`
  - 新增 `rebuildableAssets`
  - 新增 `manualSteps`
- 接口层默认形态：
  - `GET /api/gateways/:id/runtime-profile`
  - `POST /api/gateways/:id/sync-nginx`
  - `POST /api/gateways/:id/routes/:routeId/adopt`
  - `GET /api/migrate/projects` 继续返回 `discoveryMeta`
  - `POST /api/migrate/plans` 必须返回网关/网络依赖摘要
- 兼容策略：
  - 旧 `managed/imported` 字段先保留一轮
  - 新模型落地后统一收敛，避免双语义长期共存

## Test Plan
- 环境与发现
  - 项目在 `managedWorkspace` 外但存在于 `docker compose ls` 时，必须能发现
  - `managedWorkspace` 不存在时，不得导致项目发现失败
- 网关运行时
  - 宿主机 Nginx 与 dockerized Nginx 都能完成发现
  - Docker Nginx 但配置仅存在容器内部时，必须标记为 `readonly-imported`
  - Docker Nginx 且配置 bind mount 到宿主机时，允许进入 `managed/adopted`
- 路由建模
  - `set $upstream "new-api:3000"; proxy_pass http://$upstream;` 能识别为 `docker-service` 或 `variable-proxy`
  - 复杂 `map/include/upstream group` 配置不得被误导入为 fully managed
- 删除与下发
  - `managed/adopted` 路由删除后，真实 conf 文件被删除且 Nginx reload
  - `readonly-imported` 路由删除按钮不可触发真实 destructive 操作
- 迁移
  - 迁移计划能显式展示 `docker-service` 型网关依赖
  - 目标侧缺少所需网络、证书或 gateway capability 时，预检查必须告警或阻断
  - 迁移后 `managed/adopted` 路由可验证，`readonly-imported` 路由进入人工步骤
- 治理
  - 无目录型“查询边界”残留文案
  - 无同一能力多套逻辑并行
  - 迭代日志与文档同步更新

## Assumptions
- 当前阶段按 `Nginx-first` 规划，不提前抽象多网关驱动实现。
- 迁移继续只支持标准 Compose 项目，不扩展到 standalone container / Swarm / Kubernetes。
- `managedWorkspace` 保留，作为平台落盘与回滚边界；但不再承担发现边界语义。
- 企业级规范默认选择“能安全降级为只读，也不强行托管复杂配置”。
- DB 继续作为平台权威数据源；Nginx 运行配置是可导入、可校验、可下发的运行态产物，不是主领域模型。

## Design Basis
- Docker 官方：
  - [`docker compose ls`](https://docs.docker.com/reference/cli/docker/compose/ls/)
  - [`docker compose config`](https://docs.docker.com/reference/cli/docker/compose/config/)
  - [Storage](https://docs.docker.com/engine/storage/)
  - [Volumes](https://docs.docker.com/engine/storage/volumes/)
  - [`docker container commit`](https://docs.docker.com/reference/cli/docker/container/commit/)
- Nginx 官方：
  - [`nginx -T` command-line parameters](https://nginx.org/en/docs/switches.html)
  - [`resolver` directive](https://nginx.org/en/docs/http/ngx_http_core_module.html)
  - [`proxy_pass` directive](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- 同类产品设计依据：
  - [Portainer Environments](https://docs.portainer.io/admin/environments/environments)
  - [Portainer Stacks](https://docs.portainer.io/2.21/user/docker/stacks)
  - [Coolify Server / Application model](https://coolify.io/docs/knowledge-base/server/introduction)
  - [Coolify Applications](https://coolify.io/docs/applications/)
