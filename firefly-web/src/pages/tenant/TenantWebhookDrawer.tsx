import React, { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { tenantWebhookApi } from '../../services/api';
import { notificationChannelColors, notificationChannelLabels } from '../../constants/notification';

interface TenantWebhookDrawerProps {
  open: boolean;
  tenantId?: number;
  tenantName?: string;
  onClose: () => void;
}

interface WebhookItem {
  id: number;
  name: string;
  type: string;
  config: string;
  enabled: boolean;
  updatedAt?: string;
}

interface WebhookFormValues {
  name?: string;
  enabled?: boolean;
  url?: string;
  method?: string;
  contentType?: string;
  secret?: string;
}

const parseConfig = (value: string) => {
  try {
    return JSON.parse(value || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};

const buildPayload = (values: WebhookFormValues) => ({
  name: values.name,
  type: 'WEBHOOK',
  enabled: values.enabled ?? true,
  config: JSON.stringify({
    url: values.url,
    method: values.method || 'POST',
    contentType: values.contentType || 'application/json',
    secret: values.secret,
  }),
});

const TenantWebhookDrawer: React.FC<TenantWebhookDrawerProps> = ({ open, tenantId, tenantName, onClose }) => {
  const [data, setData] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [record, setRecord] = useState<WebhookItem | null>(null);
  const [form] = Form.useForm<WebhookFormValues>();

  const fetchData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await tenantWebhookApi.list(tenantId);
      setData(res.data?.data || []);
    } catch {
      message.error('加载租户 Webhook 失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && tenantId) {
      void fetchData();
    }
  }, [open, tenantId]);

  const openEditor = (item?: WebhookItem) => {
    setRecord(item ?? null);
    if (!item) {
      form.resetFields();
      form.setFieldsValue({ enabled: true, method: 'POST', contentType: 'application/json' });
      setEditorOpen(true);
      return;
    }
    const config = parseConfig(item.config);
    form.setFieldsValue({
      name: item.name,
      enabled: item.enabled,
      url: typeof config.url === 'string' ? config.url : '',
      method: typeof config.method === 'string' ? config.method : 'POST',
      contentType: typeof config.contentType === 'string' ? config.contentType : 'application/json',
      secret: typeof config.secret === 'string' ? config.secret : '',
    });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!tenantId) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload = buildPayload(values);
      if (record) {
        await tenantWebhookApi.update(tenantId, record.id, payload);
        message.success('租户 Webhook 已更新');
      } else {
        await tenantWebhookApi.create(tenantId, payload);
        message.success('租户 Webhook 已创建');
      }
      setEditorOpen(false);
      await fetchData();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      if (error instanceof Error && error.message) {
        message.error(error.message);
      } else {
        message.error('保存租户 Webhook 失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<WebhookItem> = [
    { title: '名称', dataIndex: 'name', width: 220 },
    {
      title: '类型',
      dataIndex: 'type',
      width: 120,
      render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 100,
      render: (value: boolean, item) => (
        <Switch
          checked={value}
          size="small"
          onChange={async (checked) => {
            if (!tenantId) return;
            await tenantWebhookApi.toggle(tenantId, item.id, checked);
            await fetchData();
          }}
        />
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: (value?: string) => value || '-' },
    {
      title: '操作',
      width: 240,
      render: (_value, item) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            onClick={async () => {
              if (!tenantId) return;
              const res = await tenantWebhookApi.test(tenantId, item.id);
              message.info(res.data?.data || '测试完成');
            }}
          >
            测试
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditor(item)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() =>
              Modal.confirm({
                title: '删除租户 Webhook',
                content: `确定删除“${item.name}”吗？`,
                onOk: async () => {
                  if (!tenantId) return;
                  await tenantWebhookApi.delete(tenantId, item.id);
                  await fetchData();
                },
              })
            }
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Drawer
        title={`Webhook 管理${tenantName ? ` - ${tenantName}` : ''}`}
        open={open}
        onClose={onClose}
        width={900}
        destroyOnClose
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
            新建 Webhook
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 860 }} />
      </Drawer>

      <Drawer
        title={record ? '编辑租户 Webhook' : '新建租户 Webhook'}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        width={560}
        destroyOnClose
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditorOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void save()}>
              {record ? '保存修改' : '创建 Webhook'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Webhook 名称" rules={[{ required: true, message: '请输入 Webhook 名称' }]}>
            <Input placeholder="例如：租户业务回调" />
          </Form.Item>
          <Form.Item name="url" label="Webhook 地址" rules={[{ required: true, message: '请输入 Webhook 地址' }]}>
            <Input placeholder="https://example.com/hooks/alarm" />
          </Form.Item>
          <Form.Item name="method" label="请求方法" rules={[{ required: true, message: '请选择请求方法' }]}>
            <Select options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} />
          </Form.Item>
          <Form.Item name="contentType" label="Content-Type" rules={[{ required: true, message: '请选择 Content-Type' }]}>
            <Select options={[{ value: 'application/json', label: 'application/json' }, { value: 'text/plain', label: 'text/plain' }]} />
          </Form.Item>
          <Form.Item name="secret" label="签名密钥">
            <Input.Password placeholder="可选" />
          </Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

export default TenantWebhookDrawer;
