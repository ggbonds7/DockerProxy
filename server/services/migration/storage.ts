import crypto from "crypto";
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { CONFIG } from "../../utils/config";
import type { MigrationEvent, MigrationPhase, MigrationSession, MigrationStatus } from "./types";

const migrationEvents = new EventEmitter();
migrationEvents.setMaxListeners(0);

export function nowIso() {
  return new Date().toISOString();
}

export function migrationRoot() {
  return path.join(CONFIG.DATA_DIR, "migrations");
}

export function sessionDir(sessionId: string) {
  return path.join(migrationRoot(), sessionId);
}

export function artifactsDir(sessionId: string) {
  return path.join(sessionDir(sessionId), "artifacts");
}

export function spoolDir(sessionId: string) {
  return path.join(sessionDir(sessionId), "spool");
}

export function sessionFile(sessionId: string) {
  return path.join(sessionDir(sessionId), "session.json");
}

export function eventsFile(sessionId: string) {
  return path.join(sessionDir(sessionId), "events.ndjson");
}

export function specFile(sessionId: string) {
  return path.join(sessionDir(sessionId), "execution-spec.json");
}

export function ensureMigrationDirs(sessionId?: string) {
  fs.mkdirSync(migrationRoot(), { recursive: true });
  if (!sessionId) return;
  fs.mkdirSync(sessionDir(sessionId), { recursive: true });
  fs.mkdirSync(artifactsDir(sessionId), { recursive: true });
  fs.mkdirSync(spoolDir(sessionId), { recursive: true });
}

export function emptyTransferSummary() {
  return {
    bytesDone: 0,
    bytesTotal: 0,
    percent: 0,
    checksumStatus: "pending" as const,
  };
}

export function emptyResult() {
  return {
    outcome: "pending" as const,
    message: "等待执行",
    artifacts: [],
    finalResources: [],
    verification: [],
    rollback: {
      status: "not_requested" as const,
      actions: [],
    },
    checksumsVerified: false,
    sourceRestarted: false,
    artifactsIndex: {},
  };
}

export function createSessionSkeleton(input: Omit<MigrationSession, "createdAt" | "updatedAt" | "result" | "transfer" | "approvals" | "progress" | "pageState"> & Partial<Pick<MigrationSession, "pageState" | "result" | "transfer" | "approvals" | "progress">>) {
  const timestamp = nowIso();
  return {
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
    pageState: input.pageState || input.status,
    progress: input.progress || { percent: 0, phasePercent: 0 },
    transfer: input.transfer || emptyTransferSummary(),
    result: input.result || emptyResult(),
    approvals: input.approvals || { externalBindMounts: [], downtimeConfirmed: false },
  } satisfies MigrationSession;
}

export function saveSession(session: MigrationSession) {
  ensureMigrationDirs(session.id);
  fs.writeFileSync(sessionFile(session.id), JSON.stringify(session, null, 2), "utf-8");
}

export function loadSession(sessionId: string) {
  const file = sessionFile(sessionId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as MigrationSession;
}

export function listSessions() {
  ensureMigrationDirs();
  return fs
    .readdirSync(migrationRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadSession(entry.name))
    .filter((session): session is MigrationSession => Boolean(session))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function updateSession(sessionId: string, updater: (session: MigrationSession) => MigrationSession) {
  const current = loadSession(sessionId);
  if (!current) {
    throw new Error("迁移会话不存在");
  }
  const next = updater({ ...current, updatedAt: nowIso() });
  saveSession(next);
  return next;
}

export function readEvents(sessionId: string) {
  const file = eventsFile(sessionId);
  if (!fs.existsSync(file)) return [] as MigrationEvent[];
  return fs
    .readFileSync(file, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as MigrationEvent);
}

export function appendEvent(event: MigrationEvent) {
  ensureMigrationDirs(event.sessionId);
  fs.appendFileSync(eventsFile(event.sessionId), `${JSON.stringify(event)}\n`, "utf-8");
  migrationEvents.emit(event.sessionId, event);
}

export function subscribeMigrationEvents(sessionId: string, listener: (event: MigrationEvent) => void) {
  const existing = readEvents(sessionId);
  for (const event of existing) {
    listener(event);
  }
  migrationEvents.on(sessionId, listener);
  return () => migrationEvents.off(sessionId, listener);
}

export function setSessionStatus(
  sessionId: string,
  status: MigrationStatus,
  phase: MigrationPhase,
  step: string,
  percent: number,
  phasePercent: number
) {
  return updateSession(sessionId, (session) => ({
    ...session,
    status,
    pageState: status,
    currentPhase: phase,
    currentStep: step,
    progress: {
      percent,
      phasePercent,
    },
  }));
}

export function ensureArtifactsIndex(sessionId: string) {
  const index: Record<string, string> = {};
  const root = artifactsDir(sessionId);
  if (!fs.existsSync(root)) return index;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    index[entry.name] = path.join(root, entry.name);
  }
  return index;
}

export function createSessionId() {
  return crypto.randomUUID();
}
