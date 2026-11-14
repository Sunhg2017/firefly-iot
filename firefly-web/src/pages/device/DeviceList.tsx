import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AutoComplete, Badge, Button, Card, Drawer, Form, Input, Modal, Progress, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { ApartmentOutlined, CloudOutlined, DeleteOutlined, DownloadOutlined, KeyOutlined, MinusCircleOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import { useNavigate } from 'react-router-dom';
import DeviceShadowDrawer from './DeviceShadowDrawer';
import DeviceSecurityDrawer from './DeviceSecurityDrawer';
import DeviceLocatorModal from './DeviceLocatorModal';
import { asyncTaskApi, deviceApi, deviceGroupApi, deviceTagApi, fileApi, productApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import JsonEditorField, { isValidJson } from '../../components/JsonEditorField';
import { ProductSelect } from '../../components/EntitySelect';
import { useConfirmDiscard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';

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
interface BatchTagFormValues { tagIds: number[]; overwrite: boolean; }
interface BatchGroupFormValues { groupIds: number[]; action: 'REPLACE' | 'ADD' | 'REMOVE'; }
interface BatchCommandFormValues { commandType: 'PROPERTY_SET' | 'SERVICE_INVOKE'; payload?: string; serviceName?: string; params?: string; }
interface AsyncTaskRecord { status: string; progress?: number; errorMessage?: string; }
interface ShadowDeviceContext { id: number; productId: number; deviceName: string; nickname?: string; productName?: string; productKey?: string; }
interface DeviceListFilters { keyword: string; productId?: number; groupId?: number; status?: string; onlineStatus?: string; }
interface ServiceOption { value: string; label: string; }

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
  { value: 'IMEI', label: 'IMEI（国际移动设备识别码）' },
  { value: 'ICCID', label: 'ICCID（SIM 卡标识）' },
  { value: 'MAC', label: 'MAC（网络物理地址）' },
  { value: 'SERIAL', label: 'SERIAL（设备序列号）' },
];
const EMPTY_DEVICE_FILTERS: DeviceListFilters = { keyword: '' };

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

/**
 * 物模型服务列表可能以对象或 JSON 字符串返回；这里只提取服务标识/名称，
 * 保证批量命令的服务名候选项与产品物模型一致，同时允许用户手工补充。
 */
const extractServiceOptions = (rawThingModel: unknown): ServiceOption[] => {
  let parsed: unknown = rawThingModel;
  if (typeof rawThingModel === 'string') {
    try {
      parsed = JSON.parse(rawThingModel);
    } catch {
      return [];
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }
  const services = (parsed as { services?: unknown }).services;
  if (!Array.isArray(services)) {
    return [];
  }
  const seen = new Set<string>();
  const options: ServiceOption[] = [];
  services.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return;
    }
    const service = item as { identifier?: unknown; name?: unknown };
    const identifier = typeof service.identifier === 'string' ? service.identifier.trim() : '';
    if (!identifier || seen.has(identifier)) {
      return;
    }
    seen.add(identifier);
    const name = typeof service.name === 'string' && service.name.trim() ? service.name.trim() : identifier;
    options.push({ value: identifier, label: name === identifier ? identifier : `${name}（${identifier}）` });
  });
  return options;
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
    } catch (error) { onFail(getErrorMessage(error, '查询任务状态失败')); }
  };
  poll();
};

