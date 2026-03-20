import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { tenantApi } from '../../services/api';

interface TenantSummary {
  id: number;
  name: string;
  code: string;
}

interface TenantOpenApiSubscriptionItem {
  openApiCode: string;
  name: string;
  serviceCode: string;
  httpMethod: string;
  pathPattern: string;
  gatewayPath: string;
  permissionCode?: string;
  enabled: boolean;
  subscribed: boolean;
  ipWhitelist: string[];
  concurrencyLimit: number;
  dailyLimit: number;
}

interface TenantOpenApiSubscriptionDrawerProps {
  open: boolean;
  tenant?: TenantSummary | null;
  onClose: () => void;
  onSaved?: () => void;
}

const methodColorMap: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const TenantOpenApiSubscriptionDrawer: React.FC<TenantOpenApiSubscriptionDrawerProps> = ({
  open,
  tenant,
  onClose,
  onSaved,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<TenantOpenApiSubscriptionItem[]>([]);

  const fetchData = async () => {
    if (!tenant?.id) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await tenantApi.getOpenApiSubscriptions(tenant.id);
      setItems((res.data?.data ?? []) as TenantOpenApiSubscriptionItem[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载租户 OpenAPI 订阅失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && tenant?.id) {
      void fetchData();
    }
  }, [open, tenant?.id]);

  const updateItem = (
    openApiCode: string,
    patch: Partial<TenantOpenApiSubscriptionItem>,
  ) => {
    setItems((current) =>
      current.map((item) => {
        if (item.openApiCode !== openApiCode) {
          return item;
        }
        return { ...item, ...patch };
      }),
    );
  };

  const handleToggle = (record: TenantOpenApiSubscriptionItem, checked: boolean) => {
    updateItem(record.openApiCode, {
      subscribed: checked,
      ipWhitelist: checked ? record.ipWhitelist ?? [] : [],
      concurrencyLimit: checked ? record.concurrencyLimit ?? -1 : -1,
      dailyLimit: checked ? record.dailyLimit ?? -1 : -1,
    });
  };

  const handleSave = async () => {
    if (!tenant?.id) {
      return;
    }
    try {
      setSubmitting(true);
      await tenantApi.updateOpenApiSubscriptions(tenant.id, {
        items: items
          .filter((item) => item.subscribed)
          .map((item) => ({
            openApiCode: item.openApiCode,
            ipWhitelist: item.ipWhitelist ?? [],
            concurrencyLimit: item.concurrencyLimit ?? -1,
            dailyLimit: item.dailyLimit ?? -1,
          })),
      });
      message.success('租户 OpenAPI 订阅已更新');
      onClose();
      onSaved?.();
    } catch (error) {
      message.error(getErrorMessage(error, '保存租户 OpenAPI 订阅失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<TenantOpenApiSubscriptionItem> = [
    {
      title: '订阅',
      dataIndex: 'subscribed',
      width: 88,
      fixed: 'left',
      render: (value: boolean, record) => (
        <Switch
          checked={value}
          disabled={!record.enabled}
          onChange={(checked) => handleToggle(record, checked)}
        />
      ),
    },
    {
      title: 'OpenAPI',
      width: 260,
      render: (_value: unknown, record) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Typography.Text strong>{record.name}</Typography.Text>
            <Typography.Text code>{record.openApiCode}</Typography.Text>
          </Space>
          <Space wrap>
            <Tag color={record.enabled ? 'success' : 'default'}>
              {record.enabled ? '可订阅' : '已停用'}
            </Tag>
            {record.permissionCode ? <Tag>{record.permissionCode}</Tag> : null}
          </Space>
        </Space>
      ),
    },
    {
      title: '访问路径',
      width: 300,
      render: (_value: unknown, record) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Tag color={methodColorMap[record.httpMethod] ?? 'default'}>{record.httpMethod}</Tag>
            <Tag color="blue">{record.serviceCode}</Tag>
          </Space>
          <Typography.Text code>{record.gatewayPath}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'IP 白名单',
      dataIndex: 'ipWhitelist',
      width: 280,
      render: (value: string[], record) => (
        <Select
          mode="tags"
          style={{ width: '100%' }}
          disabled={!record.subscribed}
          tokenSeparators={[',', ' ']}
          value={value ?? []}
          placeholder="留空表示不限制"
          onChange={(nextValue) => updateItem(record.openApiCode, { ipWhitelist: nextValue })}
        />
      ),
    },
    {
      title: '并发上限',
      dataIndex: 'concurrencyLimit',
      width: 140,
      render: (value: number, record) => (
        <InputNumber
          precision={0}
          min={-1}
          style={{ width: '100%' }}
          disabled={!record.subscribed}
          value={value}
          placeholder="-1 不限"
          onChange={(nextValue) =>
            updateItem(record.openApiCode, { concurrencyLimit: typeof nextValue === 'number' ? nextValue : -1 })
          }
        />
      ),
    },
    {
      title: '日调用上限',
      dataIndex: 'dailyLimit',
      width: 160,
      render: (value: number, record) => (
        <InputNumber
          precision={0}
          min={-1}
          style={{ width: '100%' }}
          disabled={!record.subscribed}
          value={value}
          placeholder="-1 不限"
          onChange={(nextValue) =>
            updateItem(record.openApiCode, { dailyLimit: typeof nextValue === 'number' ? nextValue : -1 })
          }
        />
      ),
    },
  ];

  return (
    <Drawer
      destroyOnClose
      title={`OpenAPI 订阅${tenant ? ` - ${tenant.name}` : ''}`}
      open={open}
      onClose={onClose}
      width={1080}
      styles={{ body: { paddingBottom: 24 } }}
      footer={(
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} onClick={() => void handleSave()}>
            保存订阅
          </Button>
        </Space>
      )}
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card size="small">
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Text>
              平台管理员可以为租户配置已订阅 OpenAPI，并约束每个接口的白名单、并发上限和单日调用上限。
            </Typography.Text>
            <Typography.Text type="secondary">
              `-1` 表示不限，`0` 不是合法值。未勾选的 OpenAPI 不会出现在租户空间的 AppKey 授权范围内。
            </Typography.Text>
          </Space>
        </Card>

        <Table<TenantOpenApiSubscriptionItem>
          rowKey="openApiCode"
          loading={loading}
          dataSource={items}
          columns={columns}
          pagination={false}
          scroll={{ x: 1220 }}
        />
      </Space>
    </Drawer>
  );
};

export default TenantOpenApiSubscriptionDrawer;
