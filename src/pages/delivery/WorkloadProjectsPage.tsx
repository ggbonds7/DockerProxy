import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import {
  AppstoreOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Button,
  Col,
  Drawer,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  theme as antdTheme,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { ServerContextCard } from '../../components/common/ServerContextCard';
import { useAppData } from '../../contexts/AppDataContext';
import { notifySuccess, requestJson } from '../../lib/api';
import { formatDateTime, getStatusColor } from '../../lib/format';
import type { ContainerInfo, ContainerLogEntry } from '../../types';

function filterContainers(containers: ContainerInfo[], search: string, status: string) {
  return containers.filter((container) => {
    const matchesStatus =
      status === 'all' || (status === 'running' ? container.state === 'running' : container.state !== 'running');
    if (!matchesStatus) return false;

    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;

    return [container.name, container.image, container.composeProject, container.composeService, container.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(keyword);
  });
}

function summarizeProject(group: { project: string; items: ContainerInfo[] }) {
  const services = Array.from(new Set(group.items.map((item) => item.composeService || item.name)));
  const images = new Set(group.items.map((item) => item.image));
  const ports = Array.from(new Set(group.items.flatMap((item) => item.ports)));
  const running = group.items.filter((item) => item.state === 'running').length;

  return {
    running,
    services,
    imageCount: images.size,
    ports,
    health: running === group.items.length ? 'success' : running === 0 ? 'default' : 'warning',
    healthLabel: running === group.items.length ? '全部运行中' : running === 0 ? '未运行' : '部分运行中',
  };
}

type ContainerCardProps = {
  container: ContainerInfo;
  onAction: (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => Promise<void>;
  onOpenLogs: (container: ContainerInfo) => Promise<void>;
};

function ContainerRuntimeCard({ container, onAction, onOpenLogs }: ContainerCardProps) {
  const { token } = antdTheme.useToken();

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: token.boxShadowSecondary,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Typography.Text strong className="block text-[15px]">
            {container.composeService || container.name}
          </Typography.Text>
          <Typography.Text type="secondary" className="block truncate">
            {container.name}
          </Typography.Text>
        </div>
        <Tag color={getStatusColor(container.state)}>{container.state === 'running' ? '运行中' : container.state}</Tag>
      </div>

      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginTop: 12, marginBottom: 12 }}>
        {container.image}
      </Typography.Paragraph>

      <Space wrap size={[8, 8]}>
        {(container.ports.length ? container.ports : ['无端口映射']).map((port) => (
          <Tag key={port}>{port}</Tag>
        ))}
        {container.composeProject ? <Tag color="blue">Compose</Tag> : <Tag>独立容器</Tag>}
      </Space>

      <Space wrap className="mt-4">
        <Button size="small" onClick={() => void onOpenLogs(container)}>
          日志
        </Button>
        {container.state === 'running' ? (
          <Button size="small" icon={<StopOutlined />} onClick={() => void onAction(container.id, 'stop')}>
            停止
          </Button>
        ) : (
          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => void onAction(container.id, 'start')}>
            启动
          </Button>
        )}
        <Button size="small" onClick={() => void onAction(container.id, 'restart')}>
          重启
        </Button>
        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void onAction(container.id, 'remove')}>
          删除
        </Button>
      </Space>
    </div>
  );
}

