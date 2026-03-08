import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Tag, Input, Select, DatePicker, Popconfirm, InputNumber, Card } from 'antd';
import { ReloadOutlined, ClearOutlined } from '@ant-design/icons';
import { deviceLogApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

const { RangePicker } = DatePicker;

interface LogItem {
  id: number; tenantId: number; deviceId: number; productId: number; level: string;
  module: string; content: string; traceId: string; ip: string; reportedAt: string; createdAt: string;
}

const levelColors: Record<string, string> = { DEBUG: 'default', INFO: 'blue', WARN: 'warning', ERROR: 'error' };

const DeviceLogPage: React.FC = () => {
  const [data, setData] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 50 });
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [timeRange, setTimeRange] = useState<[string, string] | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const query: Record<string, unknown> = { ...params };
      if (deviceId) query.deviceId = deviceId;
      if (level) query.level = level;
      if (keyword) query.keyword = keyword;
      if (timeRange) { query.start = timeRange[0]; query.end = timeRange[1]; }
      const res = await deviceLogApi.list(query);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const handleClean = async () => {
    const res = await deviceLogApi.clean(30);
    message.success(`已清理 ${res.data.data} 条过期日志`);
    fetchData();
  };

  const columns: ColumnsType<LogItem> = [
    { title: '设备ID', dataIndex: 'deviceId', width: 80 },
    { title: '级别', dataIndex: 'level', width: 80, render: (v: string) => <Tag color={levelColors[v]}>{v}</Tag> },
    { title: '模块', dataIndex: 'module', width: 120, render: (v: string) => v || '-' },
    { title: '内容', dataIndex: 'content', ellipsis: true },
    { title: 'Trace ID', dataIndex: 'traceId', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: 'IP', dataIndex: 'ip', width: 120, render: (v: string) => v || '-' },
    { title: '上报时间', dataIndex: 'reportedAt', width: 170 },
  ];

  return (
    <div>
      <PageHeader
        title="设备日志"
        description={`共 ${total} 条日志记录`}
        extra={<Popconfirm title="清理30天前的过期日志？" onConfirm={handleClean}><Button icon={<ClearOutlined />} danger size="small">清理过期</Button></Popconfirm>}
      />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <InputNumber placeholder="设备ID" value={deviceId} onChange={(v) => setDeviceId(v)} style={{ width: 110 }} size="small" />
          <Select placeholder="日志级别" allowClear style={{ width: 110 }} size="small" value={level} onChange={setLevel}
            options={[{ value: 'DEBUG', label: 'DEBUG' }, { value: 'INFO', label: 'INFO' }, { value: 'WARN', label: 'WARN' }, { value: 'ERROR', label: 'ERROR' }]} />
          <Input.Search placeholder="搜索内容" allowClear style={{ width: 200 }} size="small"
            onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); }} />
          <RangePicker showTime size="small" onChange={(_, dateStrings) => {
            if (dateStrings[0] && dateStrings[1]) setTimeRange(dateStrings as [string, string]);
            else setTimeRange(null);
          }} />
          <Button icon={<ReloadOutlined />} size="small" type="primary" onClick={() => { setParams({ ...params, pageNum: 1 }); fetchData(); }}>查询</Button>
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1000 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>
    </div>
  );
};

export default DeviceLogPage;
