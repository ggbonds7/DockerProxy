import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { getDb } from "../../db";
import { CONFIG } from "../../utils/config";
import { connectEnvironmentSsh, getEnvironment, getLocalEnvironmentId } from "../platform";
import type { EnvironmentSummary } from "../../../src/types";
import type {
  CreateMigrationPlanInput,
  MigrationExternalBindMount,
  MigrationImageTransfer,
  MigrationNamedVolume,
  MigrationPlan,
  MigrationProject,
  MigrationProjectDiscoveryMeta,
  MigrationProjectListResult,
  MigrationProjectDiscoverySource,
  MigrationRisk,
  MigrationServiceInfo,
  MigrationUnsupportedItem,
} from "./types";

const COMPOSE_FILE_NAMES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
const FORBIDDEN_SOURCE_PREFIXES = [
  "/var/lib/docker/",
  "/run/docker/",
  "/var/lib/containerd/",
  "/run/containerd/",
  "/proc",
  "/sys",
  "/dev",
];

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function normalizePosix(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function isForbiddenPath(candidate?: string | null) {
  if (!candidate) return false;
  const normalized = `${normalizePosix(candidate)}/`;
  return FORBIDDEN_SOURCE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

type ComposeProjectCandidate = {
  name: string;
  projectDir: string;
  composePath: string;
  composeFiles: string[];
};

type RuntimeDiscoveryResult = {
  projects: Array<{ name: string; composeFiles: string[] }>;
  warnings: string[];
};

type ComposeCandidateDiscovery = {
  candidates: ComposeProjectCandidate[];
  discoveryMeta: MigrationProjectDiscoveryMeta;
};

function looksLikeNamedVolume(source: string) {
  if (!source) return false;
  if (source.startsWith("./") || source.startsWith("../") || source.startsWith("/")) return false;
  if (source.match(/^[A-Za-z]:\\/)) return false;
  return !source.includes("/");
}

function parseShortVolumeSpec(spec: string, projectDir: string) {
  const parts = spec.split(":");
  if (parts.length === 1) {
    return { type: "volume" as const, anonymous: true };
  }
  const source = parts[0];
  const mode = parts.slice(2).join(":") || undefined;
  if (!source) {
    return { type: "volume" as const, anonymous: true, mode };
  }
  if (looksLikeNamedVolume(source)) {
    return { type: "volume" as const, source, anonymous: false, mode };
  }
  const resolved = path.isAbsolute(source) ? source : path.resolve(projectDir, source);
  return {
    type: "bind" as const,
    source,
    sourcePath: resolved,
    anonymous: false,
    mode,
  };
}

function parseVolumeMount(entry: any, projectDir: string) {
  if (typeof entry === "string") {
    return parseShortVolumeSpec(entry, projectDir);
  }
  if (!entry || typeof entry !== "object") {
    return null;
  }
  if (entry.type === "tmpfs") {
    return { type: "tmpfs" as const };
  }
  if (entry.type === "volume") {
    return {
      type: "volume" as const,
      source: entry.source ? String(entry.source) : undefined,
      anonymous: !entry.source,
      readOnly: Boolean(entry.read_only || entry.readOnly),
    };
  }
  if (entry.type === "bind") {
    const source = String(entry.source || "").trim();
    return {
      type: "bind" as const,
      source,
      sourcePath: path.isAbsolute(source) ? source : path.resolve(projectDir, source),
      readOnly: Boolean(entry.read_only || entry.readOnly),
    };
  }
  return null;
}

function collectEnvFiles(service: any, projectDir: string) {
  const raw = service?.env_file;
  const envFiles = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return envFiles
    .map((entry) => (typeof entry === "string" ? entry : entry?.path))
    .filter(Boolean)
    .map((entry) => (path.isAbsolute(entry) ? entry : path.resolve(projectDir, entry)));
}

function collectPorts(service: any) {
  const ports = Array.isArray(service?.ports) ? service.ports : [];
  return ports
    .map((entry) => {
      if (typeof entry === "number") return entry;
      if (typeof entry === "string") {
        const target = entry.split(":").pop() || "";
        return Number(target.split("/")[0]) || null;
      }
      if (entry?.target) return Number(entry.target) || null;
      return null;
    })
    .filter((value): value is number => Number.isFinite(value));
}

function collectExternalNetworks(service: any, compose: any) {
  const networks = service?.networks;
  const names = Array.isArray(networks)
    ? networks
    : networks && typeof networks === "object"
      ? Object.keys(networks)
      : [];
  return names.filter((name) => compose?.networks?.[name]?.external);
}

function buildManagedProjectNames(environmentId: string) {
  const db = getDb();
  const rows = db
    .prepare("SELECT name FROM projects WHERE environment_id = ? ORDER BY updated_at DESC")
    .all(environmentId) as Array<{ name: string }>;
  return new Set(rows.map((row) => row.name));
}

function splitComposeFileList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseComposeLsOutput(raw: string) {
  const text = String(raw || "").trim();
  if (!text) {
    return [] as Array<{ name: string; composeFiles: string[] }>;
  }

  const entries = (() => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as any[];
    }
  })();

  return entries
    .map((entry) => {
      const composeFiles = splitComposeFileList(
        entry?.ConfigFiles ?? entry?.configFiles ?? entry?.ProjectFiles ?? entry?.projectFiles ?? entry?.Files ?? entry?.files,
      );
      const name = String(entry?.Name ?? entry?.name ?? entry?.Project ?? entry?.project ?? "").trim();
      if (!name && composeFiles.length === 0) {
        return null;
      }
      return {
        name: name || path.posix.basename(path.posix.dirname(composeFiles[0] || "/compose-project")),
        composeFiles,
      };
    })
    .filter((entry): entry is { name: string; composeFiles: string[] } => Boolean(entry));
}

