import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";
import { getDb } from "../db";
import { CONFIG } from "../utils/config";
import { parseNginxConfigFile, renderManagedNginxConfig } from "./nginx-config";
import { docker } from "./docker";
import { connectEnvironmentSsh, getEnvironmentConnection, getLocalEnvironmentId } from "./platform";

export const ROUTES_FILE = path.join(process.cwd(), "data", "routes.json");

type ProxyRouteRow = {
  id: string;
  gateway_id?: string | null;
  environment_id: string | null;
  domain: string;
  target: string;
  ssl: number;
  source?: string | null;
  managed_state?: string | null;
  source_conf_path?: string | null;
  last_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};

type GatewayRow = {
  id: string;
  environment_id: string | null;
  display_name: string;
  kind: string;
  status: string;
  metadata_json: string;
};

type GatewayMetadata = {
  configDir?: string;
  reloadCommand?: string;
  workdir?: string;
  routeManagement?: boolean;
  container?: string;
  runtimeMode?: "auto" | "host" | "docker";
};

type RouteInput = {
  gatewayId?: string;
  serverId?: string;
  domain: string;
  target?: string;
  targetIp?: string;
  targetPort?: string | number;
  ssl?: boolean;
};

type SyncRouteItem = {
  confPath: string;
  domain?: string;
  target?: string;
  ssl?: boolean;
  reason: string;
};

type GatewayConfigFile = {
  path: string;
  content: string;
};

type GatewayConfigDiscovery = {
  files: GatewayConfigFile[];
  warnings: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sanitizeDomain(domain: string) {
  return domain.replace(/[^a-zA-Z0-9.-]/g, "-");
}

function normalizeTarget(input: RouteInput | { target?: string; targetIp?: string; targetPort?: string | number }) {
  if (input.target) return String(input.target).trim();
  const targetIp = String(input.targetIp || "").trim();
  const targetPort = String(input.targetPort || "").trim();
  if (targetIp && targetPort) return `${targetIp}:${targetPort}`;
  return "";
}

function buildRouteResponse(row: ProxyRouteRow) {
  return {
    id: row.id,
    gatewayId: row.gateway_id || "gateway:local",
    serverId: row.environment_id,
    domain: row.domain,
    target: row.target,
    ssl: row.ssl === 1,
    source: row.source === "nginx-import" ? "nginx-import" : "managed",
    managedState: row.managed_state === "imported" ? "imported" : row.managed_state === "unmanaged" ? "unmanaged" : "managed",
    sourceConfPath: row.source_conf_path || null,
    lastSyncedAt: row.last_synced_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isImportedRoute(route: ReturnType<typeof buildRouteResponse>) {
  return route.source === "nginx-import" || route.managedState === "imported";
}

function getGatewayRow(gatewayId: string) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM gateways WHERE id = ?").get(gatewayId) as GatewayRow | undefined;
  if (!row) {
    throw new Error("网关不存在。");
  }
  return {
    ...row,
    metadata: parseJson<GatewayMetadata>(row.metadata_json, {}),
  };
}

function getGatewayConfigDir(gateway: ReturnType<typeof getGatewayRow>) {
  return gateway.metadata.configDir || (gateway.environment_id === getLocalEnvironmentId() ? CONFIG.NGINX_CONF_DIR : "/etc/nginx/conf.d");
}

function getManagedConfPath(gateway: ReturnType<typeof getGatewayRow>, domain: string) {
  return path.posix.join(getGatewayConfigDir(gateway), `${sanitizeDomain(domain)}.conf`);
}

function syncLegacyRoutesFile() {
  const localRoutes = getRoutes({ gatewayId: "gateway:local" });
  fs.writeFileSync(ROUTES_FILE, JSON.stringify(localRoutes, null, 2), "utf-8");
}

function ensureProxyRouteColumns() {
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(proxy_routes)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));

  if (!names.has("gateway_id")) {
    db.exec("ALTER TABLE proxy_routes ADD COLUMN gateway_id TEXT REFERENCES gateways(id) ON DELETE SET NULL");
  }
  if (!names.has("source")) {
    db.exec("ALTER TABLE proxy_routes ADD COLUMN source TEXT NOT NULL DEFAULT 'managed'");
  }
  if (!names.has("managed_state")) {
    db.exec("ALTER TABLE proxy_routes ADD COLUMN managed_state TEXT NOT NULL DEFAULT 'managed'");
  }
  if (!names.has("source_conf_path")) {
    db.exec("ALTER TABLE proxy_routes ADD COLUMN source_conf_path TEXT");
  }
  if (!names.has("last_synced_at")) {
    db.exec("ALTER TABLE proxy_routes ADD COLUMN last_synced_at TEXT");
  }
}

