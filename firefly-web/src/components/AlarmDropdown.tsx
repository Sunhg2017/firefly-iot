import React, { useCallback, useEffect, useState } from 'react';
import { AlertOutlined } from '@ant-design/icons';
import { Badge, Button, Empty, List, Popover, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../services/api';
import { ALARM_LEVEL_LABELS, ALARM_STATUS_LABELS } from '../pages/alarm/alarmText';

interface AlarmDropdownProps {
  visible: boolean;
}

interface AlarmSummaryItem {
  id: number;
  rule_name?: string;
  level?: string;
  status?: string;
  message?: string;
  created_at?: string;
}

const levelColorMap: Record<string, string> = {
  CRITICAL: 'red',
  WARNING: 'orange',
  INFO: 'blue',
};

const statusColorMap: Record<string, string> = {
  TRIGGERED: 'error',
  CONFIRMED: 'warning',
  PROCESSED: 'processing',
  CLOSED: 'default',
};

const AlarmDropdown: React.FC<AlarmDropdownProps> = ({ visible }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [alarms, setAlarms] = useState<AlarmSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPendingCount = useCallback(async () => {
    if (!visible) {
      setPendingCount(0);
      return;
    }
    try {
      const response = await dashboardApi.overview();
      setPendingCount(Number(response.data?.data?.alarmPending ?? 0));
    } catch {
      setPendingCount(0);
    }
  }, [visible]);

  const fetchRecentAlarms = useCallback(async () => {
    if (!visible) {
      setAlarms([]);
      return;
    }
    setLoading(true);
    try {
      const response = await dashboardApi.recentAlarms(8);
      setAlarms((response.data?.data ?? []) as AlarmSummaryItem[]);
    } catch {
      setAlarms([]);
    } finally {
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    void fetchPendingCount();
    const timer = window.setInterval(() => {
      void fetchPendingCount();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchPendingCount, visible]);

  useEffect(() => {
    if (open) {
      void fetchRecentAlarms();
      void fetchPendingCount();
    }
  }, [fetchPendingCount, fetchRecentAlarms, open]);

  if (!visible) {
    return null;
  }

  const content = (
    <div style={{ width: 380 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 4px 12px',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <div>
          <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>
            告警
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              待处理 {pendingCount} 条
            </Typography.Text>
          </div>
        </div>
        <Tag color={pendingCount > 0 ? 'error' : 'default'} style={{ marginRight: 0 }}>
          {pendingCount > 0 ? '有新告警' : '已清空'}
        </Tag>
      </div>

      <List
        loading={loading}
        dataSource={alarms}
        locale={{ emptyText: <Empty description="暂无告警" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        style={{ maxHeight: 400, overflow: 'auto', paddingTop: 8 }}
        renderItem={(item) => (
          <List.Item
            key={item.id}
            style={{ cursor: 'pointer', paddingInline: 4 }}
            onClick={() => {
              setOpen(false);
              navigate('/alarm-records');
            }}
          >
            <List.Item.Meta
              title={(
                <Space size={6} wrap>
                  <Tag color={levelColorMap[item.level || ''] || 'default'} style={{ marginRight: 0 }}>
                    {ALARM_LEVEL_LABELS[item.level || ''] || item.level || '告警'}
                  </Tag>
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {item.rule_name || `告警 #${item.id}`}
                  </Typography.Text>
                </Space>
              )}
              description={(
                <div>
                  <Typography.Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{ marginBottom: 4, fontSize: 12, color: '#666' }}
                  >
                    {item.message || '请进入告警处理页面查看详情'}
                  </Typography.Paragraph>
                  <Space size={8} wrap>
                    <Tag color={statusColorMap[item.status || ''] || 'default'} style={{ marginRight: 0 }}>
                      {ALARM_STATUS_LABELS[item.status || ''] || item.status || 'UNKNOWN'}
                    </Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {item.created_at || '-'}
                    </Typography.Text>
                  </Space>
                </div>
              )}
            />
          </List.Item>
        )}
      />

      <div style={{ textAlign: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
        <Button
          type="link"
          size="small"
          onClick={() => {
            setOpen(false);
            navigate('/alarm-records');
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
        aria-label="告警"
      >
        <Badge count={pendingCount} size="small" offset={[-2, 2]}>
          <span
            className="layout-header-quick-action__icon"
            style={{ color: pendingCount > 0 ? '#dc2626' : undefined }}
          >
            <AlertOutlined />
          </span>
        </Badge>
        <span className="layout-header-quick-action__label">告警</span>
      </button>
    </Popover>
  );
};

export default AlarmDropdown;
