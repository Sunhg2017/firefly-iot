import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  FunctionOutlined,
  AlertOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { deviceApi, deviceDataApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { formatDateTime, toIsoDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import useAuthStore from '../../store/useAuthStore';

const { RangePicker } = DatePicker;

interface DeviceOptionRecord {
  id: number;
  deviceName: string;
  nickname?: string;
  onlineStatus?: string;
  status?: string;
}

interface DeviceOption {
  value: number;
  label: string;
  meta: DeviceOptionRecord;
}

interface DeviceSelectFieldProps {
  value?: number;
  onChange?: (value?: number) => void;
  placeholder: string;
  allowClear?: boolean;
  width?: number;
  deviceOptions: DeviceOption[];
  deviceOptionsLoading: boolean;
  onSearchDevices: (keyword?: string) => void;
}

interface TelemetryRecord {
  ts: string;
  deviceId: number;
  property: string;
  valueNumber: number | null;
  valueString: string | null;
  valueBool: boolean | null;
}

interface TelemetryLatest {
  property: string;
  valueNumber: number | null;
  valueString: string | null;
  valueBool: boolean | null;
  ts: string;
}

interface AggregateRecord {
  bucket: string;
  avgVal: number;
  maxVal: number;
  minVal: number;
  count: number;
}

interface EventRecord {
  id: number;
  deviceId: number;
  deviceName?: string;
  productId: number;
  eventType: string;
  eventName: string;
  level: string;
  payload: string;
  occurredAt: string;
}

interface RetentionInfo {
  retentionDays: number;
  defaultRetentionDays: number;
  globalMaxRetentionDays: number;
  usingDefault: boolean;
}

interface TabSharedProps {
  deviceId?: number;
}

type TimeRange = [Dayjs, Dayjs];

const levelColors: Record<string, string> = { INFO: 'blue', WARNING: 'orange', CRITICAL: 'red' };
const onlineStatusTextMap: Record<string, string> = { ONLINE: '在线', OFFLINE: '离线', UNKNOWN: '未知' };
const statusTextMap: Record<string, string> = { ACTIVE: '已激活', INACTIVE: '未激活', DISABLED: '已禁用' };
const TELEMETRY_PAGE_SIZE = 50;
const TELEMETRY_LIMIT_OPTIONS = [50, 100, 200, 500];

const buildDefaultRange = (): TimeRange => [dayjs().subtract(24, 'hour'), dayjs()];

const buildTimeRangePayload = (range: TimeRange) => ({
  startTime: toIsoDateTime(range[0].toDate()),
  endTime: toIsoDateTime(range[1].toDate()),
});

const formatSelectedDeviceLabel = (device: DeviceOptionRecord) => {
  const display = device.nickname?.trim();
  const value = device.deviceName?.trim();
  if (!display || !value || display === value) {
    return value || display || '';
  }
  return `${display}（${value}）`;
};

const renderDeviceOption = (device: DeviceOptionRecord) => {
  const detailParts = [device.deviceName, onlineStatusTextMap[device.onlineStatus || ''], statusTextMap[device.status || '']].filter(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontWeight: 600, color: '#0f172a' }}>{device.nickname || device.deviceName}</span>
      <span style={{ fontSize: 12, color: '#64748b' }}>{detailParts.join(' · ')}</span>
    </div>
  );
};

const mergeDeviceOptions = (current: DeviceOption[], incoming: DeviceOption[]) => {
  const mapped = new Map<number, DeviceOption>();
  current.forEach((item) => mapped.set(item.value, item));
  // 搜索时保留已选设备，避免结果集切换后 Select 只剩内部 ID 无法回显。
  incoming.forEach((item) => mapped.set(item.value, item));
  return Array.from(mapped.values());
};

