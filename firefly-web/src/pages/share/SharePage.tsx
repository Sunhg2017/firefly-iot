import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Tabs, Table, Button, Space, message, Modal, Form, Input, Select, Tag, Descriptions, Popconfirm } from 'antd';
import { PlusOutlined, CheckOutlined, CloseOutlined, StopOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { sharePolicyApi, tenantApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

const { TextArea } = Input;

// 租户选项类型
interface TenantOption {
  id: number;
  code: string;
  name: string;
}

interface PolicyItem {
  id: number;
  ownerTenantId: number;
  consumerTenantId: number;
  name: string;
  scope: string;
  dataPermissions: string;
  maskingRules: string;
  rateLimit: string;
  validity: string;
  status: string;
  auditEnabled: boolean;
  createdBy: number;
  approvedBy: number;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogItem {
  id: number;
  policyId: number;
  consumerTenantId: number;
  action: string;
  queryDetail: string;
  resultCount: number;
  ipAddress: string;
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回', REVOKED: '已撤销', EXPIRED: '已过期',
};
const statusColors: Record<string, string> = {
  PENDING: 'processing', APPROVED: 'success', REJECTED: 'error', REVOKED: 'default', EXPIRED: 'warning',
};

// ==================== Owned Tab ====================

const OwnedTab: React.FC = () => {
  const [data, setData] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<PolicyItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<PolicyItem | null>(null);
  const [form] = Form.useForm();
  // 租户列表
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);

  // 构建租户ID到名称的映射
  const tenantMap = useMemo(() => {
    const map: Record<number, TenantOption> = {};
    tenantOptions.forEach(t => { map[t.id] = t; });
    return map;
  }, [tenantOptions]);

  // 根据租户ID获取显示名称
  const getTenantDisplay = (id: number) => {
    const tenant = tenantMap[id];
    return tenant ? `${tenant.name} (${tenant.code})` : `#${id}`;
  };

  // 加载租户列表
  const fetchTenants = useCallback(async () => {
    try {
      const res = await tenantApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setTenantOptions(records.map((t: TenantOption) => ({ id: t.id, code: t.code, name: t.name })));
    } catch { /* ignore - 可能权限不足 */ }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);
  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await sharePolicyApi.listOwned();
      setData(res.data.data || []);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (record: PolicyItem | null) => {
    setEditRecord(record);
    if (record) {
      form.setFieldsValue({ name: record.name, consumerTenantId: record.consumerTenantId, scope: record.scope, dataPermissions: record.dataPermissions, maskingRules: record.maskingRules, rateLimit: record.rateLimit, validity: record.validity });
    } else { form.resetFields(); }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      if (editRecord) { await sharePolicyApi.update(editRecord.id, values); message.success('更新成功'); }
      else { await sharePolicyApi.create(values); message.success('创建成功'); }
      setEditOpen(false); fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleApprove = async (id: number) => { await sharePolicyApi.approve(id); message.success('已批准'); fetchData(); };
  const handleReject = async (id: number) => { await sharePolicyApi.reject(id); message.success('已驳回'); fetchData(); };
  const handleRevoke = async (id: number) => { await sharePolicyApi.revoke(id); message.success('已撤销'); fetchData(); };
  const handleDelete = async (id: number) => { await sharePolicyApi.delete(id); message.success('已删除'); fetchData(); };

  const columns: ColumnsType<PolicyItem> = [
    { title: '策略名称', dataIndex: 'name', width: 180 },
    { title: '消费方租户', width: 160, render: (_: unknown, record: PolicyItem) => getTenantDisplay(record.consumerTenantId) },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag> },
    { title: '审计', dataIndex: 'auditEnabled', width: 60, render: (v: boolean) => v ? <Tag color="blue">开</Tag> : <Tag>关</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 280, fixed: 'right',
      render: (_: unknown, record: PolicyItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => { setDetailRecord(record); setDetailOpen(true); }}>详情</Button>
          {record.status === 'PENDING' && <>
            <Popconfirm title="确认批准？" onConfirm={() => handleApprove(record.id)}><Button type="link" size="small" icon={<CheckOutlined />}>批准</Button></Popconfirm>
            <Popconfirm title="确认驳回？" onConfirm={() => handleReject(record.id)}><Button type="link" size="small" danger icon={<CloseOutlined />}>驳回</Button></Popconfirm>
          </>}
          {record.status === 'APPROVED' && <Popconfirm title="确认撤销？" onConfirm={() => handleRevoke(record.id)}><Button type="link" size="small" icon={<StopOutlined />}>撤销</Button></Popconfirm>}
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}><Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建共享策略</Button></Space>
      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} size="small" scroll={{ x: 1000 }} />

      <Modal title={editRecord ? '编辑共享策略' : '新建共享策略'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={600}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="策略名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="consumerTenantId" label="消费方租户" rules={[{ required: true, message: '请选择消费方租户' }]}>
            <Select
              placeholder="请选择消费方租户"
              showSearch
              optionFilterProp="label"
              options={tenantOptions.map(t => ({ value: t.id, label: `${t.name} (${t.code})` }))}
            />
          </Form.Item>
          <Form.Item name="scope" label="共享范围 (JSON)" extra="使用 productKey 和 deviceName 指定共享范围"><TextArea rows={3} placeholder='{"productKeys": ["key1","key2"], "deviceNames": ["device-001"]}' /></Form.Item>
          <Form.Item name="dataPermissions" label="数据权限 (JSON)"><TextArea rows={2} placeholder='{"properties": true, "telemetry": true, "events": false}' /></Form.Item>
          <Form.Item name="maskingRules" label="脱敏规则 (JSON)"><TextArea rows={2} placeholder='{"latitude": "ROUND_2", "imei": "MASK_MIDDLE"}' /></Form.Item>
          <Form.Item name="rateLimit" label="频率限制 (JSON)"><Input placeholder='{"qps": 10, "dailyLimit": 10000}' /></Form.Item>
          <Form.Item name="validity" label="有效期 (JSON)"><Input placeholder='{"startTime": "2025-01-01", "endTime": "2025-12-31"}' /></Form.Item>
        </Form>
      </Modal>

      <Modal title="策略详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={650}>
        {detailRecord && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="策略名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusColors[detailRecord.status]}>{statusLabels[detailRecord.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="审计">{detailRecord.auditEnabled ? <Tag color="blue">开启</Tag> : <Tag>关闭</Tag>}</Descriptions.Item>
            <Descriptions.Item label="所有方租户">{getTenantDisplay(detailRecord.ownerTenantId)}</Descriptions.Item>
            <Descriptions.Item label="消费方租户">{getTenantDisplay(detailRecord.consumerTenantId)}</Descriptions.Item>
            <Descriptions.Item label="共享范围" span={2}><pre style={{ margin: 0, fontSize: 12, maxHeight: 100, overflow: 'auto' }}>{detailRecord.scope || '-'}</pre></Descriptions.Item>
            <Descriptions.Item label="数据权限" span={2}><pre style={{ margin: 0, fontSize: 12 }}>{detailRecord.dataPermissions || '-'}</pre></Descriptions.Item>
            <Descriptions.Item label="脱敏规则" span={2}><pre style={{ margin: 0, fontSize: 12 }}>{detailRecord.maskingRules || '-'}</pre></Descriptions.Item>
            <Descriptions.Item label="频率限制">{detailRecord.rateLimit || '-'}</Descriptions.Item>
            <Descriptions.Item label="有效期">{detailRecord.validity || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{detailRecord.updatedAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

// ==================== Consumed Tab ====================

const ConsumedTab: React.FC = () => {
  const [data, setData] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(false);
  // 租户列表
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);

  // 构建租户ID到名称的映射
  const tenantMap = useMemo(() => {
    const map: Record<number, TenantOption> = {};
    tenantOptions.forEach(t => { map[t.id] = t; });
    return map;
  }, [tenantOptions]);

  // 根据租户ID获取显示名称
  const getTenantDisplay = (id: number) => {
    const tenant = tenantMap[id];
    return tenant ? `${tenant.name} (${tenant.code})` : `#${id}`;
  };

  // 加载租户列表
  const fetchTenants = useCallback(async () => {
    try {
      const res = await tenantApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setTenantOptions(records.map((t: TenantOption) => ({ id: t.id, code: t.code, name: t.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const res = await sharePolicyApi.listConsumed(); setData(res.data.data || []); }
      catch { message.error('加载失败'); } finally { setLoading(false); }
    })();
  }, []);

  const columns: ColumnsType<PolicyItem> = [
    { title: '策略名称', dataIndex: 'name', width: 200 },
    { title: '所有方租户', width: 160, render: (_: unknown, record: PolicyItem) => getTenantDisplay(record.ownerTenantId) },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag> },
    { title: '共享范围', dataIndex: 'scope', ellipsis: true, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
  ];

  return <Table rowKey="id" columns={columns} dataSource={data} loading={loading} pagination={false} size="small" />;
};

// ==================== Audit Log Tab ====================

const AuditLogTab: React.FC = () => {
  const [data, setData] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  // 租户列表
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);

  // 构建租户ID到名称的映射
  const tenantMap = useMemo(() => {
    const map: Record<number, TenantOption> = {};
    tenantOptions.forEach(t => { map[t.id] = t; });
    return map;
  }, [tenantOptions]);

  // 根据租户ID获取显示名称
  const getTenantDisplay = (id: number) => {
    const tenant = tenantMap[id];
    return tenant ? `${tenant.name} (${tenant.code})` : `#${id}`;
  };

  // 加载租户列表
  const fetchTenants = useCallback(async () => {
    try {
      const res = await tenantApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setTenantOptions(records.map((t: TenantOption) => ({ id: t.id, code: t.code, name: t.name })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await sharePolicyApi.auditLogs(params);
      const page = res.data.data;
      setData(page.records || []); setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const columns: ColumnsType<AuditLogItem> = [
    { title: '时间', dataIndex: 'createdAt', width: 170 },
    { title: '消费方租户', width: 160, render: (_: unknown, record: AuditLogItem) => getTenantDisplay(record.consumerTenantId) },
    { title: '操作', dataIndex: 'action', width: 160 },
    { title: '结果数', dataIndex: 'resultCount', width: 80 },
    { title: 'IP', dataIndex: 'ipAddress', width: 130 },
    { title: '查询详情', dataIndex: 'queryDetail', ellipsis: true, render: (v: string) => v || '-' },
  ];

  return (
    <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small"
      pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
        showTotal: (t: number) => `共 ${t} 条`,
        onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
  );
};

// ==================== Main Page ====================

const SharePage: React.FC = () => {
  return (
    <div>
      <PageHeader title="跨租户共享" />
      <Tabs defaultActiveKey="owned" style={{ marginTop: 16 }} items={[
        { key: 'owned', label: '我的共享策略', children: <OwnedTab /> },
        { key: 'consumed', label: '共享给我的', children: <ConsumedTab /> },
        { key: 'audit', label: '共享审计日志', children: <AuditLogTab /> },
      ]} />
    </div>
  );
};

export default SharePage;
