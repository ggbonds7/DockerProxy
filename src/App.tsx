import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AppDataProvider } from './contexts/AppDataContext';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeModeProvider, useThemeMode } from './contexts/ThemeModeContext';
import { FeedbackCenterProvider } from './components/shell/FeedbackCenter';

function AppRoot() {
  const { resolvedTheme } = useThemeMode();
  const isDark = resolvedTheme === 'dark';

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          borderRadius: 14,
          colorPrimary: '#1677ff',
          colorInfo: '#1677ff',
          wireframe: false,
          fontSize: 14,
        },
        components: {
          Layout: {
            headerBg: isDark ? '#0f172a' : '#ffffff',
            siderBg: isDark ? '#111827' : '#ffffff',
            bodyBg: isDark ? '#030712' : '#f5f7fb',
            triggerBg: isDark ? '#111827' : '#ffffff',
          },
          Menu: {
            itemBorderRadius: 12,
            subMenuItemBorderRadius: 12,
            itemMarginInline: 8,
            itemMarginBlock: 4,
          },
          Card: {
            borderRadiusLG: 18,
          },
          Drawer: {
            borderRadiusLG: 18,
          },
          Table: {
            borderColor: isDark ? '#1f2937' : '#e5e7eb',
          },
        },
      }}
    >
      <AntdApp>
        <FeedbackCenterProvider>
          <AuthProvider>
            <AppDataProvider>
              <RouterProvider router={router} />
            </AppDataProvider>
          </AuthProvider>
        </FeedbackCenterProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <ThemeModeProvider>
      <AppRoot />
    </ThemeModeProvider>
  );
}