function importLegacyRoutesIfNeeded() {
  const db = getDb();
  const total = Number((db.prepare("SELECT COUNT(*) AS count FROM proxy_routes").get() as { count: number }).count || 0);
  if (total > 0) return;
  if (!fs.existsSync(ROUTES_FILE)) {
    fs.writeFileSync(ROUTES_FILE, JSON.stringify([]), "utf-8");
    return;
  }

  const legacyRoutes = parseJson<any[]>(fs.readFileSync(ROUTES_FILE, "utf-8"), []);
  const insert = db.prepare(
    `INSERT INTO proxy_routes (id, gateway_id, environment_id, domain, target, ssl, source, managed_state, created_at, updated_at)
     VALUES (@id, @gatewayId, @environmentId, @domain, @target, @ssl, 'managed', 'managed', @createdAt, @updatedAt)`,
  );
  const timestamp = nowIso();

  for (const route of legacyRoutes) {
    const target = normalizeTarget(route);
    if (!route?.domain || !target) continue;
    insert.run({
      id: route.id || crypto.randomUUID(),
      gatewayId: "gateway:local",
      environmentId: getLocalEnvironmentId(),
      domain: String(route.domain).trim(),
      target,
      ssl: route.ssl === false ? 0 : 1,
      createdAt: route.createdAt || timestamp,
      updatedAt: route.updatedAt || timestamp,
    });
  }

  syncLegacyRoutesFile();
}

async function runRemoteGatewayCommand(gateway: ReturnType<typeof getGatewayRow>, command: string) {
  if (!gateway.environment_id || gateway.environment_id === getLocalEnvironmentId()) {
    throw new Error("当前网关不是远程 SSH 网关。");
  }

  const { credential } = getEnvironmentConnection(gateway.environment_id);
  const { ssh } = await connectEnvironmentSsh(gateway.environment_id);
  const attempts = [
    command,
    `sudo -n sh -lc ${shellQuote(command)}`,
    credential?.password
      ? `printf '%s\\n' ${JSON.stringify(credential.password)} | sudo -S -p '' sh -lc ${shellQuote(command)}`
      : null,
  ].filter(Boolean) as string[];

  try {
    let lastError = "远程网关命令执行失败。";
    for (const candidate of attempts) {
      const result = await ssh.execCommand(candidate, { execOptions: { pty: true } });
      if (result.code === 0) {
        return result.stdout;
      }
      lastError = result.stderr || result.stdout || lastError;
    }
    throw new Error(lastError);
  } finally {
    ssh.dispose();
  }
}

async function runRemoteGatewayCommandCapture(gateway: ReturnType<typeof getGatewayRow>, command: string) {
  if (!gateway.environment_id || gateway.environment_id === getLocalEnvironmentId()) {
    throw new Error("当前网关不是远程 SSH 网关。");
  }

  const { credential } = getEnvironmentConnection(gateway.environment_id);
  const { ssh } = await connectEnvironmentSsh(gateway.environment_id);
  const attempts = [
    command,
    `sudo -n sh -lc ${shellQuote(command)}`,
    credential?.password
      ? `printf '%s\\n' ${JSON.stringify(credential.password)} | sudo -S -p '' sh -lc ${shellQuote(command)}`
      : null,
  ].filter(Boolean) as string[];

  try {
    let lastError = "远程网关命令执行失败。";
    for (const candidate of attempts) {
      const result = await ssh.execCommand(candidate, { execOptions: { pty: true } });
      const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      if (result.code === 0) {
        return combined;
      }
      lastError = combined || lastError;
    }
    throw new Error(lastError);
  } finally {
    ssh.dispose();
  }
}

