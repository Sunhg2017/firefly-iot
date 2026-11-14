import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { notificationChannelApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';
import {
  notificationChannelColors,
  notificationChannelLabels,
  notificationChannelOptions,
} from '../../constants/notification';

const platformChannelOptions = notificationChannelOptions.filter((item) => item.value !== 'WEBHOOK');

interface ChannelItem {
  id: number;
  name: string;
  type: string;
  config: string;
  enabled: boolean;
  updatedAt: string;
}

interface ChannelFormValues {
  name: string;
  type: string;
  enabled: boolean;
  // EMAIL
  smtpHost?: string;
  smtpPort?: number;
  username?: string;
  password?: string;
  from?: string;
  useSsl?: boolean;
  // WEBHOOK
  url?: string;
  method?: string;
  contentType?: string;
  secret?: string;
  // SMS / PHONE
  apiUrl?: string;
  provider?: string;
  token?: string;
  signName?: string;
  templateId?: string;
  callerId?: string;
  // WECHAT / DINGTALK
  webhookUrl?: string;
  messageType?: string;
  mentionedList?: string;
  mentionedMobileList?: string;
  atMobiles?: string;
  isAtAll?: boolean;
  // IN_APP
  messageSource?: string;
  messageLevel?: string;
  messageCategory?: string;
}

const parseConfig = (value: string) => {
  try {
    return JSON.parse(value || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);
const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
};
const toCsv = (value: unknown) => (Array.isArray(value) ? value.map((item) => String(item)).join(', ') : '');
const splitCsv = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Maps the persisted channel config back into form fields.
 *
 * Only known keys of the selected channel type are copied. Spreading the raw config
 * would let a config key such as IN_APP's `type` (message category) overwrite the
 * channel type selected in the form, which previously made the editor show SYSTEM
 * and drop all IN_APP fields.
 */
const buildConfigFormValues = (type: string, config: Record<string, unknown>): Partial<ChannelFormValues> => {
  switch (type) {
    case 'EMAIL':
      return {
        smtpHost: asString(config.smtpHost),
        smtpPort: asNumber(config.smtpPort),
        username: asString(config.username),
        password: asString(config.password),
        from: asString(config.from),
        useSsl: asBoolean(config.useSsl),
      };
    case 'WEBHOOK':
      return {
        url: asString(config.url),
        method: asString(config.method),
        contentType: asString(config.contentType),
        secret: asString(config.secret),
      };
    case 'SMS':
    case 'PHONE':
      return {
        apiUrl: asString(config.apiUrl),
        provider: asString(config.provider),
        token: asString(config.token),
        signName: asString(config.signName),
        templateId: asString(config.templateId),
        callerId: asString(config.callerId),
      };
    case 'WECHAT':
      return {
        webhookUrl: asString(config.webhookUrl),
        messageType: asString(config.messageType),
        mentionedList: toCsv(config.mentionedList),
        mentionedMobileList: toCsv(config.mentionedMobileList),
      };
    case 'DINGTALK':
      return {
        webhookUrl: asString(config.webhookUrl),
        secret: asString(config.secret),
        messageType: asString(config.messageType),
        atMobiles: toCsv(config.atMobiles),
        isAtAll: asBoolean(config.isAtAll),
      };
    case 'IN_APP':
      return {
        messageSource: asString(config.source),
        messageLevel: asString(config.level),
        messageCategory: asString(config.type),
      };
    default:
      return {};
  }
};

const renderChannelFields = (type: string) => {
  switch (type) {
    case 'EMAIL':
      return (
        <>
          <Form.Item name="smtpHost" label="SMTP 主机" rules={[{ required: true, message: '请输入 SMTP 主机' }]}><Input /></Form.Item>
          <Form.Item name="smtpPort" label="SMTP 端口" rules={[{ required: true, message: '请输入 SMTP 端口' }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="username" label="登录账号" rules={[{ required: true, message: '请输入登录账号' }]}><Input /></Form.Item>
          <Form.Item name="password" label="登录密码" rules={[{ required: true, message: '请输入登录密码' }]}><Input.Password /></Form.Item>
          <Form.Item name="from" label="发件人地址"><Input placeholder="不填则默认使用登录账号" /></Form.Item>
          <Form.Item name="useSsl" label="启用 SSL" valuePropName="checked"><Switch /></Form.Item>
        </>
      );
    case 'WEBHOOK':
      return (
        <>
          <Form.Item name="url" label="Webhook 地址" rules={[{ required: true, message: '请输入 Webhook 地址' }]}><Input /></Form.Item>
          <Form.Item name="method" label="请求方法"><Select options={[{ value: 'POST', label: 'POST' }, { value: 'GET', label: 'GET' }]} /></Form.Item>
          <Form.Item name="contentType" label="Content-Type"><Select options={[{ value: 'application/json', label: 'application/json' }, { value: 'text/plain', label: 'text/plain' }]} /></Form.Item>
          <Form.Item name="secret" label="签名密钥"><Input.Password /></Form.Item>
        </>
      );
    case 'SMS':
    case 'PHONE':
      return (
        <>
          <Form.Item name="apiUrl" label="网关地址" rules={[{ required: true, message: '请输入网关地址' }]}><Input /></Form.Item>
          <Form.Item name="provider" label="供应商标识"><Input /></Form.Item>
          <Form.Item name="token" label="访问令牌"><Input.Password /></Form.Item>
          <Form.Item name="signName" label="签名"><Input /></Form.Item>
          <Form.Item name="templateId" label="供应商模板 ID"><Input /></Form.Item>
          {type === 'PHONE' && <Form.Item name="callerId" label="主叫号码"><Input /></Form.Item>}
        </>
      );
    case 'WECHAT':
      return (
        <>
          <Form.Item name="webhookUrl" label="机器人地址" rules={[{ required: true, message: '请输入机器人地址' }]}><Input /></Form.Item>
          <Form.Item name="messageType" label="消息格式"><Select options={[{ value: 'markdown', label: 'Markdown' }, { value: 'text', label: '文本' }]} /></Form.Item>
          <Form.Item name="mentionedList" label="提醒成员账号"><Input placeholder="多个账号用英文逗号分隔" /></Form.Item>
          <Form.Item name="mentionedMobileList" label="提醒手机号"><Input placeholder="多个手机号用英文逗号分隔" /></Form.Item>
        </>
      );
    case 'DINGTALK':
      return (
        <>
          <Form.Item name="webhookUrl" label="机器人地址" rules={[{ required: true, message: '请输入机器人地址' }]}><Input /></Form.Item>
          <Form.Item name="secret" label="加签密钥"><Input.Password /></Form.Item>
          <Form.Item name="messageType" label="消息格式"><Select options={[{ value: 'markdown', label: 'Markdown' }, { value: 'text', label: '文本' }]} /></Form.Item>
          <Form.Item name="atMobiles" label="@手机号"><Input placeholder="多个手机号用英文逗号分隔" /></Form.Item>
          <Form.Item name="isAtAll" label="全员提醒" valuePropName="checked"><Switch /></Form.Item>
        </>
      );
    case 'IN_APP':
      return (
        <>
          <Form.Item name="messageSource" label="默认来源"><Input placeholder="NOTIFICATION_CENTER" /></Form.Item>
          <Form.Item name="messageLevel" label="默认级别"><Select options={[{ value: 'INFO', label: 'INFO' }, { value: 'WARN', label: 'WARN' }, { value: 'ERROR', label: 'ERROR' }]} /></Form.Item>
          <Form.Item name="messageCategory" label="默认类别"><Select options={[{ value: 'SYSTEM', label: 'SYSTEM' }, { value: 'ALARM', label: 'ALARM' }, { value: 'NOTICE', label: 'NOTICE' }]} /></Form.Item>
        </>
      );
    default:
      return null;
  }
};

const buildPayload = (values: ChannelFormValues) => {
  const type = values.type || 'EMAIL';
  const config: Record<string, unknown> = {};
  if (type === 'EMAIL') {
    Object.assign(config, {
      smtpHost: values.smtpHost,
      smtpPort: values.smtpPort || 465,
      username: values.username,
      password: values.password,
      from: values.from,
      useSsl: values.useSsl ?? true,
    });
  } else if (type === 'WEBHOOK') {
    Object.assign(config, { url: values.url, method: values.method || 'POST', contentType: values.contentType || 'application/json', secret: values.secret });
  } else if (type === 'SMS' || type === 'PHONE') {
    Object.assign(config, { apiUrl: values.apiUrl, provider: values.provider, token: values.token, signName: values.signName, templateId: values.templateId, callerId: values.callerId });
  } else if (type === 'WECHAT') {
    Object.assign(config, { webhookUrl: values.webhookUrl, messageType: values.messageType || 'markdown', mentionedList: splitCsv(values.mentionedList), mentionedMobileList: splitCsv(values.mentionedMobileList) });
  } else if (type === 'DINGTALK') {
    Object.assign(config, { webhookUrl: values.webhookUrl, secret: values.secret, messageType: values.messageType || 'markdown', atMobiles: splitCsv(values.atMobiles), isAtAll: values.isAtAll ?? false });
  } else if (type === 'IN_APP') {
    Object.assign(config, { source: values.messageSource || 'NOTIFICATION_CENTER', level: values.messageLevel || 'INFO', type: values.messageCategory || 'SYSTEM' });
  }
  return { name: values.name.trim(), type, enabled: values.enabled, config: JSON.stringify(config) };
};

const NotificationPage: React.FC = () => {
  const [data, setData] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<ChannelItem | null>(null);
  const [form] = Form.useForm<ChannelFormValues>();
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const pendingRowsRef = useRef<Set<string>>(new Set());
  const type = Form.useWatch('type', form) || 'EMAIL';

  useDirtyGuard(open && formDirty);
  const confirmDiscard = useConfirmDiscard();

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await notificationChannelApi.list();
      setData(res.data?.data || []);
    } catch (error) {
      setData([]);
      setLoadError(getErrorMessage(error, '加载通知渠道失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  usePageActivation(() => {
    void fetchData();
  });

  const runRowTask = async (key: string, task: () => Promise<void>) => {
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

  const openEditor = (item: ChannelItem | null) => {
    form.resetFields();
    setFormDirty(false);
    setRecord(item);
    if (!item) {
      form.setFieldsValue({
        type: 'EMAIL',
        enabled: true,
        smtpPort: 465,
        useSsl: true,
        method: 'POST',
        contentType: 'application/json',
        messageType: 'markdown',
        messageSource: 'NOTIFICATION_CENTER',
        messageLevel: 'INFO',
        messageCategory: 'SYSTEM',
      });
      setOpen(true);
      return;
    }
    const config = parseConfig(item.config);
    form.setFieldsValue({
      name: item.name,
      // 渠道类型单独写入，必须放在 config 映射之后，避免 IN_APP 的 config.type 覆盖它。
      type: item.type,
      enabled: item.enabled,
      ...buildConfigFormValues(item.type, config),
    });
    setOpen(true);
  };

  const closeDrawer = () => {
    confirmDiscard(formDirty, () => {
      setOpen(false);
      setRecord(null);
      setFormDirty(false);
      form.resetFields();
    });
  };

  const save = async (values: ChannelFormValues) => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(values);
      if (record) {
        await notificationChannelApi.update(record.id, payload);
        message.success('通知渠道已更新');
      } else {
        await notificationChannelApi.create(payload);
        message.success('通知渠道已创建');
      }
      setOpen(false);
      setRecord(null);
      setFormDirty(false);
      form.resetFields();
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, record ? '更新通知渠道失败' : '创建通知渠道失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: ChannelItem, checked: boolean) => {
    await runRowTask(`toggle:${item.id}`, async () => {
      try {
        await notificationChannelApi.toggle(item.id, checked);
        message.success(checked ? '渠道已启用' : '渠道已停用');
        await fetchData();
      } catch (error) {
        message.error(getErrorMessage(error, checked ? '启用通知渠道失败' : '停用通知渠道失败'));
      }
    });
  };

  const handleTest = async (item: ChannelItem) => {
    await runRowTask(`test:${item.id}`, async () => {
      try {
        const res = await notificationChannelApi.test(item.id);
        const result = res.data?.data;
        message.success(typeof result === 'string' && result.trim() ? result : '测试成功');
      } catch (error) {
        message.error(getErrorMessage(error, '测试通知渠道失败'));
      }
    });
  };

  const handleDelete = (item: ChannelItem) => {
    Modal.confirm({
      title: '删除通知渠道',
      content: `删除“${item.name}”后，引用该渠道的通知将发送失败，且不可恢复。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => runRowTask(`delete:${item.id}`, async () => {
        try {
          await notificationChannelApi.delete(item.id);
          message.success('通知渠道已删除');
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '删除通知渠道失败'));
        }
      }),
    });
  };

  const columns: ColumnsType<ChannelItem> = [
    { title: '渠道名称', dataIndex: 'name', width: 180 },
    { title: '渠道类型', dataIndex: 'type', width: 120, render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag> },
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 80,
      render: (value: boolean, item) => (
        <Switch
          checked={value}
          size="small"
          loading={pendingRows.has(`toggle:${item.id}`)}
          onChange={(checked) => void handleToggle(item, checked)}
        />
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      width: 220,
      render: (_value, item) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<PlayCircleOutlined />}
            loading={pendingRows.has(`test:${item.id}`)}
            onClick={() => void handleTest(item)}
          >
            测试
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditor(item)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="通知渠道" />
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载通知渠道失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void fetchData()}>重试</Button>}
        />
      ) : null}
      <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }} title="平台默认通知渠道" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>新建渠道</Button>}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={false}
          scroll={{ x: 900 }}
          locale={{ emptyText: <ListEmpty emptyText="暂无通知渠道" /> }}
        />
        <Drawer
          title={record ? '编辑通知渠道' : '新建通知渠道'}
          open={open}
          onClose={closeDrawer}
          width={640}
          destroyOnClose
          maskClosable={false}
          footer={
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={closeDrawer}>取消</Button>
              <Button type="primary" loading={saving} onClick={() => form.submit()}>{record ? '保存修改' : '创建渠道'}</Button>
            </Space>
          }
        >
          <Form form={form} layout="vertical" onFinish={(values) => void save(values)} onValuesChange={() => setFormDirty(true)}>
            <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: '请输入渠道名称' }]}><Input placeholder="例如：平台默认告警短信" /></Form.Item>
            <Form.Item name="type" label="渠道类型" rules={[{ required: true, message: '请选择渠道类型' }]}><Select options={platformChannelOptions as unknown as { value: string; label: string }[]} /></Form.Item>
            <Form.Item name="enabled" label="启用状态" valuePropName="checked"><Switch /></Form.Item>
            {renderChannelFields(type)}
          </Form>
        </Drawer>
      </Card>
    </div>
  );
};

export default NotificationPage;
