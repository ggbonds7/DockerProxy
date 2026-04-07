import { Button, Space, Typography } from 'antd';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { SurfaceCard } from '../common/SurfaceCard';

function getErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return error.data?.message || error.data?.error || error.statusText || '页面加载失败';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '发生了未预期的错误';
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : '页面加载失败';
  const message = getErrorMessage(error);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <SurfaceCard className="w-full max-w-2xl shadow-sm">
        <Space direction="vertical" size={16} className="w-full">
          <div>
            <Typography.Title level={2} style={{ marginBottom: 8 }}>
              {title}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              应用在渲染当前页面时遇到了异常，我们已经拦截了默认报错页。
            </Typography.Paragraph>
          </div>

          <SurfaceCard type="inner" size="small" title="错误信息">
            <Typography.Text>{message}</Typography.Text>
          </SurfaceCard>

          <Space>
            <Button type="primary" onClick={() => navigate('/', { replace: true })}>
              返回首页
            </Button>
            <Button onClick={() => window.location.reload()}>刷新页面</Button>
          </Space>
        </Space>
      </SurfaceCard>
    </div>
  );
}
