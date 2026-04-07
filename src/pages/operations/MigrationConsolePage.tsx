import { DownloadOutlined, PlayCircleOutlined, ReloadOutlined, RollbackOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Descriptions, Empty, Form, Input, List, Progress, Select, Space, Statistic, Steps, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { SurfaceCard } from '../../components/common/SurfaceCard';
import { useAppData } from '../../contexts/AppDataContext';
import { apiFetch, notifyInfo, notifySuccess, requestJson } from '../../lib/api';
import { formatBytes, formatDateTime, getStatusColor } from '../../lib/format';
import type {
  EnvironmentSummary,
  MigrationArtifactsResponse,
  MigrationEvent,
  MigrationPlan,
  MigrationProject,
  MigrationProjectDiscoveryMeta,
  MigrationProjectListResponse,
  MigrationRisk,
  MigrationSession,
} from '../../types';

const PHASE_STEPS: Array<{ key: MigrationSession['currentPhase']; label: string }> = [
  { key: 'discover', label: '项目发现' },
  { key: 'plan', label: '迁移计划' },
  { key: 'preflight', label: '预检查' },
  { key: 'stage_images', label: '镜像预热' },
  { key: 'stage_project', label: '项目预同步' },
  { key: 'stop_source', label: '停止源端' },
  { key: 'export_data', label: '导出数据' },
  { key: 'upload_restore', label: '上传并恢复' },
  { key: 'start_target', label: '启动目标端' },
  { key: 'verify', label: '结果验证' },
  { key: 'rollback_if_needed', label: '回滚' },
];

function getCurrentStepIndex(phase?: MigrationSession['currentPhase']) {
  if (!phase) return 0;
  const index = PHASE_STEPS.findIndex((item) => item.key === phase);
  return index < 0 ? 0 : index;
}

function buildDiscoveryMessage(meta: MigrationProjectDiscoveryMeta | null) {
  if (!meta) {
    return '先通过 runtime 读取 Compose 项目，再使用平台工作目录做兜底扫描。';
  }

  const parts = [
    `runtime 已执行：${meta.runtimeTried ? '是' : '否'}`,
    `runtime 发现：${meta.runtimeFound} 个项目`,
    `工作目录：${meta.workdir || '-'}`,
    `工作目录存在：${meta.workdirExists ? '是' : '否'}`,
    `已执行兜底扫描：${meta.fallbackScanned ? '是' : '否'}`,
  ];
  return parts.join('，');
}

export function MigrationConsolePage() {
  const [form] = Form.useForm();
  const { selectedServer } = useAppData();
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [projects, setProjects] = useState<MigrationProject[]>([]);
  const [discoveryMeta, setDiscoveryMeta] = useState<MigrationProjectDiscoveryMeta | null>(null);
  const [manualProjectPath, setManualProjectPath] = useState('');
  const [inspectingProject, setInspectingProject] = useState(false);
  const [session, setSession] = useState<MigrationSession | null>(null);
  const [events, setEvents] = useState<MigrationEvent[]>([]);
  const [planning, setPlanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [downtimeConfirmed, setDowntimeConfirmed] = useState(false);
  const [approvedPaths, setApprovedPaths] = useState<string[]>([]);
  const eventAbortRef = useRef<AbortController | null>(null);

  const sourceEnvironmentId = Form.useWatch('sourceEnvironmentId', form);
  const targetEnvironmentId = Form.useWatch('targetEnvironmentId', form);
  const projectPath = Form.useWatch('projectPath', form);

  const sourceOptions = useMemo(
    () => environments.filter((environment) => environment.capabilities.modules?.docker),
    [environments],
  );
  const targetOptions = useMemo(
    () => environments.filter((environment) => environment.capabilities.modules?.migrateTarget && environment.id !== sourceEnvironmentId),
    [environments, sourceEnvironmentId],
  );
  const selectedSourceEnvironment = useMemo(
    () => environments.find((environment) => environment.id === sourceEnvironmentId) || null,
    [environments, sourceEnvironmentId],
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.path === projectPath || project.composePath === projectPath) || null,
    [projectPath, projects],
  );
  const latestLogs = useMemo(
    () => events.filter((event) => event.type !== 'heartbeat').slice(-120).reverse(),
    [events],
  );

  const loadEnvironments = async () => {
    const data = await requestJson<EnvironmentSummary[]>('/api/environments', { source: 'migration-console' });
    setEnvironments(data);
    const defaultSource = data.find((item) => item.id === selectedServer?.id && item.capabilities.modules?.docker)
      || data.find((item) => item.capabilities.modules?.docker);
    const defaultTarget = data.find((item) => item.capabilities.modules?.migrateTarget && item.id !== defaultSource?.id);
    form.setFieldsValue({
      sourceEnvironmentId: form.getFieldValue('sourceEnvironmentId') || defaultSource?.id,
      targetEnvironmentId: form.getFieldValue('targetEnvironmentId') || defaultTarget?.id,
    });
  };

  const loadProjects = async (environmentId: string) => {
    if (!environmentId) {
      setProjects([]);
      setDiscoveryMeta(null);
      return;
    }

    setLoadingProjects(true);
    try {
      const data = await requestJson<MigrationProjectListResponse>(`/api/migrate/projects?environmentId=${encodeURIComponent(environmentId)}`, {
        source: 'migration-console',
      });
      setProjects(data.projects);
      setDiscoveryMeta(data.discoveryMeta);
      const currentProjectPath = form.getFieldValue('projectPath');
      const nextProject = data.projects.find((item) => item.path === currentProjectPath || item.composePath === currentProjectPath) || data.projects[0];
      form.setFieldValue('projectPath', nextProject?.path || undefined);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    void loadEnvironments();
  }, []);

  useEffect(() => {
    if (sourceEnvironmentId) {
      void loadProjects(sourceEnvironmentId);
    }
  }, [sourceEnvironmentId]);

  useEffect(() => {
    if (!session?.id) return;
    eventAbortRef.current?.abort();
    const controller = new AbortController();
    eventAbortRef.current = controller;

    const consume = async () => {
      const response = await apiFetch(`/api/migrate/sessions/${session.id}/events`, {
        signal: controller.signal,
        source: 'migration-console',
      });
      const reader = response.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as MigrationEvent;
          if (event.type !== 'heartbeat') {
            setEvents((current) => {
              const key = `${event.ts}:${event.type}:${event.message || ''}`;
              const exists = current.some((item) => `${item.ts}:${item.type}:${item.message || ''}` === key);
              return exists ? current : [...current, event];
            });
          }
          if (event.meta?.session) {
            setSession(event.meta.session);
          }
        }
      }
    };

    void consume();
    return () => controller.abort();
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    setApprovedPaths(session.plan.externalBindMounts.filter((item) => item.approved).map((item) => item.path));
    setDowntimeConfirmed(session.approvals.downtimeConfirmed);
  }, [session?.id]);

  const handleInspectProject = async () => {
    if (!sourceEnvironmentId || !manualProjectPath.trim()) return;
    setInspectingProject(true);
    try {
      const project = await requestJson<MigrationProject>('/api/migrate/projects/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId: sourceEnvironmentId,
          projectPath: manualProjectPath.trim(),
        }),
        source: 'migration-console',
      });

      setProjects((current) => {
        const next = current.some((item) => item.path === project.path) ? current : [project, ...current];
        return next.sort((left, right) => left.name.localeCompare(right.name));
      });
      form.setFieldValue('projectPath', project.path);
      notifySuccess(`已校验并加入 Compose 项目：${project.name}`, 'migration-console');
    } finally {
      setInspectingProject(false);
    }
  };

  const handleGeneratePlan = async () => {
    const values = await form.validateFields();
    setPlanning(true);
    setEvents([]);
    try {
      const nextSession = await requestJson<MigrationSession>('/api/migrate/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        source: 'migration-console',
      });
      setSession(nextSession);
      setApprovedPaths(nextSession.plan.externalBindMounts.filter((item) => item.approved).map((item) => item.path));
      setDowntimeConfirmed(false);
      notifySuccess('迁移计划已生成。', 'migration-console');
    } finally {
      setPlanning(false);
    }
  };

  const handleStart = async () => {
    if (!session) return;
    setStarting(true);
    try {
      const nextSession = await requestJson<MigrationSession>(`/api/migrate/sessions/${session.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmDowntime: downtimeConfirmed,
          approvedExternalBindMounts: approvedPaths,
        }),
        source: 'migration-console',
      });
      setSession(nextSession);
      notifyInfo('迁移任务已启动。', 'migration-console');
    } finally {
      setStarting(false);
    }
  };

  const handleRollback = async () => {
    if (!session) return;
    setRollingBack(true);
    try {
      const nextSession = await requestJson<MigrationSession>(`/api/migrate/sessions/${session.id}/rollback`, {
        method: 'POST',
        source: 'migration-console',
      });
      setSession(nextSession);
      notifyInfo('已发起回滚。', 'migration-console');
    } finally {
      setRollingBack(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!session) return;
    const artifacts = await requestJson<MigrationArtifactsResponse>(`/api/migrate/sessions/${session.id}/artifacts`, {
      source: 'migration-console',
    });
    const blob = new Blob([JSON.stringify({ session, artifacts }, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `migration-report-${session.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const canStart = Boolean(
    session
      && session.blockingCount === 0
      && downtimeConfirmed
      && approvedPaths.length === session.plan.externalBindMounts.length,
  );

  return (
    <ModulePage
      extra={
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadEnvironments()}>
            刷新环境
          </Button>
          {session ? (
            <Button icon={<DownloadOutlined />} onClick={() => void handleDownloadReport()}>
              下载报告
            </Button>
          ) : null}
          {session?.status === 'completed' ? (
            <Button danger icon={<RollbackOutlined />} loading={rollingBack} onClick={() => void handleRollback()}>
              回滚
            </Button>
          ) : null}
          <Button type="primary" icon={<PlayCircleOutlined />} loading={starting} disabled={!canStart} onClick={() => void handleStart()}>
            开始迁移
          </Button>
        </Space>
      }
    >
      <SurfaceCard title="迁移对象选择">
        <Form form={form} layout="vertical">
          <div className="grid gap-4 lg:grid-cols-3">
            <Form.Item label="源环境" name="sourceEnvironmentId" rules={[{ required: true, message: '请选择源环境' }]}>
              <Select
                loading={!environments.length}
                options={sourceOptions.map((item) => ({
                  label: `${item.displayName} (${item.host})`,
                  value: item.id,
                }))}
              />
            </Form.Item>
            <Form.Item label="目标环境" name="targetEnvironmentId" rules={[{ required: true, message: '请选择目标环境' }]}>
              <Select
                options={targetOptions.map((item) => ({
                  label: `${item.displayName} (${item.host})`,
                  value: item.id,
                }))}
              />
            </Form.Item>
            <Form.Item label="Compose 项目" name="projectPath" rules={[{ required: true, message: '请选择 Compose 项目' }]}>
              <Select
                loading={loadingProjects}
                options={projects.map((item) => ({
                  label: `${item.name} · ${item.discoverySource === 'managed' ? '平台托管' : '文件系统'}`,
                  value: item.path,
                }))}
              />
            </Form.Item>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
            <Input
              value={manualProjectPath}
              onChange={(event) => setManualProjectPath(event.target.value)}
              placeholder="当自动发现为空时，手动输入 Compose 项目目录或 Compose 文件路径"
            />
            <Button icon={<SearchOutlined />} loading={inspectingProject} onClick={() => void handleInspectProject()} disabled={!sourceEnvironmentId || !manualProjectPath.trim()}>
              校验并加入项目列表
            </Button>
          </div>

          <Space className="mt-4">
            <Button type="primary" onClick={() => void handleGeneratePlan()} loading={planning}>
              生成迁移计划
            </Button>
          </Space>
        </Form>

        <Alert
          className="mt-4"
          type="info"
          showIcon
          message="项目发现逻辑"
          description={`${buildDiscoveryMessage(discoveryMeta)}。平台工作目录用于部署、迁移目标落盘和兜底扫描，不限制 Docker 的可见范围。`}
        />

        {!loadingProjects && sourceEnvironmentId && projects.length === 0 ? (
          <Alert
            className="mt-4"
            type="warning"
            showIcon
            message="当前没有发现 Compose 项目"
            description={discoveryMeta?.warnings.length ? discoveryMeta.warnings.join(' / ') : '可尝试手动输入 Compose 目录进行校验。'}
          />
        ) : null}

        {selectedProject?.warnings.length ? (
          <Alert
            className="mt-4"
            type="warning"
            showIcon
            message="项目警告"
            description={selectedProject.warnings.join(' / ')}
          />
        ) : null}
      </SurfaceCard>

      {session ? (
        <>
          <SurfaceCard title="迁移进度">
            <Steps current={getCurrentStepIndex(session.currentPhase)} items={PHASE_STEPS.map((item) => ({ title: item.label }))} />
            <div className="mt-4 grid gap-4 lg:grid-cols-4">
              <SurfaceCard size="small"><Statistic title="服务数" value={session.serviceCount} /></SurfaceCard>
              <SurfaceCard size="small"><Statistic title="命名卷" value={session.plan.namedVolumes.length} /></SurfaceCard>
              <SurfaceCard size="small"><Statistic title="外部目录" value={session.plan.externalBindMounts.length} /></SurfaceCard>
              <SurfaceCard size="small"><Statistic title="本地缓存需求" value={formatBytes(session.plan.diskRequirements.localSpoolBytes)} /></SurfaceCard>
            </div>
            <div className="mt-4">
              <Progress percent={session.progress.percent} status={session.status === 'failed' ? 'exception' : undefined} />
              <Typography.Text type="secondary">当前步骤：{session.currentStep}</Typography.Text>
            </div>
          </SurfaceCard>

          <SurfaceCard title="迁移计划摘要">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="项目名称">{session.projectName}</Descriptions.Item>
              <Descriptions.Item label="项目来源">{session.plan.sourceDiscovery === 'managed' ? '平台托管' : '文件系统'}</Descriptions.Item>
              <Descriptions.Item label="源项目目录">{session.projectPath}</Descriptions.Item>
              <Descriptions.Item label="目标项目目录">{session.plan.target.projectDir}</Descriptions.Item>
              <Descriptions.Item label="源 Compose">{session.composePath}</Descriptions.Item>
              <Descriptions.Item label="目标 Compose">{session.plan.target.composePath}</Descriptions.Item>
              <Descriptions.Item label="源 Docker / Compose">
                {session.plan.preflight.sourceDockerVersion || '-'} / {session.plan.preflight.sourceComposeVersion || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="目标 Docker / Compose">
                {session.plan.preflight.targetDockerVersion || '-'} / {session.plan.preflight.targetComposeVersion || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="停机策略">短暂停机切换</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={getStatusColor(session.status)}>{session.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </SurfaceCard>

          {session.blockingCount > 0 ? (
            <Alert
              type="error"
              showIcon
              message="当前迁移计划包含阻断项，暂时不能执行。"
              description={`阻断项数量：${session.blockingCount}`}
            />
          ) : null}

          {session.plan.risks.length > 0 ? (
            <SurfaceCard title="迁移风险">
              <List
                dataSource={session.plan.risks}
                renderItem={(item: MigrationRisk) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<Space><Tag color={item.blocking ? 'error' : item.level === 'high' ? 'warning' : 'default'}>{item.level}</Tag>{item.title}</Space>}
                      description={`${item.reason} 建议：${item.recommendation}`}
                    />
                  </List.Item>
                )}
              />
            </SurfaceCard>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <SurfaceCard title="不支持项与阻断项">
              {session.plan.unsupportedItems.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目没有发现不支持项。" />
              ) : (
                <Table
                  rowKey={(record) => `${record.kind}:${record.label}`}
                  pagination={false}
                  dataSource={session.plan.unsupportedItems}
                  columns={[
                    { title: '类型', dataIndex: 'kind', width: 140 },
                    { title: '对象', dataIndex: 'label' },
                    { title: '说明', dataIndex: 'reason' },
                    { title: '阻断', dataIndex: 'blocking', width: 100, render: (value: boolean) => <Tag color={value ? 'error' : 'default'}>{value ? '是' : '否'}</Tag> },
                  ]}
                />
              )}
            </SurfaceCard>

            <SurfaceCard title="外部绑定目录确认">
              {session.plan.externalBindMounts.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前项目没有项目外部目录需要确认。" />
              ) : (
                <Space direction="vertical" className="w-full">
                  <Checkbox.Group className="w-full" value={approvedPaths} onChange={(values) => setApprovedPaths(values as string[])}>
                    <Space direction="vertical" className="w-full">
                      {session.plan.externalBindMounts.map((item) => (
                        <Checkbox key={item.path} value={item.path}>
                          <div>
                            <Typography.Text strong>{item.path}</Typography.Text>
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                              服务：{item.serviceNames.join('、')}，预计大小：{formatBytes(item.bytes)}
                            </Typography.Paragraph>
                          </div>
                        </Checkbox>
                      ))}
                    </Space>
                  </Checkbox.Group>
                  <Alert type="warning" showIcon message="项目外目录不会默认放行，只有明确确认后才允许执行迁移。" />
                </Space>
              )}
            </SurfaceCard>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <SurfaceCard title="卷与镜像迁移摘要">
              <Table
                rowKey={(record) => record.name}
                pagination={false}
                dataSource={session.plan.namedVolumes}
                columns={[
                  { title: '命名卷', dataIndex: 'name' },
                  { title: '服务', dataIndex: 'serviceNames', render: (value: string[]) => value.join('、') },
                  { title: '预计大小', dataIndex: 'bytes', render: (value: number | null) => formatBytes(value) },
                ]}
              />
              <div className="mt-4" />
              <Table
                rowKey={(record) => `${record.service}:${record.image}`}
                pagination={false}
                dataSource={session.plan.imageTransfers}
                columns={[
                  { title: '服务', dataIndex: 'service' },
                  { title: '镜像', dataIndex: 'image' },
                  { title: '策略', dataIndex: 'strategy' },
                  { title: '说明', dataIndex: 'reason' },
                ]}
              />
            </SurfaceCard>

            <SurfaceCard title="执行确认">
              <Space direction="vertical" className="w-full" size={16}>
                <Alert type="info" showIcon message={session.plan.cutoverEstimate.summary} />
                <Checkbox checked={downtimeConfirmed} onChange={(event) => setDowntimeConfirmed(event.target.checked)}>
                  我已确认迁移执行会进入短暂停机窗口。
                </Checkbox>
                <Alert
                  type="success"
                  showIcon
                  message={`当前需要确认的外部目录数量：${session.plan.externalBindMounts.length}`}
                />
              </Space>
            </SurfaceCard>
          </div>

          <SurfaceCard title="执行日志">
            {latestLogs.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="计划已生成，执行后这里会持续展示迁移事件。" />
            ) : (
              <List
                dataSource={latestLogs}
                renderItem={(item: MigrationEvent) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space wrap>
                          <Tag color={item.level === 'error' ? 'error' : item.level === 'warn' ? 'warning' : item.level === 'success' ? 'success' : 'default'}>
                            {item.level || item.type}
                          </Tag>
                          <Typography.Text>{item.step || item.phase || item.type}</Typography.Text>
                          <Typography.Text type="secondary">{formatDateTime(item.ts)}</Typography.Text>
                        </Space>
                      }
                      description={item.message || '-'}
                    />
                  </List.Item>
                )}
              />
            )}
          </SurfaceCard>
        </>
      ) : null}
    </ModulePage>
  );
}
