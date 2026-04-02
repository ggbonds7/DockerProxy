import Docker from "dockerode";

// 初始化 Docker 客户端，连接到本地 Docker 守护进程
export const docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' });

export async function getContainers() {
  const containers = await docker.listContainers({ all: true });
  return containers.map(c => ({
    id: c.Id.substring(0, 12),
    name: c.Names[0].replace('/', ''),
    image: c.Image,
    state: c.State,
    status: c.Status,
    ports: c.Ports.map(p => `${p.PublicPort || ''}:${p.PrivatePort}/${p.Type}`).filter(p => !p.startsWith(':')),
    sourceKind: c.Labels?.["com.docker.compose.project"] ? 'compose-project' : 'standalone-container',
    composeProject: c.Labels?.["com.docker.compose.project"] || undefined,
    composeService: c.Labels?.["com.docker.compose.service"] || undefined,
  }));
}

export async function containerAction(id: string, action: string) {
  const container = docker.getContainer(id);
  switch (action) {
    case 'start': await container.start(); break;
    case 'stop': await container.stop(); break;
    case 'restart': await container.restart(); break;
    case 'remove': await container.remove({ force: true }); break;
    default: throw new Error("不支持的操作");
  }
}

export async function getContainerLogs(id: string) {
  const container = docker.getContainer(id);
  const logs = await container.logs({ stdout: true, stderr: true, tail: 100 });
  return logs.toString('utf-8');
}
