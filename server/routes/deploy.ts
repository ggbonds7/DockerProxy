import { Router } from "express";
import axios from "axios";
import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { CONFIG } from "../utils/config";

const execAsync = promisify(exec);
const router = Router();

router.get("/dockerhub", async (req, res) => {
  const image = req.query.image as string;
  if (!image) return res.status(400).json({ error: "必须提供 image 参数" });

  try {
    let [namespace, repo] = image.split('/');
    if (!repo) {
      repo = namespace;
      namespace = 'library';
    }
    const [repoName, tag] = repo.split(':');

    const hubRes = await axios.get(`https://hub.docker.com/v2/repositories/${namespace}/${repoName}`);
    const description = hubRes.data.description;

    const composeObj = {
      services: {
        [repoName]: {
          image: image,
          container_name: repoName,
          restart: "unless-stopped",
          ports: ["8080:80"],
          networks: ["proxy_net"]
        }
      },
      networks: {
        proxy_net: {
          external: true,
          name: "proxy_net"
        }
      }
    };

    const composeYaml = yaml.dump(composeObj);
    res.json({ success: true, compose: composeYaml, description });
  } catch (error: any) {
    res.status(500).json({ error: "获取 DockerHub 信息失败", details: error.message });
  }
});

router.post("/compose", async (req, res) => {
  const { name, composeYaml } = req.body;
  try {
    const config = yaml.load(composeYaml);
    
    // Create a directory for the project
    const projectDir = path.join(CONFIG.DATA_DIR, 'projects', name);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    
    // Save docker-compose.yml
    const composePath = path.join(projectDir, 'docker-compose.yml');
    fs.writeFileSync(composePath, composeYaml);

    // Execute docker-compose up -d
    try {
      // Create proxy_net if it doesn't exist
      await execAsync('docker network inspect proxy_net || docker network create proxy_net');
      
      // Run docker-compose up -d
      const { stdout, stderr } = await execAsync(`docker compose -f "${composePath}" -p "${name}" up -d`);
      res.json({ success: true, message: `成功部署 ${name} 的 Compose 配置`, config, logs: stdout || stderr });
    } catch (execError: any) {
      res.status(500).json({ error: "部署失败", details: execError.message || execError.stderr });
    }
  } catch (error: any) {
    res.status(400).json({ error: "无效的 YAML 格式或处理失败", details: error.message });
  }
});

export default router;
