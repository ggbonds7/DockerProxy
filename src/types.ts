import type { ReactNode } from 'react';

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
  gatewayId?: string;
  serverId?: string | null;
  domain: string;
  target: string;
  ssl: boolean;
  source: 'managed' | 'nginx-import';
  managedState: 'managed' | 'unmanaged' | 'imported';
  sourceConfPath?: string | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface DNSRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export interface DNSProviderConnection {
  id: string;
  kind: string;
  provider: 'cloudflare' | 'gcore';
  displayName: string;
  status: string;
  managedBy: 'database' | string;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  zoneCount?: number | null;
  lastError?: string | null;
  settings: {
    managedZones: string[];
    defaultTtl: number | null;
    defaultProxied?: boolean | null;
  };
  capabilities: {
    supportsProxyStatus: boolean;
    recordTypes: string[];
  };
}

export interface DNSProviderAuthField {
  key: 'apiToken' | 'apiKey';
  label: string;
  placeholder: string;
  secret: boolean;
}

export interface DNSProviderCatalogItem {
  key: 'cloudflare' | 'gcore';
  name: string;
  supportsProxyStatus: boolean;
  authFields: DNSProviderAuthField[];
  description: string;
}

export interface DNSZoneSummary {
  id: string;
  name: string;
  status?: string;
  provider: string;
}

export interface DNSProviderRecord {
  id: string;
  provider: string;
  name: string;
  fqdn: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  editable: boolean;
  deletable?: boolean;
  readOnlyReason?: string;
  meta?: Record<string, unknown>;
}

export interface EnvironmentSummary {
  id: string;
  displayName: string;
  type: 'local-docker' | 'remote-ssh-docker';
  source: 'local-host' | 'manual-ssh' | 'provider-imported';
  runtimeDriver: string;
  host: string;
  port: number;
  username: string | null;
  workdir: string;
  authType: 'password' | 'privateKey' | null;
  hostFingerprint: string | null;
  status: 'ready' | 'warning' | 'error' | 'pending';
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  isLocal: boolean;
  capabilities: {
    connect: boolean;
    inspect: boolean;
    operate: boolean;
    elevated: boolean;
    dockerVersion?: string | null;
    composeVersion?: string | null;
    architecture?: string | null;
    availableDiskBytes?: number | null;
    sudoMode: 'none' | 'passwordless' | 'with-password';
    permissions: string[];
    warnings: string[];
    details: Record<string, unknown>;
    modules: Record<string, boolean>;
  };
}

export interface AppConfig {
  nginxContainer: string;
  certAgentContainer: string;
  vpsIp: string;
  hasAppMasterKey: boolean;
  environmentCount: number;
  providerConnectionCount?: number;
}

export interface Certificate {
  id?: string;
  gatewayId?: string;
  serverId?: string | null;
  gatewayName?: string;
  domain: string;
  issueDate: string;
  expiryDate: string;
  status: 'valid' | 'expired' | 'renewing';
  routeTarget?: string;
}

export interface ContainerLogEntry {
  timestamp: string | null;
  stream: 'stdout' | 'stderr' | 'combined';
  message: string;
  raw: string;
}

export interface ServerChannel {
  id: string;
  kind: 'ssh' | 'tmcp' | 'agent';
  label: string;
  status: string;
  detail: string;
  fingerprint?: string | null;
  sudoMode?: string;
  permissions: string[];
  available: boolean;
}

export interface GatewaySummary {
  id: string;
  serverId: string | null;
  displayName: string;
  kind: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  server: {
    id: string;
    displayName: string;
    host: string;
    status: string;
  } | null;
  routeCount: number;
  certificateCount: number;
  capabilities: {
    routeManagement: boolean;
    certificateManagement: boolean;
  };
}

export interface GatewaySyncRouteItem {
  confPath: string;
  domain?: string;
  target?: string;
  ssl?: boolean;
  reason: string;
}

export interface GatewaySyncResult {
  gatewayId: string;
  imported: ProxyRoute[];
  updated: ProxyRoute[];
  skipped: GatewaySyncRouteItem[];
  unmanaged: GatewaySyncRouteItem[];
  warnings: string[];
}

export interface JobSummary {
  id: string;
  kind: string;
  sourceServerId?: string | null;
  targetServerId?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
  source: 'job' | 'migration';
}

export interface ServerSummary extends EnvironmentSummary {
  serverId: string;
  serverType: 'local-host' | 'manual-ssh' | 'provider-imported' | string;
  summaryMode?: 'lite' | 'full';
  metrics: {
    cpu: number;
    memoryPercent: number;
    diskPercent: number;
    collector: string;
    scope: 'host' | 'runtime';
    warning?: string;
  } | null;
  gatewaySummary: {
    total: number;
    active: number;
    certificates: number;
    routes: number;
  };
  workloadSummary: {
    total: number;
    running: number;
    composeProjects: number;
    standalone: number;
  };
  channelSummary: Array<{
    kind: string;
    label: string;
    status: string;
  }>;
  lastHeartbeatAt: string | null;
}

