import type { ReactNode } from 'react';
import {
  ApiOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { AppRouteGroupKey, AppRouteKey, AppRouteMeta, NavGroupMeta } from './types';

const routeGroups: NavGroupMeta[] = [
  {
    key: 'infrastructure',
    label: '基础设施',
    icon: <CloudServerOutlined />,
    items: [
      {
        key: 'infrastructure.overview',
        groupKey: 'infrastructure',
        path: '/infrastructure/servers',
        title: '服务器总览',
        description: '按服务器视角查看资源状态、管理通道和最近任务。',
        menuVisible: true,
      },
      {
        key: 'infrastructure.environments',
        groupKey: 'infrastructure',
        path: '/infrastructure/environments',
        title: '环境接入',
        description: '统一管理本地和远程 SSH Docker 环境。',
        menuVisible: true,
      },
    ],
  },
  {
    key: 'delivery',
    label: '应用交付',
    icon: <AppstoreOutlined />,
    items: [
      {
        key: 'delivery.workloads',
        groupKey: 'delivery',
        path: '/delivery/workloads',
        title: '容器与项目',
        description: '按 Compose 项目和独立容器维度查看当前工作负载。',
        menuVisible: true,
      },
      {
        key: 'delivery.deployments',
        groupKey: 'delivery',
        path: '/delivery/deployments',
        title: '部署中心',
        description: '生成 Compose 模板、编辑部署内容并提交部署任务。',
        menuVisible: true,
      },
    ],
  },
  {
    key: 'network',
    label: '网络与域名',
    icon: <GlobalOutlined />,
    items: [
      {
        key: 'network.dnsConnections',
        groupKey: 'network',
        path: '/network/dns-connections',
        title: 'DNS 平台接入',
        description: '统一接入 Cloudflare、Gcore 等域名平台，并管理管理范围与默认策略。',
        menuVisible: true,
      },
      {
        key: 'network.dnsRecords',
        groupKey: 'network',
        path: '/network/dns-records',
        title: 'DNS 记录',
        description: '在已接入的平台与 Zone 上下文中维护 DNS 记录。',
        menuVisible: true,
      },
      {
        key: 'network.gatewayRoutes',
        groupKey: 'network',
        path: '/network/gateway-routes',
        title: '网关路由',
        description: '按服务器与网关维度维护反向代理路由。',
        menuVisible: true,
      },
      {
        key: 'network.certificates',
        groupKey: 'network',
        path: '/network/certificates',
        title: '证书管理',
        description: '查看证书状态并发起续签任务。',
        menuVisible: true,
      },
    ],
  },
  {
    key: 'operations',
    label: '运维任务',
    icon: <ToolOutlined />,
    items: [
      {
        key: 'operations.migration',
        groupKey: 'operations',
        path: '/operations/migration',
        title: '迁移控制台',
        description: '按步骤完成迁移规划、执行监控和结果回看。',
        menuVisible: true,
      },
      {
        key: 'operations.jobs',
        groupKey: 'operations',
        path: '/operations/jobs',
        title: '任务队列',
        description: '统一查看部署、迁移和系统作业记录。',
        menuVisible: true,
      },
    ],
  },
  {
    key: 'settings',
    label: '系统设置',
    icon: <SettingOutlined />,
    items: [
      {
        key: 'settings.configuration',
        groupKey: 'settings',
        path: '/settings/configuration',
        title: '配置管理',
        description: '查看系统运行配置摘要并维护运行时 .env 内容。',
        menuVisible: true,
      },
      {
        key: 'settings.preferences',
        groupKey: 'settings',
        path: '/settings/preferences',
        title: '主题与账户',
        description: '管理主题偏好和当前账户信息。',
        menuVisible: true,
      },
    ],
  },
];

export const NAV_GROUPS = routeGroups;
export const DEFAULT_ROUTE_PATH = '/infrastructure/servers';

const routeByKey = new Map<AppRouteKey, AppRouteMeta>();
const routeByPath = new Map<string, AppRouteMeta>();
const groupByKey = new Map<AppRouteGroupKey, NavGroupMeta>();

routeGroups.forEach((group) => {
  groupByKey.set(group.key, group);
  group.items.forEach((item) => {
    routeByKey.set(item.key, item);
    routeByPath.set(item.path, item);
  });
});

export const ROUTE_ICON_BY_GROUP: Record<AppRouteGroupKey, ReactNode> = {
  infrastructure: <DatabaseOutlined />,
  delivery: <DeploymentUnitOutlined />,
  network: <ClusterOutlined />,
  operations: <ApiOutlined />,
  settings: <BgColorsOutlined />,
};

export function getNavGroup(groupKey: AppRouteGroupKey) {
  return groupByKey.get(groupKey) || null;
}

export function getRouteByKey(routeKey: AppRouteKey) {
  return routeByKey.get(routeKey) || null;
}

export function getRouteByPath(pathname: string) {
  const normalizedPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
  return routeByPath.get(normalizedPath) || null;
}

export function getPathByRouteKey(routeKey: AppRouteKey) {
  return routeByKey.get(routeKey)?.path || DEFAULT_ROUTE_PATH;
}
