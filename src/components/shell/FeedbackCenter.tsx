import {
  BellOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { App as AntdApp, Badge, Button, Drawer, Empty, List, Space, Tag, Typography } from 'antd';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { APP_API_ERROR_EVENT, APP_NOTIFY_EVENT, type ApiErrorEventDetail, type NotifyEventDetail } from '../../lib/api';
import type { AppNotification, NotifyLevel } from '../../types';

type FeedbackCenterContextValue = {
  openCenter: () => void;
  toggleCenter: () => void;
  unreadCount: number;
};

const FeedbackCenterContext = createContext<FeedbackCenterContextValue | null>(null);

function levelIcon(level: NotifyLevel) {
  switch (level) {
    case 'success':
      return <CheckCircleOutlined className="text-emerald-500" />;
    case 'warning':
      return <ExclamationCircleOutlined className="text-amber-500" />;
    case 'error':
      return <CloseCircleOutlined className="text-rose-500" />;
    default:
      return <InfoCircleOutlined className="text-blue-500" />;
  }
}

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function FeedbackCenterProvider({ children }: PropsWithChildren) {
  const { message, notification } = AntdApp.useApp();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  const appendNotification = useCallback((item: AppNotification) => {
    setItems((current) => [item, ...current].slice(0, 60));
  }, []);

  const markAllAsRead = useCallback(() => {
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  }, []);

  useEffect(() => {
    if (!open) return;
    markAllAsRead();
  }, [markAllAsRead, open]);

  useEffect(() => {
    const handleNotify = (event: Event) => {
      const { detail } = event as CustomEvent<NotifyEventDetail>;
      const item: AppNotification = {
        id: crypto.randomUUID(),
        level: detail.level,
        message: detail.message,
        description: detail.description,
        source: detail.source,
        timestamp: new Date().toISOString(),
        read: open,
        action: detail.action,
      };

      appendNotification(item);

      if (detail.level === 'error') {
        notification.error({
          message: detail.message,
          description: detail.description || detail.source,
          placement: 'bottomRight',
          btn: detail.action ? (
            <Button type="link" size="small" onClick={() => void detail.action?.handler?.()}>
              {detail.action.label}
            </Button>
          ) : undefined,
        });
        return;
      }

      message.open({
        type: detail.level,
        content: detail.source ? `${detail.source} · ${detail.message}` : detail.message,
      });
    };

    const handleApiError = (event: Event) => {
      const { detail } = event as CustomEvent<ApiErrorEventDetail>;
      const item: AppNotification = {
        id: crypto.randomUUID(),
        level: 'error',
        message: detail.error.message,
        description: detail.error.details,
        source: detail.source,
        timestamp: new Date().toISOString(),
        read: open,
        requestId: detail.error.requestId,
        action: detail.retry
          ? {
              label: '重试',
              handler: async () => {
                await detail.retry?.();
              },
            }
          : undefined,
      };

      appendNotification(item);

      notification.error({
        message: detail.source ? `${detail.source} 请求失败` : '请求失败',
        description: (
          <Space direction="vertical" size={4}>
            <Typography.Text>{detail.error.message}</Typography.Text>
            <Typography.Text type="secondary">
              {detail.error.code}
              {detail.error.requestId ? ` · Request ID: ${detail.error.requestId}` : ''}
            </Typography.Text>
          </Space>
        ),
        placement: 'bottomRight',
        duration: 6,
        btn: detail.retry ? (
          <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => void detail.retry?.()}>
            立即重试
          </Button>
        ) : undefined,
      });
    };

    window.addEventListener(APP_NOTIFY_EVENT, handleNotify);
    window.addEventListener(APP_API_ERROR_EVENT, handleApiError);

    return () => {
      window.removeEventListener(APP_NOTIFY_EVENT, handleNotify);
      window.removeEventListener(APP_API_ERROR_EVENT, handleApiError);
    };
  }, [appendNotification, message, notification, open]);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);

  const value = useMemo<FeedbackCenterContextValue>(
    () => ({
      openCenter: () => setOpen(true),
      toggleCenter: () => setOpen((current) => !current),
      unreadCount,
    }),
    [unreadCount],
  );

  return (
    <FeedbackCenterContext.Provider value={value}>
      {children}
      <Drawer
        title={
          <Space>
            <BellOutlined />
            <span>通知中心</span>
          </Space>
        }
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        extra={
          <Space>
            <Button size="small" onClick={markAllAsRead}>
              全部已读
            </Button>
            <Button size="small" danger onClick={() => setItems([])}>
              清空
            </Button>
          </Space>
        }
      >
        {items.length === 0 ? (
          <Empty description="暂无通知" />
        ) : (
          <List<AppNotification>
            itemLayout="vertical"
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                key={item.id}
                extra={!item.read ? <Badge status="processing" text="未读" /> : null}
                actions={[
                  item.source ? <Tag key="source">{item.source}</Tag> : <span key="source" />,
                  item.requestId ? <Tag key="requestId">#{item.requestId}</Tag> : <span key="requestId" />,
                ]}
              >
                <List.Item.Meta
                  avatar={levelIcon(item.level)}
                  title={
                    <Space>
                      <Typography.Text strong>{item.message}</Typography.Text>
                      <Typography.Text type="secondary">{formatTimestamp(item.timestamp)}</Typography.Text>
                    </Space>
                  }
                  description={item.description}
                />
                {item.action && (
                  <Button type="link" size="small" onClick={() => void item.action?.handler?.()}>
                    {item.action.label}
                  </Button>
                )}
              </List.Item>
            )}
          />
        )}
      </Drawer>
    </FeedbackCenterContext.Provider>
  );
}

export function useFeedbackCenter() {
  const context = useContext(FeedbackCenterContext);

  if (!context) {
    throw new Error('useFeedbackCenter must be used inside FeedbackCenterProvider');
  }

  return context;
}
