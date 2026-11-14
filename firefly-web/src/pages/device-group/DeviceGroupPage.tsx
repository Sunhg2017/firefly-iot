import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Popconfirm, Select, Space, Table, Tag, Tooltip, Tree, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { DeleteOutlined, EditOutlined, FolderOpenOutlined, FolderOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { deviceApi, deviceGroupApi, deviceTagApi } from '../../services/api';
import DeviceGroupEditorDrawer from './DeviceGroupEditorDrawer';
import {
  buildDynamicRulePayload,
  getDeviceStatusMeta,
  getGroupTypeMeta,
  getOnlineStatusMeta,
  type GroupFormValues,
  type GroupType,
  type TagOptionRecord,
} from './deviceGroupRuleUtils';

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
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [deviceOptions, setDeviceOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [deviceOptionsLoading, setDeviceOptionsLoading] = useState(false);
  const [bindDeviceId, setBindDeviceId] = useState<number | undefined>();
  const [deviceActionLoading, setDeviceActionLoading] = useState(false);
  const [tags, setTags] = useState<TagOptionRecord[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GroupTreeNode | null>(null);
  const [defaultParentId, setDefaultParentId] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);

  // 成员列表是设备候选过滤的依据。用 ref 保存最新成员 ID，避免 searchDevices 依赖 members
  // 后与 fetchMembers 形成“设置成员 -> 重跑搜索 -> 再设置成员”的请求死循环。
  const membersRef = useRef<MemberItem[]>([]);
  const treeRequestIdRef = useRef(0);
  const membersRequestIdRef = useRef(0);
  const deviceSearchRequestIdRef = useRef(0);

  const allGroups = useMemo(() => flattenTree(treeData), [treeData]);
  const selectedGroup = useMemo(() => allGroups.find((item) => item.id === selectedGroupId) || null, [allGroups, selectedGroupId]);
  const selectedGroupIdValue = selectedGroup?.id ?? null;
  const selectedGroupType = selectedGroup?.type;
  const filteredTree = useMemo(() => filterTree(treeData, treeSearch), [treeData, treeSearch]);
  const stats = useMemo(() => ({ groupCount: allGroups.length, staticCount: allGroups.filter((item) => item.type === 'STATIC').length, dynamicCount: allGroups.filter((item) => item.type === 'DYNAMIC').length, memberCount: allGroups.reduce((sum, item) => sum + (item.deviceCount || 0), 0) }), [allGroups]);
  const parentOptions = useMemo(() => { const excludedIds = new Set<number>(); if (editingRecord) { excludedIds.add(editingRecord.id); collectDescendantIds(editingRecord).forEach((id) => excludedIds.add(id)); } return [{ label: '顶级分组', value: 0 }, ...allGroups.filter((item) => !excludedIds.has(item.id)).map((item) => ({ label: `${item.name} · ${getGroupTypeMeta(item.type).label}`, value: item.id }))]; }, [allGroups, editingRecord]);
  const deleteImpact = useMemo(() => {
    if (!selectedGroup) {
      return null;
    }
    const groupIds = collectDescendantIds(selectedGroup);
    groupIds.add(selectedGroup.id);
    const nodes = allGroups.filter((item) => groupIds.has(item.id));
    return {
      childCount: groupIds.size - 1,
      deviceCount: nodes.reduce((sum, item) => sum + (item.deviceCount || 0), 0),
    };
  }, [allGroups, selectedGroup]);

  const fetchTree = useCallback(async () => {
    const requestId = treeRequestIdRef.current + 1;
    treeRequestIdRef.current = requestId;
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await deviceGroupApi.tree();
      if (requestId !== treeRequestIdRef.current) {
        return;
      }
      const nextTree = (res.data.data || []) as GroupTreeNode[];
      setTreeData(nextTree);
      const allKeys = flattenTree(nextTree).map((item) => item.id as React.Key);
      setExpandedKeys(allKeys);
      setSelectedGroupId((prev) => (prev && allKeys.includes(prev) ? prev : nextTree[0]?.id ?? null));
    } catch (error) {
      if (requestId !== treeRequestIdRef.current) {
        return;
      }
      const errorMessage = getErrorMessage(error, '加载设备分组失败');
      setTreeError(errorMessage);
      message.error(errorMessage);
    } finally {
      if (requestId === treeRequestIdRef.current) {
        setTreeLoading(false);
      }
    }
  }, []);

  const fetchMembers = useCallback(async (groupId: number) => {
    const requestId = membersRequestIdRef.current + 1;
    membersRequestIdRef.current = requestId;
    setMembersLoading(true);
    setMembersError(null);
    setMembers([]);
    membersRef.current = [];
    try {
      const res = await deviceGroupApi.listDevices(groupId);
      if (requestId !== membersRequestIdRef.current) {
        return;
      }
      const nextMembers = (res.data.data || []) as MemberItem[];
      membersRef.current = nextMembers;
      setMembers(nextMembers);
    } catch (error) {
      if (requestId !== membersRequestIdRef.current) {
        return;
      }
      const errorMessage = getErrorMessage(error, '加载分组成员失败');
      setMembersError(errorMessage);
      message.error(errorMessage);
    } finally {
      if (requestId === membersRequestIdRef.current) {
        setMembersLoading(false);
      }
    }
  }, []);

  const fetchOptions = useCallback(async () => {
    try {
      const tagRes = await deviceTagApi.listAll();
      setTags((tagRes.data.data || []) as TagOptionRecord[]);
    } catch (error) {
      setTags([]);
      message.warning(getErrorMessage(error, '加载标签选项失败，动态分组条件可能无法选择对应项'));
    }
  }, []);

  const searchDevices = useCallback(async (keyword: string) => {
    if (!selectedGroupIdValue || selectedGroupType !== 'STATIC') {
      setDeviceOptions([]);
      return;
    }
    const requestId = deviceSearchRequestIdRef.current + 1;
    deviceSearchRequestIdRef.current = requestId;
    setDeviceOptionsLoading(true);
    try {
      const res = await deviceApi.list({ pageNum: 1, pageSize: 50, keyword: keyword.trim() || undefined });
      if (requestId !== deviceSearchRequestIdRef.current) {
        return;
      }
      const existingIds = new Set(membersRef.current.map((item) => item.deviceId));
      const records = ((res.data.data?.records || []) as DeviceOptionRecord[]).filter((item) => !existingIds.has(item.id));
      setDeviceOptions(records.map((item) => ({ value: item.id, label: item.nickname ? `${item.deviceName} / ${item.nickname}` : item.deviceName })));
    } catch (error) {
      if (requestId !== deviceSearchRequestIdRef.current) {
        return;
      }
      setDeviceOptions([]);
      message.error(getErrorMessage(error, '加载设备候选失败'));
    } finally {
      if (requestId === deviceSearchRequestIdRef.current) {
        setDeviceOptionsLoading(false);
      }
    }
  }, [selectedGroupIdValue, selectedGroupType]);

  useEffect(() => { void Promise.all([fetchTree(), fetchOptions()]); }, [fetchOptions, fetchTree]);
  useEffect(() => {
    if (!selectedGroupIdValue) {
      membersRequestIdRef.current += 1;
      membersRef.current = [];
      setMembers([]);
      setMembersError(null);
      setDeviceOptions([]);
      setBindDeviceId(undefined);
      return;
    }
    void fetchMembers(selectedGroupIdValue);
    void searchDevices('');
  }, [fetchMembers, searchDevices, selectedGroupIdValue]);
  useEffect(() => {
    setExpandedKeys(flattenTree(treeSearch.trim() ? filteredTree : treeData).map((item) => item.id));
  }, [filteredTree, treeData, treeSearch]);

  const handleActivate = useCallback(() => {
    void fetchTree();
    if (selectedGroupIdValue) {
      void fetchMembers(selectedGroupIdValue);
      void searchDevices('');
    }
  }, [fetchMembers, fetchTree, searchDevices, selectedGroupIdValue]);
  usePageActivation(handleActivate);

  const openEditor = (record?: GroupTreeNode | null, parentId?: number) => { setEditingRecord(record || null); setDefaultParentId(parentId); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditingRecord(null); setDefaultParentId(undefined); };
  const handleDelete = async (groupId: number) => {
    try {
      await deviceGroupApi.delete(groupId);
      message.success('分组已删除');
      setSelectedGroupId((prev) => (prev === groupId ? null : prev));
      await fetchTree();
    } catch (error) {
      message.error(getErrorMessage(error, '删除分组失败'));
    }
  };
  const handleAddDevice = async () => {
    if (!selectedGroup || selectedGroup.type !== 'STATIC') {
      return;
    }
    if (!bindDeviceId) {
      message.warning('请先选择要加入当前分组的设备');
      return;
    }
    setDeviceActionLoading(true);
    try {
      await deviceGroupApi.addDevice(selectedGroup.id, bindDeviceId);
      message.success('设备已加入分组');
      setBindDeviceId(undefined);
      // fetchMembers 会同步 membersRef，因此随后搜索候选时能立即排除刚加入的设备。
      await fetchMembers(selectedGroup.id);
      await fetchTree();
      await searchDevices('');
    } catch (error) {
      message.error(getErrorMessage(error, '添加设备失败'));
    } finally {
      setDeviceActionLoading(false);
    }
  };
  const handleRemoveDevice = async (deviceId: number) => {
    if (!selectedGroup || selectedGroup.type !== 'STATIC') {
      return;
    }
    try {
      await deviceGroupApi.removeDevice(selectedGroup.id, deviceId);
      message.success('设备已移出分组');
      await fetchMembers(selectedGroup.id);
      await fetchTree();
      await searchDevices('');
    } catch (error) {
      message.error(getErrorMessage(error, '移除设备失败'));
    }
  };
  const handleSave = async (values: GroupFormValues) => {
    const payload = { name: values.name?.trim(), description: values.description?.trim() || null, type: values.type || 'STATIC', parentId: values.parentId && values.parentId > 0 ? values.parentId : null, dynamicRule: values.type === 'DYNAMIC' ? JSON.stringify(buildDynamicRulePayload(values)) : null };
    setSaving(true);
    try {
      if (editingRecord && editingRecord.id > 0) {
        await deviceGroupApi.update(editingRecord.id, payload);
        message.success('分组更新成功');
      } else {
        await deviceGroupApi.create(payload);
        message.success('分组创建成功');
      }
      closeEditor();
      await fetchTree();
    } catch (error) {
      message.error(getErrorMessage(error, '保存分组失败'));
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<MemberItem> = [
    { title: '设备', dataIndex: 'deviceName', width: 240, render: (_: unknown, record) => <Space direction="vertical" size={2}>{record.deviceName ? <CopyText text={record.deviceName} strong /> : <Typography.Text type="secondary">设备信息不可用</Typography.Text>}<Typography.Text type="secondary">{record.nickname || '未设置别名'}</Typography.Text></Space> },
    { title: '产品', width: 220, render: (_: unknown, record) => <Space direction="vertical" size={2}><Typography.Text>{record.productName || '-'}</Typography.Text>{record.productKey ? <CopyText text={record.productKey} secondary ellipsis /> : <Typography.Text type="secondary">-</Typography.Text>}</Space> },
    {
      title: '状态',
      width: 180,
      render: (_: unknown, record) => {
        const statusMeta = getDeviceStatusMeta(record.status);
        const onlineMeta = getOnlineStatusMeta(record.onlineStatus);
        return (
          <Space wrap>
            {statusMeta ? <Tag color={statusMeta.color}>{statusMeta.label}</Tag> : null}
            {onlineMeta ? <Tag color={onlineMeta.color}>{onlineMeta.label}</Tag> : null}
          </Space>
        );
      },
    },
    { title: '加入时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => formatDateTime(value) },
    { title: '操作', width: 100, fixed: 'right', render: (_: unknown, record) => selectedGroup?.type === 'STATIC' ? <Popconfirm title="将该设备移出当前分组？" description="移出后设备本身不会被删除，可重新加入其他分组。" onConfirm={() => handleRemoveDevice(record.deviceId)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button></Popconfirm> : <Typography.Text type="secondary">系统维护</Typography.Text> },
  ];

  const treeNodes = (nodes: GroupTreeNode[]): DataNode[] => nodes.map((node) => ({ key: node.id, icon: node.children?.length ? <FolderOpenOutlined style={{ color: '#2563eb' }} /> : <FolderOutlined style={{ color: '#64748b' }} />, title: <Space size={8}><Typography.Text strong={selectedGroupId === node.id}>{node.name}</Typography.Text><Tag color={getGroupTypeMeta(node.type).color}>{getGroupTypeMeta(node.type).label}</Tag><Tag>{node.deviceCount || 0} 台</Tag></Space>, children: node.children?.length ? treeNodes(node.children) : undefined }));

  const deleteDescription = deleteImpact
    ? `删除后当前分组、其下 ${deleteImpact.childCount} 个子分组以及这些分组中的 ${deleteImpact.deviceCount} 条设备成员绑定将一并删除（设备本身不会被删除），操作不可恢复。`
    : '删除后分组及其成员绑定将一并删除，操作不可恢复。';

  return (
    <div>
      <PageHeader
        title="设备分组"
        description={`共 ${stats.groupCount} 个分组`}
        extra={
          <Space>
            <Tooltip title="刷新分组列表">
              <Button icon={<ReloadOutlined />} aria-label="刷新分组列表" onClick={() => void Promise.all([fetchTree(), fetchOptions()])} loading={treeLoading} />
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>新建分组</Button>
          </Space>
        }
      />
      <Card style={{ marginBottom: 16 }}><Space wrap><Tag color="blue">分组总数 {stats.groupCount}</Tag><Tag color="cyan">静态分组 {stats.staticCount}</Tag><Tag color="green">动态分组 {stats.dynamicCount}</Tag><Tag color="geekblue">成员总数 {stats.memberCount}</Tag></Space></Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 380px) minmax(0, 1fr)', gap: 16 }}>
        <Card
          title="分组目录"
          extra={selectedGroup ? (
            <Tooltip title={`在“${selectedGroup.name}”下新建子分组`}>
              <Button type="text" size="small" icon={<PlusOutlined />} aria-label="新建子分组" onClick={() => openEditor(null, selectedGroup.id)} />
            </Tooltip>
          ) : null}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Search allowClear placeholder="搜索分组名称" value={treeSearch} onChange={(event) => setTreeSearch(event.target.value)} />
            {treeError ? <Alert type="error" showIcon message={treeError} action={<Button size="small" onClick={() => void fetchTree()}>重试</Button>} /> : null}
            {filteredTree.length ? <Tree blockNode showIcon expandedKeys={expandedKeys} onExpand={(keys) => setExpandedKeys(keys)} selectedKeys={selectedGroupId ? [selectedGroupId] : []} onSelect={(keys) => setSelectedGroupId(keys.length ? Number(keys[0]) : null)} treeData={treeNodes(filteredTree)} /> : <ListEmpty hasFilters={Boolean(treeSearch.trim())} emptyText={treeLoading ? '分组加载中…' : '暂无分组'} filteredText="没有匹配的分组" onClearFilters={() => setTreeSearch('')} />}
          </Space>
        </Card>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            title="分组信息"
            extra={selectedGroup ? (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(selectedGroup)}>编辑</Button>
                <Popconfirm title={`删除分组“${selectedGroup.name}”？`} description={deleteDescription} okText="删除" okButtonProps={{ danger: true }} cancelText="取消" onConfirm={() => handleDelete(selectedGroup.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ) : null}
          >
            {selectedGroup ? <Space direction="vertical" size={12} style={{ width: '100%' }}><Typography.Title level={4} style={{ margin: 0 }}>{selectedGroup.name}</Typography.Title><Typography.Paragraph style={{ margin: 0 }}>{selectedGroup.description || '暂无描述'}</Typography.Paragraph><Space wrap><Tag color={getGroupTypeMeta(selectedGroup.type).color}>{getGroupTypeMeta(selectedGroup.type).label}</Tag><Tag>{selectedGroup.deviceCount || 0} 台设备</Tag><Tag>{selectedGroup.parentId ? '子分组' : '顶级分组'}</Tag></Space><Typography.Text type="secondary">{selectedGroup.type === 'DYNAMIC' ? '动态分组成员由系统自动维护。' : '静态分组成员由人工维护。'}</Typography.Text></Space> : <ListEmpty emptyText="请选择左侧分组" />}
          </Card>
          <Card
            title={selectedGroup ? `分组成员 (${members.length})` : '分组成员'}
            extra={selectedGroup?.type === 'STATIC' ? (
              <Space wrap>
                <Select
                  showSearch
                  allowClear
                  filterOption={false}
                  value={bindDeviceId}
                  style={{ width: 320 }}
                  placeholder="搜索设备名称或别名后加入当前分组"
                  notFoundContent={deviceOptionsLoading ? '设备搜索中…' : '没有可加入的设备'}
                  options={deviceOptions}
                  onSearch={(value) => void searchDevices(value)}
                  onFocus={() => void searchDevices('')}
                  onChange={(value) => setBindDeviceId(value)}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleAddDevice()} loading={deviceActionLoading} disabled={!bindDeviceId}>加入设备</Button>
              </Space>
            ) : selectedGroup?.type === 'DYNAMIC' ? <Typography.Text type="secondary">动态分组成员由系统自动维护</Typography.Text> : null}
          >
            {selectedGroup ? (
              <>
                {membersError ? <Alert style={{ marginBottom: 12 }} type="error" showIcon message={membersError} action={<Button size="small" onClick={() => void fetchMembers(selectedGroup.id)}>重试</Button>} /> : null}
                <Table rowKey="id" loading={membersLoading} columns={columns} dataSource={members} scroll={{ x: 860 }} locale={{ emptyText: <ListEmpty emptyText="当前分组还没有成员设备" compact /> }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (count) => `共 ${count} 台设备` }} />
              </>
            ) : <ListEmpty emptyText="选择分组后可查看成员列表" />}
          </Card>
        </Space>
      </div>
      <DeviceGroupEditorDrawer open={editorOpen} editingRecord={editingRecord && editingRecord.id > 0 ? editingRecord : null} defaultParentId={defaultParentId} parentOptions={parentOptions} tags={tags} submitting={saving} onClose={closeEditor} onSubmit={handleSave} />
    </div>
  );
};

export default DeviceGroupPage;
