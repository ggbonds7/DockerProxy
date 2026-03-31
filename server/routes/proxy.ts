import { Router } from "express";
import fs from "fs";
import path from "path";
import { getRoutes, saveRoutes, generateNginxConf, reloadNginx } from "../services/nginx";
import { CONFIG } from "../utils/config";

const router = Router();

router.get("/routes", (req, res) => {
  res.json(getRoutes());
});

router.post("/routes", async (req, res) => {
  const newRoute = { id: Date.now().toString(), ...req.body };
  const routes = getRoutes();
  routes.push(newRoute);
  saveRoutes(routes);

  const confContent = generateNginxConf(newRoute);
  const confPath = path.join(CONFIG.NGINX_CONF_DIR, `${newRoute.domain}.conf`);
  fs.writeFileSync(confPath, confContent);

  try {
    await reloadNginx();
    res.json({ success: true, message: "路由已添加并重载 Nginx" });
  } catch (error: any) {
    res.status(500).json({ error: "Nginx 重载失败", details: error.message });
  }
});

router.delete("/routes/:id", async (req, res) => {
  const routes = getRoutes();
  const index = routes.findIndex((r: any) => r.id === req.params.id);
  if (index !== -1) {
    const route = routes[index];
    routes.splice(index, 1);
    saveRoutes(routes);

    const confPath = path.join(CONFIG.NGINX_CONF_DIR, `${route.domain}.conf`);
    if (fs.existsSync(confPath)) fs.unlinkSync(confPath);

    try {
      await reloadNginx();
      res.json({ success: true, message: "路由已删除并重载 Nginx" });
    } catch (error: any) {
      res.status(500).json({ error: "Nginx 重载失败", details: error.message });
    }
  } else {
    res.status(404).json({ error: "路由未找到" });
  }
});

export default router;
