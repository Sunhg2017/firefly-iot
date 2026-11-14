import React, { useCallback, useEffect, useState } from 'react';
import type { Dayjs } from 'dayjs';
import { Alert, Table, Button, Space, message, Tag, Input, Select, DatePicker, Popconfirm, Card, Modal, Typography } from 'antd';
import { ReloadOutlined, ClearOutlined, EyeOutlined } from '@ant-design/icons';
import { deviceApi, deviceLogApi } from '../../services/api';
import { ProductSelect } from '../../components/EntitySelect';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { formatDateTime, toLocalDateTimeString } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { usePageActivation } from '../../hooks/usePageActivation';

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
  timeRange: [Dayjs, Dayjs] | null;
}

const EMPTY_FILTERS: DeviceLogFilters = {
  keyword: '',
  timeRange: null,
};

const CLEAN_RETENTION_DAYS = 30;

const levelColors: Record<string, string> = { DEBUG: 'default', INFO: 'blue', WARN: 'warning', ERROR: 'error' };

const mergeDeviceOptions = (current: DeviceOption[], incoming: DeviceOption[]) => {
  const mapped = new Map<number, DeviceOption>();
  current.forEach((item) => mapped.set(item.value, item));
  incoming.forEach((item) => mapped.set(item.value, item));
  return Array.from(mapped.values());
};

const formatDeviceOptionLabel = (device: DeviceOptionRecord) => (
  device.nickname?.trim() && device.nickname !== device.deviceName
    ? `${device.nickname} (${device.deviceName})`
    : device.nickname?.trim() || device.deviceName
);

