import { Router } from "express";
import si from "systeminformation";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const [cpu, mem, os, currentLoad, fsSize, networkStats, inetLatency] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.osInfo(),
      si.currentLoad(),
      si.fsSize(),
      si.networkStats(),
      si.inetLatency('8.8.8.8')
    ]);

    // Calculate network traffic (bytes per second)
    let rx_sec = 0;
    let tx_sec = 0;
    if (networkStats && networkStats.length > 0) {
      networkStats.forEach(net => {
        rx_sec += net.rx_sec || 0;
        tx_sec += net.tx_sec || 0;
      });
    }

    res.json({
      cpu: {
        manufacturer: cpu.manufacturer,
        brand: cpu.brand,
        cores: cpu.cores,
        load: currentLoad.currentLoad,
      },
      memory: {
        total: mem.total,
        used: mem.active,
        free: mem.available,
      },
      os: {
        platform: os.platform,
        distro: os.distro,
        release: os.release,
        uptime: si.time().uptime,
      },
      disk: fsSize.map(d => ({
        fs: d.fs,
        size: d.size,
        used: d.used,
        use: d.use,
        mount: d.mount
      })),
      network: {
        latency: inetLatency,
        rx_sec,
        tx_sec,
      }
    });
  } catch (error) {
    console.error("Monitor API Error:", error);
    res.status(500).json({ error: "Failed to fetch system information" });
  }
});

export default router;