async function discoverRemoteNginxContainer(gateway: ReturnType<typeof getGatewayRow>) {
  const output = await runRemoteGatewayCommandCapture(
    gateway,
    `docker ps --format '{{.Names}}\\t{{.Image}}'`,
  );

  const preferred = [gateway.metadata.container, CONFIG.NGINX_CONTAINER_NAME]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const rows = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, image] = line.split(/\t+/, 2);
      return { name: String(name || "").trim(), image: String(image || "").trim() };
    })
    .filter((item) => item.name);

  for (const expected of preferred) {
    const matched = rows.find((item) => item.name === expected);
    if (matched) {
      return matched.name;
    }
  }

  const nginxCandidates = rows.filter((item) => {
    const haystack = `${item.name} ${item.image}`.toLowerCase();
    return haystack.includes("nginx");
  });

  const weighted = nginxCandidates.sort((left, right) => {
    const score = (item: { name: string; image: string }) => {
      const haystack = `${item.name} ${item.image}`.toLowerCase();
      let value = 0;
      if (haystack.includes("gateway")) value += 3;
      if (haystack.includes("proxy")) value += 2;
      if (item.image.toLowerCase().startsWith("nginx")) value += 2;
      return value;
    };
    return score(right) - score(left);
  });

  return weighted[0]?.name || null;
}

async function runRemoteNginxCommandCapture(gateway: ReturnType<typeof getGatewayRow>, command: string) {
  const runtimeMode = gateway.metadata.runtimeMode || "auto";

  if (runtimeMode !== "docker") {
    try {
      const output = await runRemoteGatewayCommandCapture(gateway, command);
      return { output, mode: "host" as const, container: null };
    } catch (hostError: any) {
      if (runtimeMode === "host") {
        throw hostError;
      }
    }
  }

  const containerName = await discoverRemoteNginxContainer(gateway);
  if (!containerName) {
    throw new Error("未发现可用于执行 Nginx 命令的运行中容器。");
  }

  const output = await runRemoteGatewayCommandCapture(
    gateway,
    `docker exec ${JSON.stringify(containerName)} sh -lc ${JSON.stringify(command)}`,
  );

  return {
    output,
    mode: "docker" as const,
    container: containerName,
  };
}

async function writeRemoteGatewayConfToContainer(
  gateway: ReturnType<typeof getGatewayRow>,
  containerName: string,
  containerConfPath: string,
  localTempFile: string,
) {
  const remoteTempDir = gateway.metadata.workdir || `/tmp/docker-proxy-gateway/${gateway.id}`;
  const remoteTempPath = path.posix.join(remoteTempDir, path.posix.basename(containerConfPath));
  const { ssh } = await connectEnvironmentSsh(gateway.environment_id || "");

  try {
    await runRemoteGatewayCommand(gateway, `mkdir -p ${shellQuote(remoteTempDir)}`);
    await ssh.putFile(localTempFile, remoteTempPath);
    await runRemoteGatewayCommand(
      gateway,
      `docker exec ${JSON.stringify(containerName)} sh -lc ${JSON.stringify(`mkdir -p ${path.posix.dirname(containerConfPath)}`)}`,
    );
    await runRemoteGatewayCommand(gateway, `docker cp ${shellQuote(remoteTempPath)} ${JSON.stringify(`${containerName}:${containerConfPath}`)}`);
    await runRemoteGatewayCommand(gateway, `rm -f ${shellQuote(remoteTempPath)}`);
  } finally {
    ssh.dispose();
  }
}

async function removeRemoteGatewayConfFromContainer(
  gateway: ReturnType<typeof getGatewayRow>,
  containerName: string,
  containerConfPath: string,
) {
  await runRemoteGatewayCommand(
    gateway,
    `docker exec ${JSON.stringify(containerName)} sh -lc ${JSON.stringify(`rm -f ${containerConfPath}`)}`,
  );
}

