import React, { useCallback, useEffect, useState } from 'react';
import type { Dayjs } from 'dayjs';
import { Alert, Button, Card, Col, DatePicker, Form, Row, Select, Statistic, Table, Tabs, message } from 'antd';
import {
  BarChartOutlined,
  DownloadOutlined,
  ExportOutlined,
  LineChartOutlined,
  PieChartOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { dataAnalysisApi, deviceApi } from '../../services/api';

const { RangePicker } = DatePicker;

interface DeviceOption {
  id: number;
  deviceName: string;
}

interface TabProps {
  deviceOptions: DeviceOption[];
}

type RangeValue = [Dayjs, Dayjs] | undefined;
type OptionItem = { label: string; value: string };

const buildTimeRangePayload = (timeRange?: RangeValue) => ({
  startTime: timeRange?.[0]?.toISOString(),
  endTime: timeRange?.[1]?.toISOString(),
});

const toPropertyOptions = (items: string[] = []): OptionItem[] =>
  items.map((item) => ({ label: item, value: item }));

const usePropertyOptions = (
  form: ReturnType<typeof Form.useForm>[0],
  fieldName: string,
  deviceIds: number[],
  timeRange?: RangeValue,
  multiple = false,
) => {
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!deviceIds.length) {
      setOptions([]);
      form.setFieldValue(fieldName, undefined);
      return () => {
        active = false;
      };
    }

    const fetchOptions = async () => {
      setLoading(true);
      try {
        const res = await dataAnalysisApi.listProperties({
          deviceIds,
          ...buildTimeRangePayload(timeRange),
        });
        if (!active) {
          return;
        }

        const nextOptions = toPropertyOptions(res.data.data || []);
        const allowedValues = new Set(nextOptions.map((item) => item.value));
        const currentValue = form.getFieldValue(fieldName) as string[] | string | undefined;

        if (multiple) {
          const values = Array.isArray(currentValue) ? currentValue.filter((item) => allowedValues.has(item)) : [];
          form.setFieldValue(fieldName, values.length ? values : undefined);
        } else if (typeof currentValue === 'string' && !allowedValues.has(currentValue)) {
          form.setFieldValue(fieldName, undefined);
        }

        setOptions(nextOptions);
      } catch {
        if (active) {
          setOptions([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchOptions();
    return () => {
      active = false;
    };
  }, [
    deviceIds.join(','),
    fieldName,
    form,
    multiple,
    timeRange?.[0]?.valueOf(),
    timeRange?.[1]?.valueOf(),
  ]);

  return { options, loading };
};

const renderDeviceLabel = (record: Record<string, unknown>) => {
  const deviceName = record.device_name ? String(record.device_name) : '-';
  const productKey = record.product_key ? ` (${String(record.product_key)})` : '';
  return `${deviceName}${productKey}`;
};

const TimeSeriesTab: React.FC<TabProps> = ({ deviceOptions }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });

  const selectedDeviceId = Form.useWatch('deviceId', form) as number | undefined;
  const selectedTimeRange = Form.useWatch('timeRange', form) as RangeValue;
  const { options: propertyOptions, loading: propertyLoading } = usePropertyOptions(
    form,
    'properties',
    selectedDeviceId ? [selectedDeviceId] : [],
    selectedTimeRange,
    true,
  );

  const handleQuery = async (values?: Record<string, unknown>, nextParams = params) => {
    setLoading(true);
    try {
      const formValues = values || form.getFieldsValue();
      const timeRange = formValues.timeRange as RangeValue;
      const query = {
        deviceId: formValues.deviceId,
        properties: formValues.properties || undefined,
        ...buildTimeRangePayload(timeRange),
        ...nextParams,
      };
      const res = await dataAnalysisApi.queryTimeSeries(query);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: '时间', dataIndex: 'time', width: 200 },
    {
      title: '设备',
      width: 220,
      render: (_, record) => renderDeviceLabel(record),
    },
    {
      title: '设备别名',
      dataIndex: 'device_nickname',
      width: 140,
      render: (value: string) => value || '-',
    },
    { title: '属性', dataIndex: 'property_name', width: 150 },
    {
      title: '数值',
      dataIndex: 'value_double',
      width: 120,
      render: (value: number) => (value != null ? Number(value).toFixed(4) : '-'),
    },
    { title: '字符值', dataIndex: 'value_string', ellipsis: true, render: (value: string) => value || '-' },
  ];

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery}>
          <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select
              placeholder="请选择设备"
              showSearch
              optionFilterProp="label"
              style={{ width: 220 }}
              options={deviceOptions.map((item) => ({ value: item.id, label: item.deviceName }))}
            />
          </Form.Item>
          <Form.Item name="properties" label="属性">
            <Select
              mode="multiple"
              allowClear
              placeholder={selectedDeviceId ? '选择属性，留空查询全部' : '请先选择设备'}
              style={{ width: 260 }}
              options={propertyOptions}
              loading={propertyLoading}
              disabled={!selectedDeviceId}
              maxTagCount="responsive"
            />
          </Form.Item>
          <Form.Item name="timeRange" label="时间范围">
            <RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              查询
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey={(_, index) => String(index)}
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, pageSize: number) => {
              const nextPagination = { pageNum: page, pageSize };
              setParams(nextPagination);
              void handleQuery(undefined, nextPagination);
            },
          }}
        />
      </Card>
    </div>
  );
};

