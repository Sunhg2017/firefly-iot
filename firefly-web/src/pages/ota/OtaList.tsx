import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Table, Button, Tag, Space, Card, message, Modal, Form, Input, Select, Tabs, Progress, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, CheckCircleOutlined, RocketOutlined, StopOutlined, CloudUploadOutlined, FileProtectOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { firmwareApi, otaTaskApi, productApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

// 产品选项类型
interface ProductOption {
  id: number;
  productKey: string;
  name: string;
}


// ==================== Types ====================
interface FirmwareRecord {
  id: number;
  productId: number;
  version: string;
  displayName: string;
  description: string;
  fileUrl: string;
  fileSize: number;
  md5Checksum: string;
  status: string;
  createdAt: string;
}

interface OtaTaskRecord {
  id: number;
  productId: number;
  firmwareId: number;
  name: string;
  taskType: string;
  srcVersion: string;
  destVersion: string;
  status: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  grayRatio: number;
  createdAt: string;
}

const fwStatusLabels: Record<string, string> = { DRAFT: '草稿', VERIFIED: '已验证', RELEASED: '已发布' };
const fwStatusColors: Record<string, string> = { DRAFT: 'default', VERIFIED: 'processing', RELEASED: 'success' };
const taskStatusLabels: Record<string, string> = { PENDING: '待执行', IN_PROGRESS: '执行中', COMPLETED: '已完成', CANCELLED: '已取消' };
const taskStatusColors: Record<string, string> = { PENDING: 'default', IN_PROGRESS: 'processing', COMPLETED: 'success', CANCELLED: 'warning' };
const taskTypeLabels: Record<string, string> = { FULL: '全量', GRAY: '灰度' };

// ==================== Firmware Tab ====================
const FirmwareTab: React.FC = () => {
  const [data, setData] = useState<FirmwareRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [keyword, setKeyword] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  // 产品选项列表
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  // 加载产品列表
  const fetchProducts = useCallback(async () => {
    try {
      const res = await productApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setProductOptions(records.map((p: ProductOption) => ({ id: p.id, productKey: p.productKey, name: p.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await firmwareApi.list({ ...params, keyword: keyword || undefined });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载固件列表失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [keyword, params.pageNum, params.pageSize]);

  const applyKeyword = () => {
    setKeyword(keywordDraft.trim());
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetKeyword = () => {
    setKeywordDraft('');
    setKeyword('');
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const fwStats = useMemo(() => ({
    draft: data.filter(d => d.status === 'DRAFT').length,
    verified: data.filter(d => d.status === 'VERIFIED').length,
    released: data.filter(d => d.status === 'RELEASED').length,
  }), [data]);

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await firmwareApi.create(values);
      message.success('固件创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      fetchData();
    } catch { message.error('创建失败'); }
  };

  const handleVerify = async (id: number) => {
    try { await firmwareApi.verify(id); message.success('已验证'); fetchData(); } catch { message.error('操作失败'); }
  };

  const handleRelease = async (id: number) => {
    try { await firmwareApi.release(id); message.success('已发布'); fetchData(); } catch { message.error('操作失败'); }
  };

  const handleDelete = (record: FirmwareRecord) => {
    Modal.confirm({
      title: '确认删除固件？',
      content: `删除「${record.version}」？`,
      onOk: async () => { await firmwareApi.delete(record.id); message.success('删除成功'); fetchData(); },
    });
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const columns: ColumnsType<FirmwareRecord> = [
    { title: '版本号', dataIndex: 'version', width: 120 },
    { title: '显示名称', dataIndex: 'displayName', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={fwStatusColors[v]}>{fwStatusLabels[v] || v}</Tag> },
    { title: '文件大小', dataIndex: 'fileSize', width: 100, render: (v: number) => formatSize(v) },
    { title: 'MD5', dataIndex: 'md5Checksum', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 240, fixed: 'right',
      render: (_: unknown, record: FirmwareRecord) => (
        <Space>
          {record.status === 'DRAFT' && (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleVerify(record.id)}>验证</Button>
          )}
          {record.status === 'VERIFIED' && (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => handleRelease(record.id)}>发布</Button>
          )}
          {record.status !== 'RELEASED' && (
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* Firmware stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '固件总数', value: total, icon: <FileProtectOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '草稿', value: fwStats.draft, icon: <CloudUploadOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
          { title: '已验证', value: fwStats.verified, icon: <CheckCircleOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '已发布', value: fwStats.released, icon: <SendOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
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
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索版本号/名称"
            allowClear
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            onPressEnter={applyKeyword}
          />
          <div className="ff-query-actions">
            <Button onClick={resetKeyword}>重置</Button>
            <Button type="primary" onClick={applyKeyword}>查询</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>上传固件</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1100 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="上传固件" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} destroyOnClose width={560}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}>
            <Select
              placeholder="请选择产品"
              showSearch
              optionFilterProp="label"
              options={productOptions.map(p => ({ value: p.id, label: `${p.name} (${p.productKey})` }))}
            />
          </Form.Item>
          <Form.Item name="version" label="版本号" rules={[{ required: true, message: '请输入版本号' }]}>
            <Input placeholder="如：1.2.0" />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称"><Input placeholder="可选" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="fileUrl" label="文件URL" rules={[{ required: true, message: '请输入文件URL' }]}>
            <Input placeholder="MinIO 文件地址" />
          </Form.Item>
          <Form.Item name="fileSize" label="文件大小(Bytes)"><Input type="number" /></Form.Item>
          <Form.Item name="md5Checksum" label="MD5 校验值"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ==================== OTA Tasks Tab ====================
const OtaTasksTab: React.FC = () => {
  const [data, setData] = useState<OtaTaskRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; status?: string }>({ keyword: '' });
  const [filters, setFilters] = useState<{ keyword: string; status?: string }>({ keyword: '' });
  // 产品和固件选项
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [firmwareOptions, setFirmwareOptions] = useState<FirmwareRecord[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // 加载产品列表
  const fetchProducts = useCallback(async () => {
    try {
      const res = await productApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setProductOptions(records.map((p: ProductOption) => ({ id: p.id, productKey: p.productKey, name: p.name })));
    } catch { /* ignore */ }
  }, []);

  // 加载固件列表（按产品筛选，仅显示已发布的固件）
  const fetchFirmwares = useCallback(async (productId?: number) => {
    try {
      const res = await firmwareApi.list({ pageSize: 500, productId, status: 'RELEASED' });
      const records = res.data.data?.records || [];
      setFirmwareOptions(records);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // 产品选择变化时，联动加载该产品下的固件
  const handleProductChange = (productId: number) => {
    setSelectedProductId(productId);
    createForm.setFieldValue('firmwareId', undefined);
    fetchFirmwares(productId);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await otaTaskApi.list({ ...params, keyword: filters.keyword || undefined, status: filters.status });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载任务列表失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [filters, params.pageNum, params.pageSize]);

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      status: draftFilters.status,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const taskStats = useMemo(() => ({
    pending: data.filter(d => d.status === 'PENDING').length,
    inProgress: data.filter(d => d.status === 'IN_PROGRESS').length,
    completed: data.filter(d => d.status === 'COMPLETED').length,
    totalSuccess: data.reduce((s, d) => s + (d.successCount || 0), 0),
  }), [data]);

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await otaTaskApi.create(values);
      message.success('升级任务创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      fetchData();
    } catch { message.error('创建失败'); }
  };

  const handleCancel = (record: OtaTaskRecord) => {
    Modal.confirm({
      title: '确认取消升级任务？',
      content: `取消「${record.name}」？进行中的设备升级将被终止。`,
      onOk: async () => { await otaTaskApi.cancel(record.id); message.success('已取消'); fetchData(); },
    });
  };

  const columns: ColumnsType<OtaTaskRecord> = [
    { title: '任务名称', dataIndex: 'name', width: 200, ellipsis: true },
    { title: '类型', dataIndex: 'taskType', width: 70, render: (v: string) => <Tag>{taskTypeLabels[v] || v}</Tag> },
    { title: '目标版本', dataIndex: 'destVersion', width: 100 },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={taskStatusColors[v]}>{taskStatusLabels[v] || v}</Tag> },
    {
      title: '进度', width: 180,
      render: (_: unknown, record: OtaTaskRecord) => {
        const pct = record.totalCount > 0 ? Math.round((record.successCount / record.totalCount) * 100) : 0;
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Progress percent={pct} size="small" />
            <span style={{ fontSize: 12 }}>
              总 {record.totalCount} | <span style={{ color: '#52c41a' }}>成功 {record.successCount}</span> | <span style={{ color: '#ff4d4f' }}>失败 {record.failureCount}</span>
            </span>
          </Space>
        );
      },
    },
    { title: '灰度%', dataIndex: 'grayRatio', width: 70, render: (v: number) => v != null ? `${v}%` : '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 120, fixed: 'right',
      render: (_: unknown, record: OtaTaskRecord) => (
        <Space>
          {(record.status === 'PENDING' || record.status === 'IN_PROGRESS') && (
            <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => handleCancel(record)}>取消</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* Task stats */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '任务总数', value: total, icon: <RocketOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '待执行', value: taskStats.pending, icon: <ThunderboltOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
          { title: '执行中', value: taskStats.inProgress, icon: <RocketOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '已完成', value: taskStats.completed, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
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
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索任务名称"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            value={draftFilters.status}
            options={[{ value: 'PENDING', label: '待执行' }, { value: 'IN_PROGRESS', label: '执行中' }, { value: 'COMPLETED', label: '已完成' }, { value: 'CANCELLED', label: '已取消' }]}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建任务</Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1100 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="新建升级任务" open={createOpen} onCancel={() => { setCreateOpen(false); setSelectedProductId(null); setFirmwareOptions([]); }} onOk={() => createForm.submit()} destroyOnClose width={560}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="如：v1.2.0 全量升级" />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="productId" label="所属产品" rules={[{ required: true, message: '请选择产品' }]}>
            <Select
              placeholder="请选择产品"
              showSearch
              optionFilterProp="label"
              options={productOptions.map(p => ({ value: p.id, label: `${p.name} (${p.productKey})` }))}
              onChange={handleProductChange}
            />
          </Form.Item>
          <Form.Item name="firmwareId" label="目标固件" rules={[{ required: true, message: '请选择固件' }]}>
            <Select
              placeholder={selectedProductId ? '请选择固件' : '请先选择产品'}
              disabled={!selectedProductId}
              showSearch
              optionFilterProp="label"
              options={firmwareOptions.map(f => ({ value: f.id, label: `${f.version}${f.displayName ? ` - ${f.displayName}` : ''}` }))}
            />
          </Form.Item>
          <Form.Item name="taskType" label="任务类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'FULL', label: '全量升级' }, { value: 'GRAY', label: '灰度升级' }]} />
          </Form.Item>
          <Form.Item name="srcVersion" label="源版本"><Input placeholder="可选，如 1.1.0" /></Form.Item>
          <Form.Item name="destVersion" label="目标版本" rules={[{ required: true }]}><Input placeholder="如 1.2.0" /></Form.Item>
          <Form.Item name="grayRatio" label="灰度比例(%)"><Input type="number" placeholder="如 10（仅灰度时填写）" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ==================== Main Component ====================
const OtaList: React.FC = () => {
  return (
    <div>
      <PageHeader title="OTA 升级" description="先维护固件版本，再创建或跟踪升级任务。" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs defaultActiveKey="firmware" items={[
          { key: 'firmware', label: <span><FileProtectOutlined style={{ marginRight: 6 }} />固件管理</span>, children: <FirmwareTab /> },
          { key: 'tasks', label: <span><RocketOutlined style={{ marginRight: 6 }} />升级任务</span>, children: <OtaTasksTab /> },
        ]} />
      </Card>
    </div>
  );
};

export default OtaList;
