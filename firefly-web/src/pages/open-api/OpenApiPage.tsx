import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
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

const serviceCodeOptions = [
  { value: 'SYSTEM', label: 'SYSTEM' },
  { value: 'DEVICE', label: 'DEVICE' },
  { value: 'DATA', label: 'DATA' },
  { value: 'RULE', label: 'RULE' },
  { value: 'SUPPORT', label: 'SUPPORT' },
  { value: 'MEDIA', label: 'MEDIA' },
  { value: 'CONNECTOR', label: 'CONNECTOR' },
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

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OpenApiItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<OpenApiQueryValues>({});
  const [detailRecord, setDetailRecord] = useState<OpenApiItem | null>(null);
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

  const columns: ColumnsType<OpenApiItem> = [
    {
      title: '编码',
      dataIndex: 'code',
      width: 220,
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
    { title: '下游路径', dataIndex: 'pathPattern', width: 240 },
    {
      title: '外部网关路径',
      dataIndex: 'gatewayPath',
      width: 320,
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
    { title: '同步时间', dataIndex: 'updatedAt', width: 180 },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_value: unknown, record) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setDetailRecord(record);
            setDetailOpen(true);
          }}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="OpenAPI 管理"
        description="先按服务或关键字筛选，再查看网关路径、权限和状态。"
        extra={(
          <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
            刷新
          </Button>
        )}
      />

      <Card>
        <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="目录只读"
        description="接口目录来自代码自动注册；修改后请重新发布对应服务，再点击刷新。"
      />

        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字">
            <Input allowClear placeholder="编码 / 名称 / 路径" style={{ width: 240 }} />
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
          scroll={{ x: 1860 }}
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
        title={`OpenAPI 详情${detailRecord ? ` - ${detailRecord.name}` : ''}`}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={760}
      >
        {detailRecord ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message="自动注册"
              description="如需修改编码、路径、权限或状态，请调整对应微服务代码后重新部署。"
            />

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
              <Descriptions.Item label="下游路径">{detailRecord.pathPattern}</Descriptions.Item>
              <Descriptions.Item label="外部网关路径">
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
              <Descriptions.Item label="同步时间">{detailRecord.updatedAt || '-'}</Descriptions.Item>
            </Descriptions>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
};

export default OpenApiPage;
