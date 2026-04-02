import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileProtectOutlined,
  PlusOutlined,
  RocketOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  UsbOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import PageHeader from '../../components/PageHeader';
import { deviceFirmwareApi, fileApi, firmwareApi, otaTaskApi, productApi } from '../../services/api';

interface ProductOption {
  id: number;
  productKey: string;
  name: string;
}

interface FirmwareRecord {
  id: number;
  productId: number;
  version: string;
  displayName?: string;
  description?: string;
  fileUrl?: string;
  fileSize?: number;
  md5Checksum?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

interface DeviceBindingRecord {
  deviceId: number;
  deviceName: string;
  nickname?: string;
  productId: number;
  productKey?: string;
  productName?: string;
  onlineStatus?: string;
  firmwareId?: number;
  currentVersion?: string;
  targetVersion?: string;
  upgradeStatus?: string;
  upgradeProgress?: number;
  lastUpgradeAt?: string;
  updatedAt?: string;
}

interface OtaTaskRecord {
  id: number;
  productId: number;
  firmwareId: number;
  name: string;
  taskType: string;
  srcVersion?: string;
  destVersion: string;
  status: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  grayRatio?: number;
  createdAt: string;
}

interface SummaryCardItem {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

interface BindingPreset {
  productId?: number;
  firmwareId?: number;
}

interface ProductScopedProps {
  productOptions: ProductOption[];
  productLabelMap: Map<number, string>;
}

interface FirmwareLibraryTabProps extends ProductScopedProps {
  onInspectBindings: (preset: BindingPreset) => void;
}

interface DeviceBindingsTabProps extends ProductScopedProps {
  preset: BindingPreset;
  presetToken: number;
}

const fwStatusLabels: Record<string, string> = { DRAFT: '草稿', VERIFIED: '已验证', RELEASED: '已发布' };
const fwStatusColors: Record<string, string> = { DRAFT: 'default', VERIFIED: 'processing', RELEASED: 'success' };
const taskStatusLabels: Record<string, string> = { PENDING: '待执行', IN_PROGRESS: '执行中', COMPLETED: '已完成', CANCELLED: '已取消' };
const taskStatusColors: Record<string, string> = { PENDING: 'default', IN_PROGRESS: 'processing', COMPLETED: 'success', CANCELLED: 'warning' };
const taskTypeLabels: Record<string, string> = { FULL: '全量', GRAY: '灰度' };
const onlineStatusLabels: Record<string, string> = { ONLINE: '在线', OFFLINE: '离线', UNKNOWN: '未知' };
const onlineStatusColors: Record<string, string> = { ONLINE: 'success', OFFLINE: 'default', UNKNOWN: 'warning' };
const upgradeStatusLabels: Record<string, string> = {
  IDLE: '待机',
  PENDING: '待执行',
  DOWNLOADING: '下载中',
  UPGRADING: '升级中',
  SUCCESS: '成功',
  FAILED: '失败',
};
const upgradeStatusColors: Record<string, string> = {
  IDLE: 'default',
  PENDING: 'default',
  DOWNLOADING: 'processing',
  UPGRADING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
};

const cardStyle = {
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const normalizeText = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const buildProductLabel = (product: ProductOption) => `${product.name} (${product.productKey})`;

const SummaryCards: React.FC<{ items: SummaryCardItem[] }> = ({ items }) => (
  <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
    {items.map((item) => (
      <Col xs={12} sm={6} key={item.title}>
        <Card bodyStyle={{ padding: '14px 16px' }} style={cardStyle}>
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
);

const FirmwareLibraryTab: React.FC<FirmwareLibraryTabProps> = ({ productOptions, productLabelMap, onInspectBindings }) => {
  const [data, setData] = useState<FirmwareRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; productId?: number; status?: string }>({ keyword: '' });
  const [filters, setFilters] = useState<{ keyword: string; productId?: number; status?: string }>({ keyword: '' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<FirmwareRecord | null>(null);
  const [selectedBinary, setSelectedBinary] = useState<File | null>(null);
  const [uploadFileList, setUploadFileList] = useState<UploadFile[]>([]);
  const [form] = Form.useForm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await firmwareApi.list({
        ...params,
        keyword: filters.keyword || undefined,
        productId: filters.productId,
        status: filters.status,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载固件列表失败');
    } finally {
      setLoading(false);
    }
  }, [filters, params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const fwStats = useMemo(
    () => ({
      draft: data.filter((item) => item.status === 'DRAFT').length,
      verified: data.filter((item) => item.status === 'VERIFIED').length,
      released: data.filter((item) => item.status === 'RELEASED').length,
    }),
    [data],
  );

  const resetEditor = () => {
    setDrawerOpen(false);
    setEditingRecord(null);
    setSelectedBinary(null);
    setUploadFileList([]);
    form.resetFields();
  };

  const openCreateDrawer = () => {
    setEditingRecord(null);
    setSelectedBinary(null);
    setUploadFileList([]);
    form.resetFields();
    setDrawerOpen(true);
  };

  const openEditDrawer = (record: FirmwareRecord) => {
    setEditingRecord(record);
    setSelectedBinary(null);
    setUploadFileList([]);
    form.setFieldsValue({
      displayName: record.displayName,
      description: record.description,
      productId: record.productId,
      version: record.version,
    });
    setDrawerOpen(true);
  };

  const uploadProps: UploadProps = {
    maxCount: 1,
    fileList: uploadFileList,
    beforeUpload: (file) => {
      setSelectedBinary(file as File);
      setUploadFileList([{ uid: file.uid, name: file.name, status: 'done' }]);
      return Upload.LIST_IGNORE;
    },
    onRemove: () => {
      setSelectedBinary(null);
      setUploadFileList([]);
      return true;
    },
  };

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      productId: draftFilters.productId,
      status: draftFilters.status,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const handleDelete = (record: FirmwareRecord) => {
    Modal.confirm({
      title: '确认删除固件？',
      content: `删除「${record.version}」后不可恢复。`,
      onOk: async () => {
        await firmwareApi.delete(record.id);
        message.success('固件已删除');
        await fetchData();
      },
    });
  };

  const handleVerify = async (record: FirmwareRecord) => {
    try {
      await firmwareApi.verify(record.id);
      message.success('固件已验证');
      await fetchData();
    } catch {
      message.error('验证失败');
    }
  };

  const handleRelease = async (record: FirmwareRecord) => {
    try {
      await firmwareApi.release(record.id);
      message.success('固件已发布');
      await fetchData();
    } catch {
      message.error('发布失败');
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!editingRecord && !selectedBinary) {
      message.error('请选择固件文件');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        displayName: normalizeText(values.displayName),
        description: normalizeText(values.description),
      };

      if (!editingRecord) {
        payload.productId = values.productId;
        payload.version = normalizeText(values.version);
      }

      // 固件文件在提交时才真正上传，避免用户取消抽屉后留下无归属的 MinIO 孤儿文件。
      if (selectedBinary) {
        const uploadRes = await fileApi.uploadFirmware(selectedBinary);
        const uploadData = uploadRes.data.data || {};
        payload.fileUrl = uploadData.url;
        payload.fileSize = Number(uploadData.fileSize || selectedBinary.size || 0);
        payload.md5Checksum = uploadData.md5Checksum;
      }

      if (editingRecord) {
        await firmwareApi.update(editingRecord.id, payload);
        message.success('固件已更新');
      } else {
        await firmwareApi.create(payload);
        message.success('固件已上传');
      }

      resetEditor();
      await fetchData();
    } catch {
      message.error(editingRecord ? '更新失败' : '上传失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<FirmwareRecord> = [
    {
      title: '产品',
      dataIndex: 'productId',
      width: 220,
      render: (value: number) => productLabelMap.get(value) || `#${value}`,
    },
    { title: '版本号', dataIndex: 'version', width: 120 },
    {
      title: '显示名称',
      dataIndex: 'displayName',
      width: 180,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string) => <Tag color={fwStatusColors[value]}>{fwStatusLabels[value] || value}</Tag>,
    },
    {
      title: '文件大小',
      dataIndex: 'fileSize',
      width: 110,
      render: (value?: number) => formatSize(value),
    },
    {
      title: 'MD5',
      dataIndex: 'md5Checksum',
      width: 150,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作',
      width: 320,
      fixed: 'right',
      render: (_value, record) => (
        <Space wrap>
          <Button type="link" size="small" icon={<UsbOutlined />} onClick={() => onInspectBindings({ productId: record.productId, firmwareId: record.id })}>
            设备版本
          </Button>
          {record.status === 'DRAFT' && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>
              编辑
            </Button>
          )}
          {record.status === 'DRAFT' && (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => void handleVerify(record)}>
              验证
            </Button>
          )}
          {record.status === 'VERIFIED' && (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => void handleRelease(record)}>
              发布
            </Button>
          )}
          {record.status !== 'RELEASED' && (
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
              删除
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <SummaryCards
        items={[
          { title: '固件总数', value: total, icon: <FileProtectOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '草稿', value: fwStats.draft, icon: <CloudUploadOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
          { title: '已验证', value: fwStats.verified, icon: <CheckCircleOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '已发布', value: fwStats.released, icon: <RocketOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
        ]}
      />

      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索版本号或名称"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            placeholder="产品"
            allowClear
            style={{ width: 220 }}
            value={draftFilters.productId}
            options={productOptions.map((item) => ({ value: item.id, label: buildProductLabel(item) }))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, productId: value }))}
          />
          <Select
            className="ff-query-field"
            placeholder="状态"
            allowClear
            style={{ width: 140 }}
            value={draftFilters.status}
            options={Object.entries(fwStatusLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>上传固件</Button>
          </div>
        </div>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1380 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, pageSize: number) => setParams({ pageNum: page, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={editingRecord ? '编辑固件' : '上传固件'}
        open={drawerOpen}
        width={640}
        destroyOnClose
        onClose={resetEditor}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={resetEditor}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>
              {editingRecord ? '保存修改' : '上传固件'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSubmit(values)}>
          {!editingRecord && (
            <>
              <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}>
                <Select
                  placeholder="请选择产品"
                  showSearch
                  optionFilterProp="label"
                  options={productOptions.map((item) => ({ value: item.id, label: buildProductLabel(item) }))}
                />
              </Form.Item>
              <Form.Item name="version" label="版本号" rules={[{ required: true, message: '请输入版本号' }]}>
                <Input placeholder="如：1.2.0" />
              </Form.Item>
            </>
          )}
          {editingRecord && (
            <Form.Item label="当前版本">
              <Input value={editingRecord.version} disabled />
            </Form.Item>
          )}
          <Form.Item name="displayName" label="显示名称">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="固件文件" required={!editingRecord}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />}>{editingRecord ? '重新选择文件' : '选择文件'}</Button>
              </Upload>
              {editingRecord?.fileUrl && uploadFileList.length === 0 ? <Tag color="blue">当前文件已保存</Tag> : null}
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

const DeviceBindingsTab: React.FC<DeviceBindingsTabProps> = ({ productOptions, productLabelMap, preset, presetToken }) => {
  const [data, setData] = useState<DeviceBindingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; productId?: number; firmwareId?: number; onlineStatus?: string; upgradeStatus?: string }>({ keyword: '' });
  const [filters, setFilters] = useState<{ keyword: string; productId?: number; firmwareId?: number; onlineStatus?: string; upgradeStatus?: string }>({ keyword: '' });
  const [filterFirmwareOptions, setFilterFirmwareOptions] = useState<FirmwareRecord[]>([]);
  const [bindDrawerOpen, setBindDrawerOpen] = useState(false);
  const [bindProductId, setBindProductId] = useState<number | undefined>();
  const [bindDeviceIds, setBindDeviceIds] = useState<number[]>([]);
  const [bindFirmwareOptions, setBindFirmwareOptions] = useState<FirmwareRecord[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<DeviceBindingRecord[]>([]);
  const [bindForm] = Form.useForm();

  const loadFirmwareOptions = useCallback(async (productId?: number, status?: string) => {
    if (!productId) {
      setFilterFirmwareOptions([]);
      return;
    }
    try {
      const res = await firmwareApi.list({ pageSize: 500, productId, status });
      setFilterFirmwareOptions(res.data.data?.records || []);
    } catch {
      setFilterFirmwareOptions([]);
    }
  }, []);

  const loadBindFirmwareOptions = useCallback(async (productId?: number) => {
    if (!productId) {
      setBindFirmwareOptions([]);
      return;
    }
    try {
      const res = await firmwareApi.list({ pageSize: 500, productId });
      setBindFirmwareOptions(res.data.data?.records || []);
    } catch {
      setBindFirmwareOptions([]);
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await deviceFirmwareApi.list({
        ...params,
        keyword: filters.keyword || undefined,
        productId: filters.productId,
        firmwareId: filters.firmwareId,
        onlineStatus: filters.onlineStatus,
        upgradeStatus: filters.upgradeStatus,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载设备版本失败');
    } finally {
      setLoading(false);
    }
  }, [filters, params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!presetToken) return;
    setDraftFilters({
      keyword: '',
      productId: preset.productId,
      firmwareId: preset.firmwareId,
      onlineStatus: undefined,
      upgradeStatus: undefined,
    });
    setFilters({
      keyword: '',
      productId: preset.productId,
      firmwareId: preset.firmwareId,
      onlineStatus: undefined,
      upgradeStatus: undefined,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
    void loadFirmwareOptions(preset.productId);
  }, [loadFirmwareOptions, preset, presetToken]);

  const bindingStats = useMemo(
    () => ({
      bound: data.filter((item) => !!item.currentVersion).length,
      online: data.filter((item) => item.onlineStatus === 'ONLINE').length,
      upgrading: data.filter((item) => ['DOWNLOADING', 'UPGRADING'].includes(item.upgradeStatus || '')).length,
    }),
    [data],
  );

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      productId: draftFilters.productId,
      firmwareId: draftFilters.firmwareId,
      onlineStatus: draftFilters.onlineStatus,
      upgradeStatus: draftFilters.upgradeStatus,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
    setFilterFirmwareOptions([]);
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const handleFilterProductChange = (value?: number) => {
    setDraftFilters((current) => ({
      ...current,
      productId: value,
      firmwareId: undefined,
    }));
    void loadFirmwareOptions(value);
  };

  const openBindDrawer = (record?: DeviceBindingRecord) => {
    const rows = record ? [record] : selectedRows;
    if (rows.length === 0) {
      message.error('请先选择设备');
      return;
    }
    const productIds = Array.from(new Set(rows.map((item) => item.productId)));
    if (productIds.length !== 1) {
      message.error('批量登记只能选择同一产品下的设备');
      return;
    }
    const deviceIds = rows.map((item) => item.deviceId);
    setBindProductId(productIds[0]);
    setBindDeviceIds(deviceIds);
    bindForm.resetFields();
    setBindDrawerOpen(true);
    void loadBindFirmwareOptions(productIds[0]);
  };

  const closeBindDrawer = () => {
    setBindDrawerOpen(false);
    setBindProductId(undefined);
    setBindDeviceIds([]);
    setBindFirmwareOptions([]);
    bindForm.resetFields();
  };

  const handleBindSubmit = async (values: Record<string, unknown>) => {
    if (bindDeviceIds.length === 0) {
      message.error('没有可登记的设备');
      return;
    }
    setBindingLoading(true);
    try {
      if (bindDeviceIds.length === 1) {
        await deviceFirmwareApi.bind({ deviceId: bindDeviceIds[0], firmwareId: values.firmwareId });
      } else {
        await deviceFirmwareApi.batchBind({ deviceIds: bindDeviceIds, firmwareId: values.firmwareId });
      }
      message.success(bindDeviceIds.length === 1 ? '设备版本已登记' : '设备版本已批量登记');
      closeBindDrawer();
      setSelectedRowKeys([]);
      setSelectedRows([]);
      await fetchData();
    } catch {
      message.error('登记失败');
    } finally {
      setBindingLoading(false);
    }
  };

  const columns: ColumnsType<DeviceBindingRecord> = [
    {
      title: '设备',
      width: 220,
      render: (_value, record) => record.nickname ? `${record.nickname} (${record.deviceName})` : record.deviceName,
    },
    {
      title: '产品',
      dataIndex: 'productId',
      width: 220,
      render: (value: number, record) => record.productName && record.productKey ? `${record.productName} (${record.productKey})` : productLabelMap.get(value) || `#${value}`,
    },
    {
      title: '在线状态',
      dataIndex: 'onlineStatus',
      width: 100,
      render: (value?: string) => <Tag color={onlineStatusColors[value || 'UNKNOWN'] || 'default'}>{onlineStatusLabels[value || 'UNKNOWN'] || value || '-'}</Tag>,
    },
    {
      title: '当前版本',
      dataIndex: 'currentVersion',
      width: 110,
      render: (value?: string) => value || '-',
    },
    {
      title: '目标版本',
      dataIndex: 'targetVersion',
      width: 110,
      render: (value?: string) => value || '-',
    },
    {
      title: '升级状态',
      dataIndex: 'upgradeStatus',
      width: 110,
      render: (value?: string) => <Tag color={upgradeStatusColors[value || 'IDLE'] || 'default'}>{upgradeStatusLabels[value || 'IDLE'] || value || '-'}</Tag>,
    },
    {
      title: '进度',
      dataIndex: 'upgradeProgress',
      width: 140,
      render: (value: number | undefined, record: DeviceBindingRecord) => (
        record.upgradeStatus && record.upgradeStatus !== 'IDLE' ? <Progress percent={value || 0} size="small" /> : '-'
      ),
    },
    {
      title: '最近更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
    {
      title: '操作',
      width: 110,
      fixed: 'right',
      render: (_value, record) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openBindDrawer(record)}>
          登记固件
        </Button>
      ),
    },
  ];

  const bindProductLabel = bindProductId ? productLabelMap.get(bindProductId) || `#${bindProductId}` : '-';

  return (
    <>
      <SummaryCards
        items={[
          { title: '设备总数', value: total, icon: <UsbOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '已登记版本', value: bindingStats.bound, icon: <FileProtectOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '在线设备', value: bindingStats.online, icon: <CheckCircleOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '升级中', value: bindingStats.upgrading, icon: <ThunderboltOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
        ]}
      />

      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索设备名称或备注名"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            placeholder="产品"
            allowClear
            style={{ width: 220 }}
            value={draftFilters.productId}
            options={productOptions.map((item) => ({ value: item.id, label: buildProductLabel(item) }))}
            onChange={handleFilterProductChange}
          />
          <Select
            className="ff-query-field"
            placeholder="固件"
            allowClear
            style={{ width: 220 }}
            value={draftFilters.firmwareId}
            options={filterFirmwareOptions.map((item) => ({ value: item.id, label: `${item.version}${item.displayName ? ` - ${item.displayName}` : ''}` }))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, firmwareId: value }))}
          />
          <Select
            className="ff-query-field"
            placeholder="在线状态"
            allowClear
            style={{ width: 130 }}
            value={draftFilters.onlineStatus}
            options={Object.entries(onlineStatusLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, onlineStatus: value }))}
          />
          <Select
            className="ff-query-field"
            placeholder="升级状态"
            allowClear
            style={{ width: 140 }}
            value={draftFilters.upgradeStatus}
            options={Object.entries(upgradeStatusLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, upgradeStatus: value }))}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
            <Button type="primary" icon={<EditOutlined />} disabled={selectedRowKeys.length === 0} onClick={() => openBindDrawer()}>
              批量登记
            </Button>
          </div>
        </div>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="deviceId"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1500 }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys, rows) => {
              setSelectedRowKeys(keys);
              setSelectedRows(rows as DeviceBindingRecord[]);
            },
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, pageSize: number) => setParams({ pageNum: page, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={bindDeviceIds.length > 1 ? '批量登记设备固件' : '登记设备固件'}
        open={bindDrawerOpen}
        width={520}
        destroyOnClose
        onClose={closeBindDrawer}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeBindDrawer}>取消</Button>
            <Button type="primary" loading={bindingLoading} onClick={() => bindForm.submit()}>
              保存登记
            </Button>
          </Space>
        }
      >
        <Form form={bindForm} layout="vertical" onFinish={(values) => void handleBindSubmit(values)}>
          <Form.Item label="设备数量">
            <Input value={`${bindDeviceIds.length} 台设备`} disabled />
          </Form.Item>
          <Form.Item label="所属产品">
            <Input value={bindProductLabel} disabled />
          </Form.Item>
          <Form.Item name="firmwareId" label="固件版本" rules={[{ required: true, message: '请选择固件' }]}>
            <Select
              placeholder="请选择固件版本"
              showSearch
              optionFilterProp="label"
              options={bindFirmwareOptions.map((item) => ({
                value: item.id,
                label: `${item.version}${item.displayName ? ` - ${item.displayName}` : ''}${item.status ? ` (${fwStatusLabels[item.status] || item.status})` : ''}`,
              }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

const OtaTasksTab: React.FC<ProductScopedProps> = ({ productOptions, productLabelMap }) => {
  const [data, setData] = useState<OtaTaskRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; productId?: number; status?: string }>({ keyword: '' });
  const [filters, setFilters] = useState<{ keyword: string; productId?: number; status?: string }>({ keyword: '' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>();
  const [firmwareOptions, setFirmwareOptions] = useState<FirmwareRecord[]>([]);
  const [createForm] = Form.useForm();
  const selectedFirmwareId = Form.useWatch('firmwareId', createForm) as number | undefined;
  const selectedTaskType = Form.useWatch('taskType', createForm) as string | undefined;

  const selectedFirmware = useMemo(
    () => firmwareOptions.find((item) => item.id === selectedFirmwareId),
    [firmwareOptions, selectedFirmwareId],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await otaTaskApi.list({
        ...params,
        keyword: filters.keyword || undefined,
        productId: filters.productId,
        status: filters.status,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载升级任务失败');
    } finally {
      setLoading(false);
    }
  }, [filters, params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const loadReleasedFirmwares = useCallback(async (productId?: number) => {
    if (!productId) {
      setFirmwareOptions([]);
      return;
    }
    try {
      const res = await firmwareApi.list({ pageSize: 500, productId, status: 'RELEASED' });
      setFirmwareOptions(res.data.data?.records || []);
    } catch {
      setFirmwareOptions([]);
    }
  }, []);

  const taskStats = useMemo(
    () => ({
      pending: data.filter((item) => item.status === 'PENDING').length,
      inProgress: data.filter((item) => item.status === 'IN_PROGRESS').length,
      completed: data.filter((item) => item.status === 'COMPLETED').length,
    }),
    [data],
  );

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      productId: draftFilters.productId,
      status: draftFilters.status,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const openCreateDrawer = () => {
    createForm.resetFields();
    setSelectedProductId(undefined);
    setFirmwareOptions([]);
    setDrawerOpen(true);
  };

  const closeCreateDrawer = () => {
    setDrawerOpen(false);
    setSelectedProductId(undefined);
    setFirmwareOptions([]);
    createForm.resetFields();
  };

  const handleProductChange = (productId?: number) => {
    setSelectedProductId(productId);
    createForm.setFieldValue('firmwareId', undefined);
    void loadReleasedFirmwares(productId);
  };

  const handleCreate = async (values: Record<string, unknown>) => {
    if (!selectedFirmware) {
      message.error('请选择目标固件');
      return;
    }
    setCreating(true);
    try {
      await otaTaskApi.create({
        name: normalizeText(values.name),
        description: normalizeText(values.description),
        productId: values.productId,
        firmwareId: values.firmwareId,
        taskType: values.taskType,
        srcVersion: normalizeText(values.srcVersion),
        destVersion: selectedFirmware.version,
        grayRatio: values.taskType === 'GRAY' ? values.grayRatio : undefined,
      });
      message.success('升级任务已创建');
      closeCreateDrawer();
      await fetchData();
    } catch {
      message.error('创建失败');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = (record: OtaTaskRecord) => {
    Modal.confirm({
      title: '确认取消升级任务？',
      content: `取消「${record.name}」后，进行中的升级不会继续下发。`,
      onOk: async () => {
        await otaTaskApi.cancel(record.id);
        message.success('任务已取消');
        await fetchData();
      },
    });
  };

  const columns: ColumnsType<OtaTaskRecord> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      width: 220,
      ellipsis: true,
    },
    {
      title: '产品',
      dataIndex: 'productId',
      width: 220,
      render: (value: number) => productLabelMap.get(value) || `#${value}`,
    },
    {
      title: '类型',
      dataIndex: 'taskType',
      width: 84,
      render: (value: string) => <Tag>{taskTypeLabels[value] || value}</Tag>,
    },
    {
      title: '目标版本',
      dataIndex: 'destVersion',
      width: 110,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string) => <Tag color={taskStatusColors[value]}>{taskStatusLabels[value] || value}</Tag>,
    },
    {
      title: '进度',
      width: 200,
      render: (_value, record) => {
        const percent = record.totalCount > 0 ? Math.round((record.successCount / record.totalCount) * 100) : 0;
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Progress percent={percent} size="small" />
            <span style={{ fontSize: 12 }}>
              总 {record.totalCount} | <span style={{ color: '#52c41a' }}>成功 {record.successCount}</span> | <span style={{ color: '#ff4d4f' }}>失败 {record.failureCount}</span>
            </span>
          </Space>
        );
      },
    },
    {
      title: '灰度比例',
      dataIndex: 'grayRatio',
      width: 100,
      render: (value?: number) => (value != null ? `${value}%` : '-'),
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作',
      width: 110,
      fixed: 'right',
      render: (_value, record) => (
        (record.status === 'PENDING' || record.status === 'IN_PROGRESS') ? (
          <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => handleCancel(record)}>
            取消
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <>
      <SummaryCards
        items={[
          { title: '任务总数', value: total, icon: <RocketOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '待执行', value: taskStats.pending, icon: <ThunderboltOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
          { title: '执行中', value: taskStats.inProgress, icon: <RocketOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '已完成', value: taskStats.completed, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
        ]}
      />

      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索任务名称"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            placeholder="产品"
            allowClear
            style={{ width: 220 }}
            value={draftFilters.productId}
            options={productOptions.map((item) => ({ value: item.id, label: buildProductLabel(item) }))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, productId: value }))}
          />
          <Select
            className="ff-query-field"
            placeholder="状态"
            allowClear
            style={{ width: 140 }}
            value={draftFilters.status}
            options={Object.entries(taskStatusLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>新建任务</Button>
          </div>
        </div>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1500 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, pageSize: number) => setParams({ pageNum: page, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title="新建升级任务"
        open={drawerOpen}
        width={640}
        destroyOnClose
        onClose={closeCreateDrawer}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeCreateDrawer}>取消</Button>
            <Button type="primary" loading={creating} onClick={() => createForm.submit()}>
              创建任务
            </Button>
          </Space>
        }
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => void handleCreate(values)}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="如：v1.2.0 全量升级" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}>
            <Select
              placeholder="请选择产品"
              showSearch
              optionFilterProp="label"
              options={productOptions.map((item) => ({ value: item.id, label: buildProductLabel(item) }))}
              onChange={handleProductChange}
            />
          </Form.Item>
          <Form.Item name="firmwareId" label="目标固件" rules={[{ required: true, message: '请选择目标固件' }]}>
            <Select
              placeholder={selectedProductId ? '请选择目标固件' : '请先选择产品'}
              disabled={!selectedProductId}
              showSearch
              optionFilterProp="label"
              options={firmwareOptions.map((item) => ({ value: item.id, label: `${item.version}${item.displayName ? ` - ${item.displayName}` : ''}` }))}
            />
          </Form.Item>
          <Form.Item label="目标版本">
            <Input value={selectedFirmware?.version || ''} disabled placeholder="选择固件后自动带出" />
          </Form.Item>
          <Form.Item name="taskType" label="任务类型" rules={[{ required: true, message: '请选择任务类型' }]}>
            <Select options={[{ value: 'FULL', label: '全量升级' }, { value: 'GRAY', label: '灰度升级' }]} />
          </Form.Item>
          <Form.Item name="srcVersion" label="源版本">
            <Input placeholder="可选，如 1.1.0" />
          </Form.Item>
          {selectedTaskType === 'GRAY' ? (
            <Form.Item name="grayRatio" label="灰度比例(%)" rules={[{ required: true, message: '请输入灰度比例' }]}>
              <InputNumber min={1} max={100} style={{ width: '100%' }} placeholder="如：10" />
            </Form.Item>
          ) : null}
        </Form>
      </Drawer>
    </>
  );
};

const OtaList: React.FC = () => {
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [activeTab, setActiveTab] = useState('firmware');
  const [bindingPreset, setBindingPreset] = useState<BindingPreset>({});
  const [bindingPresetToken, setBindingPresetToken] = useState(0);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await productApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setProductOptions(records.map((item: ProductOption) => ({ id: item.id, productKey: item.productKey, name: item.name })));
    } catch {
      setProductOptions([]);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const productLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    productOptions.forEach((item) => {
      map.set(item.id, buildProductLabel(item));
    });
    return map;
  }, [productOptions]);

  const handleInspectBindings = (preset: BindingPreset) => {
    setBindingPreset(preset);
    setBindingPresetToken((current) => current + 1);
    setActiveTab('devices');
  };

  return (
    <div>
      <PageHeader title="OTA 与固件" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'firmware',
              label: <span><FileProtectOutlined style={{ marginRight: 6 }} />固件库</span>,
              children: <FirmwareLibraryTab productOptions={productOptions} productLabelMap={productLabelMap} onInspectBindings={handleInspectBindings} />,
            },
            {
              key: 'devices',
              label: <span><UsbOutlined style={{ marginRight: 6 }} />设备版本</span>,
              children: <DeviceBindingsTab productOptions={productOptions} productLabelMap={productLabelMap} preset={bindingPreset} presetToken={bindingPresetToken} />,
            },
            {
              key: 'tasks',
              label: <span><RocketOutlined style={{ marginRight: 6 }} />升级任务</span>,
              children: <OtaTasksTab productOptions={productOptions} productLabelMap={productLabelMap} />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default OtaList;
