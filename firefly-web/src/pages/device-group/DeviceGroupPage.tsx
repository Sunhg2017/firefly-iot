import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Tree, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { DeleteOutlined, EditOutlined, FolderOpenOutlined, FolderOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { deviceApi, deviceGroupApi } from '../../services/api';

const { Search, TextArea } = Input;

interface GroupTreeNode {
  id: number;
  name: string;
  description?: string;
  parentId: number | null;
  deviceCount: number;
  createdAt?: string;
  children?: GroupTreeNode[];
}

interface MemberItem {
  id: number;
  deviceId: number;
  deviceName?: string;
  nickname?: string;
  productKey?: string;
  productName?: string;
  status?: string;
  onlineStatus?: string;
  createdAt?: string;
}

interface DeviceOptionRecord {
  id: number;
  deviceName: string;
  nickname?: string;
}

interface GroupFormValues {
  name: string;
  description?: string;
  parentId?: number | null;
}

const flattenTree = (nodes: GroupTreeNode[]): GroupTreeNode[] => {
  const result: GroupTreeNode[] = [];
  const walk = (items: GroupTreeNode[]) => items.forEach((item) => { result.push(item); if (item.children?.length) walk(item.children); });
  walk(nodes);
  return result;
};

const collectDescendantIds = (node?: GroupTreeNode | null) => {
  const ids = new Set<number>();
  if (!node?.children?.length) return ids;
  const walk = (items: GroupTreeNode[]) => items.forEach((item) => { ids.add(item.id); if (item.children?.length) walk(item.children); });
  walk(node.children);
  return ids;
};

const filterTree = (nodes: GroupTreeNode[], keyword: string): GroupTreeNode[] => {
  if (!keyword.trim()) return nodes;
  const lowered = keyword.trim().toLowerCase();
  return nodes.flatMap((node) => {
    const children = filterTree(node.children || [], keyword);
    if (node.name.toLowerCase().includes(lowered) || children.length > 0) return [{ ...node, children }];
    return [];
  });
};

const toTreeData = (nodes: GroupTreeNode[], selectedGroupId: number | null): DataNode[] => nodes.map((node) => ({
  key: node.id,
  icon: node.children?.length ? <FolderOpenOutlined style={{ color: '#2563eb' }} /> : <FolderOutlined style={{ color: '#64748b' }} />,
  title: (
    <Space size={8}>
      <Typography.Text strong={selectedGroupId === node.id}>{node.name}</Typography.Text>
      <Tag color="blue">{node.deviceCount || 0} 台</Tag>
    </Space>
  ),
  children: node.children?.length ? toTreeData(node.children, selectedGroupId) : undefined,
}));

const DeviceGroupPage: React.FC = () => {
  const [treeData, setTreeData] = useState<GroupTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [deviceOptions, setDeviceOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [deviceOptionsLoading, setDeviceOptionsLoading] = useState(false);
  const [bindDeviceId, setBindDeviceId] = useState<number | undefined>();
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<GroupTreeNode | null>(null);
  const [form] = Form.useForm<GroupFormValues>();

  const allGroups = useMemo(() => flattenTree(treeData), [treeData]);
  const selectedGroup = useMemo(() => allGroups.find((item) => item.id === selectedGroupId) || null, [allGroups, selectedGroupId]);
  const filteredTree = useMemo(() => filterTree(treeData, treeSearch), [treeData, treeSearch]);

  const stats = useMemo(() => ({
    groupCount: allGroups.length,
    memberCount: allGroups.reduce((sum, item) => sum + (item.deviceCount || 0), 0),
  }), [allGroups]);

  const parentOptions = useMemo(() => {
    const excludedIds = new Set<number>();
    if (editRecord) {
      excludedIds.add(editRecord.id);
      collectDescendantIds(editRecord).forEach((id) => excludedIds.add(id));
    }
    return [{ label: '顶级分组', value: 0 }, ...allGroups.filter((item) => !excludedIds.has(item.id)).map((item) => ({ label: item.name, value: item.id }))];
  }, [allGroups, editRecord]);

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await deviceGroupApi.tree();
      const nextTree = (res.data.data || []) as GroupTreeNode[];
      setTreeData(nextTree);
      const allKeys = flattenTree(nextTree).map((item) => item.id as React.Key);
      setExpandedKeys(allKeys);
      setSelectedGroupId((prev) => (prev && allKeys.includes(prev) ? prev : null));
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '加载设备分组失败');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async (groupId: number) => {
    setMembersLoading(true);
    try {
      const res = await deviceGroupApi.listDevices(groupId);
      setMembers((res.data.data || []) as MemberItem[]);
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '加载分组成员失败');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const searchDevices = useCallback(async (keyword: string) => {
    if (!selectedGroup) { setDeviceOptions([]); return; }
    setDeviceOptionsLoading(true);
    try {
      const res = await deviceApi.list({ pageNum: 1, pageSize: 50, keyword: keyword.trim() || undefined });
      const existingIds = new Set(members.map((item) => item.deviceId));
      const records = ((res.data.data?.records || []) as DeviceOptionRecord[]).filter((item) => !existingIds.has(item.id));
      setDeviceOptions(records.map((item) => ({ value: item.id, label: item.nickname ? `${item.deviceName} / ${item.nickname}` : item.deviceName })));
    } catch (error) {
      setDeviceOptions([]);
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '加载设备候选失败');
    } finally {
      setDeviceOptionsLoading(false);
    }
  }, [members, selectedGroup]);

  useEffect(() => { void fetchTree(); }, [fetchTree]);
  useEffect(() => { if (selectedGroup) { void fetchMembers(selectedGroup.id); void searchDevices(''); } else { setMembers([]); setDeviceOptions([]); setBindDeviceId(undefined); } }, [fetchMembers, searchDevices, selectedGroup]);
  useEffect(() => { if (treeSearch.trim()) setExpandedKeys(flattenTree(filteredTree).map((item) => item.id)); }, [filteredTree, treeSearch]);

  const openEditor = (record?: GroupTreeNode | null, parentId?: number | null) => {
    setEditRecord(record || null);
    if (record) form.setFieldsValue({ name: record.name, description: record.description, parentId: record.parentId ?? 0 });
    else form.setFieldsValue({ name: undefined, description: undefined, parentId: parentId ?? 0 });
    setEditOpen(true);
  };

  const handleSave = async (values: GroupFormValues) => {
    const payload = { ...values, type: 'STATIC', dynamicRule: null, parentId: values.parentId && values.parentId > 0 ? values.parentId : null };
    try {
      if (editRecord) { await deviceGroupApi.update(editRecord.id, payload); message.success('分组更新成功'); }
      else { await deviceGroupApi.create(payload); message.success('分组创建成功'); }
      setEditOpen(false);
      await fetchTree();
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '保存分组失败');
    }
  };

  const handleDelete = async (groupId: number) => {
    try {
      await deviceGroupApi.delete(groupId);
      message.success('分组已删除');
      setSelectedGroupId((prev) => (prev === groupId ? null : prev));
      await fetchTree();
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '删除分组失败');
    }
  };

  const handleAddDevice = async () => {
    if (!selectedGroup || !bindDeviceId) return;
    try {
      await deviceGroupApi.addDevice(selectedGroup.id, bindDeviceId);
      message.success('设备已加入分组');
      setBindDeviceId(undefined);
      await Promise.all([fetchMembers(selectedGroup.id), fetchTree(), searchDevices('')]);
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '添加设备失败');
    }
  };

  const handleRemoveDevice = async (deviceId: number) => {
    if (!selectedGroup) return;
    try {
      await deviceGroupApi.removeDevice(selectedGroup.id, deviceId);
      message.success('设备已移出分组');
      await Promise.all([fetchMembers(selectedGroup.id), fetchTree(), searchDevices('')]);
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '移除设备失败');
    }
  };

  const memberColumns: ColumnsType<MemberItem> = [
    { title: '设备', dataIndex: 'deviceName', width: 240, render: (_: unknown, record) => <Space direction="vertical" size={2}><Typography.Text strong>{record.deviceName || '设备信息缺失'}</Typography.Text><Typography.Text type="secondary">{record.nickname || '未设置别名'}</Typography.Text></Space> },
    { title: '产品', width: 220, render: (_: unknown, record) => <Space direction="vertical" size={2}><Typography.Text>{record.productName || '-'}</Typography.Text><Typography.Text type="secondary">{record.productKey || '-'}</Typography.Text></Space> },
    { title: '状态', width: 160, render: (_: unknown, record) => <Space wrap>{record.status ? <Tag>{record.status}</Tag> : null}{record.onlineStatus ? <Tag color={record.onlineStatus === 'ONLINE' ? 'success' : 'default'}>{record.onlineStatus}</Tag> : null}</Space> },
    { title: '加入时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => value || '-' },
    { title: '操作', width: 90, fixed: 'right', render: (_: unknown, record) => <Popconfirm title="确认将该设备移出当前分组吗？" onConfirm={() => void handleRemoveDevice(record.deviceId)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button></Popconfirm> },
  ];

  return (
    <div>
      <PageHeader title="设备分组" description="当前版本只启用静态分组，设备创建、编辑和导入会直接维护分组关系。" extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void fetchTree()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null, selectedGroup?.id ?? 0)}>新建分组</Button></Space>} />

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Tag color="blue">分组总数 {stats.groupCount}</Tag>
          <Tag color="geekblue">成员总数 {stats.memberCount}</Tag>
          <Tag>动态分组未启用</Tag>
        </Space>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 360px) minmax(0, 1fr)', gap: 16 }}>
        <Card title="分组目录" extra={selectedGroup ? <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => openEditor(null, selectedGroup.id)} /> : null}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Search allowClear placeholder="搜索分组名称" value={treeSearch} onChange={(event) => setTreeSearch(event.target.value)} />
            {filteredTree.length ? <Tree blockNode showIcon expandedKeys={expandedKeys} onExpand={(keys) => setExpandedKeys(keys)} selectedKeys={selectedGroupId ? [selectedGroupId] : []} onSelect={(keys) => setSelectedGroupId(keys.length ? Number(keys[0]) : null)} treeData={toTreeData(filteredTree, selectedGroupId)} /> : <Empty description={treeLoading ? '分组加载中…' : treeSearch ? '没有匹配的分组' : '暂无分组'} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Space>
        </Card>

        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="分组信息" extra={selectedGroup ? <Space><Button size="small" icon={<EditOutlined />} onClick={() => openEditor(selectedGroup)}>编辑</Button><Popconfirm title="确认删除当前分组及其子分组吗？" onConfirm={() => void handleDelete(selectedGroup.id)}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> : null}>
            {selectedGroup ? <Space direction="vertical" size={12} style={{ width: '100%' }}><Typography.Title level={4} style={{ margin: 0 }}>{selectedGroup.name}</Typography.Title><Typography.Paragraph style={{ margin: 0 }}>{selectedGroup.description || '暂无描述'}</Typography.Paragraph><Space wrap><Tag color="blue">静态分组</Tag><Tag>{selectedGroup.deviceCount || 0} 台设备</Tag><Tag>{selectedGroup.parentId ? '子分组' : '顶级分组'}</Tag></Space></Space> : <Empty description="先从左侧选择一个分组" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>

          <Card title={selectedGroup ? `分组成员 (${members.length})` : '分组成员'} extra={selectedGroup ? <Space wrap><Select showSearch filterOption={false} value={bindDeviceId} style={{ width: 320 }} placeholder="搜索设备名称或别名后加入当前分组" notFoundContent={deviceOptionsLoading ? '设备搜索中…' : '没有可加入的设备'} options={deviceOptions} onSearch={(value) => void searchDevices(value)} onFocus={() => void searchDevices('')} onChange={(value) => setBindDeviceId(value)} /><Button type="primary" icon={<PlusOutlined />} onClick={() => void handleAddDevice()} disabled={!bindDeviceId}>加入设备</Button></Space> : null}>
            {selectedGroup ? <Table rowKey="id" loading={membersLoading} columns={memberColumns} dataSource={members} scroll={{ x: 860 }} locale={{ emptyText: <Empty description="当前分组还没有成员设备" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (count) => `共 ${count} 台设备` }} /> : <Empty description="选择分组后可查看成员列表" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Space>
      </div>

      <Modal title={editRecord ? '编辑分组' : '新建分组'} open={editOpen} width={560} destroyOnHidden onCancel={() => setEditOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={(values) => void handleSave(values)}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}><Input maxLength={64} placeholder="例如：华东仓储 / 二号厂区 / 一层网关" /></Form.Item>
          <Form.Item name="parentId" label="上级分组"><Select options={parentOptions} placeholder="不选择则为顶级分组" /></Form.Item>
          <Form.Item name="description" label="分组描述"><TextArea rows={4} maxLength={256} placeholder="补充分组用途、业务范围和维护口径" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DeviceGroupPage;
