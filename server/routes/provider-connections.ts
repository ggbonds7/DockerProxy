import { Router } from "express";
import {
  createConnectionRecord,
  createProviderConnection,
  deleteConnectionRecord,
  getProviderCatalog,
  listConnectionRecords,
  listConnectionZones,
  listProviderConnections,
  updateConnectionRecord,
  updateProviderConnectionSettings,
  verifyProviderConnection,
} from "../services/providers";
import { appendJobEvent, createJob, updateJob } from "../services/jobs";

const router = Router();

router.get("/catalog", (_req, res) => {
  res.json(getProviderCatalog());
});

router.get("/", (_req, res) => {
  try {
    res.json(listProviderConnections());
  } catch (error: any) {
    res.status(500).json({ error: "获取平台接入列表失败", details: error.message });
  }
});

router.post("/", async (req, res) => {
  const jobId = createJob({
    kind: "dns-provider-create",
    status: "running",
    metadata: {
      provider: req.body?.provider || null,
      displayName: req.body?.displayName || null,
    },
  });

  appendJobEvent(jobId, "info", "create", `开始创建 DNS 平台接入：${req.body?.displayName || req.body?.provider || "未命名连接"}`);

  try {
    const connection = await createProviderConnection(req.body);
    updateJob(jobId, "completed", {
      provider: connection?.provider || req.body?.provider || null,
      connectionId: connection?.id || null,
      displayName: connection?.displayName || req.body?.displayName || null,
    });
    appendJobEvent(jobId, "info", "verify", "平台接入创建成功，已完成连通性校验");
    res.json(connection);
  } catch (error: any) {
    updateJob(jobId, "failed", {
      provider: req.body?.provider || null,
      displayName: req.body?.displayName || null,
      error: error.message,
    });
    appendJobEvent(jobId, "error", "create", `创建 DNS 平台接入失败：${error.message}`);
    res.status(400).json({ error: "创建平台接入失败", details: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const connection = await updateProviderConnectionSettings(req.params.id, req.body || {});
    res.json(connection);
  } catch (error: any) {
    res.status(400).json({ error: "更新平台接入设置失败", details: error.message });
  }
});

router.post("/:id/verify", async (req, res) => {
  const jobId = createJob({
    kind: "dns-provider-verify",
    status: "running",
    metadata: {
      connectionId: req.params.id,
    },
  });

  appendJobEvent(jobId, "info", "verify", `开始验证 DNS 平台接入：${req.params.id}`);

  try {
    const connection = await verifyProviderConnection(req.params.id);
    updateJob(jobId, "completed", {
      connectionId: req.params.id,
      provider: connection?.provider || null,
      displayName: connection?.displayName || null,
    });
    appendJobEvent(jobId, "info", "verify", `DNS 平台接入 ${req.params.id} 验证成功`);
    res.json(connection);
  } catch (error: any) {
    updateJob(jobId, "failed", {
      connectionId: req.params.id,
      error: error.message,
    });
    appendJobEvent(jobId, "error", "verify", `DNS 平台接入 ${req.params.id} 验证失败：${error.message}`);
    res.status(400).json({ error: "验证平台接入失败", details: error.message });
  }
});

router.get("/:id/zones", async (req, res) => {
  try {
    const zones = await listConnectionZones(req.params.id, {
      includeAll: String(req.query.scope || "") === "all",
    });
    res.json(zones);
  } catch (error: any) {
    res.status(400).json({ error: "获取 Zone 列表失败", details: error.message });
  }
});

router.get("/:id/records", async (req, res) => {
  const zone = String(req.query.zone || "");
  if (!zone) {
    return res.status(400).json({ error: "缺少 zone 参数" });
  }

  try {
    const records = await listConnectionRecords(req.params.id, zone);
    res.json(records);
  } catch (error: any) {
    res.status(400).json({ error: "获取 DNS 记录失败", details: error.message });
  }
});

router.post("/:id/records", async (req, res) => {
  const zone = String(req.query.zone || "");
  if (!zone) {
    return res.status(400).json({ error: "缺少 zone 参数" });
  }

  try {
    const result = await createConnectionRecord(req.params.id, zone, req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: "创建 DNS 记录失败", details: error.message });
  }
});

router.put("/:id/records/:recordId", async (req, res) => {
  const zone = String(req.query.zone || "");
  if (!zone) {
    return res.status(400).json({ error: "缺少 zone 参数" });
  }

  try {
    const result = await updateConnectionRecord(req.params.id, zone, req.params.recordId, req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: "更新 DNS 记录失败", details: error.message });
  }
});

router.delete("/:id/records/:recordId", async (req, res) => {
  const zone = String(req.query.zone || "");
  if (!zone) {
    return res.status(400).json({ error: "缺少 zone 参数" });
  }

  try {
    const result = await deleteConnectionRecord(req.params.id, zone, req.params.recordId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: "删除 DNS 记录失败", details: error.message });
  }
});

export default router;
