import { SurfaceCard } from '@/src/components/common/SurfaceCard';
import { Col, Empty, Progress, Row, Statistic, Table, Typography } from 'antd';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { requestJson } from '../../lib/api';
import type { MonitorSnapshot } from '../../types';

type MetricPoint = {
  time: string;
  cpu: number;
  memory: number;
};

type MetricTrendCardProps = {
  serverId: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function MetricTrendCard({ serverId }: MetricTrendCardProps) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [history, setHistory] = useState<MetricPoint[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const nextSnapshot = await requestJson<MonitorSnapshot>(`/api/servers/${encodeURIComponent(serverId)}/metrics`, {
        source: '实时监控',
      });

      if (!mounted) return;

      setSnapshot(nextSnapshot);
      setHistory((current) => {
        const point = {
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          cpu: Number((nextSnapshot.cpu.load || 0).toFixed(1)),
          memory: Number((((nextSnapshot.memory.used || 0) / (nextSnapshot.memory.total || 1)) * 100).toFixed(1)),
        };

        return [...current, point].slice(-20);
      });
    };

    void load();
    const timer = window.setInterval(() => void load(), 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [serverId]);

  const memoryPercent = useMemo(
    () => ((snapshot?.memory.used || 0) / (snapshot?.memory.total || 1)) * 100,
    [snapshot],
  );

  if (!snapshot) {
    return <Empty description="暂无监控数据" />;
  }

  return (
    <div className="space-y-6">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title="CPU 使用率" value={snapshot.cpu.load} suffix="%" precision={1} />
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title="内存使用率" value={memoryPercent} suffix="%" precision={1} />
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title="网络延迟" value={snapshot.network.latency} suffix="ms" precision={0} />
          </SurfaceCard>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <SurfaceCard>
            <Statistic title="系统运行时长" value={Math.floor(snapshot.os.uptime / 3600)} suffix="小时" precision={0} />
          </SurfaceCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <SurfaceCard title="负载趋势">
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1677ff" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#1677ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="cpu" stroke="#1677ff" fill="url(#cpuFill)" />
                  <Area type="monotone" dataKey="memory" stroke="#22c55e" fill="url(#memoryFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SurfaceCard>
        </Col>
        <Col xs={24} xl={8}>
          <SurfaceCard title="资源摘要">
            <div className="space-y-4">
              <div>
                <Typography.Text type="secondary">CPU 型号</Typography.Text>
                <div>{snapshot.cpu.brand}</div>
              </div>
              <div>
                <Typography.Text type="secondary">采集范围</Typography.Text>
                <div>{snapshot.scope}</div>
              </div>
              <div>
                <Typography.Text type="secondary">内存占用</Typography.Text>
                <Progress percent={Number(memoryPercent.toFixed(1))} />
                <Typography.Text type="secondary">
                  {formatBytes(snapshot.memory.used)} / {formatBytes(snapshot.memory.total)}
                </Typography.Text>
              </div>
            </div>
          </SurfaceCard>
        </Col>
      </Row>

      <SurfaceCard title="磁盘挂载概览">
        <Table
          rowKey={(record) => `${record.fs}:${record.mount}`}
          pagination={false}
          dataSource={snapshot.disk}
          columns={[
            { title: '挂载点', dataIndex: 'mount' },
            { title: '文件系统', dataIndex: 'fs' },
            {
              title: '已用 / 总量',
              render: (_, record) => `${formatBytes(record.used)} / ${formatBytes(record.size)}`,
            },
            {
              title: '使用率',
              render: (_, record) => <Progress percent={Number((record.use || 0).toFixed(1))} size="small" />,
            },
          ]}
        />
      </SurfaceCard>
    </div>
  );
}