async function runLocalGatewayCommandCapture(command: string) {
  const nginxContainer = docker.getContainer(CONFIG.NGINX_CONTAINER_NAME);
  const exec = await nginxContainer.exec({
    Cmd: ["sh", "-lc", command],
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({});
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  stdout.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  stderr.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
  docker.modem.demuxStream(stream, stdout, stderr);

  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const result = await exec.inspect();
  const combined = [Buffer.concat(stdoutChunks).toString("utf-8"), Buffer.concat(stderrChunks).toString("utf-8")]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (result.ExitCode !== 0) {
    throw new Error(combined || "本地网关命令执行失败。");
  }

  return combined;
}

async function writeGatewayConf(gatewayId: string, route: ReturnType<typeof buildRouteResponse>) {
  const gateway = getGatewayRow(gatewayId);
  const confDir = getGatewayConfigDir(gateway);
  const confPath = getManagedConfPath(gateway, route.domain);
  const confContent = renderManagedNginxConfig(route);

  if (gateway.environment_id === getLocalEnvironmentId()) {
    fs.mkdirSync(confDir, { recursive: true });
    fs.writeFileSync(path.join(confDir, `${sanitizeDomain(route.domain)}.conf`), confContent, "utf-8");
    await reloadNginx(gatewayId);
    syncLegacyRoutesFile();
    return;
  }

  const tempFile = path.join(os.tmpdir(), `docker-proxy-${route.id}.conf`);
  fs.writeFileSync(tempFile, confContent, "utf-8");

  const { ssh } = await connectEnvironmentSsh(gateway.environment_id || "");
  try {
    const remoteTempDir = gateway.metadata.workdir || `/tmp/docker-proxy-gateway/${gatewayId}`;
    const remoteTempPath = path.posix.join(remoteTempDir, `${sanitizeDomain(route.domain)}.conf`);
    try {
      await runRemoteGatewayCommand(gateway, `mkdir -p ${shellQuote(remoteTempDir)} ${shellQuote(confDir)}`);
      await ssh.putFile(tempFile, remoteTempPath);
      await runRemoteGatewayCommand(gateway, `mv ${shellQuote(remoteTempPath)} ${shellQuote(confPath)}`);
    } catch (hostWriteError) {
      const runtimeMode = gateway.metadata.runtimeMode || "auto";
      if (runtimeMode === "host") {
        throw hostWriteError;
      }

      const containerName = await discoverRemoteNginxContainer(gateway);
      if (!containerName) {
        throw hostWriteError;
      }
      await writeRemoteGatewayConfToContainer(gateway, containerName, confPath, tempFile);
    }
  } finally {
    ssh.dispose();
    fs.rmSync(tempFile, { force: true });
  }

  await reloadNginx(gatewayId);
}

async function removeGatewayConf(gatewayId: string, route: ReturnType<typeof buildRouteResponse>, sourceConfPath?: string | null) {
  const gateway = getGatewayRow(gatewayId);
  const confDir = getGatewayConfigDir(gateway);
  const confPath = sourceConfPath || getManagedConfPath(gateway, route.domain);

  if (gateway.environment_id === getLocalEnvironmentId()) {
    const localConfPath = path.join(confDir, `${sanitizeDomain(route.domain)}.conf`);
    if (fs.existsSync(localConfPath)) {
      fs.unlinkSync(localConfPath);
    }
    await reloadNginx(gatewayId);
    syncLegacyRoutesFile();
    return;
  }

  try {
    await runRemoteGatewayCommand(gateway, `rm -f ${shellQuote(confPath)}`);
  } catch (hostDeleteError) {
    const runtimeMode = gateway.metadata.runtimeMode || "auto";
    if (runtimeMode === "host") {
      throw hostDeleteError;
    }

    const containerName = await discoverRemoteNginxContainer(gateway);
    if (!containerName) {
      throw hostDeleteError;
    }
    await removeRemoteGatewayConfFromContainer(gateway, containerName, confPath);
  }
  await reloadNginx(gatewayId);
}

function parseNginxDumpFiles(output: string) {
  const files: GatewayConfigFile[] = [];
  const lines = String(output || "").split(/\r?\n/);
  let currentPath = "";
  let buffer: string[] = [];

  const flush = () => {
    if (!currentPath) return;
    const content = buffer.join("\n").trim();
    if (content && /\bserver_name\b/.test(content) && /\bproxy_pass\b/.test(content)) {
      files.push({ path: currentPath, content });
    }
  };

  for (const line of lines) {
    const match = line.match(/^# configuration file (.+):$/);
    if (match) {
      flush();
      currentPath = match[1].trim();
      buffer = [];
      continue;
    }
    if (currentPath) {
      buffer.push(line);
    }
  }

  flush();
  return files;
}

function listLocalGatewayConfFiles(confDir: string) {
  if (!fs.existsSync(confDir)) {
    return [] as GatewayConfigFile[];
  }

  return fs
    .readdirSync(confDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".conf"))
    .map((entry) => {
      const fullPath = path.join(confDir, entry.name);
      return {
        path: fullPath.replace(/\\/g, "/"),
        content: fs.readFileSync(fullPath, "utf-8"),
      };
    });
}

async function listRemoteGatewayConfFiles(gateway: ReturnType<typeof getGatewayRow>, confDir: string) {
  const output = await runRemoteGatewayCommand(
    gateway,
    `if test -d ${shellQuote(confDir)}; then find ${shellQuote(confDir)} -maxdepth 1 -type f -name '*.conf' | sort; fi`,
  );

  const files = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results: GatewayConfigFile[] = [];
  for (const filePath of files) {
    const content = await runRemoteGatewayCommand(gateway, `cat ${shellQuote(filePath)}`);
    results.push({ path: filePath, content: String(content || "") });
  }
  return results;
}

async function discoverGatewayConfigFiles(gateway: ReturnType<typeof getGatewayRow>): Promise<GatewayConfigDiscovery> {
  const warnings: string[] = [];

  try {
    const nginxDumpResult = gateway.environment_id === getLocalEnvironmentId()
      ? { output: await runLocalGatewayCommandCapture("nginx -T 2>&1"), mode: "docker" as const, container: CONFIG.NGINX_CONTAINER_NAME }
      : await runRemoteNginxCommandCapture(gateway, "nginx -T 2>&1");
    const nginxDump = nginxDumpResult.output;
    const files = parseNginxDumpFiles(nginxDump);
    if (files.length > 0) {
      if (nginxDumpResult.mode === "docker" && gateway.environment_id !== getLocalEnvironmentId()) {
        warnings.push(`当前网关通过 Docker 容器 ${nginxDumpResult.container} 读取 Nginx 运行配置。`);
      }
      return { files, warnings };
    }
    warnings.push("`nginx -T` 未解析出可导入的反向代理配置，已回退到配置目录扫描。");
  } catch (error: any) {
    warnings.push(`执行 \`nginx -T\` 失败，已回退到配置目录扫描：${error?.message || "未知错误"}`);
  }

  const confDir = getGatewayConfigDir(gateway);
  const files = gateway.environment_id === getLocalEnvironmentId()
    ? listLocalGatewayConfFiles(confDir)
    : await listRemoteGatewayConfFiles(gateway, confDir);
  return { files, warnings };
}

function updateRouteSyncTimestamp(routeId: string) {
  getDb().prepare("UPDATE proxy_routes SET last_synced_at = @timestamp, updated_at = @timestamp WHERE id = @id").run({
    id: routeId,
    timestamp: nowIso(),
  });
}

function updateImportedRouteFromNginx(routeId: string, parsed: { domain: string; target: string; ssl: boolean; confPath: string }, timestamp: string) {
  const db = getDb();
  db.prepare(
    `UPDATE proxy_routes
     SET domain = @domain,
         target = @target,
         ssl = @ssl,
         source = 'nginx-import',
         managed_state = 'imported',
         source_conf_path = @sourceConfPath,
         last_synced_at = @timestamp,
         updated_at = @timestamp
     WHERE id = @id`,
  ).run({
    id: routeId,
    domain: parsed.domain,
    target: parsed.target,
    ssl: parsed.ssl ? 1 : 0,
    sourceConfPath: parsed.confPath,
    timestamp,
  });

  const row = db.prepare("SELECT * FROM proxy_routes WHERE id = ?").get(routeId) as ProxyRouteRow | undefined;
  if (!row) {
    throw new Error("同步后的路由记录不存在。");
  }
  return buildRouteResponse(row);
}

export function initNginx() {
  if (!fs.existsSync(ROUTES_FILE)) {
    fs.writeFileSync(ROUTES_FILE, JSON.stringify([]), "utf-8");
  }
  ensureProxyRouteColumns();
  importLegacyRoutesIfNeeded();
}

export function getRoutes(filter?: { serverId?: string; gatewayId?: string }) {
  const db = getDb();
  const rows = (filter?.gatewayId
    ? db.prepare("SELECT * FROM proxy_routes WHERE gateway_id = ? ORDER BY updated_at DESC, created_at DESC").all(filter.gatewayId)
    : filter?.serverId
      ? db.prepare("SELECT * FROM proxy_routes WHERE environment_id = ? ORDER BY updated_at DESC, created_at DESC").all(filter.serverId)
      : db.prepare("SELECT * FROM proxy_routes ORDER BY updated_at DESC, created_at DESC").all()) as ProxyRouteRow[];
  return rows.map(buildRouteResponse);
}

export function saveRoutes(routes: any[]) {
  const db = getDb();
  db.prepare("DELETE FROM proxy_routes WHERE gateway_id = ?").run("gateway:local");
  const insert = db.prepare(
    `INSERT INTO proxy_routes (id, gateway_id, environment_id, domain, target, ssl, source, managed_state, created_at, updated_at)
     VALUES (@id, 'gateway:local', @environmentId, @domain, @target, @ssl, 'managed', 'managed', @createdAt, @updatedAt)`,
  );
  const timestamp = nowIso();

  for (const route of routes) {
    const target = normalizeTarget(route);
    if (!route?.domain || !target) continue;
    insert.run({
      id: route.id || crypto.randomUUID(),
      environmentId: getLocalEnvironmentId(),
      domain: String(route.domain).trim(),
      target,
      ssl: route.ssl === false ? 0 : 1,
      createdAt: route.createdAt || timestamp,
      updatedAt: route.updatedAt || timestamp,
    });
  }

  syncLegacyRoutesFile();
}

export async function reloadNginx(gatewayId = "gateway:local") {
  const gateway = getGatewayRow(gatewayId);
  if (gateway.environment_id === getLocalEnvironmentId()) {
    try {
      const nginxContainer = docker.getContainer(CONFIG.NGINX_CONTAINER_NAME);
      const exec = await nginxContainer.exec({
        Cmd: ["nginx", "-s", "reload"],
        AttachStdout: true,
        AttachStderr: true,
      });
      await exec.start({});
      return true;
    } catch (error: any) {
      console.error("Nginx reload failed:", error.message);
      throw error;
    }
  }

  const reloadCommand = gateway.metadata.reloadCommand || "nginx -s reload";
  try {
    await runRemoteGatewayCommand(gateway, reloadCommand);
  } catch (hostError) {
    const runtimeMode = gateway.metadata.runtimeMode || "auto";
    if (runtimeMode === "host") {
      throw hostError;
    }

    const containerName = await discoverRemoteNginxContainer(gateway);
    if (!containerName) {
      throw hostError;
    }
    await runRemoteGatewayCommand(
      gateway,
      `docker exec ${JSON.stringify(containerName)} sh -lc ${JSON.stringify("nginx -s reload")}`,
    );
  }
  return true;
}

export function generateNginxConf(route: { domain: string; target?: string; targetIp?: string; targetPort?: string | number }) {
  return renderManagedNginxConfig(route);
}

export async function createRoute(input: RouteInput) {
  const gatewayId = input.gatewayId || "gateway:local";
  const gateway = getGatewayRow(gatewayId);
  const target = normalizeTarget(input);
  if (!input.domain?.trim() || !target) {
    throw new Error("域名和目标地址不能为空。");
  }

  const route = buildRouteResponse({
    id: crypto.randomUUID(),
    gateway_id: gatewayId,
    environment_id: input.serverId || gateway.environment_id,
    domain: input.domain.trim(),
    target,
    ssl: input.ssl === false ? 0 : 1,
    source: "managed",
    managed_state: "managed",
    last_synced_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  await writeGatewayConf(gatewayId, route);

  const db = getDb();
  const managedConfPath = getManagedConfPath(gateway, route.domain);
  db.prepare(
    `INSERT INTO proxy_routes (id, gateway_id, environment_id, domain, target, ssl, source, managed_state, source_conf_path, last_synced_at, created_at, updated_at)
     VALUES (@id, @gatewayId, @environmentId, @domain, @target, @ssl, 'managed', 'managed', @sourceConfPath, NULL, @createdAt, @updatedAt)`,
  ).run({
    id: route.id,
    gatewayId,
    environmentId: route.serverId,
    domain: route.domain,
    target: route.target,
    ssl: route.ssl ? 1 : 0,
    sourceConfPath: managedConfPath,
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
  });

  if (gatewayId === "gateway:local") {
    syncLegacyRoutesFile();
  }
  return route;
}

export async function deleteRoute(routeId: string) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM proxy_routes WHERE id = ?").get(routeId) as ProxyRouteRow | undefined;
  if (!row) {
    throw new Error("路由不存在。");
  }

  const route = buildRouteResponse(row);
  await removeGatewayConf(route.gatewayId || "gateway:local", route, row.source_conf_path || null);
  db.prepare("DELETE FROM proxy_routes WHERE id = ?").run(routeId);

  if ((row.gateway_id || "gateway:local") === "gateway:local") {
    syncLegacyRoutesFile();
  }
  return route;
}

export async function syncGatewayRoutesFromNginx(gatewayId: string) {
  const gateway = getGatewayRow(gatewayId);
  const discovery = await discoverGatewayConfigFiles(gateway);
  const parsedResults = discovery.files.map((file) => parseNginxConfigFile(file.path, file.content));
  const parsedRoutes = parsedResults.flatMap((result) => result.routes);
  const unmanaged = parsedResults.flatMap((result) => result.unmanaged);
  const db = getDb();
  const existingRoutes = getRoutes({ gatewayId });
  const existingByDomain = new Map(existingRoutes.map((route) => [route.domain, route]));
  const existingByDomainTarget = new Map(existingRoutes.map((route) => [`${route.domain}::${route.target}`, route]));
  const imported: ReturnType<typeof buildRouteResponse>[] = [];
  const updated: ReturnType<typeof buildRouteResponse>[] = [];
  const skipped: SyncRouteItem[] = [];
  const warnings: string[] = [...discovery.warnings];
  const timestamp = nowIso();

  for (const parsed of parsedRoutes) {
    const sameRoute = existingByDomainTarget.get(`${parsed.domain}::${parsed.target}`);
    if (sameRoute) {
      if (isImportedRoute(sameRoute)) {
        const nextRoute = updateImportedRouteFromNginx(sameRoute.id, parsed, timestamp);
        updated.push(nextRoute);
        existingByDomain.set(nextRoute.domain, nextRoute);
        existingByDomainTarget.set(`${nextRoute.domain}::${nextRoute.target}`, nextRoute);
      } else {
        updateRouteSyncTimestamp(sameRoute.id);
        skipped.push({
          confPath: parsed.confPath,
          domain: parsed.domain,
          target: parsed.target,
          ssl: parsed.ssl,
          reason: "平台托管路由已存在，未自动覆盖。",
        });
      }
      continue;
    }

    const domainConflict = existingByDomain.get(parsed.domain);
    if (domainConflict) {
      if (isImportedRoute(domainConflict)) {
        existingByDomainTarget.delete(`${domainConflict.domain}::${domainConflict.target}`);
        const nextRoute = updateImportedRouteFromNginx(domainConflict.id, parsed, timestamp);
        updated.push(nextRoute);
        existingByDomain.set(nextRoute.domain, nextRoute);
        existingByDomainTarget.set(`${nextRoute.domain}::${nextRoute.target}`, nextRoute);
      } else {
        skipped.push({
          confPath: parsed.confPath,
          domain: parsed.domain,
          target: parsed.target,
          ssl: parsed.ssl,
          reason: `域名已被平台托管路由 ${domainConflict.target} 占用，未自动覆盖。`,
        });
      }
      continue;
    }

    const row: ProxyRouteRow = {
      id: crypto.randomUUID(),
      gateway_id: gatewayId,
      environment_id: gateway.environment_id,
      domain: parsed.domain,
      target: parsed.target,
      ssl: parsed.ssl ? 1 : 0,
      source: "nginx-import",
      managed_state: "imported",
      source_conf_path: parsed.confPath,
      last_synced_at: timestamp,
      created_at: timestamp,
      updated_at: timestamp,
    };

    db.prepare(
      `INSERT INTO proxy_routes (id, gateway_id, environment_id, domain, target, ssl, source, managed_state, source_conf_path, last_synced_at, created_at, updated_at)
       VALUES (@id, @gateway_id, @environment_id, @domain, @target, @ssl, @source, @managed_state, @source_conf_path, @last_synced_at, @created_at, @updated_at)`,
    ).run(row);

    const route = buildRouteResponse(row);
    imported.push(route);
    existingByDomain.set(route.domain, route);
    existingByDomainTarget.set(`${route.domain}::${route.target}`, route);
  }

  if (gatewayId === "gateway:local") {
    syncLegacyRoutesFile();
  }

  if (parsedRoutes.length === 0) {
    warnings.push("未发现可导入的 Nginx 反向代理配置。");
  }

  return {
    gatewayId,
    imported,
    updated,
    skipped,
    unmanaged,
    warnings,
  };
}