export function WorkloadProjectsPage() {
  const { selectedServer } = useAppData();
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [logEntries, setLogEntries] = useState<ContainerLogEntry[]>([]);
  const [logTitle, setLogTitle] = useState('');

  const loadContainers = async () => {
    if (!selectedServer) return;
    setLoading(true);
    try {
      const data = await requestJson<ContainerInfo[]>(`/api/workloads/containers?serverId=${encodeURIComponent(selectedServer.id)}`, {
        source: '容器与项目',
      });
      setContainers(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContainers();
  }, [selectedServer?.id]);

  const filteredContainers = useMemo(() => filterContainers(containers, search, statusFilter), [containers, search, statusFilter]);
  const composeGroups = useMemo(() => {
    const groups = new Map<string, ContainerInfo[]>();
    filteredContainers.forEach((container) => {
      if (container.sourceKind === 'compose-project' && container.composeProject) {
        const current = groups.get(container.composeProject) || [];
        current.push(container);
        groups.set(container.composeProject, current);
      }
    });
    return Array.from(groups.entries()).map(([project, items]) => ({ project, items }));
  }, [filteredContainers]);
  const standaloneContainers = useMemo(
    () => filteredContainers.filter((container) => container.sourceKind !== 'compose-project' || !container.composeProject),
    [filteredContainers],
  );

  const stats = useMemo(
    () => ({
      total: containers.length,
      running: containers.filter((container) => container.state === 'running').length,
      compose: new Set(containers.filter((container) => container.composeProject).map((container) => container.composeProject)).size,
      standalone: containers.filter((container) => !container.composeProject).length,
    }),
    [containers],
  );

  const handleAction = async (containerId: string, action: 'start' | 'stop' | 'restart' | 'remove') => {
    if (!selectedServer) return;
    await requestJson(`/api/workloads/containers/${containerId}/${action}?serverId=${encodeURIComponent(selectedServer.id)}`, {
      method: 'POST',
      source: '容器与项目',
    });
    notifySuccess('容器操作已提交', '容器与项目');
    await loadContainers();
  };

  const handleOpenLogs = async (container: ContainerInfo) => {
    if (!selectedServer) return;
    const data = await requestJson<ContainerLogEntry[]>(
      `/api/workloads/containers/${container.id}/logs?serverId=${encodeURIComponent(selectedServer.id)}&structured=true`,
      { source: '容器日志' },
    );
    setLogEntries(data);
    setLogTitle(container.name);
    setLogDrawerOpen(true);
  };

  return (
    <ModulePage
      extra={
        <Button icon={<ReloadOutlined />} onClick={() => void loadContainers()} loading={loading}>
          刷新容器
        </Button>
      }
    >
      <ServerContextCard title="工作负载上下文" description="按当前选中的服务器查看 Compose 项目、独立容器和运行状态。" />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="容器总数" value={stats.total} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="运行中容器" value={stats.running} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="Compose 项目" value={stats.compose} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="独立容器" value={stats.standalone} /></SurfaceCard></Col>
      </Row>

      <SurfaceCard className="mt-4" title="筛选与搜索">
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={16}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="按容器名、镜像、项目名或状态搜索"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Col>
          <Col xs={24} xl={8}>
            <Select
              className="w-full"
              value={statusFilter}
              onChange={(value) => setStatusFilter(value)}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '运行中', value: 'running' },
                { label: '已停止', value: 'stopped' },
              ]}
            />
          </Col>
        </Row>
      </SurfaceCard>

      <SurfaceCard className="mt-4" title="Compose 项目">
        {composeGroups.length === 0 ? (
          <Empty description="当前筛选条件下没有 Compose 项目" />
        ) : (
          <div className="space-y-4">
            {composeGroups.map((group) => {
              const summary = summarizeProject(group);
              return (
                <SurfaceCard key={group.project} type="inner">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <Space wrap size={[8, 8]}>
                        <Typography.Title level={4} style={{ margin: 0 }}>
                          {group.project}
                        </Typography.Title>
                        <Tag color={summary.health}>{summary.running}/{group.items.length} 运行中</Tag>
                        <Tag>{summary.services.length} 个服务</Tag>
                        <Tag>{summary.imageCount} 个镜像</Tag>
                        <Tag color="processing">{summary.healthLabel}</Tag>
                      </Space>
                      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 12 }}>
                        {summary.ports.length
                          ? `暴露端口：${summary.ports.join('、')}`
                          : '当前项目没有对外暴露端口'}
                      </Typography.Paragraph>
                      <Space wrap size={[8, 8]}>
                        {summary.services.map((service) => (
                          <Tag key={service} icon={<AppstoreOutlined />}>
                            {service}
                          </Tag>
                        ))}
                      </Space>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    {group.items.map((container) => (
                      <div key={container.id}>
                        <ContainerRuntimeCard
                          container={container}
                          onAction={handleAction}
                          onOpenLogs={handleOpenLogs}
                        />
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard className="mt-4" title="独立容器">
        {standaloneContainers.length === 0 ? (
          <Empty description="当前筛选条件下没有独立容器" />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {standaloneContainers.map((container) => (
              <div key={container.id}>
                <ContainerRuntimeCard
                  container={container}
                  onAction={handleAction}
                  onOpenLogs={handleOpenLogs}
                />
              </div>
            ))}
          </div>
        )}
      </SurfaceCard>

      <Drawer title={`${logTitle} 日志`} open={logDrawerOpen} onClose={() => setLogDrawerOpen(false)} width={760}>
        <Table
          rowKey={(record, index) => `${record.timestamp || 'na'}-${index}`}
          pagination={false}
          dataSource={logEntries}
          columns={[
            {
              title: '时间',
              dataIndex: 'timestamp',
              render: (value) => formatDateTime(value),
              width: 180,
            },
            {
              title: '流',
              dataIndex: 'stream',
              render: (value) => <Tag>{value}</Tag>,
              width: 100,
            },
            {
              title: '内容',
              dataIndex: 'message',
              render: (value) => <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{value}</Typography.Text>,
            },
          ]}
        />
      </Drawer>
    </ModulePage>
  );
}
