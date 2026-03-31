import { Router } from "express";
import { NodeSSH } from "node-ssh";
import path from "path";
import fs from "fs";
import { CONFIG } from "../utils/config";

const router = Router();

router.post("/", async (req, res) => {
  const { host, port, username, password, privateKey } = req.body;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const log = (msg: string) => res.write(`[${new Date().toISOString()}] ${msg}\n`);
  const ssh = new NodeSSH();

  try {
    log(`开始连接到目标机器 ${host}:${port}...`);
    await ssh.connect({ host, port, username, password, privateKey });
    log("SSH 连接成功！");

    log("检查目标机器 Docker 环境...");
    const dockerCheck = await ssh.execCommand('docker --version');
    if (dockerCheck.code !== 0) {
      throw new Error("目标机器未安装 Docker 或无法执行 docker 命令");
    }
    log(`目标机器 Docker 版本: ${dockerCheck.stdout}`);

    const projectsDir = path.join(CONFIG.DATA_DIR, 'projects');
    const remoteProjectsDir = '/opt/docker-projects'; // 默认迁移到目标机器的这个目录

    if (fs.existsSync(projectsDir)) {
      log(`开始传输项目数据到目标机器 ${remoteProjectsDir}...`);
      await ssh.execCommand(`mkdir -p ${remoteProjectsDir}`);
      
      // 使用 putDirectory 传输整个项目目录
      const failed: any[] = [];
      const successful: any[] = [];
      await ssh.putDirectory(projectsDir, remoteProjectsDir, {
        recursive: true,
        concurrency: 2,
        tick: (localPath, remotePath, error) => {
          if (error) {
            failed.push(localPath);
            log(`传输失败: ${localPath}`);
          } else {
            successful.push(localPath);
          }
        }
      });
      log(`数据传输完成。成功: ${successful.length} 个文件，失败: ${failed.length} 个文件。`);

      log("在目标机器上启动服务...");
      // 创建 proxy_net 网络
      await ssh.execCommand('docker network inspect proxy_net || docker network create proxy_net');
      
      // 遍历项目目录，执行 docker compose up -d
      const projects = fs.readdirSync(projectsDir);
      for (const project of projects) {
        const remoteComposePath = path.join(remoteProjectsDir, project, 'docker-compose.yml').replace(/\\/g, '/');
        const checkFile = await ssh.execCommand(`ls ${remoteComposePath}`);
        if (checkFile.code === 0) {
          log(`正在启动项目 ${project}...`);
          const upResult = await ssh.execCommand(`docker compose -f "${remoteComposePath}" -p "${project}" up -d`);
          if (upResult.code === 0) {
            log(`项目 ${project} 启动成功。`);
          } else {
            log(`项目 ${project} 启动失败: ${upResult.stderr}`);
          }
        }
      }
    } else {
      log("当前机器没有项目数据需要迁移。");
    }

    log("全量迁移任务执行完毕！");
  } catch (error: any) {
    log(`迁移失败: ${error.message}`);
  } finally {
    ssh.dispose();
    res.end();
  }
});

export default router;
