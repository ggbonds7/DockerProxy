import { Navigate, createBrowserRouter } from 'react-router-dom';
import { DEFAULT_ROUTE_PATH } from './navigation';
import { AppShell } from './components/shell/AppShell';
import { ProtectedRoute } from './components/shell/ProtectedRoute';
import { RouteErrorBoundary } from './components/shell/RouteErrorBoundary';
import { LoginPage } from './pages/LoginPage';
import { EnvironmentAccessPage } from './pages/infrastructure/EnvironmentAccessPage';
import { ServerOverviewPage } from './pages/infrastructure/ServerOverviewPage';
import { DeploymentCenterPage } from './pages/delivery/DeploymentCenterPage';
import { WorkloadProjectsPage } from './pages/delivery/WorkloadProjectsPage';
import { CertificatesPage } from './pages/network/CertificatesPage';
import { DnsConnectionsPage } from './pages/network/DnsConnectionsPage';
import { DnsRecordsPage } from './pages/network/DnsRecordsPage';
import { GatewayRoutesPage } from './pages/network/GatewayRoutesPage';
import { JobQueuePage } from './pages/operations/JobQueuePage';
import { MigrationConsolePage } from './pages/operations/MigrationConsolePage';
import { ConfigurationPage } from './pages/settings/ConfigurationPage';
import { PreferencesPage } from './pages/settings/PreferencesPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to={DEFAULT_ROUTE_PATH} replace /> },
      { path: 'infrastructure/servers', element: <ServerOverviewPage /> },
      { path: 'infrastructure/environments', element: <EnvironmentAccessPage /> },
      { path: 'delivery/workloads', element: <WorkloadProjectsPage /> },
      { path: 'delivery/deployments', element: <DeploymentCenterPage /> },
      { path: 'network/dns-connections', element: <DnsConnectionsPage /> },
      { path: 'network/dns-records', element: <DnsRecordsPage /> },
      { path: 'network/gateway-routes', element: <GatewayRoutesPage /> },
      { path: 'network/certificates', element: <CertificatesPage /> },
      { path: 'operations/migration', element: <MigrationConsolePage /> },
      { path: 'operations/jobs', element: <JobQueuePage /> },
      { path: 'settings/configuration', element: <ConfigurationPage /> },
      { path: 'settings/preferences', element: <PreferencesPage /> },
      { path: '*', element: <Navigate to={DEFAULT_ROUTE_PATH} replace /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to={DEFAULT_ROUTE_PATH} replace />,
  },
]);
