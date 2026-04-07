import type { TagProps } from 'antd';

export function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

export function formatBytes(bytes?: number | null) {
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

export function getStatusColor(status?: string): TagProps['color'] {
  switch (status) {
    case 'ready':
    case 'completed':
    case 'active':
    case 'valid':
    case 'connected':
      return 'success';
    case 'running':
    case 'pending':
    case 'planning':
    case 'verifying':
    case 'renewing':
    case 'warning':
      return 'warning';
    case 'failed':
    case 'error':
    case 'expired':
    case 'blocked':
      return 'error';
    default:
      return 'default';
  }
}

export function summarizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return '-';
  const preferredKeys = ['message', 'name', 'projectName', 'displayName', 'domain', 'provider'];
  for (const key of preferredKeys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  const firstPair = Object.entries(metadata).find(([, value]) => typeof value === 'string' || typeof value === 'number');
  return firstPair ? `${firstPair[0]}: ${String(firstPair[1])}` : '-';
}
