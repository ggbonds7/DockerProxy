import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Network, Server, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SystemInfo {
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
        if (res.ok) {
          const data: SystemInfo = await res.json();
          setSysInfo(data);
          
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
          
          setHistory(prev => {
            const newHistory = [...prev, {
              time: timeStr,
              cpu: Number((data.cpu.load || 0).toFixed(1)),
              memory: Number((((data.memory.used || 0) / (data.memory.total || 1)) * 100).toFixed(1))
            }];
            // Keep last 20 data points
            if (newHistory.length > 20) {
              return newHistory.slice(newHistory.length - 20);
            }
            return newHistory;
          });
        }
      } catch (error) {
        console.error("Failed to fetch monitor data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [apiFetch]);

  if (loading && !sysInfo) {
    return (
      <div className="flex justify-center items-center h-64">
        <Activity className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!sysInfo) {
    return <div className="text-red-500">无法加载监控数据</div>;
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-500" />
          主机监控
        </h2>
        <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 bg-white dark:bg-[#1e1e2d] px-4 py-2 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
          <Server className="w-4 h-4" />
          {sysInfo.os.distro} {sysInfo.os.release}
          <span className="mx-2">|</span>
          <Clock className="w-4 h-4" />
          运行时间: {formatUptime(sysInfo.os.uptime)}
        </div>
      </div>

      {/* Top Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* CPU Card */}
        <div className="bg-white dark:bg-[#1e1e2d] rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Cpu className="w-4 h-4" /> CPU 使用率
            </h3>
            <span className={`text-sm font-semibold ${(sysInfo.cpu.load || 0) > 80 ? 'text-red-500' : (sysInfo.cpu.load || 0) > 50 ? 'text-yellow-500' : 'text-green-500'}`}>
              {(sysInfo.cpu.load || 0).toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 mb-2">
            <div className={`h-2.5 rounded-full ${(sysInfo.cpu.load || 0) > 80 ? 'bg-red-500' : (sysInfo.cpu.load || 0) > 50 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min((sysInfo.cpu.load || 0), 100)}%` }}></div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 truncate" title={`${sysInfo.cpu.manufacturer} ${sysInfo.cpu.brand}`}>
            {sysInfo.cpu.cores} 核心 | {sysInfo.cpu.brand}
          </div>
        </div>

        {/* Memory Card */}
        <div className="bg-white dark:bg-[#1e1e2d] rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4" /> 内存使用率
            </h3>
            <span className={`text-sm font-semibold ${((sysInfo.memory.used || 0) / (sysInfo.memory.total || 1)) * 100 > 80 ? 'text-red-500' : 'text-blue-500'}`}>
              {(((sysInfo.memory.used || 0) / (sysInfo.memory.total || 1)) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 mb-2">
            <div className={`h-2.5 rounded-full ${((sysInfo.memory.used || 0) / (sysInfo.memory.total || 1)) * 100 > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(((sysInfo.memory.used || 0) / (sysInfo.memory.total || 1)) * 100, 100)}%` }}></div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {formatBytes(sysInfo.memory.used)} / {formatBytes(sysInfo.memory.total)}
          </div>
        </div>

        {/* Network Card */}
        <div className="bg-white dark:bg-[#1e1e2d] rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Network className="w-4 h-4" /> 网络状态
            </h3>
            <span className={`text-sm font-semibold ${(sysInfo.network.latency || 0) > 100 ? 'text-yellow-500' : 'text-green-500'}`}>
              {(sysInfo.network.latency || 0).toFixed(0)} ms
            </span>
          </div>
          <div className="flex justify-between items-center mt-4">
            <div className="text-xs">
              <div className="text-slate-500 dark:text-slate-400 mb-1">下载 (RX)</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">{formatBytes(sysInfo.network.rx_sec)}/s</div>
            </div>
            <div className="text-xs text-right">
              <div className="text-slate-500 dark:text-slate-400 mb-1">上传 (TX)</div>
              <div className="font-semibold text-slate-800 dark:text-slate-200">{formatBytes(sysInfo.network.tx_sec)}/s</div>
            </div>
          </div>
        </div>

        {/* Disk Card */}
        <div className="bg-white dark:bg-[#1e1e2d] rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <HardDrive className="w-4 h-4" /> 磁盘使用率 (根目录)
            </h3>
            {sysInfo.disk.filter(d => d.mount === '/').map((d, i) => (
              <span key={i} className={`text-sm font-semibold ${(d.use || 0) > 80 ? 'text-red-500' : 'text-purple-500'}`}>
                {(d.use || 0).toFixed(1)}%
              </span>
            ))}
          </div>
          {sysInfo.disk.filter(d => d.mount === '/').map((d, i) => (
            <div key={i}>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 mb-2">
                <div className={`h-2.5 rounded-full ${(d.use || 0) > 80 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${Math.min((d.use || 0), 100)}%` }}></div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                {formatBytes(d.used)} / {formatBytes(d.size)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="bg-white dark:bg-[#1e1e2d] rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-6">实时负载趋势</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e1e2d', borderColor: '#333', color: '#fff', borderRadius: '8px' }}
                itemStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="cpu" name="CPU" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
              <Area type="monotone" dataKey="memory" name="内存" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorMemory)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
