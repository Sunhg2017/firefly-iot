import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Modal, Progress, Row, Select, Space, Switch, Table, Tag, message } from 'antd';
import {
  DownloadOutlined, DeleteOutlined, ClearOutlined, ReloadOutlined,
  ExportOutlined, ImportOutlined, SyncOutlined, AppstoreOutlined,
  ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { asyncTaskApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

interface AsyncTaskItem {
  id: number;
  taskName: string;
  taskType: string;
  bizType: string;
  fileFormat: string;
  status: string;
  progress: number;
  resultUrl: string;
  resultSize: number;
  totalRows: number;
  errorMessage: string;
  createdAt: string;
  completedAt: string;
}

interface ExportPageFilters {
  taskType?: string;
  status?: string;
}

const statusLabels: Record<string, string> = { PENDING: '等待中', PROCESSING: '处理中', COMPLETED: '已完成', FAILED: '失败', CANCELLED: '已取消' };
const statusColors: Record<string, string> = { PENDING: 'default', PROCESSING: 'processing', COMPLETED: 'success', FAILED: 'error', CANCELLED: 'warning' };

const taskTypeLabels: Record<string, string> = { EXPORT: '导出', IMPORT: '导入', SYNC: '同步', BATCH: '批处理' };
const taskTypeColors: Record<string, string> = { EXPORT: '#4f46e5', IMPORT: '#10b981', SYNC: '#3b82f6', BATCH: '#f59e0b' };
const taskTypeIcons: Record<string, React.ReactNode> = {
  EXPORT: <ExportOutlined />, IMPORT: <ImportOutlined />, SYNC: <SyncOutlined />, BATCH: <AppstoreOutlined />,
};

const RUNNING_STATUSES = ['PENDING', 'PROCESSING'];
const CLEAN_RETENTION_DAYS = 7;

const ExportPage: React.FC = () => {
  const [data, setData] = useState<AsyncTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<ExportPageFilters>({});
  const [filters, setFilters] = useState<ExportPageFilters>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const fetchData = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await asyncTaskApi.list({ ...params, taskType: filters.taskType, status: filters.status });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
      setLoadError(null);
      setLastLoadedAt(new Date());
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载异步任务失败'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [filters, params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const hasRunningOnPage = useMemo(
    () => data.some((item) => RUNNING_STATUSES.includes(item.status)),
    [data],
  );

  /**
   * 有等待中/处理中任务时每 4 秒静默刷新一次进度；全部结束后 enabled 变为 false，轮询自动停止。
   * 用户可暂停轮询，暂停后仍可手动刷新。
   */
  const { paused, togglePaused } = useAutoRefresh(
    useCallback(() => fetchData({ silent: true }), [fetchData]),
    {
      intervalMs: 4000,
      enabled: hasRunningOnPage,
      immediate: false,
    },
  );

  const applyFilters = () => {
    setFilters({
      taskType: draftFilters.taskType,
      status: draftFilters.status,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({});
    setFilters({});
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const stats = useMemo(() => ({
    total,
    completed: data.filter((item) => item.status === 'COMPLETED').length,
    processing: data.filter((item) => RUNNING_STATUSES.includes(item.status)).length,
    failed: data.filter((item) => item.status === 'FAILED').length,
  }), [data, total]);

  const handleDelete = (record: AsyncTaskItem) => {
    Modal.confirm({
      title: `删除任务「${record.taskName}」？`,
      content: '删除后任务记录与已生成的结果文件将不可恢复。任务仍在执行时请先取消。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingId(record.id);
        try {
          await asyncTaskApi.delete(record.id);
          message.success('任务已删除');
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '删除任务失败'));
          throw error;
        } finally {
          setDeletingId(null);
        }
      },
    });
  };

  const handleCancel = (record: AsyncTaskItem) => {
    Modal.confirm({
      title: `取消任务「${record.taskName}」？`,
      content: '取消后任务立即终止，已生成的部分结果不可用且无法恢复。',
      okText: '确认取消任务',
      cancelText: '返回',
      okButtonProps: { danger: true },
      onOk: async () => {
        setCancellingId(record.id);
        try {
          await asyncTaskApi.cancel(record.id);
          message.success('任务已取消');
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '取消任务失败'));
          throw error;
        } finally {
          setCancellingId(null);
        }
      },
    });
  };

  const handleClean = () => {
    Modal.confirm({
      title: `清理 ${CLEAN_RETENTION_DAYS} 天前的任务记录`,
      content: `将删除创建时间早于 ${CLEAN_RETENTION_DAYS} 天且已结束（已完成/失败/已取消）的任务记录及其结果文件，删除后不可恢复；执行中的任务不会被清理。`,
      okText: '确认清理',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const res = await asyncTaskApi.clean();
          message.success(`已清理 ${res.data.data ?? 0} 条过期任务`);
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '清理过期任务失败'));
          throw error;
        }
      },
    });
  };

  const buildDownloadUrl = (id: number): string => `${window.location.origin}${asyncTaskApi.download(id)}`;

  const handleDownload = (record: AsyncTaskItem) => {
    if (!record.resultUrl) {
      message.warning('当前任务没有可下载的结果');
      return;
    }
    if (record.status !== 'COMPLETED' && record.status !== 'FAILED') {
      message.warning('任务还未生成可下载结果');
      return;
    }
    window.open(asyncTaskApi.download(record.id), '_blank');
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const columns: ColumnsType<AsyncTaskItem> = [
    {
      title: '任务名称',
      dataIndex: 'taskName',
      width: 220,
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    {
      title: '任务编号',
      dataIndex: 'id',
      width: 110,
      render: (value: number) => <CopyText text={value} secondary />,
    },
    {
      title: '任务类型',
      dataIndex: 'taskType',
      width: 110,
      render: (value: string) => (
        <Tag style={{ color: taskTypeColors[value] || '#8c8c8c', borderColor: taskTypeColors[value] || '#d9d9d9', background: `${taskTypeColors[value] || '#8c8c8c'}10` }}>
          {taskTypeIcons[value]} {taskTypeLabels[value] || value}
        </Tag>
      ),
    },
    { title: '业务类型', dataIndex: 'bizType', width: 120, ellipsis: true, render: (value: string) => value || '-' },
    { title: '格式', dataIndex: 'fileFormat', width: 80, render: (value: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (value: string, record: AsyncTaskItem) => (
        <Space direction="vertical" size={0}>
          <Tag color={statusColors[value]}>{statusLabels[value] || value}</Tag>
          {RUNNING_STATUSES.includes(value) && (
            <Progress percent={record.progress || 0} size="small" status="active" style={{ width: 80 }} />
          )}
        </Space>
      ),
    },
    { title: '行数', dataIndex: 'totalRows', width: 90, render: (value: number) => (value ?? '-') },
    { title: '文件大小', dataIndex: 'resultSize', width: 110, render: (value: number) => formatSize(value) },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      width: 220,
      render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      width: 300,
      fixed: 'right',
      render: (_: unknown, record: AsyncTaskItem) => (
        <Space size="small">
          {record.status === 'COMPLETED' && record.resultUrl && (
            <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>
              下载
            </Button>
          )}
          {record.status === 'FAILED' && record.resultUrl && record.taskType === 'IMPORT' && (
            <Button
              type="link"
              size="small"
              icon={<FileExcelOutlined />}
              style={{ color: '#ef4444' }}
              onClick={() => handleDownload(record)}
            >
              错误清单
            </Button>
          )}
          {record.resultUrl && (record.status === 'COMPLETED' || record.status === 'FAILED') ? (
            <CopyText text={buildDownloadUrl(record.id)}>
              <span style={{ fontSize: 12 }}>结果链接</span>
            </CopyText>
          ) : null}
          {RUNNING_STATUSES.includes(record.status) && (
            <Button
              type="link"
              size="small"
              icon={<CloseCircleOutlined />}
              loading={cancellingId === record.id}
              onClick={() => handleCancel(record)}
            >
              取消
            </Button>
          )}
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={deletingId === record.id}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="异步任务中心"
        description={`共 ${total} 条任务记录`}
        extra={(
          <Space wrap>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {lastLoadedAt ? `最后刷新 ${formatDateTime(lastLoadedAt)}` : '尚未刷新'}
            </span>
            <Space size={6}>
              <Switch
                size="small"
                checked={!paused && hasRunningOnPage}
                disabled={!hasRunningOnPage}
                onChange={togglePaused}
                aria-label="自动刷新任务进度"
              />
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {hasRunningOnPage ? '自动刷新（4 秒）' : '当前页无进行中任务，已停止自动刷新'}
              </span>
            </Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>
              刷新
            </Button>
            <Button icon={<ClearOutlined />} danger onClick={handleClean}>
              清理过期
            </Button>
          </Space>
        )}
      />

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="异步任务加载失败"
          description={loadError}
          action={(
            <Button size="small" onClick={() => void fetchData()} loading={loading}>
              重试
            </Button>
          )}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {/* Stat summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '任务总数', value: stats.total, hint: '全部', icon: <ThunderboltOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '已完成', value: stats.completed, hint: '当前页', icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '进行中', value: stats.processing, hint: '当前页', icon: <ClockCircleOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '失败', value: stats.failed, hint: '当前页', icon: <CloseCircleOutlined />, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
        ].map((stat) => (
          <Col xs={12} sm={6} key={stat.title}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: stat.color }}>
                  {stat.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{stat.title}（{stat.hint}）</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{stat.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Select
            className="ff-query-field"
            placeholder="任务类型"
            allowClear
            style={{ width: 140 }}
            value={draftFilters.taskType}
            onChange={(value) => { setDraftFilters((current) => ({ ...current, taskType: value })); }}
            options={[
              { value: 'EXPORT', label: '导出' },
              { value: 'IMPORT', label: '导入' },
              { value: 'SYNC', label: '同步' },
              { value: 'BATCH', label: '批处理' },
            ]}
          />
          <Select
            className="ff-query-field"
            placeholder="任务状态"
            allowClear
            style={{ width: 120 }}
            value={draftFilters.status}
            onChange={(value) => { setDraftFilters((current) => ({ ...current, status: value })); }}
            options={[
              { value: 'PENDING', label: '等待中' },
              { value: 'PROCESSING', label: '处理中' },
              { value: 'COMPLETED', label: '已完成' },
              { value: 'FAILED', label: '失败' },
              { value: 'CANCELLED', label: '已取消' },
            ]}
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
          scroll={{ x: 1800 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={Boolean(filters.taskType || filters.status)}
                onClearFilters={resetFilters}
                emptyText="暂无异步任务"
                filteredText="没有符合当前筛选条件的任务"
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
    </div>
  );
};

export default ExportPage;
