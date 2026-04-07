import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import {
  CheckCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { notifySuccess, requestJson } from '../../lib/api';
import { formatDateTime, getStatusColor } from '../../lib/format';
import type { DNSProviderCatalogItem, DNSProviderConnection, DNSZoneSummary } from '../../types';

type CreateConnectionFormValues = {
  provider: 'cloudflare' | 'gcore';
  displayName: string;
  apiToken?: string;
  apiKey?: string;
  defaultTtl?: number | null;
  defaultProxied?: boolean;
};

type SettingsFormValues = {
  displayName: string;
  managedZones: string[];
  defaultTtl?: number | null;
  defaultProxied?: boolean;
};

export function DnsConnectionsPage() {
  const [createForm] = Form.useForm<CreateConnectionFormValues>();
  const [settingsForm] = Form.useForm<SettingsFormValues>();
  const [catalog, setCatalog] = useState<DNSProviderCatalogItem[]>([]);
  const [connections, setConnections] = useState<DNSProviderConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState('');
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [settingsDrawerOpen, setSettingsDrawerOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<DNSProviderConnection | null>(null);
  const [availableZones, setAvailableZones] = useState<DNSZoneSummary[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);

  const watchedProvider = Form.useWatch('provider', createForm) ?? 'cloudflare';
  const selectedProvider = useMemo(
    () => catalog.find((item) => item.key === watchedProvider) || null,
    [catalog, watchedProvider],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const [nextCatalog, nextConnections] = await Promise.all([
        requestJson<DNSProviderCatalogItem[]>('/api/provider-connections/catalog', { source: 'DNS 平台接入' }),
        requestJson<DNSProviderConnection[]>('/api/provider-connections', { source: 'DNS 平台接入' }),
      ]);
      setCatalog(nextCatalog);
      setConnections(nextConnections);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const stats = useMemo(
    () => ({
      total: connections.length,
      ready: connections.filter((item) => item.status === 'ready').length,
      scoped: connections.filter((item) => item.settings.managedZones.length > 0).length,
      proxyCapable: catalog.filter((item) => item.supportsProxyStatus).length,
    }),
    [catalog, connections],
  );

  const handleOpenCreate = (provider?: DNSProviderCatalogItem['key']) => {
    createForm.resetFields();
    createForm.setFieldsValue({
      provider: provider || 'cloudflare',
      displayName: '',
      defaultTtl: undefined,
      defaultProxied: false,
    });
    setCreateDrawerOpen(true);
  };

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    const provider = catalog.find((item) => item.key === values.provider);
    if (!provider) return;

    const payload: Record<string, unknown> = {
      provider: values.provider,
      displayName: values.displayName,
      defaultTtl: values.defaultTtl ?? null,
      defaultProxied: values.provider === 'cloudflare' ? Boolean(values.defaultProxied) : null,
    };

    provider.authFields.forEach((field) => {
      payload[field.key] = values[field.key];
    });

    setSaving(true);
    try {
      await requestJson('/api/provider-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        source: 'DNS 平台接入',
      });
      notifySuccess('平台接入已创建并完成验证', 'DNS 平台接入');
      setCreateDrawerOpen(false);
      createForm.resetFields();
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const loadZones = async (connectionId: string) => {
    setLoadingZones(true);
    try {
      const zones = await requestJson<DNSZoneSummary[]>(`/api/provider-connections/${connectionId}/zones?scope=all`, {
        source: 'DNS 平台接入',
      });
      setAvailableZones(zones);
      return zones;
    } finally {
      setLoadingZones(false);
    }
  };

  const handleOpenSettings = async (connection: DNSProviderConnection) => {
    setEditingConnection(connection);
    settingsForm.setFieldsValue({
      displayName: connection.displayName,
      managedZones: connection.settings.managedZones,
      defaultTtl: connection.settings.defaultTtl ?? undefined,
      defaultProxied: Boolean(connection.settings.defaultProxied),
    });
    setSettingsDrawerOpen(true);
    await loadZones(connection.id);
  };

  const handleSaveSettings = async () => {
    if (!editingConnection) return;
    const values = await settingsForm.validateFields();
    setSaving(true);
    try {
      await requestJson(`/api/provider-connections/${editingConnection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: values.displayName,
          managedZones: values.managedZones || [],
          defaultTtl: values.defaultTtl ?? null,
          defaultProxied: editingConnection.provider === 'cloudflare' ? Boolean(values.defaultProxied) : null,
        }),
        source: 'DNS 平台接入',
      });
      notifySuccess('平台接入设置已更新', 'DNS 平台接入');
      setSettingsDrawerOpen(false);
      setEditingConnection(null);
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (connectionId: string) => {
    setVerifyingId(connectionId);
    try {
      await requestJson(`/api/provider-connections/${connectionId}/verify`, {
        method: 'POST',
        source: 'DNS 平台接入',
      });
      notifySuccess('平台接入验证完成', 'DNS 平台接入');
      await loadData();
    } finally {
      setVerifyingId('');
    }
  };

  const connectionColumns = [
    {
      title: '平台',
      render: (_: unknown, record: DNSProviderConnection) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.displayName}</Typography.Text>
          <Typography.Text type="secondary">{record.provider}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: string, record: DNSProviderConnection) => (
        <Space direction="vertical" size={4}>
          <Tag color={getStatusColor(value)}>{value}</Tag>
          {record.lastError ? <Typography.Text type="danger">{record.lastError}</Typography.Text> : null}
        </Space>
      ),
    },
    {
      title: '管理范围',
      render: (_: unknown, record: DNSProviderConnection) =>
        record.settings.managedZones.length ? (
          <Space wrap>
            {record.settings.managedZones.slice(0, 3).map((zone) => (
              <Tag key={zone}>{zone}</Tag>
            ))}
            {record.settings.managedZones.length > 3 ? <Tag>+{record.settings.managedZones.length - 3}</Tag> : null}
          </Space>
        ) : (
          <Typography.Text type="secondary">使用当前 Token 授权的全部 Zone</Typography.Text>
        ),
    },
    {
      title: '已授权 Zone',
      render: (_: unknown, record: DNSProviderConnection) => record.zoneCount ?? '-',
    },
    {
      title: '默认策略',
      render: (_: unknown, record: DNSProviderConnection) => (
        <Space wrap>
          <Tag>TTL: {record.settings.defaultTtl ?? '手动填写'}</Tag>
          {record.capabilities.supportsProxyStatus ? (
            <Tag color={record.settings.defaultProxied ? 'blue' : 'default'}>
              {record.settings.defaultProxied ? '默认开启代理' : '默认 DNS Only'}
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: '最后验证',
      dataIndex: 'lastVerifiedAt',
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '操作',
      render: (_: unknown, record: DNSProviderConnection) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => void handleOpenSettings(record)}>
            管理设置
          </Button>
          <Button loading={verifyingId === record.id} onClick={() => void handleVerify(record.id)}>
            验证连接
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>
            刷新接入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleOpenCreate()}>
            新增平台接入
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="接入总数" value={stats.total} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="可用接入" value={stats.ready} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="已配置范围" value={stats.scoped} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="支持代理状态的平台" value={stats.proxyCapable} prefix={<SafetyCertificateOutlined />} /></SurfaceCard></Col>
      </Row>

      <SurfaceCard className="mt-4" title="平台目录">
        <Row gutter={[16, 16]}>
          {catalog.map((provider) => (
            <Col key={provider.key} xs={24} md={12}>
              <SurfaceCard
                type="inner"
                title={provider.name}
                extra={
                  <Button type="link" onClick={() => handleOpenCreate(provider.key)}>
                    接入 {provider.name}
                  </Button>
                }
              >
                <Space direction="vertical" size={12} className="w-full">
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    {provider.description}
                  </Typography.Paragraph>
                  <Space wrap>
                    {provider.authFields.map((field) => (
                      <Tag key={field.key}>{field.label}</Tag>
                    ))}
                    {provider.supportsProxyStatus ? <Tag color="blue">支持代理状态</Tag> : <Tag>仅 DNS 模式</Tag>}
                  </Space>
                </Space>
              </SurfaceCard>
            </Col>
          ))}
        </Row>
      </SurfaceCard>

      <SurfaceCard className="mt-4" title="已接入平台">
        <Table rowKey="id" loading={loading} dataSource={connections} columns={connectionColumns} pagination={false} />
      </SurfaceCard>

      <Drawer
        title="新增 DNS 平台接入"
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        width={520}
        destroyOnClose
        extra={<Button type="primary" loading={saving} onClick={() => void handleCreate()}>保存接入</Button>}
      >
        <Form form={createForm} layout="vertical" initialValues={{ provider: 'cloudflare', defaultProxied: false }}>
          <Form.Item label="平台类型" name="provider" rules={[{ required: true, message: '请选择平台类型' }]}>
            <Select options={catalog.map((item) => ({ label: item.name, value: item.key }))} />
          </Form.Item>
          <Form.Item label="接入名称" name="displayName" rules={[{ required: true, message: '请输入接入名称' }]}>
            <Input placeholder="例如：生产 Cloudflare" />
          </Form.Item>
          {selectedProvider?.authFields.map((field) => (
            <div key={field.key}>
              <Form.Item
                label={field.label}
                name={field.key}
                rules={[{ required: true, message: `请输入${field.label}` }]}
              >
                <Input.Password placeholder={field.placeholder} />
              </Form.Item>
            </div>
          ))}
          <Form.Item label="默认 TTL" name="defaultTtl" extra="创建记录时的默认 TTL，可留空表示每次手动填写。">
            <InputNumber min={1} className="w-full" placeholder="例如：300" />
          </Form.Item>
          {selectedProvider?.supportsProxyStatus ? (
            <Form.Item label="默认代理状态" name="defaultProxied">
              <Select
                options={[
                  { label: '默认 DNS Only', value: false },
                  { label: '默认开启代理', value: true },
                ]}
              />
            </Form.Item>
          ) : null}
          {selectedProvider ? (
            <Alert
              type="info"
              showIcon
              message={selectedProvider.name}
              description="管理范围（Zone 白名单）在接入成功后可在“管理设置”中配置。"
            />
          ) : null}
        </Form>
      </Drawer>

      <Drawer
        title={editingConnection ? `管理设置 · ${editingConnection.displayName}` : '管理设置'}
        open={settingsDrawerOpen}
        onClose={() => {
          setSettingsDrawerOpen(false);
          setEditingConnection(null);
          setAvailableZones([]);
        }}
        width={560}
        destroyOnClose
        extra={<Button type="primary" loading={saving} onClick={() => void handleSaveSettings()}>保存设置</Button>}
      >
        {editingConnection ? (
          <Form form={settingsForm} layout="vertical">
            <Form.Item label="接入名称" name="displayName" rules={[{ required: true, message: '请输入接入名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item label="管理范围" name="managedZones" extra="为空时表示允许访问当前 Token 授权的全部 Zone。">
              <Select
                mode="multiple"
                allowClear
                placeholder={loadingZones ? '正在加载 Zone...' : '选择允许管理的 Zone'}
                options={availableZones.map((zone) => ({ label: zone.name, value: zone.name }))}
                notFoundContent={loadingZones ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可选 Zone" />}
              />
            </Form.Item>
            <Form.Item label="默认 TTL" name="defaultTtl">
              <InputNumber min={1} className="w-full" placeholder="留空表示每次手动填写" />
            </Form.Item>
            {editingConnection.capabilities.supportsProxyStatus ? (
              <Form.Item label="默认代理状态" name="defaultProxied">
                <Select
                  options={[
                    { label: '默认 DNS Only', value: false },
                    { label: '默认开启代理', value: true },
                  ]}
                />
              </Form.Item>
            ) : null}
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="管理范围会直接影响 DNS 记录页可见的 Zone 列表"
              description="建议只保留当前业务真正需要的 Zone，避免把系统运行能力散落到全 Token 范围。"
            />
          </Form>
        ) : null}
      </Drawer>
    </ModulePage>
  );
}
