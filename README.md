# DockerProxy

DockerProxy 是一个面向 VPS / Docker 环境的运维控制台，提供环境接入、工作负载管理、DNS 平台接入、网关路由、证书与迁移任务等能力。

## 当前技术栈

- Frontend: React 19 + Vite 6 + Tailwind CSS 4 + Ant Design 5 + ProComponents
- Backend: Express + better-sqlite3
- Runtime: Docker / Docker Compose / SSH

## 核心模块

- 基础设施：服务器总览、环境接入
- 应用交付：容器与项目、部署中心
- 网络与域名：DNS 平台接入、DNS 记录、网关路由、证书管理
- 运维任务：迁移控制台、任务队列
- 系统设置：配置管理、主题与账户

## DNS 设计说明

DNS 能力已经统一调整为“平台接入”模型：

- Cloudflare、Gcore 等域名平台通过 UI 里的“DNS 平台接入”进行接入
- 平台凭据不再通过 `.env` 维护
- 域名管理范围、默认 TTL、默认代理状态都在平台接入设置里维护
- DNS 记录页只面向“已接入平台 + Zone”工作

不再支持以下旧式 `.env` DNS 配置：

- `CF_API_TOKEN`
- `CF_ZONE_ID`
- `CF_PROXIED`
- `CF_TTL`
- `ALLOWED_DOMAINS`

## 迁移能力边界

迁移模块已经切换为 `Compose-first` 模型：

- 只支持标准 Docker Compose 项目
- 支持迁移项目目录、`env` 文件、命名卷、bind mount 和镜像
- 执行层由内建 Python worker 负责，Node 只负责 API、会话和事件流
- 默认采用“短暂停机切换”策略：停机前完成镜像预热和预检查，停机后做最终数据同步与目标启动

当前明确不支持以下场景：

- standalone 容器
- anonymous volumes
- 容器 writable layer 数据
- Docker / containerd 内部路径
- Swarm、Kubernetes 和其他非 Compose 编排

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备 `.env`

项目启动只需要系统运行层配置，不再包含 DNS 平台密钥。

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=123456
JWT_SECRET=change-me
APP_MASTER_KEY=change-me-too
NGINX_CONTAINER_NAME=nginx-gateway
CERT_AGENT_CONTAINER_NAME=cert-agent
VPS_PUBLIC_IP=
PLATFORM_MANAGED_NETWORKS=proxy_net
```

说明：

- `APP_MASTER_KEY` 用于加密存储平台接入密钥和环境凭据
- DNS 平台 Token / API Key 请在 UI 的“DNS 平台接入”中录入

### 3. 本地开发

```bash
npm run dev
```

访问地址：

```text
http://localhost:3000
```

### 4. 生产构建

```bash
npm run build
npm run start
```

## 常用脚本

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## 数据目录

运行过程中会在 `data/` 下生成应用数据：

- `app.db`：SQLite 数据库
- `nginx/`：网关配置与相关产物
- 其他任务或项目数据目录

## 前端开发规则

- 前端技术栈固定为 `React + Vite + Tailwind CSS + Ant Design`
- 默认组件优先级为 `Ant Design + ProComponents`
- 只有成熟开源组件无法满足需求时才允许二次开发
- 菜单必须由路由驱动，并支持可扩展的一级分组与二级菜单
- 每个二级菜单必须对应独立页面，禁止把多个业务块堆在一个页面
- 全局主题、API Client、全局提示、路由元数据必须集中维护，避免污染性代码
- 详细规范见 [docs/frontend-standards.md](./docs/frontend-standards.md)

## License

[MIT](./LICENSE)

## Project Prompt And Iteration Log

- Repository-wide engineering rules: [docs/project-prompt.md](./docs/project-prompt.md)
- Iteration record and metadata: [docs/iteration-log.md](./docs/iteration-log.md)
