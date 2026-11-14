import React, { useEffect, useMemo, useState } from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Alert, Button, Card, Col, DatePicker, Empty, Form, Row, Select, Spin, Statistic, Table, Tabs, message } from 'antd';
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
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { dataAnalysisApi, deviceApi } from '../../services/api';
import { DeviceSelect, useRemoteOptions } from '../../components/EntitySelect';
import { formatDateTime, toIsoDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';

const { RangePicker } = DatePicker;

interface DeviceOptionRecord {
  id: number;
  deviceName: string;
}


type RangeValue = [Dayjs, Dayjs] | undefined;
type OptionItem = { label: string; value: string };

const buildDefaultTimeRange = (): [Dayjs, Dayjs] => [dayjs().subtract(24, 'hour'), dayjs()];

const buildTimeRangePayload = (timeRange?: RangeValue) => ({
  startTime: toIsoDateTime(timeRange?.[0]?.toDate()),
  endTime: toIsoDateTime(timeRange?.[1]?.toDate()),
});

const toPropertyOptions = (items: string[] = []): OptionItem[] =>
  items.map((item) => ({ label: item, value: item }));

/** 多选设备：服务端关键字搜索 + 已选名称缓存，保证搜索后已选项仍显示设备名称。 */
const RemoteDeviceMultiSelect: React.FC<{
  value?: number[];
  onChange?: (value: number[]) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}> = ({ value, onChange, placeholder, style, disabled }) => {
  const { options, loading, onSearch } = useRemoteOptions<DeviceOptionRecord>(
    async (keyword) => {
      try {
        const res = await deviceApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
        return (res.data.data?.records ?? []) as DeviceOptionRecord[];
      } catch (error) {
        message.error(getErrorMessage(error, '搜索设备失败'));
        throw error;
      }
    },
    (item) => ({ value: item.id, label: item.deviceName }),
  );
  const [labelCache, setLabelCache] = useState<Record<number, string>>({});
  useEffect(() => {
    if (options.length === 0) {
      return;
    }
    setLabelCache((previous) => {
      const next = { ...previous };
      options.forEach((item) => {
        next[item.value] = item.label;
      });
      return next;
    });
  }, [options]);
  const mergedOptions = useMemo(() => {
    const known = new Set(options.map((item) => item.value));
    const missing = (value ?? []).filter((id) => !known.has(id));
    return [...options, ...missing.map((id) => ({ value: id, label: labelCache[id] ?? '已选设备' }))];
  }, [labelCache, options, value]);
  return (
    <Select
      mode="multiple"
      allowClear
      showSearch
      filterOption={false}
      onSearch={onSearch}
      placeholder={placeholder}
      style={style}
      disabled={disabled}
      options={mergedOptions}
      loading={loading}
      value={value}
      onChange={(next) => onChange?.(next)}
      notFoundContent={loading ? <Spin size="small" /> : '未找到匹配设备，换个关键字试试'}
    />
  );
};

const usePropertyOptions = (
  form: ReturnType<typeof Form.useForm>[0],
  fieldName: string,
  deviceIds: number[],
  timeRange?: RangeValue,
  multiple = false,
) => {
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const deviceIdsKey = deviceIds.join(',');
  const timeRangeStart = timeRange?.[0]?.valueOf();
  const timeRangeEnd = timeRange?.[1]?.valueOf();

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
      } catch (error) {
        if (active) {
          setOptions([]);
          message.warning(getErrorMessage(error, '加载可查询属性失败'));
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
    // 设备与时间范围以原始值参与比较，避免数组对象每次渲染变化导致重复请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdsKey, fieldName, form, multiple, timeRangeStart, timeRangeEnd]);

  return { options, loading };
};

const renderDeviceLabel = (record: Record<string, unknown>) => {
  const deviceName = record.device_name ? String(record.device_name) : '-';
  const productKey = record.product_key ? ` (${String(record.product_key)})` : '';
  return `${deviceName}${productKey}`;
};

const TimeSeriesTab: React.FC = () => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [form] = Form.useForm();
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });
  const initialTimeRange = useMemo<RangeValue>(() => buildDefaultTimeRange(), []);

  const selectedDeviceId = Form.useWatch('deviceId', form) as number | undefined;
  const selectedTimeRange = Form.useWatch('timeRange', form) as RangeValue;
  const selectedProperties = Form.useWatch('properties', form) as string[] | undefined;
  const { options: propertyOptions, loading: propertyLoading } = usePropertyOptions(
    form,
    'properties',
    selectedDeviceId ? [selectedDeviceId] : [],
    selectedTimeRange,
    true,
  );

  const handleQuery = async (values?: Record<string, unknown>, nextParams = params) => {
    setLoading(true);
    setLoadError(null);
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
    } catch (error) {
      setData([]);
      setTotal(0);
      setLoadError(getErrorMessage(error, '查询时序数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 切换设备后先清空上一台设备的结果，避免把旧数据误认为新设备的数据。
    setData([]);
    setTotal(0);
    setLoadError(null);
  }, [selectedDeviceId]);

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: '时间', dataIndex: 'time', width: 200, render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis /> },
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
    { title: '属性', dataIndex: 'property_name', width: 160, render: (value: string) => <CopyText text={value} ellipsis /> },
    {
      title: '数值',
      dataIndex: 'value_double',
      width: 130,
      render: (value: number) => (value != null ? Number(value).toFixed(4) : '-'),
    },
    {
      title: '字符值',
      dataIndex: 'value_string',
      render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
    },
  ];

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery} initialValues={{ timeRange: initialTimeRange }}>
          <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
            <DeviceSelect
              placeholder="搜索并选择设备（名称或别名）"
              style={{ width: 220 }}
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
            <RangePicker showTime allowClear={false} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              查询
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="查询时序数据失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => form.submit()}>重试</Button>}
        />
      ) : null}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey={(_, index) => String(index)}
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          locale={{
            emptyText: loadError ? (
              '加载失败，请点击上方“重试”'
            ) : (
              <ListEmpty
                hasFilters={Boolean(selectedDeviceId && selectedProperties?.length)}
                emptyText={selectedDeviceId ? '该设备在所选时间范围内暂无时序数据' : '请先选择设备后查询'}
                filteredText="当前属性筛选下没有时序数据"
                onClearFilters={() => form.setFieldValue('properties', undefined)}
              />
            ),
          }}
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

