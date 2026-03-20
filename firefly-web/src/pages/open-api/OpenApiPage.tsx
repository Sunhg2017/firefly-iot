import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { openApiApi } from '../../services/api';

interface OpenApiItem {
  code: string;
  name: string;
  serviceCode: string;
  httpMethod: string;
  pathPattern: string;
  gatewayPath: string;
  permissionCode?: string;
  enabled: boolean;
  sortOrder: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface OpenApiQueryValues {
  keyword?: string;
  serviceCode?: string;
  enabled?: 'true' | 'false';
}

interface OpenApiFormValues {
  code?: string;
  name: string;
  serviceCode: string;
  httpMethod: string;
  pathPattern: string;
  permissionCode?: string;
  enabled: boolean;
  sortOrder?: number;
  description?: string;
}

const serviceCodeOptions = [
  { value: 'SYSTEM', label: 'SYSTEM' },
  { value: 'DEVICE', label: 'DEVICE' },
  { value: 'DATA', label: 'DATA' },
  { value: 'RULE', label: 'RULE' },
  { value: 'SUPPORT', label: 'SUPPORT' },
  { value: 'MEDIA', label: 'MEDIA' },
  { value: 'CONNECTOR', label: 'CONNECTOR' },
];

const httpMethodOptions = [
  { value: 'GET', label: 'GET' },
  { value: 'POST', label: 'POST' },
  { value: 'PUT', label: 'PUT' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'PATCH', label: 'PATCH' },
];

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const methodColorMap: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

const OpenApiPage: React.FC = () => {
  const [queryForm] = Form.useForm<OpenApiQueryValues>();
  const [editForm] = Form.useForm<OpenApiFormValues>();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<OpenApiItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<OpenApiQueryValues>({});
  const [editingRecord, setEditingRecord] = useState<OpenApiItem | null>(null);
  const [detailRecord, setDetailRecord] = useState<OpenApiItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await openApiApi.list({
        pageNum,
        pageSize,
        keyword: filters.keyword,
        serviceCode: filters.serviceCode,
        enabled:
          filters.enabled === undefined
            ? undefined
            : filters.enabled === 'true',
      });
      const page = (res.data?.data ?? {}) as { records?: OpenApiItem[]; total?: number };
      setItems(page.records ?? []);
      setTotal(page.total ?? 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载 OpenAPI 列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [pageNum, pageSize, filters]);

  const handleSearch = async () => {
    const values = await queryForm.validateFields();
    setPageNum(1);
    setFilters({
      keyword: values.keyword?.trim() || undefined,
      serviceCode: values.serviceCode,
      enabled: values.enabled,
    });
  };

  const handleReset = () => {
    queryForm.resetFields();
    setPageNum(1);
    setFilters({});
  };

  const openCreateDrawer = () => {
    setEditingRecord(null);
    editForm.resetFields();
    editForm.setFieldsValue({
      serviceCode: 'SYSTEM',
      httpMethod: 'GET',
      enabled: true,
      sortOrder: 0,
    });
    setEditOpen(true);
  };

  const openEditDrawer = (record: OpenApiItem) => {
    setEditingRecord(record);
    editForm.setFieldsValue({
      code: record.code,
      name: record.name,
      serviceCode: record.serviceCode,
      httpMethod: record.httpMethod,
      pathPattern: record.pathPattern,
      permissionCode: record.permissionCode,
      enabled: record.enabled,
      sortOrder: record.sortOrder,
      description: record.description,
    });
    setEditOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);

      const payload = {
        code: values.code?.trim(),
        name: values.name.trim(),
        serviceCode: values.serviceCode,
        httpMethod: values.httpMethod,
        pathPattern: values.pathPattern.trim(),
        permissionCode: values.permissionCode?.trim() || undefined,
        enabled: values.enabled,
        sortOrder: values.sortOrder ?? 0,
        description: values.description?.trim() || undefined,
      };

      if (editingRecord) {
        await openApiApi.update(editingRecord.code, payload);
        message.success('OpenAPI 已更新');
      } else {
        await openApiApi.create(payload);
        message.success('OpenAPI 已创建');
      }

      setEditOpen(false);
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '保存 OpenAPI 失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (record: OpenApiItem) => {
    Modal.confirm({
      title: '确认删除 OpenAPI',
      content: `删除 ${record.name}（${record.code}）后，租户订阅和 AppKey 授权将一并失效，请谨慎操作。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await openApiApi.delete(record.code);
          message.success('OpenAPI 已删除');
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '删除 OpenAPI 失败'));
          throw error;
        }
      },
    });
  };

  const columns: ColumnsType<OpenApiItem> = [
    {
      title: '编码',
      dataIndex: 'code',
      width: 180,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    { title: '名称', dataIndex: 'name', width: 180 },
    {
      title: '服务',
      dataIndex: 'serviceCode',
      width: 110,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '方法',
      dataIndex: 'httpMethod',
      width: 100,
      render: (value: string) => <Tag color={methodColorMap[value] ?? 'default'}>{value}</Tag>,
    },
    { title: '路径模板', dataIndex: 'pathPattern', width: 240 },
    {
      title: '网关访问路径',
      dataIndex: 'gatewayPath',
      width: 260,
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
    },
    {
      title: '透传权限',
      dataIndex: 'permissionCode',
      width: 180,
      render: (value?: string) => (value ? <Typography.Text code>{value}</Typography.Text> : '-'),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 100,
      render: (value: boolean) => <Tag color={value ? 'success' : 'default'}>{value ? '启用' : '停用'}</Tag>,
    },
    { title: '排序', dataIndex: 'sortOrder', width: 90 },
    { title: '更新时间', dataIndex: 'updatedAt', width: 180 },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 180,
      render: (_value: unknown, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setDetailRecord(record); setDetailOpen(true); }}>
            详情
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>
            编辑
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
        title="OpenAPI 管理"
        description="系统运维空间统一维护可开放给租户订阅的 OpenAPI 目录、网关路径和透传权限。"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
              新建 OpenAPI
            </Button>
          </Space>
        )}
      />

      <Card>
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字">
            <Input allowClear placeholder="编码 / 名称 / 路径模板" style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="serviceCode" label="服务">
            <Select allowClear placeholder="全部服务" style={{ width: 160 }} options={serviceCodeOptions} />
          </Form.Item>
          <Form.Item name="enabled" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 140 }}
              options={[
                { value: 'true', label: '启用' },
                { value: 'false', label: '停用' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>

        <Table<OpenApiItem>
          rowKey="code"
          style={{ marginTop: 16 }}
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 1820 }}
          pagination={{
            current: pageNum,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPageNum(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Drawer
        destroyOnClose
        title={editingRecord ? `编辑 OpenAPI - ${editingRecord.name}` : '新建 OpenAPI'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={880}
        styles={{ body: { paddingBottom: 24 } }}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              {editingRecord ? '保存修改' : '创建 OpenAPI'}
            </Button>
          </Space>
        )}
      >
        <Form form={editForm} layout="vertical">
          <Card size="small" style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">
              配置完成后，租户即可在租户管理页订阅该 OpenAPI，再由租户空间中的 AppKey 选择可调用范围。
            </Typography.Text>
          </Card>

          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Form.Item
              name="code"
              label="OpenAPI 编码"
              rules={[
                { required: true, message: '请输入 OpenAPI 编码' },
                { max: 128, message: '编码长度不能超过 128 位' },
                { pattern: /^[A-Za-z0-9._:-]{2,128}$/, message: '仅支持字母、数字、点、中划线、下划线和冒号' },
              ]}
            >
              <Input placeholder="例如 device.read.detail" disabled={!!editingRecord} />
            </Form.Item>
            <Form.Item
              name="name"
              label="OpenAPI 名称"
              rules={[
                { required: true, message: '请输入 OpenAPI 名称' },
                { max: 128, message: '名称长度不能超过 128 位' },
              ]}
            >
              <Input placeholder="例如 查询设备详情" />
            </Form.Item>
            <Form.Item
              name="serviceCode"
              label="所属服务"
              rules={[{ required: true, message: '请选择所属服务' }]}
            >
              <Select options={serviceCodeOptions} />
            </Form.Item>
            <Form.Item
              name="httpMethod"
              label="HTTP 方法"
              rules={[{ required: true, message: '请选择 HTTP 方法' }]}
            >
              <Select options={httpMethodOptions} />
            </Form.Item>
            <Form.Item
              name="pathPattern"
              label="下游路径模板"
              rules={[
                { required: true, message: '请输入下游路径模板' },
                { max: 255, message: '路径模板长度不能超过 255 位' },
              ]}
            >
              <Input placeholder="例如 /api/v1/devices/{deviceId}" />
            </Form.Item>
            <Form.Item name="permissionCode" label="透传权限编码" rules={[{ max: 128, message: '权限编码长度不能超过 128 位' }]}>
              <Input allowClear placeholder="例如 device:read" />
            </Form.Item>
            <Form.Item name="sortOrder" label="排序值">
              <InputNumber precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="enabled" label="启用状态" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
            <Form.Item name="description" label="说明">
              <Input.TextArea rows={4} placeholder="补充说明该 OpenAPI 的适用场景、调用限制或对接注意事项" />
            </Form.Item>
          </Space>
        </Form>
      </Drawer>

      <Drawer
        destroyOnClose
        title={`OpenAPI 详情${detailRecord ? ` - ${detailRecord.name}` : ''}`}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={760}
      >
        {detailRecord ? (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="编码">
              <Typography.Text code>{detailRecord.code}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="名称">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="所属服务">
              <Tag color="blue">{detailRecord.serviceCode}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="HTTP 方法">
              <Tag color={methodColorMap[detailRecord.httpMethod] ?? 'default'}>{detailRecord.httpMethod}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="下游路径模板">{detailRecord.pathPattern}</Descriptions.Item>
            <Descriptions.Item label="网关访问路径">
              <Typography.Text code>{detailRecord.gatewayPath}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="透传权限">
              {detailRecord.permissionCode ? <Typography.Text code>{detailRecord.permissionCode}</Typography.Text> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={detailRecord.enabled ? 'success' : 'default'}>
                {detailRecord.enabled ? '启用' : '停用'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="排序值">{detailRecord.sortOrder}</Descriptions.Item>
            <Descriptions.Item label="说明">{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{detailRecord.updatedAt || '-'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </div>
  );
};

export default OpenApiPage;
