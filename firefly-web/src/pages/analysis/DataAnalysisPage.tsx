import React, { useState } from 'react';
import { Tabs, Card, Form, Input, InputNumber, Select, Button, Table, message, DatePicker, Row, Col, Statistic } from 'antd';
import { SearchOutlined, DownloadOutlined, BarChartOutlined, LineChartOutlined, PieChartOutlined, ExportOutlined } from '@ant-design/icons';
import { dataAnalysisApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

const { RangePicker } = DatePicker;

// ==================== Time Series Tab ====================

const TimeSeriesTab: React.FC = () => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });

  const handleQuery = async (values?: Record<string, unknown>) => {
    setLoading(true);
    try {
      const formValues = values || form.getFieldsValue();
      const timeRange = formValues.timeRange as [unknown, unknown] | undefined;
      const query = {
        deviceId: formValues.deviceId,
        properties: formValues.properties ? (formValues.properties as string).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
        startTime: timeRange?.[0] ? (timeRange[0] as { toISOString: () => string }).toISOString() : undefined,
        endTime: timeRange?.[1] ? (timeRange[1] as { toISOString: () => string }).toISOString() : undefined,
        ...params,
      };
      const res = await dataAnalysisApi.queryTimeSeries(query);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('查询失败'); } finally { setLoading(false); }
  };

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: '时间', dataIndex: 'time', width: 200 },
    { title: '设备ID', dataIndex: 'device_id', width: 100 },
    { title: '属性', dataIndex: 'property_name', width: 150 },
    { title: '数值', dataIndex: 'value_double', width: 120, render: (v: number) => v != null ? Number(v).toFixed(4) : '-' },
    { title: '字符串值', dataIndex: 'value_string', ellipsis: true, render: (v: string) => v || '-' },
  ];

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery}>
          <Form.Item name="deviceId" label="设备ID" rules={[{ required: true }]}><InputNumber style={{ width: 120 }} /></Form.Item>
          <Form.Item name="properties" label="属性"><Input placeholder="逗号分隔" style={{ width: 200 }} /></Form.Item>
          <Form.Item name="timeRange" label="时间范围"><RangePicker showTime /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>查询</Button></Form.Item>
        </Form>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey={(_, i) => String(i)} columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 800 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => { setParams({ pageNum: page, pageSize: size }); handleQuery(); } }} />
      </Card>
    </div>
  );
};

// ==================== Aggregation Tab ====================

const AggregationTab: React.FC = () => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleQuery = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const timeRange = values.timeRange as [unknown, unknown] | undefined;
      const query = {
        deviceIds: values.deviceIds ? String(values.deviceIds).split(',').map((s: string) => Number(s.trim())).filter(Boolean) : [],
        property: values.property,
        interval: values.interval,
        aggregation: values.aggregation,
        startTime: timeRange?.[0] ? (timeRange[0] as { toISOString: () => string }).toISOString() : undefined,
        endTime: timeRange?.[1] ? (timeRange[1] as { toISOString: () => string }).toISOString() : undefined,
      };
      const res = await dataAnalysisApi.queryAggregation(query);
      setData(res.data.data || []);
    } catch { message.error('查询失败'); } finally { setLoading(false); }
  };

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: '时间桶', dataIndex: 'bucket', width: 200 },
    { title: '设备ID', dataIndex: 'device_id', width: 100 },
    { title: '聚合值', dataIndex: 'value', width: 150, render: (v: number) => v != null ? Number(v).toFixed(4) : '-' },
  ];

  const intervalOptions = [
    { value: '1m', label: '1分钟' }, { value: '5m', label: '5分钟' }, { value: '15m', label: '15分钟' },
    { value: '30m', label: '30分钟' }, { value: '1h', label: '1小时' }, { value: '6h', label: '6小时' },
    { value: '1d', label: '1天' }, { value: '7d', label: '7天' }, { value: '30d', label: '30天' },
  ];

  const aggOptions = [
    { value: 'AVG', label: '平均值' }, { value: 'SUM', label: '求和' }, { value: 'MIN', label: '最小值' },
    { value: 'MAX', label: '最大值' }, { value: 'COUNT', label: '计数' }, { value: 'LAST', label: '最新值' },
    { value: 'FIRST', label: '最早值' },
  ];

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery} initialValues={{ interval: '1h', aggregation: 'AVG' }}>
          <Form.Item name="deviceIds" label="设备ID" rules={[{ required: true }]}><Input placeholder="逗号分隔" style={{ width: 150 }} /></Form.Item>
          <Form.Item name="property" label="属性" rules={[{ required: true }]}><Input style={{ width: 130 }} /></Form.Item>
          <Form.Item name="interval" label="间隔"><Select options={intervalOptions} style={{ width: 100 }} /></Form.Item>
          <Form.Item name="aggregation" label="聚合"><Select options={aggOptions} style={{ width: 100 }} /></Form.Item>
          <Form.Item name="timeRange" label="时间"><RangePicker showTime /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<BarChartOutlined />} loading={loading}>查询</Button></Form.Item>
        </Form>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey={(_, i) => String(i)} columns={columns} dataSource={data} loading={loading} size="small" pagination={false} />
      </Card>
    </div>
  );
};

