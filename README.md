# Docker Proxy Platform (Docker 可视化代理与管理平台)

一个现代化、功能强大的 Web 端 Docker 容器与反向代理管理平台。本项目旨在简化 VPS 上的服务部署、Nginx 路由转发、Cloudflare DNS 解析以及跨主机 Docker 迁移等日常运维工作。

## ✨ 核心特性

- 📊 **主机监控**: 实时监控宿主机的 CPU、内存、磁盘、网络流量与延迟等关键指标，并提供历史负载趋势图。
- 🐳 **容器管理**: 实时监控容器状态，支持启动、停止、重启、删除操作，并可在线实时查看容器日志。
- 🌐 **DNS 解析管理**: 深度集成 Cloudflare API，支持多域名的 DNS 记录可视化增删改查。
- 🚀 **服务快速部署**: 输入镜像名即可自动生成符合最佳实践的 `docker-compose.yml`，自动接入 `proxy_net` 内部网络并一键拉起服务。
- 🔀 **路由转发配置**: 可视化管理 Nginx 反向代理规则，轻松将域名映射到内部 Docker 容器。
- 🔒 **SSL 证书管理**: 集中展示域名证书的有效期与状态，支持一键触发证书续签。
- 🚚 **跨主机全量迁移**: 独创的 SSH 迁移功能，可将本机的 Docker 项目配置及数据一键全量打包并迁移至远程服务器，自动恢复服务。
- ⚙️ **现代化系统管理**: 
  - 内置 JWT 安全登录认证（默认密码可配）。
  - 支持 Web 端实时编辑和重载 `.env` 环境变量。
  - 优雅的明暗主题（Dark/Light Mode）无缝切换。

## 🏗 架构与最佳实践

本项目在部署 Docker 服务时，默认采用 **内部网络隔离（Internal Network Isolation）** 的最佳实践：
- 所有由本平台部署的 Web 服务都会自动加入名为 `proxy_net` 的外部网络。
- 容器仅通过 `expose` 暴露端口给内部网络，而**不使用** `ports` 映射到宿主机。
- Nginx 代理容器同样加入 `proxy_net`，通过容器名（如 `http://container_name:80`）直接进行反向代理。
- **优势**: 彻底杜绝了端口冲突，极大提升了宿主机的安全性，防止服务被外部恶意扫描。

## 🛠 环境要求

- **Node.js**: v18.0 或更高版本
- **Docker**: 20.10+ 及 Docker Compose v2
- **操作系统**: Linux (推荐 Ubuntu/Debian/CentOS)

## 📦 安装与部署

本项目支持使用 Docker Compose 一键部署（推荐），或通过源码手动运行。

### 方式一：Docker Compose 部署（推荐）

1. **克隆项目**
```bash
git clone https://github.com/yourusername/docker-proxy-platform.git
cd docker-proxy-platform
```

2. **配置环境变量**
```bash
cp .env.example .env
# 根据需要修改 .env 文件中的配置
```

3. **一键启动**
```bash
docker compose up -d
```
服务将自动构建并运行在 `http://localhost:3000`。

### 方式二：源码手动部署

1. **克隆项目**
```bash
git clone https://github.com/yourusername/docker-proxy-platform.git
cd docker-proxy-platform
```

2. **安装依赖**
```bash
npm install
```

3. **环境配置**
复制环境变量示例文件并进行修改：
```bash
cp .env.example .env
```
*提示：你也可以在启动后，直接通过 Web 界面的“系统设置”在线修改这些配置。*

4. **启动服务**

**开发模式:**
```bash
npm run dev
```

**生产模式:**
```bash
npm run build
npm start
```
服务默认运行在 `http://localhost:3000`。

## 📝 环境变量说明

| 变量名 | 描述 | 默认值 |
| --- | --- | --- |
| `ADMIN_USERNAME` | Web 控制台登录用户名 | `admin` |
| `ADMIN_PASSWORD` | Web 控制台登录密码 | `123456` |
| `JWT_SECRET` | JWT 签发密钥，请务必修改为随机字符串 | `your-secret-key-change-me` |
| `NGINX_CONTAINER_NAME` | Nginx 代理容器的名称 | `nginx-gateway` |
| `CERT_AGENT_CONTAINER_NAME`| 证书管理容器的名称 | `cert-agent` |
| `VPS_PUBLIC_IP` | 当前 VPS 的公网 IP 地址 | `空` |
| `CF_API_TOKEN` | Cloudflare API Token（需具备 DNS 编辑权限） | `空` |
| `CF_ZONE_ID` | Cloudflare 域名的 Zone ID | `空` |
| `CF_PROXIED` | 添加 DNS 记录时是否默认开启 CF 代理 (小黄云) | `true` |
| `CF_TTL` | DNS 记录的 TTL 值 | `1` (自动) |
| `ALLOWED_DOMAINS` | 允许管理的域名列表，英文逗号分隔 | `example.com,test.com` |

## 🔐 安全建议

1. 首次部署后，请立即登录系统并修改默认的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`。
2. 确保 `JWT_SECRET` 被修改为强随机字符串。
3. 建议将本平台本身也置于 Nginx 反向代理之后，并配置 SSL/TLS 证书以启用 HTTPS 访问。

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 开源。
