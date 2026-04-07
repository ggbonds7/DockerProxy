import { Router } from "express";
import {
  createMigrationPlan,
  getMigrationArtifacts,
  getMigrationSession,
  inspectMigrationProject,
  listMigrationProjectCatalog,
  rollbackMigrationSession,
  startMigrationSession,
  subscribeMigrationEvents,
} from "../services/migration/index";

const router = Router();

router.get("/projects", async (req, res) => {
  try {
    const environmentId = String(req.query.environmentId || "local");
    const result = await listMigrationProjectCatalog(environmentId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "获取可迁移项目失败", details: error.message });
  }
});

router.post("/projects/inspect", async (req, res) => {
  try {
    const environmentId = String(req.body?.environmentId || "");
    const projectPath = String(req.body?.projectPath || "");
    const project = await inspectMigrationProject(environmentId, projectPath);
    res.json(project);
  } catch (error: any) {
    res.status(400).json({ error: "校验 Compose 项目失败", details: error.message });
  }
});

router.post("/plans", async (req, res) => {
  try {
    const session = await createMigrationPlan(req.body);
    res.json(session);
  } catch (error: any) {
    res.status(400).json({ error: "生成迁移计划失败", details: error.message });
  }
});

router.get("/sessions/:id", (req, res) => {
  try {
    const session = getMigrationSession(req.params.id);
    res.json(session);
  } catch (error: any) {
    res.status(404).json({ error: "迁移会话不存在", details: error.message });
  }
});

router.get("/sessions/:id/artifacts", (req, res) => {
  try {
    const artifacts = getMigrationArtifacts(req.params.id);
    res.json(artifacts);
  } catch (error: any) {
    res.status(404).json({ error: "获取迁移产物失败", details: error.message });
  }
});

router.post("/sessions/:id/start", async (req, res) => {
  try {
    const session = await startMigrationSession(req.params.id, req.body || {});
    res.json(session);
  } catch (error: any) {
    res.status(400).json({ error: "启动迁移失败", details: error.message });
  }
});

router.post("/sessions/:id/rollback", async (req, res) => {
  try {
    const session = await rollbackMigrationSession(req.params.id);
    res.json(session);
  } catch (error: any) {
    res.status(400).json({ error: "回滚迁移失败", details: error.message });
  }
});

router.get("/sessions/:id/events", (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const unsubscribe = subscribeMigrationEvents(req.params.id, (event) => {
      res.write(`${JSON.stringify(event)}\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(`${JSON.stringify({ type: "heartbeat", ts: new Date().toISOString() })}\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  } catch (error: any) {
    res.status(404).json({ error: "订阅迁移事件失败", details: error.message });
  }
});

export default router;
