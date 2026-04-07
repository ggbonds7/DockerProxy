import fs from "fs";
import path from "path";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { promisify } from "util";
import { getEnvironment, getEnvironmentConnection, recordAuditLog } from "../platform";
import type { EnvironmentSummary } from "../../../src/types";
import {
  MIGRATION_PHASES,
  type MigrationEvent,
  type MigrationPhase,
  type MigrationSession,
  type MigrationStatus,
  type WorkerEnvironmentSpec,
  type WorkerExecutionSpec,
} from "./types";
import {
  appendEvent,
  artifactsDir,
  ensureArtifactsIndex,
  ensureMigrationDirs,
  listSessions,
  loadSession,
  readEvents,
  sessionDir,
  sessionFile,
  specFile,
  spoolDir,
  updateSession,
} from "./storage";

const execFileAsync = promisify(execFile);
const runningWorkers = new Map<string, ChildProcessWithoutNullStreams>();
const PHASE_INDEX = new Map(MIGRATION_PHASES.map((phase, index) => [phase, index]));

async function resolvePythonCommand() {
  const candidates = process.platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: process.env.DOCKERPROXY_PYTHON_BIN || "python3", args: [] },
        { command: "python", args: [] },
      ];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate.command, [...candidate.args, "--version"], { timeout: 5000 });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("未找到可用的 Python 运行时，请先安装 Python 3，或在 DockerProxy 运行镜像中加入 python3。");
}

function toWorkerEnvironment(environmentId: string) {
  const response = getEnvironment(environmentId) as EnvironmentSummary;
  const { credential } = getEnvironmentConnection(environmentId) as any;
  return {
    id: response.id,
    isLocal: response.isLocal,
    host: response.host,
    port: response.port,
    username: response.username,
    workdir: response.workdir,
    dockerVersion: response.capabilities.dockerVersion || null,
    composeVersion: response.capabilities.composeVersion || null,
    availableDiskBytes: response.capabilities.availableDiskBytes || null,
    authType: response.authType,
    password: credential?.password,
    privateKey: credential?.privateKey,
  } satisfies WorkerEnvironmentSpec;
}

function artifactPath(sessionId: string, name: string) {
  return path.join(artifactsDir(sessionId), name);
}

function buildTargetComposeFiles(session: MigrationSession) {
  const targetEnvironment = getEnvironment(session.targetEnvironmentId) as EnvironmentSummary;
  return session.plan.composeFiles.map((file) => {
    const filename = path.basename(file);
    return targetEnvironment.isLocal
      ? path.join(session.plan.target.projectDir, filename)
      : path.posix.join(session.plan.target.projectDir, filename);
  });
}

function createExecutionSpec(session: MigrationSession): WorkerExecutionSpec {
  const targetComposeFiles = buildTargetComposeFiles(session);
  return {
    mode: "execute",
    sessionId: session.id,
    projectName: session.projectName,
    projectDir: session.projectPath,
    composePath: session.composePath,
    composeFiles: session.plan.composeFiles,
    spoolDir: spoolDir(session.id),
    artifactsDir: artifactsDir(session.id),
    approvedExternalBindMounts: session.approvals.externalBindMounts,
    source: toWorkerEnvironment(session.sourceEnvironmentId),
    target: toWorkerEnvironment(session.targetEnvironmentId),
    targetProjectDir: session.plan.target.projectDir,
    targetComposePath: session.plan.target.composePath,
    targetComposeFiles,
    projectEstimate: session.plan.projectFiles.estimatedBytes,
    projectArchivePath: path.join(spoolDir(session.id), "project-prestage.tar"),
    projectFinalArchivePath: path.join(spoolDir(session.id), "project-final.tar"),
    imageArchiveDir: path.join(spoolDir(session.id), "images"),
    bindArchiveDir: path.join(spoolDir(session.id), "binds"),
    volumeArchiveDir: path.join(spoolDir(session.id), "volumes"),
    namedVolumes: session.plan.namedVolumes,
    externalBindMounts: session.plan.externalBindMounts,
    imageTransfers: session.plan.imageTransfers,
    checksumsPath: artifactPath(session.id, "checksums.json"),
    reportPath: artifactPath(session.id, "report.json"),
    resultPath: artifactPath(session.id, "result.json"),
    manifestPath: artifactPath(session.id, "manifest.json"),
  };
}

function createRollbackSpec(session: MigrationSession): WorkerExecutionSpec {
  return {
    ...createExecutionSpec(session),
    mode: "rollback",
  };
}

