import { Router } from "express";
import fs from "fs";
import path from "path";
import { CONFIG, loadConfig } from "../utils/config";
import { getDb } from "../db";

const router = Router();

router.get("/", (_req, res) => {
  const db = getDb();
  const environmentCount =
    (db.prepare("SELECT COUNT(*) AS count FROM environments").get() as { count: number } | undefined)?.count || 0;
  const providerConnectionCount =
    (db.prepare("SELECT COUNT(*) AS count FROM integrations WHERE kind = 'dns-provider'").get() as { count: number } | undefined)?.count || 0;

  res.json({
    nginxContainer: CONFIG.NGINX_CONTAINER_NAME,
    certAgentContainer: CONFIG.CERT_AGENT_CONTAINER_NAME,
    vpsIp: CONFIG.VPS_PUBLIC_IP,
    hasAppMasterKey: !!CONFIG.APP_MASTER_KEY,
    environmentCount,
    providerConnectionCount,
  });
});

router.get("/env", (_req, res) => {
  const envPath = path.join(process.cwd(), ".env");
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

  if (!content.trim()) {
    content = `# System runtime configuration\nADMIN_USERNAME=${CONFIG.ADMIN_USERNAME}\nADMIN_PASSWORD=${CONFIG.ADMIN_PASSWORD}\nJWT_SECRET=${CONFIG.JWT_SECRET}\nNGINX_CONTAINER_NAME=${CONFIG.NGINX_CONTAINER_NAME}\nCERT_AGENT_CONTAINER_NAME=${CONFIG.CERT_AGENT_CONTAINER_NAME}\nVPS_PUBLIC_IP=${CONFIG.VPS_PUBLIC_IP}\nAPP_MASTER_KEY=${CONFIG.APP_MASTER_KEY}\nPLATFORM_MANAGED_NETWORKS=${CONFIG.PLATFORM_MANAGED_NETWORKS.join(",")}\n`;
  }

  res.send(content);
});

router.post("/env", (req, res) => {
  const { content } = req.body;
  if (typeof content !== "string") {
    return res.status(400).json({ error: "配置内容必须是字符串" });
  }

  try {
    const envPath = path.join(process.cwd(), ".env");
    fs.writeFileSync(envPath, content, "utf-8");
    loadConfig();
    res.json({ success: true, message: "配置已保存" });
  } catch (error: any) {
    res.status(500).json({ error: "保存配置失败", details: error.message });
  }
});

export default router;
