import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Empty, List, Popconfirm, Popover, Progress, Segmented, Space, Tag, Tooltip, Typography, message } from 'antd';
import {
  DownloadOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  ExportOutlined,
  ImportOutlined,
  SyncOutlined,
  AppstoreOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  FileExcelOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { asyncTaskApi } from '../services/api';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/datetime';

interface AsyncTaskItem {
  id: number;
  taskName: string;
  taskType: string;
  bizType: string | null;
  fileFormat: string | null;
  status: string;
  progress: number;
  totalRows: number | null;
  resultUrl: string | null;
  resultSize: number | null;
  errorMessage: string | null;
  createdAt: string;
}

const statusMap: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  PENDING: { color: 'default', label: '排队中', icon: <ClockCircleOutlined /> },
  PROCESSING: { color: 'processing', label: '执行中', icon: <LoadingOutlined spin /> },
  COMPLETED: { color: 'success', label: '已完成', icon: <CheckCircleOutlined /> },
  FAILED: { color: 'error', label: '失败', icon: <CloseCircleOutlined /> },
  CANCELLED: { color: 'warning', label: '已取消', icon: <CloseCircleOutlined /> },
};

const taskTypeMap: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  EXPORT: { label: '导出', icon: <ExportOutlined />, color: '#4f46e5' },
  IMPORT: { label: '导入', icon: <ImportOutlined />, color: '#10b981' },
  SYNC: { label: '同步', icon: <SyncOutlined />, color: '#3b82f6' },
  BATCH: { label: '批处理', icon: <AppstoreOutlined />, color: '#f59e0b' },
};

const ACTIVE_STATUSES = ['PENDING', 'PROCESSING'];

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Async task centre. The badge is driven by an independent lightweight poll so it keeps
 * updating while the panel is closed, which is what users expect after starting an export.
 */
const ExportCenterDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<AsyncTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [pendingCount, setPendingCount] = useState(0);
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, unknown> = { pageNum: 1, pageSize: 15 };
      if (filter !== 'ALL') params.taskType = filter;
      const res = await asyncTaskApi.mine(params);
      setTasks(res.data.data?.records ?? []);
    } catch (error) {
      setTasks([]);
      setLoadError(getErrorMessage(error, '加载任务列表失败'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchPendingCount = useCallback(async () => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    try {
      const res = await asyncTaskApi.mine({ pageNum: 1, pageSize: 20 });
      const records = (res.data.data?.records ?? []) as AsyncTaskItem[];
      setPendingCount(records.filter((task) => ACTIVE_STATUSES.includes(task.status)).length);
    } catch {
      // Badge polling is best-effort; the panel shows an explicit error with retry.
    }
  }, []);

  useEffect(() => {
    void fetchPendingCount();
    const timer = window.setInterval(() => {
      void fetchPendingCount();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [fetchPendingCount]);

  useEffect(() => {
    if (open) {
      void fetchTasks();
    }
  }, [fetchTasks, open]);

  useEffect(() => {
    if (!open) return undefined;
    const hasPending = tasks.some((task) => ACTIVE_STATUSES.includes(task.status));
    if (!hasPending) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchTasks();
        void fetchPendingCount();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchPendingCount, fetchTasks, open, tasks]);

  const handleDownload = (task: AsyncTaskItem) => {
    window.open(asyncTaskApi.download(task.id) as unknown as string, '_blank', 'noopener');
  };

  const handleCancel = async (task: AsyncTaskItem) => {
    setActingId(task.id);
    try {
      await asyncTaskApi.cancel(task.id);
      message.success('任务已取消');
      await Promise.all([fetchTasks(), fetchPendingCount()]);
    } catch (error) {
      message.error(getErrorMessage(error, '取消任务失败'));
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (task: AsyncTaskItem) => {
    setActingId(task.id);
    try {
      await asyncTaskApi.delete(task.id);
      message.success('任务记录已删除');
      await Promise.all([fetchTasks(), fetchPendingCount()]);
    } catch (error) {
      message.error(getErrorMessage(error, '删除任务失败'));
    } finally {
      setActingId(null);
    }
  };

  const renderItem = (item: AsyncTaskItem) => {
    const status = statusMap[item.status] || { color: 'default', label: item.status, icon: null };
    const taskType = taskTypeMap[item.taskType] || { label: item.taskType, icon: <ThunderboltOutlined />, color: '#64748b' };
    const acting = actingId === item.id;

    const actions: React.ReactNode[] = [];
    if (item.status === 'COMPLETED' && item.resultUrl) {
      actions.push(
        <Tooltip key="dl" title="下载结果文件">
          <Button
            type="link"
            size="small"
            aria-label={`下载 ${item.taskName} 的结果文件`}
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(item)}
          />
        </Tooltip>,
      );
    }
    if (item.status === 'FAILED' && item.resultUrl && item.taskType === 'IMPORT') {
      actions.push(
        <Tooltip key="err" title="下载错误清单">
          <Button
            type="link"
            size="small"
            aria-label={`下载 ${item.taskName} 的错误清单`}
            style={{ color: '#dc2626' }}
            icon={<FileExcelOutlined />}
            onClick={() => handleDownload(item)}
          />
        </Tooltip>,
      );
    }
    if (ACTIVE_STATUSES.includes(item.status)) {
      actions.push(
        <Popconfirm
          key="cancel"
          title="取消该任务？"
          description="取消后任务会停止执行，已生成的部分结果可能无法使用。"
          okText="取消任务"
          cancelText="返回"
          onConfirm={() => void handleCancel(item)}
        >
          <Tooltip title="取消任务">
            <Button
              type="link"
              size="small"
              loading={acting}
              aria-label={`取消 ${item.taskName}`}
              icon={<CloseCircleOutlined />}
            />
          </Tooltip>
        </Popconfirm>,
      );
    }
    actions.push(
      <Popconfirm
        key="del"
        title="删除任务记录？"
        description={ACTIVE_STATUSES.includes(item.status) ? '任务仍在执行，删除记录不会停止任务，请先取消。' : '仅删除任务记录，不会删除已生成的文件。'}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onConfirm={() => void handleDelete(item)}
      >
        <Tooltip title="删除记录">
          <Button
            type="link"
            size="small"
            danger
            loading={acting}
            aria-label={`删除 ${item.taskName}`}
            icon={<DeleteOutlined />}
          />
        </Tooltip>
      </Popconfirm>,
    );

    return (
      <List.Item key={item.id} actions={actions}>
        <List.Item.Meta
          avatar={(
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `${taskType.color}12`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              color: taskType.color,
            }}>
              {taskType.icon}
            </div>
          )}
          title={(
            <Space size={4}>
              <Tag color={status.color} style={{ marginRight: 0 }}>
                {status.label}
              </Tag>
              <Typography.Text style={{ fontSize: 13 }} ellipsis>{item.taskName}</Typography.Text>
            </Space>
          )}
          description={(
            <div>
              {ACTIVE_STATUSES.includes(item.status) ? (
                <Progress percent={item.progress || 0} size="small" status="active" style={{ marginBottom: 2 }} />
              ) : null}
              {item.status === 'COMPLETED' ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {item.totalRows != null ? `${item.totalRows} 条` : ''}
                  {item.resultSize ? ` · ${formatFileSize(item.resultSize)}` : ''}
                  {item.fileFormat ? ` · ${item.fileFormat}` : ''}
                </Typography.Text>
              ) : null}
              {item.status === 'FAILED' ? (
                <Typography.Text type="danger" style={{ fontSize: 12 }}>
                  {item.errorMessage || '任务失败'}
                </Typography.Text>
              ) : null}
              {item.status === 'CANCELLED' ? (
                <Typography.Text type="warning" style={{ fontSize: 12 }}>已取消</Typography.Text>
              ) : null}
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {taskType.label}{item.bizType ? ` · ${item.bizType}` : ''} · {formatDateTime(item.createdAt)}
              </Typography.Text>
            </div>
          )}
        />
      </List.Item>
    );
  };

  const content = (
    <div style={{ width: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 10px', borderBottom: '1px solid #f1f5f9' }}>
        <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>任务中心</Typography.Text>
        <Space size={4}>
          {pendingCount > 0 ? <Tag color="processing">{pendingCount} 个任务进行中</Tag> : null}
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            aria-label="刷新任务列表"
            loading={loading}
            onClick={() => { void fetchTasks(); void fetchPendingCount(); }}
          />
        </Space>
      </div>
      <div style={{ padding: '10px 0 6px' }}>
        <Segmented
          size="small"
          value={filter}
          onChange={(value) => setFilter(value as string)}
          options={[
            { label: '全部', value: 'ALL' },
            { label: '导出', value: 'EXPORT' },
            { label: '导入', value: 'IMPORT' },
            { label: '同步', value: 'SYNC' },
            { label: '批处理', value: 'BATCH' },
          ]}
        />
      </div>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          message={loadError}
          action={<Button size="small" onClick={() => void fetchTasks()}>重试</Button>}
        />
      ) : null}
      <List
        loading={loading}
        dataSource={tasks}
        renderItem={renderItem}
        locale={{
          emptyText: (
            <Empty
              description={filter === 'ALL' ? '暂无任务' : '当前类型下暂无任务'}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        style={{ maxHeight: 440, overflow: 'auto' }}
      />
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      arrow={false}
    >
      <button
        type="button"
        className={open ? 'layout-header-quick-action layout-header-quick-action--active' : 'layout-header-quick-action'}
        aria-label="异步任务"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Badge count={pendingCount} size="small" offset={[-4, 4]}>
          <span className="layout-header-quick-action__icon">
            <ThunderboltOutlined />
          </span>
        </Badge>
        <span className="layout-header-quick-action__label">异步任务</span>
      </button>
    </Popover>
  );
};

export default ExportCenterDropdown;
