export const MIGRATION_PHASES = [
  'discover',
  'plan',
  'preflight',
  'stage_images',
  'stage_project',
  'stop_source',
  'export_data',
  'upload_restore',
  'start_target',
  'verify',
  'rollback_if_needed',
] as const;

export type MigrationPhase = (typeof MIGRATION_PHASES)[number];
export type MigrationStatus =
  | 'planning'
  | 'plan_ready'
  | 'blocked'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'rolled_back'
  | 'failed';

export type MigrationProjectDiscoverySource = 'managed' | 'filesystem';
export type MigrationMountKind = 'volume' | 'bind';
export type MigrationSeverity = 'low' | 'medium' | 'high';

export interface MigrationProject {
  name: string;
  path: string;
  composePath: string;
  composeFiles: string[];
  discoverySource: MigrationProjectDiscoverySource;
  services: string[];
  warnings: string[];
}

export interface MigrationProjectDiscoveryMeta {
  runtimeTried: boolean;
  runtimeFound: number;
  workdir: string;
  workdirExists: boolean;
  fallbackScanned: boolean;
  warnings: string[];
}

export interface MigrationProjectListResult {
  projects: MigrationProject[];
  discoveryMeta: MigrationProjectDiscoveryMeta;
}

export interface MigrationProjectFileSummary {
  projectDir: string;
  composePath: string;
  envFiles: string[];
  estimatedBytes: number | null;
}

export interface MigrationExternalBindMount {
  path: string;
  bytes: number | null;
  serviceNames: string[];
  requiresApproval: boolean;
  approved: boolean;
  reason?: string;
}

export interface MigrationNamedVolume {
  name: string;
  bytes: number | null;
  serviceNames: string[];
}

export interface MigrationImageTransfer {
  service: string;
  image: string;
  strategy: 'pull' | 'save_load';
  reason: string;
  pullable: boolean;
}

export interface MigrationUnsupportedItem {
  kind: string;
  label: string;
  reason: string;
  blocking: boolean;
}

export interface MigrationRisk {
  id: string;
  level: MigrationSeverity;
  title: string;
  reason: string;
  recommendation: string;
  blocking: boolean;
}

export interface MigrationServiceInfo {
  name: string;
  image?: string;
  hasBuild: boolean;
  ports: number[];
  envFiles: string[];
  namedVolumes: string[];
  bindMounts: string[];
  externalNetworks: string[];
}

export interface MigrationPlan {
  sessionId: string;
  projectName: string;
  projectPath: string;
  composePath: string;
  composeFiles: string[];
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  sourceDiscovery: MigrationProjectDiscoverySource;
  services: MigrationServiceInfo[];
  projectFiles: MigrationProjectFileSummary;
  externalBindMounts: MigrationExternalBindMount[];
  namedVolumes: MigrationNamedVolume[];
  imageTransfers: MigrationImageTransfer[];
  unsupportedItems: MigrationUnsupportedItem[];
  risks: MigrationRisk[];
  diskRequirements: {
    sourceBytes: number | null;
    targetBytes: number | null;
    localSpoolBytes: number | null;
    unknownBytes: boolean;
  };
  cutoverEstimate: {
    requiresDowntime: boolean;
    summary: string;
  };
  target: {
    host: string;
    port: number;
    username: string | null;
    workdir: string;
    projectDir: string;
    composePath: string;
  };
  preflight: {
    sourceDockerVersion?: string | null;
    sourceComposeVersion?: string | null;
    targetDockerVersion?: string | null;
    targetComposeVersion?: string | null;
    sourceAvailableDiskBytes?: number | null;
    targetAvailableDiskBytes?: number | null;
  };
  requiresApprovals: {
    externalBindMounts: boolean;
  };
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

export interface MigrationRollbackSummary {
  status: 'not_requested' | 'completed' | 'failed';
  actions: string[];
  message?: string;
  finishedAt?: string;
}

export interface MigrationSessionResult {
  outcome: 'pending' | 'blocked' | 'completed' | 'rolled_back' | 'failed';
  message: string;
  artifacts: string[];
  finalResources: string[];
  verification: Array<{
    label: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
  }>;
  rollback: MigrationRollbackSummary;
  checksumsVerified: boolean;
  downtimeSeconds?: number | null;
  sourceRestarted: boolean;
  artifactsIndex: Record<string, string>;
}

export interface MigrationSession {
  id: string;
  status: MigrationStatus;
  pageState: MigrationStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  projectName: string;
  projectPath: string;
  composePath: string;
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  currentPhase: MigrationPhase;
  currentStep: string;
  progress: {
    percent: number;
    phasePercent: number;
  };
  serviceCount: number;
  riskCounts: Record<MigrationSeverity, number>;
  blockingCount: number;
  plan: MigrationPlan;
  transfer: MigrationTransferSummary;
  result: MigrationSessionResult;
  approvals: {
    externalBindMounts: string[];
    downtimeConfirmed: boolean;
  };
}

export interface MigrationEvent {
  sessionId: string;
  type:
    | 'phase_started'
    | 'phase_finished'
    | 'phase_failed'
    | 'transfer_progress'
    | 'command_log'
    | 'session_summary'
    | 'result'
    | 'heartbeat';
  ts: string;
  phase?: MigrationPhase;
  step?: string;
  level?: 'info' | 'warn' | 'error' | 'success';
  message?: string;
  current?: number;
  total?: number;
  percent?: number;
  unit?: string;
  meta?: {
    session?: MigrationSession;
    currentFile?: string;
    etaSeconds?: number | null;
    speedBytesPerSec?: number | null;
    [key: string]: unknown;
  };
}

export interface CreateMigrationPlanInput {
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  projectPath: string;
}

export interface StartMigrationInput {
  confirmDowntime: boolean;
  approvedExternalBindMounts?: string[];
}

export interface WorkerEnvironmentSpec {
  id: string;
  isLocal: boolean;
  host: string;
  port: number;
  username: string | null;
  workdir: string;
  dockerVersion?: string | null;
  composeVersion?: string | null;
  availableDiskBytes?: number | null;
  authType?: 'password' | 'privateKey' | null;
  password?: string;
  privateKey?: string;
}

export interface WorkerExecutionSpec {
  mode: 'execute' | 'rollback';
  sessionId: string;
  projectName: string;
  projectDir: string;
  composePath: string;
  composeFiles: string[];
  spoolDir: string;
  artifactsDir: string;
  approvedExternalBindMounts: string[];
  source: WorkerEnvironmentSpec;
  target: WorkerEnvironmentSpec;
  targetProjectDir: string;
  targetComposePath: string;
  targetComposeFiles: string[];
  projectEstimate?: number | null;
  projectArchivePath: string;
  projectFinalArchivePath: string;
  imageArchiveDir: string;
  bindArchiveDir: string;
  volumeArchiveDir: string;
  namedVolumes: MigrationNamedVolume[];
  externalBindMounts: MigrationExternalBindMount[];
  imageTransfers: MigrationImageTransfer[];
  checksumsPath: string;
  reportPath: string;
  resultPath: string;
  manifestPath: string;
}
