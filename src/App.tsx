import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Globe, FileCode, Network, ShieldCheck, Settings, Play, Square, RotateCcw, Trash2, Terminal, Plus, Save, RefreshCw, ExternalLink, ChevronRight, Activity, AlertCircle, CheckCircle2, Edit3, Search, Truck, Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { ContainerInfo, ProxyRoute, DNSRecord, AppConfig, Certificate } from './types';
import { Monitor } from './components/Monitor';
import { MigrationConsole } from './components/MigrationConsole';
import { Badge, Button, Card, Checkbox, EmptyState, Field, IconButton, Input, Notice, PageHeader, PaginationControls, Select, StatCard, Textarea, ThemeSwitch } from './components/ui/primitives';
import { useTheme } from './hooks/useTheme';

// 统一的 fetch 封装，自动携带 token
export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // 触发一个自定义事件，让 App 组件处理登出
    window.dispatchEvent(new Event('auth-unauthorized'));
  }
  return res;
};

// --- 通用 UI 组件 ---

// 侧边栏导航项组件
const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
      active 
        ? "bg-[var(--brand-600)] text-white shadow-[0_16px_28px_-22px_var(--brand-600)]"
        : "text-[color:var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[color:var(--text-primary)]"
    )}
  >
    <Icon className={cn("w-5 h-5", active ? "text-white" : "text-[color:var(--text-tertiary)] group-hover:text-[var(--brand-500)]")} />
    {label}
  </button>
);

// --- 核心功能视图模块 ---