const DeviceList: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [batchCreating, setBatchCreating] = useState(false);
  const [viewingSecretId, setViewingSecretId] = useState<number | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<number | null>(null);
  const [credentialInfo, setCredentialInfo] = useState<{ credential: DeviceCredentialRecord; title: string } | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<DeviceRecord | null>(null);
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
  const [batchActionOpen, setBatchActionOpen] = useState<'tag' | 'group' | 'command' | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [serviceOptionsLoading, setServiceOptionsLoading] = useState(false);
  const [batchTagForm] = Form.useForm<BatchTagFormValues>();
  const [batchGroupForm] = Form.useForm<BatchGroupFormValues>();
  const [batchCommandForm] = Form.useForm<BatchCommandFormValues>();
  const [locatorDevice, setLocatorDevice] = useState<DeviceRecord | null>(null);
  const [securityDevice, setSecurityDevice] = useState<DeviceRecord | null>(null);
  const [batchImportFile, setBatchImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const batchImportInputRef = useRef<HTMLInputElement | null>(null);
  const fetchSeqRef = useRef(0);
  // 记录浏览过的设备→产品映射，批量命令跨页选择时仍能加载正确的物模型服务。
  const deviceProductRef = useRef(new Map<number, number>());
  const confirmDiscard = useConfirmDiscard();

  const selectedDeviceIds = useMemo(() => selectedRowKeys.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0), [selectedRowKeys]);
  const productLookup = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const tagOptions = useMemo(() => tags.map((item) => ({ value: item.id, label: `${item.tagKey}: ${item.tagValue}` })), [tags]);
  const groupOptions = useMemo(() => groups.map((item) => ({ value: item.id, label: item.name })), [groups]);

  // 产品名称只按当前页设备涉及的产品懒加载，避免一次性拉取 500 条产品作为下拉数据源。
  const ensureProductLookup = async (productIds: number[]) => {
    const missingIds = Array.from(new Set(productIds.filter((id) => Number.isInteger(id) && id > 0)))
      .filter((id) => !productLookup.has(id));
    if (missingIds.length === 0) {
      return;
    }
    const loaded = await Promise.all(missingIds.map(async (id) => {
      try {
        const res = await productApi.get(id);
        return res.data.data as ProductOption | undefined;
      } catch {
        return undefined;
      }
    }));
    const validProducts = loaded.filter((item): item is ProductOption => Boolean(item?.id));
    if (validProducts.length > 0) {
      setProducts((previous) => {
        const next = new Map(previous.map((item) => [item.id, item]));
        validProducts.forEach((item) => next.set(item.id, item));
        return Array.from(next.values());
      });
    }
    if (validProducts.length < missingIds.length) {
      message.warning('部分设备所属产品信息加载失败');
    }
  };

  const fetchTags = async () => {
    try {
      const res = await deviceTagApi.listAll();
      setTags(res.data.data || []);
    } catch (error) {
      setTags([]);
      message.error(getErrorMessage(error, '加载标签选项失败'));
    }
  };
  const fetchGroups = async () => {
    try {
      const res = await deviceGroupApi.listAll();
      setGroups((res.data.data || [])
        .filter((item: DeviceGroupRecord) => item.type !== 'DYNAMIC')
        .map((item: DeviceGroupRecord) => ({ id: item.id, name: item.name, type: item.type })));
    } catch (error) {
      setGroups([]);
      message.error(getErrorMessage(error, '加载分组选项失败'));
    }
  };
  const fetchData = async () => {
    // 关键字/分组切换可能连续触发请求，只允许最后一次响应落到表格，避免旧结果覆盖新筛选。
    const requestId = fetchSeqRef.current + 1;
    fetchSeqRef.current = requestId;
    setLoading(true);
    try {
      const res = await deviceApi.list({
        ...params,
        keyword: filters.keyword || undefined,
        productId: filters.productId,
        groupId: filters.groupId,
        status: filters.status,
        onlineStatus: filters.onlineStatus,
        excludeVideo: true,
      });
      if (requestId !== fetchSeqRef.current) return;
      const records = (res.data.data.records || []) as DeviceRecord[];
      setData(records);
      setTotal(res.data.data.total || 0);
      records.forEach((item) => deviceProductRef.current.set(item.id, item.productId));
      void ensureProductLookup(records.map((item) => item.productId));
    } catch (error) {
      if (requestId === fetchSeqRef.current) {
        message.error(getErrorMessage(error, '加载设备列表失败'));
      }
    } finally {
      if (requestId === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => { void fetchTags(); void fetchGroups(); }, []);
  useEffect(() => { void fetchData(); }, [filters, params.pageNum, params.pageSize]);
  // 布局会保留页签实例，切回本页签时主动刷新，避免看到已过期的设备状态。
  usePageActivation(() => { void fetchData(); });

  // 批量命令的服务名候选来自所选设备所属产品的物模型；物模型缺失时仍可直接输入。
  useEffect(() => {
    if (batchActionOpen !== 'command') {
      setServiceOptions([]);
      setServiceOptionsLoading(false);
      return undefined;
    }
    const productIds = Array.from(new Set(
      selectedDeviceIds
        .map((deviceId) => deviceProductRef.current.get(deviceId))
        .filter((productId): productId is number => typeof productId === 'number' && productId > 0),
    ));
    if (productIds.length === 0) {
      setServiceOptions([]);
      setServiceOptionsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setServiceOptionsLoading(true);
    void Promise.all(productIds.map(async (productId) => {
      try {
        const res = await productApi.getThingModel(productId);
        return extractServiceOptions(res.data.data);
      } catch {
        return [] as ServiceOption[];
      }
    })).then((groups) => {
      if (cancelled) return;
      const merged = new Map<string, ServiceOption>();
      groups.flat().forEach((option) => {
        if (!merged.has(option.value)) {
          merged.set(option.value, option);
        }
      });
      setServiceOptions(Array.from(merged.values()));
    }).finally(() => {
      if (!cancelled) {
        setServiceOptionsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [batchActionOpen, selectedDeviceIds]);

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

  // 表格里的分组标签既可作为筛选入口，也用于标记当前生效的分组筛选。
  const applyGroupFilter = (groupId?: number) => {
    setDraftFilters((current) => ({ ...current, groupId }));
    setFilters((current) => ({ ...current, groupId }));
    setParams((prev) => ({ ...prev, pageNum: 1 }));
  };

  const hasActiveFilters = useMemo(
    () => Boolean(filters.keyword || filters.productId || filters.groupId || filters.status || filters.onlineStatus),
    [filters],
  );
  const filterProductLabel = useMemo(() => {
    const product = draftFilters.productId != null ? productLookup.get(draftFilters.productId) : undefined;
    return product ? `${product.name}（${product.productKey}）` : undefined;
  }, [draftFilters.productId, productLookup]);

  const ensureManualProduct = async (productId?: number) => {
    if (!productId) {
      return;
    }
    const known = productLookup.get(productId);
    if (known?.deviceAuthType) {
      if (known.deviceAuthType === 'PRODUCT_SECRET') {
        throw new Error('该产品为一型一密产品，请选择一机一密产品');
      }
      return;
    }
    try {
      const res = await productApi.get(productId);
      const product = res.data.data as { deviceAuthType?: string } | undefined;
      if (product?.deviceAuthType === 'PRODUCT_SECRET') {
        throw new Error('该产品为一型一密产品，请选择一机一密产品');
      }
    } catch (error) {
      if (error instanceof Error && error.message === '该产品为一型一密产品，请选择一机一密产品') {
        throw error;
      }
      throw new Error(getErrorMessage(error, '校验产品类型失败，请重试'));
    }
  };

  const manualProductRule = {
    validator: async (_rule: unknown, value: unknown) => {
      if (typeof value === 'number') {
        await ensureManualProduct(value);
      }
    },
  };

  const closeCreateModal = () => { setCreateOpen(false); setCreating(false); createForm.resetFields(); };
  const closeEditModal = () => { setEditingDevice(null); setUpdating(false); editForm.resetFields(); };
  const closeBatchDrawer = () => { setBatchOpen(false); setBatchCreating(false); setBatchImportFile(null); setImportProgress(null); batchForm.resetFields(); };

  const requestCloseCreateModal = () => confirmDiscard(
    createForm.isFieldsTouched(),
    closeCreateModal,
    { title: '放弃新建设备？', content: '关闭后已填写的设备信息将丢失。' },
  );
  const requestCloseEditModal = () => confirmDiscard(
    editForm.isFieldsTouched(),
    closeEditModal,
    { title: '放弃修改？', content: '关闭后本次编辑的设备信息将丢失。' },
  );
  const requestCloseBatchDrawer = () => confirmDiscard(
    Boolean(batchImportFile) || batchForm.isFieldsTouched(),
    closeBatchDrawer,
    { title: '放弃批量导入？', content: '关闭后已选择的文件与填写的导入配置将丢失。' },
  );
  const requestCloseBatchCommand = () => confirmDiscard(
    batchCommandForm.isFieldsTouched(),
    () => setBatchActionOpen(null),
    { title: '放弃批量命令？', content: '关闭后已填写的命令内容将丢失。' },
  );

  const showCredentialModal = (credential: DeviceCredentialRecord, title = '设备三元组（仅展示一次）') => {
    setCredentialInfo({ credential, title });
  };

  const handleViewSecret = async (record: DeviceRecord) => {
    if (viewingSecretId !== null) return;
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
    if (creating) return;
    setCreating(true);
    try {
      const res = await deviceApi.create({
        ...values,
        locators: normalizeLocatorInputs(values.locators),
      });
      message.success('设备创建成功');
      closeCreateModal();
      void fetchData();
      if (res.data.data?.deviceSecret) showCredentialModal(res.data.data as DeviceCredentialRecord);
    } catch (error) {
      message.error(getErrorMessage(error, '创建设备失败'));
    } finally {
      setCreating(false);
    }
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
    if (batchCreating) return;
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
    setEditingDevice(record);
    editForm.setFieldsValue({
      nickname: record.nickname,
      description: record.description,
      tagIds: record.tagList?.map((item) => item.id) || [],
      groupIds: record.groupList?.map((item) => item.id) || [],
    });
  };

  const handleUpdate = async (values: DeviceUpdateFormValues) => {
    if (!editingDevice || updating) return;
    setUpdating(true);
    try {
      await deviceApi.update(editingDevice.id, { ...values });
      message.success('设备更新成功');
      closeEditModal();
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '更新设备失败'));
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleStatus = async (record: DeviceRecord) => {
    if (statusPendingId !== null) return;
    setStatusPendingId(record.id);
    try {
      if (record.status === 'DISABLED') {
        await deviceApi.enable(record.id);
        message.success('设备已启用');
      } else {
        await deviceApi.disable(record.id);
        message.success('设备已禁用');
      }
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '设备状态更新失败'));
    } finally {
      setStatusPendingId(null);
    }
  };

  const handleDelete = (record: DeviceRecord) => {
    Modal.confirm({
      title: `确认删除设备“${record.deviceName}”？`,
      content: '删除后设备会立即断开连接，设备标识、标签与分组关系一并移除，且无法在设备列表中恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deviceApi.delete(record.id);
          message.success('设备已删除');
          setSelectedRowKeys((prev) => prev.filter((item) => Number(item) !== record.id));
          void fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '删除设备失败'));
        }
      },
    });
  };

  const handleExportTriples = async () => {
    if (exporting) return;
    if (selectedDeviceIds.length > 1000) {
      message.warning('单次最多导出 1000 台设备，请减少勾选数量');
      return;
    }
    if (selectedDeviceIds.length === 0) {
      if (total === 0) { message.warning('暂无可导出的设备'); return; }
      // 导出接口按设备 ID 精确导出；分组筛选无法直接下发到后端，因此必须先勾选设备，避免导出范围与列表不一致。
      if (filters.groupId != null) {
        message.warning('当前按分组筛选，导出前请先勾选要导出的设备');
        return;
      }
    }
    try {
      setExporting(true);
      const payload = selectedDeviceIds.length > 0
        ? { deviceIds: selectedDeviceIds, groupId: filters.groupId, excludeVideo: true }
        : {
            keyword: filters.keyword || undefined,
            productId: filters.productId,
            groupId: filters.groupId,
            status: filters.status,
            onlineStatus: filters.onlineStatus,
            excludeVideo: true,
          };
      const res = await deviceApi.exportTriplesTask(payload);
      const taskId = res.data.data as number | undefined;
      if (!taskId) { message.error('创建导出任务失败'); return; }
      Modal.success({
        title: '导出任务已提交',
        content: (
          <Space direction="vertical" size={6}>
            <Space size={4}>
              <Typography.Text>任务编号：</Typography.Text>
              <CopyText text={taskId} />
            </Space>
            <Typography.Text type="secondary">任务完成后请到「异步任务」页面下载三元组文件。</Typography.Text>
          </Space>
        ),
        okText: '知道了',
      });
    } catch (error) {
      message.error(getErrorMessage(error, '导出设备三元组失败'));
    } finally {
      setExporting(false);
    }
  };

  const runBatchStatusAction = (action: 'enable' | 'disable' | 'delete') => {
    if (selectedDeviceIds.length === 0) return;
    const labels = { enable: '启用', disable: '禁用', delete: '删除' } as const;
    Modal.confirm({
      title: `确认批量${labels[action]} ${selectedDeviceIds.length} 台设备？`,
      content: action === 'delete'
        ? '删除后这些设备会立即断开连接，设备标识、标签与分组关系一并移除，且无法在设备列表中恢复。'
        : action === 'disable'
          ? '禁用后这些设备会立即断开连接并无法再接入平台，可随时重新启用。'
          : '启用后这些设备可重新接入平台。',
      okText: labels[action],
      okButtonProps: action === 'delete' ? { danger: true } : undefined,
      onOk: async () => {
        try {
          const loader = action === 'enable'
            ? deviceApi.batchEnable
            : action === 'disable'
              ? deviceApi.batchDisable
              : deviceApi.batchDelete;
          const res = await loader(selectedDeviceIds);
          const result = res.data.data as { requested: number; success: number; failed: number };
          if (result.failed > 0) {
            message.warning(`批量${labels[action]}完成：成功 ${result.success} 台，失败 ${result.failed} 台`);
          } else {
            message.success(`批量${labels[action]}完成：共 ${result.success} 台`);
          }
          setSelectedRowKeys([]);
          void fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, `批量${labels[action]}失败`));
        }
      },
    });
  };

  const submitBatchTag = async () => {
    if (batchSubmitting) return;
    let values: BatchTagFormValues;
    try {
      values = await batchTagForm.validateFields();
    } catch {
      return;
    }
    try {
      setBatchSubmitting(true);
      const res = await deviceApi.batchTag({
        deviceIds: selectedDeviceIds,
        tagIds: values.tagIds,
        overwrite: values.overwrite,
      });
      const result = res.data.data as { success: number; failed: number };
      if (result.failed > 0) {
        message.warning(`批量打标完成：成功 ${result.success} 台，失败 ${result.failed} 台`);
      } else {
        message.success(`批量打标完成：共 ${result.success} 台`);
      }
      setBatchActionOpen(null);
      setSelectedRowKeys([]);
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '批量打标失败'));
    } finally {
      setBatchSubmitting(false);
    }
  };

  const submitBatchGroup = async () => {
    if (batchSubmitting) return;
    let values: BatchGroupFormValues;
    try {
      values = await batchGroupForm.validateFields();
    } catch {
      return;
    }
    try {
      setBatchSubmitting(true);
      const res = await deviceApi.batchGroup({
        deviceIds: selectedDeviceIds,
        groupIds: values.groupIds,
        action: values.action,
      });
      const result = res.data.data as { success: number; failed: number };
      if (result.failed > 0) {
        message.warning(`批量分组完成：成功 ${result.success} 台，失败 ${result.failed} 台`);
      } else {
        message.success(`批量分组完成：共 ${result.success} 台`);
      }
      setBatchActionOpen(null);
      setSelectedRowKeys([]);
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '批量分组失败'));
    } finally {
      setBatchSubmitting(false);
    }
  };

  const submitBatchCommand = async () => {
    if (batchSubmitting) return;
    let values: BatchCommandFormValues;
    try {
      values = await batchCommandForm.validateFields();
    } catch {
      return;
    }
    const isPropertySet = values.commandType === 'PROPERTY_SET';
    const isServiceInvoke = values.commandType === 'SERVICE_INVOKE';
    if (isPropertySet && values.payload?.trim() && !isValidJson(values.payload)) {
      message.error('属性设置内容不是合法 JSON');
      return;
    }
    if (isServiceInvoke && values.params?.trim() && !isValidJson(values.params)) {
      message.error('服务参数不是合法 JSON');
      return;
    }
    const serviceName = isServiceInvoke ? values.serviceName?.trim() : undefined;
    if (isServiceInvoke && !serviceName) {
      message.warning('请选择或输入服务名称');
      return;
    }
    let payload: Record<string, unknown> | undefined;
    let params: Record<string, unknown> | undefined;
    try {
      const parsedPayload: unknown = isPropertySet && values.payload?.trim() ? JSON.parse(values.payload) : undefined;
      const parsedParams: unknown = isServiceInvoke && values.params?.trim() ? JSON.parse(values.params) : undefined;
      if (parsedPayload !== undefined && (typeof parsedPayload !== 'object' || parsedPayload === null || Array.isArray(parsedPayload))) {
        message.error('属性设置内容必须是 JSON 对象');
        return;
      }
      if (parsedParams !== undefined && (typeof parsedParams !== 'object' || parsedParams === null || Array.isArray(parsedParams))) {
        message.error('服务参数必须是 JSON 对象');
        return;
      }
      payload = parsedPayload as Record<string, unknown> | undefined;
      params = parsedParams as Record<string, unknown> | undefined;
    } catch {
      message.error('命令内容不是合法 JSON');
      return;
    }
    try {
      setBatchSubmitting(true);
      const res = await deviceApi.batchCommand({
        deviceIds: selectedDeviceIds,
        commandType: values.commandType,
        payload,
        serviceName,
        params,
      });
      const result = res.data.data as { success: number; failed: number };
      if (result.failed > 0) {
        message.warning(`批量命令已下发：成功 ${result.success} 台，失败 ${result.failed} 台`);
      } else {
        message.success(`批量命令已下发：共 ${result.success} 台`);
      }
      setBatchActionOpen(null);
      setSelectedRowKeys([]);
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '批量下发命令失败'));
    } finally {
      setBatchSubmitting(false);
    }
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
          {record.groupList.map((item) => {
            const active = filters.groupId === item.id;
            return (
              <Tag.CheckableTag
                key={item.id}
                checked={active}
                onChange={(checked) => applyGroupFilter(checked ? item.id : undefined)}
              >
                {item.name}
              </Tag.CheckableTag>
            );
          })}
        </Space>
      ) : <Typography.Text type="secondary">未分组</Typography.Text>,
    },
    { title: '状态', dataIndex: 'status', width: 90, render: (value: string) => <Tag color={STATUS_COLORS[value]}>{STATUS_LABELS[value] || value}</Tag> },
    { title: '在线', dataIndex: 'onlineStatus', width: 90, render: (value: string) => { const badge = ONLINE_BADGE[value] || ONLINE_BADGE.UNKNOWN; return <Badge status={badge.status} text={badge.text} />; } },
    { title: '固件版本', dataIndex: 'firmwareVersion', width: 120, render: (value?: string) => value || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => (value ? formatDateTime(value) : '-') },
    { title: '操作', width: 360, fixed: 'right', render: (_: unknown, record: DeviceRecord) => <Space size={0} wrap><Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button><Button type="link" size="small" loading={statusPendingId === record.id} disabled={statusPendingId !== null && statusPendingId !== record.id} onClick={() => void handleToggleStatus(record)}>{record.status === 'DISABLED' ? '启用' : '禁用'}</Button><Button type="link" size="small" icon={<KeyOutlined />} loading={viewingSecretId === record.id} disabled={viewingSecretId !== null && viewingSecretId !== record.id} onClick={() => void handleViewSecret(record)}>密钥</Button><Button type="link" size="small" onClick={() => setLocatorDevice(record)}>标识</Button><Button type="link" size="small" onClick={() => setSecurityDevice(record)}>安全</Button><Button type="link" size="small" icon={<CloudOutlined />} onClick={() => { const product = productLookup.get(record.productId); setShadowDevice({ id: record.id, productId: record.productId, deviceName: record.deviceName, nickname: record.nickname, productName: product?.name, productKey: product?.productKey }); setShadowOpen(true); }}>影子</Button><Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button></Space> },
  ];

  return (
    <div>
      <PageHeader title="设备管理" description={`共 ${total} 台设备`} extra={<Space wrap><Button icon={<ApartmentOutlined />} onClick={() => navigate('/device-topology')}>设备拓扑</Button><Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExportTriples}>{selectedDeviceIds.length > 0 ? `导出已选三元组 (${selectedDeviceIds.length})` : '导出当前筛选三元组'}</Button><Button icon={<UploadOutlined />} onClick={() => setBatchOpen(true)}>批量导入</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建设备</Button></Space>} />

      {selectedDeviceIds.length > 0 ? (
        <Card size="small" className="ff-query-card" style={{ marginBottom: 12 }}>
          <Space wrap>
            <Typography.Text strong>已选 {selectedDeviceIds.length} 台设备：</Typography.Text>
            <Button size="small" onClick={() => void runBatchStatusAction('enable')}>批量启用</Button>
            <Button size="small" onClick={() => void runBatchStatusAction('disable')}>批量禁用</Button>
            <Button size="small" danger onClick={() => void runBatchStatusAction('delete')}>批量删除</Button>
            <Button size="small" onClick={() => { batchTagForm.resetFields(); setBatchActionOpen('tag'); }}>批量打标</Button>
            <Button size="small" onClick={() => { batchGroupForm.resetFields(); setBatchActionOpen('group'); }}>批量分组</Button>
            <Button size="small" onClick={() => { batchCommandForm.resetFields(); setBatchActionOpen('command'); }}>批量命令</Button>
            <Button size="small" onClick={() => setSelectedRowKeys([])}>清空选择</Button>
          </Space>
        </Card>
      ) : null}

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
          <div className="ff-query-field" style={{ width: 240 }}>
            <ProductSelect
              allowClear
              placeholder="所属产品"
              style={{ width: '100%' }}
              value={draftFilters.productId}
              pinnedLabel={filterProductLabel}
              onChange={(value) => {
                setDraftFilters((current) => ({ ...current, productId: value }));
                if (value != null) {
                  void ensureProductLookup([value]);
                }
              }}
            />
          </div>
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
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
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
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>

      <Card>
        <Table
          rowKey="id"
          rowSelection={rowSelection}
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1750 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={hasActiveFilters}
                onClearFilters={resetFilters}
                emptyText="暂无设备，点击右上角「新建设备」创建"
                filteredText="没有符合筛选条件的设备"
              />
            ),
          }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true, showTotal: (count) => `共 ${count} 条`, onChange: (page, pageSize) => setParams({ pageNum: page, pageSize }) }}
        />
      </Card>

      <Drawer title="新建设备" open={createOpen} width={760} destroyOnClose onClose={requestCloseCreateModal} footer={<Space style={{ width: '100%', justifyContent: 'flex-end' }}><Button onClick={requestCloseCreateModal} disabled={creating}>取消</Button><Button type="primary" loading={creating} onClick={() => createForm.submit()}>保存并创建</Button></Space>}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="这里只支持一机一密产品手动创建设备" description="一型一密产品请在“产品接入”页面的“设备接入”入口中使用动态注册创建。" />
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }, manualProductRule]}><ProductSelect placeholder="输入产品名称或 productKey 搜索" /></Form.Item>
          <Form.Item name="deviceName" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }, { pattern: DEVICE_NAME_PATTERN, message: DEVICE_NAME_RULE_MESSAGE }]}><Input maxLength={64} placeholder="例如：AA:BB:CC:DD:EE:FF / SN20240301001" /></Form.Item>
          <Form.Item label="设备标识" extra="注册时可一并写入 IMEI、ICCID、MAC、SERIAL，后续协议解析与设备识别会直接复用这些标识。">
            <Form.List name="locators">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => (
                    <Card key={field.key} size="small">
                      <Space align="start" style={{ display: 'flex' }}>
                        <Form.Item name={[field.name, 'locatorType']} label={index === 0 ? '标识类型' : undefined} rules={[{ required: true, message: '请选择标识类型' }]} style={{ width: 220, marginBottom: 0 }}>
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

      <Drawer title="批量导入设备" open={batchOpen} width={760} destroyOnClose onClose={requestCloseBatchDrawer} footer={<Space style={{ width: '100%', justifyContent: 'flex-end' }}><Button onClick={requestCloseBatchDrawer} disabled={batchCreating}>取消</Button><Button type="primary" loading={batchCreating} onClick={() => batchForm.submit()}>开始导入</Button></Space>}>
        <Form form={batchForm} layout="vertical" onFinish={handleBatchCreate}>
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message="Excel/CSV 批量导入仅适用于一机一密产品" description="统一标签和统一分组会自动应用到本次导入成功的全部设备上。" />
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }, manualProductRule]}><ProductSelect placeholder="输入产品名称或 productKey 搜索" /></Form.Item>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message="导入文件可直接维护设备标识" description={<Space direction="vertical" size={4}><Typography.Text>通用列：locatorType、locatorValue、primaryLocator</Typography.Text><Typography.Text>快捷列：imei、iccid、mac、serial（或 sn）</Typography.Text><Typography.Text>若某行只导入了一个标识且未指定主标识，系统会自动将它设为主标识。</Typography.Text></Space>} />
          <Space style={{ marginBottom: 16 }} wrap><Button icon={<UploadOutlined />} onClick={() => batchImportInputRef.current?.click()} disabled={batchCreating}>选择 Excel/CSV 文件</Button>{batchImportFile ? <Typography.Text type="secondary">已选择：{batchImportFile.name}</Typography.Text> : null}</Space>
          <input ref={batchImportInputRef} type="file" accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" style={{ display: 'none' }} onChange={handleBatchImportChange} />
          {importProgress !== null ? <Card size="small" title="导入进度" style={{ marginBottom: 16 }}><Progress percent={importProgress} status={importProgress === 100 ? 'success' : 'active'} /></Card> : null}
          <Form.Item name="tagIds" label="统一标签"><Select mode="multiple" allowClear options={tagOptions} optionFilterProp="label" placeholder="可选，统一绑定标签" /></Form.Item>
          <Form.Item name="groupIds" label="统一分组"><Select mode="multiple" allowClear options={groupOptions} optionFilterProp="label" placeholder="可选，统一加入分组" /></Form.Item>
          <Form.Item name="description" label="统一描述"><TextArea rows={3} placeholder="可选，为本次导入设备设置统一描述" /></Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={editingDevice ? `编辑设备 · ${editingDevice.deviceName}` : '编辑设备'}
        open={Boolean(editingDevice)}
        width={720}
        destroyOnClose
        onClose={requestCloseEditModal}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={requestCloseEditModal} disabled={updating}>取消</Button>
            <Button type="primary" loading={updating} onClick={() => editForm.submit()}>保存修改</Button>
          </Space>
        )}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="nickname" label="设备别名"><Input maxLength={256} /></Form.Item>
          <Form.Item name="tagIds" label="设备标签"><Select mode="multiple" allowClear options={tagOptions} optionFilterProp="label" placeholder="直接维护设备当前标签" /></Form.Item>
          <Form.Item name="groupIds" label="所属分组"><Select mode="multiple" allowClear options={groupOptions} optionFilterProp="label" placeholder="直接维护设备当前分组" /></Form.Item>
          <Form.Item name="description" label="描述"><TextArea rows={3} /></Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={`批量打标（已选 ${selectedDeviceIds.length} 台设备）`}
        open={batchActionOpen === 'tag'}
        destroyOnHidden
        confirmLoading={batchSubmitting}
        okText="应用标签"
        onOk={() => void submitBatchTag()}
        onCancel={() => setBatchActionOpen(null)}
      >
        <Form form={batchTagForm} layout="vertical" initialValues={{ overwrite: true }}>
          <Form.Item name="tagIds" label="标签" rules={[{ required: true, message: '请选择标签' }]}>
            <Select mode="multiple" allowClear options={tagOptions} optionFilterProp="label" placeholder="选择要应用/追加的标签" />
          </Form.Item>
          <Form.Item name="overwrite" label="模式"><Switch checkedChildren="覆盖" unCheckedChildren="追加" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`批量分组（已选 ${selectedDeviceIds.length} 台设备）`}
        open={batchActionOpen === 'group'}
        destroyOnHidden
        confirmLoading={batchSubmitting}
        okText="应用分组"
        onOk={() => void submitBatchGroup()}
        onCancel={() => setBatchActionOpen(null)}
      >
        <Form form={batchGroupForm} layout="vertical" initialValues={{ action: 'REPLACE' }}>
          <Form.Item name="groupIds" label="分组" rules={[{ required: true, message: '请选择分组' }]}>
            <Select mode="multiple" allowClear options={groupOptions} optionFilterProp="label" placeholder="选择分组" />
          </Form.Item>
          <Form.Item name="action" label="动作">
            <Select options={[{ value: 'REPLACE', label: '替换现有分组' }, { value: 'ADD', label: '加入分组' }, { value: 'REMOVE', label: '移出分组' }]} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`批量下发命令（已选 ${selectedDeviceIds.length} 台设备）`}
        open={batchActionOpen === 'command'}
        width={720}
        destroyOnClose
        onClose={requestCloseBatchCommand}
        footer={(
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={requestCloseBatchCommand} disabled={batchSubmitting}>取消</Button>
            <Button type="primary" loading={batchSubmitting} onClick={() => void submitBatchCommand()}>下发命令</Button>
          </Space>
        )}
      >
        <Form form={batchCommandForm} layout="vertical" initialValues={{ commandType: 'PROPERTY_SET' }}>
          <Form.Item name="commandType" label="命令类型" rules={[{ required: true, message: '请选择命令类型' }]}>
            <Select options={[{ value: 'PROPERTY_SET', label: '属性设置' }, { value: 'SERVICE_INVOKE', label: '服务调用' }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.commandType !== current.commandType}>
            {({ getFieldValue }) => (
              getFieldValue('commandType') === 'SERVICE_INVOKE' ? (
                <>
                  <Form.Item
                    name="serviceName"
                    label="服务名称"
                    extra="候选来自所选设备所属产品的物模型服务；未列出时可直接输入服务标识。"
                    rules={[{ required: true, message: '请选择或输入服务名称' }]}
                  >
                    <AutoComplete
                      options={serviceOptions}
                      placeholder="选择或输入服务标识"
                      allowClear
                      notFoundContent={serviceOptionsLoading ? '正在加载物模型服务…' : '未获取到物模型服务，可直接输入服务标识'}
                      filterOption={(inputValue, option) => {
                        const label = typeof option?.label === 'string' ? option.label : '';
                        const value = typeof option?.value === 'string' ? option.value : '';
                        const keyword = inputValue.toLowerCase();
                        return label.toLowerCase().includes(keyword) || value.toLowerCase().includes(keyword);
                      }}
                    />
                  </Form.Item>
                  <Form.Item name="params" label="服务参数">
                    <JsonEditorField height={180} path="file:///device/batch-command-params.json" hint={'必须是 JSON 对象，例如 {"delay": 5}'} />
                  </Form.Item>
                </>
              ) : (
                <Form.Item name="payload" label="属性设置内容">
                  <JsonEditorField height={180} path="file:///device/batch-command-payload.json" hint={'必须是 JSON 对象，例如 {"sampleInterval": 30}'} />
                </Form.Item>
              )
            )}
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={credentialInfo?.title || '设备三元组（仅展示一次）'}
        open={Boolean(credentialInfo)}
        width={620}
        destroyOnHidden
        maskClosable={false}
        onCancel={() => setCredentialInfo(null)}
        footer={<Button type="primary" onClick={() => setCredentialInfo(null)}>我已复制，关闭</Button>}
      >
        {credentialInfo ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="设备密钥仅在此处展示一次"
              description="关闭弹窗后无法再次查看，请立即复制并妥善保存。"
            />
            <Card size="small" styles={{ body: { padding: 12 } }}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space size={4} wrap><Typography.Text>产品Key：</Typography.Text><CopyText text={credentialInfo.credential.productKey} /></Space>
                <Space size={4} wrap><Typography.Text>设备名称：</Typography.Text><CopyText text={credentialInfo.credential.deviceName} /></Space>
                <Space size={4} align="start" wrap><Typography.Text>设备密钥：</Typography.Text><CopyText text={credentialInfo.credential.deviceSecret} /></Space>
              </Space>
            </Card>
          </Space>
        ) : null}
      </Modal>

      <DeviceShadowDrawer deviceId={shadowDevice?.id || null} productId={shadowDevice?.productId} deviceName={shadowDevice?.deviceName} nickname={shadowDevice?.nickname} productName={shadowDevice?.productName} productKey={shadowDevice?.productKey} open={shadowOpen} onClose={() => { setShadowOpen(false); setShadowDevice(null); }} />
      <DeviceSecurityDrawer deviceId={securityDevice?.id || null} deviceName={securityDevice?.deviceName} open={Boolean(securityDevice)} onClose={() => setSecurityDevice(null)} />
      <DeviceLocatorModal deviceId={locatorDevice?.id || null} deviceName={locatorDevice?.deviceName} open={Boolean(locatorDevice)} onClose={() => setLocatorDevice(null)} />
    </div>
  );
};

export default DeviceList;
