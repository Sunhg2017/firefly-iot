import React, { useEffect, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Modal, Select, Space, Table, Tag, message } from 'antd';
import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { eventSubscriptionApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

const { TextArea } = Input;

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

function normalizeOptionalText(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function formatJsonForEditor(value?: Record<string, string>): string {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

const EventSubscriptionPage: React.FC = () => {
  const [data, setData] = useState<EventSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filters, setFilters] = useState<{ keyword: string; status?: ForwardStatus }>({ keyword: '' });
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; status?: ForwardStatus }>({ keyword: '' });
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<EventSubscriptionFormValues>();

  const loadSubscriptions = async () => {
    setLoading(true);
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
    } catch {
      message.error('加载事件订阅失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscriptions();
  }, [filters, params.pageNum, params.pageSize]);

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
    setDrawerMode('create');
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ eventTypes: [], headers: formatJsonForEditor() });
  };

  const closeDrawer = () => {
    setDrawerMode(null);
    setEditingId(null);
    form.resetFields();
  };

  const openEditDrawer = async (record: EventSubscriptionRecord) => {
    setDrawerMode('edit');
    setEditingId(record.id);
    try {
      const res = await eventSubscriptionApi.get(record.id);
      const detail = res.data.data as EventSubscriptionRecord;
      form.setFieldsValue({
        name: detail.name,
        eventTypes: detail.eventTypes || [],
        webhookUrl: detail.webhookUrl,
        secret: detail.secret,
        headers: formatJsonForEditor(detail.headers),
      });
    } catch {
      message.error('加载订阅详情失败');
      setDrawerMode(null);
      setEditingId(null);
    }
  };

  const handleSubmit = async (values: EventSubscriptionFormValues) => {
    let headers: Record<string, string> | undefined;
    const rawHeaders = normalizeOptionalText(values.headers);
    if (rawHeaders) {
      try {
        headers = JSON.parse(rawHeaders) as Record<string, string>;
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
      closeDrawer();
      void loadSubscriptions();
    } catch {
      message.error(drawerMode === 'edit' ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (record: EventSubscriptionRecord) => {
    try {
      if (record.status === 'ENABLED') {
        await eventSubscriptionApi.disable(record.id);
        message.success('订阅已停用');
      } else {
        await eventSubscriptionApi.enable(record.id);
        message.success('订阅已启用');
      }
      void loadSubscriptions();
    } catch {
      message.error('状态更新失败');
    }
  };

  const handleDelete = (record: EventSubscriptionRecord) => {
    Modal.confirm({
      title: '确认删除订阅',
      content: `删除后不可恢复，确认删除“${record.name}”？`,
      onOk: async () => {
        try {
          await eventSubscriptionApi.delete(record.id);
          message.success('订阅已删除');
          void loadSubscriptions();
        } catch {
          message.error('删除失败');
        }
      },
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
    { title: '回调地址', dataIndex: 'webhookUrl', ellipsis: true },
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
          <Button type="link" size="small" onClick={() => void openEditDrawer(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={record.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={() => void handleToggle(record)}
          >
            {record.status === 'ENABLED' ? '停用' : '启用'}
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="事件订阅"
        description="订阅设备创建、上下线、告警触发、OTA 进度等平台事件，通过带 HMAC 签名的 Webhook 推送。"
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

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
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
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
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
          <Form.Item name="secret" label="签名密钥（可选）">
            <Input.Password placeholder="配置后投递会携带 X-Firefly-Signature (HMAC-SHA256)" />
          </Form.Item>
          <Form.Item name="headers" label="自定义请求头（可选）">
            <TextArea rows={4} placeholder='{"X-Custom": "value"}' style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default EventSubscriptionPage;
