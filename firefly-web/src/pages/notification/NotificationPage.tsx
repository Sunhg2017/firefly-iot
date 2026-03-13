import React, { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { notificationChannelApi, notificationRecordApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import {
  notificationChannelColors,
  notificationChannelLabels,
  notificationChannelOptions,
  notificationStatusColors,
  notificationStatusLabels,
} from '../../constants/notification';

interface ChannelItem {
  id: number;
  name: string;
  type: string;
  config: string;
  enabled: boolean;
  updatedAt: string;
}

interface RecordItem {
  id: number;
  channelType: string;
  templateCode: string;
  subject: string;
  content: string;
  recipient: string;
  status: string;
  errorMessage: string;
  retryCount: number;
  sentAt: string;
  createdAt: string;
}

const parseConfig = (value: string) => {
  try {
    return JSON.parse(value || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};

const toCsv = (value: unknown) => (Array.isArray(value) ? value.join(', ') : '');
const splitCsv = (value?: string) =>
  (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

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

const buildPayload = (values: Record<string, unknown>) => {
  const type = String(values.type || 'EMAIL');
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
    Object.assign(config, { webhookUrl: values.webhookUrl, messageType: values.messageType || 'markdown', mentionedList: splitCsv(values.mentionedList as string), mentionedMobileList: splitCsv(values.mentionedMobileList as string) });
  } else if (type === 'DINGTALK') {
    Object.assign(config, { webhookUrl: values.webhookUrl, secret: values.secret, messageType: values.messageType || 'markdown', atMobiles: splitCsv(values.atMobiles as string), isAtAll: values.isAtAll ?? false });
  } else if (type === 'IN_APP') {
    Object.assign(config, { source: values.messageSource || 'NOTIFICATION_CENTER', level: values.messageLevel || 'INFO', type: values.messageCategory || 'SYSTEM' });
  }
  return { name: values.name, type, enabled: values.enabled, config: JSON.stringify(config) };
};

const ChannelTab: React.FC = () => {
  const [data, setData] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<ChannelItem | null>(null);
  const [form] = Form.useForm();
  const type = Form.useWatch('type', form) || 'EMAIL';

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await notificationChannelApi.list();
      setData(res.data?.data || []);
    } catch {
      message.error('加载通知渠道失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const openEditor = (item: ChannelItem | null) => {
    setRecord(item);
    if (!item) {
      form.resetFields();
      form.setFieldsValue({ type: 'EMAIL', enabled: true, smtpPort: 465, useSsl: true, method: 'POST', contentType: 'application/json', messageType: 'markdown', messageSource: 'NOTIFICATION_CENTER', messageLevel: 'INFO', messageCategory: 'SYSTEM' });
      setOpen(true);
      return;
    }
    const config = parseConfig(item.config);
    form.setFieldsValue({
      name: item.name,
      type: item.type,
      enabled: item.enabled,
      ...config,
      mentionedList: toCsv(config.mentionedList),
      mentionedMobileList: toCsv(config.mentionedMobileList),
      atMobiles: toCsv(config.atMobiles),
      messageSource: config.source,
      messageLevel: config.level,
      messageCategory: config.type,
    });
    setOpen(true);
  };

  const save = async (values: Record<string, unknown>) => {
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
      await fetchData();
    } catch {
      message.error('保存通知渠道失败');
    }
  };

  const columns: ColumnsType<ChannelItem> = [
    { title: '渠道名称', dataIndex: 'name', width: 180 },
    { title: '渠道类型', dataIndex: 'type', width: 120, render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag> },
    { title: '启用', dataIndex: 'enabled', width: 80, render: (value: boolean, item) => <Switch checked={value} size="small" onChange={async (checked) => { await notificationChannelApi.toggle(item.id, checked); await fetchData(); }} /> },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180 },
    {
      title: '操作',
      width: 220,
      render: (_value, item) => (
        <Space size="small">
          <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={async () => { const res = await notificationChannelApi.test(item.id); message.info(res.data?.data || '测试完成'); }}>测试</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditor(item)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: '删除通知渠道', content: `确定删除“${item.name}”吗？`, onOk: async () => { await notificationChannelApi.delete(item.id); await fetchData(); } })}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }} title="通知渠道" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>新建渠道</Button>}>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} scroll={{ x: 900 }} />
      <Drawer title={record ? '编辑通知渠道' : '新建通知渠道'} open={open} onClose={() => setOpen(false)} width={640} destroyOnClose footer={<Space style={{ width: '100%', justifyContent: 'flex-end' }}><Button onClick={() => setOpen(false)}>取消</Button><Button type="primary" onClick={() => form.submit()}>{record ? '保存修改' : '创建渠道'}</Button></Space>}>
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
          <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: '请输入渠道名称' }]}><Input placeholder="例如：生产告警短信" /></Form.Item>
          <Form.Item name="type" label="渠道类型" rules={[{ required: true, message: '请选择渠道类型' }]}><Select options={notificationChannelOptions as unknown as { value: string; label: string }[]} /></Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked"><Switch /></Form.Item>
          {renderChannelFields(type)}
        </Form>
      </Drawer>
    </Card>
  );
};

