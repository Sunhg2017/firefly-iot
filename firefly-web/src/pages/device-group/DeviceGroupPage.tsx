import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Tree,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HddOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { deviceApi, deviceGroupApi } from '../../services/api';

const { Search, TextArea } = Input;
const { Paragraph, Text, Title } = Typography;

type GroupType = 'STATIC' | 'DYNAMIC';
type DeviceStatus = 'INACTIVE' | 'ACTIVE' | 'DISABLED' | 'UNKNOWN';
type OnlineStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

interface GroupTreeNode {
  id: number;
  name: string;
  description?: string;
  type: GroupType;
  dynamicRule?: string;
  parentId: number | null;
  deviceCount: number;
  createdAt: string;
  children?: GroupTreeNode[];
}

interface MemberItem {
  id: number;
  groupId: number;
  deviceId: number;
  deviceName?: string;
  nickname?: string;
  productKey?: string;
  productName?: string;
  status?: DeviceStatus;
  onlineStatus?: OnlineStatus;
  createdAt: string;
}

interface DeviceOptionRecord {
  id: number;
  deviceName: string;
  nickname?: string;
  status?: DeviceStatus;
  onlineStatus?: OnlineStatus;
}

interface GroupFormValues {
  name: string;
  description?: string;
  type: GroupType;
  parentId?: number | null;
  dynamicRule?: string;
}

const TYPE_LABELS: Record<GroupType, string> = {
  STATIC: '静态分组',
  DYNAMIC: '动态分组',
};

const TYPE_COLORS: Record<GroupType, string> = {
  STATIC: 'blue',
  DYNAMIC: 'green',
};

const DEVICE_STATUS_META: Record<string, { label: string; color: string }> = {
  INACTIVE: { label: '未激活', color: 'default' },
  ACTIVE: { label: '已启用', color: 'success' },
  DISABLED: { label: '已停用', color: 'error' },
  UNKNOWN: { label: '未知', color: 'default' },
};

const ONLINE_STATUS_META: Record<string, { label: string; color: string }> = {
  ONLINE: { label: '在线', color: 'success' },
  OFFLINE: { label: '离线', color: 'default' },
  UNKNOWN: { label: '未知', color: 'default' },
};

const OVERVIEW_CARD_META = [
  {
    key: 'total',
    title: '分组总数',
    hint: '当前租户所有分组',
    icon: <AppstoreOutlined />,
    color: '#2563eb',
    background: 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
  },
  {
    key: 'staticGroups',
    title: '静态分组',
    hint: '支持手动维护成员',
    icon: <ClusterOutlined />,
    color: '#0f766e',
    background: 'linear-gradient(135deg, #ecfeff 0%, #f0fdfa 100%)',
  },
  {
    key: 'dynamicGroups',
    title: '动态分组',
    hint: '按规则自动归类',
    icon: <ThunderboltOutlined />,
    color: '#16a34a',
    background: 'linear-gradient(135deg, #ecfdf5 0%, #f7fee7 100%)',
  },
  {
    key: 'totalDevices',
    title: '关联设备',
    hint: '静态分组成员总量',
    icon: <HddOutlined />,
    color: '#ea580c',
    background: 'linear-gradient(135deg, #fff7ed 0%, #fffaf0 100%)',
  },
] as const;

