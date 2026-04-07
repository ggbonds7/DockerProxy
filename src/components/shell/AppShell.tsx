import {
  BellOutlined,
  BulbOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Drawer, Dropdown, Grid, Layout, Menu, Space, Typography, theme as antdTheme } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeModeContext';
import { DEFAULT_ROUTE_PATH, getPathByRouteKey, getRouteByPath, NAV_GROUPS } from '../../navigation';
import { useFeedbackCenter } from './FeedbackCenter';

const { Header, Sider, Content } = Layout;

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const { user, logout } = useAuth();
  const { unreadCount, toggleCenter } = useFeedbackCenter();
  const { theme, resolvedTheme, setTheme } = useThemeMode();
  const { token } = antdTheme.useToken();
  const isDark = resolvedTheme === 'dark';

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentRoute = getRouteByPath(location.pathname) || getRouteByPath(DEFAULT_ROUTE_PATH);
  const [openKeys, setOpenKeys] = useState<string[]>(currentRoute ? [currentRoute.groupKey] : []);

  useEffect(() => {
    if (currentRoute) {
      setOpenKeys([currentRoute.groupKey]);
    }
  }, [currentRoute]);

  const menuItems = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        key: group.key,
        icon: group.icon,
        label: group.label,
        children: group.items.map((item) => ({
          key: item.key,
          label: item.title,
        })),
      })),
    [],
  );

  const siderMenu = (
    <div className="flex h-full flex-col" style={{ background: token.colorBgContainer }}>
      <div className="px-4 pb-4 pt-5">
        <div className="rounded-3xl bg-[linear-gradient(135deg,#1677ff_0%,#22c3ff_100%)] px-5 py-5 text-white shadow-[0_18px_48px_-24px_rgba(22,119,255,0.8)]">
          <Typography.Title level={3} style={{ color: '#ffffff', margin: 0 }}>
            DockerProxy
          </Typography.Title>
          <Typography.Text style={{ color: 'rgba(255,255,255,0.82)' }}>企业级容器控制台</Typography.Text>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5">
        <Menu
          mode="inline"
          theme={isDark ? 'dark' : 'light'}
          selectedKeys={currentRoute ? [currentRoute.key] : []}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => setOpenKeys(keys.slice(-1))}
          items={menuItems}
          onClick={({ key }) => {
            navigate(getPathByRouteKey(key as never));
            setMobileOpen(false);
          }}
          style={{ borderInlineEnd: 'none' }}
        />
      </div>
    </div>
  );

  return (
    <Layout className="h-screen overflow-hidden" style={{ background: token.colorBgLayout }}>
      {screens.lg ? (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          width={280}
          theme={isDark ? 'dark' : 'light'}
          trigger={null}
          className="h-screen overflow-hidden"
          style={{
            borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
            background: token.colorBgContainer,
          }}
        >
          {siderMenu}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          width={300}
          styles={{
            body: {
              padding: 0,
              background: token.colorBgContainer,
            },
          }}
        >
          {siderMenu}
        </Drawer>
      )}

      <Layout className="h-screen min-w-0 bg-transparent">
        <Header
          className="flex h-[72px] items-center justify-between gap-4 px-4 md:px-6 lg:px-8"
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="text"
              icon={screens.lg ? (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />) : <MenuUnfoldOutlined />}
              onClick={() => (screens.lg ? setCollapsed((current) => !current) : setMobileOpen(true))}
            />
            <div className="min-w-0">
              <Typography.Text strong className="block truncate text-base">
                DockerProxy 控制台
              </Typography.Text>
            </div>
          </div>

          <Space size="middle">
            <Button
              type="text"
              icon={<BulbOutlined />}
              onClick={() => {
                if (theme === 'system') {
                  setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
                  return;
                }
                setTheme(theme === 'dark' ? 'light' : 'dark');
              }}
            >
              {resolvedTheme === 'dark' ? '深色' : '浅色'}
            </Button>

            <Badge count={unreadCount} size="small">
              <Button type="text" icon={<BellOutlined />} onClick={toggleCenter} />
            </Badge>

            <Dropdown
              menu={{
                items: [
                  {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: '主题与账户',
                    onClick: () => navigate('/settings/preferences'),
                  },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    onClick: () => void logout(),
                  },
                ],
              }}
            >
              <Button type="text">
                <Space>
                  <Avatar size="small">{user?.username?.slice(0, 1).toUpperCase() || 'A'}</Avatar>
                  <span>{user?.username || 'admin'}</span>
                </Space>
              </Button>
            </Dropdown>
          </Space>
        </Header>

        <Content
          className="min-h-0 overflow-y-auto px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8"
          style={{ background: token.colorBgLayout }}
        >
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