function classifyDiscoverySource(projectDir: string, environment: EnvironmentSummary, managedNames: Set<string>): MigrationProjectDiscoverySource {
  const normalizedProjectDir = normalizePosix(projectDir);
  const normalizedWorkdir = normalizePosix(environment.workdir);
  const basename = path.posix.basename(normalizedProjectDir);
  if (normalizedProjectDir.startsWith(`${normalizedWorkdir}/`) && managedNames.has(basename)) {
    return "managed";
  }
  return "filesystem";
}

function listComposeFilesLocal(root: string, depth = 2) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const results: string[] = [];
  const visit = (current: string, currentDepth: number) => {
    if (currentDepth > depth) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && COMPOSE_FILE_NAMES.includes(entry.name)) {
        results.push(fullPath);
      }
      if (entry.isDirectory()) {
        visit(fullPath, currentDepth + 1);
      }
    }
  };
  visit(root, 0);
  return results;
}

async function listComposeFilesRemote(environmentId: string, root: string) {
  if (!String(root || "").trim()) {
    return [];
  }

  const { ssh } = await connectEnvironmentSsh(environmentId);
  try {
    const findCommand = `if test -d ${shellQuote(root)}; then find ${shellQuote(root)} -maxdepth 3 -type f \\( -name 'docker-compose.yml' -o -name 'docker-compose.yaml' -o -name 'compose.yml' -o -name 'compose.yaml' \\) -print; fi`;
    const result = await ssh.execCommand(`sh -lc ${shellQuote(findCommand)}`);
    if (result.code !== 0) {
      const stderr = String(result.stderr || "");
      if (/No such file or directory/i.test(stderr)) {
        return [];
      }
      throw new Error(stderr || "Unable to scan Compose projects in the remote environment.");
    }
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } finally {
    ssh.dispose();
  }
}

async function listRuntimeProjectsLocal(): Promise<RuntimeDiscoveryResult> {
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("docker", ["compose", "ls", "--all", "--format", "json"], {
      maxBuffer: 20 * 1024 * 1024,
    });
    return {
      projects: parseComposeLsOutput(String(stdout || "")),
      warnings: [],
    };
  } catch (error: any) {
    return {
      projects: [],
      warnings: [error?.message ? `docker compose ls 执行失败：${error.message}` : "docker compose ls 执行失败。"],
    };
  }
}

