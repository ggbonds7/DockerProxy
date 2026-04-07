import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Button,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { notifySuccess, requestJson } from '../../lib/api';
import { formatDateTime, getStatusColor } from '../../lib/format';
import type { EnvironmentSummary } from '../../types';
import { useAppData } from '../../contexts/AppDataContext';

type EnvironmentFormValues = {
  displayName: string;
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'privateKey';
  password?: string;
  privateKey?: string;
  workdir: string;
};

export function EnvironmentAccessPage() {
  const { refreshServers } = useAppData();
  const [form] = Form.useForm<EnvironmentFormValues>();
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingId, setVerifyingId] = useState('');

  const loadEnvironments = async () => {
    setLoading(true);
    try {
      const data = await requestJson<EnvironmentSummary[]>('/api/environments', { source: '环境接入' });
      setEnvironments(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEnvironments();
  }, []);

  const stats = useMemo(
    () => ({
      total: environments.length,
      ready: environments.filter((item) => item.status === 'ready').length,
      warning: environments.filter((item) => item.status === 'warning').length,
      remote: environments.filter((item) => !item.isLocal).length,
    }),
    [environments],
  );

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await requestJson('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        source: '环境接入',
      });
      notifySuccess('环境创建成功', '环境接入');
      setDrawerOpen(false);
      form.resetFields();
      await Promise.all([loadEnvironments(), refreshServers()]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (environmentId: string) => {
    setVerifyingId(environmentId);
    try {
      await requestJson(`/api/environments/${environmentId}/verify`, {
        method: 'POST',
        source: '环境接入',
      });
      notifySuccess('环境验证完成', '环境接入');
      await Promise.all([loadEnvironments(), refreshServers()]);
    } finally {
      setVerifyingId('');
    }
  };

  return (
    <ModulePage
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void loadEnvironments()}>
            刷新环境
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
            新增环境
          </Button>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="环境总数" value={stats.total} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="可用环境" value={stats.ready} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="告警环境" value={stats.warning} /></SurfaceCard></Col>
        <Col xs={24} md={12} xl={6}><SurfaceCard><Statistic title="远程环境" value={stats.remote} /></SurfaceCard></Col>
      </Row>

      <SurfaceCard className="mt-4" title="环境列表">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={environments}
          expandable={{
            expandedRowRender: (record) => (
              <Descriptions column={2} size="small">
                <Descriptions.Item label="平台工作目录">{record.workdir}</Descriptions.Item>
                <Descriptions.Item label="认证方式">{record.authType || '-'}</Descriptions.Item>
                <Descriptions.Item label="指纹">{record.hostFingerprint || '-'}</Descriptions.Item>
                <Descriptions.Item label="Sudo 模式">{record.capabilities.sudoMode}</Descriptions.Item>
                <Descriptions.Item label="能力模块" span={2}>
                  <Space wrap>
                    {Object.entries(record.capabilities.modules)
                      .filter(([, enabled]) => enabled)
                      .map(([module]) => (
                        <Tag key={module} color="blue">
                          {module}
                        </Tag>
                      ))}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="警告信息" span={2}>
                  {record.capabilities.warnings.length > 0 ? record.capabilities.warnings.join('；') : '无'}
                </Descriptions.Item>
                <Descriptions.Item label="最近错误" span={2}>
                  {record.lastError || '无'}
                </Descriptions.Item>
              </Descriptions>
            ),
          }}
          columns={[
            {
              title: '环境',
              render: (_, record) => (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{record.displayName}</Typography.Text>
                  <Typography.Text type="secondary">{record.host}{record.isLocal ? '' : `:${record.port}`}</Typography.Text>
                </Space>
              ),
            },
            {
              title: '类型',
              render: (_, record) => <Tag>{record.type === 'local-docker' ? '本地 Docker' : 'SSH Docker'}</Tag>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag>,
            },
            {
              title: 'Docker / Compose',
              render: (_, record) => `${record.capabilities.dockerVersion || '不可用'} / ${record.capabilities.composeVersion || '不可用'}`,
            },
            {
              title: '最后验证',
              dataIndex: 'lastVerifiedAt',
              render: (value) => formatDateTime(value),
            },
            {
              title: '操作',
              render: (_, record) => (
                <Button loading={verifyingId === record.id} onClick={() => void handleVerify(record.id)}>
                  验证连接
                </Button>
              ),
            },
          ]}
        />
      </SurfaceCard>

      <Drawer
        title="新增 SSH 环境"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
        extra={<Button type="primary" loading={submitting} onClick={() => void handleCreate()}>保存环境</Button>}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            authType: 'privateKey',
            port: 22,
            username: 'root',
            workdir: '/opt/docker-projects',
          }}
        >
          <Form.Item label="环境名称" name="displayName" rules={[{ required: true, message: '请输入环境名称' }]}>
            <Input placeholder="production-01" />
          </Form.Item>
          <Form.Item
            label="主机地址"
            name="host"
            extra="用于 SSH 连接到目标服务器，不会限制 Docker 可见范围。"
            rules={[{ required: true, message: '请输入主机地址' }]}
          >
            <Input placeholder="192.168.1.100 / example.com" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="SSH 端口" name="port" rules={[{ required: true, message: '请输入端口' }]}>
                <Input type="number" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="SSH 用户" name="username" rules={[{ required: true, message: '请输入用户' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            label="平台工作目录"
            name="workdir"
            extra="用于部署 Compose、落盘项目文件和迁移产物的远程根目录。不会限制 Docker 操作范围，但会影响后续部署与迁移使用的目录。"
            rules={[{ required: true, message: '请输入平台工作目录' }]}
          >
            <Input placeholder="/opt/docker-projects" />
          </Form.Item>
          <Form.Item label="认证方式" name="authType" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '私钥', value: 'privateKey' },
                { label: '密码', value: 'password' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue('authType') === 'password' ? (
                <Form.Item label="SSH 密码" name="password" rules={[{ required: true, message: '请输入 SSH 密码' }]}>
                  <Input.Password />
                </Form.Item>
              ) : (
                <Form.Item label="SSH 私钥" name="privateKey" rules={[{ required: true, message: '请输入 SSH 私钥' }]}>
                  <Input.TextArea autoSize={{ minRows: 8, maxRows: 14 }} />
                </Form.Item>
              )
            }
          </Form.Item>
        </Form>
      </Drawer>
    </ModulePage>
  );
}



