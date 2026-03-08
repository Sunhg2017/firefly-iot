import React, { useCallback, useEffect, useState } from 'react';
import { Popover, List, Typography, Button, Tag, Empty, Progress, Space, Badge, Tooltip, Segmented } from 'antd';
import {
  DownloadOutlined, DeleteOutlined, ThunderboltOutlined,
  ExportOutlined, ImportOutlined, SyncOutlined, AppstoreOutlined,
  CloseCircleOutlined, CheckCircleOutlined, ClockCircleOutlined,
  LoadingOutlined, FileExcelOutlined,
} from '@ant-design/icons';
import { asyncTaskApi } from '../services/api';

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

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ExportCenterDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<AsyncTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { pageNum: 1, pageSize: 15 };
      if (filter !== 'ALL') params.taskType = filter;
      const res = await asyncTaskApi.mine(params);
      setTasks(res.data.data?.records ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (open) fetchTasks();
  }, [open, fetchTasks]);

  useEffect(() => {
    if (!open) return;
    const hasPending = tasks.some((t) => t.status === 'PENDING' || t.status === 'PROCESSING');
    if (!hasPending) return;
    const timer = setInterval(fetchTasks, 5000);
    return () => clearInterval(timer);
  }, [open, tasks, fetchTasks]);

  const handleDownload = (task: AsyncTaskItem) => {
    window.open(asyncTaskApi.download(task.id) as unknown as string, '_blank');
  };

  const handleCancel = async (id: number) => {
    try {
      await asyncTaskApi.cancel(id);
      fetchTasks();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: number) => {
    try {
      await asyncTaskApi.delete(id);
      fetchTasks();
    } catch { /* ignore */ }
  };

  const pendingCount = tasks.filter((t) => t.status === 'PENDING' || t.status === 'PROCESSING').length;

  const renderItem = (item: AsyncTaskItem) => {
    const st = statusMap[item.status] || { color: 'default', label: item.status, icon: null };
    const tt = taskTypeMap[item.taskType] || { label: item.taskType, icon: <ThunderboltOutlined />, color: '#8c8c8c' };

    const actions: React.ReactNode[] = [];
    if (item.status === 'COMPLETED' && item.resultUrl) {
      actions.push(
        <Tooltip key="dl" title="下载文件">
          <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(item)} />
        </Tooltip>
      );
    }
    if (item.status === 'FAILED' && item.resultUrl && item.taskType === 'IMPORT') {
      actions.push(
        <Tooltip key="err" title="下载错误清单">
          <Button type="link" size="small" style={{ color: '#ef4444' }} icon={<FileExcelOutlined />} onClick={() => handleDownload(item)} />
        </Tooltip>
      );
    }
    if (item.status === 'PENDING' || item.status === 'PROCESSING') {
      actions.push(
        <Tooltip key="cancel" title="取消">
          <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={() => handleCancel(item.id)} />
        </Tooltip>
      );
    }
    actions.push(
      <Tooltip key="del" title="删除">
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
      </Tooltip>
    );

    return (
      <List.Item key={item.id} actions={actions}>
        <List.Item.Meta
          avatar={
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: `${tt.color}12`, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 15, color: tt.color,
            }}>
              {tt.icon}
            </div>
          }
          title={
            <Space size={4}>
              <Tag color={st.color} style={{ marginRight: 0, fontSize: 10 }}>
                {st.label}
              </Tag>
              <Typography.Text style={{ fontSize: 13 }} ellipsis>{item.taskName}</Typography.Text>
            </Space>
          }
          description={
            <div>
              {(item.status === 'PENDING' || item.status === 'PROCESSING') && (
                <Progress percent={item.progress || 0} size="small" status="active" style={{ marginBottom: 2 }} />
              )}
              {item.status === 'COMPLETED' && (
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {item.totalRows != null ? `${item.totalRows} 条` : ''}
                  {item.resultSize ? ` · ${formatFileSize(item.resultSize)}` : ''}
                  {item.fileFormat ? ` · ${item.fileFormat}` : ''}
                </Typography.Text>
              )}
              {item.status === 'FAILED' && (
                <Typography.Text type="danger" style={{ fontSize: 11 }}>
                  {item.errorMessage || '任务失败'}
                </Typography.Text>
              )}
              {item.status === 'CANCELLED' && (
                <Typography.Text type="warning" style={{ fontSize: 11 }}>已取消</Typography.Text>
              )}
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                {tt.label}{item.bizType ? ` · ${item.bizType}` : ''} · {item.createdAt}
              </Typography.Text>
            </div>
          }
        />
      </List.Item>
    );
  };

  const content = (
    <div style={{ width: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 10px', borderBottom: '1px solid #f1f5f9' }}>
        <Typography.Text strong style={{ fontSize: 15, color: '#0f172a' }}>任务中心</Typography.Text>
        {pendingCount > 0 && (
          <Tag color="processing">{pendingCount} 个任务进行中</Tag>
        )}
      </div>
      <div style={{ padding: '10px 0 6px' }}>
        <Segmented
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as string)}
          options={[
            { label: '全部', value: 'ALL' },
            { label: '导出', value: 'EXPORT' },
            { label: '导入', value: 'IMPORT' },
            { label: '同步', value: 'SYNC' },
            { label: '批处理', value: 'BATCH' },
          ]}
        />
      </div>
      <List
        loading={loading}
        dataSource={tasks}
        renderItem={renderItem}
        locale={{ emptyText: <Empty description="暂无任务" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
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
      <Badge count={pendingCount} size="small" offset={[-4, 4]}>
        <ThunderboltOutlined style={{ fontSize: 18, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, transition: 'background 0.2s', color: '#475569' }} />
      </Badge>
    </Popover>
  );
};

export default ExportCenterDropdown;
