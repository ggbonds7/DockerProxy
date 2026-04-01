# 2026-04-01 Docker 部署修复与优化

## 问题描述
用户在服务器上使用 `docker-compose up -d` 部署项目时，由于前端使用 `node:18-alpine` 环境构建导致 Vite 和 TailwindCSS 缺乏 `linux-musl` 相关的 native binding 可选依赖，从而在 `npm run build` 阶段执行失败（`Error: Cannot find native binding`）。同时 `docker-compose.yml` 发出了过时 `version` 属性的警告。

## 修复内容
1. **Dockerfile 依赖安装过程优化**：在 `Dockerfile` 中的 `RUN npm install` 之前增加对 `package-lock.json`（如果由于宿主机不同平台传入容器引起的跨平台锁文件）和 `node_modules` 的清理，强制 `npm` 在 Alpine Linux 环境中重新解析并获取对应的 native bindings （`linux-musl`）。
2. **新增 `.dockerignore` 文件**：添加了 `.dockerignore` 文件并排除了 `node_modules`、`dist`、`.git` 等文件，避免在执行 `COPY . .` 时将开发宿主机（如 MacOS/Windows 平台）残留的依赖包直接覆盖容器中的正确依赖。
3. **修复 docker-compose 警告**：移除了 `docker-compose.yml` 开头废弃的 `version` 属性，消除部署警告提示。
4. **修复启动时死循环崩溃问题（Missing script: start）**：排查发现 `Dockerfile` 最终指令设定为 `CMD ["npm", "start"]` 运行后端，但在 `package.json` 中遗漏了 `"start"` 脚本。已经补充了 `"start": "tsx server.ts"` 命令，使得容器不再一运行就抛错闪退。
5. **修复前端“容器管理”页面白屏崩溃**：在 `App.tsx` 的容器列表读取数据时，当某个异常容器缺少完整 `Names` 字段时，执行 `c.Names[0]` 会导致前端 `Cannot read properties of undefined (reading '0')` 并白屏挂掉。修改为可选链（Optional Chaining）加默认值回退 `c.Names?.[0] || 'Unknown'` 的鲁棒写法。

## 验证
在服务器或本地重新运行 `docker compose up -d --build` 重新构建即可生效且不产生警告，后端监听 3000 端口。