const AggregationTab: React.FC<TabProps> = ({ deviceOptions }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const selectedDeviceIds = (Form.useWatch('deviceIds', form) as number[] | undefined) || [];
  const selectedTimeRange = Form.useWatch('timeRange', form) as RangeValue;
  const { options: propertyOptions, loading: propertyLoading } = usePropertyOptions(
    form,
    'property',
    selectedDeviceIds,
    selectedTimeRange,
  );

  const handleQuery = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const timeRange = values.timeRange as RangeValue;
      const res = await dataAnalysisApi.queryAggregation({
        deviceIds: values.deviceIds || [],
        property: values.property,
        interval: values.interval,
        aggregation: values.aggregation,
        ...buildTimeRangePayload(timeRange),
      });
      setData(res.data.data || []);
    } catch {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: '时间桶', dataIndex: 'bucket', width: 220 },
    {
      title: '设备',
      width: 220,
      render: (_, record) => renderDeviceLabel(record),
    },
    {
      title: '聚合值',
      dataIndex: 'value',
      width: 150,
      render: (value: number) => (value != null ? Number(value).toFixed(4) : '-'),
    },
  ];

  const intervalOptions = [
    { value: '1m', label: '1分钟' },
    { value: '5m', label: '5分钟' },
    { value: '15m', label: '15分钟' },
    { value: '30m', label: '30分钟' },
    { value: '1h', label: '1小时' },
    { value: '6h', label: '6小时' },
    { value: '1d', label: '1天' },
    { value: '7d', label: '7天' },
    { value: '30d', label: '30天' },
  ];

  const aggregationOptions = [
    { value: 'AVG', label: '平均值' },
    { value: 'SUM', label: '求和' },
    { value: 'MIN', label: '最小值' },
    { value: 'MAX', label: '最大值' },
    { value: 'COUNT', label: '计数' },
    { value: 'LAST', label: '最新值' },
    { value: 'FIRST', label: '最早值' },
  ];

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery} initialValues={{ interval: '1h', aggregation: 'AVG' }}>
          <Form.Item name="deviceIds" label="设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select
              placeholder="选择设备（可多选）"
              mode="multiple"
              showSearch
              optionFilterProp="label"
              style={{ width: 220 }}
              options={deviceOptions.map((item) => ({ value: item.id, label: item.deviceName }))}
            />
          </Form.Item>
          <Form.Item name="property" label="属性" rules={[{ required: true, message: '请选择属性' }]}>
            <Select
              allowClear
              placeholder={selectedDeviceIds.length ? '请选择属性' : '请先选择设备'}
              style={{ width: 180 }}
              options={propertyOptions}
              loading={propertyLoading}
              disabled={!selectedDeviceIds.length}
            />
          </Form.Item>
          <Form.Item name="interval" label="间隔">
            <Select options={intervalOptions} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="aggregation" label="聚合">
            <Select options={aggregationOptions} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="timeRange" label="时间">
            <RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<BarChartOutlined />} loading={loading}>
              查询
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey={(_, index) => String(index)} columns={columns} dataSource={data} loading={loading} size="small" pagination={false} />
      </Card>
    </div>
  );
};