// 1. Docker 容器管理视图
const DockerView = () => {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  // 获取所有容器列表
  const fetchContainers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/docker/containers');
      const data = await res.json();
      setContainers(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchText, statusFilter, pageSize, containers.length]);

  // 执行容器操作 (启动/停止/重启/删除)
  const handleAction = async (id: string, action: string) => {
    try {
      await apiFetch(`/api/docker/container/${id}/${action}`, { method: 'POST' });
      fetchContainers();
    } catch (e) {
      console.error(e);
    }
  };

  // 查看容器日志
  const viewLogs = async (id: string) => {
    try {
      const res = await apiFetch(`/api/docker/container/${id}/logs`);
      const text = await res.text();
      setLogs(text);
    } catch (e) {
      console.error(e);
    }
  };

  const matchesContainer = (container: ContainerInfo) => {
    const normalizedQuery = searchText.trim().toLowerCase();
    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'running' ? container.state === 'running' : container.state !== 'running');
    if (!matchesStatus) return false;
    if (!normalizedQuery) return true;
    const haystack = [container.name, container.image, container.composeProject, container.composeService, container.status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  };

  const composeGroupMap = new Map<
    string,
    {
      project: string;
      containers: ContainerInfo[];
      matchingContainers: ContainerInfo[];
    }
  >();
  const standaloneContainers: ContainerInfo[] = [];

  containers.forEach((container) => {
    if (container.sourceKind === 'compose-project' && container.composeProject) {
      const current = composeGroupMap.get(container.composeProject) || {
        project: container.composeProject,
        containers: [],
        matchingContainers: [],
      };
      current.containers.push(container);
      if (matchesContainer(container)) {
        current.matchingContainers.push(container);
      }
      composeGroupMap.set(container.composeProject, current);
      return;
    }

    if (matchesContainer(container)) {
      standaloneContainers.push(container);
    }
  });

  const composeGroups = Array.from(composeGroupMap.values())
    .filter((group) => {
      if (group.matchingContainers.length > 0) return true;
      return group.project.toLowerCase().includes(searchText.trim().toLowerCase());
    })
    .sort((left, right) => left.project.localeCompare(right.project));

  const topLevelItems = [
    ...composeGroups.map((group) => ({ type: 'compose' as const, key: `compose:${group.project}`, group })),
    ...standaloneContainers
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((container) => ({ type: 'container' as const, key: `container:${container.id}`, container })),
  ];

  const totalPages = Math.max(Math.ceil(topLevelItems.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedItems = topLevelItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const runningContainers = containers.filter((container) => container.state === 'running').length;
  const composeProjectCount = composeGroups.length;
  const standaloneCount = standaloneContainers.length;

  const toggleProject = (projectName: string) => {
    setExpandedProjects((current) => ({
      ...current,
      [projectName]: !current[projectName],
    }));
  };

  const renderContainerActions = (container: ContainerInfo) => (
    <div className="flex items-center justify-end gap-2">
      <IconButton onClick={() => viewLogs(container.id)} title="查看日志">
        <Terminal className="w-4 h-4" />
      </IconButton>
      {container.state === 'running' ? (
        <IconButton onClick={() => handleAction(container.id, 'stop')} title="停止" variant="danger">
          <Square className="w-4 h-4" />
        </IconButton>
      ) : (
        <IconButton onClick={() => handleAction(container.id, 'start')} title="启动" variant="success">
          <Play className="w-4 h-4" />
        </IconButton>
      )}
      <IconButton onClick={() => handleAction(container.id, 'restart')} title="重启" variant="warning">
        <RotateCcw className="w-4 h-4" />
      </IconButton>
      <IconButton onClick={() => handleAction(container.id, 'remove')} title="删除" variant="danger">
        <Trash2 className="w-4 h-4" />
      </IconButton>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="容器管理"
        description="Compose 项目按项目折叠展示，独立容器按单项展示；所有筛选与分页都作用于顶层列表。"
        actions={
          <Button onClick={fetchContainers}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新状态
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="运行中容器" value={String(runningContainers)} detail={`总计 ${containers.length} 个容器`} />
        <StatCard label="Compose 项目" value={String(composeProjectCount)} detail="按项目聚合显示" />
        <StatCard label="独立容器" value={String(standaloneCount)} detail="按单容器直接操作" />
      </div>

      <Card title="容器列表">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4 lg:grid-cols-[minmax(0,1.4fr)_220px_180px]">
            <Field label="搜索范围" hint="项目名 / 容器名 / 镜像 / 服务名">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="搜索项目名、容器名、镜像或服务名"
                  className="pl-10"
                />
              </div>
            </Field>
            <Field label="状态">
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'running' | 'stopped')}>
                <option value="all">全部状态</option>
                <option value="running">仅运行中</option>
                <option value="stopped">仅已停止</option>
              </Select>
            </Field>
            <Field label="每页数量">
              <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value="5">每页 5 条</option>
                <option value="8">每页 8 条</option>
                <option value="12">每页 12 条</option>
              </Select>
            </Field>
          </div>

          <div className="space-y-3">
            {pagedItems.map((item) => {
              if (item.type === 'compose') {
                const isExpanded = expandedProjects[item.group.project] ?? true;
                const runningCount = item.group.containers.filter((container) => container.state === 'running').length;
                return (
                  <div key={item.key} className="overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                    <button
                      onClick={() => toggleProject(item.group.project)}
                      className="flex w-full items-center justify-between gap-4 bg-[var(--surface-soft)] px-5 py-4 text-left transition hover:bg-[var(--surface-subtle)]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <ChevronRight className={cn('h-4 w-4 text-[color:var(--text-tertiary)] transition-transform', isExpanded && 'rotate-90')} />
                          <span className="font-semibold text-[color:var(--text-primary)]">{item.group.project}</span>
                          <Badge variant="default">Compose 项目</Badge>
                          <Badge variant="success">{runningCount}/{item.group.containers.length} 运行中</Badge>
                          <Badge variant="warning">{item.group.containers.length} 个容器</Badge>
                        </div>
                        <p className="mt-2 text-sm text-[color:var(--text-tertiary)]">
                          {item.group.matchingContainers.length === item.group.containers.length
                            ? '当前筛选命中整个项目'
                            : `当前筛选命中 ${item.group.matchingContainers.length} 个容器`}
                        </p>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="divide-y divide-[color:var(--border-subtle)]">
                        {(item.group.matchingContainers.length > 0 ? item.group.matchingContainers : item.group.containers).map((container) => (
                          <div key={container.id} className="px-5 py-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_160px_220px] gap-4 items-center">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[color:var(--text-primary)]">{container.name}</p>
                              <p className="mt-1 truncate text-sm text-[color:var(--text-tertiary)]">
                                服务：{container.composeService || '-'}
                              </p>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm text-[color:var(--text-primary)]">{container.image}</p>
                              <p className="mt-1 truncate text-xs text-[color:var(--text-tertiary)]">
                                端口：{container.ports.length > 0 ? container.ports.join(', ') : '无暴露端口'}
                              </p>
                            </div>
                            <div>
                              <Badge variant={container.state === 'running' ? 'success' : 'danger'}>{container.state}</Badge>
                              <p className="mt-2 text-xs text-[color:var(--text-tertiary)]">{container.status}</p>
                            </div>
                            {renderContainerActions(container)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const container = item.container;
              return (
                <div key={item.key} className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] px-5 py-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_160px_220px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="truncate font-semibold text-[color:var(--text-primary)]">{container.name}</p>
                      <Badge variant="default">独立容器</Badge>
                    </div>
                    <p className="mt-2 text-xs text-[color:var(--text-tertiary)]">{container.id}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[color:var(--text-primary)]">{container.image}</p>
                    <p className="mt-1 truncate text-xs text-[color:var(--text-tertiary)]">
                      端口：{container.ports.length > 0 ? container.ports.join(', ') : '无暴露端口'}
                    </p>
                  </div>
                  <div>
                    <Badge variant={container.state === 'running' ? 'success' : 'danger'}>{container.state}</Badge>
                    <p className="mt-2 text-xs text-[color:var(--text-tertiary)]">{container.status}</p>
                  </div>
                  {renderContainerActions(container)}
                </div>
              );
            })}

            {topLevelItems.length === 0 && !loading && (
              <div className="rounded-2xl border border-dashed border-[color:var(--border-strong)] py-12 text-center text-[color:var(--text-tertiary)]">
                当前筛选条件下没有匹配的 Compose 项目或独立容器
              </div>
            )}
          </div>

          <PaginationControls
            page={currentPage}
            totalPages={totalPages}
            totalItems={topLevelItems.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      </Card>

      {/* 日志弹窗 */}
      <AnimatePresence>
        {logs && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,6,23,0.58)] p-6 backdrop-blur-sm"
          >
            <div className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-[1.75rem] border border-[color:var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] px-6 py-4">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-[color:var(--text-primary)]">
                  <Terminal className="h-5 w-5 text-[var(--brand-500)]" />
                  容器日志
                </h3>
                <IconButton onClick={() => setLogs(null)} title="关闭日志">
                  <Trash2 className="h-5 w-5" />
                </IconButton>
              </div>
              <div
                className="flex-1 overflow-auto p-6 font-mono text-sm"
                style={{
                  backgroundColor: 'var(--console-bg)',
                  color: 'var(--console-text)',
                }}
              >
                <pre className="whitespace-pre-wrap">{logs}</pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// 2. DNS 代理视图 (Cloudflare)
const DNSView = ({ config }: { config: AppConfig | null }) => {
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [newRecord, setNewRecord] = useState({ name: '', content: config?.vpsIp || '', type: 'A', proxied: config?.cfProxied || false, domain: '' });

  const [availableZones, setAvailableZones] = useState<{id: string, name: string}[]>([]);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [proxyFilter, setProxyFilter] = useState<'all' | 'proxied' | 'dns-only'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 初始化获取可用域名
  useEffect(() => {
    if (config?.hasCfToken) {
      const fetchZones = async () => {
        try {
          const res = await apiFetch('/api/dns/zones');
          const data = await res.json();
          if (res.ok) {
            setAvailableZones(data.zones || []);
            setIsFallbackMode(data.isFallbackMode || false);
            if (data.zones && data.zones.length > 0) {
              setSelectedDomain(data.zones[0].name);
            }
          }
        } catch (e) {
          console.error("Failed to fetch zones", e);
        } finally {
          setZonesLoaded(true);
        }
      };
      fetchZones();
    }
  }, [config?.hasCfToken]);

  // 获取指定域名的 DNS 记录
  const fetchRecords = async () => {
    if (!selectedDomain) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/dns/records?domain=${selectedDomain}`);
      const data = await res.json();
      if (res.ok) {
        setRecords(Array.isArray(data) ? data : []);
      } else {
        console.error("DNS Fetch Error:", data);
        alert(`获取 DNS 记录失败: ${data.error}\n详情: ${JSON.stringify(data.details || '')}`);
        setRecords([]);
      }
    } catch (e) {
      console.error(e);
      alert("网络请求失败，请查看控制台");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (config?.hasCfToken && selectedDomain) {
      fetchRecords();
    }
  }, [config, selectedDomain]);

  useEffect(() => {
    setPage(1);
  }, [searchText, typeFilter, proxyFilter, pageSize, selectedDomain, records.length]);

  // 保存或更新 DNS 记录
  const handleSave = async () => {
    try {
      const url = editingId ? `/api/dns/records/${editingId}` : '/api/dns/records';
      const method = editingId ? 'PUT' : 'POST';
      const payload = { ...newRecord, domain: selectedDomain };
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowAdd(false);
        setEditingId(null);
        setNewRecord({ name: '', content: config?.vpsIp || '', type: 'A', proxied: config?.cfProxied || false, domain: '' });
        fetchRecords();
      } else {
        const data = await res.json();
        alert(data.error || '保存记录失败');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 编辑记录
  const handleEdit = (record: DNSRecord) => {
    setNewRecord({ name: record.name, content: record.content, type: record.type, proxied: record.proxied, domain: selectedDomain });
    setEditingId(record.id);
    setShowAdd(true);
  };

  // 删除记录
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条 DNS 记录吗？')) return;
    try {
      await apiFetch(`/api/dns/records/${id}?domain=${selectedDomain}`, { method: 'DELETE' });
      fetchRecords();
    } catch (e) {
      console.error(e);
    }
  };

  // 如果未配置 CF Token，显示提示信息
  if (!config?.hasCfToken) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={Globe}
          title="DNS 代理模块"
          description="统一管理 Cloudflare DNS 记录与代理状态。"
        />
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="未配置 Cloudflare"
            description="请先在 .env 中配置 CF_API_TOKEN，保存后再进入 DNS 代理模块。"
          />
        </Card>
      </div>
    );
  }

  const filteredRecords = records.filter((record) => {
    const normalizedQuery = searchText.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      [record.name, record.content, record.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    const matchesType = typeFilter === 'all' || record.type === typeFilter;
    const matchesProxy =
      proxyFilter === 'all' || (proxyFilter === 'proxied' ? record.proxied : !record.proxied);
    return matchesQuery && matchesType && matchesProxy;
  });

  const typeOptions = Array.from(new Set(records.map((record) => record.type))).sort();
  const totalPages = Math.max(Math.ceil(filteredRecords.length / pageSize), 1);
  const currentPage = Math.min(page, totalPages);
  const pagedRecords = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      {isFallbackMode && (
        <Notice tone="warning" title="降级告警：未获取到完整 Zone 读取权限">
          当前 Token 缺乏全局的 Zone:Read 权限，域名列表仅能使用 `ALLOWED_DOMAINS` 兜底展示。后台仍绑定 `CF_ZONE_ID`，如果下拉选择了不匹配的域名，可能触发 403 / 404。
        </Notice>
      )}

      <PageHeader
        icon={Globe}
        title="DNS 代理模块"
        description="支持按域名切换、分页浏览、快速筛选和代理状态编辑。"
        actions={
          <div className="grid w-full gap-3 md:w-auto md:min-w-[420px] md:grid-cols-[minmax(0,260px)_auto_auto] md:items-center">
            {availableZones && availableZones.length > 0 && (
              <Select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className={cn("w-full min-w-0", availableZones.length <= 1 && "cursor-not-allowed opacity-70")}
                disabled={availableZones.length <= 1}
              >
                {availableZones.map((z) => (
                  <option key={z.name} value={z.name}>{z.name}</option>
                ))}
              </Select>
            )}
            <div className="flex items-center justify-end md:justify-center">
              <IconButton onClick={fetchRecords} title="刷新 DNS 记录">
                <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
              </IconButton>
            </div>
            <Button
              className="justify-center"
              onClick={() => {
                setEditingId(null);
                setNewRecord({ name: '', content: config?.vpsIp || '', type: 'A', proxied: config?.cfProxied || false, domain: selectedDomain });
                setShowAdd(true);
              }}
            >
              <Plus className="w-4 h-4" />
              添加记录
            </Button>
          </div>
        }
      />

      {/* 添加/编辑表单 */}
      {showAdd && (
        <Card title={editingId ? "编辑 DNS 记录" : "添加 DNS 记录"} subtitle="变更会直接写入当前所选 Zone。">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
            <Field label="记录类型">
              <Select
                value={newRecord.type}
                onChange={(e) => setNewRecord({...newRecord, type: e.target.value})}
              >
                <option value="A">A</option>
                <option value="CNAME">CNAME</option>
                <option value="TXT">TXT</option>
              </Select>
            </Field>
            <Field label="名称 (Name)">
              <Input
                type="text" 
                value={newRecord.name}
                onChange={(e) => setNewRecord({...newRecord, name: e.target.value})}
                placeholder="subdomain"
              />
            </Field>
            <Field label="内容 (Content)">
              <Input
                type="text" 
                value={newRecord.content}
                onChange={(e) => setNewRecord({...newRecord, content: e.target.value})}
                placeholder="1.2.3.4"
              />
            </Field>
            <Field label="代理状态" hint="Cloudflare 云朵开关">
              <label className="mt-3 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
                <Checkbox
                  type="checkbox" 
                  id="proxied" 
                  checked={newRecord.proxied}
                  onChange={(e) => setNewRecord({...newRecord, proxied: e.target.checked})}
                />
                <span>Proxied (云朵开启)</span>
              </label>
            </Field>
          </div>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowAdd(false); setEditingId(null); }} variant="ghost">取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        </Card>
      )}

      {/* 记录列表 */}
      <Card title="记录列表" subtitle="支持按名称、内容、类型和代理状态筛选，并按页查看当前域名下的 DNS 记录。">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4 md:grid-cols-[minmax(0,1fr)_160px_180px_160px]">
            <Field label="搜索">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-tertiary)]" />
                <Input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder="搜索名称、内容或类型"
                  className="pl-10"
                />
              </div>
            </Field>
            <Field label="类型">
              <Select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">全部类型</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="代理状态">
              <Select value={proxyFilter} onChange={(event) => setProxyFilter(event.target.value as 'all' | 'proxied' | 'dns-only')}>
                <option value="all">全部代理状态</option>
                <option value="proxied">仅 Proxied</option>
                <option value="dns-only">仅 DNS Only</option>
              </Select>
            </Field>
            <Field label="每页数量">
              <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value="10">每页 10 条</option>
                <option value="20">每页 20 条</option>
                <option value="50">每页 50 条</option>
              </Select>
            </Field>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-sm text-[color:var(--text-tertiary)] border-b border-[color:var(--border-subtle)]">
                <th className="pb-4 font-medium">类型</th>
                <th className="pb-4 font-medium">名称</th>
                <th className="pb-4 font-medium">内容</th>
                <th className="pb-4 font-medium">代理状态</th>
                <th className="pb-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-subtle)]">
              {pagedRecords.map((r) => (
                <tr key={r.id} className="group hover:bg-[var(--surface-soft)]/50">
                  <td className="py-4 font-medium text-[var(--brand-500)]">{r.type}</td>
                  <td className="py-4 max-w-[150px] truncate text-[color:var(--text-primary)]" title={r.name}>{r.name}</td>
                  <td className="py-4 max-w-xs truncate text-sm text-[color:var(--text-tertiary)]" title={r.content}>{r.content}</td>
                  <td className="py-4">
                    <Badge variant={r.proxied ? 'warning' : 'default'}>
                      {r.proxied ? 'Proxied' : 'DNS Only'}
                    </Badge>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <IconButton onClick={() => handleEdit(r)} title="编辑">
                        <Edit3 className="w-4 h-4" />
                      </IconButton>
                      <IconButton onClick={() => handleDelete(r.id)} title="删除" variant="danger">
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRecords.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[color:var(--text-tertiary)]">
                    当前筛选条件下未找到 DNS 记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <PaginationControls
            page={currentPage}
            totalPages={totalPages}
            totalItems={filteredRecords.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      </Card>
    </div>
  );
};

// 3. 部署服务视图 (Docker Compose)
const ComposeView = () => {
  const [imageName, setImageName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [containerPort, setContainerPort] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [yaml, setYaml] = useState(`version: '3.8'
services:
  web:
    image: nginx:latest
    container_name: web
    restart: unless-stopped
    expose:
      - "80"
    networks:
      - proxy_net

networks:
  proxy_net:
    external: true
    name: proxy_net`);

  // 自动根据镜像名生成服务名
  useEffect(() => {
    if (imageName && !serviceName) {
      const name = imageName.split(':')[0].split('/').pop() || '';
      setServiceName(name.replace(/[^a-zA-Z0-9_-]/g, ''));
    }
  }, [imageName]);

  // 生成 Compose 模板
  const handleGenerate = async () => {
    if (!imageName.trim() || !serviceName.trim() || !containerPort.trim()) {
      alert("请填写镜像名、服务名和容器端口");
      return;
    }
    
    setIsGenerating(true);
    try {
      const composeObj = {
        services: {
          [serviceName]: {
            image: imageName,
            container_name: serviceName,
            restart: "unless-stopped",
            expose: [containerPort],
            networks: ["proxy_net"]
          }
        },
        networks: {
          proxy_net: {
            external: true,
            name: "proxy_net"
          }
        }
      };

      // 简单地将对象转为 YAML 字符串
      const yamlStr = [
        `version: '3.8'`,
        `services:`,
        `  ${serviceName}:`,
        `    image: ${imageName}`,
        `    container_name: ${serviceName}`,
        `    restart: unless-stopped`,
        `    expose:`,
        `      - "${containerPort}"`,
        `    networks:`,
        `      - proxy_net`,
        ``,
        `networks:`,
        `  proxy_net:`,
        `    external: true`,
        `    name: proxy_net`
      ].join('\n');
      
      setYaml(yamlStr);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  // 部署 Compose 配置
  const handleDeploy = async () => {
    try {
      const res = await apiFetch('/api/deploy/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: serviceName || 'new-service', composeYaml: yaml, remarks })
      });
      const data = await res.json();
      alert(data.message || data.error);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileCode}
        title="部署 Docker 项目"
        description="输入镜像、服务名和端口后快速生成 Compose 配置，再进行在线编辑与部署。"
        actions={
          <Button onClick={handleDeploy} variant="success" size="lg">
            <Play className="w-4 h-4" />
            立即部署
          </Button>
        }
      />

      <Card title="项目配置" subtitle="填写基本信息生成推荐的 Compose 配置，包含 proxy_net 网络以便 Nginx 代理">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Field label="镜像名 (Image)">
            <Input
              type="text" 
              value={imageName}
              onChange={(e) => setImageName(e.target.value)}
              placeholder="例如: nginx:latest, ghcr.io/komari-monitor/komari:latest"
            />
          </Field>
          <Field label="服务名 (Service Name)">
            <Input
              type="text" 
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="例如: web, komari"
            />
          </Field>
          <Field label="容器内端口 (Expose Port)">
            <Input
              type="text" 
              value={containerPort}
              onChange={(e) => setContainerPort(e.target.value)}
              placeholder="例如: 80, 25774"
            />
          </Field>
          <Field label="备注 (可选)">
            <Input
              type="text" 
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="项目备注信息"
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleGenerate} disabled={isGenerating || !imageName.trim() || !serviceName.trim() || !containerPort.trim()}>
            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
            生成配置
          </Button>
        </div>
      </Card>

      <Card title="Docker Compose 编辑器">
        <div className="relative">
          <Textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            className="h-[400px] resize-none bg-[var(--surface-subtle)] font-mono text-sm text-emerald-700 dark:text-emerald-300"
            spellCheck={false}
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <IconButton title="保存草稿">
              <Save className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </Card>
    </div>
  );
};

// 4. 路由转发视图 (Nginx 代理)
const ProxyView = () => {
  const [routes, setRoutes] = useState<ProxyRoute[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newRoute, setNewRoute] = useState({ domain: '', target: '127.0.0.1:8000', ssl: true });

  // 获取代理路由列表
  const fetchRoutes = async () => {
    try {
      const res = await apiFetch('/api/proxy/routes');
      const data = await res.json();
      setRoutes(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  // 添加新代理
  const handleAdd = async () => {
    try {
      await apiFetch('/api/proxy/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRoute)
      });
      setShowAdd(false);
      setNewRoute({ domain: '', target: '127.0.0.1:8000', ssl: true });
      fetchRoutes();
    } catch (e) {
      console.error(e);
    }
  };

  // 删除代理
  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/proxy/routes/${id}`, { method: 'DELETE' });
      fetchRoutes();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Network}
        title="Nginx 路由与证书"
        description="维护域名到容器服务的映射，并按需自动申请 Let's Encrypt 证书。"
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" />
            添加代理
          </Button>
        }
      />

      {showAdd && (
        <Card title="添加反向代理" subtitle="保存后会触发 Nginx 配置重载。">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Field label="域名 (Domain)">
              <Input
                type="text" 
                value={newRoute.domain}
                onChange={(e) => setNewRoute({...newRoute, domain: e.target.value})}
                placeholder="app.example.com"
              />
            </Field>
            <Field label="目标地址 (Target)">
              <Input
                type="text" 
                value={newRoute.target}
                onChange={(e) => setNewRoute({...newRoute, target: e.target.value})}
                placeholder="127.0.0.1:8000"
              />
            </Field>
          </div>
          <label className="mb-6 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
            <Checkbox
              type="checkbox" 
              id="ssl" 
              checked={newRoute.ssl}
              onChange={(e) => setNewRoute({...newRoute, ssl: e.target.checked})}
            />
            <span>自动申请 SSL 证书 (Let's Encrypt)</span>
          </label>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowAdd(false)} variant="ghost">取消</Button>
            <Button onClick={handleAdd}>保存并重载 Nginx</Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {routes.length === 0 ? (
          <Card>
            <EmptyState
              icon={Network}
              title="暂无代理配置"
              description="添加一个域名到容器服务的映射，系统会自动同步 Nginx 配置。"
            />
          </Card>
        ) : (
          routes.map(r => (
            <div key={r.id}>
              <Card>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-soft)] text-[var(--brand-500)]">
                      <Network className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="flex items-center gap-2 text-lg font-semibold text-[color:var(--text-primary)]">
                        {r.domain}
                        {r.ssl && <ShieldCheck className="w-4 h-4 text-emerald-500" />}
                      </h4>
                      <p className="text-sm text-[color:var(--text-tertiary)]">指向: {r.target}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={r.ssl ? 'success' : 'warning'}>
                      {r.ssl ? 'HTTPS 已开启' : 'HTTP'}
                    </Badge>
                    <IconButton onClick={() => handleDelete(r.id)} title="删除代理" variant="danger">
                      <Trash2 className="w-5 h-5" />
                    </IconButton>
                  </div>
                </div>
              </Card>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 5. 证书管理视图
const CertView = () => {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取证书列表
  const fetchCerts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/certs');
      const data = await res.json();
      setCerts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCerts();
  }, []);

  // 手动续约证书
  const handleRenew = async (domain: string) => {
    try {
      const res = await apiFetch(`/api/certs/${domain}/renew`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.error);
      fetchCerts();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="证书管理模块"
        description="查看域名证书状态，必要时手动发起续约。"
        actions={
          <Button onClick={fetchCerts} variant="secondary">
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            刷新状态
          </Button>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-sm text-[color:var(--text-tertiary)] border-b border-[color:var(--border-subtle)]">
                <th className="pb-4 font-medium">域名</th>
                <th className="pb-4 font-medium">签发日期</th>
                <th className="pb-4 font-medium">过期日期</th>
                <th className="pb-4 font-medium">状态</th>
                <th className="pb-4 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-subtle)]">
              {certs.map((c, i) => (
                <tr key={i} className="group hover:bg-[var(--surface-soft)]/50">
                  <td className="py-4 font-medium text-[color:var(--text-primary)] flex items-center gap-2">
                    <ShieldCheck className={cn("w-4 h-4", c.status === 'valid' ? "text-emerald-500" : "text-rose-500")} />
                    {c.domain}
                  </td>
                  <td className="py-4 text-sm text-[color:var(--text-tertiary)]">{c.issueDate}</td>
                  <td className="py-4 text-sm text-[color:var(--text-tertiary)]">{c.expiryDate}</td>
                  <td className="py-4">
                    <Badge variant={c.status === 'valid' ? 'success' : 'danger'}>
                      {c.status === 'valid' ? '正常' : '已过期'}
                    </Badge>
                  </td>
                  <td className="py-4 text-right">
                    <Button onClick={() => handleRenew(c.domain)} variant="secondary" size="sm">
                      手动续约
                    </Button>
                  </td>
                </tr>
              ))}
              {certs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[color:var(--text-tertiary)]">
                    未找到证书信息，请在路由转发中开启 SSL
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// 6. Docker 迁移视图 (SSH)
const MigrationView = () => {
  return <MigrationConsole apiFetch={apiFetch} />;
};

// 7. 系统设置视图
const SettingsView = ({ config, onConfigChange }: { config: AppConfig | null, onConfigChange: () => void }) => {
  const [envContent, setEnvContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'preview'>('view');

  // 获取环境变量内容
  useEffect(() => {
    apiFetch('/api/config/env')
      .then(res => res.text())
      .then(setEnvContent)
      .catch(console.error);
  }, []);

  // 保存环境变量
  const handleSaveEnv = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/config/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: envContent })
      });
      if (res.ok) {
        alert('配置已保存并生效');
        setMode('view');
        onConfigChange(); // 通知父组件重新加载配置
      } else {
        alert('保存失败');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="在线服务配置"
        description="统一管理 .env 内容与当前生效配置状态。"
        actions={
          <div className="flex gap-3 flex-wrap">
            {mode === 'view' && (
              <Button onClick={() => setMode('edit')}>
                <Edit3 className="w-4 h-4" />
                编辑配置
              </Button>
            )}
            {mode === 'edit' && (
              <>
                <Button onClick={() => setMode('view')} variant="ghost">
                  取消
                </Button>
                <Button onClick={() => setMode('preview')} variant="success">
                  <Eye className="w-4 h-4" />
                  预览修改
                </Button>
              </>
            )}
            {mode === 'preview' && (
              <>
                <Button onClick={() => setMode('edit')} variant="ghost">
                  返回编辑
                </Button>
                <Button onClick={handleSaveEnv} disabled={saving}>
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  保存并生效
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card title="环境变量 (.env)" subtitle={mode === 'view' ? "只读模式" : mode === 'edit' ? "编辑模式" : "预览模式"}>
        {mode === 'edit' ? (
          <Textarea
            value={envContent}
            onChange={(e) => setEnvContent(e.target.value)}
            className="h-[300px] resize-none bg-[var(--surface-subtle)] font-mono text-sm text-blue-700 dark:text-blue-300"
            spellCheck={false}
          />
        ) : (
          <div className="h-[300px] w-full overflow-auto whitespace-pre-wrap rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-subtle)] p-6 font-mono text-sm text-[color:var(--text-primary)]">
            {envContent || '文件为空'}
          </div>
        )}
      </Card>

      <Card title="当前加载的配置状态">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4">
              <p className="mb-1 text-sm text-[color:var(--text-tertiary)]">VPS 公网 IP</p>
              <p className="font-mono text-[color:var(--text-primary)]">{config?.vpsIp || '未配置'}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4">
              <p className="mb-1 text-sm text-[color:var(--text-tertiary)]">Nginx 容器名称</p>
              <p className="font-mono text-[color:var(--text-primary)]">{config?.nginxContainer}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4">
              <p className="mb-1 text-sm text-[color:var(--text-tertiary)]">证书代理容器</p>
              <p className="font-mono text-[color:var(--text-primary)]">{config?.certAgentContainer}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4">
              <p className="mb-1 text-sm text-[color:var(--text-tertiary)]">Cloudflare API Token</p>
              <div className="flex items-center gap-2">
                {config?.hasCfToken ? (
                  <Badge variant="success"><CheckCircle2 className="w-3 h-3 inline mr-1" />已配置</Badge>
                ) : (
                  <Badge variant="danger"><AlertCircle className="w-3 h-3 inline mr-1" />未配置</Badge>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4">
              <p className="mb-1 text-sm text-[color:var(--text-tertiary)]">开放的域名 (ALLOWED_DOMAINS)</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {config?.allowedDomains && config.allowedDomains.length > 0 ? (
                  config.allowedDomains.map((d) => (
                    <span key={d}>
                      <Badge variant="default">{d}</Badge>
                    </span>
                  ))
                ) : (
                  <Badge variant="warning">未配置多域名</Badge>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[color:var(--border-subtle)] bg-[var(--surface-card-strong)] p-4">
              <p className="mb-1 text-sm text-[color:var(--text-tertiary)]">CF 默认代理状态</p>
              <p className="font-mono text-[color:var(--text-primary)]">{config?.cfProxied ? 'Proxied (云朵开启)' : 'DNS Only'}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- 主应用组件 ---

export default function App() {
  const [activeTab, setActiveTab] = useState('monitor');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [loggedIn, setLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        const data = await res.json();
        setLoggedIn(data.loggedIn);
      } catch (e) {
        setLoggedIn(false);
      } finally {
        setCheckingAuth(false);
      }
    };
    checkAuth();

    const handleUnauthorized = () => {
      setLoggedIn(false);
      localStorage.removeItem('token');
    };
    window.addEventListener('auth-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth-unauthorized', handleUnauthorized);
  }, []);

  // 加载系统配置
  const loadConfig = () => {
    apiFetch('/api/config')
      .then(res => res.json())
      .then(setConfig)
      .catch(console.error);
  };

  useEffect(() => {
    if (loggedIn) {
      loadConfig();
    }
  }, [loggedIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('token', data.token);
        setLoggedIn(true);
      } else {
        setLoginError(data.error || '登录失败');
      }
    } catch (e) {
      setLoginError('网络错误');
    }
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('token');
    setLoggedIn(false);
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] text-[color:var(--text-primary)]">
        <RefreshCw className="h-8 w-8 animate-spin text-[var(--brand-500)]" />
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-bg)] px-6 text-[color:var(--text-primary)] transition-colors duration-200">
        <div className="w-full max-w-md rounded-[1.75rem] border border-[color:var(--border-subtle)] bg-[var(--surface-card)] p-8 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.7)] backdrop-blur-xl">
          <div className="flex flex-col items-center mb-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[color:var(--text-primary)]">Docker 代理平台</h1>
            <p className="mt-1 text-sm text-[color:var(--text-tertiary)]">请输入管理员账号登录</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="用户名">
              <Input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </Field>
            <Field label="密码">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {loginError && <p className="text-sm text-rose-500">{loginError}</p>}
            <Button type="submit" className="w-full" size="lg">
              登录
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--app-bg)] text-[color:var(--text-primary)] font-sans transition-colors duration-200">
      {/* 左侧侧边栏 */}
      <aside className="sticky top-0 flex h-screen w-72 flex-col border-r border-[color:var(--border-subtle)] bg-[var(--surface-card)] backdrop-blur-xl transition-colors duration-200">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[color:var(--text-primary)]">DockerProxy</h1>
          </div>

          <nav className="space-y-2">
            <SidebarItem 
              icon={Activity} 
              label="主机监控" 
              active={activeTab === 'monitor'} 
              onClick={() => setActiveTab('monitor')} 
            />
            <SidebarItem 
              icon={LayoutDashboard} 
              label="容器管理" 
              active={activeTab === 'docker'} 
              onClick={() => setActiveTab('docker')} 
            />
            <SidebarItem 
              icon={Globe} 
              label="DNS 代理" 
              active={activeTab === 'dns'} 
              onClick={() => setActiveTab('dns')} 
            />
            <SidebarItem 
              icon={FileCode} 
              label="部署服务" 
              active={activeTab === 'compose'} 
              onClick={() => setActiveTab('compose')} 
            />
            <SidebarItem 
              icon={Network} 
              label="路由转发" 
              active={activeTab === 'proxy'} 
              onClick={() => setActiveTab('proxy')} 
            />
            <SidebarItem 
              icon={ShieldCheck} 
              label="证书管理" 
              active={activeTab === 'certs'} 
              onClick={() => setActiveTab('certs')} 
            />
            <SidebarItem 
              icon={Truck} 
              label="Docker 迁移" 
              active={activeTab === 'migrate'} 
              onClick={() => setActiveTab('migrate')} 
            />
          </nav>
        </div>

        {/* 底部设置与主题切换 */}
        <div className="mt-auto space-y-3 border-t border-[color:var(--border-subtle)] p-8">
          <ThemeSwitch theme={theme} resolvedTheme={resolvedTheme} onChange={setTheme} />
          <Button onClick={handleLogout} variant="ghost" className="w-full justify-start text-rose-500 hover:bg-rose-500/10 hover:text-rose-500">
            <ExternalLink className="h-5 w-5" />
            退出登录
          </Button>
          <SidebarItem 
            icon={Settings} 
            label="系统设置" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <main className="flex-1 overflow-auto p-10">
        <div className="max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'monitor' && <Monitor apiFetch={apiFetch} />}
              {activeTab === 'docker' && <DockerView />}
              {activeTab === 'dns' && <DNSView config={config} />}
              {activeTab === 'compose' && <ComposeView />}
              {activeTab === 'proxy' && <ProxyView />}
              {activeTab === 'certs' && <CertView />}
              {activeTab === 'migrate' && <MigrationView />}
              {activeTab === 'settings' && <SettingsView config={config} onConfigChange={loadConfig} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
