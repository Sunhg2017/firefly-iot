import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { messageTemplateApi } from '../../services/api';
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

interface TemplateFormValues {
  code: string;
  name: string;
  channel: string;
  templateType: string;
  subject?: string;
  content: string;
  variables?: string;
  description?: string;
  enabled: boolean;
}

const MessageTemplatePage: React.FC = () => {
  const [data, setData] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20, keyword: '', channel: undefined as string | undefined });
  const [keywordDraft, setKeywordDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [record, setRecord] = useState<TemplateItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [form] = Form.useForm<TemplateFormValues>();
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const pendingRowsRef = useRef<Set<string>>(new Set());

  useDirtyGuard(open && formDirty);
  const confirmDiscard = useConfirmDiscard();

  const hasFilters = Boolean(params.keyword || params.channel);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
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
    } catch (error) {
      setData([]);
      setTotal(0);
      setLoadError(getErrorMessage(error, '加载消息模板失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params]);

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

  const openEditor = (item: TemplateItem | null) => {
    form.resetFields();
    setFormDirty(false);
    setRecord(item);
    if (!item) {
      form.setFieldsValue({ channel: 'EMAIL', templateType: 'TEXT', enabled: true });
    } else {
      form.setFieldsValue({
        code: item.code,
        name: item.name,
        channel: item.channel,
        templateType: item.templateType,
        subject: item.subject ?? undefined,
        content: item.content,
        variables: item.variables ?? undefined,
        description: item.description ?? undefined,
        enabled: item.enabled,
      });
    }
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

  const save = async (values: TemplateFormValues) => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: values.code?.trim(),
        name: values.name?.trim(),
        channel: values.channel,
        templateType: values.templateType,
        subject: values.subject?.trim() || undefined,
        content: values.content,
        variables: values.variables?.trim() || undefined,
        description: values.description?.trim() || undefined,
        enabled: values.enabled,
      };
      if (record) {
        await messageTemplateApi.update(record.id, payload);
        message.success('消息模板已更新');
      } else {
        await messageTemplateApi.create(payload);
        message.success('消息模板已创建');
      }
      setOpen(false);
      setRecord(null);
      setFormDirty(false);
      form.resetFields();
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, record ? '更新消息模板失败' : '创建消息模板失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: TemplateItem, checked: boolean) => {
    await runRowTask(`toggle:${item.id}`, async () => {
      try {
        await messageTemplateApi.toggle(item.id, checked);
        message.success(checked ? '模板已启用' : '模板已停用');
        await fetchData();
      } catch (error) {
        // 列表数据未变更，Switch 会回到失败前的状态。
        message.error(getErrorMessage(error, checked ? '启用消息模板失败' : '停用消息模板失败'));
      }
    });
  };

  const handleDelete = async (item: TemplateItem) => {
    await runRowTask(`delete:${item.id}`, async () => {
      try {
        await messageTemplateApi.delete(item.id);
        message.success('消息模板已删除');
        await fetchData();
      } catch (error) {
        message.error(getErrorMessage(error, '删除消息模板失败'));
      }
    });
  };

  const previewTemplate = async (item: TemplateItem) => {
    await runRowTask(`preview:${item.id}`, async () => {
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
        setPreviewContent(res.data?.data || '');
        setPreviewOpen(true);
      } catch (error) {
        message.error(getErrorMessage(error, '预览消息模板失败'));
      }
    });
  };

  const columns: ColumnsType<TemplateItem> = [
    { title: '模板编码', dataIndex: 'code', width: 160, ellipsis: true },
    { title: '模板名称', dataIndex: 'name', width: 180, ellipsis: true },
    { title: '渠道', dataIndex: 'channel', width: 120, render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag> },
    { title: '模板类型', dataIndex: 'templateType', width: 120, render: (value: string) => templateTypeLabels[value] || value },
    { title: '主题', dataIndex: 'subject', width: 220, ellipsis: true, render: (value: string) => value || '-' },
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
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      width: 230,
      render: (_value, item) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditor(item)}>编辑</Button>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            loading={pendingRows.has(`preview:${item.id}`)}
            onClick={() => void previewTemplate(item)}
          >
            预览
          </Button>
          <Popconfirm
            title="删除消息模板"
            description={`模板删除后引用它的通知将发送失败，且不可恢复。确定删除“${item.name}”吗？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(item)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={pendingRows.has(`delete:${item.id}`)}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="消息模板"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>新建模板</Button>}
      />

      <Card bordered={false} style={{ borderRadius: 12, marginBottom: 16 }}>
        <Space wrap>
          <Input.Search
            allowClear
            enterButton="查询"
            placeholder="搜索模板编码或名称"
            style={{ width: 260 }}
            value={keywordDraft}
            onChange={(event) => {
              const value = event.target.value;
              setKeywordDraft(value);
              if (!value && params.keyword) {
                setParams((prev) => ({ ...prev, pageNum: 1, keyword: '' }));
              }
            }}
            onSearch={(value) => setParams((prev) => ({ ...prev, pageNum: 1, keyword: value.trim() }))}
          />
          <Select
            allowClear
            placeholder="按渠道筛选"
            style={{ width: 160 }}
            value={params.channel}
            options={notificationChannelOptions as unknown as { value: string; label: string }[]}
            onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, channel: value }))}
          />
        </Space>
      </Card>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载消息模板失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void fetchData()}>重试</Button>}
        />
      ) : null}

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1220 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText="暂无消息模板"
                onClearFilters={() => {
                  setKeywordDraft('');
                  setParams((prev) => ({ ...prev, pageNum: 1, keyword: '', channel: undefined }));
                }}
              />
            ),
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 个模板`,
            onChange: (page, pageSize) => setParams((prev) => ({ ...prev, pageNum: page, pageSize })),
          }}
        />
      </Card>

      <Drawer
        title={record ? '编辑消息模板' : '新建消息模板'}
        open={open}
        onClose={closeDrawer}
        width={720}
        destroyOnClose
        maskClosable={false}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>{record ? '保存修改' : '创建模板'}</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)} onValuesChange={() => setFormDirty(true)}>
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

      <Modal title="模板预览（示例变量）" open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={null} width={560}>
        <pre style={{ margin: 0, padding: 12, background: '#fafafa', borderRadius: 8, whiteSpace: 'pre-wrap' }}>{previewContent || '-'}</pre>
      </Modal>
    </div>
  );
};

export default MessageTemplatePage;
