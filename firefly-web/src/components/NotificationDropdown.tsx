import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Empty, List, Popover, Space, Tabs, Tag, Typography, message } from 'antd';
import { BellOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { inAppMessageApi } from '../services/api';
import useAuthStore from '../store/useAuthStore';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/datetime';

interface InAppMessage {
  id: number;
  title: string;
  content: string;
  type: string;
  level: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

const levelColorMap: Record<string, string> = {
  INFO: 'blue',
  WARNING: 'orange',
  ERROR: 'red',
};

const levelLabelMap: Record<string, string> = {
  INFO: '提示',
  WARNING: '警告',
  ERROR: '严重',
};

const NotificationDropdown: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<InAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('unread');

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await inAppMessageApi.unreadCount();
      setUnreadCount(res.data.data ?? 0);
    } catch {
      // Badge polling is best-effort; the panel surfaces an error with a retry action.
    }
  }, []);

  const fetchMessages = useCallback(async (isRead: boolean) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await inAppMessageApi.list({ pageNum: 1, pageSize: 10, isRead });
      setMessages(res.data.data?.records ?? []);
    } catch (error) {
      setMessages([]);
      setLoadError(getErrorMessage(error, '加载站内信失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadActiveTab = useCallback(() => {
    void fetchMessages(activeTab === 'unread' ? false : true);
    void fetchUnreadCount();
  }, [activeTab, fetchMessages, fetchUnreadCount]);

  useEffect(() => {
    void fetchUnreadCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchUnreadCount();
      }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (open) {
      void fetchMessages(activeTab === 'unread' ? false : true);
    }
  }, [activeTab, fetchMessages, open]);

  const handleMarkAsRead = async (id: number) => {
    try {
      await inAppMessageApi.markAsRead(id);
      message.success('已标记为已读');
      reloadActiveTab();
    } catch (error) {
      message.error(getErrorMessage(error, '标记已读失败'));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await inAppMessageApi.markAllAsRead();
      message.success('已全部标记为已读');
      reloadActiveTab();
    } catch (error) {
      message.error(getErrorMessage(error, '全部标记已读失败'));
    }
  };

  const renderItem = (item: InAppMessage) => (
    <List.Item
      key={item.id}
      actions={
        !item.isRead
          ? [
              <Button
                key="read"
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleMarkAsRead(item.id);
                }}
              >
                标为已读
              </Button>,
            ]
          : undefined
      }
    >
      <List.Item.Meta
        title={(
          <Space size={4}>
            <Tag color={levelColorMap[item.level] || 'default'} style={{ marginRight: 0 }}>
              {levelLabelMap[item.level] || item.level || '提示'}
            </Tag>
            <Typography.Text strong={!item.isRead} style={{ fontSize: 13 }}>
              {item.title}
            </Typography.Text>
          </Space>
        )}
        description={(
          <div>
            <Typography.Paragraph
              ellipsis={{ rows: 2, tooltip: item.content }}
              style={{ marginBottom: 4, fontSize: 12, color: '#475569' }}
            >
              {item.content}
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {formatDateTime(item.createdAt)}
            </Typography.Text>
          </div>
        )}
      />
    </List.Item>
  );

  const content = (
    <div style={{ width: 380 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 12px', borderBottom: '1px solid #f1f5f9' }}>
        <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>站内信</Typography.Text>
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            aria-label="刷新站内信"
            onClick={reloadActiveTab}
            loading={loading}
          />
          {activeTab === 'unread' && unreadCount > 0 ? (
            <Button type="link" size="small" onClick={() => void handleMarkAllAsRead()}>
              全部已读
            </Button>
          ) : null}
        </Space>
      </div>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginTop: 12 }}
          message={loadError}
          action={<Button size="small" onClick={reloadActiveTab}>重试</Button>}
        />
      ) : null}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        items={[
          {
            key: 'unread',
            label: `未读 (${unreadCount})`,
            children: (
              <List
                loading={loading}
                dataSource={messages}
                renderItem={renderItem}
                locale={{ emptyText: <Empty description="暂无未读消息" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                style={{ maxHeight: 400, overflow: 'auto' }}
              />
            ),
          },
          {
            key: 'read',
            label: '已读',
            children: (
              <List
                loading={loading}
                dataSource={messages}
                renderItem={renderItem}
                locale={{ emptyText: <Empty description="暂无已读消息" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                style={{ maxHeight: 400, overflow: 'auto' }}
              />
            ),
          },
        ]}
      />
      <div style={{ textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
        <Button
          type="link"
          size="small"
          onClick={() => {
            setOpen(false);
            navigate(user?.userType === 'SYSTEM_OPS' ? '/notification' : '/notification-records');
          }}
        >
          查看全部
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
    >
      <button
        type="button"
        className={open ? 'layout-header-quick-action layout-header-quick-action--active' : 'layout-header-quick-action'}
        aria-label="站内信"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Badge count={unreadCount} size="small" offset={[-2, 2]}>
          <span className="layout-header-quick-action__icon">
            <BellOutlined />
          </span>
        </Badge>
        <span className="layout-header-quick-action__label">站内信</span>
      </button>
    </Popover>
  );
};

export default NotificationDropdown;
