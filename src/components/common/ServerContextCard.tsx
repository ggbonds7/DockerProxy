import { Descriptions, Select, Space, Tag, Typography } from 'antd';
import { SurfaceCard } from './SurfaceCard';
import { useAppData } from '../../contexts/AppDataContext';
import { formatDateTime, getStatusColor } from '../../lib/format';

type ServerContextCardProps = {
  title?: string;
  description?: string;
};

const TEXT = {
  title: '\u670d\u52a1\u5668\u4e0a\u4e0b\u6587',
  description: '\u4e0b\u65b9\u9875\u9762\u4f1a\u56f4\u7ed5\u5f53\u524d\u9009\u4e2d\u7684\u670d\u52a1\u5668\u73af\u5883\u8fdb\u884c\u67e5\u8be2\u3001\u90e8\u7f72\u548c\u8fc1\u79fb\u64cd\u4f5c\u3002',
  currentContext: '\u5f53\u524d\u4e0a\u4e0b\u6587',
  currentServer: '\u5f53\u524d\u670d\u52a1\u5668',
  host: '\u4e3b\u673a\u5730\u5740',
  runtime: 'Docker / Compose',
  workdir: '\u5de5\u4f5c\u76ee\u5f55',
  heartbeat: '\u6700\u8fd1\u6821\u9a8c',
  permissions: '\u6743\u9650\u80fd\u529b',
  modules: '\u5df2\u542f\u7528\u6a21\u5757',
  warnings: '\u8b66\u544a\u4fe1\u606f',
  unavailable: '\u6682\u65e0',
  none: '\u65e0',
  versionUnavailable: '\u672a\u83b7\u53d6',
} as const;

export function ServerContextCard({
  title = TEXT.title,
  description = TEXT.description,
}: ServerContextCardProps) {
  const { servers, selectedServer, selectedServerId, setSelectedServerId } = useAppData();

  if (!servers.length || !selectedServer) {
    return null;
  }

  const enabledModules = Object.entries(selectedServer.capabilities.modules)
    .filter(([, enabled]) => enabled)
    .map(([module]) => module);

  return (
    <SurfaceCard className="mb-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <Space wrap size={[8, 8]}>
            <Typography.Title level={5} style={{ marginBottom: 0 }}>
              {title}
            </Typography.Title>
            <Tag color="processing">{TEXT.currentContext}</Tag>
            <Tag color={getStatusColor(selectedServer.status)}>{selectedServer.status}</Tag>
          </Space>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            {description}
          </Typography.Paragraph>
        </div>

        <Select
          className="min-w-[320px] max-w-full"
          value={selectedServerId}
          options={servers.map((server) => ({
            value: server.id,
            label: `${server.displayName} (${server.host})`,
          }))}
          onChange={setSelectedServerId}
        />
      </div>

      <Descriptions
        className="mt-4"
        size="small"
        column={{ xs: 1, md: 2, xl: 4 }}
        items={[
          {
            key: 'server',
            label: TEXT.currentServer,
            children: selectedServer.displayName,
          },
          {
            key: 'host',
            label: TEXT.host,
            children: `${selectedServer.host}${selectedServer.isLocal ? '' : `:${selectedServer.port}`}`,
          },
          {
            key: 'runtime',
            label: TEXT.runtime,
            children: `${selectedServer.capabilities.dockerVersion || TEXT.versionUnavailable} / ${selectedServer.capabilities.composeVersion || TEXT.versionUnavailable}`,
          },
          {
            key: 'workdir',
            label: TEXT.workdir,
            children: selectedServer.workdir,
          },
          {
            key: 'heartbeat',
            label: TEXT.heartbeat,
            children: formatDateTime(selectedServer.lastHeartbeatAt),
          },
          {
            key: 'permissions',
            label: TEXT.permissions,
            children: (
              <Space wrap>
                {selectedServer.capabilities.permissions.length > 0 ? (
                  selectedServer.capabilities.permissions.map((permission) => <Tag key={permission}>{permission}</Tag>)
                ) : (
                  <Typography.Text type="secondary">{TEXT.unavailable}</Typography.Text>
                )}
              </Space>
            ),
          },
          {
            key: 'modules',
            label: TEXT.modules,
            children: (
              <Space wrap>
                {enabledModules.length > 0 ? (
                  enabledModules.map((module) => (
                    <Tag key={module} color="blue">
                      {module}
                    </Tag>
                  ))
                ) : (
                  <Typography.Text type="secondary">{TEXT.unavailable}</Typography.Text>
                )}
              </Space>
            ),
          },
          {
            key: 'warnings',
            label: TEXT.warnings,
            children: selectedServer.capabilities.warnings.length > 0 ? selectedServer.capabilities.warnings.join('\uff1b') : TEXT.none,
          },
        ]}
      />
    </SurfaceCard>
  );
}