async function listRuntimeProjectsRemote(environmentId: string): Promise<RuntimeDiscoveryResult> {
  const { ssh } = await connectEnvironmentSsh(environmentId);
  try {
    const result = await ssh.execCommand("docker compose ls --all --format json");
    if (result.code !== 0) {
      return {
        projects: [],
        warnings: [String(result.stderr || result.stdout || "远程 docker compose ls 执行失败。").trim()],
      };
    }
    return {
      projects: parseComposeLsOutput(String(result.stdout || "")),
      warnings: [],
    };
  } finally {
    ssh.dispose();
  }
}

function pathExistsLocal(targetPath: string) {
  return fs.existsSync(targetPath);
}

function uniqueComposeCandidates(items: ComposeProjectCandidate[]) {
  const seen = new Set<string>();
  const results: ComposeProjectCandidate[] = [];

  for (const item of items) {
    const key = normalizePosix(item.composePath);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(item);
  }

  return results;
}

function createCandidateFromComposePath(environmentId: string, composePath: string) {
  const projectDir = environmentId === getLocalEnvironmentId() ? path.dirname(composePath) : path.posix.dirname(composePath);
  return {
    name: path.basename(projectDir),
    projectDir,
    composePath,
    composeFiles: [composePath],
  } satisfies ComposeProjectCandidate;
}

async function listComposeProjectCandidates(environmentId: string, environment: EnvironmentSummary): Promise<ComposeCandidateDiscovery> {
  const runtimeDiscovery = environmentId === getLocalEnvironmentId()
    ? await listRuntimeProjectsLocal()
    : await listRuntimeProjectsRemote(environmentId);

  const runtimeCandidates = runtimeDiscovery.projects
    .map((project) => {
      const primaryComposePath = project.composeFiles[0];
      if (!primaryComposePath) return null;
      const projectDir = environmentId === getLocalEnvironmentId()
        ? path.dirname(primaryComposePath)
        : path.posix.dirname(primaryComposePath);
      return {
        name: project.name || path.basename(projectDir),
        projectDir,
        composePath: primaryComposePath,
        composeFiles: dedupe(project.composeFiles),
      } satisfies ComposeProjectCandidate;
    })
    .filter((item): item is ComposeProjectCandidate => Boolean(item));

  const discoveryMeta: MigrationProjectDiscoveryMeta = {
    runtimeTried: true,
    runtimeFound: runtimeCandidates.length,
    workdir: environment.workdir,
    workdirExists: false,
    fallbackScanned: false,
    warnings: [...runtimeDiscovery.warnings],
  };

  const normalizedWorkdir = String(environment.workdir || "").trim();
  if (normalizedWorkdir) {
    discoveryMeta.workdirExists = environmentId === getLocalEnvironmentId()
      ? pathExistsLocal(normalizedWorkdir)
      : await pathExistsRemote(environmentId, normalizedWorkdir);
  }

  let filesystemComposeFiles: string[] = [];
  if (!normalizedWorkdir) {
    discoveryMeta.warnings.push("平台工作目录为空，已跳过文件系统兜底扫描。");
  } else if (!discoveryMeta.workdirExists) {
    discoveryMeta.warnings.push(`平台工作目录不存在，已跳过兜底扫描：${normalizedWorkdir}`);
  } else {
    discoveryMeta.fallbackScanned = true;
    try {
      filesystemComposeFiles = environmentId === getLocalEnvironmentId()
        ? listComposeFilesLocal(environment.workdir)
        : await listComposeFilesRemote(environmentId, environment.workdir);
    } catch (error: any) {
      discoveryMeta.warnings.push(error?.message || "平台工作目录扫描失败。");
      filesystemComposeFiles = [];
    }
  }

  const filesystemCandidates = filesystemComposeFiles.map((composePath) => createCandidateFromComposePath(environmentId, composePath));
  return {
    candidates: uniqueComposeCandidates([...runtimeCandidates, ...filesystemCandidates]),
    discoveryMeta,
  };
}

async function readCanonicalComposeLocal(projectDir: string, composeFiles: string[]) {
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("docker", ["compose", ...composeFiles.flatMap((file) => ["-f", file]), "config"], {
      cwd: projectDir,
      maxBuffer: 20 * 1024 * 1024,
    });
    return String(stdout || "");
  } catch (error: any) {
    throw new Error(error?.stderr || error?.message || "无法解析 Compose 配置");
  }
}