function flattenTree(nodes: GroupTreeNode[]): GroupTreeNode[] {
  const result: GroupTreeNode[] = [];
  const walk = (items: GroupTreeNode[]) => {
    items.forEach((item) => {
      result.push(item);
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return result;
}

function collectDescendantIds(node?: GroupTreeNode | null): Set<number> {
  const result = new Set<number>();
  if (!node?.children?.length) {
    return result;
  }

  const walk = (items: GroupTreeNode[]) => {
    items.forEach((item) => {
      result.add(item.id);
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };

  walk(node.children);
  return result;
}

function filterTree(nodes: GroupTreeNode[], keyword: string): GroupTreeNode[] {
  if (!keyword.trim()) {
    return nodes;
  }
  const lowerKeyword = keyword.trim().toLowerCase();
  const result: GroupTreeNode[] = [];

  // 搜索结果需要保留命中节点的整条祖先路径，避免定位到分组后丢失目录上下文。
  nodes.forEach((node) => {
    const nextChildren = filterTree(node.children || [], keyword);
    if (node.name.toLowerCase().includes(lowerKeyword) || nextChildren.length > 0) {
      result.push({
        ...node,
        children: nextChildren,
      });
    }
  });

  return result;
}

function toTreeData(nodes: GroupTreeNode[], selectedGroupId: number | null): DataNode[] {
  return nodes.map((node) => ({
    key: node.id,
    icon: node.children?.length ? <FolderOpenOutlined style={{ color: '#2563eb' }} /> : <FolderOutlined style={{ color: '#64748b' }} />,
    title: (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          width: '100%',
        }}
      >
        <Space size={8} style={{ minWidth: 0 }}>
          <Text
            strong={selectedGroupId === node.id}
            style={{
              maxWidth: 180,
            }}
            ellipsis
          >
            {node.name}
          </Text>
          <Tag color={TYPE_COLORS[node.type]} style={{ margin: 0 }}>
            {TYPE_LABELS[node.type]}
          </Tag>
        </Space>
        <Badge
          count={node.deviceCount}
          overflowCount={999}
          showZero={false}
          style={{ backgroundColor: '#475569', boxShadow: 'none' }}
        />
      </div>
    ),
    children: node.children?.length ? toTreeData(node.children, selectedGroupId) : undefined,
  }));
}

const DeviceGroupPage: React.FC = () => {
  const [treeData, setTreeData] = useState<GroupTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [deviceOptions, setDeviceOptions] = useState<Array<{ value: number; label: string; record: DeviceOptionRecord }>>([]);
  const [deviceOptionsLoading, setDeviceOptionsLoading] = useState(false);
  const [bindDeviceId, setBindDeviceId] = useState<number | undefined>();

  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<GroupTreeNode | null>(null);
  const [form] = Form.useForm<GroupFormValues>();
  const currentFormType = Form.useWatch('type', form);

  const allGroups = useMemo(() => flattenTree(treeData), [treeData]);
  const selectedGroup = useMemo(
    () => allGroups.find((item) => item.id === selectedGroupId) || null,
    [allGroups, selectedGroupId],
  );
  const selectedParentGroup = useMemo(
    () => (selectedGroup?.parentId ? allGroups.find((item) => item.id === selectedGroup.parentId) || null : null),
    [allGroups, selectedGroup?.parentId],
  );

  const stats = useMemo(
    () => ({
      total: allGroups.length,
      staticGroups: allGroups.filter((item) => item.type === 'STATIC').length,
      dynamicGroups: allGroups.filter((item) => item.type === 'DYNAMIC').length,
      totalDevices: allGroups.reduce((sum, item) => sum + (item.deviceCount || 0), 0),
    }),
    [allGroups],
  );

  const overviewItems = useMemo(
    () => OVERVIEW_CARD_META.map((item) => ({ ...item, value: stats[item.key] })),
    [stats],
  );

  const filteredTreeData = useMemo(() => filterTree(treeData, treeSearch), [treeData, treeSearch]);

  const parentOptions = useMemo(() => {
    const excludedIds = new Set<number>();
    if (editRecord) {
      excludedIds.add(editRecord.id);
      collectDescendantIds(editRecord).forEach((id) => excludedIds.add(id));
    }

    return [
      { label: '顶级分组', value: 0 },
      ...allGroups
        .filter((item) => !excludedIds.has(item.id))
        .map((item) => ({
          label: item.name,
          value: item.id,
        })),
    ];
  }, [allGroups, editRecord]);

  const fetchTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await deviceGroupApi.tree();
      const nextTree = (res.data.data || []) as GroupTreeNode[];
      setTreeData(nextTree);
      const nextAllIds = flattenTree(nextTree).map((item) => item.id as React.Key);
      setExpandedKeys(nextAllIds);
      setSelectedGroupId((prev) => (prev && nextAllIds.includes(prev) ? prev : null));
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

  const searchDevices = useCallback(
    async (keyword: string) => {
      // 动态分组只维护规则，不参与人工选设备，因此直接清空候选项。
      if (!selectedGroup || selectedGroup.type !== 'STATIC') {
        setDeviceOptions([]);
        return;
      }

      setDeviceOptionsLoading(true);
      try {
        const res = await deviceApi.list({
          pageNum: 1,
          pageSize: 20,
          keyword: keyword.trim() || undefined,
        });
        const records = (((res.data.data as { records?: DeviceOptionRecord[] })?.records) || []) as DeviceOptionRecord[];
        const existingDeviceIds = new Set(members.map((item) => item.deviceId));
        const options = records
          .filter((item) => !existingDeviceIds.has(item.id))
          .map((item) => ({
            value: item.id,
            label: item.nickname ? `${item.deviceName} / ${item.nickname}` : item.deviceName,
            record: item,
          }));
        setDeviceOptions(options);
      } catch (error) {
        message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '加载设备候选失败');
      } finally {
        setDeviceOptionsLoading(false);
      }
    },
    [members, selectedGroup],
  );

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    if (!selectedGroup) {
      setMembers([]);
      setBindDeviceId(undefined);
      setDeviceOptions([]);
      return;
    }
    void fetchMembers(selectedGroup.id);
  }, [fetchMembers, selectedGroup]);

  useEffect(() => {
    if (selectedGroup?.type === 'STATIC') {
      void searchDevices('');
    }
  }, [searchDevices, selectedGroup?.id, selectedGroup?.type]);

  useEffect(() => {
    if (treeSearch.trim()) {
      setExpandedKeys(flattenTree(filteredTreeData).map((item) => item.id));
    }
  }, [filteredTreeData, treeSearch]);

  const openEditor = (record?: GroupTreeNode | null, parentId?: number | null) => {
    setEditRecord(record || null);
    if (record) {
      form.setFieldsValue({
        name: record.name,
        description: record.description,
        type: record.type,
        dynamicRule: record.dynamicRule,
        parentId: record.parentId ?? 0,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        type: 'STATIC',
        parentId: parentId ?? 0,
      });
    }
    setEditOpen(true);
  };

  const handleSave = async (values: GroupFormValues) => {
    const payload = {
      ...values,
      parentId: values.parentId && values.parentId > 0 ? values.parentId : null,
      dynamicRule: values.type === 'DYNAMIC' ? values.dynamicRule?.trim() || null : null,
    };

    try {
      if (editRecord) {
        await deviceGroupApi.update(editRecord.id, payload);
        message.success('分组已更新');
      } else {
        await deviceGroupApi.create(payload);
        message.success('分组已创建');
      }
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
    if (!selectedGroup || selectedGroup.type !== 'STATIC' || !bindDeviceId) {
      return;
    }
    try {
      await deviceGroupApi.addDevice(selectedGroup.id, bindDeviceId);
      message.success('设备已加入分组');
      setBindDeviceId(undefined);
      await fetchMembers(selectedGroup.id);
      await fetchTree();
      await searchDevices('');
    } catch (error) {
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '添加设备失败');
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
      message.error((error as { response?: { data?: { message?: string } } })?.response?.data?.message || '移除设备失败');
    }
  };

  const memberColumns: ColumnsType<MemberItem> = [
    {
      title: '设备',
      dataIndex: 'deviceName',
      width: 240,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.deviceName || record.nickname || '设备信息缺失'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.nickname || '未设置昵称'}
          </Text>
        </Space>
      ),
    },
    {
      title: '所属产品',
      width: 220,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.productName || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.productKey || '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: '设备状态',
      width: 180,
      render: (_value, record) => (
        <Space wrap>
          <Tag color={DEVICE_STATUS_META[record.status || 'UNKNOWN']?.color || 'default'}>
            {DEVICE_STATUS_META[record.status || 'UNKNOWN']?.label || record.status || '未知'}
          </Tag>
          <Tag color={ONLINE_STATUS_META[record.onlineStatus || 'UNKNOWN']?.color || 'default'}>
            {ONLINE_STATUS_META[record.onlineStatus || 'UNKNOWN']?.label || record.onlineStatus || '未知'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '加入时间',
      dataIndex: 'createdAt',
      width: 180,
    },
    {
      title: '操作',
      width: 90,
      fixed: 'right',
      render: (_value, record) =>
        selectedGroup?.type === 'STATIC' ? (
          <Popconfirm title="确认将该设备移出当前分组吗？" onConfirm={() => handleRemoveDevice(record.deviceId)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              移除
            </Button>
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="设备分组"
        description="按树形目录维护静态分组和动态分组。静态分组适合人工归类，动态分组适合规则归集。"
        extra={
          <Space>
            <Tooltip title="刷新分组树">
              <Button icon={<ReloadOutlined />} onClick={() => void fetchTree()} />
            </Tooltip>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null, selectedGroup?.id ?? 0)}>
              新建分组
            </Button>
          </Space>
        }
      />

      <Card
        title="页面总览"
        size="small"
        style={{ marginBottom: 16, borderRadius: 18 }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]}>
            {overviewItems.map((item) => (
              <Col xs={12} md={6} key={item.key}>
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 16,
                    background: item.background,
                    border: '1px solid rgba(148,163,184,0.12)',
                  }}
                >
                  <Space align="start" size={12}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.74)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: item.color,
                        fontSize: 18,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: item.color }}>{item.value}</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>{item.hint}</div>
                    </div>
                  </Space>
                </div>
              </Col>
            ))}
          </Row>
          <Space wrap>
            {selectedGroup ? (
              <>
                <Tag color="blue">{`当前分组 ${selectedGroup.name}`}</Tag>
                <Tag color={TYPE_COLORS[selectedGroup.type]}>{TYPE_LABELS[selectedGroup.type]}</Tag>
                <Tag>{`成员 ${selectedGroup.deviceCount || 0}`}</Tag>
              </>
            ) : (
              <Tag>当前未选择分组</Tag>
            )}
          </Space>
        </Space>
      </Card>

      <Row gutter={16} align="stretch">
        <Col xs={24} lg={8} xl={7}>
          <Card
            title="分组目录"
            size="small"
            extra={
              <Tooltip title={selectedGroup ? '基于当前分组创建子分组' : '先选择一个父分组'}>
                <Button
                  type="text"
                  size="small"
                  icon={<PlusOutlined />}
                  disabled={!selectedGroup}
                  onClick={() => openEditor(null, selectedGroup?.id ?? 0)}
                />
              </Tooltip>
            }
            style={{ borderRadius: 18, height: '100%' }}
            styles={{ body: { padding: 12 } }}
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Search
                allowClear
                value={treeSearch}
                onChange={(event) => setTreeSearch(event.target.value)}
                placeholder="搜索分组名称"
                prefix={<SearchOutlined />}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                搜索会保留匹配分组及其上级路径，便于快速定位分组结构。
              </Text>
              {filteredTreeData.length > 0 ? (
                <Tree
                  blockNode
                  showIcon
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys)}
                  selectedKeys={selectedGroupId ? [selectedGroupId] : []}
                  onSelect={(keys) => setSelectedGroupId(keys.length ? Number(keys[0]) : null)}
                  treeData={toTreeData(filteredTreeData, selectedGroupId)}
                  style={{ padding: 4 }}
                />
              ) : (
                <div style={{ padding: '36px 0' }}>
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={treeLoading ? '分组目录加载中...' : treeSearch ? '没有匹配的分组' : '暂无分组'}
                  />
                </div>
              )}
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={16} xl={17}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              title="分组画像"
              size="small"
              style={{ borderRadius: 18 }}
              extra={
                selectedGroup ? (
                  <Space wrap>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditor(selectedGroup)}>
                      编辑分组
                    </Button>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => openEditor(null, selectedGroup.id)}>
                      新建子分组
                    </Button>
                    <Popconfirm
                      title="确认删除当前分组吗？其下子分组和静态成员也会被一并移除。"
                      onConfirm={() => void handleDelete(selectedGroup.id)}
                    >
                      <Button size="small" danger icon={<DeleteOutlined />}>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                ) : null
              }
            >
              {selectedGroup ? (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div
                    style={{
                      padding: '18px 20px',
                      borderRadius: 18,
                      background:
                        selectedGroup.type === 'DYNAMIC'
                          ? 'linear-gradient(135deg, #ecfdf5 0%, #f7fee7 100%)'
                          : 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
                      border: '1px solid rgba(148,163,184,0.12)',
                    }}
                  >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag color={TYPE_COLORS[selectedGroup.type]}>{TYPE_LABELS[selectedGroup.type]}</Tag>
                        <Tag>{`成员 ${selectedGroup.deviceCount || 0}`}</Tag>
                        {selectedGroup.parentId ? (
                          <Tag>{`父分组 ${selectedParentGroup?.name || '已失效'}`}</Tag>
                        ) : (
                          <Tag>顶级分组</Tag>
                        )}
                      </Space>
                      <Title level={4} style={{ margin: 0 }}>
                        {selectedGroup.name}
                      </Title>
                      <Paragraph style={{ margin: 0, color: '#475569' }}>
                        {selectedGroup.description || '当前分组还没有补充描述，可用于说明适用范围、归类口径和运维边界。'}
                      </Paragraph>
                    </Space>
                  </div>
                  <Row gutter={[12, 12]}>
                    <Col xs={24} md={8}>
                      <Card size="small" style={{ borderRadius: 16, background: '#fcfcfd' }}>
                        <Text type="secondary">分组类型</Text>
                        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{TYPE_LABELS[selectedGroup.type]}</div>
                      </Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small" style={{ borderRadius: 16, background: '#fcfcfd' }}>
                        <Text type="secondary">成员数量</Text>
                        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{selectedGroup.deviceCount || 0}</div>
                      </Card>
                    </Col>
                    <Col xs={24} md={8}>
                      <Card size="small" style={{ borderRadius: 16, background: '#fcfcfd' }}>
                        <Text type="secondary">创建时间</Text>
                        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>{selectedGroup.createdAt}</div>
                      </Card>
                    </Col>
                  </Row>
                  {selectedGroup.type === 'DYNAMIC' ? (
                    <Card
                      size="small"
                      title="动态规则"
                      style={{ borderRadius: 16, background: '#fafafa' }}
                    >
                      <pre
                        style={{
                          margin: 0,
                          padding: 12,
                          borderRadius: 12,
                          background: '#0f172a',
                          color: '#e2e8f0',
                          fontSize: 12,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {selectedGroup.dynamicRule || '当前还未配置动态规则。'}
                      </pre>
                    </Card>
                  ) : (
                    <Card
                      size="small"
                      style={{ borderRadius: 16, background: '#fafafa' }}
                    >
                      <Space align="start">
                        <CheckCircleOutlined style={{ color: '#2563eb', marginTop: 2 }} />
                        <Text type="secondary">
                          静态分组适合按业务线、区域、楼层或运维责任边界手动归类设备，成员由人工维护。
                        </Text>
                      </Space>
                    </Card>
                  )}
                </Space>
              ) : (
                <div style={{ padding: '52px 0' }}>
                  <Empty description="先从左侧分组目录选择一个分组，再查看分组画像和成员信息" />
                </div>
              )}
            </Card>

            <Card
              title={selectedGroup ? `分组成员 (${members.length})` : '分组成员'}
              size="small"
              style={{ borderRadius: 18 }}
              extra={
                selectedGroup?.type === 'STATIC' ? (
                  <Space wrap>
                    <Select
                      showSearch
                      filterOption={false}
                      value={bindDeviceId}
                      style={{ width: 320 }}
                      placeholder="搜索设备名称或昵称后加入当前分组"
                      notFoundContent={deviceOptionsLoading ? '设备搜索中...' : '没有可加入的设备'}
                      options={deviceOptions}
                      onSearch={(value) => void searchDevices(value)}
                      onFocus={() => void searchDevices('')}
                      onChange={(value) => setBindDeviceId(value)}
                      optionRender={(option) => {
                        const record = (option.data as { record?: DeviceOptionRecord }).record;
                        if (!record) {
                          return option.label;
                        }
                        return (
                          <Space direction="vertical" size={2}>
                            <Text strong>{record.deviceName}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {record.nickname || '未设置昵称'}
                            </Text>
                          </Space>
                        );
                      }}
                    />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => void handleAddDevice()}
                      disabled={!bindDeviceId}
                    >
                      加入设备
                    </Button>
                  </Space>
                ) : null
              }
            >
              {!selectedGroup ? (
                <div style={{ padding: '52px 0' }}>
                  <Empty description="选择分组后可查看成员列表" />
                </div>
              ) : selectedGroup.type === 'DYNAMIC' ? (
                <div style={{ padding: '24px 0' }}>
                  <Card size="small" style={{ borderRadius: 16, background: '#fcfcfd' }}>
                    <Space align="start">
                      <ThunderboltOutlined style={{ color: '#16a34a', marginTop: 2 }} />
                      <Text type="secondary">
                        动态分组按规则自动归集设备，不支持手动添加或移除成员。若需要人工维护成员，请改用静态分组。
                      </Text>
                    </Space>
                  </Card>
                </div>
              ) : (
                <Table
                  rowKey="id"
                  loading={membersLoading}
                  columns={memberColumns}
                  dataSource={members}
                  scroll={{ x: 860 }}
                  locale={{ emptyText: <Empty description="当前静态分组还没有成员设备" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: true,
                    showTotal: (count) => `共 ${count} 台设备`,
                  }}
                />
              )}
            </Card>
          </Space>
        </Col>
      </Row>

      <Modal
        title={editRecord ? '编辑分组' : '新建分组'}
        open={editOpen}
        width={560}
        destroyOnClose
        onCancel={() => setEditOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(values) => void handleSave(values)}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="例如：华东区域 / 二号厂区 / 一层网关" maxLength={64} />
          </Form.Item>
          <Form.Item name="parentId" label="上级分组">
            <Select options={parentOptions} placeholder="选择上级分组，不选则为顶级分组" />
          </Form.Item>
          <Form.Item name="type" label="分组类型" rules={[{ required: true, message: '请选择分组类型' }]}>
            <Select
              options={[
                { value: 'STATIC', label: '静态分组' },
                { value: 'DYNAMIC', label: '动态分组' },
              ]}
            />
          </Form.Item>
          <Form.Item name="description" label="分组描述">
            <TextArea rows={3} maxLength={256} placeholder="补充说明分组用途、归类口径和适用范围" />
          </Form.Item>
          {currentFormType === 'DYNAMIC' ? (
            <Form.Item
              name="dynamicRule"
              label="动态规则"
              rules={[{ required: true, message: '动态分组请填写规则内容' }]}
              extra="建议填写结构化 JSON 规则，便于后续统一解析和扩展。"
            >
              <TextArea
                rows={5}
                placeholder='例如：{"productKey":"sensor_gateway","onlineStatus":"ONLINE"}'
              />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </div>
  );
};

export default DeviceGroupPage;
