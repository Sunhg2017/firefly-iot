import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Input,
  InputNumber,
  Modal,
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
import { ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { tenantApi } from '../../services/api';
import ListEmpty from '../../components/ListEmpty';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { getErrorMessage } from '../../utils/errors';

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

interface ToggleDraft {
  subscribed: boolean;
  codes: string[];
}

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
  const [dirty, setDirty] = useState(false);
  const [items, setItems] = useState<TenantOpenApiSubscriptionItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [serviceFilter, setServiceFilter] = useState<string>();
  const [methodFilter, setMethodFilter] = useState<string>();
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('ALL');
  const [toggleDraft, setToggleDraft] = useState<ToggleDraft | null>(null);

  const confirmDiscard = useConfirmDiscard();
  useDirtyGuard(open && dirty);

  const requestIdRef = useRef(0);

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
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await tenantApi.getOpenApiSubscriptions(tenant.id);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setItems(sortItems((res.data?.data ?? []) as TenantOpenApiSubscriptionItem[]));
      resetFilters();
      setDirty(false);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载租户 OpenAPI 订阅失败'));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
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
    setDirty(true);
  };

  const applySubscription = (codes: string[], subscribed: boolean) => {
    const codeSet = new Set(codes);
    setItems((current) =>
      current.map((item) => {
        if (!codeSet.has(item.openApiCode)) {
          return item;
        }
        return {
          ...item,
          subscribed,
          ipWhitelist: subscribed ? item.ipWhitelist ?? [] : [],
          concurrencyLimit: subscribed ? item.concurrencyLimit ?? -1 : -1,
          dailyLimit: subscribed ? item.dailyLimit ?? -1 : -1,
        };
      }),
    );
    setDirty(true);
  };

  const handleToggle = (record: TenantOpenApiSubscriptionItem, checked: boolean) => {
    if (submitting) {
      return;
    }
    if (checked) {
      applySubscription([record.openApiCode], true);
      message.success(`已将 ${record.name} 加入订阅草稿，保存订阅后生效`);
      return;
    }
    // 取消订阅会让租户立即失去该接口的调用权限；即使当前只是草稿，也要先说清后果。
    setToggleDraft({ subscribed: false, codes: [record.openApiCode] });
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

  const filteredItems = useMemo(() => sortItems(
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
  ), [availabilityFilter, items, methodFilter, normalizedKeyword, serviceFilter, subscriptionFilter]);

  const subscribedCount = items.filter((item) => item.subscribed).length;
  const enabledCount = items.filter((item) => item.enabled).length;
  const filteredSubscribedCount = filteredItems.filter((item) => item.subscribed).length;
  const filteredEnabledCount = filteredItems.filter((item) => item.enabled).length;

  const handleBatchToggle = (checked: boolean) => {
    if (submitting) {
      return;
    }
    const targetCodes = filteredItems
      .filter((item) => item.enabled && item.subscribed !== checked)
      .map((item) => item.openApiCode);
    if (targetCodes.length === 0) {
      message.info(checked ? '当前筛选结果里没有可订阅的 OpenAPI' : '当前筛选结果里没有可取消的 OpenAPI');
      return;
    }
    setToggleDraft({ subscribed: checked, codes: targetCodes });
  };

  const confirmToggleDraft = () => {
    if (!toggleDraft) {
      return;
    }
    applySubscription(toggleDraft.codes, toggleDraft.subscribed);
    message.success(
      toggleDraft.subscribed
        ? `已将 ${toggleDraft.codes.length} 个 OpenAPI 加入订阅草稿，保存订阅后生效`
        : `已从订阅草稿移除 ${toggleDraft.codes.length} 个 OpenAPI，保存订阅后生效`,
    );
    setToggleDraft(null);
  };

  const handleBatchUnlimited = () => {
    if (submitting) {
      return;
    }
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
    setDirty(true);
    message.success(`已将当前筛选的 ${targetCodes.size} 个已订阅 OpenAPI 设为不限额草稿，保存订阅后生效`);
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
      setDirty(false);
      onClose();
      onSaved?.();
    } catch (error) {
      // 保存失败时保留当前草稿并保持抽屉打开，避免用户重新勾选一遍。
      message.error(getErrorMessage(error, '保存租户 OpenAPI 订阅失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const closeDrawer = () => {
    if (submitting) {
      return;
    }
    confirmDiscard(dirty, () => {
      setDirty(false);
      onClose();
    });
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
          disabled={!record.enabled || submitting}
          loading={submitting}
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
            disabled={!record.subscribed || submitting}
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
                disabled={!record.subscribed || submitting}
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
                disabled={!record.subscribed || submitting}
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
      onClose={closeDrawer}
      width="86vw"
      styles={{ body: { paddingBottom: 24 } }}
      footer={(
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type="secondary">
            {dirty ? '有未保存的订阅修改，点击“保存订阅”后生效。' : '订阅开关和限额修改均需保存后生效。'}
          </Typography.Text>
          <Space>
            <Button onClick={closeDrawer} disabled={submitting}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSave()}>
              保存订阅
            </Button>
          </Space>
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

        {dirty ? (
          <Alert
            type="warning"
            showIcon
            message="订阅修改尚未保存"
            description="离开前请点击“保存订阅”，否则本次对订阅、IP 白名单和限额的修改不会生效。"
          />
        ) : null}

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
              <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>
                刷新
              </Button>
            </Space>

            <Space wrap size={12} align="center">
              <Segmented
                options={subscriptionFilterOptions}
                value={subscriptionFilter}
                onChange={(value) => setSubscriptionFilter(value as SubscriptionFilter)}
              />
              <Button type="primary" ghost disabled={filteredEnabledCount === 0 || submitting} onClick={() => handleBatchToggle(true)}>
                订阅当前筛选
              </Button>
              <Button danger disabled={filteredSubscribedCount === 0 || submitting} onClick={() => handleBatchToggle(false)}>
                取消当前筛选
              </Button>
              <Button disabled={filteredSubscribedCount === 0 || submitting} onClick={handleBatchUnlimited}>
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
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={Boolean(keyword || serviceFilter || methodFilter || subscriptionFilter !== 'ALL' || availabilityFilter !== 'ALL')}
                emptyText="暂无可订阅的 OpenAPI"
                filteredText="没有符合当前筛选条件的 OpenAPI"
                onClearFilters={resetFilters}
              />
            ),
          }}
        />
      </Space>

      <Modal
        open={Boolean(toggleDraft)}
        title={toggleDraft?.subscribed ? '订阅所选 OpenAPI' : '取消所选 OpenAPI 订阅'}
        okText={toggleDraft?.subscribed ? '加入订阅草稿' : '取消订阅'}
        cancelText="取消"
        okButtonProps={{ danger: toggleDraft ? !toggleDraft.subscribed : false }}
        onOk={confirmToggleDraft}
        onCancel={() => setToggleDraft(null)}
        destroyOnClose
      >
        {toggleDraft ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              本次操作影响 <Typography.Text strong>{toggleDraft.codes.length}</Typography.Text> 个接口：
              {toggleDraft.codes.slice(0, 5).join('、')}
              {toggleDraft.codes.length > 5 ? ` 等 ${toggleDraft.codes.length} 个` : ''}
            </Typography.Text>
            {toggleDraft.subscribed ? (
              <Typography.Text>
                加入草稿后，点击“保存订阅”才会让租户获得这些接口的调用权限；停用的接口不会被订阅。
              </Typography.Text>
            ) : (
              <Typography.Text>
                取消后租户将无法再调用这些接口；保存订阅后立即生效，如需恢复需要重新订阅并保存。
              </Typography.Text>
            )}
          </Space>
        ) : null}
      </Modal>
    </Drawer>
  );
};

export default TenantOpenApiSubscriptionDrawer;