async function readCanonicalComposeRemote(environmentId: string, projectDir: string, composeFiles: string[]) {
  const { ssh } = await connectEnvironmentSsh(environmentId);
  try {
    const composeArgs = composeFiles.map((file) => `-f ${shellQuote(file)}`).join(" ");
    const command = `cd ${shellQuote(projectDir)} && docker compose ${composeArgs} config`;
    const result = await ssh.execCommand(`sh -lc ${shellQuote(command)}`, { cwd: projectDir });
    if (result.code !== 0) {
      throw new Error(result.stderr || "无法解析远程 Compose 配置");
    }
    return String(result.stdout || "");
  } finally {
    ssh.dispose();
  }
}

function parseComposeDocument(raw: string) {
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Compose 配置为空或格式无效");
  }
  return parsed as any;
}

function sumNullableBytes(values: Array<number | null>) {
  if (values.some((value) => value == null)) return null;
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

function countRiskLevels(risks: MigrationRisk[]) {
  return risks.reduce(
    (acc, item) => {
      acc[item.level] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 }
  );
}

function buildServiceInfos(compose: any, projectDir: string) {
  const services = compose?.services || {};
  return Object.entries<any>(services).map(([serviceName, service]) => {
    const mounts = (Array.isArray(service?.volumes) ? service.volumes : [])
      .map((entry) => parseVolumeMount(entry, projectDir))
      .filter(Boolean);
    return {
      name: serviceName,
      image: service?.image ? String(service.image) : undefined,
      hasBuild: Boolean(service?.build),
      ports: collectPorts(service),
      envFiles: collectEnvFiles(service, projectDir),
      namedVolumes: mounts.filter((mount) => mount?.type === "volume" && mount.source).map((mount) => String(mount?.source)),
      bindMounts: mounts.filter((mount) => mount?.type === "bind" && mount.sourcePath).map((mount) => String(mount?.sourcePath)),
      externalNetworks: collectExternalNetworks(service, compose),
    } satisfies MigrationServiceInfo;
  });
}

async function estimateLocalPathBytes(targetPath: string) {
  if (!fs.existsSync(targetPath)) return null;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return stat.size;
  let total = 0;
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      try {
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          total += fs.statSync(fullPath).size;
        }
      } catch {
        total += 0;
      }
    }
  };
  walk(targetPath);
  return total;
}

async function estimateRemoteBytes(environmentId: string, targetPath: string, volume = false) {
  const { ssh } = await connectEnvironmentSsh(environmentId);
  try {
    const command = volume
      ? `docker run --rm -v ${shellQuote(targetPath)}:/from alpine:3.20 sh -lc \"du -sb /from 2>/dev/null | cut -f1\"`
      : `du -sb ${shellQuote(targetPath)} 2>/dev/null | cut -f1`;
    const result = await ssh.execCommand(`sh -lc ${shellQuote(command)}`);
    if (result.code !== 0) return null;
    const value = Number(String(result.stdout || "").trim());
    return Number.isFinite(value) ? value : null;
  } finally {
    ssh.dispose();
  }
}

async function pathExistsRemote(environmentId: string, targetPath: string) {
  const { ssh } = await connectEnvironmentSsh(environmentId);
  try {
    const result = await ssh.execCommand(`sh -lc ${shellQuote(`test -e ${shellQuote(targetPath)} && echo yes`)}`);
    return String(result.stdout || "").includes("yes");
  } finally {
    ssh.dispose();
  }
}

function detectProjectWarnings(projectDir: string, composePath: string) {
  const warnings: string[] = [];
  if (isForbiddenPath(projectDir) || isForbiddenPath(composePath)) {
    warnings.push("项目目录位于 Docker 或系统内部路径下，不适合作为迁移源。");
  }
  return warnings;
}

