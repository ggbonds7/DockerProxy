import { Router } from "express";
import { getContainers, containerAction, getContainerLogs } from "../services/docker";

const router = Router();

router.get("/containers", async (req, res) => {
  try {
    const containers = await getContainers();
    res.json(containers);
  } catch (error: any) {
    res.status(500).json({ error: "获取容器列表失败", details: error.message });
  }
});

router.post("/container/:id/:action", async (req, res) => {
  const { id, action } = req.params;
  try {
    await containerAction(id, action);
    res.json({ success: true, message: `容器 ${id} ${action} 成功` });
  } catch (error: any) {
    res.status(500).json({ error: `容器操作失败`, details: error.message });
  }
});

router.get("/container/:id/logs", async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await getContainerLogs(id);
    res.send(logs);
  } catch (error: any) {
    res.status(500).json({ error: "获取日志失败", details: error.message });
  }
});

export default router;
