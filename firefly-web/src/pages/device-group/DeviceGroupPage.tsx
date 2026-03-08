import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tree, Table, Button, Space, message, Modal, Form, Input, Select, Tag, Popconfirm,
  InputNumber, Card, Row, Col, Empty, Tooltip, Badge, Typography,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, HddOutlined, AppstoreOutlined,
  ThunderboltOutlined, ClusterOutlined, ReloadOutlined, FolderOutlined,
  FolderOpenOutlined, TeamOutlined, SearchOutlined,
} from '@ant-design/icons';
import { deviceGroupApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode, AntTreeNodeProps } from 'antd/es/tree';
import PageHeader from '../../components/PageHeader';

const { Text } = Typography;

// ============================================================
// Types
// ============================================================

interface GroupTreeNode {
  id: number;
  name: string;
  description: string;
  type: string;
  dynamicRule: string;
  parentId: number | null;
  deviceCount: number;
  createdAt: string;
  children?: GroupTreeNode[];
}

interface MemberItem {
  id: number;
  groupId: number;
  deviceId: number;
  createdAt: string;
}

const typeLabels: Record<string, string> = { STATIC: '静态分组', DYNAMIC: '动态分组' };
const typeColors: Record<string, string> = { STATIC: 'blue', DYNAMIC: 'green' };

// ============================================================
// Helpers
// ============================================================

/** Flatten tree into array */
function flattenTree(nodes: GroupTreeNode[]): GroupTreeNode[] {
  const result: GroupTreeNode[] = [];
  const walk = (list: GroupTreeNode[]) => {
    for (const n of list) {
      result.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

/** Convert GroupTreeNode[] → Ant Design Tree DataNode[] */
function toAntTreeData(
  nodes: GroupTreeNode[],
  selectedId: number | null,
): DataNode[] {
  return nodes.map((n) => ({
    key: n.id,
    title: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: selectedId === n.id ? 600 : 400 }}>{n.name}</span>
        <Tag color={typeColors[n.type]} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginRight: 0 }}>
          {n.type === 'STATIC' ? '静态' : '动态'}
        </Tag>
        <Badge count={n.deviceCount} style={{ backgroundColor: '#4f46e5', fontSize: 10, boxShadow: 'none' }} overflowCount={999} showZero={false} />
      </span>
    ),
    icon: n.children?.length
      ? (props: AntTreeNodeProps) => props.expanded ? <FolderOpenOutlined style={{ color: '#4f46e5' }} /> : <FolderOutlined style={{ color: '#4f46e5' }} />
      : <FolderOutlined style={{ color: '#8c8c8c' }} />,
    children: n.children?.length ? toAntTreeData(n.children, selectedId) : undefined,
  }));
}

// ============================================================
// Component
// ============================================================

