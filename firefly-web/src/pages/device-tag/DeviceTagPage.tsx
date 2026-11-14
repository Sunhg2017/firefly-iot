import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, ColorPicker, Drawer, Form, Input, List, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, TagOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { deviceApi, deviceTagApi } from '../../services/api';

interface TagItem {
  id: number;
  tagKey: string;
  tagValue: string;
  color?: string;
  description?: string;
  deviceCount: number;
  createdAt?: string;
}

interface BindingItem {
  id: number;
  tagId: number;
  deviceId: number;
  deviceName?: string;
  nickname?: string;
  productName?: string;
  createdAt?: string;
}

interface DeviceOption {
  id: number;
  deviceName: string;
  nickname?: string;
  productId?: number;
  productName?: string;
}

interface TagFormValues {
  tagKey: string;
  tagValue: string;
  color?: string;
  description?: string;
}

const DEFAULT_TAG_COLOR = '#1890ff';
const COLOR_PRESETS = [
  { label: '常用', colors: ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#8c8c8c'] },
];

const DeviceTagPage: React.FC = () => {
  const [data, setData] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState({ pageNum: 1, pageSize: 20, keyword: '' });
  const [keywordInput, setKeywordInput] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TagItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [deviceDrawerOpen, setDeviceDrawerOpen] = useState(false);
  const [currentTag, setCurrentTag] = useState<TagItem | null>(null);
  const [bindings, setBindings] = useState<BindingItem[]>([]);
  const [bindingsLoading, setBindingsLoading] = useState(false);
  const [bindingsError, setBindingsError] = useState<string | null>(null);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [deviceSearching, setDeviceSearching] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>();
  const [bindingDevice, setBindingDevice] = useState(false);
  const [form] = Form.useForm<TagFormValues>();

  const deviceSelectOptions = useMemo(() => {
    const boundIds = new Set(bindings.map((item) => item.deviceId));
    return deviceOptions
      .filter((item) => !boundIds.has(item.id))
      .map((item) => ({
        value: item.id,
        label: `${item.nickname || item.deviceName}${item.nickname ? ` (${item.deviceName})` : ''}${item.productName ? ` · ${item.productName}` : ''}`,
      }));
  }, [bindings, deviceOptions]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await deviceTagApi.list({ ...query, keyword: query.keyword || undefined });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      const errorMessage = getErrorMessage(error, '加载设备标签失败');
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const fetchBindings = useCallback(async (tagId: number) => {
    setBindingsLoading(true);
    setBindingsError(null);
    try {
      const res = await deviceTagApi.listDevices(tagId);
      setBindings(res.data.data || []);
    } catch (error) {
      const errorMessage = getErrorMessage(error, '加载已绑定设备失败');
      setBindingsError(errorMessage);
      message.error(errorMessage);
    } finally {
      setBindingsLoading(false);
    }
  }, []);

  const searchDevices = useCallback(async (value = '') => {
    setDeviceSearching(true);
    try {
      const res = await deviceApi.list({ pageNum: 1, pageSize: 100, keyword: value || undefined });
      setDeviceOptions(res.data.data.records || []);
    } catch (error) {
      setDeviceOptions([]);
      message.error(getErrorMessage(error, '加载设备选项失败'));
    } finally {
      setDeviceSearching(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleActivate = useCallback(() => {
    void fetchData();
  }, [fetchData]);
  usePageActivation(handleActivate);

  const applyKeyword = (value: string) => {
    setQuery((prev) => ({ ...prev, pageNum: 1, keyword: value.trim() }));
  };

  const clearKeyword = () => {
    setKeywordInput('');
    setQuery((prev) => ({ ...prev, pageNum: 1, keyword: '' }));
  };

  const handleEdit = (record: TagItem | null) => {
    setEditRecord(record);
    form.resetFields();
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.setFieldsValue({ color: DEFAULT_TAG_COLOR });
    }
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditRecord(null);
    form.resetFields();
  };

  const handleSave = async (values: TagFormValues) => {
    setSaving(true);
    try {
      const payload = { ...values, color: typeof values.color === 'string' ? values.color : DEFAULT_TAG_COLOR };
      if (editRecord) {
        await deviceTagApi.update(editRecord.id, payload);
        message.success('标签更新成功');
      } else {
        await deviceTagApi.create(payload);
        message.success('标签创建成功');
      }
      closeEdit();
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, editRecord ? '更新标签失败' : '创建标签失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: TagItem) => {
    try {
      await deviceTagApi.delete(record.id);
      message.success('标签已删除');
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除标签失败'));
    }
  };

  const openDevices = async (record: TagItem) => {
    setCurrentTag(record);
    setSelectedDeviceId(undefined);
    setBindings([]);
    setBindingsError(null);
    setDeviceOptions([]);
    setDeviceDrawerOpen(true);
    await Promise.all([fetchBindings(record.id), searchDevices()]);
  };

  const handleBind = async () => {
    if (!currentTag) {
      return;
    }
    if (!selectedDeviceId) {
      message.warning('请选择需要绑定的设备');
      return;
    }
    setBindingDevice(true);
    try {
      await deviceTagApi.bindTag(currentTag.id, selectedDeviceId);
      message.success('设备绑定成功');
      setSelectedDeviceId(undefined);
      await Promise.all([fetchBindings(currentTag.id), fetchData()]);
    } catch (error) {
      message.error(getErrorMessage(error, '绑定设备失败'));
    } finally {
      setBindingDevice(false);
    }
  };

  const handleUnbind = async (item: BindingItem) => {
    if (!currentTag) {
      return;
    }
    try {
      await deviceTagApi.unbindTag(currentTag.id, item.deviceId);
      message.success('设备解绑成功');
      await Promise.all([fetchBindings(currentTag.id), fetchData()]);
    } catch (error) {
      message.error(getErrorMessage(error, '解绑设备失败'));
    }
  };

  const columns: ColumnsType<TagItem> = [
    {
      title: '标签',
      width: 220,
      render: (_: unknown, record: TagItem) => (
        <Tag color={record.color || 'blue'}>
          {record.tagKey}: {record.tagValue}
        </Tag>
      ),
    },
    { title: '标签键', dataIndex: 'tagKey', width: 160, render: (value: string) => <CopyText text={value} ellipsis /> },
    { title: '标签值', dataIndex: 'tagValue', width: 180, render: (value: string) => <CopyText text={value} ellipsis /> },
    { title: '设备数', dataIndex: 'deviceCount', width: 90, align: 'center' },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (value?: string) => value || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => formatDateTime(value) },
    {
      title: '操作',
      width: 260,
      fixed: 'right',
      render: (_: unknown, record: TagItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<TagOutlined />} onClick={() => void openDevices(record)}>
            绑定设备
          </Button>
          <Popconfirm
            title={`删除标签“${record.tagKey}: ${record.tagValue}”？`}
            description={record.deviceCount > 0
              ? `删除后 ${record.deviceCount} 台设备将解除该标签绑定，且标签无法恢复。`
              : '该标签当前未绑定设备，删除后无法恢复。'}
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => handleDelete(record)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
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
        title="设备标签"
        description={`共 ${total} 个标签`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>
              新建标签
            </Button>
          </Space>
        }
      />

      <Card className="ff-query-card" styles={{ body: { padding: '12px 16px' } }}>
        <div className="ff-query-bar">
          <Input.Search
            className="ff-query-field ff-query-field--grow"
            allowClear
            enterButton="查询"
            placeholder="搜索标签键或标签值"
            value={keywordInput}
            onChange={(event) => {
              setKeywordInput(event.target.value);
              if (!event.target.value) {
                applyKeyword('');
              }
            }}
            onSearch={(value) => applyKeyword(value)}
          />
        </div>
      </Card>

      <Alert
        style={{ marginBottom: 16, display: loadError ? 'flex' : 'none' }}
        type="error"
        showIcon
        message={loadError}
        action={<Button size="small" onClick={() => void fetchData()}>重试</Button>}
      />

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
          locale={{ emptyText: <ListEmpty hasFilters={Boolean(query.keyword)} emptyText="暂无标签，点击右上角“新建标签”开始创建" onClearFilters={clearKeyword} /> }}
          pagination={{
            current: query.pageNum,
            pageSize: query.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (page, pageSize) => setQuery((prev) => ({ ...prev, pageNum: page, pageSize })),
          }}
        />
      </Card>

      <Modal title={editRecord ? '编辑标签' : '新建标签'} open={editOpen} onCancel={closeEdit} onOk={() => form.submit()} confirmLoading={saving} destroyOnClose width={460}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="tagKey" label="标签键" rules={[{ required: true, message: '请输入标签键' }]}>
            <Input placeholder="例如 env / region / type" disabled={Boolean(editRecord)} maxLength={64} />
          </Form.Item>
          <Form.Item name="tagValue" label="标签值" rules={[{ required: true, message: '请输入标签值' }]}>
            <Input placeholder="例如 production / cn-east / sensor" maxLength={128} />
          </Form.Item>
          <Form.Item
            name="color"
            label="颜色"
            getValueFromEvent={(color: { toHexString?: () => string } | string | undefined) => (typeof color === 'string' ? color : color?.toHexString?.() || DEFAULT_TAG_COLOR)}
          >
            <ColorPicker showText format="hex" presets={COLOR_PRESETS} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={256} placeholder="选填，补充标签用途" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={currentTag ? `绑定设备 · ${currentTag.tagKey}: ${currentTag.tagValue}` : '绑定设备'}
        open={deviceDrawerOpen}
        onClose={() => setDeviceDrawerOpen(false)}
        width={560}
      >
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">搜索设备名称或别名后，点击绑定。</Typography.Text>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                showSearch
                allowClear
                style={{ width: '100%' }}
                placeholder="搜索设备名称 / 别名"
                filterOption={false}
                options={deviceSelectOptions}
                value={selectedDeviceId}
                loading={deviceSearching}
                notFoundContent={deviceSearching ? '设备搜索中…' : '没有可绑定的设备'}
                onSearch={(value) => void searchDevices(value)}
                onChange={(value) => setSelectedDeviceId(value)}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleBind()} loading={bindingDevice}>
                绑定
              </Button>
            </Space.Compact>
          </Space>
        </Card>

        <Typography.Title level={5}>已绑定设备</Typography.Title>
        {bindingsError ? <Alert style={{ marginBottom: 12 }} type="error" showIcon message={bindingsError} action={currentTag ? <Button size="small" onClick={() => void fetchBindings(currentTag.id)}>重试</Button> : null} /> : null}
        <List
          loading={bindingsLoading}
          dataSource={bindings}
          locale={{ emptyText: <ListEmpty compact emptyText="当前标签还没有绑定设备" /> }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="remove"
                  title={`解绑设备“${item.nickname || item.deviceName || '该设备'}”？`}
                  description="解绑后该设备将不再带有此标签，可重新绑定。"
                  okText="解绑"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleUnbind(item)}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                    解绑
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={item.nickname || item.deviceName || '设备信息不可用'}
                description={
                  <>
                    {item.deviceName ? <div>设备名：{item.deviceName}</div> : null}
                    {item.productName ? <div>产品：{item.productName}</div> : null}
                    {item.createdAt ? <div>绑定时间：{formatDateTime(item.createdAt)}</div> : null}
                  </>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  );
};

export default DeviceTagPage;