function buildArtifactsIndex(sessionId: string) {
  const result: Record<string, string> = {};
  const known = [
    ["session", sessionFile(sessionId)],
    ["events", path.join(sessionDir(sessionId), "events.ndjson")],
    ["plan", artifactPath(sessionId, "plan.json")],
    ["manifest", artifactPath(sessionId, "manifest.json")],
    ["checksums", artifactPath(sessionId, "checksums.json")],
    ["report", artifactPath(sessionId, "report.json")],
    ["result", artifactPath(sessionId, "result.json")],
  ] as const;

  for (const [key, file] of known) {
    if (fs.existsSync(file)) {
      result[key] = file;
    }
  }

  return { ...result, ...ensureArtifactsIndex(sessionId) };
}

function emitSessionEvent(session: MigrationSession, type: MigrationEvent["type"], message?: string, phase?: MigrationPhase, level: MigrationEvent["level"] = "info") {
  appendEvent({
    sessionId: session.id,
    type,
    ts: new Date().toISOString(),
    phase,
    step: session.currentStep,
    level,
    message,
    meta: {
      session,
    },
  });
}

function phaseProgress(phase: MigrationPhase, phasePercent = 0) {
  const index = PHASE_INDEX.get(phase) || 0;
  const percent = Math.min(99, Math.round(((index + phasePercent / 100) / MIGRATION_PHASES.length) * 100));
  return { percent, phasePercent };
}

function handleWorkerEvent(sessionId: string, event: MigrationEvent) {
  const current = loadSession(sessionId);
  if (!current) return;
  let next = current;

  if (event.type === "phase_started" && event.phase) {
    const status: MigrationStatus = event.phase === "verify" ? "verifying" : "running";
    next = updateSession(sessionId, (session) => ({
      ...session,
      status,
      pageState: status,
      currentPhase: event.phase!,
      currentStep: event.step || event.message || event.phase!,
      startedAt: session.startedAt || new Date().toISOString(),
      progress: phaseProgress(event.phase!, 0),
    }));
  } else if (event.type === "phase_finished" && event.phase) {
    next = updateSession(sessionId, (session) => ({
      ...session,
      currentPhase: event.phase!,
      currentStep: event.step || event.message || session.currentStep,
      progress: phaseProgress(event.phase!, 100),
    }));
  } else if (event.type === "transfer_progress") {
    next = updateSession(sessionId, (session) => ({
      ...session,
      transfer: {
        ...session.transfer,
        currentFile: typeof event.meta?.currentFile === "string" ? event.meta.currentFile : session.transfer.currentFile,
        bytesDone: event.current || session.transfer.bytesDone,
        bytesTotal: event.total || session.transfer.bytesTotal,
        percent: event.percent || session.transfer.percent,
        etaSeconds: typeof event.meta?.etaSeconds === "number" ? event.meta.etaSeconds : session.transfer.etaSeconds,
        speedBytesPerSec: typeof event.meta?.speedBytesPerSec === "number" ? event.meta.speedBytesPerSec : session.transfer.speedBytesPerSec,
      },
    }));
  } else if (event.type === "result") {
    const outcome = String(event.meta?.outcome || "failed");
    const status: MigrationStatus = outcome === "completed"
      ? "completed"
      : outcome === "rolled_back"
        ? "rolled_back"
        : outcome === "blocked"
          ? "blocked"
          : "failed";
    next = updateSession(sessionId, (session) => ({
      ...session,
      status,
      pageState: status,
      endedAt: new Date().toISOString(),
      progress: {
        percent: 100,
        phasePercent: 100,
      },
      result: {
        ...session.result,
        outcome: outcome as MigrationSession["result"]["outcome"],
        message: event.message || session.result.message,
        verification: Array.isArray(event.meta?.verification) ? (event.meta.verification as any) : session.result.verification,
        rollback: typeof event.meta?.rollback === "object" && event.meta.rollback ? (event.meta.rollback as any) : session.result.rollback,
        checksumsVerified: Boolean(event.meta?.checksumsVerified),
        downtimeSeconds:
          typeof event.meta?.downtimeSeconds === "number" ? Number(event.meta.downtimeSeconds) : session.result.downtimeSeconds,
        sourceRestarted: Boolean(event.meta?.sourceRestarted),
        finalResources: Array.isArray(event.meta?.finalResources) ? (event.meta.finalResources as string[]) : session.result.finalResources,
        artifacts: Object.keys(buildArtifactsIndex(sessionId)),
        artifactsIndex: buildArtifactsIndex(sessionId),
      },
      transfer: {
        ...session.transfer,
        checksumStatus: event.meta?.checksumsVerified ? "passed" : session.transfer.checksumStatus,
      },
    }));
  }

  appendEvent({
    ...event,
    meta: {
      ...(event.meta || {}),
      session: next,
    },
  });
}