const DeviceGroupPage: React.FC = () => {
  // --- Tree data ---
  const [treeData, setTreeData] = useState<GroupTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupTreeNode | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  // --- Members ---
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [bindDeviceId, setBindDeviceId] = useState<number | null>(null);

  // --- Edit modal ---
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<GroupTreeNode | null>(null);
  const [form] = Form.useForm();

  // ============================================================
  // Fetch tree
  // ============================================================

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await deviceGroupApi.tree();
      const tree: GroupTreeNode[] = res.data.data || [];
      setTreeData(tree);
      // Auto-expand all on first load
      const allIds = flattenTree(tree).map((n) => n.id as React.Key);
      setExpandedKeys(allIds);
    } catch {
      message.error('加载分组树失败');
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  // ============================================================
  // Stats
  // ============================================================

  const allGroups = useMemo(() => flattenTree(treeData), [treeData]);

  const stats = useMemo(() => ({
    total: allGroups.length,
    staticGroups: allGroups.filter((g) => g.type === 'STATIC').length,
    dynamicGroups: allGroups.filter((g) => g.type === 'DYNAMIC').length,
    totalDevices: allGroups.reduce((s, g) => s + (g.deviceCount || 0), 0),
  }), [allGroups]);

  // ============================================================
  // Fetch members when group selected
  // ============================================================

  const fetchMembers = useCallback(async (groupId: number) => {
    setMembersLoading(true);
    try {
      const res = await deviceGroupApi.listDevices(groupId);
      setMembers(res.data.data || []);
    } catch {
      message.error('加载分组设备失败');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchMembers(selectedGroup.id);
    } else {
      setMembers([]);
    }
  }, [selectedGroup, fetchMembers]);

  // ============================================================
  // Tree select
  // ============================================================

  const handleTreeSelect = (keys: React.Key[]) => {
    if (keys.length === 0) {
      setSelectedGroup(null);
      return;
    }
    const id = keys[0] as number;
    const found = allGroups.find((g) => g.id === id) || null;
    setSelectedGroup(found);
  };

  // ============================================================
  // CRUD
  // ============================================================

  const handleEdit = (record: GroupTreeNode | null, parentId?: number) => {
    setEditRecord(record);
    if (record) {
      form.setFieldsValue(record);
    } else {
      form.resetFields();
      form.setFieldsValue({ type: 'STATIC', parentId: parentId || null });
    }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      if (editRecord) {
        await deviceGroupApi.update(editRecord.id, values);
        message.success('更新成功');
      } else {
        await deviceGroupApi.create(values);
        message.success('创建成功');
      }
      setEditOpen(false);
      fetchTree();
    } catch {
      message.error('保存失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deviceGroupApi.delete(id);
      message.success('已删除');
      if (selectedGroup?.id === id) setSelectedGroup(null);
      fetchTree();
    } catch {
      message.error('删除失败');
    }
  };

  // ============================================================
  // Members CRUD
  // ============================================================

  const handleAddDevice = async () => {
    if (!bindDeviceId || !selectedGroup) return;
    try {
      await deviceGroupApi.addDevice(selectedGroup.id, bindDeviceId);
      message.success('添加成功');
      setBindDeviceId(null);
      fetchMembers(selectedGroup.id);
      fetchTree();
    } catch {
      message.error('添加失败');
    }
  };

  const handleRemoveDevice = async (deviceId: number) => {
    if (!selectedGroup) return;
    try {
      await deviceGroupApi.removeDevice(selectedGroup.id, deviceId);
      message.success('已移除');
      fetchMembers(selectedGroup.id);
      fetchTree();
    } catch {
      message.error('移除失败');
    }
  };

  // ============================================================
  // Members table columns
  // ============================================================

  const memberColumns: ColumnsType<MemberItem> = [
    { title: '设备 ID', dataIndex: 'deviceId', width: 100 },
    { title: '加入时间', dataIndex: 'createdAt', width: 180 },
    {
      title: '操作', width: 80, fixed: 'right',
      render: (_: unknown, record: MemberItem) => (
        <Popconfirm title="确认移除此设备？" onConfirm={() => handleRemoveDevice(record.deviceId)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>移除</Button>
        </Popconfirm>
      ),
    },
  ];

  // ============================================================
  // Parent options for form
  // ============================================================

  const parentOptions = useMemo(() => {
    const excludeId = editRecord?.id;
    return [
      { label: '(无，顶级分组)', value: 0 },
      ...allGroups
        .filter((g) => g.id !== excludeId)
        .map((g) => ({ label: g.name, value: g.id })),
    ];
  }, [allGroups, editRecord]);

  // ============================================================
  // Filtered tree for search
  // ============================================================

  const filteredTreeData = useMemo(() => {
    if (!treeSearch.trim()) return treeData;
    const kw = treeSearch.trim().toLowerCase();
    const matchIds = new Set<number>();

    // Mark matching nodes + all ancestors
    const markAncestors = (nodes: GroupTreeNode[], parentIds: number[]) => {
      for (const n of nodes) {
        const path = [...parentIds, n.id];
        if (n.name.toLowerCase().includes(kw)) {
          path.forEach((id) => matchIds.add(id));
        }
        if (n.children?.length) markAncestors(n.children, path);
      }
    };
    markAncestors(treeData, []);

    // Filter tree keeping only matching branches
    const filterNodes = (nodes: GroupTreeNode[]): GroupTreeNode[] =>
      nodes.filter((n) => matchIds.has(n.id)).map((n) => ({
        ...n,
        children: n.children?.length ? filterNodes(n.children) : [],
      }));

    return filterNodes(treeData);
  }, [treeData, treeSearch]);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div>
      <PageHeader
        title="设备分组"
        description={`共 ${stats.total} 个分组，关联 ${stats.totalDevices} 台设备`}
        extra={
          <Space>
            <Tooltip title="刷新"><Button icon={<ReloadOutlined />} onClick={fetchTree} /></Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建分组</Button>
          </Space>
        }
      />

      {/* Stat summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '分组总数', value: stats.total, icon: <AppstoreOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '静态分组', value: stats.staticGroups, icon: <ClusterOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '动态分组', value: stats.dynamicGroups, icon: <ThunderboltOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '关联设备', value: stats.totalDevices, icon: <HddOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
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

      {/* Main content: Tree + Detail */}
      <Row gutter={16}>
        {/* Left: Tree panel */}
        <Col xs={24} lg={8} xl={6}>
          <Card
            title={<span><FolderOutlined style={{ marginRight: 6 }} />分组树</span>}
            bodyStyle={{ padding: '8px 0', maxHeight: 'calc(100vh - 340px)', overflow: 'auto' }}
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
            extra={
              <Tooltip title="新建子分组">
                <Button
                  type="text" size="small" icon={<PlusOutlined />}
                  disabled={!selectedGroup}
                  onClick={() => handleEdit(null, selectedGroup?.id)}
                />
              </Tooltip>
            }
          >
            <div style={{ padding: '0 12px 8px' }}>
              <Input
                placeholder="搜索分组..."
                prefix={<SearchOutlined style={{ color: '#bbb' }} />}
                size="small"
                allowClear
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
              />
            </div>
            {filteredTreeData.length > 0 ? (
              <Tree
                showIcon
                blockNode
                expandedKeys={expandedKeys}
                onExpand={(keys) => setExpandedKeys(keys)}
                selectedKeys={selectedGroup ? [selectedGroup.id] : []}
                onSelect={handleTreeSelect}
                treeData={toAntTreeData(filteredTreeData, selectedGroup?.id ?? null)}
                style={{ padding: '0 4px' }}
              />
            ) : (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <Empty description={treeLoading ? '加载中...' : (treeSearch ? '无匹配分组' : '暂无分组')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </Card>
        </Col>

        {/* Right: Detail panel */}
        <Col xs={24} lg={16} xl={18}>
          {selectedGroup ? (
            <Card
              title={
                <Space>
                  <TeamOutlined style={{ color: '#4f46e5' }} />
                  <span>{selectedGroup.name}</span>
                  <Tag color={typeColors[selectedGroup.type]}>{typeLabels[selectedGroup.type]}</Tag>
                </Space>
              }
              extra={
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(selectedGroup)}>编辑</Button>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => handleEdit(null, selectedGroup.id)}>新建子分组</Button>
                  <Popconfirm title="确认删除此分组？子分组将一并删除" onConfirm={() => handleDelete(selectedGroup.id)}>
                    <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                </Space>
              }
              style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16 }}
            >
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>描述</Text>
                  <div style={{ fontSize: 13 }}>{selectedGroup.description || '-'}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>设备数量</Text>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>{selectedGroup.deviceCount}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary" style={{ fontSize: 12 }}>创建时间</Text>
                  <div style={{ fontSize: 13 }}>{selectedGroup.createdAt}</div>
                </Col>
              </Row>
              {selectedGroup.type === 'DYNAMIC' && selectedGroup.dynamicRule && (
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>动态规则</Text>
                  <pre style={{ background: '#fafafa', borderRadius: 6, padding: '8px 12px', fontSize: 12, margin: '4px 0 0', border: '1px solid #f0f0f0' }}>
                    {selectedGroup.dynamicRule}
                  </pre>
                </div>
              )}
            </Card>
          ) : null}

          {/* Members */}
          <Card
            title={
              selectedGroup
                ? <span><HddOutlined style={{ marginRight: 6, color: '#4f46e5' }} />分组设备 ({members.length})</span>
                : <span><HddOutlined style={{ marginRight: 6 }} />分组设备</span>
            }
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
            extra={
              selectedGroup ? (
                <Space size={8}>
                  <InputNumber
                    placeholder="设备 ID"
                    value={bindDeviceId}
                    onChange={(v) => setBindDeviceId(v)}
                    style={{ width: 120 }}
                    size="small"
                  />
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddDevice} disabled={!bindDeviceId}>
                    添加设备
                  </Button>
                </Space>
              ) : null
            }
          >
            {selectedGroup ? (
              <Table
                rowKey="id"
                columns={memberColumns}
                dataSource={members}
                loading={membersLoading}
                size="small"
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }}
              />
            ) : (
              <div style={{ padding: '60px 0', textAlign: 'center' }}>
                <Empty description="请在左侧选择一个分组查看设备" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Edit / Create Modal */}
      <Modal
        title={editRecord ? '编辑分组' : '新建分组'}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
        destroyOnClose
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true }]}>
            <Input placeholder="输入分组名称" />
          </Form.Item>
          <Form.Item name="parentId" label="上级分组">
            <Select options={parentOptions} placeholder="选择上级分组（留空为顶级）" allowClear />
          </Form.Item>
          <Form.Item name="type" label="分组类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'STATIC', label: '静态分组' }, { value: 'DYNAMIC', label: '动态分组' }]} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="dynamicRule" label="动态规则" tooltip="JSON 格式的分组匹配规则，仅动态分组有效">
            <Input.TextArea rows={3} placeholder='如：{"productId": 1, "status": "ACTIVE"}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DeviceGroupPage;
