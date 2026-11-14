import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Descriptions, Input, Modal, Select, Space, Spin, Table, Tag } from 'antd';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { auditLogApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { getErrorMessage } from '../../utils/errors';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime, toIsoDateTime } from '../../utils/datetime';

const { RangePicker } = DatePicker;

interface AuditLogRecord {
  id: number;
  tenantId: number;
  userId: number;
  username: string;
  module: string;
  action: string;
  description: string;
  targetType: string;
  targetId: string;
  requestMethod: string;
  requestUrl: string;
  responseStatus: string;
  clientIp: string;
  duration: number;
  errorMessage: string;
  createdAt: string;
}

interface AuditLogFilters {
  keyword: string;
  module?: string;
  action?: string;
  responseStatus?: string;
  timeRange?: [Dayjs, Dayjs];
}

const moduleLabels: Record<string, string> = {
  TENANT: '租户管理', USER: '用户管理', ROLE: '角色权限', PROJECT: '项目管理',
  PRODUCT: '产品管理', DEVICE: '设备管理', RULE_ENGINE: '规则引擎', ALARM: '告警管理',
  OTA: 'OTA 升级', VIDEO: '视频监控', FILE: '文件管理', API_KEY: 'API 密钥',
  SYSTEM: '系统设置', AUTH: '认证授权',
};

const actionLabels: Record<string, string> = {
  CREATE: '创建', UPDATE: '更新', DELETE: '删除', QUERY: '查询',
  IMPORT: '导入', EXPORT: '导出', ENABLE: '启用', DISABLE: '禁用',
  LOGIN: '登录', LOGOUT: '登出', UPLOAD: '上传', DOWNLOAD: '下载',
  EXECUTE: '执行', APPROVE: '审批', REJECT: '驳回',
};

const actionColors: Record<string, string> = {
  CREATE: 'green', UPDATE: 'blue', DELETE: 'red', QUERY: 'default',
  ENABLE: 'cyan', DISABLE: 'orange', LOGIN: 'purple', LOGOUT: 'default',
  UPLOAD: 'geekblue', EXECUTE: 'volcano',
};

const methodColors: Record<string, string> = {
  GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red', PATCH: 'cyan',
};

/**
 * 审计查询 DTO 的时间字段是 LocalDateTime：带时区偏移的 ISO 串会被后端当成 UTC 墙上时间，
 * 因此先按统一工具生成 ISO 时刻，再转成本地时区的无偏移字面量提交。
 */
const toBackendDateTime = (value: Dayjs | null | undefined): string | undefined => {
  const iso = toIsoDateTime(value ? value.toDate() : null);
  return iso ? dayjs(iso).format('YYYY-MM-DDTHH:mm:ss') : undefined;
};

const EMPTY_FILTERS: AuditLogFilters = { keyword: '' };

