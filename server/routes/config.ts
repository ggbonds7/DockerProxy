import { Router } from "express";
import fs from "fs";
import path from "path";
import { CONFIG, loadConfig } from "../utils/config";

const router = Router();

// 获取当前系统配置状态
router.get("/", (req, res) => {
  res.json({
    nginxContainer: CONFIG.NGINX_CONTAINER_NAME,
    certAgentContainer: CONFIG.CERT_AGENT_CONTAINER_NAME,
    vpsIp: CONFIG.VPS_PUBLIC_IP,
    hasCfToken: !!CONFIG.CF_API_TOKEN,
    hasCfZone: !!CONFIG.CF_ZONE_ID,
    cfProxied: CONFIG.CF_PROXIED,
    cfTtl: CONFIG.CF_TTL,
    allowedDomains: CONFIG.ALLOWED_DOMAINS
  });
});

// 获取 .env 文件内容，如果为空则生成默认配置展示
router.get("/env", (req, res) => {
  const envPath = path.join(process.cwd(), '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  
  // 如果 .env 为空，则根据现有配置生成默认展示内容
  if (!content.trim()) {
    content = `# 默认环境变量配置 (自动生成)
ADMIN_USERNAME=${CONFIG.ADMIN_USERNAME}
ADMIN_PASSWORD=${CONFIG.ADMIN_PASSWORD}
JWT_SECRET=${CONFIG.JWT_SECRET}
NGINX_CONTAINER_NAME=${CONFIG.NGINX_CONTAINER_NAME}
CERT_AGENT_CONTAINER_NAME=${CONFIG.CERT_AGENT_CONTAINER_NAME}
VPS_PUBLIC_IP=${CONFIG.VPS_PUBLIC_IP}
CF_API_TOKEN=${CONFIG.CF_API_TOKEN}
CF_ZONE_ID=${CONFIG.CF_ZONE_ID}
CF_PROXIED=${CONFIG.CF_PROXIED}
CF_TTL=${CONFIG.CF_TTL}
ALLOWED_DOMAINS=${CONFIG.ALLOWED_DOMAINS.join(',')}
`;
  }
  res.send(content);
});

// 保存 .env 文件内容并重新加载配置
router.post("/env", (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: "内容格式不正确" });
  }
  try {
    const envPath = path.join(process.cwd(), '.env');
    fs.writeFileSync(envPath, content, 'utf-8');
    loadConfig(); // 重新加载配置
    res.json({ success: true, message: "配置已保存并生效" });
  } catch (error: any) {
    res.status(500).json({ error: "保存失败", details: error.message });
  }
});

export default router;