const DeviceSelectField: React.FC<DeviceSelectFieldProps> = ({
  value,
  onChange,
  placeholder,
  allowClear,
  width = 260,
  deviceOptions,
  deviceOptionsLoading,
  onSearchDevices,
}) => (
  <Select
    showSearch
    filterOption={false}
    optionLabelProp="label"
    allowClear={allowClear}
    placeholder={placeholder}
    style={{ width }}
    value={value}
    loading={deviceOptionsLoading}
    options={deviceOptions}
    notFoundContent={deviceOptionsLoading ? '加载中...' : '暂无匹配设备'}
    onSearch={(keyword) => onSearchDevices(keyword.trim())}
    onChange={(nextValue) => onChange?.(typeof nextValue === 'number' ? nextValue : undefined)}
    optionRender={(option) => renderDeviceOption((option.data as DeviceOption).meta)}
  />
);

const formatTelemetryValue = (record: TelemetryRecord | TelemetryLatest) => {
  if (record.valueNumber != null) return String(record.valueNumber);
  if (record.valueBool != null) return record.valueBool ? 'true' : 'false';
  if (record.valueString != null) return record.valueString;
  return '-';
};

const TelemetryTab: React.FC<TabSharedProps> = ({ deviceId }) => {
  const [data, setData] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [property, setProperty] = useState<string>('');
  const [timeRange, setTimeRange] = useState<TimeRange>(buildDefaultRange);
  const [limit, setLimit] = useState(200);

  const handleQuery = useCallback(async () => {
    if (!deviceId) {
      message.warning('请先在页面顶部选择设备');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await deviceDataApi.query({
        deviceId,
        property: property.trim() || undefined,
        limit,
        ...buildTimeRangePayload(timeRange),
      });
      setData(res.data.data || []);
    } catch (error) {
      setData([]);
      setLoadError(getErrorMessage(error, '查询遥测数据失败'));
    } finally {
      setLoading(false);
    }
  }, [deviceId, limit, property, timeRange]);

  useEffect(() => {
    if (!deviceId) {
      setData([]);
      setLoadError(null);
      return;
    }
    void handleQuery();
    // 仅在设备变化时自动按当前筛选条件查询，避免筛选输入过程中频繁请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const hasFilters = property.trim() !== '';

  const columns: ColumnsType<TelemetryRecord> = [
    { title: '时间', dataIndex: 'ts', width: 200, render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis /> },
    { title: '属性', dataIndex: 'property', width: 180, render: (value: string) => <CopyText text={value} ellipsis /> },
    { title: '值', width: 220, render: (_: unknown, record: TelemetryRecord) => <CopyText text={formatTelemetryValue(record)} ellipsis /> },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <RangePicker
            showTime
            allowClear={false}
            value={timeRange}
            onChange={(value) => {
              if (value && value[0] && value[1]) {
                setTimeRange([value[0], value[1]]);
              }
            }}
          />
          <Input
            placeholder="属性名（可选）"
            style={{ width: 180 }}
            value={property}
            onChange={(event) => setProperty(event.target.value)}
            onPressEnter={() => void handleQuery()}
          />
          <Select<number>
            style={{ width: 170 }}
            value={limit}
            options={TELEMETRY_LIMIT_OPTIONS.map((value) => ({ value, label: `最近 ${value} 条` }))}
            onChange={setLimit}
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void handleQuery()}>查询</Button>
        </Space>
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          该接口仅支持 limit 返回最近记录，不支持服务端分页；下表为“最近 {limit} 条”范围内的前端分页。
        </Typography.Text>
      </Card>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="查询遥测数据失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void handleQuery()}>重试</Button>}
        />
      ) : null}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey={(record, index) => `${record.ts}-${record.property}-${index}`}
          columns={columns}
          dataSource={data}
          loading={loading}
          locale={{
            emptyText: loadError ? (
              '加载失败，请点击上方“重试”'
            ) : (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText={deviceId ? '该设备在所选时间范围内暂无遥测数据' : '请先在页面顶部选择设备'}
                filteredText="当前属性筛选下没有遥测数据"
                onClearFilters={() => setProperty('')}
              />
            ),
          }}
          pagination={{
            pageSize: TELEMETRY_PAGE_SIZE,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条（最近 ${limit} 条内）`,
          }}
        />
      </Card>
    </>
  );
};

const LatestTab: React.FC<TabSharedProps & { active: boolean }> = ({ deviceId, active }) => {
  const [data, setData] = useState<TelemetryLatest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    if (!deviceId) {
      setData([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await deviceDataApi.latest(deviceId);
      setData(res.data.data || []);
    } catch (error) {
      setData([]);
      setLoadError(getErrorMessage(error, '查询最新遥测数据失败'));
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  const { paused, togglePaused, lastUpdatedAt, refresh } = useAutoRefresh(fetchLatest, {
    intervalMs: 10000,
    enabled: !!deviceId && active,
    immediate: false,
  });

  useEffect(() => {
    if (!deviceId) {
      setData([]);
      setLoadError(null);
      return;
    }
    if (active) {
      void refresh();
    }
  }, [active, deviceId, refresh]);

  const columns: ColumnsType<TelemetryLatest> = [
    { title: '属性', dataIndex: 'property', width: 180, render: (value: string) => <CopyText text={value} ellipsis /> },
    { title: '最新值', width: 220, render: (_: unknown, record: TelemetryLatest) => <CopyText text={formatTelemetryValue(record)} ellipsis /> },
    { title: '更新时间', dataIndex: 'ts', width: 200, render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis /> },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Tooltip title={lastUpdatedAt ? `最近刷新：${formatDateTime(lastUpdatedAt)}` : '尚未自动刷新'}>
            <Switch
              size="small"
              checked={!paused}
              onChange={togglePaused}
              checkedChildren="自动刷新"
              unCheckedChildren="已暂停"
              disabled={!deviceId}
            />
          </Tooltip>
          <Button icon={<ReloadOutlined />} loading={loading} disabled={!deviceId} onClick={() => void refresh()}>刷新最新值</Button>
          <Typography.Text type="secondary">
            {lastUpdatedAt ? `最近刷新：${formatDateTime(lastUpdatedAt)}` : '选择设备后每 10 秒自动刷新'}
          </Typography.Text>
        </Space>
      </Card>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="查询最新遥测数据失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void refresh()}>重试</Button>}
        />
      ) : null}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="property"
          columns={columns}
          dataSource={data}
          loading={loading}
          locale={{
            emptyText: loadError ? (
              '加载失败，请点击上方“重试”'
            ) : (
              <ListEmpty
                emptyText={deviceId ? '该设备暂无最新遥测数据' : '请先在页面顶部选择设备'}
              />
            ),
          }}
          pagination={false}
        />
      </Card>
    </>
  );
};

const AggregateTab: React.FC<TabSharedProps> = ({ deviceId }) => {
  const [data, setData] = useState<AggregateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [property, setProperty] = useState('');
  const [interval, setIntervalValue] = useState('1h');
  const [timeRange, setTimeRange] = useState<TimeRange>(buildDefaultRange);

  const handleQuery = useCallback(async () => {
    if (!deviceId) {
      message.warning('请先在页面顶部选择设备');
      return;
    }
    if (!property.trim()) {
      message.warning('请输入要聚合的属性名');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await deviceDataApi.aggregate({
        deviceId,
        property: property.trim(),
        interval,
        ...buildTimeRangePayload(timeRange),
      });
      setData(res.data.data || []);
    } catch (error) {
      setData([]);
      setLoadError(getErrorMessage(error, '聚合查询失败'));
    } finally {
      setLoading(false);
    }
  }, [deviceId, interval, property, timeRange]);

  useEffect(() => {
    if (!deviceId) {
      setData([]);
      setLoadError(null);
      return;
    }
    // 未填写属性时只清空旧设备结果，不弹提示打断用户切换设备。
    if (!property.trim()) {
      setData([]);
      setLoadError(null);
      return;
    }
    void handleQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  const hasFilters = interval !== '1h';

  const columns: ColumnsType<AggregateRecord> = [
    { title: '时间桶', dataIndex: 'bucket', width: 220, render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis /> },
    { title: '平均值', dataIndex: 'avgVal', width: 120, render: (value: number) => (value != null ? value.toFixed(2) : '-') },
    { title: '最大值', dataIndex: 'maxVal', width: 120, render: (value: number) => (value != null ? value.toFixed(2) : '-') },
    { title: '最小值', dataIndex: 'minVal', width: 120, render: (value: number) => (value != null ? value.toFixed(2) : '-') },
    { title: '数据点', dataIndex: 'count', width: 100, render: (value: number) => (value != null ? <CopyText text={value} /> : '-') },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <RangePicker
            showTime
            allowClear={false}
            value={timeRange}
            onChange={(value) => {
              if (value && value[0] && value[1]) {
                setTimeRange([value[0], value[1]]);
              }
            }}
          />
          <Input
            placeholder="属性名"
            style={{ width: 160 }}
            value={property}
            onChange={(event) => setProperty(event.target.value)}
            onPressEnter={() => void handleQuery()}
          />
          <Select
            placeholder="聚合粒度"
            style={{ width: 130 }}
            value={interval}
            onChange={setIntervalValue}
            options={[
              { value: '1 minute', label: '1 分钟' },
              { value: '5 minutes', label: '5 分钟' },
              { value: '1 hour', label: '1 小时' },
              { value: '1 day', label: '1 天' },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void handleQuery()}>聚合查询</Button>
        </Space>
      </Card>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="聚合查询失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void handleQuery()}>重试</Button>}
        />
      ) : null}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="bucket"
          columns={columns}
          dataSource={data}
          loading={loading}
          locale={{
            emptyText: loadError ? (
              '加载失败，请点击上方“重试”'
            ) : (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText={!deviceId
                  ? '请先在页面顶部选择设备'
                  : !property.trim()
                    ? '请输入属性名后点击“聚合查询”'
                    : '该设备在所选时间范围内没有可聚合的数值数据'}
                filteredText="当前聚合粒度下没有数据，可尝试调整粒度或时间范围"
              />
            ),
          }}
          pagination={{ pageSize: 100, showTotal: (count: number) => `共 ${count} 条` }}
        />
      </Card>
    </>
  );
};

const EventsTab: React.FC<TabSharedProps> = ({ deviceId }) => {
  const [data, setData] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftLevel, setDraftLevel] = useState<string | undefined>();
  const [draftTimeRange, setDraftTimeRange] = useState<TimeRange>(buildDefaultRange);
  const [filters, setFilters] = useState<{ level?: string; timeRange: TimeRange }>({ timeRange: buildDefaultRange() });

  const fetchData = useCallback(async () => {
    if (!deviceId) {
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await deviceDataApi.listEvents({
        ...params,
        deviceId,
        level: filters.level,
        ...buildTimeRangePayload(filters.timeRange),
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      setData([]);
      setTotal(0);
      setLoadError(getErrorMessage(error, '加载设备事件失败'));
    } finally {
      setLoading(false);
    }
  }, [deviceId, filters.level, filters.timeRange, params]);

  useEffect(() => {
    setParams((current) => ({ ...current, pageNum: 1 }));
  }, [deviceId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const applyFilters = () => {
    setFilters({ level: draftLevel, timeRange: draftTimeRange });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    const nextRange = buildDefaultRange();
    setDraftLevel(undefined);
    setDraftTimeRange(nextRange);
    setFilters({ timeRange: nextRange });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const hasFilters = filters.level != null;

  const columns: ColumnsType<EventRecord> = [
    {
      title: '设备',
      width: 220,
      render: (_: unknown, record: EventRecord) => (
        <CopyText text={record.deviceName || '设备信息缺失'} ellipsis />
      ),
    },
    { title: '事件类型', dataIndex: 'eventType', width: 140, render: (value: string) => <CopyText text={value} ellipsis /> },
    { title: '事件名称', dataIndex: 'eventName', width: 180, render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
    { title: '级别', dataIndex: 'level', width: 90, render: (value: string) => <Tag color={levelColors[value]}>{value}</Tag> },
    { title: '发生时间', dataIndex: 'occurredAt', width: 190, render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis /> },
    { title: 'Payload', dataIndex: 'payload', width: 280, render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
  ];

  return (
    <>
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <RangePicker
            showTime
            allowClear={false}
            value={draftTimeRange}
            onChange={(value) => {
              if (value && value[0] && value[1]) {
                setDraftTimeRange([value[0], value[1]]);
              }
            }}
          />
          <Select
            className="ff-query-field"
            placeholder="级别"
            allowClear
            style={{ width: 120 }}
            value={draftLevel}
            options={[
              { value: 'INFO', label: 'INFO' },
              { value: 'WARNING', label: 'WARNING' },
              { value: 'CRITICAL', label: 'CRITICAL' },
            ]}
            onChange={setDraftLevel}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载设备事件失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void fetchData()}>重试</Button>}
        />
      ) : null}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1100 }}
          locale={{
            emptyText: loadError ? (
              '加载失败，请点击上方“重试”'
            ) : (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText={deviceId ? '该设备在所选时间范围内暂无事件记录' : '请先在页面顶部选择设备'}
                filteredText="当前级别筛选下没有事件记录"
                onClearFilters={resetFilters}
              />
            ),
          }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>
    </>
  );
};

const DeviceDataPage: React.FC = () => {
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [deviceOptionsLoading, setDeviceOptionsLoading] = useState(false);
  const [deviceOptionsError, setDeviceOptionsError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number>();
  const [activeTab, setActiveTab] = useState('latest');
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionInfo, setRetentionInfo] = useState<RetentionInfo | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const canManageRetention = hasPermission('data:retention');

  const selectedDevice = useMemo(
    () => deviceOptions.find((item) => item.value === selectedDeviceId) ?? null,
    [deviceOptions, selectedDeviceId],
  );

  const openRetention = async () => {
    setRetentionOpen(true);
    setRetentionLoading(true);
    try {
      const res = await deviceDataApi.getRetention();
      const info = res.data.data as RetentionInfo;
      setRetentionInfo(info);
      setRetentionDays(info.retentionDays);
    } catch (error) {
      message.error(getErrorMessage(error, '加载数据保留策略失败'));
      setRetentionOpen(false);
    } finally {
      setRetentionLoading(false);
    }
  };

  const saveRetention = async () => {
    if (!retentionDays || retentionDays < 1) {
      message.error('请输入至少 1 天的保留天数');
      return;
    }
    setRetentionSaving(true);
    try {
      const res = await deviceDataApi.setRetention(retentionDays);
      setRetentionInfo(res.data.data as RetentionInfo);
      message.success('数据保留策略已更新');
      setRetentionOpen(false);
    } catch (error) {
      message.error(getErrorMessage(error, '设置数据保留策略失败'));
    } finally {
      setRetentionSaving(false);
    }
  };

  const resetRetention = async () => {
    setRetentionSaving(true);
    try {
      const res = await deviceDataApi.resetRetention();
      setRetentionInfo(res.data.data as RetentionInfo);
      setRetentionDays((res.data.data as RetentionInfo).retentionDays);
      message.success('已重置为全局默认保留策略');
    } catch (error) {
      message.error(getErrorMessage(error, '重置数据保留策略失败'));
    } finally {
      setRetentionSaving(false);
    }
  };

  const loadDeviceOptions = useCallback(async (keyword = '') => {
    setDeviceOptionsLoading(true);
    setDeviceOptionsError(null);
    try {
      const res = await deviceApi.list({
        pageNum: 1,
        pageSize: 30,
        keyword: keyword.trim() || undefined,
      });
      const records = (res.data.data?.records || []) as DeviceOptionRecord[];
      const nextOptions = records.map((item) => ({
        value: item.id,
        label: formatSelectedDeviceLabel(item),
        meta: item,
      }));
      setDeviceOptions((current) => mergeDeviceOptions(current, nextOptions));
    } catch (error) {
      setDeviceOptionsError(getErrorMessage(error, '加载设备选项失败'));
    } finally {
      setDeviceOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeviceOptions();
  }, [loadDeviceOptions]);

  return (
    <div>
      <PageHeader
        title="设备数据"
        extra={
          canManageRetention ? (
            <Button icon={<SettingOutlined />} onClick={() => void openRetention()}>
              数据保留
            </Button>
          ) : undefined
        }
      />
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 12, border: 'none', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Typography.Text strong>目标设备</Typography.Text>
          <DeviceSelectField
            allowClear
            width={320}
            value={selectedDeviceId}
            onChange={(nextDeviceId) => {
              setSelectedDeviceId(nextDeviceId);
            }}
            placeholder="搜索并选择设备（所有 Tab 共用）"
            deviceOptions={deviceOptions}
            deviceOptionsLoading={deviceOptionsLoading}
            onSearchDevices={loadDeviceOptions}
          />
          {selectedDevice ? (
            <Space wrap size={4}>
              <Tag color="processing" style={{ marginInlineEnd: 0 }}>{selectedDevice.meta.deviceName}</Tag>
              <Tag color={selectedDevice.meta.onlineStatus === 'ONLINE' ? 'success' : 'default'} style={{ marginInlineEnd: 0 }}>
                {onlineStatusTextMap[selectedDevice.meta.onlineStatus || 'UNKNOWN']}
              </Tag>
              <Tag style={{ marginInlineEnd: 0 }}>{statusTextMap[selectedDevice.meta.status || 'INACTIVE']}</Tag>
            </Space>
          ) : (
            <Typography.Text type="secondary">选择设备后，下方四个 Tab 共享同一设备</Typography.Text>
          )}
          <Button icon={<ReloadOutlined />} loading={deviceOptionsLoading} onClick={() => void loadDeviceOptions()}>刷新设备</Button>
        </Space>
        {deviceOptionsError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="加载设备选项失败"
            description={deviceOptionsError}
            action={<Button size="small" danger onClick={() => void loadDeviceOptions()}>重试</Button>}
          />
        ) : null}
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'latest',
              label: <span><DatabaseOutlined style={{ marginRight: 6 }} />最新数据</span>,
              children: <LatestTab deviceId={selectedDeviceId} active={activeTab === 'latest'} />,
            },
            {
              key: 'telemetry',
              label: <span><FieldTimeOutlined style={{ marginRight: 6 }} />历史数据</span>,
              children: <TelemetryTab deviceId={selectedDeviceId} />,
            },
            {
              key: 'aggregate',
              label: <span><FunctionOutlined style={{ marginRight: 6 }} />聚合统计</span>,
              children: <AggregateTab deviceId={selectedDeviceId} />,
            },
            {
              key: 'events',
              label: <span><AlertOutlined style={{ marginRight: 6 }} />设备事件</span>,
              children: <EventsTab deviceId={selectedDeviceId} />,
            },
          ]}
        />
      </Card>
      <Modal
        title="时序数据保留策略"
        open={retentionOpen}
        onCancel={() => setRetentionOpen(false)}
        confirmLoading={retentionSaving}
        onOk={() => void saveRetention()}
        okText="保存"
        cancelText="取消"
        footer={(_, { OkBtn, CancelBtn }) => (
          <Space>
            <Popconfirm
              title="重置为全局默认保留策略？"
              description="当前租户单独配置的保留天数会被清除，已清理的历史数据不会恢复。"
              okText="确认重置"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => resetRetention()}
            >
              <Button loading={retentionSaving} disabled={retentionLoading}>
                重置为默认
              </Button>
            </Popconfirm>
            <CancelBtn />
            <OkBtn />
          </Space>
        )}
      >
        <p style={{ color: '#8c8c8c', marginBottom: 16 }}>
          超过保留天数的原始遥测数据会被定时清理；小时/天级聚合数据作为历史归档长期保留。
        </p>
        <div style={{ marginBottom: 8 }}>
          当前全局默认：{retentionInfo?.defaultRetentionDays ?? '-'} 天，可设置上限：
          {retentionInfo?.globalMaxRetentionDays ?? '-'} 天
          {retentionInfo?.usingDefault ? '（当前使用默认值）' : '（已单独配置）'}
        </div>
        <InputNumber
          min={1}
          max={retentionInfo?.globalMaxRetentionDays ?? 365}
          value={retentionDays ?? undefined}
          onChange={(value) => setRetentionDays(value ?? null)}
          addonAfter="天"
          style={{ width: 220 }}
          disabled={retentionLoading}
        />
      </Modal>
    </div>
  );
};

export default DeviceDataPage;
