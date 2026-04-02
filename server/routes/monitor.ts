import { Router } from "express";
import { getMonitorSnapshot } from "../services/monitor";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const snapshot = await getMonitorSnapshot();
    res.json(snapshot);
  } catch (error) {
    console.error("Monitor API Error:", error);
    res.status(500).json({ error: "Failed to fetch system information" });
  }
});

export default router;
