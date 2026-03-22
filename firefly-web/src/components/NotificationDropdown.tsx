import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Popover, List, Typography, Button, Space, Tabs, Empty, Tag, message } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { inAppMessageApi } from '../services/api';
import useAuthStore from '../store/useAuthStore';

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

const NotificationDropdown: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<InAppMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('unread');

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await inAppMessageApi.unreadCount();
      setUnreadCount(res.data.data ?? 0);
    } catch {
      // ignore
    }
  }, []);

  const fetchMessages = useCallback(async (isRead: boolean) => {
    setLoading(true);
    try {
      const res = await inAppMessageApi.list({ pageNum: 1, pageSize: 10, isRead });
      setMessages(res.data.data?.records ?? []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(timer);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (open) {
      fetchMessages(activeTab === 'unread' ? false : true);
    }
  }, [open, activeTab, fetchMessages]);

  const handleMarkAsRead = async (id: number) => {
    try {
      await inAppMessageApi.markAsRead(id);
      message.success('已标记为已读');
      fetchMessages(false);
      fetchUnreadCount();
    } catch {
      message.error('操作失败');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await inAppMessageApi.markAllAsRead();
      message.success('已全部标记为已读');
      fetchMessages(false);
      fetchUnreadCount();
    } catch {
      message.error('操作失败');
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
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkAsRead(item.id);
                }}
              >
                已读
              </Button>,
            ]
          : undefined
      }
    >
      <List.Item.Meta
        title={
          <Space size={4}>
            <Tag color={levelColorMap[item.level] || 'default'} style={{ marginRight: 0 }}>
              {item.level}
            </Tag>
            <Typography.Text strong={!item.isRead} style={{ fontSize: 13 }}>
              {item.title}
            </Typography.Text>
          </Space>
        }
        description={
          <div>
            <Typography.Paragraph
              ellipsis={{ rows: 2 }}
              style={{ marginBottom: 4, fontSize: 12, color: '#666' }}
            >
              {item.content}
            </Typography.Paragraph>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {item.createdAt}
            </Typography.Text>
          </div>
        }
      />
    </List.Item>
  );

  const content = (
    <div style={{ width: 380 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 12px', borderBottom: '1px solid #f1f5f9' }}>
        <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>站内信</Typography.Text>
        {activeTab === 'unread' && unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllAsRead}>
            全部已读
          </Button>
        )}
      </div>
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
