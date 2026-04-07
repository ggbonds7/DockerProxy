import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Col, Row, Select, Space, Statistic, Table, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { ServerContextCard } from '../../components/common/ServerContextCard';
import { useAppData } from '../../contexts/AppDataContext';
import { notifySuccess, requestJson } from '../../lib/api';
import { formatDateTime, getStatusColor } from '../../lib/format';
import type { Certificate, GatewaySummary } from '../../types';

export function CertificatesPage() {
  const { selectedServer } = useAppData();
  const [gateways, setGateways] = useState<GatewaySummary[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [gatewayId, setGatewayId] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!selectedServer) return;
    setLoading(true);
    try {
      const nextGateways = await requestJson<GatewaySummary[]>(`/api/gateways?serverId=${encodeURIComponent(selectedServer.id)}`, {
        source: '证书管理',
      });
      setGateways(nextGateways);
      const activeGatewayId = gatewayId || nextGateways[0]?.id || '';
      setGatewayId(activeGatewayId);
      const nextCertificates = activeGatewayId
        ? await requestJson<Certificate[]>(`/api/certs?gatewayId=${encodeURIComponent(activeGatewayId)}`, { source: '证书管理' })
        : [];
      setCertificates(nextCertificates);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [selectedServer?.id]);

  useEffect(() => {
    if (!gatewayId) return;
    void (async () => {
      const nextCertificates = await requestJson<Certificate[]>(`/api/certs?gatewayId=${encodeURIComponent(gatewayId)}`, { source: '证书管理' });
      setCertificates(nextCertificates);
    })();
  }, [gatewayId]);

  const stats = useMemo(
    () => ({
      total: certificates.length,
      valid: certificates.filter((item) => item.status === 'valid').length,
      expired: certificates.filter((item) => item.status === 'expired').length,
      renewing: certificates.filter((item) => item.status === 'renewing').length,
    }),
    [certificates],
  );

  const handleRenew = async (certificate: Certificate) => {
    if (!selectedServer || !certificate.gatewayId) return;
    await requestJson(`/api/certs/${encodeURIComponent(certificate.domain)}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatewayId: certificate.gatewayId, serverId: selectedServer.id }),
      source: '证书管理',
    });
    notifySuccess('证书续签任务已提交', '证书管理');
    await loadData();
  };

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>
            刷新证书
          </Button>
          <Select
            value={gatewayId || undefined}
            placeholder="选择网关"
            style={{ minWidth: 220 }}
            options={gateways.map((gateway) => ({ value: gateway.id, label: gateway.displayName }))}
            onChange={setGatewayId}
          />
        </Space>
      }
    >
      <ServerContextCard title="证书上下文" description="证书数据跟随当前服务器和网关切换，续签任务统一走后台作业。" />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="证书总数" value={stats.total} prefix={<SafetyCertificateOutlined />} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="有效证书" value={stats.valid} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="已过期" value={stats.expired} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="续签中" value={stats.renewing} /></SurfaceCard></Col>
      </Row>

      <SurfaceCard className="mt-4" title="证书列表">
        <Table
          rowKey={(record) => record.id || record.domain}
          dataSource={certificates}
          columns={[
            { title: '域名', dataIndex: 'domain' },
            { title: '目标地址', dataIndex: 'routeTarget' },
            { title: '签发时间', dataIndex: 'issueDate', render: (value) => formatDateTime(value) },
            { title: '到期时间', dataIndex: 'expiryDate', render: (value) => formatDateTime(value) },
            { title: '状态', dataIndex: 'status', render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag> },
            {
              title: '操作',
              render: (_, record) => <Button onClick={() => void handleRenew(record)}>续签</Button>,
            },
          ]}
        />
      </SurfaceCard>
    </ModulePage>
  );
}