async function buildProjectDescriptor(
  environmentId: string,
  candidate: ComposeProjectCandidate,
  environment: EnvironmentSummary,
  managedNames: Set<string>,
) {
  const projectDir = candidate.projectDir;
  const composeFiles = dedupe(candidate.composeFiles);
  const rawCompose = environmentId === getLocalEnvironmentId()
    ? await readCanonicalComposeLocal(projectDir, composeFiles)
    : await readCanonicalComposeRemote(environmentId, projectDir, composeFiles);
  const compose = parseComposeDocument(rawCompose);
  const services = Object.keys(compose?.services || {});
  const warnings = detectProjectWarnings(projectDir, candidate.composePath);
  return {
    name: candidate.name || path.basename(projectDir),
    path: projectDir,
    composePath: candidate.composePath,
    composeFiles,
    discoverySource: classifyDiscoverySource(projectDir, environment, managedNames),
    services,
    warnings,
  } satisfies MigrationProject;
}

function findLocalComposeFilesInDirectory(projectDir: string) {
  return COMPOSE_FILE_NAMES
    .map((name) => path.join(projectDir, name))
    .filter((candidate) => fs.existsSync(candidate));
}

async function findRemoteComposeFilesInDirectory(environmentId: string, projectDir: string) {
  const { ssh } = await connectEnvironmentSsh(environmentId);
  try {
    const command = `if test -d ${shellQuote(projectDir)}; then for name in ${COMPOSE_FILE_NAMES.map((name) => shellQuote(name)).join(" ")}; do if test -f ${shellQuote(projectDir)}/$name; then printf '%s\\n' ${shellQuote(projectDir)}/$name; fi; done; fi`;
    const result = await ssh.execCommand(`sh -lc ${shellQuote(command)}`);
    if (result.code !== 0) {
      throw new Error(result.stderr || "无法读取远程 Compose 目录。");
    }
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } finally {
    ssh.dispose();
  }
}

async function resolveManualCandidate(environmentId: string, rawPath: string): Promise<ComposeProjectCandidate> {
  const candidatePath = String(rawPath || "").trim();
  if (!candidatePath) {
    throw new Error("请输入 Compose 项目目录或 Compose 文件路径。");
  }

  if (environmentId === getLocalEnvironmentId()) {
    if (!fs.existsSync(candidatePath)) {
      throw new Error(`指定路径不存在：${candidatePath}`);
    }
    const stat = fs.statSync(candidatePath);
    if (stat.isFile()) {
      return createCandidateFromComposePath(environmentId, candidatePath);
    }
    const composeFiles = findLocalComposeFilesInDirectory(candidatePath);
    if (composeFiles.length === 0) {
      throw new Error("指定目录下未找到标准 Compose 文件。");
    }
    return {
      name: path.basename(candidatePath),
      projectDir: candidatePath,
      composePath: composeFiles[0],
      composeFiles,
    };
  }

  const { ssh } = await connectEnvironmentSsh(environmentId);
  try {
    const statCommand = `if test -f ${shellQuote(candidatePath)}; then echo file; elif test -d ${shellQuote(candidatePath)}; then echo dir; fi`;
    const statResult = await ssh.execCommand(`sh -lc ${shellQuote(statCommand)}`);
    const kind = String(statResult.stdout || "").trim();
    if (kind === "file") {
      return createCandidateFromComposePath(environmentId, candidatePath);
    }
    if (kind === "dir") {
      const composeFiles = await findRemoteComposeFilesInDirectory(environmentId, candidatePath);
      if (composeFiles.length === 0) {
        throw new Error("指定目录下未找到标准 Compose 文件。");
      }
      return {
        name: path.posix.basename(candidatePath),
        projectDir: candidatePath,
        composePath: composeFiles[0],
        composeFiles,
      };
    }
    throw new Error(`指定路径不存在：${candidatePath}`);
  } finally {
    ssh.dispose();
  }
}

export async function listMigrationProjectCatalog(environmentId = getLocalEnvironmentId()): Promise<MigrationProjectListResult> {
  const environment = getEnvironment(environmentId) as EnvironmentSummary;
  if (!environment.capabilities.modules?.docker) {
    throw new Error("Source environment does not expose Docker inspection capability.");
  }
  const managedNames = buildManagedProjectNames(environmentId);
  const { candidates, discoveryMeta } = await listComposeProjectCandidates(environmentId, environment);

  const projects: MigrationProject[] = [];
  for (const candidate of candidates) {
    try {
      projects.push(await buildProjectDescriptor(environmentId, candidate, environment, managedNames));
    } catch (error: any) {
      projects.push({
        name: candidate.name,
        path: candidate.projectDir,
        composePath: candidate.composePath,
        composeFiles: candidate.composeFiles,
        discoverySource: classifyDiscoverySource(candidate.projectDir, environment, managedNames),
        services: [],
        warnings: [error?.message || "Compose parse failed"],
      });
    }
  }

  return {
    projects: projects.sort((left, right) => left.name.localeCompare(right.name)),
    discoveryMeta,
  };
}

