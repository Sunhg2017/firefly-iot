import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { tenantWebhookApi } from '../../services/api';
import { notificationChannelColors, notificationChannelLabels } from '../../constants/notification';
import ListEmpty from '../../components/ListEmpty';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

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

interface ToggleTarget {
  item: WebhookItem;
  enabled: boolean;
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
  const [editorDirty, setEditorDirty] = useState(false);
  const [record, setRecord] = useState<WebhookItem | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ToggleTarget | null>(null);
  const [toggleSubmitting, setToggleSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebhookItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [form] = Form.useForm<WebhookFormValues>();

  const confirmDiscard = useConfirmDiscard();
  useDirtyGuard(editorOpen && editorDirty);

  const requestIdRef = useRef(0);

  const fetchData = async () => {
    if (!tenantId) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    try {
      const res = await tenantWebhookApi.list(tenantId);
      if (requestId !== requestIdRef.current) {
        return;
      }
      setData(res.data?.data || []);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载租户 Webhook 失败'));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (open && tenantId) {
      void fetchData();
    }
  }, [open, tenantId]);

  const openEditor = (item?: WebhookItem) => {
    setRecord(item ?? null);
    setEditorDirty(false);
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

  const closeEditor = () => {
    confirmDiscard(editorDirty, () => {
      setEditorOpen(false);
      setEditorDirty(false);
    });
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
      setEditorDirty(false);
      setEditorOpen(false);
      await fetchData();
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '保存租户 Webhook 失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmToggle = async () => {
    if (!tenantId || !toggleTarget) return;
    const { item, enabled } = toggleTarget;
    const previousEnabled = item.enabled;
    // 先乐观更新 Switch，失败时回滚，避免用户重复点击。
    setData((current) => current.map((row) => (row.id === item.id ? { ...row, enabled } : row)));
    setToggleSubmitting(true);
    try {
      await tenantWebhookApi.toggle(tenantId, item.id, enabled);
      message.success(enabled ? 'Webhook 已启用' : 'Webhook 已停用');
      setToggleTarget(null);
    } catch (error) {
      setData((current) => current.map((row) => (row.id === item.id ? { ...row, enabled: previousEnabled } : row)));
      message.error(getErrorMessage(error, '更新 Webhook 状态失败'));
    } finally {
      setToggleSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!tenantId || !deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await tenantWebhookApi.delete(tenantId, deleteTarget.id);
      message.success('租户 Webhook 已删除');
      setDeleteTarget(null);
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除 Webhook 失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleTest = async (item: WebhookItem) => {
    if (!tenantId) return;
    setTestingId(item.id);
    try {
      const res = await tenantWebhookApi.test(tenantId, item.id);
      message.success(typeof res.data?.data === 'string' && res.data.data ? res.data.data : '测试请求已发送，请检查接收端是否收到');
    } catch (error) {
      message.error(getErrorMessage(error, '测试 Webhook 失败'));
    } finally {
      setTestingId(null);
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
          loading={toggleSubmitting && toggleTarget?.item.id === item.id}
          disabled={toggleSubmitting || deleteSubmitting}
          onChange={(checked) => setToggleTarget({ item, enabled: checked })}
        />
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: (value?: string) => (value ? formatDateTime(value) : '-') },
    {
      title: '操作',
      width: 240,
      render: (_value, item) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={testingId === item.id}
            disabled={testingId !== null && testingId !== item.id}
            onClick={() => void handleTest(item)}
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
            onClick={() => setDeleteTarget(item)}
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
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              新建 Webhook
            </Button>
          </Space>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          scroll={{ x: 860 }}
          locale={{ emptyText: <ListEmpty emptyText="该租户尚未配置 Webhook 渠道" /> }}
        />
      </Drawer>

      <Drawer
        title={record ? '编辑租户 Webhook' : '新建租户 Webhook'}
        open={editorOpen}
        onClose={closeEditor}
        width={560}
        destroyOnClose
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeEditor} disabled={submitting}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void save()}>
              {record ? '保存修改' : '创建 Webhook'}
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onValuesChange={() => setEditorDirty(true)}
        >
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
          <Form.Item name="enabled" label="启用状态" valuePropName="checked" extra="启用后会立即向该地址推送事件；停用后外部系统将收不到通知">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        open={Boolean(toggleTarget)}
        title={toggleTarget?.enabled ? '启用 Webhook' : '停用 Webhook'}
        okText={toggleTarget?.enabled ? '确认启用' : '确认停用'}
        cancelText="取消"
        okButtonProps={{ danger: toggleTarget ? !toggleTarget.enabled : false }}
        confirmLoading={toggleSubmitting}
        maskClosable={!toggleSubmitting}
        onCancel={() => {
          if (!toggleSubmitting) {
            setToggleTarget(null);
          }
        }}
        onOk={() => void handleConfirmToggle()}
        destroyOnClose
      >
        {toggleTarget ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              渠道：<Typography.Text strong>{toggleTarget.item.name}</Typography.Text>
            </Typography.Text>
            {toggleTarget.enabled ? (
              <>
                <Typography.Text>启用后平台会向该 Webhook 地址推送告警和事件通知。</Typography.Text>
                <Typography.Text type="secondary">
                  请先确认接收端地址可达、证书有效且能正确处理请求，否则通知会持续失败。
                </Typography.Text>
              </>
            ) : (
              <>
                <Typography.Text>停用后该渠道将不再接收任何事件推送，依赖该地址的外部系统会收不到通知。</Typography.Text>
                <Typography.Text type="secondary">
                  可随时重新启用；停用不会删除渠道配置和历史记录。
                </Typography.Text>
              </>
            )}
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title="删除 Webhook 渠道"
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={deleteSubmitting}
        maskClosable={!deleteSubmitting}
        onCancel={() => {
          if (!deleteSubmitting) {
            setDeleteTarget(null);
          }
        }}
        onOk={() => void handleConfirmDelete()}
        destroyOnClose
      >
        {deleteTarget ? (
          <Space direction="vertical" size={8}>
            <Alert
              type="warning"
              showIcon
              message="删除后无法恢复"
              description="该渠道将不再接收事件推送，外部系统会立即失去通知；如需恢复，必须重新创建渠道并配置地址、请求方法和签名密钥。"
            />
            <Typography.Text>
              确认删除 <Typography.Text strong>{deleteTarget.name}</Typography.Text>？
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>
    </>
  );
};

export default TenantWebhookDrawer;
