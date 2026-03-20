import React, { useEffect, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { messageTemplateApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import {
  notificationChannelColors,
  notificationChannelLabels,
  notificationChannelOptions,
  templateTypeLabels,
  templateTypeOptions,
} from '../../constants/notification';

const { TextArea } = Input;

interface TemplateItem {
  id: number;
  code: string;
  name: string;
  channel: string;
  templateType: string;
  subject: string;
  content: string;
  variables: string;
  enabled: boolean;
  description: string;
  createdAt: string;
}

const MessageTemplatePage: React.FC = () => {
  const [data, setData] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20, keyword: '', channel: undefined as string | undefined });
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<TemplateItem | null>(null);
  const [preview, setPreview] = useState('');
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { pageNum: params.pageNum, pageSize: params.pageSize };
      if (params.keyword) {
        query.keyword = params.keyword;
      }
      if (params.channel) {
        query.channel = params.channel;
      }
      const res = await messageTemplateApi.list(query);
      const page = res.data?.data;
      setData(page?.records || []);
      setTotal(page?.total || 0);
    } catch {
      message.error('加载消息模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params]);

  const openEditor = (item: TemplateItem | null) => {
    setRecord(item);
    if (!item) {
      form.resetFields();
      form.setFieldsValue({ channel: 'EMAIL', templateType: 'TEXT', enabled: true });
    } else {
      form.setFieldsValue(item);
    }
    setOpen(true);
  };

  const save = async (values: Record<string, unknown>) => {
    try {
      if (record) {
        await messageTemplateApi.update(record.id, values);
        message.success('消息模板已更新');
      } else {
        await messageTemplateApi.create(values);
        message.success('消息模板已创建');
      }
      setOpen(false);
      await fetchData();
    } catch {
      message.error('保存消息模板失败');
    }
  };

  const previewTemplate = async (item: TemplateItem) => {
    try {
      const res = await messageTemplateApi.preview({
        content: item.content,
        variables: {
          deviceName: '温湿度传感器-01',
          alarmLevel: '严重',
          alarmTime: '2026-03-13 10:30:00',
          ruleName: '环境告警规则',
        },
      });
      setPreview(res.data?.data || '');
    } catch {
      message.error('预览模板失败');
    }
  };

  const columns: ColumnsType<TemplateItem> = [
    { title: '模板编码', dataIndex: 'code', width: 160 },
    { title: '模板名称', dataIndex: 'name', width: 180 },
    { title: '渠道', dataIndex: 'channel', width: 120, render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag> },
    { title: '模板类型', dataIndex: 'templateType', width: 120, render: (value: string) => templateTypeLabels[value] || value },
    { title: '主题', dataIndex: 'subject', width: 220, ellipsis: true, render: (value: string) => value || '-' },
    { title: '启用', dataIndex: 'enabled', width: 80, render: (value: boolean, item) => <Switch checked={value} size="small" onChange={async (checked) => { await messageTemplateApi.toggle(item.id, checked); await fetchData(); }} /> },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作',
      width: 220,
      render: (_value, item) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditor(item)}>编辑</Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void previewTemplate(item)}>预览</Button>
          <Popconfirm title="删除消息模板" description={`确定删除“${item.name}”吗？`} onConfirm={async () => { await messageTemplateApi.delete(item.id); await fetchData(); }}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="消息模板"
        description="统一维护多渠道消息模板，支持邮件、短信、电话、企业微信、钉钉、Webhook、站内信。"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>新建模板</Button>}
      />

      <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
        <Space wrap>
          <Select allowClear placeholder="按渠道筛选" style={{ width: 160 }} options={notificationChannelOptions as unknown as { value: string; label: string }[]} onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, channel: value }))} />
          <Input.Search allowClear enterButton="查询" placeholder="搜索模板编码或名称" style={{ width: 240 }} onSearch={(value) => setParams((prev) => ({ ...prev, pageNum: 1, keyword: value }))} />
        </Space>
      </Card>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1220 }} pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true, showTotal: (value) => `共 ${value} 个模板`, onChange: (page, pageSize) => setParams((prev) => ({ ...prev, pageNum: page, pageSize })) }} />
      </Card>

      <Drawer
        title={record ? '编辑消息模板' : '新建消息模板'}
        open={open}
        onClose={() => setOpen(false)}
        width={720}
        destroyOnClose
        footer={<Space style={{ width: '100%', justifyContent: 'flex-end' }}><Button onClick={() => setOpen(false)}>取消</Button><Button type="primary" onClick={() => form.submit()}>{record ? '保存修改' : '创建模板'}</Button></Space>}
      >
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
          <Form.Item name="code" label="模板编码" rules={[{ required: true, message: '请输入模板编码' }]}>
            <Input placeholder="例如：ALARM_NOTIFY" disabled={!!record} />
          </Form.Item>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="例如：设备告警通知" />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="channel" label="通知渠道" rules={[{ required: true, message: '请选择通知渠道' }]} style={{ minWidth: 240 }}>
              <Select options={notificationChannelOptions as unknown as { value: string; label: string }[]} />
            </Form.Item>
            <Form.Item name="templateType" label="模板类型" rules={[{ required: true, message: '请选择模板类型' }]} style={{ minWidth: 180 }}>
              <Select options={templateTypeOptions as unknown as { value: string; label: string }[]} />
            </Form.Item>
          </Space>
          <Form.Item name="subject" label="消息主题">
            <Input placeholder="邮件、站内信等渠道建议填写主题" />
          </Form.Item>
          <Form.Item name="content" label="消息内容" rules={[{ required: true, message: '请输入消息内容' }]} tooltip="支持使用 ${variableName} 形式的变量占位符。">
            <TextArea rows={6} placeholder="例如：设备 ${deviceName} 于 ${alarmTime} 触发 ${alarmLevel} 告警。" />
          </Form.Item>
          <Form.Item name="variables" label="变量定义" tooltip='建议使用 JSON 数组，例如：[{"name":"deviceName","desc":"设备名称"}]'>
            <TextArea rows={3} placeholder='[{"name":"deviceName","desc":"设备名称"},{"name":"alarmLevel","desc":"告警级别"}]' />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <TextArea rows={2} placeholder="补充该模板的适用场景和维护说明" />
          </Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal title="模板预览" open={!!preview} onCancel={() => setPreview('')} footer={null} width={560}>
        <pre style={{ margin: 0, padding: 12, background: '#fafafa', borderRadius: 8, whiteSpace: 'pre-wrap' }}>{preview || '-'}</pre>
      </Modal>
    </div>
  );
};

export default MessageTemplatePage;
