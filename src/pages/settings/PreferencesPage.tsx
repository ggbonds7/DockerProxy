import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { LogoutOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { Button, Col, Radio, Row, Space, Typography } from 'antd';
import { ModulePage } from '../../components/common/ModulePage';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeModeContext';

export function PreferencesPage() {
  const { user, logout } = useAuth();
  const { theme, resolvedTheme, setTheme } = useThemeMode();

  return (
    <ModulePage>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <SurfaceCard title="主题模式">
            <Typography.Paragraph type="secondary">
              当前界面统一使用 Ant Design 主题 token，新增页面和组件必须复用同一套颜色、圆角和间距规范。
            </Typography.Paragraph>
            <Radio.Group
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
              options={[
                { label: <Space><SunOutlined />浅色</Space>, value: 'light' },
                { label: <Space><MoonOutlined />深色</Space>, value: 'dark' },
                { label: '跟随系统', value: 'system' },
              ]}
            />
            <div className="mt-4">
              <Typography.Text type="secondary">当前生效主题：{resolvedTheme === 'dark' ? '深色' : '浅色'}</Typography.Text>
            </div>
          </SurfaceCard>
        </Col>
        <Col xs={24} xl={12}>
          <SurfaceCard title="账户信息">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Typography.Text type="secondary">当前登录用户</Typography.Text>
                <Typography.Title level={4} style={{ marginTop: 8, marginBottom: 0 }}>
                  {user?.username || 'admin'}
                </Typography.Title>
              </div>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                后续前端开发默认优先使用 `Ant Design + ProComponents`；只有现有成熟开源组件无法满足需求时，才允许二次开发。
              </Typography.Paragraph>
              <Button danger icon={<LogoutOutlined />} onClick={() => void logout()}>
                退出登录
              </Button>
            </Space>
          </SurfaceCard>
        </Col>
      </Row>
    </ModulePage>
  );
}



