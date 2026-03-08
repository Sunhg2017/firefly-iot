import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Tag, Input, Select, DatePicker, Popconfirm, Modal, Card } from 'antd';
import { ReloadOutlined, ClearOutlined, EyeOutlined } from '@ant-design/icons';
import { operationLogApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

const { RangePicker } = DatePicker;

interface LogItem {
  id: number; tenantId: number; userId: number; username: string; module: string;
  operationType: string; description: string; method: string; requestUrl: string;
  requestMethod: string; requestParams: string; responseResult: string;
  ip: string; userAgent: string; status: number; errorMsg: string; costMs: number; createdAt: string;
}

const typeColors: Record<string, string> = { CREATE: 'green', UPDATE: 'blue', DELETE: 'red', QUERY: 'default', EXPORT: 'purple', LOGIN: 'cyan', LOGOUT: 'orange' };

const OperationLogPage: React.FC = () => {
  const [data, setData] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });
  const [module, setModule] = useState<string | undefined>(undefined);
  const [operationType, setOperationType] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState('');
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);
  const [timeRange, setTimeRange] = useState<[string, string] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<LogItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { ...params };
      if (module) query.module = module;
      if (operationType) query.operationType = operationType;
      if (username) query.username = username;
      if (statusFilter !== undefined) query.status = statusFilter;
      if (timeRange) { query.start = timeRange[0]; query.end = timeRange[1]; }
      const res = await operationLogApi.list(query);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const handleClean = async () => {
    const res = await operationLogApi.clean(90);
    message.success(`已清理 ${res.data.data} 条过期日志`);
    fetchData();
  };

  const columns: ColumnsType<LogItem> = [
    { title: '用户', dataIndex: 'username', width: 90, render: (v: string) => v || '-' },
    { title: '模块', dataIndex: 'module', width: 100 },
    { title: '类型', dataIndex: 'operationType', width: 80, render: (v: string) => <Tag color={typeColors[v]}>{v}</Tag> },
    { title: '描述', dataIndex: 'description', width: 180, ellipsis: true },
    { title: 'URL', dataIndex: 'requestUrl', width: 200, ellipsis: true },
    { title: 'IP', dataIndex: 'ip', width: 120 },
    { title: '状态', dataIndex: 'status', width: 70, render: (v: number) => <Tag color={v === 0 ? 'success' : 'error'}>{v === 0 ? '成功' : '失败'}</Tag> },
    { title: '耗时', dataIndex: 'costMs', width: 80, render: (v: number) => v != null ? `${v}ms` : '-' },
    { title: '时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 70, fixed: 'right',
      render: (_: unknown, record: LogItem) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setDetailRecord(record); setDetailOpen(true); }}>详情</Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="操作日志"
        description={`共 ${total} 条操作记录`}
        extra={<Popconfirm title="清理90天前的过期日志？" onConfirm={handleClean}><Button icon={<ClearOutlined />} danger size="small">清理过期</Button></Popconfirm>}
      />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input placeholder="模块" allowClear style={{ width: 110 }} size="small" value={module} onChange={(e) => setModule(e.target.value || undefined)} />
          <Select placeholder="操作类型" allowClear style={{ width: 110 }} size="small" value={operationType} onChange={setOperationType}
            options={[{ value: 'CREATE', label: '创建' }, { value: 'UPDATE', label: '更新' }, { value: 'DELETE', label: '删除' }, { value: 'QUERY', label: '查询' }, { value: 'EXPORT', label: '导出' }, { value: 'LOGIN', label: '登录' }, { value: 'LOGOUT', label: '登出' }]} />
          <Input placeholder="用户名" allowClear style={{ width: 110 }} size="small" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Select placeholder="状态" allowClear style={{ width: 90 }} size="small" value={statusFilter} onChange={setStatusFilter}
            options={[{ value: 0, label: '成功' }, { value: 1, label: '失败' }]} />
          <RangePicker showTime size="small" onChange={(_: unknown, dateStrings: [string, string]) => {
            if (dateStrings[0] && dateStrings[1]) setTimeRange(dateStrings);
            else setTimeRange(null);
          }} />
          <Button icon={<ReloadOutlined />} size="small" type="primary" onClick={() => { setParams({ ...params, pageNum: 1 }); fetchData(); }}>查询</Button>
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1200 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="操作日志详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={640}>
        {detailRecord && (
          <div style={{ fontSize: 13 }}>
            <p><b>用户：</b>{detailRecord.username} (ID: {detailRecord.userId})</p>
            <p><b>模块：</b>{detailRecord.module} | <b>类型：</b>{detailRecord.operationType}</p>
            <p><b>描述：</b>{detailRecord.description}</p>
            <p><b>方法：</b>{detailRecord.method}</p>
            <p><b>请求：</b>{detailRecord.requestMethod} {detailRecord.requestUrl}</p>
            <p><b>IP：</b>{detailRecord.ip}</p>
            <p><b>状态：</b><Tag color={detailRecord.status === 0 ? 'success' : 'error'}>{detailRecord.status === 0 ? '成功' : '失败'}</Tag> <b>耗时：</b>{detailRecord.costMs}ms</p>
            {detailRecord.errorMsg && <p><b>错误：</b><span style={{ color: 'red' }}>{detailRecord.errorMsg}</span></p>}
            <p><b>请求参数：</b></p>
            <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>{detailRecord.requestParams || '-'}</pre>
            <p><b>响应结果：</b></p>
            <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto', fontSize: 12 }}>{detailRecord.responseResult || '-'}</pre>
            <p><b>时间：</b>{detailRecord.createdAt}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OperationLogPage;