const DeviceLogPage: React.FC = () => {
  const [data, setData] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [deviceOptionsLoading, setDeviceOptionsLoading] = useState(false);
  const [draftFilters, setDraftFilters] = useState<DeviceLogFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<DeviceLogFilters>(EMPTY_FILTERS);
  const [querySeq, setQuerySeq] = useState(0);
  usePageActivation(() => setQuerySeq((value) => value + 1));
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<LogItem | null>(null);
  const [cleaning, setCleaning] = useState(false);

  const searchDevices = useCallback(async (keyword?: string) => {
    setDeviceOptionsLoading(true);
    try {
      const res = await deviceApi.list({
        pageNum: 1,
        pageSize: 20,
        keyword: keyword?.trim() || undefined,
        excludeVideo: true,
      });
      const options = ((res.data.data?.records || []) as DeviceOptionRecord[]).map((item) => ({
        value: item.id,
        label: formatDeviceOptionLabel(item),
      }));
      setDeviceOptions((current) => mergeDeviceOptions(current, options));
    } catch (error) {
      message.error(getErrorMessage(error, '加载设备选项失败'));
    } finally {
      setDeviceOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    // 设备下拉改为服务端搜索后不再预加载产品全量；首屏仅取最近 20 台设备作为候选。
    void searchDevices('');
  }, [searchDevices]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const query: Record<string, unknown> = {
          ...params,
          deviceId: filters.deviceId,
          productId: filters.productId,
          level: filters.level,
          keyword: filters.keyword || undefined,
        };
        if (filters.timeRange) {
          // DeviceLogQueryParam.start/end are LocalDateTime, which requires an offset-less literal.
          query.start = toLocalDateTimeString(filters.timeRange[0].toDate());
          query.end = toLocalDateTimeString(filters.timeRange[1].toDate());
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
          setData([]);
          setTotal(0);
          setLoadError(getErrorMessage(error, '加载设备日志失败'));
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

  const hasFilters = filters.keyword !== ''
    || filters.deviceId != null
    || filters.productId != null
    || filters.level != null
    || filters.timeRange != null;

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
    setCleaning(true);
    try {
      const res = await deviceLogApi.clean(CLEAN_RETENTION_DAYS);
      message.success(`已清理 ${res.data.data} 条 ${CLEAN_RETENTION_DAYS} 天前的日志`);
      handleRefresh();
    } catch (error) {
      message.error(getErrorMessage(error, '清理过期日志失败'));
    } finally {
      setCleaning(false);
    }
  };

  const columns: ColumnsType<LogItem> = [
    {
      title: '设备',
      dataIndex: 'deviceName',
      width: 240,
      render: (_: unknown, record: LogItem) => (
        <Space direction="vertical" size={2}>
          <CopyText text={record.nickname || record.deviceName || '设备信息缺失'} strong ellipsis />
          <CopyText text={record.deviceName || '设备名称不可用'} secondary ellipsis />
        </Space>
      ),
    },
    {
      title: '产品',
      dataIndex: 'productKey',
      width: 220,
      render: (_: unknown, record: LogItem) => (
        <Space direction="vertical" size={2}>
          <CopyText text={record.productName || '产品信息缺失'} ellipsis />
          <CopyText text={record.productKey || '-'} secondary ellipsis />
        </Space>
      ),
    },
    { title: '级别', dataIndex: 'level', width: 90, render: (value: string) => <Tag color={levelColors[value] || 'default'}>{value}</Tag> },
    { title: '模块', dataIndex: 'module', width: 140, render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
    { title: '内容', dataIndex: 'content', width: 360, render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
    { title: 'Trace ID', dataIndex: 'traceId', width: 180, render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
    {
      title: '上报时间',
      dataIndex: 'reportedAt',
      width: 190,
      render: (value?: string) => <CopyText text={formatDateTime(value)} ellipsis />,
    },
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
        description={`共 ${total} 条日志记录，按上报时间倒序`}
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} size="small" onClick={handleRefresh} loading={loading}>刷新</Button>
            <Popconfirm
              title={`清理 ${CLEAN_RETENTION_DAYS} 天前的日志？`}
              description={`将永久删除上报时间早于 ${CLEAN_RETENTION_DAYS} 天前的日志，删除后不可恢复；不影响设备、产品与告警数据。`}
              okText="确认清理"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => handleClean()}
            >
              <Button icon={<ClearOutlined />} danger size="small" loading={cleaning}>清理过期</Button>
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
          <ProductSelect
            allowClear
            style={{ width: 260 }}
            placeholder="搜索并选择产品（名称或 productKey）"
            value={draftFilters.productId}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, productId: value }))}
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
            value={draftFilters.timeRange}
            onChange={(value) => {
              const nextRange = value && value[0] && value[1] ? [value[0], value[1]] as [Dayjs, Dayjs] : null;
              setDraftFilters((prev) => ({ ...prev, timeRange: nextRange }));
            }}
          />
          <Button size="small" type="primary" onClick={applyFilters} loading={loading}>查询</Button>
          <Button size="small" onClick={resetFilters}>重置</Button>
        </Space>
      </Card>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载设备日志失败"
          description={loadError}
          action={<Button size="small" danger onClick={handleRefresh}>重试</Button>}
        />
      ) : null}

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1750 }}
          locale={{
            emptyText: loadError ? (
              '加载失败，请点击上方“重试”'
            ) : (
              <ListEmpty
                hasFilters={hasFilters}
                emptyText="该设备或产品暂未上报日志"
                filteredText="没有符合当前筛选条件的日志"
                onClearFilters={resetFilters}
              />
            ),
          }}
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

      <Modal
        title="设备日志详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={760}
      >
        {detailRecord && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong>设备：</Typography.Text>
              <CopyText text={detailRecord.nickname || detailRecord.deviceName || '设备信息缺失'} />
              {detailRecord.deviceName && detailRecord.nickname && detailRecord.nickname !== detailRecord.deviceName ? (
                <Typography.Text type="secondary"> (<CopyText text={detailRecord.deviceName} />)</Typography.Text>
              ) : null}
            </div>
            <div>
              <Typography.Text strong>产品：</Typography.Text>
              <CopyText text={detailRecord.productName || '产品信息缺失'} />
              <Typography.Text type="secondary"> <CopyText text={detailRecord.productKey || '-'} /></Typography.Text>
            </div>
            <Space wrap>
              <Typography.Text strong>级别：</Typography.Text>
              <Tag color={levelColors[detailRecord.level] || 'default'}>{detailRecord.level}</Tag>
              <Typography.Text strong>模块：</Typography.Text>
              <CopyText text={detailRecord.module || '-'} />
            </Space>
            <Space wrap>
              <Typography.Text strong>Trace ID：</Typography.Text>
              <CopyText text={detailRecord.traceId || '-'} />
            </Space>
            <Space wrap>
              <Typography.Text strong>IP：</Typography.Text>
              <CopyText text={detailRecord.ip || '-'} />
              <Typography.Text strong>上报时间：</Typography.Text>
              <CopyText text={formatDateTime(detailRecord.reportedAt)} />
            </Space>
            <Space wrap>
              <Typography.Text strong>入库时间：</Typography.Text>
              <CopyText text={formatDateTime(detailRecord.createdAt)} />
            </Space>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Typography.Text strong>{detailRecord.level === 'ERROR' ? '错误信息' : '日志内容'}</Typography.Text>
                <CopyText text={detailRecord.content || '-'}><span>复制内容</span></CopyText>
              </div>
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
