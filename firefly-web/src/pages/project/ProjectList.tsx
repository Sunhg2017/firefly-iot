import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, List, Modal, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, HddOutlined, PlusOutlined, ReloadOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { DeviceSelect, UserSelect } from '../../components/EntitySelect';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { deviceApi, projectApi, userApi } from '../../services/api';

interface ProjectItem {
  id: number;
  code: string;
  name: string;
  description: string;
  status: string;
  createdBy: number;
  createdAt: string;
}
interface MemberItem { id: number; projectId: number; userId: number; role: string; createdAt: string; }
interface DeviceItem { id: number; projectId: number; deviceId: number; createdAt: string; }
interface ProjectFilters { keyword: string; status?: string; }

const EMPTY_FILTERS: ProjectFilters = { keyword: '' };
const statusLabels: Record<string, string> = { ACTIVE: '活跃', SUSPENDED: '暂停', ARCHIVED: '归档' };
const statusColors: Record<string, string> = { ACTIVE: 'success', SUSPENDED: 'warning', ARCHIVED: 'default' };
const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));
const roleLabels: Record<string, string> = { OWNER: '所有者', ADMIN: '管理员', MEMBER: '成员', VIEWER: '观察者' };
const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }));

const ProjectList: React.FC = () => {
  const [data, setData] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<ProjectFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_FILTERS);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ProjectItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  // Members drawer
  const [memberProject, setMemberProject] = useState<ProjectItem | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberNames, setMemberNames] = useState<Record<number, string>>({});
  const [addMemberUserId, setAddMemberUserId] = useState<number | undefined>();
  const [addMemberRole, setAddMemberRole] = useState('MEMBER');
  const [addingMember, setAddingMember] = useState(false);
  const [memberRoleSavingId, setMemberRoleSavingId] = useState<number | null>(null);

  // Devices drawer
  const [deviceProject, setDeviceProject] = useState<ProjectItem | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceNames, setDeviceNames] = useState<Record<number, string>>({});
  const [bindDeviceId, setBindDeviceId] = useState<number | undefined>();
  const [bindingDevice, setBindingDevice] = useState(false);
  const memberRequestIdRef = useRef(0);
  const deviceRequestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await projectApi.list({
        ...params,
        keyword: filters.keyword.trim() || undefined,
        status: filters.status,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      const errorMessage = getErrorMessage(error, '加载项目列表失败');
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters, params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleActivate = useCallback(() => {
    void fetchData();
  }, [fetchData]);
  usePageActivation(handleActivate);

  const applyFilters = () => {
    setFilters({ keyword: draftFilters.keyword.trim(), status: draftFilters.status });
    setParams((prev) => ({ ...prev, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters({ ...EMPTY_FILTERS });
    setParams((prev) => ({ ...prev, pageNum: 1 }));
  };

  const hasFilters = Boolean(filters.keyword || filters.status);

  const handleEdit = (record: ProjectItem | null) => {
    setEditRecord(record);
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.resetFields();
    }
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditRecord(null);
    form.resetFields();
  };

  const handleSave = async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editRecord) {
        await projectApi.update(editRecord.id, values);
        message.success('项目更新成功');
      } else {
        await projectApi.create(values);
        message.success('项目创建成功');
      }
      closeEdit();
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, editRecord ? '更新项目失败' : '创建项目失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (record: ProjectItem, status: string) => {
    setStatusUpdatingId(record.id);
    try {
      await projectApi.updateStatus(record.id, status);
      message.success('项目状态已更新');
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '更新项目状态失败'));
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const resolveMemberNames = async (items: MemberItem[]) => {
    const entries = await Promise.all(items.map(async (item) => {
      try {
        const res = await userApi.get(item.userId);
        const record = res.data.data as { realName?: string | null; username?: string } | undefined;
        const label = record?.realName?.trim() || record?.username?.trim() || '成员信息不可用';
        return { userId: item.userId, label };
      } catch (error) {
        // Project member VO only carries userId; name lookup failure must not hide the membership row.
        return { userId: item.userId, label: getErrorMessage(error, '成员信息不可用') };
      }
    }));
    setMemberNames((previous) => {
      const next = { ...previous };
      entries.forEach((entry) => {
        next[entry.userId] = entry.label;
      });
      return next;
    });
  };

  const openMembers = async (project: ProjectItem) => {
    setMemberProject(project);
    setAddMemberUserId(undefined);
    setAddMemberRole('MEMBER');
    setMemberError(null);
    setMembers([]);
    const requestId = memberRequestIdRef.current + 1;
    memberRequestIdRef.current = requestId;
    setMembersLoading(true);
    try {
      const res = await projectApi.listMembers(project.id);
      if (requestId !== memberRequestIdRef.current) {
        return;
      }
      const items = (res.data.data || []) as MemberItem[];
      setMembers(items);
      await resolveMemberNames(items);
    } catch (error) {
      if (requestId !== memberRequestIdRef.current) {
        return;
      }
      const errorMessage = getErrorMessage(error, '加载项目成员失败');
      setMemberError(errorMessage);
      message.error(errorMessage);
    } finally {
      if (requestId === memberRequestIdRef.current) {
        setMembersLoading(false);
      }
    }
  };

  const handleAddMember = async () => {
    if (!memberProject) {
      return;
    }
    if (!addMemberUserId) {
      message.warning('请先选择要添加的成员');
      return;
    }
    setAddingMember(true);
    try {
      await projectApi.addMember(memberProject.id, addMemberUserId, addMemberRole);
      message.success('成员添加成功');
      setAddMemberUserId(undefined);
      await openMembers(memberProject);
    } catch (error) {
      message.error(getErrorMessage(error, '添加项目成员失败'));
    } finally {
      setAddingMember(false);
    }
  };

  const handleMemberRoleChange = async (member: MemberItem, role: string) => {
    if (!memberProject) {
      return;
    }
    setMemberRoleSavingId(member.userId);
    try {
      await projectApi.updateMemberRole(memberProject.id, member.userId, role);
      setMembers((previous) => previous.map((item) => (item.userId === member.userId ? { ...item, role } : item)));
      message.success('成员角色已更新');
    } catch (error) {
      message.error(getErrorMessage(error, '更新成员角色失败'));
    } finally {
      setMemberRoleSavingId(null);
    }
  };

  const handleRemoveMember = async (member: MemberItem) => {
    if (!memberProject) {
      return;
    }
    try {
      await projectApi.removeMember(memberProject.id, member.userId);
      message.success('成员已移除');
      await openMembers(memberProject);
    } catch (error) {
      message.error(getErrorMessage(error, '移除项目成员失败'));
    }
  };

  const resolveDeviceNames = async (items: DeviceItem[]) => {
    const entries = await Promise.all(items.map(async (item) => {
      try {
        const res = await deviceApi.get(item.deviceId);
        const record = res.data.data as { deviceName?: string; nickname?: string | null } | undefined;
        const name = record?.nickname?.trim() || record?.deviceName?.trim() || '设备信息不可用';
        return { deviceId: item.deviceId, label: name };
      } catch (error) {
        // Project device VO only carries deviceId; keep the binding visible when name lookup is denied.
        return { deviceId: item.deviceId, label: getErrorMessage(error, '设备信息不可用') };
      }
    }));
    setDeviceNames((previous) => {
      const next = { ...previous };
      entries.forEach((entry) => {
        next[entry.deviceId] = entry.label;
      });
      return next;
    });
  };

  const openDevices = async (project: ProjectItem) => {
    setDeviceProject(project);
    setBindDeviceId(undefined);
    setDeviceError(null);
    setDevices([]);
    const requestId = deviceRequestIdRef.current + 1;
    deviceRequestIdRef.current = requestId;
    setDevicesLoading(true);
    try {
      const res = await projectApi.listDevices(project.id);
      if (requestId !== deviceRequestIdRef.current) {
        return;
      }
      const items = (res.data.data || []) as DeviceItem[];
      setDevices(items);
      await resolveDeviceNames(items);
    } catch (error) {
      if (requestId !== deviceRequestIdRef.current) {
        return;
      }
      const errorMessage = getErrorMessage(error, '加载项目设备失败');
      setDeviceError(errorMessage);
      message.error(errorMessage);
    } finally {
      if (requestId === deviceRequestIdRef.current) {
        setDevicesLoading(false);
      }
    }
  };

  const handleBindDevice = async () => {
    if (!deviceProject) {
      return;
    }
    if (!bindDeviceId) {
      message.warning('请先选择要绑定的设备');
      return;
    }
    setBindingDevice(true);
    try {
      await projectApi.bindDevice(deviceProject.id, bindDeviceId);
      message.success('设备绑定成功');
      setBindDeviceId(undefined);
      await openDevices(deviceProject);
    } catch (error) {
      message.error(getErrorMessage(error, '绑定项目设备失败'));
    } finally {
      setBindingDevice(false);
    }
  };

  const handleUnbindDevice = async (deviceId: number) => {
    if (!deviceProject) {
      return;
    }
    try {
      await projectApi.unbindDevice(deviceProject.id, deviceId);
      message.success('设备已解绑');
      await openDevices(deviceProject);
    } catch (error) {
      message.error(getErrorMessage(error, '解绑项目设备失败'));
    }
  };

  const columns: ColumnsType<ProjectItem> = [
    { title: '项目编码', dataIndex: 'code', width: 170, ellipsis: true, render: (value: string) => <CopyText text={value} ellipsis /> },
    { title: '项目名称', dataIndex: 'name', width: 180, ellipsis: true },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (value?: string) => value || '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (value: string) => <Tag color={statusColors[value]}>{statusLabels[value] || value}</Tag> },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => formatDateTime(value) },
    {
      title: '操作',
      width: 360,
      fixed: 'right',
      render: (_: unknown, record: ProjectItem) => (
        <Space size="small" wrap>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" icon={<TeamOutlined />} onClick={() => void openMembers(record)}>成员</Button>
          <Button type="link" size="small" icon={<HddOutlined />} onClick={() => void openDevices(record)}>设备</Button>
          {record.status === 'ACTIVE' && (
            <Popconfirm
              title={`停用项目“${record.name}”？`}
              description="停用后项目状态变为“暂停”，成员和设备绑定关系不会自动移除。"
              okText="停用"
              cancelText="取消"
              okButtonProps={{ loading: statusUpdatingId === record.id }}
              onConfirm={() => handleStatus(record, 'SUSPENDED')}
            >
              <Button type="link" size="small">停用</Button>
            </Popconfirm>
          )}
          {record.status === 'SUSPENDED' && (
            <Popconfirm
              title={`启用项目“${record.name}”？`}
              description="启用后项目状态变为“活跃”，原有成员和设备绑定继续生效。"
              okText="启用"
              cancelText="取消"
              okButtonProps={{ loading: statusUpdatingId === record.id }}
              onConfirm={() => handleStatus(record, 'ACTIVE')}
            >
              <Button type="link" size="small">启用</Button>
            </Popconfirm>
          )}
          {record.status !== 'ARCHIVED' && (
            <Popconfirm
              title={`归档项目“${record.name}”？`}
              description="归档后项目状态变为“已归档”，成员和设备绑定关系不会自动移除。"
              okText="归档"
              cancelText="取消"
              okButtonProps={{ danger: true, loading: statusUpdatingId === record.id }}
              onConfirm={() => handleStatus(record, 'ARCHIVED')}
            >
              <Button type="link" size="small" danger>归档</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="项目管理"
        description={`共 ${total} 个项目`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建项目</Button>
          </Space>
        }
      />

      <Card className="ff-query-card" styles={{ body: { padding: '12px 16px' } }}>
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            allowClear
            placeholder="搜索项目名称或项目编码"
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="项目状态"
            style={{ width: 160 }}
            value={draftFilters.status}
            options={statusOptions}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>

      <Alert
        style={{ marginBottom: 16, display: loadError ? 'flex' : 'none' }}
        type="error"
        showIcon
        message={loadError}
        action={<Button size="small" onClick={() => void fetchData()}>重试</Button>}
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        size="small"
        scroll={{ x: 1100 }}
        locale={{ emptyText: <ListEmpty hasFilters={hasFilters} emptyText="暂无项目，点击右上角“新建项目”开始创建" onClearFilters={resetFilters} /> }}
        pagination={{
          current: params.pageNum,
          pageSize: params.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => `共 ${count} 条`,
          onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
        }}
      />

      <Modal title={editRecord ? '编辑项目' : '新建项目'} open={editOpen} onCancel={closeEdit} onOk={() => form.submit()} confirmLoading={saving} destroyOnClose width={520}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="code" label="项目编码" rules={[{ required: true, message: '请输入项目编码' }]} extra={editRecord ? '项目编码创建后不可修改。' : '项目在租户内唯一的业务编码，例如 proj-east-01。'}>
            <Input disabled={Boolean(editRecord)} maxLength={64} placeholder="例如：proj-east-01" />
          </Form.Item>
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input maxLength={128} placeholder="例如：华东仓储项目" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} maxLength={256} placeholder="选填，补充项目用途和维护范围" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title={memberProject ? `项目成员 · ${memberProject.name}` : '项目成员'} open={Boolean(memberProject)} onClose={() => setMemberProject(null)} width={520}>
        <Space style={{ marginBottom: 16 }} wrap>
          <UserSelect value={addMemberUserId} onChange={setAddMemberUserId} style={{ width: 240 }} placeholder="搜索姓名或账号添加成员" />
          <Select value={addMemberRole} onChange={setAddMemberRole} style={{ width: 110 }} options={roleOptions} />
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => void handleAddMember()} loading={addingMember}>添加</Button>
        </Space>
        {memberError ? <Alert style={{ marginBottom: 12 }} type="error" showIcon message={memberError} action={memberProject ? <Button size="small" onClick={() => void openMembers(memberProject)}>重试</Button> : null} /> : null}
        <List
          loading={membersLoading}
          dataSource={members}
          locale={{ emptyText: <ListEmpty compact emptyText="当前项目还没有成员" /> }}
          renderItem={(item: MemberItem) => (
            <List.Item
              actions={[
                <Select
                  key="role"
                  size="small"
                  value={item.role}
                  style={{ width: 100 }}
                  loading={memberRoleSavingId === item.userId}
                  options={roleOptions}
                  onChange={(role) => void handleMemberRoleChange(item, role)}
                />,
                <Popconfirm
                  key="remove"
                  title={`移除成员“${memberNames[item.userId] || '成员'}”？`}
                  description="移除后该用户将失去此项目的访问权限，可重新添加。"
                  okText="移除"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleRemoveMember(item)}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={memberNames[item.userId] || '成员信息不可用'}
                description={<Space wrap><Tag>{roleLabels[item.role] || item.role}</Tag><span>加入时间：{formatDateTime(item.createdAt)}</span></Space>}
              />
            </List.Item>
          )}
        />
      </Drawer>

      <Drawer title={deviceProject ? `项目设备 · ${deviceProject.name}` : '项目设备'} open={Boolean(deviceProject)} onClose={() => setDeviceProject(null)} width={560}>
        <Space style={{ marginBottom: 16 }} wrap>
          <DeviceSelect value={bindDeviceId} onChange={setBindDeviceId} style={{ width: 300 }} placeholder="搜索设备名称绑定到项目" />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleBindDevice()} loading={bindingDevice}>绑定</Button>
        </Space>
        {deviceError ? <Alert style={{ marginBottom: 12 }} type="error" showIcon message={deviceError} action={deviceProject ? <Button size="small" onClick={() => void openDevices(deviceProject)}>重试</Button> : null} /> : null}
        <List
          loading={devicesLoading}
          dataSource={devices}
          locale={{ emptyText: <ListEmpty compact emptyText="当前项目还没有绑定设备" /> }}
          renderItem={(item: DeviceItem) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="unbind"
                  title={`解绑设备“${deviceNames[item.deviceId] || '该设备'}”？`}
                  description="解绑后该设备将从当前项目移除，设备本身不会被删除。"
                  okText="解绑"
                  okButtonProps={{ danger: true }}
                  cancelText="取消"
                  onConfirm={() => handleUnbindDevice(item.deviceId)}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>解绑</Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={deviceNames[item.deviceId] || '设备信息不可用'}
                description={`绑定时间：${formatDateTime(item.createdAt)}`}
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  );
};

export default ProjectList;
