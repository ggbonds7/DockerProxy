import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { initConfig } from "./server/utils/config";
import { initNginx } from "./server/services/nginx";
import { authMiddleware } from "./server/utils/auth";

import authRoutes from "./server/routes/auth";
import configRoutes from "./server/routes/config";
import dockerRoutes from "./server/routes/docker";
import dnsRoutes from "./server/routes/dns";
import proxyRoutes from "./server/routes/proxy";
import certsRoutes from "./server/routes/certs";
import migrateRoutes from "./server/routes/migrate";
import deployRoutes from "./server/routes/deploy";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 初始化配置和 Nginx
  initConfig();
  initNginx();

  // 中间件配置
  app.use(cors());
  app.use(morgan('dev'));
  app.use(express.json());
  app.use(cookieParser());

  // API 路由
  app.use("/api/auth", authRoutes);
  
  // 保护后续路由
  app.use("/api", authMiddleware);
  
  app.use("/api/config", configRoutes);
  app.use("/api/docker", dockerRoutes);
  app.use("/api/dns", dnsRoutes);
  app.use("/api/proxy", proxyRoutes);
  app.use("/api/certs", certsRoutes);
  app.use("/api/migrate", migrateRoutes);
  app.use("/api/deploy", deployRoutes);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
