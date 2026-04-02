export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
  sourceKind?: 'compose-project' | 'standalone-container';
  composeProject?: string;
  composeService?: string;
}

export interface ProxyRoute {
  id: string;
  domain: string;
  target: string;
  ssl: boolean;
  createdAt: string;
}

export interface DNSRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export interface AppConfig {
  nginxContainer: string;
  certAgentContainer: string;
  vpsIp: string;
  hasCfToken: boolean;
  hasCfZone: boolean;
  cfProxied: boolean;
  cfTtl: number;
  allowedDomains: string[];
}

export interface Certificate {
  domain: string;
  issueDate: string;
  expiryDate: string;
  status: 'valid' | 'expired' | 'renewing';
}

export interface MigrationProject {
  name: string;
  path: string;
  composePath: string;
  services: string[];
  sourceType?: 'runtime-compose' | 'managed-project' | 'runtime-container';
  sourceKind?: 'compose-project' | 'standalone-container';
  selectionMode?: 'whole-project' | 'single-service';
  planningMode?: 'compose-file' | 'runtime-snapshot';
  description?: string;
  runningContainerCount?: number;
}

export interface MigrationBoundaryItem {
  kind: string;
  label: string;
  detail: string;
}

export interface MigrationResourceImpact {
  kind: string;
  label: string;
  classification: 'read-only inspect' | 'new staging resource' | 'needs cutover' | 'blocked';
  detail: string;
}

export interface MigrationRisk {
  id: string;
  level: 'low' | 'medium' | 'high';
  title: string;
  category: string;
  scope: string;
  reason: string;
  blocking: boolean;
  recommendation: string;
}

export interface MigrationConflictItem {
  id: string;
  kind: string;
  target: string;
  reason: string;
  blocking: boolean;
  recommendation: string;
}

export interface MigrationServiceInfo {
  name: string;
  image?: string;
  hasPorts: boolean;
  ports: number[];
  envFiles: string[];
  externalNetworks: string[];
  internalNetworks: string[];
  namedVolumes: string[];
  bindMounts: string[];
}

export interface MigrationRuntimeDrift {
  service: string;
  running: boolean;
  containerNames: string[];
  notes: string[];
}

export interface MigrationPlan {
  sessionId: string;
  projectName: string;
  projectPath: string;
  composePath: string;
  rootService: string;
  dependencyServices: string[];
  selectedServices: string[];
  services: MigrationServiceInfo[];
  readOnlyInspect: MigrationResourceImpact[];
  stagingResources: MigrationResourceImpact[];
  needsCutover: MigrationResourceImpact[];
  blockedResources: MigrationResourceImpact[];
  notTouched: MigrationBoundaryItem[];
  safetyBoundary: {
    immutableTargets: MigrationBoundaryItem[];
    permissions: MigrationBoundaryItem[];
  };
  risks: MigrationRisk[];
  conflicts: MigrationConflictItem[];
  target: {
    host: string;
    port: number;
    username: string;
    workdir: string;
  };
  artifactPaths: {
    manifest: string;
    riskReport: string;
    stagingCompose: string;
    cutoverCompose: string;
  };
  runtimeDrift: MigrationRuntimeDrift[];
  transferEstimate: {
    totalBytes: number;
    knownVolumeBytes: number;
    projectBytes: number;
    unknownVolumeSize: boolean;
  };
  preflight: {
    dockerVersion?: string;
    composeVersion?: string;
    architecture?: string;
    availableDiskBytes?: number;
    missingPermissions: string[];
  };
}

export interface MigrationServiceRuntimeState {
  phase: string;
  status: string;
  health: 'unknown' | 'starting' | 'healthy' | 'unhealthy';
  dataStatus: 'n/a' | 'pending' | 'synced' | 'restored' | 'failed' | 'skipped';
  updatedAt: string;
  note?: string;
}

export interface MigrationTransferSummary {
  currentFile?: string;
  bytesDone: number;
  bytesTotal: number;
  percent: number;
  etaSeconds?: number | null;
  speedBytesPerSec?: number | null;
  checksumStatus: 'pending' | 'verifying' | 'passed' | 'failed' | 'n/a';
}

export interface RollbackSummary {
  status: 'not_requested' | 'completed' | 'failed';
  actions: string[];
  message?: string;
  finishedAt?: string;
}

export interface MigrationSession {
  id: string;
  status:
    | 'idle'
    | 'planning'
    | 'plan_ready'
    | 'blocked'
    | 'running'
    | 'cutover_pending'
    | 'verifying'
    | 'completed'
    | 'rolled_back'
    | 'failed';
  pageState:
    | 'idle'
    | 'planning'
    | 'plan_ready'
    | 'blocked'
    | 'running'
    | 'cutover_pending'
    | 'verifying'
    | 'completed'
    | 'rolled_back'
    | 'failed';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  projectName: string;
  projectPath: string;
  composePath: string;
  rootService: string;
  dependencyServices: string[];
  selectedServices: string[];
  target: {
    host: string;
    port: number;
    username: string;
    workdir: string;
  };
  currentPhase: string;
  currentStep: string;
  progress: {
    percent: number;
    phasePercent: number;
  };
  serviceCount: number;
  riskCounts: Record<'low' | 'medium' | 'high', number>;
  blockingCount: number;
  plan: MigrationPlan;
  services: Record<string, MigrationServiceRuntimeState>;
  transfer: MigrationTransferSummary;
  result: {
    outcome: 'pending' | 'blocked' | 'completed' | 'rolled_back' | 'failed';
    message: string;
    artifacts: string[];
    finalResources: string[];
    verification: Array<{
      label: string;
      status: 'pass' | 'warn' | 'fail';
      detail: string;
    }>;
    rollback: RollbackSummary;
  };
}

export interface MigrationEvent {
  sessionId?: string;
  type:
    | 'phase_started'
    | 'phase_finished'
    | 'phase_failed'
    | 'service_status_changed'
    | 'transfer_progress'
    | 'command_log'
    | 'session_summary'
    | 'result'
    | 'heartbeat';
  ts: string;
  phase?: string;
  step?: string;
  service?: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  message?: string;
  command?: string;
  current?: number;
  total?: number;
  percent?: number;
  unit?: string;
  meta?: {
    session?: MigrationSession;
    currentFile?: string;
    etaSeconds?: number | null;
    speedBytesPerSec?: number | null;
    serviceState?: MigrationServiceRuntimeState;
    [key: string]: unknown;
  };
}