const AuditLogPage: React.FC = () => {
  const [data, setData] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AuditLogFilters>(EMPTY_FILTERS);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<AuditLogRecord | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await auditLogApi.list({
        ...params,
        keyword: filters.keyword || undefined,
        module: filters.module,
        action: filters.action,
        responseStatus: filters.responseStatus,
        // AuditLogQueryDTO 已提供 startTime/endTime，按用户选择的范围过滤。
        startTime: toBackendDateTime(filters.timeRange?.[0]),
        endTime: toBackendDateTime(filters.timeRange?.[1]),
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
      setLoadError(null);
    } catch (error) {
      // 失败时保留上一次列表，避免日志“全部消失”造成误判。
      setLoadError(getErrorMessage(error, '加载审计日志失败'));
    } finally {
      setLoading(false);
    }
  }, [filters, params]);

  usePageActivation(() => { void fetchData(); });

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const hasFilters = Boolean(
    filters.keyword || filters.module || filters.action || filters.responseStatus || filters.timeRange,
  );

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      module: draftFilters.module,
      action: draftFilters.action,
      responseStatus: draftFilters.responseStatus,
      timeRange: draftFilters.timeRange,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const res = await auditLogApi.get(id);
      setDetailRecord(res.data.data);
    } catch (error) {
      setDetailError(getErrorMessage(error, '加载审计详情失败'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleViewDetail = (record: AuditLogRecord) => {
    setDetailId(record.id);
    setDetailRecord(null);
    setDetailError(null);
    setDetailOpen(true);
    void loadDetail(record.id);
  };

  const columns: ColumnsType<AuditLogRecord> = [
    { title: '时间', dataIndex: 'createdAt', width: 170, render: (value: string) => formatDateTime(value) },
    {
      title: '用户',
      dataIndex: 'username',
      width: 120,
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    { title: '模块', dataIndex: 'module', width: 120, render: (value: string) => <Tag>{moduleLabels[value] || value || '-'}</Tag> },
    { title: '操作', dataIndex: 'action', width: 90, render: (value: string) => <Tag color={actionColors[value]}>{actionLabels[value] || value || '-'}</Tag> },
    {
      title: '描述',
      dataIndex: 'description',
      width: 220,
      render: (value: string) => value ? <CopyText text={value} ellipsis /> : '-',
    },
    { title: '方法', dataIndex: 'requestMethod', width: 80, render: (value: string) => (value ? <Tag color={methodColors[value]}>{value}</Tag> : '-') },
    {
      title: '请求路径',
      dataIndex: 'requestUrl',
      width: 260,
      render: (value: string) => value ? <CopyText text={value} ellipsis /> : '-',
    },
    {
      title: '状态',
      dataIndex: 'responseStatus',
      width: 90,
      render: (value: string) => <Tag color={value === 'SUCCESS' ? 'success' : 'error'}>{value === 'SUCCESS' ? '成功' : '失败'}</Tag>,
    },
    { title: '耗时', dataIndex: 'duration', width: 90, render: (value: number) => (value != null ? `${value}ms` : '-') },
    { title: 'IP', dataIndex: 'clientIp', width: 140, render: (value: string) => value || '-' },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_: unknown, record: AuditLogRecord) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
          详情
        </Button>
      ),
    },
  ];

  const moduleOptions = Object.entries(moduleLabels).map(([value, label]) => ({ value, label }));
  const actionOptions = Object.entries(actionLabels).map(([value, label]) => ({ value, label }));

  const targetTypeLabel = detailRecord
    ? moduleLabels[(detailRecord.targetType || '').toUpperCase()] || detailRecord.targetType || '-'
    : '-';

  return (
    <div>
      <PageHeader
        title="审计日志"
        description={`共 ${total} 条审计记录`}
        extra={(
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>
            刷新
          </Button>
        )}
      />

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="审计日志加载失败"
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
          <Input
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索用户/描述/路径"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => {
              setDraftFilters((current) => ({ ...current, keyword: event.target.value }));
            }}
            onPressEnter={applyFilters}
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
          <Select
            className="ff-query-field"
            placeholder="模块"
            allowClear
            style={{ width: 130 }}
            options={moduleOptions}
            value={draftFilters.module}
            onChange={(value: string | undefined) => {
              setDraftFilters((current) => ({ ...current, module: value }));
            }}
          />
          <Select
            className="ff-query-field"
            placeholder="操作"
            allowClear
            style={{ width: 110 }}
            options={actionOptions}
            value={draftFilters.action}
            onChange={(value: string | undefined) => {
              setDraftFilters((current) => ({ ...current, action: value }));
            }}
          />
          <Select
            className="ff-query-field"
            placeholder="状态"
            allowClear
            style={{ width: 100 }}
            value={draftFilters.responseStatus}
            options={[{ value: 'SUCCESS', label: '成功' }, { value: 'FAILED', label: '失败' }]}
            onChange={(value: string | undefined) => {
              setDraftFilters((current) => ({ ...current, responseStatus: value }));
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
          scroll={{ x: 1600 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={hasFilters}
                onClearFilters={resetFilters}
                emptyText="暂无审计记录"
                filteredText="没有符合当前筛选条件的审计记录"
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

      <Modal
        title="审计日志详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        ) : null}

        {detailError && !detailLoading ? (
          <Alert
            type="error"
            showIcon
            message="加载详情失败"
            description={detailError}
            action={(
              <Button
                size="small"
                loading={detailLoading}
                onClick={() => {
                  if (detailId !== null) {
                    void loadDetail(detailId);
                  }
                }}
              >
                重试
              </Button>
            )}
          />
        ) : null}

        {detailRecord && !detailLoading ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="用户" span={2}>
              {detailRecord.username ? (
                <CopyText text={detailRecord.username} strong />
              ) : (
                <Space size={6}>
                  <span>未记录用户名</span>
                  {detailRecord.userId ? <CopyText text={detailRecord.userId} secondary /> : null}
                </Space>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="时间">{formatDateTime(detailRecord.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="模块">{moduleLabels[detailRecord.module] || detailRecord.module || '-'}</Descriptions.Item>
            <Descriptions.Item label="操作">{actionLabels[detailRecord.action] || detailRecord.action || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={detailRecord.responseStatus === 'SUCCESS' ? 'success' : 'error'}>
                {detailRecord.responseStatus === 'SUCCESS' ? '成功' : '失败'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {detailRecord.description ? <CopyText text={detailRecord.description} /> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="请求" span={2}>
              <CopyText text={`${detailRecord.requestMethod || '-'} ${detailRecord.requestUrl || ''}`.trim()} />
            </Descriptions.Item>
            <Descriptions.Item label="操作对象">{targetTypeLabel}</Descriptions.Item>
            <Descriptions.Item label="对象编号">
              {detailRecord.targetId ? <CopyText text={detailRecord.targetId} secondary /> : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="客户端 IP">{detailRecord.clientIp ? <CopyText text={detailRecord.clientIp} /> : '-'}</Descriptions.Item>
            <Descriptions.Item label="耗时">{detailRecord.duration != null ? `${detailRecord.duration} ms` : '-'}</Descriptions.Item>
            {detailRecord.errorMessage ? (
              <Descriptions.Item label="错误信息" span={2}>
                <CopyText text={detailRecord.errorMessage} style={{ color: '#ff4d4f' }} />
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label="日志编号" span={2}>
              <CopyText text={detailRecord.id} secondary />
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  );
};

export default AuditLogPage;
