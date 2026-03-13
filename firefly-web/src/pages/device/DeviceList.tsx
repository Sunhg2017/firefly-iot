import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  CloudOutlined,
  CloudServerOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  DownloadOutlined,
  KeyOutlined,
  PlusOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import DeviceShadowDrawer from './DeviceShadowDrawer';
import DeviceLocatorModal from './DeviceLocatorModal';
import { asyncTaskApi, deviceApi, fileApi, productApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';

const { TextArea, Search } = Input;

interface DeviceRecord {
  id: number;
  productId: number;
  deviceName: string;
  nickname: string;
  description: string;
  status: string;
  onlineStatus: string;
  firmwareVersion: string;
  ipAddress: string;
  tags: string;
  lastOnlineAt: string;
  createdAt: string;
}

interface ProductOption {
  id: number;
  name: string;
  productKey: string;
  deviceAuthType?: string;
}

interface DeviceCredentialRecord {
  id: number;
  productId: number;
  productKey: string;
  productName?: string;
  deviceName: string;
  nickname?: string;
  deviceSecret: string;
}

interface DeviceCreateFormValues {
  productId: number;
  deviceName: string;
  nickname?: string;
  description?: string;
}

interface DeviceBatchCreateFormValues {
  productId: number;
  description?: string;
  tags?: string;
}

interface DeviceUpdateFormValues {
  nickname?: string;
  description?: string;
  tags?: string;
}

interface CredentialModalOptions {
  title?: string;
  description?: string;
}

interface AsyncTaskRecord {
  id: number;
  status: string;
  progress?: number;
  errorMessage?: string;
}

interface ShadowDeviceContext {
  id: number;
  deviceName: string;
  nickname?: string;
  productName?: string;
  productKey?: string;
}

const DEVICE_AUTH_LABELS: Record<string, string> = {
  DEVICE_SECRET: '一机一密',
  PRODUCT_SECRET: '一型一密',
};

const DEVICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{1,63}$/;
const DEVICE_NAME_RULE_MESSAGE =
  '支持 2-64 位字母、数字、冒号、下划线、中划线、小数点，且需以字母或数字开头';

const statusLabels: Record<string, string> = {
  INACTIVE: '未激活',
  ACTIVE: '已激活',
  DISABLED: '已禁用',
};

const statusColors: Record<string, string> = {
  INACTIVE: 'default',
  ACTIVE: 'success',
  DISABLED: 'error',
};

const onlineBadge: Record<string, { status: 'success' | 'default' | 'warning'; text: string }> = {
  ONLINE: { status: 'success', text: '在线' },
  OFFLINE: { status: 'default', text: '离线' },
  UNKNOWN: { status: 'warning', text: '未知' },
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

const escapeCsvValue = (value: unknown) => {
  const text = `${value ?? ''}`;
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const downloadDeviceTriples = (records: DeviceCredentialRecord[], filenamePrefix: string) => {
  const headers = ['设备ID', '产品ID', '产品Key', '产品名称', '设备名称', '设备别名', '设备密钥'];
  const rows = records.map((item) =>
    [
      item.id,
      item.productId,
      item.productKey,
      item.productName || '',
      item.deviceName,
      item.nickname || '',
      item.deviceSecret,
    ].map(escapeCsvValue).join(','),
  );

  const csvContent = `\uFEFF${headers.join(',')}\r\n${rows.join('\r\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${timestamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
};

const pollTaskStatus = async (
  taskId: number,
  onProgress: (progress: number) => void,
  onComplete: () => void,
  onFail: (error: string) => void,
  maxAttempts = 120,
) => {
  let attempts = 0;
  const poll = async () => {
    try {
      const res = await asyncTaskApi.get(taskId);
      const task = res.data.data as AsyncTaskRecord;
      if (task.status === 'COMPLETED' || task.status === 'SUCCESS') {
        onProgress(100);
        onComplete();
        return;
      }
      if (task.status === 'FAILED') {
        onFail(task.errorMessage || '导入失败');
        return;
      }
      if (task.progress !== undefined) {
        onProgress(task.progress);
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        setTimeout(poll, 2000);
      } else {
        onFail('任务超时，请在任务中心查看');
      }
    } catch {
      onFail('查询任务状态失败');
    }
  };
  poll();
};

const DeviceList: React.FC = () => {
  const [data, setData] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [batchCreating, setBatchCreating] = useState(false);
  const [viewingSecretId, setViewingSecretId] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [batchCreateOpen, setBatchCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createForm] = Form.useForm<DeviceCreateFormValues>();
  const [batchCreateForm] = Form.useForm<DeviceBatchCreateFormValues>();
  const [editForm] = Form.useForm<DeviceUpdateFormValues>();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [filterProduct, setFilterProduct] = useState<number | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterOnline, setFilterOnline] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [shadowDevice, setShadowDevice] = useState<ShadowDeviceContext | null>(null);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [locatorDevice, setLocatorDevice] = useState<DeviceRecord | null>(null);
  const [batchImportFile, setBatchImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const batchImportInputRef = useRef<HTMLInputElement | null>(null);

  const selectedDeviceIds = useMemo(
    () => selectedRowKeys.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0),
    [selectedRowKeys],
  );

  const manualRegistrationProducts = useMemo(
    () => products.filter((item) => item.deviceAuthType !== 'PRODUCT_SECRET'),
    [products],
  );

  const productLookup = useMemo(
    () => new Map(products.map((item) => [item.id, item])),
    [products],
  );

  const activeFilters = useMemo(() => {
    const chips: Array<{ key: string; label: string; value: string }> = [];
    if (keyword) {
      chips.push({ key: 'keyword', label: '关键词', value: keyword });
    }
    if (filterProduct) {
      const product = productLookup.get(filterProduct);
      chips.push({
        key: 'product',
        label: '产品',
        value: product ? `${product.name} / ${product.productKey}` : `${filterProduct}`,
      });
    }
    if (filterStatus) {
      chips.push({ key: 'status', label: '设备状态', value: statusLabels[filterStatus] || filterStatus });
    }
    if (filterOnline) {
      const badge = onlineBadge[filterOnline] || onlineBadge.UNKNOWN;
      chips.push({ key: 'online', label: '在线状态', value: badge.text });
    }
    return chips;
  }, [filterOnline, filterProduct, filterStatus, keyword, productLookup]);

  const fetchProducts = async () => {
    try {
      const res = await productApi.list({ pageNum: 1, pageSize: 500 });
      setProducts(
        (res.data.data.records || []).map((item: ProductOption) => ({
          id: item.id,
          name: item.name,
          productKey: item.productKey,
          deviceAuthType: item.deviceAuthType,
        })),
      );
    } catch {
      // ignore
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await deviceApi.list({
        ...params,
        keyword: keyword || undefined,
        productId: filterProduct,
        status: filterStatus,
        onlineStatus: filterOnline,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载设备列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProducts();
  }, []);

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize, keyword, filterProduct, filterStatus, filterOnline]);

  const closeCreateModal = () => {
    setCreateOpen(false);
    createForm.resetFields();
  };

  const closeBatchCreateModal = () => {
    setBatchCreateOpen(false);
    batchCreateForm.resetFields();
    setBatchImportFile(null);
    setImportProgress(null);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditingId(null);
    editForm.resetFields();
  };

  const ensureManualRegistrationProducts = () => {
    if (manualRegistrationProducts.length > 0) {
      return true;
    }

    message.warning('当前没有可手动创建设备的产品，请使用一机一密产品，或对一型一密产品走动态注册');
    return false;
  };

  const handleOpenCreateModal = () => {
    if (!ensureManualRegistrationProducts()) {
      return;
    }
    setCreateOpen(true);
  };

  const handleOpenBatchCreateModal = () => {
    if (!ensureManualRegistrationProducts()) {
      return;
    }
    setBatchCreateOpen(true);
  };

  const showCredentialModal = (
    credential: DeviceCredentialRecord,
    options: CredentialModalOptions = {},
  ) => {
    const title = options.title || '设备三元组（仅显示一次）';
    const description = options.description || '请妥善保管以下设备连接信息：';

    Modal.info({
      title,
      width: 620,
      content: (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>{description}</Typography.Text>
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Typography.Text copyable={{ text: credential.productKey }}>
                产品Key：{credential.productKey}
              </Typography.Text>
              <Typography.Text copyable={{ text: credential.deviceName }}>
                设备名称：{credential.deviceName}
              </Typography.Text>
              <Typography.Text copyable={{ text: credential.deviceSecret }}>
                设备密钥：{credential.deviceSecret}
              </Typography.Text>
            </Space>
          </Card>
        </Space>
      ),
    });
  };

  const handleViewSecret = async (record: DeviceRecord) => {
    try {
      setViewingSecretId(record.id);
      const res = await deviceApi.getSecret(record.id);
      const deviceSecret = typeof res.data.data === 'string' ? res.data.data : '';
      if (!deviceSecret) {
        message.warning('未获取到设备密钥');
        return;
      }

      const product = products.find((item) => item.id === record.productId);
      showCredentialModal(
        {
          id: record.id,
          productId: record.productId,
          productKey: product?.productKey || '-',
          productName: product?.name,
          deviceName: record.deviceName,
          nickname: record.nickname || undefined,
          deviceSecret,
        },
        {
          title: '查看设备密钥',
          description: '以下是当前设备的连接密钥，请谨慎查看与分发。',
        },
      );
    } catch (error) {
      message.error(getErrorMessage(error, '获取设备密钥失败'));
    } finally {
      setViewingSecretId(null);
    }
  };

  const handleCreate = async (values: DeviceCreateFormValues) => {
    try {
      const res = await deviceApi.create(values as unknown as Record<string, unknown>);
      const credential = res.data.data as DeviceCredentialRecord | undefined;
      message.success('设备创建成功');
      closeCreateModal();
      void fetchData();
      if (credential?.deviceSecret) {
        showCredentialModal(credential);
      }
    } catch (error) {
      message.error(getErrorMessage(error, '创建设备失败'));
    }
  };

  const handleTriggerBatchImport = () => {
    batchImportInputRef.current?.click();
  };

  const handleBatchImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.csv')) {
      message.error('请导入 Excel 或 CSV 文件');
      return;
    }

    setBatchImportFile(file);
    message.success(`已选择文件: ${file.name}`);
  };

  const handleBatchCreate = async (values: DeviceBatchCreateFormValues) => {
    if (!batchImportFile) {
      message.warning('请先选择设备 Excel 文件');
      return;
    }

    try {
      setBatchCreating(true);
      setImportProgress(0);

      // Step 1: Upload file to MinIO
      const uploadRes = await fileApi.upload(batchImportFile, 'device-import');
      const fileKey = uploadRes.data.data?.fileKey || uploadRes.data.data?.objectName;
      if (!fileKey) {
        throw new Error('上传文件失败');
      }
      setImportProgress(10);

      // Step 2: Register async import task
      const fileFormat = batchImportFile.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX';
      const importRes = await deviceApi.importDevices({
        productId: values.productId,
        fileKey,
        fileFormat,
        description: values.description,
        tags: values.tags,
      });
      const taskId = importRes.data.data as number;
      setImportProgress(20);

      // Step 3: Poll task status
      pollTaskStatus(
        taskId,
        (progress) => setImportProgress(Math.max(20, progress)),
        () => {
          message.success('批量导入任务已完成！请在任务中心查看结果');
          closeBatchCreateModal();
          void fetchData();
        },
        (error) => {
          message.error(error);
          setImportProgress(null);
          setBatchCreating(false);
        },
      );
    } catch (error) {
      message.error(getErrorMessage(error, '导入失败'));
      setImportProgress(null);
      setBatchCreating(false);
    }
  };

  const handleEdit = (record: DeviceRecord) => {
    setEditingId(record.id);
    editForm.setFieldsValue({
      nickname: record.nickname,
      description: record.description,
      tags: record.tags,
    });
    setEditOpen(true);
  };

  const handleUpdate = async (values: DeviceUpdateFormValues) => {
    if (!editingId) {
      return;
    }

    try {
      await deviceApi.update(editingId, values as unknown as Record<string, unknown>);
      message.success('更新成功');
      closeEditModal();
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '更新失败'));
    }
  };

  const handleToggleStatus = async (record: DeviceRecord) => {
    try {
      if (record.status === 'DISABLED') {
        await deviceApi.enable(record.id);
        message.success('已启用');
      } else {
        await deviceApi.disable(record.id);
        message.success('已禁用');
      }
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '操作失败'));
    }
  };

  const handleDelete = (record: DeviceRecord) => {
    Modal.confirm({
      title: '确认删除设备？',
      content: `删除后设备将无法连接。确认删除「${record.deviceName}」？`,
      onOk: async () => {
        try {
          await deviceApi.delete(record.id);
          message.success('删除成功');
          setSelectedRowKeys((prev) => prev.filter((item) => Number(item) !== record.id));
          void fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '删除失败'));
        }
      },
    });
  };

  const handleExportTriples = async () => {
    if (selectedDeviceIds.length === 0 && total === 0) {
      message.warning('暂无可导出的设备');
      return;
    }

    try {
      setExporting(true);
      const payload =
        selectedDeviceIds.length > 0
          ? { deviceIds: selectedDeviceIds }
          : {
              keyword: keyword || undefined,
              productId: filterProduct,
              status: filterStatus,
              onlineStatus: filterOnline,
            };
      const res = await deviceApi.exportTriples(payload);
      const credentials = (res.data.data || []) as DeviceCredentialRecord[];
      if (credentials.length === 0) {
        message.warning('没有匹配到可导出的设备三元组');
        return;
      }

      downloadDeviceTriples(
        credentials,
        selectedDeviceIds.length > 0 ? 'device-triples-selected' : 'device-triples-filtered',
      );
      message.success(`已导出 ${credentials.length} 条设备三元组`);
    } catch (error) {
      message.error(getErrorMessage(error, '导出三元组失败'));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<DeviceRecord> = [
    {
      title: '设备名称',
      dataIndex: 'deviceName',
      width: 180,
      render: (value: string, record: DeviceRecord) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Typography.Text style={{ fontWeight: 600, color: '#0f172a' }}>
            {record.nickname || value}
          </Typography.Text>
          <Typography.Text code style={{ fontSize: 12, width: 'fit-content' }}>
            {value}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '产品',
      dataIndex: 'productId',
      width: 220,
      render: (value: number) => {
        const product = productLookup.get(value);
        if (!product) {
          return <Typography.Text type="secondary">-</Typography.Text>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Typography.Text style={{ fontWeight: 600, color: '#0f172a' }}>
              {product.name}
            </Typography.Text>
            <Typography.Text code style={{ fontSize: 12, width: 'fit-content' }}>
              {product.productKey}
            </Typography.Text>
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <Tag color={statusColors[value]}>{statusLabels[value] || value}</Tag>,
    },
    {
      title: '在线',
      dataIndex: 'onlineStatus',
      width: 90,
      render: (value: string) => {
        const badge = onlineBadge[value] || onlineBadge.UNKNOWN;
        return <Badge status={badge.status} text={badge.text} />;
      },
    },
    {
      title: '固件版本',
      dataIndex: 'firmwareVersion',
      width: 120,
      render: (value: string) => value || '-',
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      width: 140,
      render: (value: string) => value || '-',
    },
    {
      title: '最近在线',
      dataIndex: 'lastOnlineAt',
      width: 180,
      render: (value: string) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
    },
    {
      title: '操作',
      width: 360,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 'DISABLED' ? '启用' : '禁用'}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<KeyOutlined />}
            loading={viewingSecretId === record.id}
            onClick={() => void handleViewSecret(record)}
          >
            密钥
          </Button>
          <Button type="link" size="small" onClick={() => setLocatorDevice(record)}>
            标识
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloudOutlined />}
            onClick={() => {
              const product = productLookup.get(record.productId);
              setShadowDevice({
                id: record.id,
                deviceName: record.deviceName,
                nickname: record.nickname || undefined,
                productName: product?.name,
                productKey: product?.productKey,
              });
              setShadowOpen(true);
            }}
          >
            影子
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const rowSelection: TableRowSelection<DeviceRecord> = {
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  const stats = useMemo(
    () => ({
      online: data.filter((item) => item.onlineStatus === 'ONLINE').length,
      offline: data.filter((item) => item.onlineStatus === 'OFFLINE').length,
      disabled: data.filter((item) => item.status === 'DISABLED').length,
    }),
    [data],
  );

  return (
    <div>
      <PageHeader
        title="设备管理"
        description={`共 ${total} 台设备`}
        extra={
          <Space wrap>
            <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExportTriples}>
              {selectedDeviceIds.length > 0 ? `导出已选三元组 (${selectedDeviceIds.length})` : '导出当前筛选三元组'}
            </Button>
            <Button icon={<UploadOutlined />} onClick={handleOpenBatchCreateModal}>
              批量注册
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreateModal}>
              新建设备
            </Button>
          </Space>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '设备总数', value: total, icon: <CloudServerOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '在线', value: stats.online, icon: <ApiOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '离线', value: stats.offline, icon: <DisconnectOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
          { title: '已禁用', value: stats.disabled, icon: <StopOutlined />, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
        ].map((item) => (
          <Col xs={12} sm={6} key={item.title}>
            <Card
              styles={{ body: { padding: '14px 16px' } }}
              style={{
                borderRadius: 18,
                border: '1px solid rgba(148,163,184,0.14)',
                boxShadow: '0 12px 28px rgba(15,23,42,0.05)',
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: item.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    color: item.color,
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{item.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{item.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        styles={{ body: { padding: '12px 16px' } }}
        style={{
          borderRadius: 18,
          marginBottom: 16,
          border: '1px solid rgba(148,163,184,0.14)',
          boxShadow: '0 14px 32px rgba(15,23,42,0.05)',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
        }}
      >
        <Space wrap style={{ width: '100%' }}>
          <Search
            value={searchText}
            placeholder="搜索设备名称/别名"
            allowClear
            style={{ width: 220 }}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearchText(nextValue);
              if (!nextValue) {
                setKeyword('');
                setParams((prev) => ({ ...prev, pageNum: 1 }));
              }
            }}
            onSearch={(value) => {
              setSearchText(value);
              setKeyword(value.trim());
              setParams((prev) => ({ ...prev, pageNum: 1 }));
            }}
          />
          <Select
            placeholder="所属产品"
            allowClear
            style={{ width: 220 }}
            options={products.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey})` }))}
            onChange={(value) => {
              setFilterProduct(value);
              setParams((prev) => ({ ...prev, pageNum: 1 }));
            }}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            options={[
              { value: 'INACTIVE', label: '未激活' },
              { value: 'ACTIVE', label: '已激活' },
              { value: 'DISABLED', label: '已禁用' },
            ]}
            onChange={(value) => {
              setFilterStatus(value);
              setParams((prev) => ({ ...prev, pageNum: 1 }));
            }}
          />
          <Select
            placeholder="在线状态"
            allowClear
            style={{ width: 120 }}
            options={[
              { value: 'ONLINE', label: '在线' },
              { value: 'OFFLINE', label: '离线' },
            ]}
            onChange={(value) => {
              setFilterOnline(value);
              setParams((prev) => ({ ...prev, pageNum: 1 }));
            }}
          />
        </Space>
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid rgba(148,163,184,0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Space wrap size={[8, 8]}>
            <Typography.Text type="secondary">当前筛选</Typography.Text>
            {activeFilters.length > 0 ? activeFilters.map((item) => (
              <Tag key={item.key} color="blue">
                {item.label}: {item.value}
              </Tag>
            )) : <Tag>全部设备</Tag>}
          </Space>
          <Space wrap size={[8, 8]}>
            <Tag color="purple">已选 {selectedDeviceIds.length} 台</Tag>
            <Tag color="green">当前页在线 {stats.online} 台</Tag>
            <Tag>当前页离线 {stats.offline} 台</Tag>
          </Space>
        </div>
      </Card>

      <Card
        title="设备目录"
        extra={(
          <Space wrap size={[8, 8]}>
            {selectedDeviceIds.length > 0 ? <Tag color="purple">已选择 {selectedDeviceIds.length} 台设备</Tag> : null}
            <Tag color="blue">支持直接查看影子、标识和密钥</Tag>
          </Space>
        )}
        style={{
          borderRadius: 18,
          border: '1px solid rgba(148,163,184,0.14)',
          boxShadow: '0 16px 36px rgba(15,23,42,0.05)',
        }}
      >
        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1300 }}
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

      <Modal
        title="新建设备"
        open={createOpen}
        width={560}
        destroyOnHidden
        onCancel={closeCreateModal}
        onOk={() => createForm.submit()}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="这里只支持一机一密产品手动建设备。"
            description="一型一密产品请前往产品管理中的产品接入工具，使用动态注册创建设备。"
          />
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}>
            <Select
              placeholder="请选择产品"
              options={manualRegistrationProducts.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.productKey}) · ${DEVICE_AUTH_LABELS[item.deviceAuthType || 'DEVICE_SECRET'] || '一机一密'}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="deviceName"
            label="设备名称"
            rules={[
              { required: true, message: '请输入设备名称' },
              { pattern: DEVICE_NAME_PATTERN, message: DEVICE_NAME_RULE_MESSAGE },
            ]}
          >
            <Input placeholder="如：AA:BB:CC:DD:EE:FF / SN20240301001" maxLength={64} />
          </Form.Item>
          <Form.Item name="nickname" label="设备别名">
            <Input placeholder="可读名称" maxLength={256} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="批量注册设备"
        open={batchCreateOpen}
        width={820}
        destroyOnClose
        onClose={closeBatchCreateModal}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeBatchCreateModal}>取消</Button>
            <Button type="primary" loading={batchCreating} onClick={() => batchCreateForm.submit()}>
              批量注册设备
            </Button>
          </Space>
        }
      >
        <Form form={batchCreateForm} layout="vertical" onFinish={handleBatchCreate}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Excel 批量导入仅适用于一机一密产品。"
            description="一型一密产品不能在设备管理页预创建设备，请改用产品接入工具里的动态注册。"
          />
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}>
            <Select
              placeholder="请选择产品"
              options={manualRegistrationProducts.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.productKey}) · ${DEVICE_AUTH_LABELS[item.deviceAuthType || 'DEVICE_SECRET'] || '一机一密'}`,
              }))}
            />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="先下载模板，填写 deviceName / nickname 后再导入 Excel 或 CSV。"
            description="deviceName 支持 MAC 地址、SN 编码和自定义设备编码。文件会上传到服务器异步解析处理。"
          />

          <Space wrap style={{ marginBottom: 16 }}>
            <Button icon={<UploadOutlined />} onClick={handleTriggerBatchImport} disabled={batchCreating}>
              选择 Excel/CSV 文件
            </Button>
            {batchImportFile ? (
              <Typography.Text type="secondary">已选择: {batchImportFile.name}</Typography.Text>
            ) : null}
          </Space>

          <input
            ref={batchImportInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            style={{ display: 'none' }}
            onChange={handleBatchImportChange}
          />

          {importProgress !== null && (
            <Card
              size="small"
              title="导入进度"
              styles={{ body: { padding: 16 } }}
              style={{ marginBottom: 16 }}
            >
              <Progress percent={importProgress} status={importProgress === 100 ? 'success' : 'active'} />
              <Typography.Text type="secondary" style={{ marginTop: 8, display: 'block' }}>
                正在异步处理中，请稍候...
              </Typography.Text>
            </Card>
          )}

          <Form.Item name="description" label="统一描述">
            <TextArea rows={2} placeholder="可选，批量注册的设备会统一带上这段描述" />
          </Form.Item>
          <Form.Item name="tags" label="统一标签">
            <Input placeholder="可选，逗号分隔，例如 warehouse,floor-2" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title="编辑设备"
        open={editOpen}
        width={560}
        destroyOnHidden
        onCancel={closeEditModal}
        onOk={() => editForm.submit()}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="nickname" label="设备别名">
            <Input maxLength={256} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="逗号分隔" />
          </Form.Item>
        </Form>
      </Modal>

      <DeviceShadowDrawer
        deviceId={shadowDevice?.id || null}
        deviceName={shadowDevice?.deviceName}
        nickname={shadowDevice?.nickname}
        productName={shadowDevice?.productName}
        productKey={shadowDevice?.productKey}
        open={shadowOpen}
        onClose={() => {
          setShadowOpen(false);
          setShadowDevice(null);
        }}
      />
      <DeviceLocatorModal
        deviceId={locatorDevice?.id || null}
        deviceName={locatorDevice?.deviceName}
        open={Boolean(locatorDevice)}
        onClose={() => setLocatorDevice(null)}
      />
    </div>
  );
};

export default DeviceList;
