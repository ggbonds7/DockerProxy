import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { DeploymentUnitOutlined, FileTextOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Col, Form, Input, Row, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { ServerContextCard } from '../../components/common/ServerContextCard';
import { useAppData } from '../../contexts/AppDataContext';
import { notifySuccess, requestJson } from '../../lib/api';
import { formatDateTime, getStatusColor, summarizeMetadata } from '../../lib/format';
import type { JobSummary } from '../../types';

type DeployFormValues = {
  imageName: string;
  serviceName: string;
  containerPort: string;
  remarks?: string;
};

function buildComposeYaml(values: DeployFormValues) {
  return [
    "version: '3.8'",
    'services:',
    `  ${values.serviceName}:`,
    `    image: ${values.imageName}`,
    `    container_name: ${values.serviceName}`,
    '    restart: unless-stopped',
    '    expose:',
    `      - "${values.containerPort}"`,
    '    networks:',
    '      - proxy_net',
    '',
    'networks:',
    '  proxy_net:',
    '    external: true',
    '    name: proxy_net',
  ].join('\n');
}

export function DeploymentCenterPage() {
  const { selectedServer } = useAppData();
  const [form] = Form.useForm<DeployFormValues>();
  const [yaml, setYaml] = useState(buildComposeYaml({ imageName: 'nginx:latest', serviceName: 'web', containerPort: '80' }));
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<JobSummary[]>([]);

  const loadJobs = async () => {
    if (!selectedServer) return;
    const data = await requestJson<JobSummary[]>(`/api/jobs?serverId=${encodeURIComponent(selectedServer.id)}`, { source: '部署中心' });
    setJobs(data.filter((job) => job.kind.includes('deploy')).slice(0, 20));
  };

  useEffect(() => {
    void loadJobs();
  }, [selectedServer?.id]);

  const canDeploy = Boolean(selectedServer?.capabilities.modules.deploy);
  const latestJob = jobs[0];
  const stats = useMemo(
    () => ({
      total: jobs.length,
      success: jobs.filter((job) => job.status === 'completed').length,
      running: jobs.filter((job) => job.status === 'running').length,
      latest: latestJob?.updatedAt,
    }),
    [jobs, latestJob?.updatedAt],
  );

  const handleGenerate = async () => {
    const values = await form.validateFields();
    setYaml(buildComposeYaml(values));
    notifySuccess('Compose 模板已生成', '部署中心');
  };

  const handleDeploy = async () => {
    if (!selectedServer) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const result = await requestJson<{ message: string }>('/api/deploy/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: selectedServer.id,
          name: values.serviceName,
          composeYaml: yaml,
          remarks: values.remarks,
        }),
        source: '部署中心',
      });
      notifySuccess(result.message || '部署任务已提交', '部署中心');
      await loadJobs();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadJobs()}>
            刷新记录
          </Button>
          <Button type="primary" icon={<PlayCircleOutlined />} loading={submitting} disabled={!canDeploy} onClick={() => void handleDeploy()}>
            提交部署
          </Button>
        </Space>
      }
    >
      <ServerContextCard title="部署上下文" description="部署中心严格按当前服务器能力执行，并保留任务记录。" />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="部署记录" value={stats.total} prefix={<DeploymentUnitOutlined />} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="成功记录" value={stats.success} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="运行中任务" value={stats.running} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="最近更新时间" value={stats.latest ? formatDateTime(stats.latest) : '-'} /></SurfaceCard></Col>
      </Row>

      <Tabs
        className="mt-4"
        items={[
          {
            key: 'editor',
            label: '部署编辑器',
            children: (
              <div className="space-y-4">
                <SurfaceCard title="部署参数">
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ imageName: 'nginx:latest', serviceName: 'web', containerPort: '80', remarks: '' }}
                  >
                    <Row gutter={[16, 16]}>
                      <Col xs={24} md={12}><Form.Item label="镜像" name="imageName" rules={[{ required: true, message: '请输入镜像' }]}><Input placeholder="nginx:latest" /></Form.Item></Col>
                      <Col xs={24} md={12}><Form.Item label="服务名" name="serviceName" rules={[{ required: true, message: '请输入服务名' }]}><Input placeholder="web" /></Form.Item></Col>
                      <Col xs={24} md={12}><Form.Item label="容器端口" name="containerPort" rules={[{ required: true, message: '请输入容器端口' }]}><Input placeholder="80" /></Form.Item></Col>
                      <Col xs={24} md={12}><Form.Item label="备注" name="remarks"><Input placeholder="可选备注" /></Form.Item></Col>
                    </Row>
                    <Space>
                      <Button icon={<FileTextOutlined />} onClick={() => void handleGenerate()}>
                        生成模板
                      </Button>
                      <Tag color={canDeploy ? 'success' : 'error'}>{canDeploy ? '当前服务器支持 deploy' : '当前服务器不具备 deploy 能力'}</Tag>
                    </Space>
                  </Form>
                </SurfaceCard>

                <SurfaceCard title="Compose YAML">
                  <Input.TextArea
                    value={yaml}
                    onChange={(event) => setYaml(event.target.value)}
                    autoSize={{ minRows: 18, maxRows: 28 }}
                    style={{ fontFamily: 'JetBrains Mono, Consolas, monospace' }}
                  />
                </SurfaceCard>
              </div>
            ),
          },
          {
            key: 'history',
            label: '部署记录',
            children: (
              <SurfaceCard title="最近部署任务">
                <Table
                  rowKey="id"
                  dataSource={jobs}
                  columns={[
                    { title: '任务类型', dataIndex: 'kind' },
                    {
                      title: '摘要',
                      render: (_, record) => summarizeMetadata(record.metadata),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag>,
                    },
                    {
                      title: '更新时间',
                      dataIndex: 'updatedAt',
                      render: (value) => formatDateTime(value),
                    },
                  ]}
                />
              </SurfaceCard>
            ),
          },
        ]}
      />
    </ModulePage>
  );
}



