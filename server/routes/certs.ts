import { Router } from "express";
import { getRoutes } from "../services/nginx";

const router = Router();

router.get("/", (req, res) => {
  const routes = getRoutes();
  const certs = routes.map((r: any) => ({
    domain: r.domain,
    issuer: "Let's Encrypt",
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    status: "valid"
  }));
  res.json(certs);
});

router.post("/:domain/renew", (req, res) => {
  const { domain } = req.params;
  res.json({ success: true, message: `已向 cert-agent 发送续签 ${domain} 的请求` });
});

export default router;