const StatsTab: React.FC<TabProps> = ({ deviceOptions }) => {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const selectedDeviceId = Form.useWatch('deviceId', form) as number | undefined;
  const selectedTimeRange = Form.useWatch('timeRange', form) as RangeValue;
  const { options: propertyOptions, loading: propertyLoading } = usePropertyOptions(
    form,
    'property',
    selectedDeviceId ? [selectedDeviceId] : [],
    selectedTimeRange,
  );

  const handleQuery = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const timeRange = values.timeRange as RangeValue;
      const res = await dataAnalysisApi.getDeviceStats({
        deviceId: values.deviceId,
        property: values.property,
        ...buildTimeRangePayload(timeRange),
      });
      setStats(res.data.data || null);
    } catch {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery}>
          <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select
              placeholder="请选择设备"
              showSearch
              optionFilterProp="label"
              style={{ width: 220 }}
              options={deviceOptions.map((item) => ({ value: item.id, label: item.deviceName }))}
            />
          </Form.Item>
          <Form.Item name="property" label="属性" rules={[{ required: true, message: '请选择属性' }]}>
            <Select
              allowClear
              placeholder={selectedDeviceId ? '请选择属性' : '请先选择设备'}
              style={{ width: 180 }}
              options={propertyOptions}
              loading={propertyLoading}
              disabled={!selectedDeviceId}
            />
          </Form.Item>
          <Form.Item name="timeRange" label="时间范围">
            <RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              统计
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {stats && (
        <Row gutter={16}>
          <Col span={4}>
            <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <Statistic title="数据点数" value={stats.count as number} />
            </Card>
          </Col>
          <Col span={5}>
            <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <Statistic title="平均值" value={stats.avg as number} precision={4} />
            </Card>
          </Col>
          <Col span={5}>
            <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <Statistic title="最小值" value={stats.min as number} precision={4} />
            </Card>
          </Col>
          <Col span={5}>
            <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <Statistic title="最大值" value={stats.max as number} precision={4} />
            </Card>
          </Col>
          <Col span={5}>
            <Card style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <Statistic title="最新值" value={stats.latest as number} precision={4} />
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

const ExportTab: React.FC<TabProps> = ({ deviceOptions }) => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const selectedDeviceIds = (Form.useWatch('deviceIds', form) as number[] | undefined) || [];
  const selectedTimeRange = Form.useWatch('timeRange', form) as RangeValue;
  const { options: propertyOptions, loading: propertyLoading } = usePropertyOptions(
    form,
    'properties',
    selectedDeviceIds,
    selectedTimeRange,
    true,
  );

  const handleExport = async (values: Record<string, unknown>) => {
    setLoading(true);
    try {
      const timeRange = values.timeRange as RangeValue;
      await dataAnalysisApi.exportData({
        deviceIds: values.deviceIds || [],
        properties: values.properties || undefined,
        ...buildTimeRangePayload(timeRange),
        format: 'CSV',
      });
      message.success('导出任务已创建，请到任务中心下载结果');
    } catch {
      message.error('创建导出任务失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="自定义导出已切换到异步任务中心"
        description="提交后后台会生成 CSV 并写入对象存储，导出完成后可在任务中心统一下载。导出结果使用产品 Key 和设备名称，不再暴露内部设备主键。"
      />
      <Form form={form} layout="vertical" onFinish={handleExport} style={{ maxWidth: 560 }}>
        <Form.Item name="deviceIds" label="选择设备" rules={[{ required: true, message: '请选择设备' }]}>
          <Select
            placeholder="选择设备（可多选）"
            mode="multiple"
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
            options={deviceOptions.map((item) => ({ value: item.id, label: item.deviceName }))}
          />
        </Form.Item>
        <Form.Item name="properties" label="属性">
          <Select
            mode="multiple"
            allowClear
            placeholder={selectedDeviceIds.length ? '选择属性，留空导出全部' : '请先选择设备'}
            style={{ width: '100%' }}
            options={propertyOptions}
            loading={propertyLoading}
            disabled={!selectedDeviceIds.length}
            maxTagCount="responsive"
          />
        </Form.Item>
        <Form.Item name="timeRange" label="时间范围">
          <RangePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<DownloadOutlined />} loading={loading}>
            创建导出任务
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

const DataAnalysisPage: React.FC = () => {
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await deviceApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setDeviceOptions(records.map((item: DeviceOption) => ({ id: item.id, deviceName: item.deviceName })));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  return (
    <div>
      <PageHeader title="数据分析" description="时序查询、聚合统计与数据导出" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs
          defaultActiveKey="timeseries"
          items={[
            {
              key: 'timeseries',
              label: (
                <span>
                  <LineChartOutlined style={{ marginRight: 6 }} />
                  时序查询
                </span>
              ),
              children: <TimeSeriesTab deviceOptions={deviceOptions} />,
            },
            {
              key: 'aggregation',
              label: (
                <span>
                  <BarChartOutlined style={{ marginRight: 6 }} />
                  聚合统计
                </span>
              ),
              children: <AggregationTab deviceOptions={deviceOptions} />,
            },
            {
              key: 'stats',
              label: (
                <span>
                  <PieChartOutlined style={{ marginRight: 6 }} />
                  设备统计
                </span>
              ),
              children: <StatsTab deviceOptions={deviceOptions} />,
            },
            {
              key: 'export',
              label: (
                <span>
                  <ExportOutlined style={{ marginRight: 6 }} />
                  数据导出
                </span>
              ),
              children: <ExportTab deviceOptions={deviceOptions} />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DataAnalysisPage;
