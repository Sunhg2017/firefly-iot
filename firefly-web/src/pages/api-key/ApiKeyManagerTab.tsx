import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  CheckCircleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { apiKeyApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime } from '../../utils/datetime';

interface OpenApiOptionItem {
  code: string;
  name: string;
  serviceCode: string;
  httpMethod: string;
  gatewayPath: string;
}

interface AppKeyItem {
  id: number;
  name: string;
  description?: string;
  accessKey: string;
  openApiCodes: string[];
  rateLimitPerMin: number;
  rateLimitPerDay: number;
  status: 'ACTIVE' | 'DISABLED' | 'DELETED';
  expireAt?: string;
  lastUsedAt?: string;
  createdAt?: string;
}

interface AppKeyCreatedResult {
  id: number;
  name: string;
  accessKey: string;
  secretKey: string;
  openApiCodes: string[];
  rateLimitPerMin: number;
  rateLimitPerDay: number;
  status: string;
  expireAt?: string;
  createdAt?: string;
}

interface QueryValues {
  keyword?: string;
  status?: 'ACTIVE' | 'DISABLED';
}

interface FormValues {
  name: string;
  description?: string;
  openApiCodes: string[];
  rateLimitPerMin?: number;
  rateLimitPerDay?: number;
  expireAt?: Dayjs;
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'success',
  DISABLED: 'default',
  DELETED: 'error',
};

const statusLabelMap: Record<string, string> = {
  ACTIVE: '启用',
  DISABLED: '停用',
  DELETED: '已删除',
};

const methodColorMap: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

