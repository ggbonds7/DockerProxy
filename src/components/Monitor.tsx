import React, { useEffect, useState } from 'react';
import { Activity, Clock, Server } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, Notice, PageHeader, StatCard } from './ui/primitives';

interface SystemInfo {
  scope: 'host' | 'runtime';
  collector: 'docker-host-helper' | 'systeminformation';
  warning?: string;
  cpu: {
    manufacturer: string;
    brand: string;
    cores: number;
    load: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
  };
  os: {
    platform: string;
    distro: string;
    release: string;
    uptime: number;
  };
  disk: Array<{
    fs: string;
    size: number;
    used: number;
    use: number;
    mount: string;
  }>;
  network: {
    latency: number;
    rx_sec: number;
    tx_sec: number;
  };
}

interface HistoryData {
  time: string;
  cpu: number;
  memory: number;
}

export function Monitor({ apiFetch }: { apiFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [history, setHistory] = useState<HistoryData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiFetch('/api/monitor');
        if (!res.ok) return;

        const data: SystemInfo = await res.json();
        setSysInfo(data);

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

        setHistory((previous) => {
          const next = [
            ...previous,
            {
              time: timeStr,
              cpu: Number((data.cpu.load || 0).toFixed(1)),
              memory: Number((((data.memory.used || 0) / (data.memory.total || 1)) * 100).toFixed(1)),
            },
          ];
          return next.length > 20 ? next.slice(next.length - 20) : next;
        });
      } catch (error) {
        console.error('Failed to fetch monitor data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [apiFetch]);

  if (loading && !sysInfo) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-[var(--brand-500)]" />
      </div>
    );
  }

  if (!sysInfo) {
    return (
      <EmptyState
        icon={Activity}
        title="无法加载监控数据"
        description="监控接口暂时不可用，请检查 Docker helper 或运行环境采集服务。"
      />
    );
  }

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}天 ${h}小时 ${m}分钟`;
  };

  const memoryPercent = ((sysInfo.memory.used || 0) / (sysInfo.memory.total || 1)) * 100;
  const rootDisk = sysInfo.disk.find((disk) => disk.mount === '/');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        icon={Activity}
        title="主机监控"
        description={`当前采集范围：${sysInfo.scope === 'host' ? '宿主机视角' : '应用运行环境视角'}，采集方式：${sysInfo.collector === 'docker-host-helper' ? '宿主机 helper' : 'systeminformation'}`}
        actions={
          <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] px-4 py-2 text-sm text-[color:var(--text-tertiary)]">
            <Server className="h-4 w-4" />
            {sysInfo.os.distro} {sysInfo.os.release}
            <span className="mx-2">|</span>
            <Clock className="h-4 w-4" />
            运行时间: {formatUptime(sysInfo.os.uptime)}
          </div>
        }
      />

      {sysInfo.warning && <Notice tone="warning">{sysInfo.warning}</Notice>}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="CPU" value={`${(sysInfo.cpu.load || 0).toFixed(1)}%`} detail={`${sysInfo.cpu.cores} 核心 · ${sysInfo.cpu.brand}`} />
        <StatCard label="内存" value={`${memoryPercent.toFixed(1)}%`} detail={`${formatBytes(sysInfo.memory.used)} / ${formatBytes(sysInfo.memory.total)}`} />
        <StatCard label="网络延迟" value={`${(sysInfo.network.latency || 0).toFixed(0)} ms`} detail={`RX ${formatBytes(sysInfo.network.rx_sec)}/s · TX ${formatBytes(sysInfo.network.tx_sec)}/s`} />
        <StatCard
          label="根目录磁盘"
          value={`${(rootDisk?.use || 0).toFixed(1)}%`}
          detail={rootDisk ? `${formatBytes(rootDisk.used)} / ${formatBytes(rootDisk.size)}` : '未检测到根目录'}
        />
      </div>

      <Card title="实时负载趋势" subtitle="持续采样 CPU 与内存使用率，方便观察峰值和抖动。">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', borderColor: '#334155', color: '#fff', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
              <Area type="monotone" dataKey="memory" name="内存" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorMemory)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="磁盘挂载概览" subtitle="按挂载点显示空间占用情况。">
        <div className="space-y-3">
          {sysInfo.disk.map((disk) => (
            <div key={`${disk.fs}-${disk.mount}`} className="rounded-lg border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[color:var(--text-primary)]">{disk.mount}</p>
                  <p className="text-xs text-[color:var(--text-tertiary)]">{disk.fs}</p>
                </div>
                <span className="text-sm font-semibold text-[color:var(--text-primary)]">{(disk.use || 0).toFixed(1)}%</span>
              </div>
              <div className="mt-3 h-2.5 w-full rounded-full bg-[var(--surface-soft)]">
                <div className="h-2.5 rounded-full bg-purple-500" style={{ width: `${Math.min(disk.use || 0, 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-[color:var(--text-tertiary)]">
                {formatBytes(disk.used)} / {formatBytes(disk.size)}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
