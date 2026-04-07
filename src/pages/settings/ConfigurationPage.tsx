import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Col, Descriptions, Input, Row, Space, Statistic, Tabs, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { useAppData } from '../../contexts/AppDataContext';
import { notifySuccess, requestJson, requestText } from '../../lib/api';

export function ConfigurationPage() {
  const { config, refreshConfig } = useAppData();
  const [envContent, setEnvContent] = useState('');
  const [loadingEnv, setLoadingEnv] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadEnv = async () => {
    setLoadingEnv(true);
    try {
      const content = await requestText('/api/config/env', { source: '配置管理' });
      setEnvContent(content);
    } finally {
      setLoadingEnv(false);
    }
  };

  useEffect(() => {
    void loadEnv();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await requestJson('/api/config/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: envContent }),
        source: '配置管理',
      });
      notifySuccess('系统配置已保存', '配置管理');
      await refreshConfig();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void Promise.all([loadEnv(), refreshConfig()])} loading={loadingEnv}>
            刷新配置
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
            保存 .env
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="环境数量" value={config?.environmentCount || 0} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="DNS 平台接入" value={config?.providerConnectionCount || 0} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="主密钥" value={config?.hasAppMasterKey ? '已配置' : '未配置'} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="公网 IP" value={config?.vpsIp ? '已配置' : '未配置'} /></SurfaceCard></Col>
      </Row>

      <Tabs
        className="mt-4"
        items={[
          {
            key: 'summary',
            label: '系统摘要',
            children: (
              <SurfaceCard title="当前运行配置">
                <Descriptions column={{ xs: 1, md: 2 }}>
                  <Descriptions.Item label="Nginx 容器">{config?.nginxContainer || '-'}</Descriptions.Item>
                  <Descriptions.Item label="证书容器">{config?.certAgentContainer || '-'}</Descriptions.Item>
                  <Descriptions.Item label="VPS 公网 IP">{config?.vpsIp || '-'}</Descriptions.Item>
                  <Descriptions.Item label="DNS 平台接入数">{config?.providerConnectionCount || 0}</Descriptions.Item>
                </Descriptions>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 16 }}>
                  Cloudflare / Gcore 等域名平台配置已统一迁移到“DNS 平台接入”，这里不再承载 DNS 平台凭据和域名范围策略。
                </Typography.Paragraph>
              </SurfaceCard>
            ),
          },
          {
            key: 'env',
            label: '.env 编辑',
            children: (
              <SurfaceCard title="系统运行时环境变量">
                <Typography.Paragraph type="secondary">
                  这里仅用于维护系统运行所需的基础配置。DNS 平台凭据与域名管理范围请到“DNS 平台接入”页面维护。
                </Typography.Paragraph>
                <Input.TextArea
                  value={envContent}
                  onChange={(event) => setEnvContent(event.target.value)}
                  autoSize={{ minRows: 18, maxRows: 30 }}
                  style={{ fontFamily: 'JetBrains Mono, Consolas, monospace' }}
                />
              </SurfaceCard>
            ),
          },
        ]}
      />
    </ModulePage>
  );
}
