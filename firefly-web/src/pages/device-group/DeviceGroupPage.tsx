import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Popconfirm, Select, Space, Table, Tag, Tree, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { DeleteOutlined, EditOutlined, FolderOpenOutlined, FolderOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { deviceApi, deviceGroupApi, deviceTagApi, productApi } from '../../services/api';
import DeviceGroupEditorDrawer from './DeviceGroupEditorDrawer';
import { buildDynamicRulePayload, getGroupTypeMeta, type GroupFormValues, type GroupType, type ProductOptionRecord, type TagOptionRecord } from './deviceGroupRuleUtils';

const { Search } = Input;

interface GroupTreeNode { id: number; name: string; description?: string; type: GroupType; dynamicRule?: string | null; parentId: number | null; deviceCount: number; createdAt?: string; children?: GroupTreeNode[]; }
interface MemberItem { id: number; deviceId: number; deviceName?: string; nickname?: string; productKey?: string; productName?: string; status?: string; onlineStatus?: string; createdAt?: string; }
interface DeviceOptionRecord { id: number; deviceName: string; nickname?: string; }

const flattenTree = (nodes: GroupTreeNode[]): GroupTreeNode[] => { const result: GroupTreeNode[] = []; const walk = (items: GroupTreeNode[]) => items.forEach((item) => { result.push(item); if (item.children?.length) walk(item.children); }); walk(nodes); return result; };
const filterTree = (nodes: GroupTreeNode[], keyword: string): GroupTreeNode[] => !keyword.trim() ? nodes : nodes.flatMap((node) => { const children = filterTree(node.children || [], keyword); return node.name.toLowerCase().includes(keyword.trim().toLowerCase()) || children.length ? [{ ...node, children }] : []; });
const collectDescendantIds = (node?: GroupTreeNode | null) => { const ids = new Set<number>(); if (!node?.children?.length) return ids; const walk = (items: GroupTreeNode[]) => items.forEach((item) => { ids.add(item.id); if (item.children?.length) walk(item.children); }); walk(node.children); return ids; };

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
  const [products, setProducts] = useState<ProductOptionRecord[]>([]);
  const [tags, setTags] = useState<TagOptionRecord[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GroupTreeNode | null>(null);

  const allGroups = useMemo(() => flattenTree(treeData), [treeData]);
  const selectedGroup = useMemo(() => allGroups.find((item) => item.id === selectedGroupId) || null, [allGroups, selectedGroupId]);
  const filteredTree = useMemo(() => filterTree(treeData, treeSearch), [treeData, treeSearch]);
  const stats = useMemo(() => ({ groupCount: allGroups.length, staticCount: allGroups.filter((item) => item.type === 'STATIC').length, dynamicCount: allGroups.filter((item) => item.type === 'DYNAMIC').length, memberCount: allGroups.reduce((sum, item) => sum + (item.deviceCount || 0), 0) }), [allGroups]);
  const parentOptions = useMemo(() => { const excludedIds = new Set<number>(); if (editingRecord) { excludedIds.add(editingRecord.id); collectDescendantIds(editingRecord).forEach((id) => excludedIds.add(id)); } return [{ label: '顶级分组', value: 0 }, ...allGroups.filter((item) => !excludedIds.has(item.id)).map((item) => ({ label: `${item.name} · ${getGroupTypeMeta(item.type).label}`, value: item.id }))]; }, [allGroups, editingRecord]);

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await deviceGroupApi.tree();
      const nextTree = (res.data.data || []) as GroupTreeNode[];
      setTreeData(nextTree);
      const allKeys = flattenTree(nextTree).map((item) => item.id as React.Key);
      setExpandedKeys(allKeys);
      setSelectedGroupId((prev) => (prev && allKeys.includes(prev) ? prev : nextTree[0]?.id ?? null));
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '加载设备分组失败');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async (groupId: number) => {
    setMembersLoading(true);
    try { const res = await deviceGroupApi.listDevices(groupId); setMembers((res.data.data || []) as MemberItem[]); }
    catch (error) { message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '加载分组成员失败'); }
    finally { setMembersLoading(false); }
  }, []);

  const fetchOptions = useCallback(async () => {
    try {
      const [productRes, tagRes] = await Promise.all([productApi.list({ pageNum: 1, pageSize: 500 }), deviceTagApi.listAll()]);
      setProducts((productRes.data.data?.records || []) as ProductOptionRecord[]);
      setTags((tagRes.data.data || []) as TagOptionRecord[]);
    } catch {
      setProducts([]);
      setTags([]);
    }
  }, []);

  const searchDevices = useCallback(async (keyword: string) => {
    if (!selectedGroup || selectedGroup.type !== 'STATIC') { setDeviceOptions([]); return; }
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

  useEffect(() => { void Promise.all([fetchTree(), fetchOptions()]); }, [fetchOptions, fetchTree]);
  useEffect(() => { if (selectedGroup) { void fetchMembers(selectedGroup.id); void searchDevices(''); } else { setMembers([]); setDeviceOptions([]); setBindDeviceId(undefined); } }, [fetchMembers, searchDevices, selectedGroup]);
  useEffect(() => { if (treeSearch.trim()) setExpandedKeys(flattenTree(filteredTree).map((item) => item.id)); }, [filteredTree, treeSearch]);

  const openEditor = (record?: GroupTreeNode | null) => { setEditingRecord(record || null); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditingRecord(null); };
  const handleDelete = async (groupId: number) => { try { await deviceGroupApi.delete(groupId); message.success('分组已删除'); setSelectedGroupId((prev) => (prev === groupId ? null : prev)); await fetchTree(); } catch (error) { message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '删除分组失败'); } };
  const handleAddDevice = async () => { if (!selectedGroup || selectedGroup.type !== 'STATIC' || !bindDeviceId) return; try { await deviceGroupApi.addDevice(selectedGroup.id, bindDeviceId); message.success('设备已加入分组'); setBindDeviceId(undefined); await Promise.all([fetchMembers(selectedGroup.id), fetchTree(), searchDevices('')]); } catch (error) { message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '添加设备失败'); } };
  const handleRemoveDevice = async (deviceId: number) => { if (!selectedGroup || selectedGroup.type !== 'STATIC') return; try { await deviceGroupApi.removeDevice(selectedGroup.id, deviceId); message.success('设备已移出分组'); await Promise.all([fetchMembers(selectedGroup.id), fetchTree(), searchDevices('')]); } catch (error) { message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '移除设备失败'); } };
  const handleSave = async (values: GroupFormValues) => { const payload = { name: values.name?.trim(), description: values.description?.trim() || null, type: values.type || 'STATIC', parentId: values.parentId && values.parentId > 0 ? values.parentId : null, dynamicRule: values.type === 'DYNAMIC' ? JSON.stringify(buildDynamicRulePayload(values)) : null }; try { if (editingRecord && editingRecord.id > 0) { await deviceGroupApi.update(editingRecord.id, payload); message.success('分组更新成功'); } else { await deviceGroupApi.create(payload); message.success('分组创建成功'); } closeEditor(); await fetchTree(); } catch (error) { message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '保存分组失败'); } };

  const columns: ColumnsType<MemberItem> = [
    { title: '设备', dataIndex: 'deviceName', width: 240, render: (_: unknown, record) => <Space direction="vertical" size={2}><Typography.Text strong>{record.deviceName || '设备信息缺失'}</Typography.Text><Typography.Text type="secondary">{record.nickname || '未设置别名'}</Typography.Text></Space> },
    { title: '产品', width: 220, render: (_: unknown, record) => <Space direction="vertical" size={2}><Typography.Text>{record.productName || '-'}</Typography.Text><Typography.Text type="secondary">{record.productKey || '-'}</Typography.Text></Space> },
    { title: '状态', width: 180, render: (_: unknown, record) => <Space wrap>{record.status ? <Tag>{record.status}</Tag> : null}{record.onlineStatus ? <Tag color={record.onlineStatus === 'ONLINE' ? 'success' : 'default'}>{record.onlineStatus}</Tag> : null}</Space> },
    { title: '加入时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => value || '-' },
    { title: '操作', width: 100, fixed: 'right', render: (_: unknown, record) => selectedGroup?.type === 'STATIC' ? <Popconfirm title="确认将该设备移出当前分组吗？" onConfirm={() => void handleRemoveDevice(record.deviceId)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button></Popconfirm> : <Typography.Text type="secondary">系统维护</Typography.Text> },
  ];

  const treeNodes = (nodes: GroupTreeNode[]): DataNode[] => nodes.map((node) => ({ key: node.id, icon: node.children?.length ? <FolderOpenOutlined style={{ color: '#2563eb' }} /> : <FolderOutlined style={{ color: '#64748b' }} />, title: <Space size={8}><Typography.Text strong={selectedGroupId === node.id}>{node.name}</Typography.Text><Tag color={getGroupTypeMeta(node.type).color}>{getGroupTypeMeta(node.type).label}</Tag><Tag>{node.deviceCount || 0} 台</Tag></Space>, children: node.children?.length ? treeNodes(node.children) : undefined }));

  return (
    <div>
      <PageHeader title="设备分组" description="先从左侧选择分组，再查看成员或维护分组配置。" extra={<Space><Button icon={<ReloadOutlined />} onClick={() => void fetchTree()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingRecord(null); setEditorOpen(true); }}>新建分组</Button></Space>} />
      <Card style={{ marginBottom: 16 }}><Space wrap><Tag color="blue">分组总数 {stats.groupCount}</Tag><Tag color="cyan">静态分组 {stats.staticCount}</Tag><Tag color="green">动态分组 {stats.dynamicCount}</Tag><Tag color="geekblue">成员总数 {stats.memberCount}</Tag></Space></Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 380px) minmax(0, 1fr)', gap: 16 }}>
        <Card title="分组目录" extra={selectedGroup ? <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => openEditor(null)} /> : null}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Search allowClear placeholder="搜索分组名称" value={treeSearch} onChange={(event) => setTreeSearch(event.target.value)} />
            {filteredTree.length ? <Tree blockNode showIcon expandedKeys={expandedKeys} onExpand={(keys) => setExpandedKeys(keys)} selectedKeys={selectedGroupId ? [selectedGroupId] : []} onSelect={(keys) => setSelectedGroupId(keys.length ? Number(keys[0]) : null)} treeData={treeNodes(filteredTree)} /> : <Empty description={treeLoading ? '分组加载中…' : treeSearch ? '没有匹配的分组' : '暂无分组'} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Space>
        </Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="分组信息" extra={selectedGroup ? <Space><Button size="small" icon={<EditOutlined />} onClick={() => { setEditingRecord(selectedGroup); setEditorOpen(true); }}>编辑</Button><Popconfirm title="确认删除当前分组及其子分组吗？" onConfirm={() => void handleDelete(selectedGroup.id)}><Button size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space> : null}>
            {selectedGroup ? <Space direction="vertical" size={12} style={{ width: '100%' }}><Typography.Title level={4} style={{ margin: 0 }}>{selectedGroup.name}</Typography.Title><Typography.Paragraph style={{ margin: 0 }}>{selectedGroup.description || '暂无描述'}</Typography.Paragraph><Space wrap><Tag color={getGroupTypeMeta(selectedGroup.type).color}>{getGroupTypeMeta(selectedGroup.type).label}</Tag><Tag>{selectedGroup.deviceCount || 0} 台设备</Tag><Tag>{selectedGroup.parentId ? '子分组' : '顶级分组'}</Tag></Space><Typography.Text type="secondary">{selectedGroup.type === 'DYNAMIC' ? '动态分组成员由系统自动维护。' : '静态分组成员由人工维护。'}</Typography.Text></Space> : <Empty description="先从左侧选择一个分组" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
          <Card title={selectedGroup ? `分组成员 (${members.length})` : '分组成员'} extra={selectedGroup?.type === 'STATIC' ? <Space wrap><Select showSearch filterOption={false} value={bindDeviceId} style={{ width: 320 }} placeholder="搜索设备名称或别名后加入当前分组" notFoundContent={deviceOptionsLoading ? '设备搜索中…' : '没有可加入的设备'} options={deviceOptions} onSearch={(value) => void searchDevices(value)} onFocus={() => void searchDevices('')} onChange={(value) => setBindDeviceId(value)} /><Button type="primary" icon={<PlusOutlined />} onClick={() => void handleAddDevice()} disabled={!bindDeviceId}>加入设备</Button></Space> : selectedGroup?.type === 'DYNAMIC' ? <Typography.Text type="secondary">动态分组成员由系统自动维护</Typography.Text> : null}>
            {selectedGroup ? <Table rowKey="id" loading={membersLoading} columns={columns} dataSource={members} scroll={{ x: 860 }} locale={{ emptyText: <Empty description="当前分组还没有成员设备" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (count) => `共 ${count} 台设备` }} /> : <Empty description="选择分组后可查看成员列表" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Space>
      </div>
      <DeviceGroupEditorDrawer open={editorOpen} editingRecord={editingRecord && editingRecord.id > 0 ? editingRecord : null} parentOptions={parentOptions} products={products} tags={tags} onClose={closeEditor} onSubmit={(values) => void handleSave(values)} />
    </div>
  );
};

export default DeviceGroupPage;
