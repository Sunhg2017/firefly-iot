import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { ClearOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { operationLogApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { getErrorMessage } from '../../utils/errors';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime, toIsoDateTime } from '../../utils/datetime';

const { RangePicker } = DatePicker;

interface LogItem {
  id: number; tenantId: number; userId: number; username: string; module: string;
  operationType: string; description: string; method: string; requestUrl: string;
  requestMethod: string; requestParams: string; responseResult: string;
  ip: string; userAgent: string; status: number; errorMsg: string; costMs: number; createdAt: string;
}

interface OperationLogFilters {
  module?: string;
  operationType?: string;
  username?: string;
  status?: number;
  timeRange?: [Dayjs, Dayjs];
}

const typeColors: Record<string, string> = { CREATE: 'green', UPDATE: 'blue', DELETE: 'red', QUERY: 'default', EXPORT: 'purple', LOGIN: 'cyan', LOGOUT: 'orange' };
const typeLabels: Record<string, string> = {
  CREATE: '创建', UPDATE: '更新', DELETE: '删除', QUERY: '查询',
  EXPORT: '导出', LOGIN: '登录', LOGOUT: '登出',
};
const typeOptions = Object.entries(typeLabels).map(([value, label]) => ({ value, label }));

const CLEAN_RETENTION_DAYS = 90;

/** 操作日志查询 DTO 使用 LocalDateTime，提交本地时区的 ISO 字面量，避免 UTC 偏移导致时间窗口错位。 */
const toBackendDateTime = (value: Dayjs | null | undefined): string | undefined => {
  const iso = toIsoDateTime(value ? value.toDate() : null);
  return iso ? dayjs(iso).format('YYYY-MM-DDTHH:mm:ss') : undefined;
};

/** 请求参数/响应结果可能是 JSON，格式化展示更易读；非 JSON 原样展示。 */
const prettyPayload = (value?: string | null): string => {
  if (!value) {
    return '-';
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const OperationLogPage: React.FC = () => {
  const [data, setData] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });
  const [draftFilters, setDraftFilters] = useState<OperationLogFilters>({});
  const [filters, setFilters] = useState<OperationLogFilters>({});
  const [moduleOptions, setModuleOptions] = useState<{ value: string; label: string }[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<LogItem | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { ...params };
      if (filters.module) query.module = filters.module;
      if (filters.operationType) query.operationType = filters.operationType;
      if (filters.username) query.username = filters.username;
      if (filters.status !== undefined) query.status = filters.status;
      query.start = toBackendDateTime(filters.timeRange?.[0]);
      query.end = toBackendDateTime(filters.timeRange?.[1]);
      const res = await operationLogApi.list(query);
      const page = res.data.data;
      const records = page.records || [];
      setData(records);
      setTotal(page.total || 0);
      setLoadError(null);
      // 模块没有固定枚举（后端取控制器 Tag/类名），从已加载数据聚合候选值，避免用户手输。
      setModuleOptions((current) => {
        const merged = new Map(current.map((item) => [item.value, item.label]));
        records.forEach((record: LogItem) => {
          if (record.module) {
            merged.set(record.module, record.module);
          }
        });
        return Array.from(merged, ([value, label]) => ({ value, label }))
          .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
      });
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载操作日志失败'));
    } finally {
      setLoading(false);
    }
  }, [filters, params]);

  usePageActivation(() => { void fetchData(); });

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const hasFilters = Boolean(
    filters.module || filters.operationType || filters.username || filters.status !== undefined || filters.timeRange,
  );

  const applyFilters = () => {
    setFilters({
      module: draftFilters.module,
      operationType: draftFilters.operationType,
      username: draftFilters.username?.trim() || undefined,
      status: draftFilters.status,
      timeRange: draftFilters.timeRange,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({});
    setFilters({});
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const handleClean = () => {
    const cutoff = dayjs().subtract(CLEAN_RETENTION_DAYS, 'day').format('YYYY-MM-DD HH:mm:ss');
    Modal.confirm({
      title: `清理 ${CLEAN_RETENTION_DAYS} 天前的操作日志`,
      content: `将永久删除 ${cutoff} 之前的操作日志，删除后不可恢复，且不受当前筛选条件限制。`,
      okText: '确认清理',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await operationLogApi.clean(CLEAN_RETENTION_DAYS);
          message.success(`已清理 ${res.data.data ?? 0} 条过期日志`);
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '清理操作日志失败'));
          throw error;
        }
      },
    });
  };

  const columns: ColumnsType<LogItem> = [
    { title: '用户', dataIndex: 'username', width: 110, ellipsis: true, render: (value: string) => value || '-' },
    { title: '模块', dataIndex: 'module', width: 120, ellipsis: true, render: (value: string) => value || '-' },
    {
      title: '类型',
      dataIndex: 'operationType',
      width: 90,
      render: (value: string) => <Tag color={typeColors[value]}>{typeLabels[value] || value || '-'}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: 200,
      render: (value: string) => value ? <CopyText text={value} ellipsis /> : '-',
    },
    {
      title: 'URL',
      dataIndex: 'requestUrl',
      width: 240,
      render: (value: string) => value ? <CopyText text={value} ellipsis /> : '-',
    },
    { title: 'IP', dataIndex: 'ip', width: 140, render: (value: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (value: number) => <Tag color={value === 0 ? 'success' : 'error'}>{value === 0 ? '成功' : '失败'}</Tag>,
    },
    { title: '耗时', dataIndex: 'costMs', width: 90, render: (value: number) => (value != null ? `${value}ms` : '-') },
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_: unknown, record: LogItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setDetailRecord(record);
            setDetailOpen(true);
          }}
        >
          详情
        </Button>
      ),
    },
  ];

  const requestPayload = useMemo(() => prettyPayload(detailRecord?.requestParams), [detailRecord?.requestParams]);
  const responsePayload = useMemo(() => prettyPayload(detailRecord?.responseResult), [detailRecord?.responseResult]);

  return (
    <div>
      <PageHeader
        title="操作日志"
        description={`共 ${total} 条操作记录`}
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>
              刷新
            </Button>
            <Button danger icon={<ClearOutlined />} onClick={handleClean}>
              清理过期
            </Button>
          </Space>
        )}
      />

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="操作日志加载失败"
          description={loadError}
          action={(
            <Button size="small" onClick={() => void fetchData()} loading={loading}>
              重试
            </Button>
          )}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {/* Filters */}
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Select
            className="ff-query-field"
            placeholder="模块"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 150 }}
            value={draftFilters.module}
            onChange={(value: string | undefined) => setDraftFilters((current) => ({ ...current, module: value }))}
            options={moduleOptions}
            notFoundContent={<span style={{ fontSize: 12, color: '#94a3b8' }}>当前已加载日志中暂无可选模块</span>}
          />
          <Select
            className="ff-query-field"
            placeholder="操作类型"
            allowClear
            style={{ width: 120 }}
            value={draftFilters.operationType}
            onChange={(value: string | undefined) => setDraftFilters((current) => ({ ...current, operationType: value }))}
            options={typeOptions}
          />
          <Input
            className="ff-query-field"
            placeholder="用户名"
            allowClear
            style={{ width: 140 }}
            value={draftFilters.username}
            onChange={(event) => setDraftFilters((current) => ({ ...current, username: event.target.value }))}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            placeholder="状态"
            allowClear
            style={{ width: 100 }}
            value={draftFilters.status}
            onChange={(value: number | undefined) => setDraftFilters((current) => ({ ...current, status: value }))}
            options={[{ value: 0, label: '成功' }, { value: 1, label: '失败' }]}
          />
          <RangePicker
            className="ff-query-field"
            showTime
            allowClear
            value={draftFilters.timeRange}
            onChange={(values) => {
              const [start, end] = values ?? [];
              setDraftFilters((current) => ({
                ...current,
                timeRange: start && end ? [start, end] : undefined,
              }));
            }}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1400 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={hasFilters}
                onClearFilters={resetFilters}
                emptyText="暂无操作日志"
                filteredText="没有符合当前筛选条件的操作日志"
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
        title="操作日志详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        {detailRecord ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="用户" span={2}>
                {detailRecord.username ? <CopyText text={detailRecord.username} strong /> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="模块">{detailRecord.module || '-'}</Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag color={typeColors[detailRecord.operationType]}>
                  {typeLabels[detailRecord.operationType] || detailRecord.operationType || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {detailRecord.description ? <CopyText text={detailRecord.description} /> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="请求方法">{detailRecord.requestMethod || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={detailRecord.status === 0 ? 'success' : 'error'}>
                  {detailRecord.status === 0 ? '成功' : '失败'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="请求地址" span={2}>
                {detailRecord.requestUrl ? <CopyText text={detailRecord.requestUrl} /> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="客户端 IP">
                {detailRecord.ip ? <CopyText text={detailRecord.ip} /> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {detailRecord.costMs != null ? `${detailRecord.costMs} ms` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="User-Agent" span={2}>
                {detailRecord.userAgent ? <CopyText text={detailRecord.userAgent} ellipsis /> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="时间" span={2}>{formatDateTime(detailRecord.createdAt)}</Descriptions.Item>
              {detailRecord.errorMsg ? (
                <Descriptions.Item label="错误信息" span={2}>
                  <CopyText text={detailRecord.errorMsg} style={{ color: '#ff4d4f' }} />
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            <Card
              size="small"
              title="请求参数"
              extra={detailRecord.requestParams ? <CopyText text={detailRecord.requestParams}>复制</CopyText> : null}
            >
              <pre style={{ margin: 0, background: '#f8fafc', padding: 8, borderRadius: 6, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                {requestPayload}
              </pre>
            </Card>

            <Card
              size="small"
              title="响应结果"
              extra={detailRecord.responseResult ? <CopyText text={detailRecord.responseResult}>复制</CopyText> : null}
            >
              <pre style={{ margin: 0, background: '#f8fafc', padding: 8, borderRadius: 6, maxHeight: 200, overflow: 'auto', fontSize: 12 }}>
                {responsePayload}
              </pre>
            </Card>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
};

export default OperationLogPage;
