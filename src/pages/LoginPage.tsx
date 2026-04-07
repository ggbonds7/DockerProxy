import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

type LoginFormValues = {
  username: string;
  password: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, login } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'authenticated') {
      navigate((location.state as { from?: string } | null)?.from || '/', { replace: true });
    }
  }, [location.state, navigate, status]);

  const handleSubmit = async (values: LoginFormValues) => {
    setSubmitting(true);
    setError('');

    try {
      const result = await login(values.username, values.password);
      if (!result.success) {
        setError(result.error || '登录失败');
        return;
      }

      navigate((location.state as { from?: string } | null)?.from || '/', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(22,119,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_26%),#f5f7fb] px-6 py-10 dark:bg-[radial-gradient(circle_at_top_left,rgba(22,119,255,0.24),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.12),transparent_26%),#030712]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center gap-10">
        <div className="hidden max-w-xl lg:block">
          <Typography.Title style={{ marginBottom: 16 }}>DockerProxy 控制台</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ fontSize: 16, marginBottom: 24 }}>
            以服务器为中心，统一处理环境接入、工作负载、网络域名、迁移任务与系统配置。
          </Typography.Paragraph>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ['分层导航', '一级能力域 + 二级功能菜单，便于持续扩展。'],
              ['统一反馈', '成功、失败与重试全部走全局提示与通知中心。'],
              ['成熟组件', '默认基于 Ant Design 与成熟开源组件构建。'],
              ['运维场景', '覆盖部署、DNS、证书、迁移和任务追踪。'],
            ].map(([title, desc]) => (
              <SurfaceCard key={title} bordered={false} className="shadow-sm">
                <Typography.Title level={5}>{title}</Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  {desc}
                </Typography.Paragraph>
              </SurfaceCard>
            ))}
          </div>
        </div>

        <SurfaceCard className="w-full max-w-md shadow-[0_24px_64px_-32px_rgba(15,23,42,0.5)]">
          <div className="mb-8 text-center">
            <Typography.Title level={3} style={{ marginBottom: 8 }}>
              登录控制台
            </Typography.Title>
            <Typography.Text type="secondary">请输入管理员账号和密码</Typography.Text>
          </div>

          <Form<LoginFormValues>
            layout="vertical"
            initialValues={{ username: 'admin', password: '' }}
            onFinish={handleSubmit}
            autoComplete="off"
          >
            <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="admin" size="large" />
            </Form.Item>

            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" size="large" />
            </Form.Item>

            {error && <Alert className="mb-4" type="error" showIcon message={error} />}

            <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
              登录
            </Button>
          </Form>
        </SurfaceCard>
      </div>
    </div>
  );
}



