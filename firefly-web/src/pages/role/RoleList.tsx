import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Space, Card, message, Modal, Form, Input, Select, Row, Col } from 'antd';
import { PlusOutlined, SafetyCertificateOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { roleApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface RoleRecord {
  id: number;
  code: string;
  name: string;
  type: string;
  dataScope: string;
  systemFlag: boolean;
  status: string;
  createdAt: string;
}

const typeColors: Record<string, string> = { PRESET: 'blue', CUSTOM: 'green' };
const scopeLabels: Record<string, string> = { ALL: '全部数据', PROJECT: '项目范围', GROUP: '分组范围', SELF: '仅自己', CUSTOM: '自定义' };

const RoleList: React.FC = () => {
  const [data, setData] = useState<RoleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await roleApi.list(params);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const stats = useMemo(() => ({
    preset: data.filter(d => d.type === 'PRESET').length,
    custom: data.filter(d => d.type === 'CUSTOM').length,
    system: data.filter(d => d.systemFlag).length,
  }), [data]);

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await roleApi.create(values);
      message.success('创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch {
      message.error('创建失败');
    }
  };

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: '确认删除此角色？',
      onOk: async () => {
        await roleApi.delete(id);
        message.success('删除成功');
        fetchData();
      },
    });
  };

  const columns: ColumnsType<RoleRecord> = [
    { title: '角色代码', dataIndex: 'code', width: 140 },
    { title: '角色名称', dataIndex: 'name', width: 160 },
    { title: '类型', dataIndex: 'type', width: 100, render: (v: string) => <Tag color={typeColors[v]}>{v === 'PRESET' ? '预置' : '自定义'}</Tag> },
    { title: '数据范围', dataIndex: 'dataScope', width: 120, render: (v: string) => scopeLabels[v] || v },
    { title: '系统角色', dataIndex: 'systemFlag', width: 100, render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button type="link" size="small" onClick={() => message.info(`编辑 ${record.code}`)}>编辑</Button>
          <Button type="link" size="small" danger disabled={record.systemFlag} onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="角色权限"
        description={`共 ${total} 个角色`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建角色</Button>}
      />

      {/* Stat summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '角色总数', value: total, icon: <SafetyCertificateOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '预置角色', value: stats.preset, icon: <LockOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '自定义角色', value: stats.custom, icon: <UnlockOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
        ].map((s, i) => (
          <Col xs={8} key={i}>
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

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1000 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ ...params, pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="新建角色" open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} destroyOnClose width={600}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="code" label="角色代码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="角色名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="dataScope" label="数据范围" initialValue="PROJECT">
            <Select options={[
              { value: 'ALL', label: '全部数据' },
              { value: 'PROJECT', label: '项目范围' },
              { value: 'GROUP', label: '分组范围' },
              { value: 'SELF', label: '仅自己' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RoleList;
