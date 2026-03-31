import fs from "fs";
import path from "path";
import { CONFIG } from "../utils/config";
import { docker } from "./docker";

export const ROUTES_FILE = path.join(process.cwd(), 'data', 'routes.json');

export function initNginx() {
  if (!fs.existsSync(ROUTES_FILE)) fs.writeFileSync(ROUTES_FILE, JSON.stringify([]));
}

export function getRoutes() {
  return JSON.parse(fs.readFileSync(ROUTES_FILE, 'utf-8'));
}

export function saveRoutes(routes: any[]) {
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(routes, null, 2));
}

export async function reloadNginx() {
  try {
    const nginxContainer = docker.getContainer(CONFIG.NGINX_CONTAINER_NAME);
    const exec = await nginxContainer.exec({
      Cmd: ['nginx', '-s', 'reload'],
      AttachStdout: true,
      AttachStderr: true
    });
    await exec.start({});
    return true;
  } catch (error: any) {
    console.error("Nginx reload 失败:", error.message);
    throw error;
  }
}

export function generateNginxConf(route: any) {
  return `
server {
    listen 80;
    server_name ${route.domain};

    location / {
        proxy_pass http://${route.targetIp}:${route.targetPort};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
}
