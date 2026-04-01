import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Space, Card, message, Form, Input, Select, Tabs } from 'antd';
import {
  SearchOutlined,
  BarChartOutlined,
  DatabaseOutlined,
  FieldTimeOutlined,
  FunctionOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { deviceApi, deviceDataApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

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

interface DeviceSelectorSharedProps {
  deviceOptions: DeviceOption[];
  deviceOptionsLoading: boolean;
  onSearchDevices: (keyword?: string) => void;
}

interface DeviceSelectFieldProps extends DeviceSelectorSharedProps {
  value?: number;
  onChange?: (value?: number) => void;
  placeholder: string;
  allowClear?: boolean;
  width?: number;
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

const levelColors: Record<string, string> = { INFO: 'blue', WARNING: 'orange', CRITICAL: 'red' };
const onlineStatusTextMap: Record<string, string> = { ONLINE: '在线', OFFLINE: '离线', UNKNOWN: '未知' };
const statusTextMap: Record<string, string> = { ACTIVE: '已激活', INACTIVE: '未激活', DISABLED: '已禁用' };

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

interface TabSharedProps extends DeviceSelectorSharedProps {
  deviceNameMap: Map<number, string>;
}

const TelemetryTab: React.FC<TabSharedProps> = ({ deviceOptions, deviceOptionsLoading, onSearchDevices }) => {
  const [data, setData] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<number | undefined>();
  const [property, setProperty] = useState<string>('');

  const handleQuery = async () => {
    if (!deviceId) {
      message.warning('请先选择设备');
      return;
    }
    setLoading(true);
    try {
      const res = await deviceDataApi.query({ deviceId, property: property.trim() || undefined, limit: 200 });
      setData(res.data.data || []);
    } catch {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (record: TelemetryRecord) => {
    if (record.valueNumber != null) return String(record.valueNumber);
    if (record.valueBool != null) return record.valueBool ? 'true' : 'false';
    if (record.valueString != null) return record.valueString;
    return '-';
  };

  const columns: ColumnsType<TelemetryRecord> = [
    { title: '时间', dataIndex: 'ts', width: 200 },
    { title: '属性', dataIndex: 'property', width: 150 },
    { title: '值', width: 200, render: (_: unknown, record: TelemetryRecord) => formatValue(record) },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <DeviceSelectField
            value={deviceId}
            onChange={setDeviceId}
            placeholder="请选择设备"
            deviceOptions={deviceOptions}
            deviceOptionsLoading={deviceOptionsLoading}
            onSearchDevices={onSearchDevices}
          />
          <Input placeholder="属性名（可选）" style={{ width: 180 }} value={property} onChange={(e) => setProperty(e.target.value)} />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery}>查询</Button>
        </Space>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey={(record, index) => `${record.ts}-${record.property}-${index}`}
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{ pageSize: 50, showTotal: (total: number) => `共 ${total} 条` }}
        />
      </Card>
    </>
  );
};

const LatestTab: React.FC<TabSharedProps> = ({ deviceOptions, deviceOptionsLoading, onSearchDevices }) => {
  const [data, setData] = useState<TelemetryLatest[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<number | undefined>();

  const handleQuery = async () => {
    if (!deviceId) {
      message.warning('请先选择设备');
      return;
    }
    setLoading(true);
    try {
      const res = await deviceDataApi.latest(deviceId);
      setData(res.data.data || []);
    } catch {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (record: TelemetryLatest) => {
    if (record.valueNumber != null) return String(record.valueNumber);
    if (record.valueBool != null) return record.valueBool ? 'true' : 'false';
    if (record.valueString != null) return record.valueString;
    return '-';
  };

  const columns: ColumnsType<TelemetryLatest> = [
    { title: '属性', dataIndex: 'property', width: 180 },
    { title: '最新值', width: 200, render: (_: unknown, record: TelemetryLatest) => formatValue(record) },
    { title: '更新时间', dataIndex: 'ts', width: 200 },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <DeviceSelectField
            value={deviceId}
            onChange={setDeviceId}
            placeholder="请选择设备"
            deviceOptions={deviceOptions}
            deviceOptionsLoading={deviceOptionsLoading}
            onSearchDevices={onSearchDevices}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery}>查询最新值</Button>
        </Space>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="property" columns={columns} dataSource={data} loading={loading} pagination={false} />
      </Card>
    </>
  );
};

const AggregateTab: React.FC<TabSharedProps> = ({ deviceOptions, deviceOptionsLoading, onSearchDevices }) => {
  const [data, setData] = useState<AggregateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleQuery = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const res = await deviceDataApi.aggregate({
        deviceId: values.deviceId,
        property: values.property.trim(),
        interval: values.interval,
        startTime: values.startTime || undefined,
        endTime: values.endTime || undefined,
      });
      setData(res.data.data || []);
    } catch (error) {
      const isValidationError = typeof error === 'object' && error !== null && 'errorFields' in error;
      if (!isValidationError) {
        message.error('查询失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<AggregateRecord> = [
    { title: '时间桶', dataIndex: 'bucket', width: 200 },
    { title: '平均值', dataIndex: 'avgVal', width: 120, render: (value: number) => (value != null ? value.toFixed(2) : '-') },
    { title: '最大值', dataIndex: 'maxVal', width: 120, render: (value: number) => (value != null ? value.toFixed(2) : '-') },
    { title: '最小值', dataIndex: 'minVal', width: 120, render: (value: number) => (value != null ? value.toFixed(2) : '-') },
    { title: '数据点', dataIndex: 'count', width: 80 },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline">
          <Form.Item name="deviceId" rules={[{ required: true, message: '请选择设备' }]}>
            <DeviceSelectField
              placeholder="请选择设备"
              deviceOptions={deviceOptions}
              deviceOptionsLoading={deviceOptionsLoading}
              onSearchDevices={onSearchDevices}
            />
          </Form.Item>
          <Form.Item name="property" rules={[{ required: true, message: '请输入属性名' }]}>
            <Input placeholder="属性名" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="interval" rules={[{ required: true, message: '请选择聚合粒度' }]}>
            <Select
              placeholder="聚合粒度"
              style={{ width: 130 }}
              options={[
                { value: '1 minute', label: '1 分钟' },
                { value: '5 minutes', label: '5 分钟' },
                { value: '1 hour', label: '1 小时' },
                { value: '1 day', label: '1 天' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" icon={<BarChartOutlined />} onClick={handleQuery}>聚合查询</Button>
          </Form.Item>
        </Form>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="bucket"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{ pageSize: 100, showTotal: (total: number) => `共 ${total} 条` }}
        />
      </Card>
    </>
  );
};

const EventsTab: React.FC<TabSharedProps> = ({ deviceOptions, deviceOptionsLoading, onSearchDevices, deviceNameMap }) => {
  const [data, setData] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<{ deviceId?: number; level?: string }>({});
  const [filters, setFilters] = useState<{ deviceId?: number; level?: string }>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await deviceDataApi.listEvents({
        ...params,
        deviceId: filters.deviceId,
        level: filters.level,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载事件列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [filters, params.pageNum, params.pageSize]);

  const applyFilters = () => {
    setFilters({
      deviceId: draftFilters.deviceId,
      level: draftFilters.level,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({});
    setFilters({});
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const columns: ColumnsType<EventRecord> = [
    { title: '设备', width: 220, render: (_: unknown, record: EventRecord) => record.deviceName || deviceNameMap.get(record.deviceId) || '设备信息缺失' },
    { title: '事件类型', dataIndex: 'eventType', width: 140 },
    { title: '事件名称', dataIndex: 'eventName', width: 180, ellipsis: true, render: (value: string) => value || '-' },
    { title: '级别', dataIndex: 'level', width: 80, render: (value: string) => <Tag color={levelColors[value]}>{value}</Tag> },
    { title: '发生时间', dataIndex: 'occurredAt', width: 180 },
    { title: 'Payload', dataIndex: 'payload', width: 260, ellipsis: true, render: (value: string) => value || '-' },
  ];

  return (
    <>
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <DeviceSelectField
            allowClear
            width={280}
            value={draftFilters.deviceId}
            onChange={(deviceId) => setDraftFilters((current) => ({ ...current, deviceId }))}
            placeholder="按设备筛选（可选）"
            deviceOptions={deviceOptions}
            deviceOptionsLoading={deviceOptionsLoading}
            onSearchDevices={onSearchDevices}
          />
          <Select
            className="ff-query-field"
            placeholder="级别"
            allowClear
            style={{ width: 120 }}
            value={draftFilters.level}
            options={[
              { value: 'INFO', label: 'INFO' },
              { value: 'WARNING', label: 'WARNING' },
              { value: 'CRITICAL', label: 'CRITICAL' },
            ]}
            onChange={(value) => setDraftFilters((current) => ({ ...current, level: value }))}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1000 }}
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

  const loadDeviceOptions = async (keyword = '') => {
    setDeviceOptionsLoading(true);
    try {
      const res = await deviceApi.list({
        pageNum: 1,
        pageSize: 30,
        keyword: keyword || undefined,
      });
      const records = (res.data.data?.records || []) as DeviceOptionRecord[];
      const nextOptions = records.map((item) => ({
        value: item.id,
        label: formatSelectedDeviceLabel(item),
        meta: item,
      }));
      setDeviceOptions((current) => mergeDeviceOptions(current, nextOptions));
    } catch {
      message.error('加载设备选项失败');
    } finally {
      setDeviceOptionsLoading(false);
    }
  };

  useEffect(() => {
    void loadDeviceOptions();
  }, []);

  const deviceNameMap = useMemo(
    () => new Map(deviceOptions.map((item) => [item.value, item.meta.deviceName])),
    [deviceOptions],
  );

  const sharedTabProps: TabSharedProps = {
    deviceOptions,
    deviceOptionsLoading,
    onSearchDevices: loadDeviceOptions,
    deviceNameMap,
  };

  return (
    <div>
      <PageHeader title="设备数据" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs
          defaultActiveKey="latest"
          items={[
            {
              key: 'latest',
              label: <span><DatabaseOutlined style={{ marginRight: 6 }} />最新数据</span>,
              children: <LatestTab {...sharedTabProps} />,
            },
            {
              key: 'telemetry',
              label: <span><FieldTimeOutlined style={{ marginRight: 6 }} />历史数据</span>,
              children: <TelemetryTab {...sharedTabProps} />,
            },
            {
              key: 'aggregate',
              label: <span><FunctionOutlined style={{ marginRight: 6 }} />聚合统计</span>,
              children: <AggregateTab {...sharedTabProps} />,
            },
            {
              key: 'events',
              label: <span><AlertOutlined style={{ marginRight: 6 }} />设备事件</span>,
              children: <EventsTab {...sharedTabProps} />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DeviceDataPage;
