import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { Table, Button, Space, message, Tag, Input, Select, DatePicker, Popconfirm, Card, Modal, Typography } from 'antd';
import { ReloadOutlined, ClearOutlined, EyeOutlined } from '@ant-design/icons';
import { deviceApi, deviceLogApi, productApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

const { RangePicker } = DatePicker;

interface LogItem {
  id: number;
  deviceId: number;
  deviceName?: string;
  nickname?: string;
  productId?: number;
  productKey?: string;
  productName?: string;
  level: string;
  module?: string;
  content: string;
  traceId?: string;
  ip?: string;
  reportedAt?: string;
  createdAt?: string;
}

interface ProductOption {
  id: number;
  name: string;
  productKey: string;
}

interface DeviceOptionRecord {
  id: number;
  productId: number;
  deviceName: string;
  nickname?: string;
}

interface DeviceOption {
  value: number;
  label: string;
}

interface DeviceLogFilters {
  deviceId?: number;
  productId?: number;
  level?: string;
  keyword: string;
  timeRange: [string, string] | null;
}

const EMPTY_FILTERS: DeviceLogFilters = {
  keyword: '',
  timeRange: null,
};

const levelColors: Record<string, string> = { DEBUG: 'default', INFO: 'blue', WARN: 'warning', ERROR: 'error' };

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const mergeDeviceOptions = (current: DeviceOption[], incoming: DeviceOption[]) => {
  const mapped = new Map<number, DeviceOption>();
  current.forEach((item) => mapped.set(item.value, item));
  incoming.forEach((item) => mapped.set(item.value, item));
  return Array.from(mapped.values());
};

const formatDeviceOptionLabel = (device: DeviceOptionRecord, productMap: Map<number, ProductOption>) => {
  const displayName = device.nickname?.trim() && device.nickname !== device.deviceName
    ? `${device.nickname} (${device.deviceName})`
    : device.nickname?.trim() || device.deviceName;
  const product = productMap.get(device.productId);
  if (!product) {
    return displayName;
  }
  return `${displayName} · ${product.name} (${product.productKey})`;
};

const DeviceLogPage: React.FC = () => {
  const [data, setData] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [deviceOptionsLoading, setDeviceOptionsLoading] = useState(false);
  const [draftFilters, setDraftFilters] = useState<DeviceLogFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<DeviceLogFilters>(EMPTY_FILTERS);
  const [querySeq, setQuerySeq] = useState(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<LogItem | null>(null);

  const productLookup = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const productLookupRef = useRef<Map<number, ProductOption>>(new Map());
  const productOptions = useMemo(
    () => products.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey})` })),
    [products],
  );

  useEffect(() => {
    productLookupRef.current = productLookup;
  }, [productLookup]);

  const searchDevices = useCallback(async (keyword?: string, productMap?: Map<number, ProductOption>) => {
    setDeviceOptionsLoading(true);
    try {
      const res = await deviceApi.list({
        pageNum: 1,
        pageSize: 20,
        keyword: keyword?.trim() || undefined,
        excludeVideo: true,
      });
      const currentProductMap = productMap || productLookupRef.current;
      const options = ((res.data.data?.records || []) as DeviceOptionRecord[]).map((item) => ({
        value: item.id,
        label: formatDeviceOptionLabel(item, currentProductMap),
      }));
      setDeviceOptions((current) => mergeDeviceOptions(current, options));
    } catch (error) {
      message.error(getErrorMessage(error, '加载设备选项失败'));
    } finally {
      setDeviceOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const res = await productApi.list({ pageNum: 1, pageSize: 500 });
        if (!active) {
          return;
        }
        const records = (res.data.data?.records || []) as ProductOption[];
        const productMap = new Map(records.map((item) => [item.id, item]));
        setProducts(records);
        await searchDevices('', productMap);
      } catch {
        if (!active) {
          return;
        }
        setProducts([]);
        await searchDevices('', new Map());
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [searchDevices]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const query: Record<string, unknown> = {
          ...params,
          deviceId: filters.deviceId,
          productId: filters.productId,
          level: filters.level,
          keyword: filters.keyword || undefined,
        };
        if (filters.timeRange) {
          query.start = filters.timeRange[0];
          query.end = filters.timeRange[1];
        }
        const res = await deviceLogApi.list(query);
        if (!active) {
          return;
        }
        const page = res.data.data;
        setData(page.records || []);
        setTotal(page.total || 0);
      } catch (error) {
        if (active) {
          message.error(getErrorMessage(error, '加载设备日志失败'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void loadData();
    return () => {
      active = false;
    };
  }, [filters, params, querySeq]);

  const applyFilters = () => {
    setFilters({
      deviceId: draftFilters.deviceId,
      productId: draftFilters.productId,
      level: draftFilters.level,
      keyword: draftFilters.keyword.trim(),
      timeRange: draftFilters.timeRange,
    });
    setParams((prev) => ({ ...prev, pageNum: 1 }));
    setQuerySeq((prev) => prev + 1);
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setParams((prev) => ({ ...prev, pageNum: 1 }));
    setQuerySeq((prev) => prev + 1);
    void searchDevices('');
  };

  const handleRefresh = () => {
    setQuerySeq((prev) => prev + 1);
  };

  const handleClean = async () => {
    try {
      const res = await deviceLogApi.clean(30);
      message.success(`已清理 ${res.data.data} 条过期日志`);
      handleRefresh();
    } catch (error) {
      message.error(getErrorMessage(error, '清理过期日志失败'));
    }
  };

  const columns: ColumnsType<LogItem> = [
    {
      title: '设备',
      dataIndex: 'deviceName',
      width: 240,
      render: (_: unknown, record: LogItem) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.nickname || record.deviceName || '设备信息缺失'}</Typography.Text>
          <Typography.Text type="secondary">{record.deviceName || '设备名称不可用'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '产品',
      dataIndex: 'productKey',
      width: 220,
      render: (_: unknown, record: LogItem) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{record.productName || '产品信息缺失'}</Typography.Text>
          <Typography.Text type="secondary">{record.productKey || '-'}</Typography.Text>
        </Space>
      ),
    },
    { title: '级别', dataIndex: 'level', width: 90, render: (value: string) => <Tag color={levelColors[value] || 'default'}>{value}</Tag> },
    { title: '模块', dataIndex: 'module', width: 140, render: (value?: string) => value || '-' },
    { title: '内容', dataIndex: 'content', width: 360, ellipsis: true },
    { title: 'Trace ID', dataIndex: 'traceId', width: 180, ellipsis: true, render: (value?: string) => value || '-' },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (value?: string) => value || '-' },
    { title: '上报时间', dataIndex: 'reportedAt', width: 180, render: (value?: string) => value || '-' },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_: unknown, record: LogItem) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setDetailRecord(record); setDetailOpen(true); }}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="设备日志"
        description={`共 ${total} 条日志记录`}
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} size="small" onClick={handleRefresh}>刷新</Button>
            <Popconfirm title="清理30天前的过期日志？" onConfirm={handleClean}>
              <Button icon={<ClearOutlined />} danger size="small">清理过期</Button>
            </Popconfirm>
          </Space>
        )}
      />

      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Select
            showSearch
            filterOption={false}
            allowClear
            size="small"
            style={{ width: 300 }}
            placeholder="选择设备"
            value={draftFilters.deviceId}
            options={deviceOptions}
            loading={deviceOptionsLoading}
            notFoundContent={deviceOptionsLoading ? '设备搜索中...' : '暂无匹配设备'}
            onFocus={() => void searchDevices('')}
            onSearch={(value) => void searchDevices(value)}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, deviceId: typeof value === 'number' ? value : undefined }))}
          />
          <Select
            showSearch
            optionFilterProp="label"
            allowClear
            size="small"
            style={{ width: 260 }}
            placeholder="选择产品"
            value={draftFilters.productId}
            options={productOptions}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, productId: typeof value === 'number' ? value : undefined }))}
          />
          <Select
            allowClear
            size="small"
            style={{ width: 120 }}
            placeholder="日志级别"
            value={draftFilters.level}
            options={[
              { value: 'DEBUG', label: 'DEBUG' },
              { value: 'INFO', label: 'INFO' },
              { value: 'WARN', label: 'WARN' },
              { value: 'ERROR', label: 'ERROR' },
            ]}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, level: value }))}
          />
          <Input
            allowClear
            size="small"
            style={{ width: 220 }}
            placeholder="搜索日志内容"
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((prev) => ({ ...prev, keyword: event.target.value }))}
            onPressEnter={applyFilters}
          />
          <RangePicker
            showTime
            size="small"
            value={draftFilters.timeRange ? [dayjs(draftFilters.timeRange[0]), dayjs(draftFilters.timeRange[1])] : null}
            onChange={(_, dateStrings) => {
              const [start, end] = dateStrings as [string, string];
              setDraftFilters((prev) => ({
                ...prev,
                timeRange: start && end ? [start, end] : null,
              }));
            }}
          />
          <Button size="small" type="primary" onClick={applyFilters}>查询</Button>
          <Button size="small" onClick={resetFilters}>重置</Button>
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1650 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      <Modal title="设备日志详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={760}>
        {detailRecord && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>设备：</Typography.Text>
              <Typography.Text>{detailRecord.nickname || detailRecord.deviceName || '设备信息缺失'}</Typography.Text>
              {detailRecord.deviceName && detailRecord.nickname && detailRecord.nickname !== detailRecord.deviceName ? (
                <Typography.Text type="secondary"> ({detailRecord.deviceName})</Typography.Text>
              ) : null}
            </div>
            <div>
              <Typography.Text strong>产品：</Typography.Text>
              <Typography.Text>{detailRecord.productName || '产品信息缺失'}</Typography.Text>
              <Typography.Text type="secondary"> {detailRecord.productKey ? `(${detailRecord.productKey})` : ''}</Typography.Text>
            </div>
            <Space wrap>
              <Typography.Text strong>级别：</Typography.Text>
              <Tag color={levelColors[detailRecord.level] || 'default'}>{detailRecord.level}</Tag>
              <Typography.Text strong>模块：</Typography.Text>
              <Typography.Text>{detailRecord.module || '-'}</Typography.Text>
            </Space>
            <Space wrap>
              <Typography.Text strong>Trace ID：</Typography.Text>
              <Typography.Text copyable={detailRecord.traceId ? { text: detailRecord.traceId } : undefined}>{detailRecord.traceId || '-'}</Typography.Text>
            </Space>
            <Space wrap>
              <Typography.Text strong>IP：</Typography.Text>
              <Typography.Text>{detailRecord.ip || '-'}</Typography.Text>
              <Typography.Text strong>上报时间：</Typography.Text>
              <Typography.Text>{detailRecord.reportedAt || '-'}</Typography.Text>
            </Space>
            <Space wrap>
              <Typography.Text strong>入库时间：</Typography.Text>
              <Typography.Text>{detailRecord.createdAt || '-'}</Typography.Text>
            </Space>
            <div>
              <Typography.Text strong>日志内容</Typography.Text>
              <pre style={{ marginTop: 8, background: '#f8fafc', padding: 12, borderRadius: 8, maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {detailRecord.content || '-'}
              </pre>
            </div>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default DeviceLogPage;
