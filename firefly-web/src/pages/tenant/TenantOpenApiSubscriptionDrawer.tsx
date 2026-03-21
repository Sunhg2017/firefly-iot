import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Drawer,
  Input,
  InputNumber,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
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

type SubscriptionFilter = 'ALL' | 'SUBSCRIBED' | 'UNSUBSCRIBED';
type AvailabilityFilter = 'ALL' | 'ENABLED' | 'DISABLED';

const methodColorMap: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

const subscriptionFilterOptions = [
  { label: '全部接口', value: 'ALL' },
  { label: '已订阅', value: 'SUBSCRIBED' },
  { label: '未订阅', value: 'UNSUBSCRIBED' },
];

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const sortItems = (items: TenantOpenApiSubscriptionItem[]): TenantOpenApiSubscriptionItem[] =>
  [...items].sort((left, right) => {
    const subscribedDiff = Number(Boolean(right.subscribed)) - Number(Boolean(left.subscribed));
    if (subscribedDiff !== 0) {
      return subscribedDiff;
    }
    const enabledDiff = Number(Boolean(right.enabled)) - Number(Boolean(left.enabled));
    if (enabledDiff !== 0) {
      return enabledDiff;
    }
    const serviceDiff = left.serviceCode.localeCompare(right.serviceCode);
    if (serviceDiff !== 0) {
      return serviceDiff;
    }
    return left.openApiCode.localeCompare(right.openApiCode);
  });

