import { getContainers } from './docker';
import { listGateways, listServerGatewaySummaries, getGatewayCertificates } from './gateways';
import { getMonitorSnapshot } from './monitor';
import { listEnvironments, getEnvironment } from './platform';
import { listJobs } from './jobs';

function formatCollector(collector: string) {
  if (collector === 'docker-host-helper') return 'Docker Host Helper';
  if (collector === 'ssh-procfs') return 'SSH /procfs';
  return '系统监控';
}

function formatChannelStatus(environment: ReturnType<typeof getEnvironment>) {
  if (environment.isLocal) return 'embedded';
  if (environment.status === 'ready') return 'connected';
  if (environment.status === 'warning') return 'degraded';
  if (environment.status === 'error') return 'error';
  return 'pending';
}

function getServerChannelsInternal(environmentId: string) {
  const environment = getEnvironment(environmentId);
  return [
    {
      id: `${environmentId}:ssh`,
      kind: 'ssh',
      label: 'SSH',
      status: formatChannelStatus(environment),
      detail: environment.isLocal
        ? '本机内嵌运行环境'
        : environment.lastError || environment.hostFingerprint || '用于管理远程 Docker 环境的主通道。',
      fingerprint: environment.hostFingerprint,
      sudoMode: environment.capabilities.sudoMode,
      permissions: environment.capabilities.permissions,
      available: !environment.isLocal,
    },
    {
      id: `${environmentId}:tmcp`,
      kind: 'tmcp',
      label: 'TMCP',
      status: 'not_configured',
      detail: '当前项目尚未配置 TMCP 通道。',
      permissions: [],
      available: false,
    },
    {
      id: `${environmentId}:agent`,
      kind: 'agent',
      label: 'Agent',
      status: 'not_configured',
      detail: '当前项目尚未配置 Agent 通道。',
      permissions: [],
      available: false,
    },
  ];
}

async function buildBaseServerSummary(environmentId: string) {
  const environment = getEnvironment(environmentId);
  const gatewaySummary = listServerGatewaySummaries().get(environmentId) || {
    total: 0,
    active: 0,
    certificates: 0,
    routes: 0,
  };

  return {
    ...environment,
    serverId: environment.id,
    serverType: environment.isLocal ? 'local-host' : environment.source,
    metrics: null,
    gatewaySummary,
    workloadSummary: {
      total: 0,
      running: 0,
      composeProjects: 0,
      standalone: 0,
    },
    channelSummary: getServerChannelsInternal(environmentId).map((channel) => ({
      kind: channel.kind,
      label: channel.label,
      status: channel.status,
    })),
    lastHeartbeatAt: environment.lastVerifiedAt || environment.updatedAt,
    summaryMode: 'lite' as const,
  };
}

async function buildDetailedServerSummary(environmentId: string) {
  const summary = await buildBaseServerSummary(environmentId);

  let metrics = null;
  try {
    const snapshot = await getMonitorSnapshot(environmentId);
    metrics = {
      cpu: Number((snapshot.cpu.load || 0).toFixed(1)),
      memoryPercent: Number((((snapshot.memory.used || 0) / (snapshot.memory.total || 1)) * 100).toFixed(1)),
      diskPercent: Number((snapshot.disk.find((disk) => disk.mount === '/')?.use || snapshot.disk[0]?.use || 0).toFixed(1)),
      collector: formatCollector(snapshot.collector),
      scope: snapshot.scope,
      warning: snapshot.warning,
    };
  } catch {
    metrics = null;
  }

  let workloadSummary = summary.workloadSummary;
  try {
    const containers = await getContainers(environmentId);
    workloadSummary = {
      total: containers.length,
      running: containers.filter((container) => container.state === 'running').length,
      composeProjects: new Set(containers.filter((container) => container.composeProject).map((container) => container.composeProject)).size,
      standalone: containers.filter((container) => container.sourceKind === 'standalone-container').length,
    };
  } catch {
    workloadSummary = summary.workloadSummary;
  }

  return {
    ...summary,
    metrics,
    workloadSummary,
    summaryMode: 'full' as const,
  };
}

export async function listServers() {
  const environments = listEnvironments();
  return Promise.all(environments.map((environment) => buildBaseServerSummary(environment.id)));
}

export async function getServerSummary(serverId: string) {
  return buildDetailedServerSummary(serverId);
}

export async function getServerMetrics(serverId: string) {
  return getMonitorSnapshot(serverId);
}

export function getServerChannels(serverId: string) {
  return getServerChannelsInternal(serverId);
}

export function getServerTasks(serverId: string) {
  return listJobs(serverId);
}

export function getServerCertificates(serverId: string) {
  return listGateways(serverId).flatMap((gateway) => getGatewayCertificates(gateway.id));
}