export interface MonitorSnapshot {
  scope: 'host' | 'runtime';
  collector: 'docker-host-helper' | 'systeminformation' | 'ssh-procfs';
  warning?: string;
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    load: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
    uptime: number;
  };
  disk: Array<{
    fs: string;
    size: number;
    used: number;
    use: number;
    mount: string;
  }>;
  network: {
    latency: number;
    rx_sec: number;
    tx_sec: number;
  };
}

export interface MigrationProject {
  name: string;
  path: string;
  composePath: string;
  composeFiles: string[];
  discoverySource: 'managed' | 'filesystem';
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

export interface MigrationProjectListResponse {
  projects: MigrationProject[];
  discoveryMeta: MigrationProjectDiscoveryMeta;
}

export interface MigrationRisk {
  id: string;
  level: 'low' | 'medium' | 'high';
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
  externalNetworks: string[];
  namedVolumes: string[];
  bindMounts: string[];
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

export interface MigrationPlan {
  sessionId: string;
  projectName: string;
  projectPath: string;
  composePath: string;
  composeFiles: string[];
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  sourceDiscovery: 'managed' | 'filesystem';
  services: MigrationServiceInfo[];
  projectFiles: MigrationProjectFileSummary;
  externalBindMounts: MigrationExternalBindMount[];
  namedVolumes: MigrationNamedVolume[];
  imageTransfers: MigrationImageTransfer[];
  unsupportedItems: MigrationUnsupportedItem[];
  risks: MigrationRisk[];
  target: {
    host: string;
    port: number;
    username: string | null;
    workdir: string;
    projectDir: string;
    composePath: string;
  };
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

export interface MigrationSession {
  id: string;
  status:
    | 'plan_ready'
    | 'blocked'
    | 'running'
    | 'verifying'
    | 'completed'
    | 'rolled_back'
    | 'failed';
  pageState:
    | 'planning'
    | 'plan_ready'
    | 'blocked'
    | 'running'
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
  sourceEnvironmentId: string;
  targetEnvironmentId: string;
  currentPhase:
    | 'discover'
    | 'plan'
    | 'preflight'
    | 'stage_images'
    | 'stage_project'
    | 'stop_source'
    | 'export_data'
    | 'upload_restore'
    | 'start_target'
    | 'verify'
    | 'rollback_if_needed';
  currentStep: string;
  progress: {
    percent: number;
    phasePercent: number;
  };
  serviceCount: number;
  riskCounts: Record<'low' | 'medium' | 'high', number>;
  blockingCount: number;
  plan: MigrationPlan;
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
    rollback: MigrationRollbackSummary;
    checksumsVerified: boolean;
    downtimeSeconds?: number | null;
    sourceRestarted: boolean;
    artifactsIndex: Record<string, string>;
  };
  approvals: {
    externalBindMounts: string[];
    downtimeConfirmed: boolean;
  };
}

export interface MigrationEvent {
  sessionId?: string;
  type:
    | 'phase_started'
    | 'phase_finished'
    | 'phase_failed'
    | 'transfer_progress'
    | 'command_log'
    | 'result'
    | 'session_summary'
    | 'heartbeat';
  ts: string;
  phase?: MigrationSession['currentPhase'];
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

export interface MigrationArtifactsResponse {
  sessionId: string;
  artifacts: Record<string, string>;
  events: MigrationEvent[];
}

export type AppRouteGroupKey = 'infrastructure' | 'delivery' | 'network' | 'operations' | 'settings';

export type AppRouteKey =
  | 'infrastructure.overview'
  | 'infrastructure.environments'
  | 'delivery.workloads'
  | 'delivery.deployments'
  | 'network.dnsConnections'
  | 'network.dnsRecords'
  | 'network.gatewayRoutes'
  | 'network.certificates'
  | 'operations.migration'
  | 'operations.jobs'
  | 'settings.configuration'
  | 'settings.preferences';

export interface AppRouteMeta {
  key: AppRouteKey;
  groupKey: AppRouteGroupKey;
  path: string;
  title: string;
  description: string;
  menuVisible: boolean;
}

export interface NavGroupMeta {
  key: AppRouteGroupKey;
  label: string;
  icon: ReactNode;
  items: AppRouteMeta[];
}

export interface UserProfile {
  username: string;
}

export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

export interface FeedbackAction {
  label: string;
  handler?: () => void | Promise<void>;
}

export interface AppNotification {
  id: string;
  level: NotifyLevel;
  message: string;
  description?: string;
  source?: string;
  timestamp: string;
  read: boolean;
  action?: FeedbackAction;
  requestId?: string;
}

export interface ApiErrorNormalized {
  status: number;
  code: string;
  message: string;
  details?: string;
  requestId?: string;
  retryable?: boolean;
}
