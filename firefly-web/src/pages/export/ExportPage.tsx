import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Space, message, Tag, Popconfirm, Card, Row, Col, Progress, Select } from 'antd';
import {
  DownloadOutlined, DeleteOutlined, ClearOutlined, ReloadOutlined,
  ExportOutlined, ImportOutlined, SyncOutlined, AppstoreOutlined,
  ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { asyncTaskApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

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

const statusLabels: Record<string, string> = { PENDING: '等待中', PROCESSING: '处理中', COMPLETED: '已完成', FAILED: '失败', CANCELLED: '已取消' };
const statusColors: Record<string, string> = { PENDING: 'default', PROCESSING: 'processing', COMPLETED: 'success', FAILED: 'error', CANCELLED: 'warning' };

const taskTypeLabels: Record<string, string> = { EXPORT: '导出', IMPORT: '导入', SYNC: '同步', BATCH: '批处理' };
const taskTypeColors: Record<string, string> = { EXPORT: '#4f46e5', IMPORT: '#10b981', SYNC: '#3b82f6', BATCH: '#f59e0b' };
const taskTypeIcons: Record<string, React.ReactNode> = {
  EXPORT: <ExportOutlined />, IMPORT: <ImportOutlined />, SYNC: <SyncOutlined />, BATCH: <AppstoreOutlined />,
};

const ExportPage: React.FC = () => {
  const [data, setData] = useState<AsyncTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [taskTypeFilter, setTaskTypeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await asyncTaskApi.list({ ...params, taskType: taskTypeFilter, status: statusFilter });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, taskTypeFilter, statusFilter]);

  const stats = useMemo(() => ({
    total,
    completed: data.filter((d) => d.status === 'COMPLETED').length,
    processing: data.filter((d) => d.status === 'PENDING' || d.status === 'PROCESSING').length,
    failed: data.filter((d) => d.status === 'FAILED').length,
  }), [data, total]);

  const handleDelete = async (id: number) => {
    await asyncTaskApi.delete(id); message.success('已删除'); fetchData();
  };

  const handleCancel = async (id: number) => {
    await asyncTaskApi.cancel(id); message.success('已取消'); fetchData();
  };

  const handleClean = async () => {
    const res = await asyncTaskApi.clean();
    message.success(`已清理 ${res.data.data} 条过期记录`);
    fetchData();
  };

  const handleDownload = (record: AsyncTaskItem) => {
    if (!record.resultUrl) { message.warning('当前任务没有可下载的结果'); return; }
    if (record.status !== 'COMPLETED' && record.status !== 'FAILED') { message.warning('任务还未生成可下载结果'); return; }
    window.open(asyncTaskApi.download(record.id) as unknown as string, '_blank');
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const columns: ColumnsType<AsyncTaskItem> = [
    { title: '任务名称', dataIndex: 'taskName', width: 200 },
    {
      title: '任务类型', dataIndex: 'taskType', width: 100,
      render: (v: string) => (
        <Tag style={{ color: taskTypeColors[v] || '#8c8c8c', borderColor: taskTypeColors[v] || '#d9d9d9', background: `${taskTypeColors[v] || '#8c8c8c'}10` }}>
          {taskTypeIcons[v]} {taskTypeLabels[v] || v}
        </Tag>
      ),
    },
    { title: '业务类型', dataIndex: 'bizType', width: 110, render: (v: string) => v || '-' },
    { title: '格式', dataIndex: 'fileFormat', width: 70, render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (v: string, record: AsyncTaskItem) => (
        <Space direction="vertical" size={0}>
          <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>
          {(v === 'PENDING' || v === 'PROCESSING') && (
            <Progress percent={record.progress || 0} size="small" status="active" style={{ width: 80 }} />
          )}
        </Space>
      ),
    },
    { title: '行数', dataIndex: 'totalRows', width: 80, render: (v: number) => v ?? '-' },
    { title: '文件大小', dataIndex: 'resultSize', width: 100, render: (v: number) => formatSize(v) },
    { title: '错误信息', dataIndex: 'errorMessage', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 200, fixed: 'right',
      render: (_: unknown, record: AsyncTaskItem) => (
        <Space size="small">
          {record.status === 'COMPLETED' && record.resultUrl && (
            <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record)}>下载</Button>
          )}
          {record.status === 'FAILED' && record.resultUrl && record.taskType === 'IMPORT' && (
            <Button type="link" size="small" icon={<FileExcelOutlined />} style={{ color: '#ef4444' }}
              onClick={() => handleDownload(record)}>错误清单</Button>
          )}
          {(record.status === 'PENDING' || record.status === 'PROCESSING') && (
            <Button type="link" size="small" icon={<CloseCircleOutlined />} onClick={() => handleCancel(record.id)}>取消</Button>
          )}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="异步任务中心"
        description={`共 ${total} 条任务记录，支持导出、导入、同步等异步任务`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            <Popconfirm title="清理7天前的过期任务记录？" onConfirm={handleClean}>
              <Button icon={<ClearOutlined />} danger>清理过期</Button>
            </Popconfirm>
          </Space>
        }
      />

      {/* Stat summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '任务总数', value: stats.total, icon: <ThunderboltOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '已完成', value: stats.completed, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '进行中', value: stats.processing, icon: <ClockCircleOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '失败', value: stats.failed, icon: <CloseCircleOutlined />, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
        ].map((s, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: s.color }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{s.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{s.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space>
          <Select
            placeholder="任务类型"
            allowClear
            style={{ width: 140 }}
            value={taskTypeFilter}
            onChange={(v) => { setTaskTypeFilter(v); setParams({ ...params, pageNum: 1 }); }}
            options={[
              { value: 'EXPORT', label: '导出' },
              { value: 'IMPORT', label: '导入' },
              { value: 'SYNC', label: '同步' },
              { value: 'BATCH', label: '批处理' },
            ]}
          />
          <Select
            placeholder="任务状态"
            allowClear
            style={{ width: 120 }}
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setParams({ ...params, pageNum: 1 }); }}
            options={[
              { value: 'PENDING', label: '等待中' },
              { value: 'PROCESSING', label: '处理中' },
              { value: 'COMPLETED', label: '已完成' },
              { value: 'FAILED', label: '失败' },
              { value: 'CANCELLED', label: '已取消' },
            ]}
          />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1400 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>
    </div>
  );
};

export default ExportPage;