export async function inspectMigrationProject(environmentId: string, projectPath: string) {
  const environment = getEnvironment(environmentId) as EnvironmentSummary;
  if (!environment.capabilities.modules?.docker) {
    throw new Error("Source environment does not expose Docker inspection capability.");
  }
  const managedNames = buildManagedProjectNames(environmentId);
  const candidate = await resolveManualCandidate(environmentId, projectPath);
  return buildProjectDescriptor(environmentId, candidate, environment, managedNames);
}

export async function listMigrationProjects(environmentId = getLocalEnvironmentId()) {
  const { projects } = await listMigrationProjectCatalog(environmentId);
  return projects;
}

async function estimatePathBytes(environmentId: string, targetPath: string, volume = false) {
  return environmentId === getLocalEnvironmentId()
    ? estimateLocalPathBytes(targetPath)
    : estimateRemoteBytes(environmentId, targetPath, volume);
}

async function targetProjectExists(environmentId: string, projectDir: string) {
  return environmentId === getLocalEnvironmentId() ? fs.existsSync(projectDir) : pathExistsRemote(environmentId, projectDir);
}

export async function buildMigrationPlan(input: CreateMigrationPlanInput, sessionId: string) {
  if (!input.sourceEnvironmentId || !input.targetEnvironmentId || !input.projectPath) {
    throw new Error("缺少源环境、目标环境或项目路径");
  }
  if (input.sourceEnvironmentId === input.targetEnvironmentId) {
    throw new Error("源环境和目标环境不能相同");
  }

  const sourceEnvironment = getEnvironment(input.sourceEnvironmentId) as EnvironmentSummary;
  const targetEnvironment = getEnvironment(input.targetEnvironmentId) as EnvironmentSummary;
  if (!targetEnvironment.capabilities.modules?.migrateTarget) {
    throw new Error("目标环境不具备迁移执行能力");
  }

  const projects = await listMigrationProjects(input.sourceEnvironmentId);
  const selectedProject = projects.find((project) => project.path === input.projectPath || project.composePath === input.projectPath);
  if (!selectedProject) {
    throw new Error("没有找到要迁移的 Compose 项目");
  }

  const canonicalCompose = input.sourceEnvironmentId === getLocalEnvironmentId()
    ? await readCanonicalComposeLocal(selectedProject.path, selectedProject.composeFiles)
    : await readCanonicalComposeRemote(input.sourceEnvironmentId, selectedProject.path, selectedProject.composeFiles);
  const compose = parseComposeDocument(canonicalCompose);
  const services = compose?.services || {};
  const serviceInfos = buildServiceInfos(compose, selectedProject.path);
  const risks: MigrationRisk[] = [];
  const unsupportedItems: MigrationUnsupportedItem[] = [];
  const externalBindMountsMap = new Map<string, MigrationExternalBindMount>();
  const namedVolumesMap = new Map<string, MigrationNamedVolume>();
  const envFiles = new Set<string>();

  for (const serviceInfo of serviceInfos) {
    for (const envFile of serviceInfo.envFiles) {
      envFiles.add(envFile);
    }
  }

  for (const [serviceName, service] of Object.entries<any>(services)) {
    const mounts = Array.isArray(service?.volumes) ? service.volumes : [];
    for (const mountEntry of mounts) {
      const mount = parseVolumeMount(mountEntry, selectedProject.path);
      if (!mount) continue;
      if (mount.type === "tmpfs") {
        unsupportedItems.push({
          kind: "tmpfs",
          label: `${serviceName}: tmpfs`,
          reason: "tmpfs 挂载不会持久化，不能作为可靠迁移数据源。",
          blocking: true,
        });
        continue;
      }
      if (mount.type === "volume") {
        if (mount.anonymous || !mount.source) {
          unsupportedItems.push({
            kind: "anonymous-volume",
            label: `${serviceName}: anonymous volume`,
            reason: "匿名卷无法稳定识别和恢复，请先将其改造成命名卷后再迁移。",
            blocking: true,
          });
          continue;
        }
        const current = namedVolumesMap.get(mount.source) || {
          name: mount.source,
          bytes: null,
          serviceNames: [],
        };
        current.serviceNames = dedupe([...current.serviceNames, serviceName]);
        namedVolumesMap.set(mount.source, current);
        continue;
      }
      if (mount.type === "bind" && mount.sourcePath) {
        if (isForbiddenPath(mount.sourcePath)) {
          unsupportedItems.push({
            kind: "forbidden-bind",
            label: `${serviceName}: ${mount.sourcePath}`,
            reason: "系统路径或 Docker 内部路径禁止参与迁移。",
            blocking: true,
          });
          continue;
        }
        const normalizedProjectDir = normalizePosix(selectedProject.path);
        const normalizedSourcePath = normalizePosix(mount.sourcePath);
        const withinProject = normalizedSourcePath === normalizedProjectDir || normalizedSourcePath.startsWith(`${normalizedProjectDir}/`);
        if (!withinProject) {
          const current = externalBindMountsMap.get(mount.sourcePath) || {
            path: mount.sourcePath,
            bytes: null,
            serviceNames: [],
            requiresApproval: true,
            approved: false,
            reason: "项目外绝对路径需要人工确认后才允许迁移。",
          };
          current.serviceNames = dedupe([...current.serviceNames, serviceName]);
          externalBindMountsMap.set(mount.sourcePath, current);
        }
      }
    }

    if (Array.isArray(service?.devices) && service.devices.length > 0) {
      unsupportedItems.push({
        kind: "devices",
        label: `${serviceName}: devices`,
        reason: "设备映射依赖宿主机硬件，当前迁移器不自动处理。",
        blocking: true,
      });
    }
    if (Array.isArray(service?.configs) && service.configs.length > 0) {
      unsupportedItems.push({
        kind: "configs",
        label: `${serviceName}: configs`,
        reason: "Compose configs 需要目标环境预先准备，当前版本先阻断处理。",
        blocking: true,
      });
    }
    if (Array.isArray(service?.secrets) && service.secrets.length > 0) {
      unsupportedItems.push({
        kind: "secrets",
        label: `${serviceName}: secrets`,
        reason: "Compose secrets 需要目标环境预先准备，当前版本先阻断处理。",
        blocking: true,
      });
    }
  }

  const namedVolumes = Array.from(namedVolumesMap.values());
  const externalBindMounts = Array.from(externalBindMountsMap.values());

  for (const volume of namedVolumes) {
    volume.bytes = await estimatePathBytes(input.sourceEnvironmentId, volume.name, true);
  }
  for (const bindMount of externalBindMounts) {
    bindMount.bytes = await estimatePathBytes(input.sourceEnvironmentId, bindMount.path, false);
  }

  const projectBytes = await estimatePathBytes(input.sourceEnvironmentId, selectedProject.path, false);
  const targetProjectDir = targetEnvironment.isLocal
    ? path.join(targetEnvironment.workdir, selectedProject.name)
    : path.posix.join(targetEnvironment.workdir, selectedProject.name);
  const targetComposePath = targetEnvironment.isLocal
    ? path.join(targetProjectDir, path.basename(selectedProject.composePath))
    : path.posix.join(targetProjectDir, path.posix.basename(selectedProject.composePath));

  if (await targetProjectExists(input.targetEnvironmentId, targetProjectDir)) {
    unsupportedItems.push({
      kind: "target-conflict",
      label: targetProjectDir,
      reason: "目标环境中已存在同名项目目录，为避免覆盖，当前计划被阻断。",
      blocking: true,
    });
  }

  const imageTransfers = serviceInfos.map((service) => {
    if (service.hasBuild) {
      return {
        service: service.name,
        image: service.image || service.name,
        strategy: "save_load",
        reason: service.image ? "服务包含 build，按源环境已有镜像导出。" : "服务未声明固定镜像，需要从源环境导出当前镜像。",
        pullable: false,
      } satisfies MigrationImageTransfer;
    }
    return {
      service: service.name,
      image: service.image || service.name,
      strategy: "pull",
      reason: "服务声明了镜像引用，优先在目标环境直接拉取。",
      pullable: Boolean(service.image),
    } satisfies MigrationImageTransfer;
  });

  if (externalBindMounts.length > 0) {
    risks.push({
      id: `${sessionId}:external-bind`,
      level: "high",
      title: "存在项目外宿主目录绑定",
      reason: "这些目录不属于 Compose 项目本身，迁移前需要你确认确实要复制到目标环境。",
      recommendation: "逐个确认目录路径、用途和目标机可写性后再执行。",
      blocking: false,
    });
  }
  if (namedVolumes.some((volume) => volume.bytes == null)) {
    risks.push({
      id: `${sessionId}:unknown-volume-size`,
      level: "medium",
      title: "部分命名卷大小无法预估",
      reason: "源环境无法可靠返回卷大小，迁移前需要保留额外冗余磁盘空间。",
      recommendation: "目标环境建议预留至少两倍于业务数据的可用空间。",
      blocking: false,
    });
  }
  if (selectedProject.warnings.length > 0) {
    for (const warning of selectedProject.warnings) {
      risks.push({
        id: `${sessionId}:warning:${warning}`,
        level: "high",
        title: "迁移源目录存在风险",
        reason: warning,
        recommendation: "请确认项目目录不位于 Docker 内部路径后再执行迁移。",
        blocking: true,
      });
    }
  }

  const sourceBytes = sumNullableBytes([projectBytes, ...namedVolumes.map((item) => item.bytes), ...externalBindMounts.map((item) => item.bytes)]);
  const diskRequirements = {
    sourceBytes,
    targetBytes: sourceBytes,
    localSpoolBytes: sourceBytes,
    unknownBytes: sourceBytes == null || imageTransfers.some((item) => item.strategy === "save_load"),
  };

  return {
    sessionId,
    projectName: selectedProject.name,
    projectPath: selectedProject.path,
    composePath: selectedProject.composePath,
    composeFiles: selectedProject.composeFiles,
    sourceEnvironmentId: input.sourceEnvironmentId,
    targetEnvironmentId: input.targetEnvironmentId,
    sourceDiscovery: selectedProject.discoverySource,
    services: serviceInfos,
    projectFiles: {
      projectDir: selectedProject.path,
      composePath: selectedProject.composePath,
      envFiles: dedupe(Array.from(envFiles)),
      estimatedBytes: projectBytes,
    },
    externalBindMounts,
    namedVolumes,
    imageTransfers,
    unsupportedItems,
    risks,
    diskRequirements,
    cutoverEstimate: {
      requiresDowntime: true,
      summary: "迁移将在最终切换窗口内短暂停止源项目，然后完成最终数据同步与目标启动。",
    },
    target: {
      host: targetEnvironment.host,
      port: targetEnvironment.port,
      username: targetEnvironment.username,
      workdir: targetEnvironment.workdir,
      projectDir: targetProjectDir,
      composePath: targetComposePath,
    },
    preflight: {
      sourceDockerVersion: sourceEnvironment.capabilities.dockerVersion || null,
      sourceComposeVersion: sourceEnvironment.capabilities.composeVersion || null,
      targetDockerVersion: targetEnvironment.capabilities.dockerVersion || null,
      targetComposeVersion: targetEnvironment.capabilities.composeVersion || null,
      sourceAvailableDiskBytes: sourceEnvironment.capabilities.availableDiskBytes || null,
      targetAvailableDiskBytes: targetEnvironment.capabilities.availableDiskBytes || null,
    },
    requiresApprovals: {
      externalBindMounts: externalBindMounts.length > 0,
    },
  } satisfies MigrationPlan;
}

export function countBlockingItems(plan: MigrationPlan) {
  return plan.unsupportedItems.filter((item) => item.blocking).length + plan.risks.filter((risk) => risk.blocking).length;
}

export function countRisks(plan: MigrationPlan) {
  return countRiskLevels(plan.risks);
}
