import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { requestJson } from '../lib/api';
import type { AppConfig, ServerSummary } from '../types';
import { useAuth } from './AuthContext';

const SERVER_STORAGE_KEY = 'dockerproxy:selected-server';

type AppDataContextValue = {
  bootstrapping: boolean;
  servers: ServerSummary[];
  selectedServer: ServerSummary | null;
  selectedServerId: string;
  setSelectedServerId: (serverId: string) => void;
  refreshServers: () => Promise<void>;
  config: AppConfig | null;
  refreshConfig: () => Promise<void>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

function readStoredServerId() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SERVER_STORAGE_KEY) || '';
}

export function AppDataProvider({ children }: PropsWithChildren) {
  const { status } = useAuth();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [selectedServerId, setSelectedServerIdState] = useState(readStoredServerId);
  const [config, setConfig] = useState<AppConfig | null>(null);

  const setSelectedServerId = useCallback((serverId: string) => {
    setSelectedServerIdState(serverId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SERVER_STORAGE_KEY, serverId);
    }
  }, []);

  const refreshServers = useCallback(async () => {
    const nextServers = await requestJson<ServerSummary[]>('/api/servers', {
      source: 'server-overview',
    });

    setServers(Array.isArray(nextServers) ? nextServers : []);
    setSelectedServerIdState((current) => {
      const exists = nextServers.some((server) => server.id === current);
      if (exists) return current;

      const fallback = nextServers.find((server) => server.isLocal) || nextServers[0];
      const fallbackId = fallback?.id || '';

      if (typeof window !== 'undefined' && fallbackId) {
        localStorage.setItem(SERVER_STORAGE_KEY, fallbackId);
      }

      return fallbackId;
    });
  }, []);

  const refreshConfig = useCallback(async () => {
    const nextConfig = await requestJson<AppConfig>('/api/config', {
      source: 'configuration',
    });
    setConfig(nextConfig);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') {
      setBootstrapping(status === 'checking');
      if (status === 'anonymous') {
        setServers([]);
        setConfig(null);
        setSelectedServerIdState('');
      }
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      setBootstrapping(true);
      try {
        await Promise.all([refreshServers(), refreshConfig()]);
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [refreshConfig, refreshServers, status]);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedServerId) || servers[0] || null,
    [selectedServerId, servers],
  );

  const value = useMemo<AppDataContextValue>(
    () => ({
      bootstrapping,
      servers,
      selectedServer,
      selectedServerId,
      setSelectedServerId,
      refreshServers,
      config,
      refreshConfig,
    }),
    [bootstrapping, config, refreshConfig, refreshServers, selectedServer, selectedServerId, servers, setSelectedServerId],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);

  if (!context) {
    throw new Error('useAppData must be used inside AppDataProvider');
  }

  return context;
}