const AggregationTab: React.FC = () => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const initialTimeRange = useMemo<RangeValue>(() => buildDefaultTimeRange(), []);

  const selectedDeviceIds = (Form.useWatch('deviceIds', form) as number[] | undefined) || [];
  const selectedDeviceKey = selectedDeviceIds.join(',');
  const selectedTimeRange = Form.useWatch('timeRange', form) as RangeValue;
  const { options: propertyOptions, loading: propertyLoading } = usePropertyOptions(
    form,
    'property',
    selectedDeviceIds,
    selectedTimeRange,
  );

  const handleQuery = async (values: Record<string, unknown>) => {
    setLoading(true);
    setLoadError(null);
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
    } catch (error) {
      setData([]);
      setLoadError(getErrorMessage(error, '聚合查询失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData([]);
    setLoadError(null);
  }, [selectedDeviceKey]);

  const columns: ColumnsType<Record<string, unknown>> = [
    { title: '时间桶', dataIndex: 'bucket', width: 220, render: (value: string) => <CopyText text={formatDateTime(value)} ellipsis /> },
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
        <Form
          form={form}
          layout="inline"
          onFinish={handleQuery}
          initialValues={{ interval: '1h', aggregation: 'AVG', timeRange: initialTimeRange }}
        >
          <Form.Item name="deviceIds" label="设备" rules={[{ required: true, message: '请选择设备' }]}>
            <RemoteDeviceMultiSelect
              placeholder="搜索并选择设备（名称或别名，可多选）"
              style={{ width: 220 }}
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
            <RangePicker showTime allowClear={false} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<BarChartOutlined />} loading={loading}>
              查询
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="聚合查询失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => form.submit()}>重试</Button>}
        />
      ) : null}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey={(_, index) => String(index)}
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          locale={{
            emptyText: loadError
              ? '加载失败，请点击上方“重试”'
              : (
                <ListEmpty
                  emptyText={selectedDeviceIds.length
                    ? '所选设备在时间范围内没有可聚合的数值数据'
                    : '请先选择设备后查询'}
                />
              ),
          }}
          pagination={false}
        />
      </Card>
    </div>
  );
};