function pipeWorkerOutput(sessionId: string, worker: ChildProcessWithoutNullStreams) {
  let stdoutBuffer = "";
  worker.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf-8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        handleWorkerEvent(sessionId, JSON.parse(trimmed) as MigrationEvent);
      } catch {
        appendEvent({
          sessionId,
          type: "command_log",
          ts: new Date().toISOString(),
          phase: loadSession(sessionId)?.currentPhase,
          step: "worker",
          level: "warn",
          message: trimmed,
          meta: {
            session: loadSession(sessionId) || undefined,
          },
        });
      }
    }
  });

  worker.stderr.on("data", (chunk) => {
    appendEvent({
      sessionId,
      type: "command_log",
      ts: new Date().toISOString(),
      phase: loadSession(sessionId)?.currentPhase,
      step: "worker",
      level: "warn",
      message: chunk.toString("utf-8").trim(),
      meta: {
        session: loadSession(sessionId) || undefined,
      },
    });
  });
}

async function spawnWorker(sessionId: string, spec: WorkerExecutionSpec) {
  ensureMigrationDirs(sessionId);
  fs.mkdirSync(spec.imageArchiveDir, { recursive: true });
  fs.mkdirSync(spec.bindArchiveDir, { recursive: true });
  fs.mkdirSync(spec.volumeArchiveDir, { recursive: true });
  fs.writeFileSync(specFile(sessionId), JSON.stringify(spec, null, 2), { encoding: "utf-8", mode: 0o600 });

  const python = await resolvePythonCommand();
  const scriptPath = path.join(process.cwd(), "server", "workers", "migration_worker.py");
  const worker = spawn(python.command, [...python.args, scriptPath, specFile(sessionId)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  runningWorkers.set(sessionId, worker);
  pipeWorkerOutput(sessionId, worker);

  worker.on("close", (code) => {
    runningWorkers.delete(sessionId);
    const current = loadSession(sessionId);
    if (!current) return;
    if (current.status === "completed" || current.status === "rolled_back") return;
    if (code === 0 && current.result.outcome === "completed") return;

    const next = updateSession(sessionId, (session) => ({
      ...session,
      status: session.status === "rolled_back" ? "rolled_back" : "failed",
      pageState: session.status === "rolled_back" ? "rolled_back" : "failed",
      endedAt: new Date().toISOString(),
      result: {
        ...session.result,
        outcome: session.status === "rolled_back" ? "rolled_back" : "failed",
        message: session.result.message || `迁移执行器异常退出（exit code: ${code ?? "unknown"}）`,
        artifacts: Object.keys(buildArtifactsIndex(sessionId)),
        artifactsIndex: buildArtifactsIndex(sessionId),
      },
    }));
    emitSessionEvent(next, "phase_failed", next.result.message, next.currentPhase, "error");
  });
}

export async function startWorkerExecution(session: MigrationSession, actor = "admin") {
  if (runningWorkers.has(session.id)) {
    throw new Error("迁移会话已经在执行中");
  }

  const next = updateSession(session.id, (current) => ({
    ...current,
    status: "running",
    pageState: "running",
    startedAt: new Date().toISOString(),
    currentPhase: "preflight",
    currentStep: "准备执行迁移",
    progress: phaseProgress("preflight", 0),
    result: {
      ...current.result,
      message: "迁移执行中",
    },
  }));

  emitSessionEvent(next, "phase_started", "迁移任务已启动", "preflight", "info");
  await spawnWorker(session.id, createExecutionSpec(next));
  recordAuditLog(actor, "migration.start", "migration-session", session.id, "info", {
    projectName: session.projectName,
    sourceEnvironmentId: session.sourceEnvironmentId,
    targetEnvironmentId: session.targetEnvironmentId,
  });
  return loadSession(session.id)!;
}

export async function startWorkerRollback(session: MigrationSession, actor = "admin") {
  if (runningWorkers.has(session.id)) {
    runningWorkers.get(session.id)?.kill();
    runningWorkers.delete(session.id);
  }

  const next = updateSession(session.id, (current) => ({
    ...current,
    status: "running",
    pageState: "running",
    currentPhase: "rollback_if_needed",
    currentStep: "开始回滚目标环境并恢复源环境",
    result: {
      ...current.result,
      rollback: {
        ...current.result.rollback,
        status: "not_requested",
      },
    },
  }));

  emitSessionEvent(next, "phase_started", "开始执行回滚", "rollback_if_needed", "warn");
  await spawnWorker(session.id, createRollbackSpec(next));
  recordAuditLog(actor, "migration.rollback", "migration-session", session.id, "warning", {
    projectName: session.projectName,
  });
  return loadSession(session.id)!;
}

export function listMigrationSessions(serverId?: string) {
  const sessions = listSessions();
  if (!serverId) return sessions;
  return sessions.filter((session) => session.sourceEnvironmentId === serverId || session.targetEnvironmentId === serverId);
}

export function getArtifactsIndex(sessionId: string) {
  const session = loadSession(sessionId);
  if (!session) {
    throw new Error("迁移会话不存在");
  }

  return {
    sessionId,
    artifacts: buildArtifactsIndex(sessionId),
    events: readEvents(sessionId),
  };
}
