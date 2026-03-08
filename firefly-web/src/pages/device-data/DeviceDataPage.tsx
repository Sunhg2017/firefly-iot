import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Card, message, Form, Input, Select, Tabs } from 'antd';
import { SearchOutlined, BarChartOutlined, DatabaseOutlined, FieldTimeOutlined, FunctionOutlined, AlertOutlined } from '@ant-design/icons';
import { deviceDataApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


// ==================== Types ====================
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
  productId: number;
  eventType: string;
  eventName: string;
  level: string;
  payload: string;
  occurredAt: string;
}

const levelColors: Record<string, string> = { INFO: 'blue', WARNING: 'orange', CRITICAL: 'red' };

// ==================== Telemetry Tab ====================
const TelemetryTab: React.FC = () => {
  const [data, setData] = useState<TelemetryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [property, setProperty] = useState<string>('');

  const handleQuery = async () => {
    if (!deviceId) { message.warning('请输入设备ID'); return; }
    setLoading(true);
    try {
      const res = await deviceDataApi.query({ deviceId: Number(deviceId), property: property || undefined, limit: 200 });
      setData(res.data.data || []);
    } catch { message.error('查询失败'); } finally { setLoading(false); }
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
          <Input placeholder="设备ID" style={{ width: 140 }} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
          <Input placeholder="属性名(可选)" style={{ width: 160 }} value={property} onChange={(e) => setProperty(e.target.value)} />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery}>查询</Button>
        </Space>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey={(r, i) => `${r.ts}-${r.property}-${i}`} columns={columns} dataSource={data} loading={loading}
          pagination={{ pageSize: 50, showTotal: (t: number) => `共 ${t} 条` }} />
      </Card>
    </>
  );
};

// ==================== Latest Tab ====================
const LatestTab: React.FC = () => {
  const [data, setData] = useState<TelemetryLatest[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');

  const handleQuery = async () => {
    if (!deviceId) { message.warning('请输入设备ID'); return; }
    setLoading(true);
    try {
      const res = await deviceDataApi.latest(Number(deviceId));
      setData(res.data.data || []);
    } catch { message.error('查询失败'); } finally { setLoading(false); }
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
        <Space>
          <Input placeholder="设备ID" style={{ width: 140 }} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery}>查询最新值</Button>
        </Space>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="property" columns={columns} dataSource={data} loading={loading} pagination={false} />
      </Card>
    </>
  );
};

// ==================== Aggregate Tab ====================
const AggregateTab: React.FC = () => {
  const [data, setData] = useState<AggregateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleQuery = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const res = await deviceDataApi.aggregate({
        deviceId: Number(values.deviceId),
        property: values.property,
        interval: values.interval,
        startTime: values.startTime || undefined,
        endTime: values.endTime || undefined,
      });
      setData(res.data.data || []);
    } catch { message.error('查询失败'); } finally { setLoading(false); }
  };

  const columns: ColumnsType<AggregateRecord> = [
    { title: '时间桶', dataIndex: 'bucket', width: 200 },
    { title: '平均值', dataIndex: 'avgVal', width: 120, render: (v: number) => v != null ? v.toFixed(2) : '-' },
    { title: '最大值', dataIndex: 'maxVal', width: 120, render: (v: number) => v != null ? v.toFixed(2) : '-' },
    { title: '最小值', dataIndex: 'minVal', width: 120, render: (v: number) => v != null ? v.toFixed(2) : '-' },
    { title: '数据点', dataIndex: 'count', width: 80 },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline">
          <Form.Item name="deviceId" rules={[{ required: true, message: '必填' }]}><Input placeholder="设备ID" style={{ width: 120 }} /></Form.Item>
          <Form.Item name="property" rules={[{ required: true, message: '必填' }]}><Input placeholder="属性名" style={{ width: 140 }} /></Form.Item>
          <Form.Item name="interval" rules={[{ required: true, message: '必填' }]}>
            <Select placeholder="聚合粒度" style={{ width: 130 }}
              options={[{ value: '1 minute', label: '1 分钟' }, { value: '5 minutes', label: '5 分钟' }, { value: '1 hour', label: '1 小时' }, { value: '1 day', label: '1 天' }]} />
          </Form.Item>
          <Form.Item><Button type="primary" icon={<BarChartOutlined />} onClick={handleQuery}>聚合查询</Button></Form.Item>
        </Form>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="bucket" columns={columns} dataSource={data} loading={loading}
          pagination={{ pageSize: 100, showTotal: (t: number) => `共 ${t} 条` }} />
      </Card>
    </>
  );
};

// ==================== Events Tab ====================
const EventsTab: React.FC = () => {
  const [data, setData] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [deviceId, setDeviceId] = useState<string>('');
  const [filterLevel, setFilterLevel] = useState<string | undefined>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await deviceDataApi.listEvents({
        ...params,
        deviceId: deviceId ? Number(deviceId) : undefined,
        level: filterLevel,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载事件列表失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, filterLevel]);

  const columns: ColumnsType<EventRecord> = [
    { title: '事件类型', dataIndex: 'eventType', width: 140 },
    { title: '事件名称', dataIndex: 'eventName', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '级别', dataIndex: 'level', width: 80, render: (v: string) => <Tag color={levelColors[v]}>{v}</Tag> },
    { title: '设备ID', dataIndex: 'deviceId', width: 100 },
    { title: '发生时间', dataIndex: 'occurredAt', width: 180 },
    { title: 'Payload', dataIndex: 'payload', width: 260, ellipsis: true, render: (v: string) => v || '-' },
  ];

  return (
    <>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input placeholder="设备ID" style={{ width: 140 }} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
          <Select placeholder="级别" allowClear style={{ width: 120 }}
            options={[{ value: 'INFO', label: 'INFO' }, { value: 'WARNING', label: 'WARNING' }, { value: 'CRITICAL', label: 'CRITICAL' }]}
            onChange={(v) => { setFilterLevel(v); setParams({ ...params, pageNum: 1 }); }} />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => { setParams({ ...params, pageNum: 1 }); fetchData(); }}>搜索</Button>
        </Space>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1000 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>
    </>
  );
};

// ==================== Main Component ====================
const DeviceDataPage: React.FC = () => {
  return (
    <div>
      <PageHeader title="设备数据" description="设备遥测数据查询与事件管理" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs defaultActiveKey="latest" items={[
          { key: 'latest', label: <span><DatabaseOutlined style={{ marginRight: 6 }} />最新数据</span>, children: <LatestTab /> },
          { key: 'telemetry', label: <span><FieldTimeOutlined style={{ marginRight: 6 }} />历史数据</span>, children: <TelemetryTab /> },
          { key: 'aggregate', label: <span><FunctionOutlined style={{ marginRight: 6 }} />聚合统计</span>, children: <AggregateTab /> },
          { key: 'events', label: <span><AlertOutlined style={{ marginRight: 6 }} />设备事件</span>, children: <EventsTab /> },
        ]} />
      </Card>
    </div>
  );
};

export default DeviceDataPage;
