import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Select, Space, Table, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { ModulePage } from '../../components/common/ModulePage';
import { ServerContextCard } from '../../components/common/ServerContextCard';
import { useAppData } from '../../contexts/AppDataContext';
import { requestJson } from '../../lib/api';
import { formatDateTime, getStatusColor, summarizeMetadata } from '../../lib/format';
import type { JobSummary } from '../../types';

export function JobQueuePage() {
  const { selectedServer } = useAppData();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<JobSummary | null>(null);

  const loadJobs = async () => {
    if (!selectedServer) return;
    setLoading(true);
    try {
      const data = await requestJson<JobSummary[]>(`/api/jobs?serverId=${encodeURIComponent(selectedServer.id)}`, {
        source: '任务队列',
      });
      setJobs(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, [selectedServer?.id]);

  const filteredJobs = useMemo(
    () => (statusFilter === 'all' ? jobs : jobs.filter((job) => job.status === statusFilter)),
    [jobs, statusFilter],
  );

  return (
    <ModulePage
      extra={
        <Space>
          <Select
            value={statusFilter}
            style={{ minWidth: 160 }}
            onChange={setStatusFilter}
            options={[
              { label: '全部状态', value: 'all' },
              ...Array.from(new Set(jobs.map((job) => job.status))).map((status) => ({ label: status, value: status })),
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadJobs()} loading={loading}>
            刷新任务
          </Button>
        </Space>
      }
    >
      <ServerContextCard title="任务上下文" description="统一查看当前服务器上的部署、迁移和系统作业。" />

      <SurfaceCard title="后台任务队列">
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredJobs}
          onRow={(record) => ({ onClick: () => setSelectedJob(record) })}
          columns={[
            { title: '任务类型', dataIndex: 'kind' },
            { title: '摘要', render: (_, record) => summarizeMetadata(record.metadata) },
            { title: '来源', dataIndex: 'source', render: (value) => <Tag>{value}</Tag> },
            { title: '状态', dataIndex: 'status', render: (value) => <Tag color={getStatusColor(value)}>{value}</Tag> },
            { title: '更新时间', dataIndex: 'updatedAt', render: (value) => formatDateTime(value) },
          ]}
        />
      </SurfaceCard>

      <Drawer title="任务详情" open={Boolean(selectedJob)} onClose={() => setSelectedJob(null)} width={520}>
        {selectedJob && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="任务 ID">{selectedJob.id}</Descriptions.Item>
            <Descriptions.Item label="类型">{selectedJob.kind}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={getStatusColor(selectedJob.status)}>{selectedJob.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="来源类型">{selectedJob.source}</Descriptions.Item>
            <Descriptions.Item label="源环境">{selectedJob.sourceServerId || '-'}</Descriptions.Item>
            <Descriptions.Item label="目标环境">{selectedJob.targetServerId || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDateTime(selectedJob.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTime(selectedJob.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label="Metadata">
              <pre className="overflow-auto rounded-xl bg-slate-50 p-4 text-xs dark:bg-slate-950">{JSON.stringify(selectedJob.metadata, null, 2)}</pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </ModulePage>
  );
}



