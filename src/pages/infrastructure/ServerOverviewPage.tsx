import { CloudServerOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Col, Descriptions, Empty, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MetricTrendCard } from '../../components/charts/MetricTrendCard';
import { ServerContextCard } from '../../components/common/ServerContextCard';
import { SurfaceCard } from '../../components/common/SurfaceCard';
import { ModulePage } from '../../components/common/ModulePage';
import { useAppData } from '../../contexts/AppDataContext';
import { requestJson } from '../../lib/api';
import { formatDateTime, getStatusColor, summarizeMetadata } from '../../lib/format';
import type { JobSummary, ServerChannel, ServerSummary } from '../../types';

const TEXT = {
  noServers: '\u8fd8\u6ca1\u6709\u53ef\u7528\u7684\u670d\u52a1\u5668\u73af\u5883\uff0c\u5148\u53bb\u5b8c\u6210\u73af\u5883\u63a5\u5165\u3002',
  goEnvironment: '\u524d\u5f80\u73af\u5883\u63a5\u5165',
  refreshList: '\u5237\u65b0\u5217\u8868',
  manageEnvironment: '\u7ba1\u7406\u73af\u5883',
  total: '\u73af\u5883\u603b\u6570',
  ready: '\u53ef\u7528\u73af\u5883',
  warning: '\u544a\u8b66\u73af\u5883',
  activeGateway: '\u5728\u7ebf\u7f51\u5173',
  environmentSelect: '\u73af\u5883\u9009\u62e9',
  detailHint: '\u53ea\u5bf9\u5f53\u524d\u9009\u4e2d\u7684\u73af\u5883\u62c9\u53d6\u76d1\u63a7\u3001\u901a\u9053\u548c\u4efb\u52a1\u660e\u7ec6\u3002',
  currentContext: '\u5f53\u524d\u4e0a\u4e0b\u6587',
  enabledModules: '\u542f\u7528\u6a21\u5757',
  summary: '\u5f53\u524d\u73af\u5883\u6458\u8981',
  host: '\u4e3b\u673a\u5730\u5740',
  workdir: '\u5e73\u53f0\u5de5\u4f5c\u76ee\u5f55',
  runtimeDriver: '\u8fd0\u884c\u65f6\u9a71\u52a8',
  validationTime: '\u6700\u8fd1\u6821\u9a8c\u65f6\u95f4',
  warningInfo: '\u544a\u8b66\u4fe1\u606f',
  none: '\u65e0',
  versionUnavailable: '\u672a\u83b7\u53d6',
  resourceOverview: '\u8d44\u6e90\u4e0e\u6a21\u5757\u6982\u89c8',
  refreshDetail: '\u5237\u65b0\u660e\u7ec6',
  runningContainers: '\u8fd0\u884c\u5bb9\u5668',
  composeProjects: 'Compose \u9879\u76ee',
  memory: '\u5185\u5b58',
  monitorTrend: '\u5b9e\u65f6\u76d1\u63a7\u8d8b\u52bf',
  channels: '\u7ba1\u7406\u901a\u9053',
  refresh: '\u5237\u65b0',
  channel: '\u901a\u9053',
  status: '\u72b6\u6001',
  permissions: '\u6743\u9650',
  tasks: '\u6700\u8fd1\u4efb\u52a1',
  all: '\u67e5\u770b\u5168\u90e8',
  taskType: '\u4efb\u52a1\u7c7b\u578b',
  taskSummary: '\u6458\u8981',
  updatedAt: '\u66f4\u65b0\u65f6\u95f4',
  serverContextTitle: '\u5f53\u524d\u670d\u52a1\u5668\u4e0a\u4e0b\u6587',
  serverContextDesc: '\u8fd9\u91cc\u4f1a\u663e\u793a\u5f53\u524d\u9009\u4e2d\u73af\u5883\u7684\u57fa\u7840\u4fe1\u606f\uff0c\u540e\u7eed\u7684\u90e8\u7f72\u3001\u7f51\u7edc\u4e0e\u8fc1\u79fb\u7b49\u9875\u9762\u90fd\u4f1a\u6cbf\u7528\u8fd9\u4e2a\u4e0a\u4e0b\u6587\u3002',
} as const;