const ApiKeyManagerTab: React.FC = () => {
  const [queryForm] = Form.useForm<QueryValues>();
  const [editForm] = Form.useForm<FormValues>();
  const selectedOpenApiCodes = Form.useWatch('openApiCodes', editForm) ?? [];

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [items, setItems] = useState<AppKeyItem[]>([]);
  const [openApiOptions, setOpenApiOptions] = useState<OpenApiOptionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<QueryValues>({});
  const [editingRecord, setEditingRecord] = useState<AppKeyItem | null>(null);
  const [detailRecord, setDetailRecord] = useState<AppKeyItem | null>(null);
  const [createdResult, setCreatedResult] = useState<AppKeyCreatedResult | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusPendingId, setStatusPendingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const findOpenApiOption = (code: string): OpenApiOptionItem | undefined =>
    openApiOptions.find((item) => item.code === code);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiKeyApi.list({
        pageNum,
        pageSize,
        keyword: filters.keyword,
        status: filters.status,
      });
      const page = (response.data?.data ?? {}) as { records?: AppKeyItem[]; total?: number };
      setItems(page.records ?? []);
      setTotal(page.total ?? 0);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载 AppKey 列表失败'));
    } finally {
      setLoading(false);
    }
  }, [filters, pageNum, pageSize]);

  usePageActivation(() => { void fetchList(); });

  const fetchOpenApiOptions = async () => {
    setOptionsLoading(true);
    try {
      const response = await apiKeyApi.listOpenApiOptions();
      setOpenApiOptions((response.data?.data ?? []) as OpenApiOptionItem[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载可授权 OpenAPI 失败'));
    } finally {
      setOptionsLoading(false);
    }
  };

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    void fetchOpenApiOptions();
  }, []);

  const handleSearch = async () => {
    const values = await queryForm.validateFields();
    setPageNum(1);
    setFilters({
      keyword: values.keyword?.trim() || undefined,
      status: values.status,
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
      openApiCodes: [],
      rateLimitPerMin: 600,
      rateLimitPerDay: 100000,
    });
    setEditOpen(true);
  };

  const openEditDrawer = (record: AppKeyItem) => {
    setEditingRecord(record);
    editForm.setFieldsValue({
      name: record.name,
      description: record.description,
      openApiCodes: record.openApiCodes ?? [],
      rateLimitPerMin: record.rateLimitPerMin,
      rateLimitPerDay: record.rateLimitPerDay,
      expireAt: record.expireAt ? dayjs(record.expireAt) : undefined,
    });
    setEditOpen(true);
  };

  const handleSubmit = async () => {
    let values: FormValues;
    try {
      values = await editForm.validateFields();
    } catch {
      // 表单校验失败时 antd 已在字段下方给出提示，无需额外弹窗。
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        openApiCodes: values.openApiCodes,
        rateLimitPerMin: values.rateLimitPerMin,
        rateLimitPerDay: values.rateLimitPerDay,
        expireAt: values.expireAt ? values.expireAt.format('YYYY-MM-DDTHH:mm:ss') : undefined,
      };

      if (editingRecord) {
        await apiKeyApi.update(editingRecord.id, payload);
        message.success('AppKey 已更新');
      } else {
        const response = await apiKeyApi.create(payload);
        setCreatedResult((response.data?.data ?? null) as AppKeyCreatedResult | null);
        message.success('AppKey 已创建');
      }

      setEditOpen(false);
      await fetchList();
    } catch (error) {
      message.error(getErrorMessage(error, '保存 AppKey 失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = (record: AppKeyItem) => {
    const nextStatus = record.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const disabling = nextStatus === 'DISABLED';
    Modal.confirm({
      title: disabling ? `停用 AppKey「${record.name}」？` : `启用 AppKey「${record.name}」？`,
      content: disabling
        ? '停用后，已对接系统使用该 Access Key 的调用会立即失败，需要重新启用后才能恢复。'
        : '启用后，已对接系统可以立即恢复使用该 Access Key 调用已授权的 OpenAPI。',
      okText: disabling ? '确认停用' : '确认启用',
      cancelText: '取消',
      okButtonProps: disabling ? { danger: true } : undefined,
      onOk: async () => {
        setStatusPendingId(record.id);
        try {
          await apiKeyApi.updateStatus(record.id, nextStatus);
          message.success(nextStatus === 'ACTIVE' ? 'AppKey 已启用' : 'AppKey 已停用');
          await fetchList();
        } catch (error) {
          message.error(getErrorMessage(error, '更新 AppKey 状态失败'));
          throw error;
        } finally {
          setStatusPendingId(null);
        }
      },
    });
  };

  const handleDelete = (record: AppKeyItem) => {
    Modal.confirm({
      title: '确认删除 AppKey',
      content: `删除「${record.name}」（${record.accessKey}）后，该凭证会立即失效且不可恢复，已对接系统将无法继续调用。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingId(record.id);
        try {
          await apiKeyApi.delete(record.id);
          message.success('AppKey 已删除');
          await fetchList();
        } catch (error) {
          message.error(getErrorMessage(error, '删除 AppKey 失败'));
          throw error;
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const confirmCloseCreatedResult = () => {
    Modal.confirm({
      title: '确认已保存 Secret Key？',
      content: '关闭后无法再次查看该 Secret Key。请确认已复制 Access Key 与 Secret Key，否则只能删除后重新创建。',
      okText: '已保存，关闭',
      cancelText: '返回查看',
      okButtonProps: { danger: true },
      onOk: () => setCreatedResult(null),
    });
  };

  const renderOpenApiTags = (codes: string[]) => {
    if (!codes?.length) {
      return '-';
    }
    return (
      <Space size={[4, 4]} wrap>
        {codes.map((code) => {
          const option = findOpenApiOption(code);
          return (
            <Tag key={code} color="blue">
              {option ? option.name : code}
            </Tag>
          );
        })}
      </Space>
    );
  };

  const columns: ColumnsType<AppKeyItem> = [
    { title: '名称', dataIndex: 'name', width: 180, fixed: 'left', ellipsis: true },
    {
      title: 'Access Key',
      dataIndex: 'accessKey',
      width: 300,
      render: (value: string) => <CopyText text={value} ellipsis />,
    },
    {
      title: '授权 OpenAPI',
      dataIndex: 'openApiCodes',
      width: 300,
      render: (value: string[]) => renderOpenApiTags(value),
    },
    {
      title: '限流',
      width: 200,
      render: (_value: unknown, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.rateLimitPerMin} 次/分钟</Typography.Text>
          <Typography.Text type="secondary">{record.rateLimitPerDay} 次/日</Typography.Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: string) => (
        <Tag color={statusColorMap[value] ?? 'default'}>
          {statusLabelMap[value] ?? value}
        </Tag>
      ),
    },
    {
      title: '过期时间',
      dataIndex: 'expireAt',
      width: 180,
      render: (value?: string) => (value ? formatDateTime(value) : '永不过期'),
    },
    {
      title: '最近使用',
      dataIndex: 'lastUsedAt',
      width: 180,
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 240,
      render: (_value: unknown, record) => (
        <Space size="small">
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
          <Button type="link" size="small" onClick={() => openEditDrawer(record)}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={record.status === 'ACTIVE' ? <StopOutlined /> : <CheckCircleOutlined />}
            loading={statusPendingId === record.id}
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'ACTIVE' ? '停用' : '启用'}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            loading={deletingId === record.id}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const renderOpenApiPreview = (codes: string[]) => (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {codes.length ? codes.map((code) => {
        const option = findOpenApiOption(code);
        return (
          <Card key={code} size="small" styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Space wrap>
                <Typography.Text strong>{option?.name || code}</Typography.Text>
                <Tag color={methodColorMap[option?.httpMethod ?? ''] ?? 'default'}>
                  {option?.httpMethod || '-'}
                </Tag>
                <Tag color="blue">{option?.serviceCode || '-'}</Tag>
              </Space>
              <CopyText text={option?.gatewayPath || code} />
            </Space>
          </Card>
        );
      }) : (
        <Typography.Text type="secondary">暂无已授权 OpenAPI</Typography.Text>
      )}
    </Space>
  );

  return (
    <div>
      <PageHeader
        title="AppKey 管理"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => { void fetchList(); void fetchOpenApiOptions(); }}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer} disabled={openApiOptions.length === 0}>
              新建 AppKey
            </Button>
          </Space>
        )}
      />

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="AppKey 列表加载失败"
          description={loadError}
          action={(
            <Button size="small" onClick={() => void fetchList()} loading={loading}>
              重试
            </Button>
          )}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card>
        <Form form={queryForm} layout="inline" onFinish={() => void handleSearch()}>
          <Form.Item name="keyword" label="关键字">
            <Input allowClear placeholder="名称 / Access Key" style={{ width: 240 }} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              placeholder="全部状态"
              style={{ width: 160 }}
              options={[
                { value: 'ACTIVE', label: '启用' },
                { value: 'DISABLED', label: '停用' },
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

        <Table<AppKeyItem>
          rowKey="id"
          style={{ marginTop: 16 }}
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 1960 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={Boolean(filters.keyword || filters.status)}
                onClearFilters={handleReset}
                emptyText="暂无 AppKey，请先新建"
                filteredText="没有符合当前筛选条件的 AppKey"
              />
            ),
          }}
          pagination={{
            current: pageNum,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPageNum(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Drawer
        destroyOnClose
        title={editingRecord ? `编辑 AppKey - ${editingRecord.name}` : '新建 AppKey'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={920}
        styles={{ body: { paddingBottom: 24 } }}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setEditOpen(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              {editingRecord ? '保存修改' : '创建 AppKey'}
            </Button>
          </Space>
        )}
      >
        <Form form={editForm} layout="vertical">
          <Card size="small" style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">
              Secret Key 只会在创建成功时展示一次，创建后请立即复制保存。
            </Typography.Text>
          </Card>

          <Form.Item
            name="name"
            label="AppKey 名称"
            rules={[
              { required: true, message: '请输入 AppKey 名称' },
              { max: 128, message: '名称长度不能超过 128 位' },
            ]}
          >
            <Input placeholder="例如 数据集成服务" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} placeholder="说明该 AppKey 对应的系统、业务方或使用场景" />
          </Form.Item>
          <Form.Item
            name="openApiCodes"
            label="授权 OpenAPI"
            rules={[{ required: true, message: '请至少选择一个 OpenAPI' }]}
          >
            <Select
              mode="multiple"
              allowClear
              loading={optionsLoading}
              placeholder={openApiOptions.length > 0 ? '请选择允许该 AppKey 调用的 OpenAPI' : '当前租户暂无已订阅 OpenAPI'}
              options={openApiOptions.map((item) => ({
                value: item.code,
                label: `${item.name} (${item.code})`,
              }))}
            />
          </Form.Item>

          {selectedOpenApiCodes.length > 0 ? (
            <Card size="small" title="已选接口预览" style={{ marginBottom: 16 }}>
              {renderOpenApiPreview(selectedOpenApiCodes)}
            </Card>
          ) : null}

          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="rateLimitPerMin"
              label="每分钟调用上限"
              rules={[{ required: true, message: '请输入每分钟调用上限' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="rateLimitPerDay"
              label="每日调用上限"
              rules={[{ required: true, message: '请输入每日调用上限' }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="expireAt" label="过期时间">
            <DatePicker
              showTime
              style={{ width: '100%' }}
              placeholder="留空表示永不过期"
              format="YYYY-MM-DD HH:mm:ss"
            />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        destroyOnClose
        title={`AppKey 详情${detailRecord ? ` - ${detailRecord.name}` : ''}`}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={760}
      >
        {detailRecord ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} bordered>
              <Descriptions.Item label="名称">{detailRecord.name}</Descriptions.Item>
              <Descriptions.Item label="Access Key">
                <CopyText text={detailRecord.accessKey} />
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColorMap[detailRecord.status] ?? 'default'}>
                  {statusLabelMap[detailRecord.status] ?? detailRecord.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="说明">{detailRecord.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="每分钟调用上限">{detailRecord.rateLimitPerMin} 次</Descriptions.Item>
              <Descriptions.Item label="每日调用上限">{detailRecord.rateLimitPerDay} 次</Descriptions.Item>
              <Descriptions.Item label="过期时间">
                {detailRecord.expireAt ? formatDateTime(detailRecord.expireAt) : '永不过期'}
              </Descriptions.Item>
              <Descriptions.Item label="最近使用">
                {detailRecord.lastUsedAt ? formatDateTime(detailRecord.lastUsedAt) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {detailRecord.createdAt ? formatDateTime(detailRecord.createdAt) : '-'}
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="已授权 OpenAPI">
              {renderOpenApiPreview(detailRecord.openApiCodes ?? [])}
            </Card>
          </Space>
        ) : null}
      </Drawer>

      {/* Secret Key 只返回一次：禁用 Esc、点击遮罩与右上角关闭，关闭前必须二次确认。 */}
      <Modal
        open={!!createdResult}
        title="AppKey 创建成功"
        closable={false}
        maskClosable={false}
        keyboard={false}
        width={640}
        footer={[
          <Button key="ok" type="primary" onClick={confirmCloseCreatedResult}>
            我已保存
          </Button>,
        ]}
      >
        {createdResult ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Text type="danger">
              Secret Key 只会展示这一次，请立即复制并妥善保管。关闭后无法再次查看，只能删除后重新创建。
              后续调用请用它在本地计算 HMAC-SHA256 签名，不要把 Secret Key 放到请求头或请求体里。
            </Typography.Text>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="名称">{createdResult.name}</Descriptions.Item>
              <Descriptions.Item label="Access Key">
                <CopyText text={createdResult.accessKey} />
              </Descriptions.Item>
              <Descriptions.Item label="Secret Key">
                <CopyText text={createdResult.secretKey} />
              </Descriptions.Item>
            </Descriptions>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
};

export default ApiKeyManagerTab;
