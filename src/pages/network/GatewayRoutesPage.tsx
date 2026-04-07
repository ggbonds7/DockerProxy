import { DeleteOutlined, PlusOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { Button, Col, Descriptions, Drawer, Form, Input, Popconfirm, Row, Select, Space, Statistic, Switch, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { ServerContextCard } from '../../components/common/ServerContextCard';
import { SurfaceCard } from '../../components/common/SurfaceCard';
import { useAppData } from '../../contexts/AppDataContext';
import { formatDateTime, getStatusColor } from '../../lib/format';
import { notifySuccess, requestJson } from '../../lib/api';
import type { GatewaySummary, GatewaySyncResult, ProxyRoute } from '../../types';

type RouteFormValues = {
  gatewayId: string;
  domain: string;
  target: string;
  ssl: boolean;
};

function getRouteSourceTag(route: ProxyRoute) {
  if (route.source === 'nginx-import') {
    return <Tag color="gold">导入自 Nginx</Tag>;
  }
  return <Tag color="blue">平台托管</Tag>;
}

export function GatewayRoutesPage() {
  const { selectedServer } = useAppData();
  const [form] = Form.useForm<RouteFormValues>();
  const [gateways, setGateways] = useState<GatewaySummary[]>([]);
  const [routes, setRoutes] = useState<ProxyRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [gatewayId, setGatewayId] = useState('');
  const [syncResult, setSyncResult] = useState<GatewaySyncResult | null>(null);

  const loadData = async () => {
    if (!selectedServer) return;
    setLoading(true);
    try {
      const [nextGateways, nextRoutes] = await Promise.all([
        requestJson<GatewaySummary[]>(`/api/gateways?serverId=${encodeURIComponent(selectedServer.id)}`, { source: 'gateway-routes' }),
        requestJson<ProxyRoute[]>(`/api/proxy/routes?serverId=${encodeURIComponent(selectedServer.id)}`, { source: 'gateway-routes' }),
      ]);
      setGateways(nextGateways);
      setRoutes(nextRoutes);
      setGatewayId((current) => (nextGateways.some((gateway) => gateway.id === current) ? current : nextGateways[0]?.id || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedServer?.id]);

  const activeGateway = useMemo(
    () => gateways.find((gateway) => gateway.id === gatewayId) || null,
    [gatewayId, gateways],
  );

  const activeRoutes = useMemo(
    () => (gatewayId ? routes.filter((route) => route.gatewayId === gatewayId) : routes),
    [gatewayId, routes],
  );

  const manageableGateways = useMemo(
    () => gateways.filter((gateway) => gateway.capabilities.routeManagement),
    [gateways],
  );

  const stats = useMemo(
    () => ({
      gateways: gateways.length,
      manageable: manageableGateways.length,
      routes: routes.length,
      imported: routes.filter((route) => route.source === 'nginx-import').length,
    }),
    [gateways.length, manageableGateways.length, routes],
  );

  const handleOpenCreate = () => {
    form.setFieldsValue({
      gatewayId: gatewayId || manageableGateways[0]?.id,
      domain: '',
      target: '127.0.0.1:8000',
      ssl: true,
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!selectedServer) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      await requestJson('/api/proxy/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, serverId: selectedServer.id }),
        source: 'gateway-routes',
      });
      notifySuccess('路由已保存并写入网关配置。', 'gateway-routes');
      setDrawerOpen(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (routeId: string) => {
    await requestJson(`/api/proxy/routes/${routeId}`, {
      method: 'DELETE',
      source: 'gateway-routes',
    });
    notifySuccess('路由已删除。', 'gateway-routes');
    await loadData();
  };

  const handleSync = async () => {
    if (!gatewayId) return;
    setSyncing(true);
    try {
      const result = await requestJson<GatewaySyncResult>(`/api/gateways/${encodeURIComponent(gatewayId)}/sync-nginx`, {
        method: 'POST',
        source: 'gateway-routes',
      });
      setSyncResult(result);
      notifySuccess(`已导入 ${result.imported.length} 条，更新 ${result.updated.length} 条 Nginx 路由。`, 'gateway-routes');
      await loadData();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>
            刷新网关
          </Button>
          <Button icon={<SyncOutlined />} onClick={() => void handleSync()} loading={syncing} disabled={!activeGateway}>
            从 Nginx 初始化
          </Button>
          <Button type="primary" icon={<PlusOutlined />} disabled={!manageableGateways.length} onClick={handleOpenCreate}>
            新增路由
          </Button>
        </Space>
      }
    >
      <ServerContextCard title="网关上下文" description="数据库是路由的权威来源，Nginx 配置是运行产物。首次接入时可从目标机现有 Nginx 配置导入简单路由。" />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="网关总数" value={stats.gateways} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="可管理网关" value={stats.manageable} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="路由总数" value={stats.routes} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="导入路由" value={stats.imported} /></SurfaceCard></Col>
      </Row>

      <SurfaceCard className="mt-4" title="网关概览">
        <Row gutter={[16, 16]}>
          {gateways.map((gateway) => (
            <Col xs={24} md={12} xl={8} key={gateway.id}>
              <SurfaceCard hoverable onClick={() => setGatewayId(gateway.id)} className={gateway.id === gatewayId ? 'border border-blue-500' : undefined}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>{gateway.displayName}</Typography.Title>
                    <Typography.Text type="secondary">{gateway.kind}</Typography.Text>
                  </div>
                  <Tag color={getStatusColor(gateway.status)}>{gateway.status}</Tag>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <SurfaceCard size="small"><Statistic title="路由数" value={gateway.routeCount} /></SurfaceCard>
                  <SurfaceCard size="small"><Statistic title="证书数" value={gateway.certificateCount} /></SurfaceCard>
                </div>
              </SurfaceCard>
            </Col>
          ))}
        </Row>
      </SurfaceCard>

      <SurfaceCard
        className="mt-4"
        title="路由列表"
        extra={
          <Select
            value={gatewayId || undefined}
            style={{ minWidth: 220 }}
            options={gateways.map((gateway) => ({ value: gateway.id, label: gateway.displayName }))}
            onChange={setGatewayId}
          />
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          dataSource={activeRoutes}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '域名', dataIndex: 'domain' },
            { title: '目标地址', dataIndex: 'target' },
            {
              title: '协议',
              width: 120,
              render: (_: unknown, record: ProxyRoute) => <Tag color={record.ssl ? 'blue' : 'default'}>{record.ssl ? 'HTTPS' : 'HTTP'}</Tag>,
            },
            {
              title: '来源',
              width: 150,
              render: (_: unknown, record: ProxyRoute) => getRouteSourceTag(record),
            },
            {
              title: '同步时间',
              width: 180,
              render: (_: unknown, record: ProxyRoute) => formatDateTime(record.lastSyncedAt || null),
            },
            {
              title: '操作',
              width: 120,
              render: (_: unknown, record: ProxyRoute) => (
                <Popconfirm
                  title="删除路由"
                  description="删除后会同步移除 Nginx 配置。"
                  okText="确认删除"
                  cancelText="取消"
                  onConfirm={() => handleDelete(record.id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </SurfaceCard>

      {syncResult ? (
        <SurfaceCard className="mt-4" title="最近一次 Nginx 初始化结果">
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="导入结果">
              已导入 {syncResult.imported.length} 条，已更新 {syncResult.updated.length} 条，跳过 {syncResult.skipped.length} 条，未托管 {syncResult.unmanaged.length} 条。
            </Descriptions.Item>
            {syncResult.warnings.length ? (
              <Descriptions.Item label="警告">{syncResult.warnings.join(' / ')}</Descriptions.Item>
            ) : null}
          </Descriptions>

          {syncResult.unmanaged.length ? (
            <Table
              className="mt-4"
              rowKey={(record) => `${record.confPath}:${record.reason}`}
              pagination={false}
              dataSource={syncResult.unmanaged}
              columns={[
                { title: '配置文件', dataIndex: 'confPath' },
                { title: '域名', dataIndex: 'domain', render: (value: string | undefined) => value || '-' },
                { title: '目标地址', dataIndex: 'target', render: (value: string | undefined) => value || '-' },
                { title: '原因', dataIndex: 'reason' },
              ]}
            />
          ) : null}
        </SurfaceCard>
      ) : null}

      <Drawer
        title="新增反向代理路由"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        extra={<Button type="primary" loading={saving} onClick={() => void handleSave()}>保存路由</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="目标网关" name="gatewayId" rules={[{ required: true, message: '请选择网关' }]}>
            <Select options={manageableGateways.map((gateway) => ({ value: gateway.id, label: gateway.displayName }))} />
          </Form.Item>
          <Form.Item label="域名" name="domain" rules={[{ required: true, message: '请输入域名' }]}>
            <Input placeholder="app.example.com" />
          </Form.Item>
          <Form.Item label="目标地址" name="target" rules={[{ required: true, message: '请输入目标地址' }]}>
            <Input placeholder="127.0.0.1:8000" />
          </Form.Item>
          <Form.Item label="启用 TLS" name="ssl" valuePropName="checked">
            <Switch checkedChildren="HTTPS" unCheckedChildren="HTTP" />
          </Form.Item>
        </Form>
      </Drawer>
    </ModulePage>
  );
}
