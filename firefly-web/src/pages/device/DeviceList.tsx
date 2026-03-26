import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Drawer, Form, Input, Modal, Progress, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { ApartmentOutlined, CloudOutlined, DeleteOutlined, DownloadOutlined, KeyOutlined, MinusCircleOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import { useNavigate } from 'react-router-dom';
import DeviceShadowDrawer from './DeviceShadowDrawer';
import DeviceLocatorModal from './DeviceLocatorModal';
import { asyncTaskApi, deviceApi, deviceGroupApi, deviceTagApi, fileApi, productApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';

const { TextArea } = Input;

interface DeviceTagRecord { id: number; tagKey: string; tagValue: string; color?: string; }
interface DeviceGroupRecord { id: number; name: string; type?: string; }
interface DeviceRecord {
  id: number;
  productId: number;
  deviceName: string;
  nickname?: string;
  description?: string;
  status: string;
  onlineStatus: string;
  firmwareVersion?: string;
  ipAddress?: string;
  tagList?: DeviceTagRecord[];
  groupList?: DeviceGroupRecord[];
  lastOnlineAt?: string;
  createdAt?: string;
}
interface ProductOption { id: number; name: string; productKey: string; deviceAuthType?: string; }
interface DeviceCredentialRecord { id: number; productId: number; productKey: string; productName?: string; deviceName: string; nickname?: string; deviceSecret: string; }
interface DeviceLocatorFormItem { locatorType?: string; locatorValue?: string; primaryLocator?: boolean; }
interface DeviceCreateFormValues { productId: number; deviceName: string; nickname?: string; description?: string; tagIds?: number[]; groupIds?: number[]; locators?: DeviceLocatorFormItem[]; }
interface DeviceBatchCreateFormValues { productId: number; description?: string; tagIds?: number[]; groupIds?: number[]; }
interface DeviceUpdateFormValues { nickname?: string; description?: string; tagIds?: number[]; groupIds?: number[]; }
interface AsyncTaskRecord { status: string; progress?: number; errorMessage?: string; }
interface ShadowDeviceContext { id: number; productId: number; deviceName: string; nickname?: string; productName?: string; productKey?: string; }
interface DeviceListFilters { keyword: string; productId?: number; groupId?: number; status?: string; onlineStatus?: string; }

const DEVICE_AUTH_LABELS: Record<string, string> = { DEVICE_SECRET: '一机一密', PRODUCT_SECRET: '一型一密' };
const DEVICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{1,63}$/;
const DEVICE_NAME_RULE_MESSAGE = '支持 2-64 位字母、数字、冒号、下划线、中划线和小数点，并且必须以字母或数字开头';
const STATUS_LABELS: Record<string, string> = { INACTIVE: '未激活', ACTIVE: '已激活', DISABLED: '已禁用' };
const STATUS_COLORS: Record<string, string> = { INACTIVE: 'default', ACTIVE: 'success', DISABLED: 'error' };
const ONLINE_BADGE: Record<string, { status: 'success' | 'default' | 'warning'; text: string }> = {
  ONLINE: { status: 'success', text: '在线' },
  OFFLINE: { status: 'default', text: '离线' },
  UNKNOWN: { status: 'warning', text: '未知' },
};
const LOCATOR_TYPE_OPTIONS = [
  { value: 'IMEI', label: 'IMEI' },
  { value: 'ICCID', label: 'ICCID' },
  { value: 'MAC', label: 'MAC' },
  { value: 'SERIAL', label: 'SERIAL' },
];
const EMPTY_DEVICE_FILTERS: DeviceListFilters = { keyword: '' };

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const toCsvValue = (value: unknown) => {
  const text = `${value ?? ''}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const normalizeLocatorInputs = (locators?: DeviceLocatorFormItem[]) => {
  const normalized = (locators || [])
    .map((item) => ({
      locatorType: item.locatorType?.trim().toUpperCase(),
      locatorValue: item.locatorValue?.trim(),
      primaryLocator: Boolean(item.primaryLocator),
    }))
    .filter((item) => item.locatorType && item.locatorValue);
  if (normalized.length > 0 && !normalized.some((item) => item.primaryLocator)) {
    normalized[0].primaryLocator = true;
  }
  return normalized.length > 0 ? normalized : undefined;
};

const exportTriples = (records: DeviceCredentialRecord[]) => {
  const header = ['设备ID', '产品ID', '产品Key', '产品名称', '设备名称', '设备别名', '设备密钥'];
  const rows = records.map((item) => [item.id, item.productId, item.productKey, item.productName || '', item.deviceName, item.nickname || '', item.deviceSecret].map(toCsvValue).join(','));
  const blob = new Blob([`\uFEFF${header.join(',')}\r\n${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `device-triples-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
};

const pollTaskStatus = async (taskId: number, onProgress: (progress: number) => void, onComplete: () => void, onFail: (error: string) => void) => {
  let attempts = 0;
  const poll = async () => {
    try {
      const res = await asyncTaskApi.get(taskId);
      const task = res.data.data as AsyncTaskRecord;
      if (task.status === 'COMPLETED' || task.status === 'SUCCESS') { onProgress(100); onComplete(); return; }
      if (task.status === 'FAILED') { onFail(task.errorMessage || '导入失败'); return; }
      if (task.progress !== undefined) onProgress(task.progress);
      attempts += 1;
      if (attempts < 120) setTimeout(poll, 2000);
      else onFail('任务执行超时，请到任务中心查看');
    } catch { onFail('查询任务状态失败'); }
  };
  poll();
};

const DeviceList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [batchCreating, setBatchCreating] = useState(false);
  const [viewingSecretId, setViewingSecretId] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createForm] = Form.useForm<DeviceCreateFormValues>();
  const [batchForm] = Form.useForm<DeviceBatchCreateFormValues>();
  const [editForm] = Form.useForm<DeviceUpdateFormValues>();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [tags, setTags] = useState<DeviceTagRecord[]>([]);
  const [groups, setGroups] = useState<DeviceGroupRecord[]>([]);
  const [draftFilters, setDraftFilters] = useState<DeviceListFilters>(EMPTY_DEVICE_FILTERS);
  const [filters, setFilters] = useState<DeviceListFilters>(EMPTY_DEVICE_FILTERS);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [shadowDevice, setShadowDevice] = useState<ShadowDeviceContext | null>(null);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [locatorDevice, setLocatorDevice] = useState<DeviceRecord | null>(null);
  const [batchImportFile, setBatchImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const batchImportInputRef = useRef<HTMLInputElement | null>(null);

  const selectedDeviceIds = useMemo(() => selectedRowKeys.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0), [selectedRowKeys]);
  const manualProducts = useMemo(() => products.filter((item) => item.deviceAuthType !== 'PRODUCT_SECRET'), [products]);
  const productLookup = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const tagOptions = useMemo(() => tags.map((item) => ({ value: item.id, label: `${item.tagKey}: ${item.tagValue}` })), [tags]);
  const groupOptions = useMemo(() => groups.map((item) => ({ value: item.id, label: item.name })), [groups]);

  const fetchProducts = async () => {
    try { const res = await productApi.list({ pageNum: 1, pageSize: 500 }); setProducts(res.data.data.records || []); } catch { setProducts([]); }
  };
  const fetchTags = async () => {
    try { const res = await deviceTagApi.listAll(); setTags(res.data.data || []); } catch { setTags([]); }
  };
  const fetchGroups = async () => {
    try {
      const res = await deviceGroupApi.listAll();
      setGroups((res.data.data || [])
        .filter((item: DeviceGroupRecord) => item.type !== 'DYNAMIC')
        .map((item: DeviceGroupRecord) => ({ id: item.id, name: item.name, type: item.type })));
    } catch {
      setGroups([]);
    }
  };
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await deviceApi.list({
        ...params,
        keyword: filters.keyword || undefined,
        productId: filters.productId,
        groupId: filters.groupId,
        status: filters.status,
        onlineStatus: filters.onlineStatus,
      });
      setData(res.data.data.records || []);
      setTotal(res.data.data.total || 0);
    } catch (error) { message.error(getErrorMessage(error, '加载设备列表失败')); }
    finally { setLoading(false); }
  };

  useEffect(() => { void fetchProducts(); void fetchTags(); void fetchGroups(); }, []);
  useEffect(() => { void fetchData(); }, [filters, params.pageNum, params.pageSize]);

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      productId: draftFilters.productId,
      groupId: draftFilters.groupId,
      status: draftFilters.status,
      onlineStatus: draftFilters.onlineStatus,
    });
    setParams((prev) => ({ ...prev, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_DEVICE_FILTERS);
    setFilters({ ...EMPTY_DEVICE_FILTERS });
    setParams((prev) => ({ ...prev, pageNum: 1 }));
  };

  const ensureManualRegistrationProducts = () => {
    if (manualProducts.length > 0) return true;
    message.warning('当前没有可手动创建设备的产品，请选择一机一密产品或通过动态注册创建设备');
    return false;
  };

  const closeCreateModal = () => { setCreateOpen(false); createForm.resetFields(); };
  const closeEditModal = () => { setEditOpen(false); setEditingId(null); editForm.resetFields(); };
  const closeBatchDrawer = () => { setBatchOpen(false); setBatchCreating(false); setBatchImportFile(null); setImportProgress(null); batchForm.resetFields(); };

  const showCredentialModal = (credential: DeviceCredentialRecord, title = '设备三元组（仅展示一次）') => {
    Modal.info({
      title,
      width: 620,
      content: (
        <Card size="small" styles={{ body: { padding: 12 } }}>
          <Space direction="vertical" size={8}>
            <Typography.Text copyable={{ text: credential.productKey }}>产品Key：{credential.productKey}</Typography.Text>
            <Typography.Text copyable={{ text: credential.deviceName }}>设备名称：{credential.deviceName}</Typography.Text>
            <Typography.Text copyable={{ text: credential.deviceSecret }}>设备密钥：{credential.deviceSecret}</Typography.Text>
          </Space>
        </Card>
      ),
    });
  };

  const handleViewSecret = async (record: DeviceRecord) => {
    try {
      setViewingSecretId(record.id);
      const res = await deviceApi.getSecret(record.id);
      const deviceSecret = typeof res.data.data === 'string' ? res.data.data : '';
      if (!deviceSecret) { message.warning('未获取到设备密钥'); return; }
      const product = products.find((item) => item.id === record.productId);
      showCredentialModal({ id: record.id, productId: record.productId, productKey: product?.productKey || '-', productName: product?.name, deviceName: record.deviceName, nickname: record.nickname, deviceSecret }, '查看设备密钥');
    } catch (error) { message.error(getErrorMessage(error, '获取设备密钥失败')); }
    finally { setViewingSecretId(null); }
  };

  const handleCreate = async (values: DeviceCreateFormValues) => {
    try {
      const res = await deviceApi.create({
        ...values,
        locators: normalizeLocatorInputs(values.locators),
      });
      message.success('设备创建成功');
      closeCreateModal();
      void fetchData();
      if (res.data.data?.deviceSecret) showCredentialModal(res.data.data as DeviceCredentialRecord);
    } catch (error) { message.error(getErrorMessage(error, '创建设备失败')); }
  };

  const handleBatchImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.csv')) { message.error('请导入 Excel 或 CSV 文件'); return; }
    setBatchImportFile(file);
    message.success(`已选择文件：${file.name}`);
  };

  const handleBatchCreate = async (values: DeviceBatchCreateFormValues) => {
    if (!batchImportFile) { message.warning('请先选择导入文件'); return; }
    try {
      setBatchCreating(true);
      setImportProgress(0);
      const uploadRes = await fileApi.upload(batchImportFile, 'device-import');
      const fileKey = uploadRes.data.data?.fileKey || uploadRes.data.data?.objectName;
      if (!fileKey) throw new Error('上传文件失败');
      setImportProgress(10);
      const importRes = await deviceApi.importDevices({
        productId: values.productId,
        fileKey,
        fileFormat: batchImportFile.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX',
        description: values.description,
        tagIds: values.tagIds,
        groupIds: values.groupIds,
      });
      pollTaskStatus(importRes.data.data as number, (progress) => setImportProgress(Math.max(20, progress)), () => { message.success('批量导入任务已完成'); closeBatchDrawer(); void fetchData(); }, (error) => { message.error(error); setBatchCreating(false); setImportProgress(null); });
    } catch (error) { message.error(getErrorMessage(error, '导入设备失败')); setBatchCreating(false); setImportProgress(null); }
  };

  const handleEdit = (record: DeviceRecord) => {
    setEditingId(record.id);
    editForm.setFieldsValue({
      nickname: record.nickname,
      description: record.description,
      tagIds: record.tagList?.map((item) => item.id) || [],
      groupIds: record.groupList?.map((item) => item.id) || [],
    });
    setEditOpen(true);
  };

  const handleUpdate = async (values: DeviceUpdateFormValues) => {
    if (!editingId) return;
    try { await deviceApi.update(editingId, values as unknown as Record<string, unknown>); message.success('设备更新成功'); closeEditModal(); void fetchData(); }
    catch (error) { message.error(getErrorMessage(error, '更新设备失败')); }
  };

  const handleToggleStatus = async (record: DeviceRecord) => {
    try {
      if (record.status === 'DISABLED') { await deviceApi.enable(record.id); message.success('设备已启用'); }
      else { await deviceApi.disable(record.id); message.success('设备已禁用'); }
      void fetchData();
    } catch (error) { message.error(getErrorMessage(error, '设备状态更新失败')); }
  };

  const handleDelete = (record: DeviceRecord) => {
    Modal.confirm({
      title: '确认删除设备？',
      content: `删除后设备将无法继续连接，确认删除“${record.deviceName}”？`,
      onOk: async () => {
        try { await deviceApi.delete(record.id); message.success('设备已删除'); setSelectedRowKeys((prev) => prev.filter((item) => Number(item) !== record.id)); void fetchData(); }
        catch (error) { message.error(getErrorMessage(error, '删除设备失败')); }
      },
    });
  };

  const handleExportTriples = async () => {
    if (selectedDeviceIds.length === 0 && total === 0) { message.warning('暂无可导出的设备'); return; }
    try {
      setExporting(true);
      const payload = selectedDeviceIds.length > 0
        ? { deviceIds: selectedDeviceIds }
        : {
            keyword: filters.keyword || undefined,
            productId: filters.productId,
            status: filters.status,
            onlineStatus: filters.onlineStatus,
          };
      const res = await deviceApi.exportTriples(payload);
      const credentials = (res.data.data || []) as DeviceCredentialRecord[];
      if (!credentials.length) { message.warning('没有匹配到可导出的设备三元组'); return; }
      exportTriples(credentials);
      message.success(`已导出 ${credentials.length} 条设备三元组`);
    } catch (error) { message.error(getErrorMessage(error, '导出设备三元组失败')); }
    finally { setExporting(false); }
  };

  const rowSelection: TableRowSelection<DeviceRecord> = { selectedRowKeys, preserveSelectedRowKeys: true, onChange: (keys) => setSelectedRowKeys(keys) };
  const columns: ColumnsType<DeviceRecord> = [
    { title: '设备名称', dataIndex: 'deviceName', width: 180, render: (value: string, record: DeviceRecord) => <Space direction="vertical" size={2}><Typography.Text strong>{record.nickname || value}</Typography.Text><Typography.Text code>{value}</Typography.Text></Space> },
    { title: '产品', dataIndex: 'productId', width: 220, render: (value: number) => { const product = productLookup.get(value); return product ? <Space direction="vertical" size={2}><Typography.Text strong>{product.name}</Typography.Text><Typography.Text code>{product.productKey}</Typography.Text></Space> : <Typography.Text type="secondary">-</Typography.Text>; } },
    { title: '标签', dataIndex: 'tagList', width: 220, render: (_: unknown, record: DeviceRecord) => record.tagList?.length ? <Space size={[6, 6]} wrap>{record.tagList.map((item) => <Tag key={item.id} color={item.color || 'blue'}>{item.tagKey}: {item.tagValue}</Tag>)}</Space> : <Typography.Text type="secondary">未设置</Typography.Text> },
    {
      title: '分组',
      dataIndex: 'groupList',
      width: 220,
      render: (_: unknown, record: DeviceRecord) => record.groupList?.length ? (
        <Space size={[6, 6]} wrap>
          {record.groupList.map((item) => (
            <Tag
              key={item.id}
              color={filters.groupId === item.id ? 'blue' : 'geekblue'}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                setDraftFilters((current) => ({ ...current, groupId: item.id }));
              }}
            >
              {item.name}
            </Tag>
          ))}
        </Space>
      ) : <Typography.Text type="secondary">未分组</Typography.Text>,
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (value: string) => <Tag color={STATUS_COLORS[value]}>{STATUS_LABELS[value] || value}</Tag> },
    { title: '在线', dataIndex: 'onlineStatus', width: 90, render: (value: string) => { const badge = ONLINE_BADGE[value] || ONLINE_BADGE.UNKNOWN; return <Badge status={badge.status} text={badge.text} />; } },
    { title: '固件版本', dataIndex: 'firmwareVersion', width: 120, render: (value?: string) => value || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => value || '-' },
    { title: '操作', width: 360, fixed: 'right', render: (_: unknown, record: DeviceRecord) => <Space><Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button><Button type="link" size="small" onClick={() => handleToggleStatus(record)}>{record.status === 'DISABLED' ? '启用' : '禁用'}</Button><Button type="link" size="small" icon={<KeyOutlined />} loading={viewingSecretId === record.id} onClick={() => void handleViewSecret(record)}>密钥</Button><Button type="link" size="small" onClick={() => setLocatorDevice(record)}>标识</Button><Button type="link" size="small" icon={<CloudOutlined />} onClick={() => { const product = productLookup.get(record.productId); setShadowDevice({ id: record.id, productId: record.productId, deviceName: record.deviceName, nickname: record.nickname, productName: product?.name, productKey: product?.productKey }); setShadowOpen(true); }}>影子</Button><Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button></Space> },
  ];

  return (
    <div>
      <PageHeader title="设备管理" description={`共 ${total} 台设备`} extra={<Space wrap><Button icon={<ApartmentOutlined />} onClick={() => navigate('/device-topology')}>设备拓扑</Button><Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExportTriples}>{selectedDeviceIds.length > 0 ? `导出已选三元组 (${selectedDeviceIds.length})` : '导出当前筛选三元组'}</Button><Button icon={<UploadOutlined />} onClick={() => { if (ensureManualRegistrationProducts()) setBatchOpen(true); }}>批量导入</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => { if (ensureManualRegistrationProducts()) setCreateOpen(true); }}>新建设备</Button></Space>} />

      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            value={draftFilters.keyword}
            allowClear
            placeholder="搜索设备名称/别名"
            onChange={(event) => {
              setDraftFilters((current) => ({ ...current, keyword: event.target.value }));
            }}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="所属产品"
            style={{ width: 240 }}
            value={draftFilters.productId}
            options={products.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey})` }))}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, productId: value }));
            }}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="所属分组"
            style={{ width: 220 }}
            value={draftFilters.groupId}
            options={groupOptions}
            optionFilterProp="label"
            showSearch
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, groupId: value }));
            }}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="设备状态"
            style={{ width: 140 }}
            value={draftFilters.status}
            options={[{ value: 'INACTIVE', label: '未激活' }, { value: 'ACTIVE', label: '已激活' }, { value: 'DISABLED', label: '已禁用' }]}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, status: value }));
            }}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="在线状态"
            style={{ width: 140 }}
            value={draftFilters.onlineStatus}
            options={[{ value: 'ONLINE', label: '在线' }, { value: 'OFFLINE', label: '离线' }]}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, onlineStatus: value }));
            }}
          />
          <div className="ff-query-actions">
            <Tag className="ff-query-meta" color="purple">已选择 {selectedDeviceIds.length} 台</Tag>
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table rowKey="id" rowSelection={rowSelection} columns={columns} dataSource={data} loading={loading} scroll={{ x: 1750 }} pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true, showTotal: (count) => `共 ${count} 条`, onChange: (page, pageSize) => setParams({ pageNum: page, pageSize }) }} />
      </Card>

      <Drawer title="新建设备" open={createOpen} width={760} destroyOnClose onClose={closeCreateModal} footer={<Space style={{ width: '100%', justifyContent: 'flex-end' }}><Button onClick={closeCreateModal}>取消</Button><Button type="primary" onClick={() => createForm.submit()}>保存并创建</Button></Space>}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="这里只支持一机一密产品手动创建设备" description="一型一密产品请在“产品接入”页面的“设备接入”入口中使用动态注册创建。" />
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}><Select options={manualProducts.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey}) · ${DEVICE_AUTH_LABELS[item.deviceAuthType || 'DEVICE_SECRET'] || '一机一密'}` }))} /></Form.Item>
          <Form.Item name="deviceName" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }, { pattern: DEVICE_NAME_PATTERN, message: DEVICE_NAME_RULE_MESSAGE }]}><Input maxLength={64} placeholder="例如：AA:BB:CC:DD:EE:FF / SN20240301001" /></Form.Item>
          <Form.Item label="设备标识" extra="注册时可一并写入 IMEI、ICCID、MAC、SERIAL，后续协议解析与设备识别会直接复用这些标识。">
            <Form.List name="locators">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => (
                    <Card key={field.key} size="small">
                      <Space align="start" style={{ display: 'flex' }}>
                        <Form.Item name={[field.name, 'locatorType']} label={index === 0 ? '标识类型' : undefined} rules={[{ required: true, message: '请选择标识类型' }]} style={{ width: 180, marginBottom: 0 }}>
                          <Select showSearch optionFilterProp="label" options={LOCATOR_TYPE_OPTIONS} placeholder="选择类型" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'locatorValue']} label={index === 0 ? '标识值' : undefined} rules={[{ required: true, message: '请输入标识值' }]} style={{ flex: 1, marginBottom: 0 }}>
                          <Input maxLength={128} placeholder="输入设备上报或业务侧使用的标识值" />
                        </Form.Item>
                        <Form.Item name={[field.name, 'primaryLocator']} label={index === 0 ? '主标识' : undefined} valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Switch checkedChildren="是" unCheckedChildren="否" />
                        </Form.Item>
                        <Form.Item label={index === 0 ? ' ' : undefined} style={{ marginBottom: 0 }}>
                          <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>
                            删除
                          </Button>
                        </Form.Item>
                      </Space>
                    </Card>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ locatorType: 'IMEI', primaryLocator: fields.length === 0 })}>
                    新增设备标识
                  </Button>
                </Space>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item name="nickname" label="设备别名"><Input maxLength={256} placeholder="便于识别的展示名称" /></Form.Item>
          <Form.Item name="tagIds" label="设备标签"><Select mode="multiple" allowClear options={tagOptions} optionFilterProp="label" placeholder="直接选择已有标签" /></Form.Item>
          <Form.Item name="groupIds" label="所属分组"><Select mode="multiple" allowClear options={groupOptions} optionFilterProp="label" placeholder="直接选择已有分组" /></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={3} placeholder="可选，补充设备用途、位置或备注" /></Form.Item>
        </Form>
      </Drawer>

      <Drawer title="批量导入设备" open={batchOpen} width={760} destroyOnClose onClose={closeBatchDrawer} footer={<Space style={{ width: '100%', justifyContent: 'flex-end' }}><Button onClick={closeBatchDrawer}>取消</Button><Button type="primary" loading={batchCreating} onClick={() => batchForm.submit()}>开始导入</Button></Space>}>
        <Form form={batchForm} layout="vertical" onFinish={handleBatchCreate}>
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Excel/CSV 批量导入仅适用于一机一密产品" description="统一标签和统一分组会自动应用到本次导入成功的全部设备上。" />
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}><Select options={manualProducts.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey}) · ${DEVICE_AUTH_LABELS[item.deviceAuthType || 'DEVICE_SECRET'] || '一机一密'}` }))} /></Form.Item>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="导入文件可直接维护设备标识" description={<Space direction="vertical" size={4}><Typography.Text>通用列：locatorType、locatorValue、primaryLocator</Typography.Text><Typography.Text>快捷列：imei、iccid、mac、serial（或 sn）</Typography.Text><Typography.Text>若某行只导入了一个标识且未指定主标识，系统会自动将它设为主标识。</Typography.Text></Space>} />
          <Space style={{ marginBottom: 16 }} wrap><Button icon={<UploadOutlined />} onClick={() => batchImportInputRef.current?.click()} disabled={batchCreating}>选择 Excel/CSV 文件</Button>{batchImportFile ? <Typography.Text type="secondary">已选择：{batchImportFile.name}</Typography.Text> : null}</Space>
          <input ref={batchImportInputRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" style={{ display: 'none' }} onChange={handleBatchImportChange} />
          {importProgress !== null ? <Card size="small" title="导入进度" style={{ marginBottom: 16 }}><Progress percent={importProgress} status={importProgress === 100 ? 'success' : 'active'} /></Card> : null}
          <Form.Item name="tagIds" label="统一标签"><Select mode="multiple" allowClear options={tagOptions} optionFilterProp="label" placeholder="可选，统一绑定标签" /></Form.Item>
          <Form.Item name="groupIds" label="统一分组"><Select mode="multiple" allowClear options={groupOptions} optionFilterProp="label" placeholder="可选，统一加入分组" /></Form.Item>
          <Form.Item name="description" label="统一描述"><TextArea rows={3} placeholder="可选，为本次导入设备设置统一描述" /></Form.Item>
        </Form>
      </Drawer>

      <Modal title="编辑设备" open={editOpen} width={620} destroyOnHidden onCancel={closeEditModal} onOk={() => editForm.submit()}>
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="nickname" label="设备别名"><Input maxLength={256} /></Form.Item>
          <Form.Item name="tagIds" label="设备标签"><Select mode="multiple" allowClear options={tagOptions} optionFilterProp="label" placeholder="直接维护设备当前标签" /></Form.Item>
          <Form.Item name="groupIds" label="所属分组"><Select mode="multiple" allowClear options={groupOptions} optionFilterProp="label" placeholder="直接维护设备当前分组" /></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      <DeviceShadowDrawer deviceId={shadowDevice?.id || null} productId={shadowDevice?.productId} deviceName={shadowDevice?.deviceName} nickname={shadowDevice?.nickname} productName={shadowDevice?.productName} productKey={shadowDevice?.productKey} open={shadowOpen} onClose={() => { setShadowOpen(false); setShadowDevice(null); }} />
      <DeviceLocatorModal deviceId={locatorDevice?.id || null} deviceName={locatorDevice?.deviceName} open={Boolean(locatorDevice)} onClose={() => setLocatorDevice(null)} />
    </div>
  );
};

export default DeviceList;