export function ServerOverviewPage() {
  const navigate = useNavigate();
  const { refreshServers, selectedServer, servers, selectedServerId, setSelectedServerId } = useAppData();
  const [channels, setChannels] = useState<ServerChannel[]>([]);
  const [tasks, setTasks] = useState<JobSummary[]>([]);
  const [serverDetail, setServerDetail] = useState<ServerSummary | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const activeServer = serverDetail ?? selectedServer;

  const loadDetails = async () => {
    if (!selectedServer) {
      return;
    }

    setLoadingDetail(true);
    try {
      const [nextSummary, nextChannels, nextTasks] = await Promise.all([
        requestJson<ServerSummary>(`/api/servers/${encodeURIComponent(selectedServer.id)}/summary`, { source: 'server-overview' }),
        requestJson<ServerChannel[]>(`/api/servers/${encodeURIComponent(selectedServer.id)}/channels`, { source: 'server-overview' }),
        requestJson<JobSummary[]>(`/api/servers/${encodeURIComponent(selectedServer.id)}/tasks`, { source: 'server-overview' }),
      ]);
      setServerDetail(nextSummary);
      setChannels(nextChannels);
      setTasks(nextTasks);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    setServerDetail(null);
    setChannels([]);
    setTasks([]);
    void loadDetails();
  }, [selectedServer?.id]);

  const overviewStats = useMemo(
    () => ({
      total: servers.length,
      ready: servers.filter((server) => server.status === 'ready').length,
      warnings: servers.filter((server) => server.status === 'warning').length,
      activeGateways: servers.reduce((sum, server) => sum + server.gatewaySummary.active, 0),
    }),
    [servers],
  );

  if (!servers.length || !selectedServer || !activeServer) {
    return (
      <ModulePage>
        <SurfaceCard>
          <Empty description={TEXT.noServers}>
            <Button type="primary" onClick={() => navigate('/infrastructure/environments')}>
              {TEXT.goEnvironment}
            </Button>
          </Empty>
        </SurfaceCard>
      </ModulePage>
    );
  }

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void refreshServers()}>
            {TEXT.refreshList}
          </Button>
          <Button type="primary" onClick={() => navigate('/infrastructure/environments')}>
            {TEXT.manageEnvironment}
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title={TEXT.total} value={overviewStats.total} prefix={<CloudServerOutlined />} />
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title={TEXT.ready} value={overviewStats.ready} />
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title={TEXT.warning} value={overviewStats.warnings} />
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title={TEXT.activeGateway} value={overviewStats.activeGateways} />
          </SurfaceCard>
        </Col>
      </Row>

      <SurfaceCard className="mt-4" title={TEXT.environmentSelect} extra={<Typography.Text type="secondary">{TEXT.detailHint}</Typography.Text>}>
        <Row gutter={[16, 16]}>
          {servers.map((server) => {
            const isActive = server.id === selectedServerId;
            const enabledModules = Object.entries(server.capabilities.modules).filter(([, enabled]) => enabled).length;

            return (
              <Col xs={24} md={12} xl={8} key={server.id}>
                <SurfaceCard
                  hoverable
                  onClick={() => setSelectedServerId(server.id)}
                  style={{
                    border: isActive ? '1px solid #1677ff' : undefined,
                    boxShadow: isActive ? '0 0 0 3px rgba(22,119,255,0.12)' : undefined,
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <Space wrap size={[8, 8]}>
                        <Typography.Title level={5} style={{ marginBottom: 0 }}>
                          {server.displayName}
                        </Typography.Title>
                        {isActive ? <Tag color="processing">{TEXT.currentContext}</Tag> : null}
                      </Space>
                      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                        {server.host}
                      </Typography.Paragraph>
                    </div>
                    <Tag color={getStatusColor(server.status)}>{server.status}</Tag>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <SurfaceCard size="small">
                      <Statistic title={TEXT.enabledModules} value={enabledModules} />
                    </SurfaceCard>
                    <SurfaceCard size="small">
                      <Statistic title={TEXT.activeGateway} value={server.gatewaySummary.active} />
                    </SurfaceCard>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                    <span>{server.runtimeDriver}</span>
                    <span>{formatDateTime(server.lastHeartbeatAt)}</span>
                  </div>
                </SurfaceCard>
              </Col>
            );
          })}
        </Row>
      </SurfaceCard>

      <ServerContextCard title={TEXT.serverContextTitle} description={TEXT.serverContextDesc} />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={10}>
          <SurfaceCard title={TEXT.summary} extra={<Tag color={getStatusColor(activeServer.status)}>{activeServer.status}</Tag>}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label={TEXT.host}>{activeServer.host}</Descriptions.Item>
              <Descriptions.Item label={TEXT.workdir}>{activeServer.workdir}</Descriptions.Item>
              <Descriptions.Item label={TEXT.runtimeDriver}>{activeServer.runtimeDriver}</Descriptions.Item>
              <Descriptions.Item label="Docker / Compose">
                {activeServer.capabilities.dockerVersion || TEXT.versionUnavailable} / {activeServer.capabilities.composeVersion || TEXT.versionUnavailable}
              </Descriptions.Item>
              <Descriptions.Item label={TEXT.validationTime}>{formatDateTime(activeServer.lastHeartbeatAt)}</Descriptions.Item>
              <Descriptions.Item label={TEXT.warningInfo}>
                {activeServer.capabilities.warnings.length > 0 ? activeServer.capabilities.warnings.join('\uff1b') : TEXT.none}
              </Descriptions.Item>
            </Descriptions>
          </SurfaceCard>
        </Col>

        <Col xs={24} xl={14}>
          <SurfaceCard
            title={TEXT.resourceOverview}
            extra={
              <Button icon={<ReloadOutlined />} loading={loadingDetail} onClick={() => void loadDetails()}>
                {TEXT.refreshDetail}
              </Button>
            }
          >
            <Space wrap>
              {Object.entries(activeServer.capabilities.modules)
                .filter(([, enabled]) => enabled)
                .map(([module]) => (
                  <Tag key={module} color="blue">
                    {module}
                  </Tag>
                ))}
            </Space>

            <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
              <SurfaceCard size="small">
                <Statistic title={TEXT.runningContainers} value={loadingDetail ? '-' : activeServer.workloadSummary.running} />
              </SurfaceCard>
              <SurfaceCard size="small">
                <Statistic title={TEXT.composeProjects} value={loadingDetail ? '-' : activeServer.workloadSummary.composeProjects} />
              </SurfaceCard>
              <SurfaceCard size="small">
                <Statistic title="CPU" value={loadingDetail ? '-' : activeServer.metrics?.cpu ?? 0} suffix={loadingDetail ? undefined : '%'} precision={loadingDetail ? undefined : 1} />
              </SurfaceCard>
              <SurfaceCard size="small">
                <Statistic title={TEXT.memory} value={loadingDetail ? '-' : activeServer.metrics?.memoryPercent ?? 0} suffix={loadingDetail ? undefined : '%'} precision={loadingDetail ? undefined : 1} />
              </SurfaceCard>
            </div>

            {activeServer.metrics?.warning ? (
              <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
                {activeServer.metrics.warning}
              </Typography.Paragraph>
            ) : null}
          </SurfaceCard>
        </Col>
      </Row>

      <SurfaceCard className="mt-4" title={TEXT.monitorTrend}>
        <MetricTrendCard serverId={selectedServer.id} />
      </SurfaceCard>

      <Row gutter={[16, 16]} className="mt-4">
        <Col xs={24} xl={10}>
          <SurfaceCard
            title={TEXT.channels}
            extra={
              <Button icon={<ReloadOutlined />} loading={loadingDetail} onClick={() => void loadDetails()}>
                {TEXT.refresh}
              </Button>
            }
          >
            <Table
              rowKey="id"
              pagination={false}
              dataSource={channels}
              loading={loadingDetail}
              columns={[
                {
                  title: TEXT.channel,
                  dataIndex: 'label',
                  render: (value, record) => (
                    <Space direction="vertical" size={0}>
                      <Typography.Text strong>{value}</Typography.Text>
                      <Typography.Text type="secondary">{record.detail}</Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: TEXT.status,
                  dataIndex: 'status',
                  render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag>,
                },
                {
                  title: TEXT.permissions,
                  render: (_, record) => record.permissions.join(' / ') || '-',
                },
              ]}
            />
          </SurfaceCard>
        </Col>

        <Col xs={24} xl={14}>
          <SurfaceCard
            title={TEXT.tasks}
            extra={
              <Button type="link" onClick={() => navigate('/operations/jobs')}>
                {TEXT.all}
              </Button>
            }
          >
            <Table
              rowKey="id"
              pagination={false}
              dataSource={tasks.slice(0, 8)}
              loading={loadingDetail}
              columns={[
                { title: TEXT.taskType, dataIndex: 'kind' },
                {
                  title: TEXT.taskSummary,
                  render: (_, record) => summarizeMetadata(record.metadata),
                },
                {
                  title: TEXT.status,
                  dataIndex: 'status',
                  render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag>,
                },
                {
                  title: TEXT.updatedAt,
                  dataIndex: 'updatedAt',
                  render: (value) => formatDateTime(value),
                },
              ]}
            />
          </SurfaceCard>
        </Col>
      </Row>
    </ModulePage>
  );
}