// ==================== Stats Tab ====================

const StatsTab: React.FC = () => {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleQuery = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const timeRange = values.timeRange as [unknown, unknown] | undefined;
      const res = await dataAnalysisApi.getDeviceStats({
        deviceId: values.deviceId,
        property: values.property,
        startTime: timeRange?.[0] ? (timeRange[0] as { toISOString: () => string }).toISOString() : undefined,
        endTime: timeRange?.[1] ? (timeRange[1] as { toISOString: () => string }).toISOString() : undefined,
      });
      setStats(res.data.data || null);
    } catch { message.error('查询失败'); } finally { setLoading(false); }
  };

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery}>
          <Form.Item name="deviceId" label="设备ID" rules={[{ required: true }]}><InputNumber style={{ width: 120 }} /></Form.Item>
          <Form.Item name="property" label="属性" rules={[{ required: true }]}><Input style={{ width: 130 }} /></Form.Item>
          <Form.Item name="timeRange" label="时间范围"><RangePicker showTime /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>统计</Button></Form.Item>
        </Form>
      </Card>
      {stats && (
        <Row gutter={16}>
          <Col span={4}><Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}><Statistic title="数据点数" value={stats.count as number} /></Card></Col>
          <Col span={5}><Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}><Statistic title="平均值" value={stats.avg as number} precision={4} /></Card></Col>
          <Col span={5}><Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}><Statistic title="最小值" value={stats.min as number} precision={4} /></Card></Col>
          <Col span={5}><Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}><Statistic title="最大值" value={stats.max as number} precision={4} /></Card></Col>
          <Col span={5}><Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}><Statistic title="最新值" value={stats.latest as number} precision={4} /></Card></Col>
        </Row>
      )}
    </div>
  );
};

// ==================== Export Tab ====================

const ExportTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleExport = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const timeRange = values.timeRange as [unknown, unknown] | undefined;
      const res = await dataAnalysisApi.exportData({
        deviceIds: values.deviceIds ? String(values.deviceIds).split(',').map((s: string) => Number(s.trim())).filter(Boolean) : [],
        properties: values.properties ? (values.properties as string).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
        startTime: timeRange?.[0] ? (timeRange[0] as { toISOString: () => string }).toISOString() : undefined,
        endTime: timeRange?.[1] ? (timeRange[1] as { toISOString: () => string }).toISOString() : undefined,
      });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'device_data_export.csv';
      link.click();
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch { message.error('导出失败'); } finally { setLoading(false); }
  };

  return (
    <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <Form form={form} layout="vertical" onFinish={handleExport} style={{ maxWidth: 500 }}>
        <Form.Item name="deviceIds" label="设备ID（逗号分隔）" rules={[{ required: true }]}><Input placeholder="1,2,3" /></Form.Item>
        <Form.Item name="properties" label="属性（逗号分隔，留空导出全部）"><Input placeholder="temperature,humidity" /></Form.Item>
        <Form.Item name="timeRange" label="时间范围"><RangePicker showTime style={{ width: '100%' }} /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" icon={<DownloadOutlined />} loading={loading}>导出 CSV</Button></Form.Item>
      </Form>
    </Card>
  );
};

// ==================== Main Page ====================

const DataAnalysisPage: React.FC = () => {
  return (
    <div>
      <PageHeader title="数据分析" description="时序查询、聚合统计与数据导出" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs defaultActiveKey="timeseries" items={[
          { key: 'timeseries', label: <span><LineChartOutlined style={{ marginRight: 6 }} />时序查询</span>, children: <TimeSeriesTab /> },
          { key: 'aggregation', label: <span><BarChartOutlined style={{ marginRight: 6 }} />聚合统计</span>, children: <AggregationTab /> },
          { key: 'stats', label: <span><PieChartOutlined style={{ marginRight: 6 }} />设备统计</span>, children: <StatsTab /> },
          { key: 'export', label: <span><ExportOutlined style={{ marginRight: 6 }} />数据导出</span>, children: <ExportTab /> },
        ]} />
      </Card>
    </div>
  );
};

export default DataAnalysisPage;
