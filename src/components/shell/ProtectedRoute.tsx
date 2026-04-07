import { LoadingOutlined } from '@ant-design/icons';
import { Flex, Spin } from 'antd';
import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useAppData } from '../../contexts/AppDataContext';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const { status } = useAuth();
  const { bootstrapping } = useAppData();

  if (status === 'checking' || (status === 'authenticated' && bootstrapping)) {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin indicator={<LoadingOutlined spin />} size="large" />
      </Flex>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
