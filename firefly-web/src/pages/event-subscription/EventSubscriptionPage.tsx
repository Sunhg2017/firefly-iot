import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, message } from 'antd';
import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import JsonEditorField from '../../components/JsonEditorField';
import { eventSubscriptionApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';

type ForwardStatus = 'ENABLED' | 'DISABLED';

interface EventSubscriptionRecord {
  id: number;
  name: string;
  eventTypes: string[];
  webhookUrl: string;
  secret?: string;
  headers?: Record<string, string>;
  status: ForwardStatus;
  deliveryCount: number;
  successCount: number;
  errorCount: number;
  lastDeliveredAt?: string;
  createdAt: string;
}

interface EventSubscriptionFormValues {
  name: string;
  eventTypes: string[];
  webhookUrl: string;
  secret?: string;
  headers?: string;
}

const statusMeta: Record<ForwardStatus, { label: string; color: string }> = {
  ENABLED: { label: '已启用', color: 'success' },
  DISABLED: { label: '已停用', color: 'default' },
};

const eventTypeMeta: Record<string, { label: string; color: string }> = {
  DEVICE_CREATED: { label: '设备创建', color: 'blue' },
  DEVICE_ONLINE: { label: '设备上线', color: 'green' },
  DEVICE_OFFLINE: { label: '设备离线', color: 'orange' },
  ALERT_TRIGGERED: { label: '告警触发', color: 'red' },
  OTA_PROGRESS: { label: 'OTA 进度', color: 'purple' },
};

const eventTypeOptions = Object.entries(eventTypeMeta).map(([value, meta]) => ({ value, label: meta.label }));

const headerTemplates = [
  { key: 'custom', label: '自定义请求头', value: JSON.stringify({ 'X-Custom-Header': 'value' }, null, 2) },
];

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function formatJsonForEditor(value?: Record<string, string>): string {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

/** 生成 32 字节随机十六进制密钥，接收方用同一个值校验 HMAC-SHA256 签名。 */
function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const EventSubscriptionPage: React.FC = () => {
  const [data, setData] = useState<EventSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filters, setFilters] = useState<{ keyword: string; status?: ForwardStatus }>({ keyword: '' });
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; status?: ForwardStatus }>({ keyword: '' });
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<EventSubscriptionFormValues>();
  const [formDirty, setFormDirty] = useState(false);
  const [editLoadingId, setEditLoadingId] = useState<number | null>(null);
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const pendingRowsRef = useRef<Set<string>>(new Set());

  useDirtyGuard(drawerMode !== null && formDirty);
  const confirmDiscard = useConfirmDiscard();

  const hasFilters = Boolean(filters.keyword || filters.status);

  const loadSubscriptions = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await eventSubscriptionApi.list({
        pageNum: params.pageNum,
        pageSize: params.pageSize,
        keyword: normalizeOptionalText(filters.keyword),
        status: filters.status,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      setData([]);
      setTotal(0);
      setLoadError(getErrorMessage(error, '加载事件订阅失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, [filters, params.pageNum, params.pageSize]);

  usePageActivation(() => {
    void loadSubscriptions();
  });

  const runRowAction = async (key: string, task: () => Promise<void>) => {
    if (pendingRowsRef.current.has(key)) {
      return;
    }
    pendingRowsRef.current.add(key);
    setPendingRows(new Set(pendingRowsRef.current));
    try {
      await task();
    } finally {
      pendingRowsRef.current.delete(key);
      setPendingRows(new Set(pendingRowsRef.current));
    }
  };

  const applyFilters = () => {
    setFilters({ keyword: draftFilters.keyword.trim(), status: draftFilters.status });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const openCreateDrawer = () => {
    form.resetFields();
    form.setFieldsValue({ eventTypes: [], headers: formatJsonForEditor() });
    setFormDirty(false);
    setEditingId(null);
    setDrawerMode('create');
  };

  const closeDrawer = () => {
    confirmDiscard(formDirty, () => {
      setDrawerMode(null);
      setEditingId(null);
      setFormDirty(false);
      form.resetFields();
    });
  };

  const openEditDrawer = async (record: EventSubscriptionRecord) => {
    if (editLoadingId != null) {
      return;
    }
    setEditLoadingId(record.id);
    try {
      // 详情加载成功后再打开抽屉，避免先展示上一条订阅的数据。
      const res = await eventSubscriptionApi.get(record.id);
      const detail = res.data.data as EventSubscriptionRecord;
      form.resetFields();
      form.setFieldsValue({
        name: detail.name,
        eventTypes: detail.eventTypes || [],
        webhookUrl: detail.webhookUrl,
        secret: detail.secret ?? undefined,
        headers: formatJsonForEditor(detail.headers),
      });
      setFormDirty(false);
      setEditingId(detail.id ?? record.id);
      setDrawerMode('edit');
    } catch (error) {
      message.error(getErrorMessage(error, '加载订阅详情失败'));
    } finally {
      setEditLoadingId(null);
    }
  };

  const handleSubmit = async (values: EventSubscriptionFormValues) => {
    if (submitting) {
      return;
    }
    let headers: Record<string, string> | undefined;
    const rawHeaders = normalizeOptionalText(values.headers);
    if (rawHeaders) {
      try {
        const parsed = JSON.parse(rawHeaders) as unknown;
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          message.error('自定义请求头必须是 JSON 对象');
          return;
        }
        const entries = Object.entries(parsed as Record<string, unknown>);
        if (entries.some(([, headerValue]) => typeof headerValue !== 'string')) {
          message.error('自定义请求头的值必须是字符串');
          return;
        }
        headers = entries.length > 0 ? (Object.fromEntries(entries) as Record<string, string>) : undefined;
      } catch {
        message.error('自定义请求头不是合法 JSON');
        return;
      }
    }

    const payload = {
      name: values.name.trim(),
      eventTypes: values.eventTypes || [],
      webhookUrl: values.webhookUrl.trim(),
      secret: normalizeOptionalText(values.secret),
      headers,
    };

    setSubmitting(true);
    try {
      if (drawerMode === 'edit' && editingId) {
        await eventSubscriptionApi.update(editingId, payload);
        message.success('订阅已更新');
      } else {
        await eventSubscriptionApi.create(payload);
        message.success('订阅已创建');
      }
      setDrawerMode(null);
      setEditingId(null);
      setFormDirty(false);
      form.resetFields();
      await loadSubscriptions();
    } catch (error) {
      message.error(getErrorMessage(error, drawerMode === 'edit' ? '更新订阅失败' : '创建订阅失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (record: EventSubscriptionRecord) => {
    await runRowAction(`toggle:${record.id}`, async () => {
      try {
        if (record.status === 'ENABLED') {
          await eventSubscriptionApi.disable(record.id);
          message.success('订阅已停用');
        } else {
          await eventSubscriptionApi.enable(record.id);
          message.success('订阅已启用');
        }
        await loadSubscriptions();
      } catch (error) {
        message.error(getErrorMessage(error, record.status === 'ENABLED' ? '停用订阅失败' : '启用订阅失败'));
      }
    });
  };

  const handleDelete = (record: EventSubscriptionRecord) => {
    Modal.confirm({
      title: '确认删除订阅',
      content: `删除后不可恢复，确认删除“${record.name}”？`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => runRowAction(`delete:${record.id}`, async () => {
        try {
          await eventSubscriptionApi.delete(record.id);
          message.success('订阅已删除');
          await loadSubscriptions();
        } catch (error) {
          message.error(getErrorMessage(error, '删除订阅失败'));
        }
      }),
    });
  };

  const columns: ColumnsType<EventSubscriptionRecord> = [
    { title: '订阅名称', dataIndex: 'name', render: (value: string) => value || '-' },
    {
      title: '事件类型',
      dataIndex: 'eventTypes',
      width: 260,
      render: (value: string[]) =>
        (value || []).map((type) => (
          <Tag key={type} color={eventTypeMeta[type]?.color}>
            {eventTypeMeta[type]?.label || type}
          </Tag>
        )),
    },
    { title: '回调地址', dataIndex: 'webhookUrl', ellipsis: true, render: (value: string) => <CopyText text={value} ellipsis /> },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: ForwardStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>,
    },
    {
      title: '投递/成功/失败',
      width: 160,
      render: (_, record) => (
        <Space size={4}>
          <Tag color="blue">{record.deliveryCount || 0}</Tag>
          <Tag color="green">{record.successCount || 0}</Tag>
          <Tag color="red">{record.errorCount || 0}</Tag>
        </Space>
      ),
    },
    {
      title: '最近投递',
      dataIndex: 'lastDeliveredAt',
      width: 170,
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" loading={editLoadingId === record.id} onClick={() => void openEditDrawer(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={record.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            loading={pendingRows.has(`toggle:${record.id}`)}
            onClick={() => void handleToggle(record)}
          >
            {record.status === 'ENABLED' ? '停用' : '启用'}
          </Button>
          <Tooltip title={record.status === 'ENABLED' ? '请先停用后再删除' : '删除订阅'}>
            <span style={{ display: 'inline-block', cursor: record.status === 'ENABLED' ? 'not-allowed' : undefined }}>
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={record.status === 'ENABLED'}
                loading={pendingRows.has(`delete:${record.id}`)}
                onClick={() => handleDelete(record)}
              >
                删除
              </Button>
            </span>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="事件订阅"
        description="停用后停止投递；签名密钥需与接收方保持一致。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            新建订阅
          </Button>
        }
      />

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="订阅名称"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
            style={{ width: 220 }}
          />
          <Select
            placeholder="状态"
            allowClear
            value={draftFilters.status}
            options={[
              { value: 'ENABLED', label: '已启用' },
              { value: 'DISABLED', label: '已停用' },
            ]}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
            style={{ width: 120 }}
          />
          <Button type="primary" onClick={applyFilters}>
            查询
          </Button>
          <Button onClick={resetFilters}>重置</Button>
        </Space>

        {loadError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="加载事件订阅失败"
            description={loadError}
            action={<Button size="small" danger onClick={() => void loadSubscriptions()}>重试</Button>}
          />
        ) : null}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <ListEmpty hasFilters={hasFilters} emptyText="暂无事件订阅" onClearFilters={resetFilters} /> }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 条`,
            onChange: (pageNum, pageSize) => setParams({ pageNum, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={drawerMode === 'edit' ? '编辑事件订阅' : '新建事件订阅'}
        width={520}
        open={drawerMode !== null}
        onClose={closeDrawer}
        destroyOnClose
        maskClosable={false}
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)} onValuesChange={() => setFormDirty(true)}>
          <Form.Item name="name" label="订阅名称" rules={[{ required: true, message: '请输入订阅名称' }]}>
            <Input placeholder="例如：设备上下线通知" maxLength={256} />
          </Form.Item>
          <Form.Item name="eventTypes" label="事件类型" rules={[{ required: true, message: '请选择至少一个事件类型' }]}>
            <Select mode="multiple" options={eventTypeOptions} placeholder="选择要订阅的平台事件" />
          </Form.Item>
          <Form.Item
            name="webhookUrl"
            label="回调地址"
            rules={[{ required: true, message: '请输入回调地址' }, { type: 'url', message: '请输入合法的 URL' }]}
          >
            <Input placeholder="https://example.com/hooks/device-event" maxLength={512} />
          </Form.Item>
          <Form.Item
            name="secret"
            label="签名密钥（可选）"
            extra="投递时使用该密钥生成 X-Firefly-Signature（HMAC-SHA256），必须与接收方配置一致；可手动修改。"
          >
            <Input.Password
              placeholder="留空则不签名"
              addonAfter={
                <Button type="text" size="small" onClick={() => {
                  form.setFieldsValue({ secret: generateSecret() });
                  setFormDirty(true);
                }}
                >
                  随机生成
                </Button>
              }
            />
          </Form.Item>
          <Form.Item name="headers" label="自定义请求头（可选）">
            <JsonEditorField height={150} path="headers.json" templates={headerTemplates} hint="JSON 对象，值必须为字符串" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default EventSubscriptionPage;
