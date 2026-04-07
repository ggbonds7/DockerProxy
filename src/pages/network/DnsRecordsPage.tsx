import { App as AntdApp, Button, Descriptions, Drawer, Empty, Form, Input, InputNumber, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { SurfaceCard } from '../../components/common/SurfaceCard';
import { notifySuccess, requestJson } from '../../lib/api';
import { getStatusColor } from '../../lib/format';
import type { DNSProviderConnection, DNSProviderRecord, DNSZoneSummary } from '../../types';

type RecordFormValues = {
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
};

type RecordTypeFilter = 'all' | 'A' | 'AAAA' | 'CNAME' | 'other';

const PRIMARY_RECORD_TYPES = new Set(['A', 'AAAA', 'CNAME']);

function matchesRecordTypeFilter(type: string, filter: RecordTypeFilter) {
  if (filter === 'all') return true;
  if (filter === 'other') return !PRIMARY_RECORD_TYPES.has(type);
  return type === filter;
}

export function DnsRecordsPage() {
  const { modal } = AntdApp.useApp();
  const [form] = Form.useForm<RecordFormValues>();
  const [connections, setConnections] = useState<DNSProviderConnection[]>([]);
  const [zones, setZones] = useState<DNSZoneSummary[]>([]);
  const [records, setRecords] = useState<DNSProviderRecord[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSProviderRecord | null>(null);
  const [search, setSearch] = useState('');
  const [recordTypeFilter, setRecordTypeFilter] = useState<RecordTypeFilter>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [zonesOwnerId, setZonesOwnerId] = useState('');
  const zoneRequestRef = useRef(0);
  const recordRequestRef = useRef(0);

  const readyConnections = useMemo(
    () => connections.filter((connection) => connection.status === 'ready'),
    [connections],
  );

  const currentConnection = useMemo(
    () => readyConnections.find((connection) => connection.id === connectionId) || null,
    [connectionId, readyConnections],
  );

  const deletingIdSet = useMemo(() => new Set(deletingIds), [deletingIds]);

  const loadConnections = async () => {
    const data = await requestJson<DNSProviderConnection[]>('/api/provider-connections', { source: 'dns-records' });
    setConnections(data);
  };

  const loadZones = async (nextConnectionId: string) => {
    const requestId = ++zoneRequestRef.current;
    const data = await requestJson<DNSZoneSummary[]>(`/api/provider-connections/${nextConnectionId}/zones`, { source: 'dns-records' });
    if (requestId !== zoneRequestRef.current) return;
    setZonesOwnerId(nextConnectionId);
    setZones(data);
    setZoneName((current) => (data.some((zone) => zone.name === current) ? current : data[0]?.name || ''));
  };

  const loadRecords = async (nextConnectionId: string, nextZoneName: string) => {
    if (!nextConnectionId || !nextZoneName) {
      setRecords([]);
      return;
    }

    const requestId = ++recordRequestRef.current;
    setLoading(true);
    try {
      const data = await requestJson<DNSProviderRecord[]>(
        `/api/provider-connections/${nextConnectionId}/records?zone=${encodeURIComponent(nextZoneName)}`,
        { source: 'dns-records' },
      );
      if (requestId === recordRequestRef.current) {
        setRecords(data);
      }
    } finally {
      if (requestId === recordRequestRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (readyConnections.some((connection) => connection.id === connectionId)) {
      return;
    }
    setConnectionId(readyConnections[0]?.id || '');
  }, [connectionId, readyConnections]);

  useEffect(() => {
    if (!connectionId) {
      setZonesOwnerId('');
      setZones([]);
      setZoneName('');
      setRecords([]);
      return;
    }
    zoneRequestRef.current += 1;
    recordRequestRef.current += 1;
    setZonesOwnerId('');
    setZones([]);
    setZoneName('');
    setRecords([]);
    void loadZones(connectionId);
  }, [connectionId]);

  useEffect(() => {
    if (connectionId && zonesOwnerId === connectionId && zoneName && zones.some((zone) => zone.name === zoneName)) {
      void loadRecords(connectionId, zoneName);
      return;
    }
    setRecords([]);
  }, [connectionId, zoneName, zones, zonesOwnerId]);

  const handleChangeConnection = (nextConnectionId: string) => {
    zoneRequestRef.current += 1;
    recordRequestRef.current += 1;
    setZonesOwnerId('');
    setZones([]);
    setZoneName('');
    setRecords([]);
    setConnectionId(nextConnectionId);
  };

  useEffect(() => {
    setSelectedRowKeys([]);
    setCurrentPage(1);
  }, [connectionId, zoneName]);

  useEffect(() => {
    setCurrentPage(1);
  }, [recordTypeFilter, search]);

  const typeCounts = useMemo(() => {
    const counts = { A: 0, AAAA: 0, CNAME: 0, other: 0 };
    records.forEach((record) => {
      if (record.type === 'A') counts.A += 1;
      else if (record.type === 'AAAA') counts.AAAA += 1;
      else if (record.type === 'CNAME') counts.CNAME += 1;
      else counts.other += 1;
    });
    return counts;
  }, [records]);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return records.filter((record) => {
      if (!matchesRecordTypeFilter(record.type, recordTypeFilter)) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [record.name, record.type, record.content, record.fqdn].join(' ').toLowerCase().includes(keyword);
    });
  }, [recordTypeFilter, records, search]);

  useEffect(() => {
    setSelectedRowKeys((current) => current.filter((key) => filteredRecords.some((record) => record.id === key)));
  }, [filteredRecords]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, filteredRecords.length, pageSize]);

  const selectedDeletableRecords = useMemo(
    () => filteredRecords.filter((record) => selectedRowKeys.includes(record.id) && (record.deletable ?? record.editable)),
    [filteredRecords, selectedRowKeys],
  );

  const typeFilterOptions = useMemo(
    () => [
      { label: `全部类型 (${records.length})`, value: 'all' },
      { label: `A (${typeCounts.A})`, value: 'A' },
      { label: `AAAA (${typeCounts.AAAA})`, value: 'AAAA' },
      { label: `CNAME (${typeCounts.CNAME})`, value: 'CNAME' },
      { label: `其他 (${typeCounts.other})`, value: 'other' },
    ],
    [records.length, typeCounts.A, typeCounts.AAAA, typeCounts.CNAME, typeCounts.other],
  );

  const handleOpenCreate = () => {
    if (!currentConnection) return;
    setEditingRecord(null);
    form.setFieldsValue({
      type: currentConnection.capabilities.recordTypes[0] || 'A',
      name: '',
      content: '',
      ttl: currentConnection.settings.defaultTtl ?? 300,
      proxied: Boolean(currentConnection.settings.defaultProxied),
    });
    setDrawerOpen(true);
  };

  const handleOpenEdit = (record: DNSProviderRecord) => {
    setEditingRecord(record);
    form.setFieldsValue({
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      proxied: Boolean(record.proxied ?? currentConnection?.settings.defaultProxied),
    });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    if (!connectionId || !zoneName) return;

    const url = editingRecord
      ? `/api/provider-connections/${connectionId}/records/${encodeURIComponent(editingRecord.id)}?zone=${encodeURIComponent(zoneName)}`
      : `/api/provider-connections/${connectionId}/records?zone=${encodeURIComponent(zoneName)}`;

    await requestJson(url, {
      method: editingRecord ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
      source: 'dns-records',
    });

    notifySuccess(editingRecord ? 'DNS 记录已更新。' : 'DNS 记录已创建。', 'dns-records');
    setDrawerOpen(false);
    await loadRecords(connectionId, zoneName);
  };

  const deleteRecords = async (recordIds: string[], successMessage: string) => {
    if (!connectionId || !zoneName || recordIds.length === 0) return;

    setDeletingIds((current) => Array.from(new Set([...current, ...recordIds])));
    try {
      for (const recordId of recordIds) {
        await requestJson(
          `/api/provider-connections/${connectionId}/records/${encodeURIComponent(recordId)}?zone=${encodeURIComponent(zoneName)}`,
          {
            method: 'DELETE',
            source: 'dns-records',
          },
        );
      }
      notifySuccess(successMessage, 'dns-records');
      setSelectedRowKeys((current) => current.filter((key) => !recordIds.includes(String(key))));
      await loadRecords(connectionId, zoneName);
    } finally {
      setDeletingIds((current) => current.filter((id) => !recordIds.includes(id)));
    }
  };

  const handleConfirmDelete = (record: DNSProviderRecord) => {
    void modal.confirm({
      title: `删除 DNS 记录 ${record.fqdn}`,
      content: '删除后将立即向 DNS 平台发起删除请求，且无法自动恢复。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteRecords([record.id], 'DNS 记录已删除。'),
    });
  };

  const handleConfirmBulkDelete = () => {
    if (!selectedDeletableRecords.length) return;
    void modal.confirm({
      title: `批量删除 ${selectedDeletableRecords.length} 条 DNS 记录`,
      content: '批量删除会逐条调用平台接口，请确认当前筛选结果和勾选项无误。',
      okText: '确认批量删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setBulkDeleting(true);
        try {
          await deleteRecords(
            selectedDeletableRecords.map((record) => record.id),
            `已删除 ${selectedDeletableRecords.length} 条 DNS 记录。`,
          );
        } finally {
          setBulkDeleting(false);
        }
      },
    });
  };

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadRecords(connectionId, zoneName)} disabled={!connectionId || !zoneName}>
            刷新记录
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate} disabled={!connectionId || !zoneName}>
            新增记录
          </Button>
        </Space>
      }
    >
      <SurfaceCard title="平台与 Zone 上下文">
        {readyConnections.length === 0 ? (
          <Empty description="当前没有可用的 DNS 平台接入，请先完成平台接入并验证连接。" />
        ) : (
          <Space direction="vertical" size={16} className="w-full">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
              <Select
                value={connectionId || undefined}
                placeholder="选择平台接入"
                options={readyConnections.map((connection) => ({ value: connection.id, label: connection.displayName }))}
                onChange={handleChangeConnection}
              />
              <Select
                value={zoneName || undefined}
                placeholder="选择 Zone"
                options={zones.map((zone) => ({ value: zone.name, label: zone.name }))}
                onChange={setZoneName}
              />
              <Input allowClear placeholder="按主机名、FQDN、内容或类型搜索" value={search} onChange={(event) => setSearch(event.target.value)} />
              <Tag color={currentConnection ? getStatusColor(currentConnection.status) : 'default'}>
                {currentConnection ? `${currentConnection.provider} · ${currentConnection.status}` : '未选择平台接入'}
              </Tag>
            </div>

            {currentConnection ? (
              <Descriptions size="small" column={{ xs: 1, md: 2, xl: 4 }}>
                <Descriptions.Item label="管理范围">
                  {currentConnection.settings.managedZones.length
                    ? currentConnection.settings.managedZones.join(', ')
                    : '使用当前 Token 授权的全部 Zone'}
                </Descriptions.Item>
                <Descriptions.Item label="默认 TTL">{currentConnection.settings.defaultTtl ?? '手动填写'}</Descriptions.Item>
                <Descriptions.Item label="默认代理状态">
                  {currentConnection.capabilities.supportsProxyStatus
                    ? currentConnection.settings.defaultProxied
                      ? '默认开启代理'
                      : '默认 DNS Only'
                    : '当前平台不支持'}
                </Descriptions.Item>
                <Descriptions.Item label="可见 Zone 数">{zones.length}</Descriptions.Item>
              </Descriptions>
            ) : null}
          </Space>
        )}
      </SurfaceCard>

      <SurfaceCard className="mt-4" title="DNS 记录列表">
        {!connectionId ? (
          <Empty description="请先选择一个已验证的平台接入。" />
        ) : !zoneName ? (
          <Empty description="请先选择一个 Zone。" />
        ) : (
          <Space direction="vertical" size={16} className="w-full">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <Space wrap size={[12, 12]}>
                <Select
                  value={recordTypeFilter}
                  options={typeFilterOptions}
                  onChange={(value) => setRecordTypeFilter(value as RecordTypeFilter)}
                  style={{ minWidth: 180 }}
                />
                <Typography.Text type="secondary">当前筛选结果共 {filteredRecords.length} 条记录。</Typography.Text>
              </Space>

              <Space wrap>
                {selectedDeletableRecords.length ? (
                  <Typography.Text type="secondary">已勾选 {selectedDeletableRecords.length} 条可删除记录</Typography.Text>
                ) : null}
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={!selectedDeletableRecords.length}
                  loading={bulkDeleting}
                  onClick={handleConfirmBulkDelete}
                >
                  批量删除
                </Button>
              </Space>
            </div>

            <Table
              rowKey="id"
              loading={loading}
              dataSource={filteredRecords}
              size="middle"
              scroll={{ x: 1080 }}
              rowSelection={{
                selectedRowKeys,
                onChange: setSelectedRowKeys,
                preserveSelectedRowKeys: false,
                getCheckboxProps: (record: DNSProviderRecord) => ({
                  disabled: !(record.deletable ?? record.editable) || deletingIdSet.has(record.id),
                }),
              }}
              pagination={{
                current: currentPage,
                pageSize,
                total: filteredRecords.length,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                onChange: (page, nextPageSize) => {
                  const sizeChanged = nextPageSize !== pageSize;
                  setPageSize(nextPageSize);
                  setCurrentPage(sizeChanged ? 1 : page);
                },
              }}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'type',
                  width: 110,
                  render: (value: string) => <Tag>{value}</Tag>,
                },
                {
                  title: '主机名',
                  dataIndex: 'name',
                  width: 180,
                  render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
                },
                {
                  title: 'FQDN',
                  dataIndex: 'fqdn',
                  width: 260,
                  render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>,
                },
                {
                  title: '内容',
                  dataIndex: 'content',
                  render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value}</Typography.Text>,
                },
                {
                  title: 'TTL',
                  dataIndex: 'ttl',
                  width: 120,
                },
                {
                  title: '状态',
                  width: 220,
                  render: (_: unknown, record: DNSProviderRecord) => (
                    <Space>
                      {currentConnection?.capabilities.supportsProxyStatus ? (
                        <Tag color={record.proxied ? 'blue' : 'default'}>{record.proxied ? 'Proxied' : 'DNS Only'}</Tag>
                      ) : null}
                      {!record.editable ? (
                        <Tooltip title={record.readOnlyReason || '当前记录不可编辑。'}>
                          <Tag color="warning">只读</Tag>
                        </Tooltip>
                      ) : null}
                      {!record.deletable && record.readOnlyReason ? (
                        <Tooltip title={record.readOnlyReason}>
                          <Tag color="default">不可删除</Tag>
                        </Tooltip>
                      ) : null}
                    </Space>
                  ),
                },
                {
                  title: '操作',
                  width: 170,
                  fixed: 'right',
                  render: (_: unknown, record: DNSProviderRecord) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} disabled={!record.editable || bulkDeleting} onClick={() => handleOpenEdit(record)}>
                        编辑
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={!(record.deletable ?? record.editable) || bulkDeleting}
                        loading={deletingIdSet.has(record.id)}
                        onClick={() => handleConfirmDelete(record)}
                      >
                        删除
                      </Button>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        )}
      </SurfaceCard>

      <Drawer
        title={editingRecord ? '编辑 DNS 记录' : '新增 DNS 记录'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={480}
        extra={<Button type="primary" onClick={() => void handleSave()}>保存记录</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="记录类型" name="type" rules={[{ required: true, message: '请选择记录类型' }]}>
            <Select options={(currentConnection?.capabilities.recordTypes || ['A', 'AAAA', 'CNAME', 'TXT']).map((type) => ({ label: type, value: type }))} />
          </Form.Item>
          <Form.Item label="主机名" name="name" rules={[{ required: true, message: '请输入主机名' }]}>
            <Input placeholder="@ / www" />
          </Form.Item>
          <Form.Item label="记录内容" name="content" rules={[{ required: true, message: '请输入记录内容' }]}>
            <Input placeholder="1.2.3.4 / target.example.com" />
          </Form.Item>
          <Form.Item label="TTL" name="ttl" rules={[{ required: true, message: '请输入 TTL' }]}>
            <InputNumber min={1} className="w-full" />
          </Form.Item>
          {currentConnection?.capabilities.supportsProxyStatus ? (
            <Form.Item label="代理状态" name="proxied" valuePropName="checked">
              <Switch checkedChildren="Proxied" unCheckedChildren="DNS Only" />
            </Form.Item>
          ) : (
            <Typography.Text type="secondary">当前平台不支持代理状态设置。</Typography.Text>
          )}
        </Form>
      </Drawer>
    </ModulePage>
  );
}
