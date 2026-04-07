import { Router } from "express";
import { createRoute, deleteRoute, getRoutes } from "../services/nginx";
import { getLocalEnvironmentId } from "../services/platform";

const router = Router();

router.get("/routes", (req, res) => {
  try {
    const gatewayId = req.query.gatewayId ? String(req.query.gatewayId) : undefined;
    const serverId = req.query.serverId ? String(req.query.serverId) : undefined;
    res.json(getRoutes({ gatewayId, serverId }));
  } catch (error: any) {
    res.status(500).json({ error: "获取网关路由失败", details: error.message });
  }
});

router.post("/routes", async (req, res) => {
  try {
    const route = await createRoute({
      ...req.body,
      gatewayId: req.body?.gatewayId,
      serverId: req.body?.serverId || getLocalEnvironmentId(),
    });
    res.json({ success: true, route, message: "路由已保存并写入网关配置。" });
  } catch (error: any) {
    res.status(400).json({ error: "保存路由失败", details: error.message });
  }
});

router.delete("/routes/:id", async (req, res) => {
  try {
    const route = await deleteRoute(req.params.id);
    res.json({ success: true, route, message: "路由已删除，并已从网关配置中移除。" });
  } catch (error: any) {
    res.status(400).json({ error: "删除路由失败", details: error.message });
  }
});

export default router;
