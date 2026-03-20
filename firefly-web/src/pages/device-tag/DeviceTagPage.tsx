import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Empty, Form, Input, List, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, TagOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
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

const DeviceTagPage: React.FC = () => {
  const [data, setData] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TagItem | null>(null);
  const [deviceDrawerOpen, setDeviceDrawerOpen] = useState(false);
  const [currentTag, setCurrentTag] = useState<TagItem | null>(null);
  const [bindings, setBindings] = useState<BindingItem[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [deviceSearching, setDeviceSearching] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>();
  const [form] = Form.useForm();

  const deviceSelectOptions = useMemo(
    () =>
      deviceOptions.map((item) => ({
        value: item.id,
        label: `${item.nickname || item.deviceName}${item.nickname ? ` (${item.deviceName})` : ''}${item.productName ? ` · ${item.productName}` : ''}`,
      })),
    [deviceOptions],
  );

  const fetchData = async (nextKeyword = keyword) => {
    setLoading(true);
    try {
      const res = await deviceTagApi.list({ ...params, keyword: nextKeyword || undefined });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载设备标签失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBindings = async (tagId: number) => {
    try {
      const res = await deviceTagApi.listDevices(tagId);
      setBindings(res.data.data || []);
    } catch {
      message.error('加载已绑定设备失败');
    }
  };

  const searchDevices = async (value = '') => {
    setDeviceSearching(true);
    try {
      const res = await deviceApi.list({ pageNum: 1, pageSize: 100, keyword: value || undefined });
      setDeviceOptions(res.data.data.records || []);
    } catch {
      setDeviceOptions([]);
      message.error('加载设备选项失败');
    } finally {
      setDeviceSearching(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize]);

  const handleEdit = (record: TagItem | null) => {
    setEditRecord(record);
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.resetFields();
      form.setFieldValue('color', '#1890ff');
    }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      const payload = { ...values, color: typeof values.color === 'string' ? values.color : '#1890ff' };
      if (editRecord) {
        await deviceTagApi.update(editRecord.id, payload);
        message.success('标签更新成功');
      } else {
        await deviceTagApi.create(payload);
        message.success('标签创建成功');
      }
      setEditOpen(false);
      void fetchData();
    } catch {
      message.error('保存标签失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deviceTagApi.delete(id);
      message.success('标签已删除');
      void fetchData();
    } catch {
      message.error('删除标签失败');
    }
  };

  const openDevices = async (record: TagItem) => {
    setCurrentTag(record);
    setSelectedDeviceId(undefined);
    setDeviceDrawerOpen(true);
    await Promise.all([fetchBindings(record.id), searchDevices()]);
  };

  const handleBind = async () => {
    if (!currentTag || !selectedDeviceId) {
      message.warning('请选择需要绑定的设备');
      return;
    }
    try {
      await deviceTagApi.bindTag(currentTag.id, selectedDeviceId);
      message.success('设备绑定成功');
      setSelectedDeviceId(undefined);
      await Promise.all([fetchBindings(currentTag.id), fetchData()]);
    } catch {
      message.error('绑定设备失败');
    }
  };

  const handleUnbind = async (deviceId: number) => {
    if (!currentTag) {
      return;
    }
    try {
      await deviceTagApi.unbindTag(currentTag.id, deviceId);
      message.success('设备解绑成功');
      await Promise.all([fetchBindings(currentTag.id), fetchData()]);
    } catch {
      message.error('解绑设备失败');
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
    { title: '标签键', dataIndex: 'tagKey', width: 140 },
    { title: '标签值', dataIndex: 'tagValue', width: 160 },
    { title: '设备数', dataIndex: 'deviceCount', width: 90 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: TagItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<TagOutlined />} onClick={() => void openDevices(record)}>
            绑定设备
          </Button>
          <Popconfirm title="确认删除该标签？" onConfirm={() => void handleDelete(record.id)}>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>
            新建标签
          </Button>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          enterButton="查询"
          placeholder="搜索标签键 / 标签值"
          style={{ width: 280 }}
          onSearch={(value) => {
            setKeyword(value.trim());
            setParams((prev) => ({ ...prev, pageNum: 1 }));
            void fetchData(value.trim());
          }}
        />
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1080 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (page, pageSize) => setParams({ pageNum: page, pageSize }),
          }}
        />
      </Card>

      <Modal title={editRecord ? '编辑标签' : '新建标签'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnHidden width={460}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="tagKey" label="标签键" rules={[{ required: true, message: '请输入标签键' }]}>
            <Input placeholder="例如 env / region / type" disabled={Boolean(editRecord)} />
          </Form.Item>
          <Form.Item name="tagValue" label="标签值" rules={[{ required: true, message: '请输入标签值' }]}>
            <Input placeholder="例如 production / cn-east / sensor" />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Input placeholder="#1890ff" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="可选，补充标签用途说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={currentTag ? `绑定设备 · ${currentTag.tagKey}: ${currentTag.tagValue}` : '绑定设备'}
        open={deviceDrawerOpen}
        onClose={() => setDeviceDrawerOpen(false)}
        width={520}
      >
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text type="secondary">直接从现有设备中选择，不再手动输入设备 ID。</Typography.Text>
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
                onSearch={(value) => void searchDevices(value)}
                onChange={(value) => setSelectedDeviceId(value)}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleBind()}>
                绑定
              </Button>
            </Space.Compact>
          </Space>
        </Card>

        <Typography.Title level={5}>已绑定设备</Typography.Title>
        {bindings.length ? (
          <List
            dataSource={bindings}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Popconfirm key="remove" title="确认解绑该设备？" onConfirm={() => void handleUnbind(item.deviceId)}>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                      解绑
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={item.nickname || item.deviceName || `设备 ${item.deviceId}`}
                  description={
                    <>
                      <div>{item.deviceName ? `设备名：${item.deviceName}` : `设备ID：${item.deviceId}`}</div>
                      {item.productName ? <div>产品：{item.productName}</div> : null}
                      {item.createdAt ? <div>绑定时间：{item.createdAt}</div> : null}
                    </>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="当前标签还没有绑定设备" />
        )}
      </Drawer>
    </div>
  );
};

export default DeviceTagPage;
