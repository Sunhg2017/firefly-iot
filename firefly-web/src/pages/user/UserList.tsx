import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Space, Input, Card, message, Modal, Form, Avatar, Row, Col } from 'antd';
import { PlusOutlined, SearchOutlined, TeamOutlined, CheckCircleOutlined, StopOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { userApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

interface UserRecord {
  id: number;
  username: string;
  realName: string;
  phone: string;
  email: string;
  status: string;
  avatarUrl?: string;
  lastLoginAt: string;
  createdAt: string;
}

const statusLabels: Record<string, string> = { ACTIVE: '正常', DISABLED: '禁用', LOCKED: '锁定' };
const statusColors: Record<string, string> = { ACTIVE: 'green', DISABLED: 'red', LOCKED: 'orange' };
const avatarColors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899'];

const UserList: React.FC = () => {
  const [data, setData] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20, keyword: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await userApi.list(params);
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
    active: data.filter(d => d.status === 'ACTIVE').length,
    disabled: data.filter(d => d.status === 'DISABLED').length,
    locked: data.filter(d => d.status === 'LOCKED').length,
  }), [data]);

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await userApi.create(values);
      message.success('创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchData();
    } catch {
      message.error('创建失败');
    }
  };

  const columns: ColumnsType<UserRecord> = [
    {
      title: '用户', width: 200,
      render: (_: unknown, record: UserRecord) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            size={36}
            src={record.avatarUrl}
            icon={<UserOutlined />}
            style={{ background: avatarColors[record.id % avatarColors.length], flexShrink: 0 }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1a2e' }}>{record.realName || record.username}</div>
            <div style={{ fontSize: 11, color: '#8c8c8c' }}>@{record.username}</div>
          </div>
        </div>
      ),
    },
    { title: '手机号', dataIndex: 'phone', width: 140, render: (v: string) => v || '-' },
    { title: '邮箱', dataIndex: 'email', width: 200, render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag>,
    },
    { title: '最后登录', dataIndex: 'lastLoginAt', width: 170, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_: unknown, record: UserRecord) => (
        <Space>
          <Button type="link" size="small" onClick={() => message.info(`编辑 ${record.username}`)}>编辑</Button>
          <Button type="link" size="small" danger onClick={() => message.info(`删除 ${record.username}`)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="用户管理"
        description={`共 ${total} 个用户`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建用户</Button>}
      />

      {/* Stat summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '用户总数', value: total, icon: <TeamOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '正常', value: stats.active, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '已禁用', value: stats.disabled, icon: <StopOutlined />, color: '#ef4444', bg: 'rgba(239,68,68,0.08)' },
          { title: '已锁定', value: stats.locked, icon: <LockOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
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
          <Input placeholder="搜索用户名/姓名/手机号" prefix={<SearchOutlined />} allowClear
            onChange={(e) => setParams({ ...params, keyword: e.target.value })}
            onPressEnter={fetchData} style={{ width: 280 }} />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1100 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ ...params, pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="新建用户" open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="realName" label="姓名"><Input /></Form.Item>
          <Form.Item name="phone" label="手机号"><Input /></Form.Item>
          <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          <Form.Item name="password" label="密码"><Input.Password /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserList;