const TenantOpenApiSubscriptionDrawer: React.FC<TenantOpenApiSubscriptionDrawerProps> = ({
  open,
  tenant,
  onClose,
  onSaved,
}) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<TenantOpenApiSubscriptionItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>();
  const [methodFilter, setMethodFilter] = useState<string>();
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('ALL');

  const resetFilters = () => {
    setKeyword('');
    setServiceFilter(undefined);
    setMethodFilter(undefined);
    setSubscriptionFilter('ALL');
    setAvailabilityFilter('ALL');
  };

  const fetchData = async () => {
    if (!tenant?.id) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await tenantApi.getOpenApiSubscriptions(tenant.id);
      setItems(sortItems((res.data?.data ?? []) as TenantOpenApiSubscriptionItem[]));
      resetFilters();
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

  const updateItem = (openApiCode: string, patch: Partial<TenantOpenApiSubscriptionItem>) => {
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

  const normalizedKeyword = keyword.trim().toLowerCase();
  const serviceOptions = Array.from(new Set(items.map((item) => item.serviceCode))).map((value) => ({
    label: value,
    value,
  }));
  const methodOptions = Array.from(new Set(items.map((item) => item.httpMethod))).map((value) => ({
    label: value,
    value,
  }));

  const filteredItems = sortItems(
    items.filter((item) => {
      if (serviceFilter && item.serviceCode !== serviceFilter) {
        return false;
      }
      if (methodFilter && item.httpMethod !== methodFilter) {
        return false;
      }
      if (subscriptionFilter === 'SUBSCRIBED' && !item.subscribed) {
        return false;
      }
      if (subscriptionFilter === 'UNSUBSCRIBED' && item.subscribed) {
        return false;
      }
      if (availabilityFilter === 'ENABLED' && !item.enabled) {
        return false;
      }
      if (availabilityFilter === 'DISABLED' && item.enabled) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      const searchText = [
        item.name,
        item.openApiCode,
        item.serviceCode,
        item.httpMethod,
        item.gatewayPath,
        item.pathPattern,
        item.permissionCode ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return searchText.includes(normalizedKeyword);
    }),
  );

  const subscribedCount = items.filter((item) => item.subscribed).length;
  const enabledCount = items.filter((item) => item.enabled).length;
  const filteredSubscribedCount = filteredItems.filter((item) => item.subscribed).length;
  const filteredEnabledCount = filteredItems.filter((item) => item.enabled).length;

  const handleBatchToggle = (checked: boolean) => {
    const targetCodes = new Set(
      filteredItems
        .filter((item) => item.enabled && item.subscribed !== checked)
        .map((item) => item.openApiCode),
    );
    if (targetCodes.size === 0) {
      message.info(checked ? '当前筛选结果里没有可订阅的 OpenAPI' : '当前筛选结果里没有可取消的 OpenAPI');
      return;
    }
    setItems((current) =>
      current.map((item) => {
        if (!targetCodes.has(item.openApiCode)) {
          return item;
        }
        return {
          ...item,
          subscribed: checked,
          ipWhitelist: checked ? item.ipWhitelist ?? [] : [],
          concurrencyLimit: checked ? item.concurrencyLimit ?? -1 : -1,
          dailyLimit: checked ? item.dailyLimit ?? -1 : -1,
        };
      }),
    );
    message.success(checked ? `已订阅当前筛选的 ${targetCodes.size} 个 OpenAPI` : `已取消当前筛选的 ${targetCodes.size} 个 OpenAPI`);
  };

  const handleBatchUnlimited = () => {
    const targetCodes = new Set(
      filteredItems.filter((item) => item.subscribed).map((item) => item.openApiCode),
    );
    if (targetCodes.size === 0) {
      message.info('当前筛选结果里没有已订阅的 OpenAPI');
      return;
    }
    setItems((current) =>
      current.map((item) => {
        if (!targetCodes.has(item.openApiCode)) {
          return item;
        }
        return {
          ...item,
          concurrencyLimit: -1,
          dailyLimit: -1,
        };
      }),
    );
    message.success(`已将当前筛选的 ${targetCodes.size} 个已订阅 OpenAPI 设置为不限额`);
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
      width: 92,
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
      title: 'OpenAPI 信息',
      render: (_value: unknown, record) => (
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text strong>{record.name}</Typography.Text>
            <Typography.Text code>{record.openApiCode}</Typography.Text>
          </Space>
          <Space wrap>
            <Tag color={methodColorMap[record.httpMethod] ?? 'default'}>{record.httpMethod}</Tag>
            <Tag color="blue">{record.serviceCode}</Tag>
            <Tag color={record.enabled ? 'success' : 'default'}>{record.enabled ? '可订阅' : '已停用'}</Tag>
            {record.permissionCode ? <Tag>{record.permissionCode}</Tag> : null}
          </Space>
          <Typography.Text code copyable={{ text: record.gatewayPath }}>
            {record.gatewayPath}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '订阅限制',
      width: 420,
      render: (_value: unknown, record) => (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Select
            mode="tags"
            style={{ width: '100%' }}
            disabled={!record.subscribed}
            tokenSeparators={[',', ' ']}
            value={record.ipWhitelist ?? []}
            placeholder="留空表示不限 IP"
            onChange={(nextValue) => updateItem(record.openApiCode, { ipWhitelist: nextValue })}
          />
          <Space wrap size={12}>
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary">并发上限</Typography.Text>
              <InputNumber
                precision={0}
                min={-1}
                style={{ width: 132 }}
                disabled={!record.subscribed}
                value={record.concurrencyLimit}
                placeholder="-1 表示不限"
                onChange={(nextValue) =>
                  updateItem(record.openApiCode, {
                    concurrencyLimit: typeof nextValue === 'number' ? nextValue : -1,
                  })
                }
              />
            </Space>
            <Space direction="vertical" size={4}>
              <Typography.Text type="secondary">日调用上限</Typography.Text>
              <InputNumber
                precision={0}
                min={-1}
                style={{ width: 152 }}
                disabled={!record.subscribed}
                value={record.dailyLimit}
                placeholder="-1 表示不限"
                onChange={(nextValue) =>
                  updateItem(record.openApiCode, {
                    dailyLimit: typeof nextValue === 'number' ? nextValue : -1,
                  })
                }
              />
            </Space>
          </Space>
        </Space>
      ),
    },
  ];

  return (
    <Drawer
      destroyOnClose
      title={`OpenAPI 订阅${tenant ? ` - ${tenant.name}` : ''}`}
      open={open}
      onClose={onClose}
      width="86vw"
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
              平台管理员可以为租户批量配置 OpenAPI 订阅，并约束每个接口的 IP 白名单、并发上限和单日调用上限。
            </Typography.Text>
            <Typography.Text type="secondary">
              `-1` 表示不限，`0` 不是合法值。批量操作只作用于当前筛选结果，且停用中的 OpenAPI 不会被批量订阅。
            </Typography.Text>
          </Space>
        </Card>

        <Card size="small">
          <Row gutter={[12, 12]}>
            <Col xs={24} sm={12} md={6}>
              <Statistic title="总 OpenAPI" value={items.length} />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic title="已启用" value={enabledCount} />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic title="已订阅" value={subscribedCount} />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Statistic title="当前筛选结果" value={filteredItems.length} suffix={`/ ${filteredSubscribedCount} 已订阅`} />
            </Col>
          </Row>
        </Card>

        <Card size="small">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap size={12}>
              <Input
                allowClear
                style={{ width: 280 }}
                value={keyword}
                placeholder="按名称、编码、路径、权限码检索"
                onChange={(event) => setKeyword(event.target.value)}
              />
              <Select
                allowClear
                style={{ width: 160 }}
                placeholder="所属服务"
                value={serviceFilter}
                options={serviceOptions}
                onChange={(value) => setServiceFilter(value)}
              />
              <Select
                allowClear
                style={{ width: 160 }}
                placeholder="HTTP 方法"
                value={methodFilter}
                options={methodOptions}
                onChange={(value) => setMethodFilter(value)}
              />
              <Select
                style={{ width: 160 }}
                placeholder="启用状态"
                value={availabilityFilter}
                options={[
                  { label: '全部状态', value: 'ALL' },
                  { label: '仅可订阅', value: 'ENABLED' },
                  { label: '仅已停用', value: 'DISABLED' },
                ]}
                onChange={(value) => setAvailabilityFilter(value as AvailabilityFilter)}
              />
              <Button onClick={resetFilters}>重置筛选</Button>
            </Space>

            <Space wrap size={12} align="center">
              <Segmented
                options={subscriptionFilterOptions}
                value={subscriptionFilter}
                onChange={(value) => setSubscriptionFilter(value as SubscriptionFilter)}
              />
              <Button type="primary" ghost disabled={filteredEnabledCount === 0} onClick={() => handleBatchToggle(true)}>
                订阅当前筛选
              </Button>
              <Button danger disabled={filteredSubscribedCount === 0} onClick={() => handleBatchToggle(false)}>
                取消当前筛选
              </Button>
              <Button disabled={filteredSubscribedCount === 0} onClick={handleBatchUnlimited}>
                当前筛选设为不限额
              </Button>
              <Typography.Text type="secondary">
                当前筛选里共有 {filteredItems.length} 个接口，其中 {filteredEnabledCount} 个可订阅。
              </Typography.Text>
            </Space>
          </Space>
        </Card>

        <Table<TenantOpenApiSubscriptionItem>
          rowKey="openApiCode"
          loading={loading}
          dataSource={filteredItems}
          columns={columns}
          pagination={false}
          scroll={{ x: 960, y: 560 }}
        />
      </Space>
    </Drawer>
  );
};

export default TenantOpenApiSubscriptionDrawer;