const StatsTab: React.FC = () => {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queried, setQueried] = useState(false);
  const [form] = Form.useForm();
  const initialTimeRange = useMemo<RangeValue>(() => buildDefaultTimeRange(), []);

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
    setLoadError(null);
    try {
      const timeRange = values.timeRange as RangeValue;
      const res = await dataAnalysisApi.getDeviceStats({
        deviceId: values.deviceId,
        property: values.property,
        ...buildTimeRangePayload(timeRange),
      });
      setStats(res.data.data || null);
      setQueried(true);
    } catch (error) {
      setStats(null);
      setLoadError(getErrorMessage(error, '加载设备统计失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setStats(null);
    setQueried(false);
    setLoadError(null);
  }, [selectedDeviceId]);

  return (
    <div>
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="inline" onFinish={handleQuery} initialValues={{ timeRange: initialTimeRange }}>
          <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
            <DeviceSelect
              placeholder="搜索并选择设备（名称或别名）"
              style={{ width: 220 }}
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
            <RangePicker showTime allowClear={false} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              统计
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载设备统计失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => form.submit()}>重试</Button>}
        />
      ) : null}
      {stats ? (
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
      ) : queried && !loading && !loadError ? (
        <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <Empty description="该设备在所选时间范围内暂无统计数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : null}
    </div>
  );
};

const ExportTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const initialTimeRange = useMemo<RangeValue>(() => buildDefaultTimeRange(), []);

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
    setExportError(null);
    try {
      const timeRange = values.timeRange as RangeValue;
      await dataAnalysisApi.exportData({
        deviceIds: values.deviceIds || [],
        properties: values.properties || undefined,
        ...buildTimeRangePayload(timeRange),
        format: 'CSV',
      });
      message.success('导出任务已创建，请到任务中心下载结果');
    } catch (error) {
      setExportError(getErrorMessage(error, '创建导出任务失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleExport}
        initialValues={{ timeRange: initialTimeRange }}
        style={{ maxWidth: 560 }}
      >
        <Form.Item name="deviceIds" label="选择设备" rules={[{ required: true, message: '请选择设备' }]}>
          <RemoteDeviceMultiSelect
            placeholder="搜索并选择设备（名称或别名，可多选）"
            style={{ width: '100%' }}
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
          <RangePicker showTime allowClear={false} style={{ width: '100%' }} />
        </Form.Item>
        {exportError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="创建导出任务失败"
            description={exportError}
            action={<Button size="small" danger onClick={() => form.submit()}>重试</Button>}
          />
        ) : null}
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
  return (
    <div>
      <PageHeader title="数据分析" />
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
              children: <TimeSeriesTab />,
            },
            {
              key: 'aggregation',
              label: (
                <span>
                  <BarChartOutlined style={{ marginRight: 6 }} />
                  聚合统计
                </span>
              ),
              children: <AggregationTab />,
            },
            {
              key: 'stats',
              label: (
                <span>
                  <PieChartOutlined style={{ marginRight: 6 }} />
                  设备统计
                </span>
              ),
              children: <StatsTab />,
            },
            {
              key: 'export',
              label: (
                <span>
                  <ExportOutlined style={{ marginRight: 6 }} />
                  数据导出
                </span>
              ),
              children: <ExportTab />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DataAnalysisPage;
