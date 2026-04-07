import fs from "fs";
import path from "path";
import { buildMigrationPlan, countBlockingItems, countRisks, inspectMigrationProject, listMigrationProjectCatalog, listMigrationProjects } from "./discovery";
import {
  appendEvent,
  artifactsDir,
  createSessionId,
  createSessionSkeleton,
  loadSession,
  saveSession,
  subscribeMigrationEvents,
  updateSession,
} from "./storage";
import type { CreateMigrationPlanInput, MigrationSession, StartMigrationInput } from "./types";
import { getArtifactsIndex, listMigrationSessions, startWorkerExecution, startWorkerRollback } from "./worker-runner";

function writePlanArtifact(session: MigrationSession) {
  fs.mkdirSync(artifactsDir(session.id), { recursive: true });
  fs.writeFileSync(path.join(artifactsDir(session.id), "plan.json"), JSON.stringify(session.plan, null, 2), "utf-8");
}

export async function createMigrationPlan(input: CreateMigrationPlanInput) {
  const sessionId = createSessionId();
  const plan = await buildMigrationPlan(input, sessionId);
  const blockingCount = countBlockingItems(plan);
  const status = blockingCount > 0 ? "blocked" : "plan_ready";
  const session = createSessionSkeleton({
    id: sessionId,
    status,
    projectName: plan.projectName,
    projectPath: plan.projectPath,
    composePath: plan.composePath,
    sourceEnvironmentId: plan.sourceEnvironmentId,
    targetEnvironmentId: plan.targetEnvironmentId,
    currentPhase: "plan",
    currentStep: blockingCount > 0 ? "存在阻断项，需先处理" : "计划已生成，等待确认执行",
    serviceCount: plan.services.length,
    riskCounts: countRisks(plan),
    blockingCount,
    plan,
    result: {
      outcome: blockingCount > 0 ? "blocked" : "pending",
      message: blockingCount > 0 ? "计划已生成，但包含阻断项。" : "计划已生成，可以进入执行阶段。",
      artifacts: [],
      finalResources: [],
      verification: [],
      rollback: {
        status: "not_requested",
        actions: [],
      },
      checksumsVerified: false,
      sourceRestarted: false,
      artifactsIndex: {},
    },
  });
  saveSession(session);
  writePlanArtifact(session);
  appendEvent({
    sessionId,
    type: "session_summary",
    ts: new Date().toISOString(),
    phase: "plan",
    step: session.currentStep,
    level: status === "blocked" ? "warn" : "success",
    message: session.result.message,
    meta: { session },
  });
  return loadSession(sessionId)!;
}

export function getMigrationSession(sessionId: string) {
  const session = loadSession(sessionId);
  if (!session) {
    throw new Error("迁移会话不存在");
  }
  return session;
}

export { inspectMigrationProject, listMigrationProjectCatalog, listMigrationProjects, listMigrationSessions, subscribeMigrationEvents };

export function getMigrationArtifacts(sessionId: string) {
  return getArtifactsIndex(sessionId);
}

export async function startMigrationSession(sessionId: string, input: StartMigrationInput = { confirmDowntime: false }) {
  const session = getMigrationSession(sessionId);
  if (session.blockingCount > 0) {
    throw new Error("当前迁移计划存在阻断项，不能直接执行。");
  }
  if (!input.confirmDowntime) {
    throw new Error("迁移执行前必须确认停机窗口。");
  }

  const approvedExternalBindMounts = Array.isArray(input.approvedExternalBindMounts)
    ? input.approvedExternalBindMounts.map((item) => String(item))
    : [];
  const requiredApprovals = session.plan.externalBindMounts.map((item) => item.path);
  if (requiredApprovals.length > 0) {
    const missing = requiredApprovals.filter((item) => !approvedExternalBindMounts.includes(item));
    if (missing.length > 0) {
      throw new Error(`以下项目外目录仍未确认：${missing.join("、")}`);
    }
  }

  const next = updateSession(sessionId, (current) => ({
    ...current,
    approvals: {
      externalBindMounts: approvedExternalBindMounts,
      downtimeConfirmed: true,
    },
    plan: {
      ...current.plan,
      externalBindMounts: current.plan.externalBindMounts.map((item) => ({
        ...item,
        approved: approvedExternalBindMounts.includes(item.path),
      })),
    },
  }));
  return startWorkerExecution(next);
}

export async function rollbackMigrationSession(sessionId: string) {
  const session = getMigrationSession(sessionId);
  return startWorkerRollback(session);
}
