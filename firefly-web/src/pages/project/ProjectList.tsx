import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Tag, Select, Popconfirm, Drawer, InputNumber, List } from 'antd';
import { PlusOutlined, EditOutlined, TeamOutlined, HddOutlined, DeleteOutlined, UserAddOutlined } from '@ant-design/icons';
import { projectApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface ProjectItem {
  id: number; code: string; name: string; description: string; status: string; createdBy: number; createdAt: string;
}
interface MemberItem { id: number; projectId: number; userId: number; role: string; createdAt: string; }
interface DeviceItem { id: number; projectId: number; deviceId: number; createdAt: string; }

const statusLabels: Record<string, string> = { ACTIVE: '活跃', SUSPENDED: '暂停', ARCHIVED: '归档' };
const statusColors: Record<string, string> = { ACTIVE: 'success', SUSPENDED: 'warning', ARCHIVED: 'default' };
const roleLabels: Record<string, string> = { OWNER: '所有者', ADMIN: '管理员', MEMBER: '成员', VIEWER: '观察者' };

const ProjectList: React.FC = () => {
  const [data, setData] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ProjectItem | null>(null);
  const [form] = Form.useForm();

  // Members drawer
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberProjectId, setMemberProjectId] = useState<number>(0);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [addMemberUserId, setAddMemberUserId] = useState<number | null>(null);
  const [addMemberRole, setAddMemberRole] = useState('MEMBER');

  // Devices drawer
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [deviceProjectId, setDeviceProjectId] = useState<number>(0);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [bindDeviceId, setBindDeviceId] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await projectApi.list(params);
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const handleEdit = (record: ProjectItem | null) => {
    setEditRecord(record);
    if (record) { form.setFieldsValue(record); } else { form.resetFields(); }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      if (editRecord) { await projectApi.update(editRecord.id, values); message.success('更新成功'); }
      else { await projectApi.create(values); message.success('创建成功'); }
      setEditOpen(false); fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleStatus = async (id: number, status: string) => {
    await projectApi.updateStatus(id, status); message.success('状态已更新'); fetchData();
  };

  // Members
  const openMembers = async (projectId: number) => {
    setMemberProjectId(projectId); setMemberOpen(true);
    try { const res = await projectApi.listMembers(projectId); setMembers(res.data.data || []); } catch { message.error('加载成员失败'); }
  };
  const handleAddMember = async () => {
    if (!addMemberUserId) return;
    try { await projectApi.addMember(memberProjectId, addMemberUserId, addMemberRole); message.success('添加成功'); openMembers(memberProjectId); setAddMemberUserId(null); }
    catch { message.error('添加失败'); }
  };
  const handleRemoveMember = async (userId: number) => {
    await projectApi.removeMember(memberProjectId, userId); message.success('已移除'); openMembers(memberProjectId);
  };

  // Devices
  const openDevices = async (projectId: number) => {
    setDeviceProjectId(projectId); setDeviceOpen(true);
    try { const res = await projectApi.listDevices(projectId); setDevices(res.data.data || []); } catch { message.error('加载设备失败'); }
  };
  const handleBindDevice = async () => {
    if (!bindDeviceId) return;
    try { await projectApi.bindDevice(deviceProjectId, bindDeviceId); message.success('绑定成功'); openDevices(deviceProjectId); setBindDeviceId(null); }
    catch { message.error('绑定失败'); }
  };
  const handleUnbindDevice = async (deviceId: number) => {
    await projectApi.unbindDevice(deviceProjectId, deviceId); message.success('已解绑'); openDevices(deviceProjectId);
  };

  const columns: ColumnsType<ProjectItem> = [
    { title: '项目编码', dataIndex: 'code', width: 130 },
    { title: '项目名称', dataIndex: 'name', width: 180 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 320, fixed: 'right',
      render: (_: unknown, record: ProjectItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" icon={<TeamOutlined />} onClick={() => openMembers(record.id)}>成员</Button>
          <Button type="link" size="small" icon={<HddOutlined />} onClick={() => openDevices(record.id)}>设备</Button>
          {record.status === 'ACTIVE' && <Popconfirm title="确认暂停？" onConfirm={() => handleStatus(record.id, 'SUSPENDED')}><Button type="link" size="small">暂停</Button></Popconfirm>}
          {record.status === 'SUSPENDED' && <Popconfirm title="确认激活？" onConfirm={() => handleStatus(record.id, 'ACTIVE')}><Button type="link" size="small">激活</Button></Popconfirm>}
          {record.status !== 'ARCHIVED' && <Popconfirm title="确认归档？" onConfirm={() => handleStatus(record.id, 'ARCHIVED')}><Button type="link" size="small" danger>归档</Button></Popconfirm>}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="项目管理" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建项目</Button>} />

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1000 }} style={{ marginTop: 16 }}
        pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />

      {/* Create/Edit Modal */}
      <Modal title={editRecord ? '编辑项目' : '新建项目'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={500}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="项目编码" rules={[{ required: true }]}><Input disabled={!!editRecord} /></Form.Item>
          <Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      {/* Members Drawer */}
      <Drawer title="项目成员" open={memberOpen} onClose={() => setMemberOpen(false)} width={450}>
        <Space style={{ marginBottom: 16 }}>
          <InputNumber placeholder="用户ID" value={addMemberUserId} onChange={(v) => setAddMemberUserId(v)} style={{ width: 100 }} />
          <Select value={addMemberRole} onChange={setAddMemberRole} style={{ width: 100 }}
            options={Object.entries(roleLabels).map(([k, v]) => ({ value: k, label: v }))} />
          <Button type="primary" icon={<UserAddOutlined />} onClick={handleAddMember} size="small">添加</Button>
        </Space>
        <List dataSource={members} renderItem={(item: MemberItem) => (
          <List.Item actions={[
            <Popconfirm key="rm" title="确认移除？" onConfirm={() => handleRemoveMember(item.userId)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button>
            </Popconfirm>
          ]}>
            <List.Item.Meta title={`用户 #${item.userId}`} description={<Tag>{roleLabels[item.role] || item.role}</Tag>} />
          </List.Item>
        )} />
      </Drawer>

      {/* Devices Drawer */}
      <Drawer title="项目设备" open={deviceOpen} onClose={() => setDeviceOpen(false)} width={450}>
        <Space style={{ marginBottom: 16 }}>
          <InputNumber placeholder="设备ID" value={bindDeviceId} onChange={(v) => setBindDeviceId(v)} style={{ width: 120 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleBindDevice} size="small">绑定</Button>
        </Space>
        <List dataSource={devices} renderItem={(item: DeviceItem) => (
          <List.Item actions={[
            <Popconfirm key="ub" title="确认解绑？" onConfirm={() => handleUnbindDevice(item.deviceId)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>解绑</Button>
            </Popconfirm>
          ]}>
            <List.Item.Meta title={`设备 #${item.deviceId}`} description={`绑定时间: ${item.createdAt}`} />
          </List.Item>
        )} />
      </Drawer>
    </div>
  );
};

export default ProjectList;