const RecordTab: React.FC = () => {
  const [data, setData] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20, channelType: undefined as string | undefined, status: undefined as string | undefined });
  const [detail, setDetail] = useState<RecordItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await notificationRecordApi.list(params);
      setData(res.data?.data?.records || []);
      setTotal(res.data?.data?.total || 0);
    } catch {
      message.error('加载通知记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params]);

  const columns: ColumnsType<RecordItem> = [
    { title: '发送时间', dataIndex: 'createdAt', width: 180 },
    { title: '渠道', dataIndex: 'channelType', width: 120, render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag> },
    { title: '模板编码', dataIndex: 'templateCode', width: 160, ellipsis: true },
    { title: '主题', dataIndex: 'subject', width: 220, ellipsis: true, render: (value: string) => value || '-' },
    { title: '接收方', dataIndex: 'recipient', width: 220, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag color={notificationStatusColors[value] || 'default'}>{notificationStatusLabels[value] || value}</Tag> },
    { title: '重试次数', dataIndex: 'retryCount', width: 90 },
    { title: '操作', width: 90, render: (_value, item) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={async () => { const res = await notificationRecordApi.get(item.id); setDetail(res.data?.data || null); }}>详情</Button> },
  ];

  return (
    <Card bordered={false} style={{ borderRadius: 12 }} title="发送记录">
      <Space wrap style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="按渠道筛选" style={{ width: 160 }} options={notificationChannelOptions as unknown as { value: string; label: string }[]} onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, channelType: value }))} />
        <Select allowClear placeholder="按状态筛选" style={{ width: 140 }} options={[{ value: 'SUCCESS', label: '发送成功' }, { value: 'FAILED', label: '发送失败' }, { value: 'PENDING', label: '待发送' }]} onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, status: value }))} />
      </Space>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1180 }} pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true, showTotal: (value) => `共 ${value} 条记录`, onChange: (page, pageSize) => setParams((prev) => ({ ...prev, pageNum: page, pageSize })) }} />
      <Modal title="通知记录详情" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={720}>
        {detail && (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="记录 ID">{detail.id}</Descriptions.Item>
            <Descriptions.Item label="发送时间">{detail.createdAt}</Descriptions.Item>
            <Descriptions.Item label="渠道"><Tag color={notificationChannelColors[detail.channelType] || 'default'}>{notificationChannelLabels[detail.channelType] || detail.channelType}</Tag></Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={notificationStatusColors[detail.status] || 'default'}>{notificationStatusLabels[detail.status] || detail.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="模板编码">{detail.templateCode || '-'}</Descriptions.Item>
            <Descriptions.Item label="发送完成时间">{detail.sentAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="接收方" span={2}>{detail.recipient || '-'}</Descriptions.Item>
            <Descriptions.Item label="主题" span={2}>{detail.subject || '-'}</Descriptions.Item>
            <Descriptions.Item label="内容" span={2}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{detail.content || '-'}</pre></Descriptions.Item>
            {detail.errorMessage ? <Descriptions.Item label="失败原因" span={2}><span style={{ color: '#ff4d4f' }}>{detail.errorMessage}</span></Descriptions.Item> : null}
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
};

const NotificationPage: React.FC = () => (
  <div>
    <PageHeader title="通知中心" description="统一维护通知渠道和发送记录，支持邮件、短信、电话、企业微信、钉钉、Webhook、站内信等多种渠道。" />
    <ChannelTab />
    <RecordTab />
  </div>
);

export default NotificationPage;
