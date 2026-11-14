import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  List,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Tree,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  DeploymentUnitOutlined,
  DisconnectOutlined,
  HddOutlined,
  ReloadOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { deviceApi, deviceGroupApi } from '../../services/api';
import { ProductSelect } from '../../components/EntitySelect';

interface DeviceGroupRecord {
  id: number;
  name: string;
  type?: string;
}

interface DeviceTopologyOverview {
  matchedDevices?: number;
  visibleDevices?: number;
  rootNodes?: number;
  gatewayDevices?: number;
  subDevices?: number;
  standaloneDevices?: number;
  orphanDevices?: number;
  onlineDevices?: number;
  maxDepth?: number;
}

interface DeviceTopologyNodeRecord {
  id: number;
  productId?: number;
  deviceName: string;
  nickname?: string;
  productName?: string;
  productKey?: string;
  nodeType?: string;
  status?: string;
  onlineStatus?: string;
  firmwareVersion?: string;
  ipAddress?: string;
  gatewayId?: number;
  gatewayDeviceName?: string;
  directChildCount?: number;
  descendantCount?: number;
  matched?: boolean;
  orphan?: boolean;
  lastOnlineAt?: string;
  createdAt?: string;
  children?: DeviceTopologyNodeRecord[];
}

interface DeviceTopologyFilters {
  keyword: string;
  productId?: number;
  groupId?: number;
  status?: string;
  onlineStatus?: string;
}

interface DeviceTopologyResponse {
  overview?: DeviceTopologyOverview;
  rootNodes?: DeviceTopologyNodeRecord[];
  standaloneDevices?: DeviceTopologyNodeRecord[];
  orphanDevices?: DeviceTopologyNodeRecord[];
}

const STATUS_LABELS: Record<string, string> = {
  INACTIVE: '未激活',
  ACTIVE: '已激活',
  DISABLED: '已禁用',
};

const STATUS_COLORS: Record<string, string> = {
  INACTIVE: 'default',
  ACTIVE: 'success',
  DISABLED: 'error',
};

const ONLINE_BADGE: Record<string, { status: 'success' | 'default' | 'warning'; text: string }> = {
  ONLINE: { status: 'success', text: '在线' },
  OFFLINE: { status: 'default', text: '离线' },
  UNKNOWN: { status: 'warning', text: '未知' },
};

const NODE_TYPE_META: Record<string, { label: string; color: string }> = {
  GATEWAY: { label: '网关', color: 'blue' },
  DEVICE: { label: '设备', color: 'default' },
};

const getNodeDisplayName = (node?: DeviceTopologyNodeRecord | null) => {
  if (!node) return '-';
  return node.nickname?.trim() || node.deviceName;
};

const collectExpandedKeys = (nodes: DeviceTopologyNodeRecord[], maxDepth: number, depth = 1): string[] => {
  const keys: string[] = [];
  nodes.forEach((node) => {
    if (depth <= maxDepth) {
      keys.push(String(node.id));
    }
    if (node.children?.length) {
      keys.push(...collectExpandedKeys(node.children, maxDepth, depth + 1));
    }
  });
  return keys;
};

const indexNodes = (
  nodes: DeviceTopologyNodeRecord[],
  parentId: number | null,
  nodeMap: Map<number, DeviceTopologyNodeRecord>,
  parentMap: Map<number, number | null>,
) => {
  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
    parentMap.set(node.id, parentId);
    if (node.children?.length) {
      indexNodes(node.children, node.id, nodeMap, parentMap);
    }
  });
};

const DeviceTopologyPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<DeviceTopologyFilters>({ keyword: '' });
  const [filters, setFilters] = useState<DeviceTopologyFilters>({ keyword: '' });
  const [groups, setGroups] = useState<DeviceGroupRecord[]>([]);
  const [topology, setTopology] = useState<DeviceTopologyResponse>({});
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [activeTab, setActiveTab] = useState('roots');

  const fetchFilterOptions = useCallback(async () => {
    setOptionsError(null);
    try {
      const groupRes = await deviceGroupApi.listAll();
      setGroups((groupRes.data.data || [])
        .filter((item: DeviceGroupRecord) => item.type !== 'DYNAMIC')
        .map((item: DeviceGroupRecord) => ({ id: item.id, name: item.name, type: item.type })));
    } catch (error) {
      setGroups([]);
      setOptionsError(getErrorMessage(error, '加载分组筛选项失败'));
    }
  }, []);

  const loadTopology = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await deviceApi.topology({
        keyword: filters.keyword || undefined,
        productId: filters.productId,
        groupId: filters.groupId,
        status: filters.status,
        onlineStatus: filters.onlineStatus,
      });
      const nextTopology = (res.data.data || {}) as DeviceTopologyResponse;
      setTopology({
        overview: nextTopology.overview || {},
        rootNodes: nextTopology.rootNodes || [],
        standaloneDevices: nextTopology.standaloneDevices || [],
        orphanDevices: nextTopology.orphanDevices || [],
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error, '加载设备拓扑失败');
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    void loadTopology();
  }, [loadTopology]);

  const handleActivate = useCallback(() => {
    void loadTopology();
  }, [loadTopology]);
  usePageActivation(handleActivate);

  const applyFilters = () => {
    setFilters({
      keyword: draftFilters.keyword.trim(),
      productId: draftFilters.productId,
      groupId: draftFilters.groupId,
      status: draftFilters.status,
      onlineStatus: draftFilters.onlineStatus,
    });
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
  };

  const groupOptions = useMemo(
    () => groups.map((item) => ({ value: item.id, label: item.name })),
    [groups],
  );

  const rootNodes = topology.rootNodes || [];
  const standaloneDevices = topology.standaloneDevices || [];
  const orphanDevices = topology.orphanDevices || [];
  const hasActiveFilters = Boolean(filters.keyword || filters.productId || filters.groupId || filters.status || filters.onlineStatus);
  const hasAnyData = rootNodes.length + standaloneDevices.length + orphanDevices.length > 0;

  const { nodeMap, parentMap } = useMemo(() => {
    const nextNodeMap = new Map<number, DeviceTopologyNodeRecord>();
    const nextParentMap = new Map<number, number | null>();
    indexNodes(rootNodes, null, nextNodeMap, nextParentMap);
    indexNodes(standaloneDevices, null, nextNodeMap, nextParentMap);
    indexNodes(orphanDevices, null, nextNodeMap, nextParentMap);
    return { nodeMap: nextNodeMap, parentMap: nextParentMap };
  }, [orphanDevices, rootNodes, standaloneDevices]);

  useEffect(() => {
    setExpandedKeys(collectExpandedKeys(rootNodes, 2));
  }, [rootNodes]);

  useEffect(() => {
    if (selectedNodeId && nodeMap.has(selectedNodeId)) {
      return;
    }
    const nextNode = rootNodes[0] || standaloneDevices[0] || orphanDevices[0];
    setSelectedNodeId(nextNode ? nextNode.id : null);
  }, [nodeMap, orphanDevices, rootNodes, selectedNodeId, standaloneDevices]);

  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) || null : null;

  const selectedPath = useMemo(() => {
    if (!selectedNodeId) return [];
    const path: DeviceTopologyNodeRecord[] = [];
    let cursor: number | null | undefined = selectedNodeId;
    while (cursor) {
      const node = nodeMap.get(cursor);
      if (!node) break;
      path.unshift(node);
      cursor = parentMap.get(cursor) ?? null;
    }
    return path;
  }, [nodeMap, parentMap, selectedNodeId]);

  const renderNodeTitle = (node: DeviceTopologyNodeRecord) => {
    const selected = selectedNodeId === node.id;
    const onlineMeta = ONLINE_BADGE[node.onlineStatus || 'UNKNOWN'] || ONLINE_BADGE.UNKNOWN;
    const nodeMeta = NODE_TYPE_META[node.nodeType || 'DEVICE'] || NODE_TYPE_META.DEVICE;
    return (
      <div
        style={{
          minWidth: 260,
          maxWidth: 420,
          padding: '12px 14px',
          borderRadius: 16,
          border: selected
            ? '1px solid #2563eb'
            : node.matched
              ? '1px solid #93c5fd'
              : '1px solid #dbe4ee',
          background: selected ? '#eff6ff' : '#ffffff',
          boxShadow: selected ? '0 10px 24px rgba(37,99,235,0.12)' : '0 6px 20px rgba(15,23,42,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <Space size={[6, 6]} wrap>
            <Typography.Text strong style={{ color: '#0f172a' }}>
              {getNodeDisplayName(node)}
            </Typography.Text>
            <Tag color={nodeMeta.color}>{nodeMeta.label}</Tag>
            {node.orphan ? <Tag color="error">断链</Tag> : null}
            {node.matched ? <Tag color="processing">命中筛选</Tag> : null}
          </Space>
          {(node.directChildCount || 0) > 0 ? <Tag>{node.directChildCount} 个下级</Tag> : null}
        </div>
        <div style={{ marginTop: 8 }}>
          <Space size={[8, 8]} wrap>
            <Typography.Text code>{node.deviceName}</Typography.Text>
            {node.productKey ? <Typography.Text type="secondary">{node.productKey}</Typography.Text> : null}
            <Badge status={onlineMeta.status} text={onlineMeta.text} />
            <Tag color={STATUS_COLORS[node.status || ''] || 'default'}>
              {STATUS_LABELS[node.status || ''] || node.status || '未知状态'}
            </Tag>
          </Space>
        </div>
      </div>
    );
  };

  const treeData = useMemo<DataNode[]>(() => {
    const toTreeNode = (node: DeviceTopologyNodeRecord): DataNode => ({
      key: String(node.id),
      title: renderNodeTitle(node),
      children: (node.children || []).map(toTreeNode),
    });
    return rootNodes.map(toTreeNode);
  }, [rootNodes, selectedNodeId]);

  const renderNodeList = (nodes: DeviceTopologyNodeRecord[], emptyText: string) => {
    if (!nodes.length) {
      return <ListEmpty hasFilters={hasActiveFilters} emptyText={emptyText} filteredText={emptyText} onClearFilters={resetFilters} />;
    }
    return (
      <List
        dataSource={nodes}
        split={false}
        renderItem={(node) => {
          const onlineMeta = ONLINE_BADGE[node.onlineStatus || 'UNKNOWN'] || ONLINE_BADGE.UNKNOWN;
          const nodeMeta = NODE_TYPE_META[node.nodeType || 'DEVICE'] || NODE_TYPE_META.DEVICE;
          const selected = selectedNodeId === node.id;
          return (
            <List.Item style={{ padding: 0, marginBottom: 12 }}>
              <Card
                hoverable
                size="small"
                onClick={() => setSelectedNodeId(node.id)}
                style={{
                  width: '100%',
                  borderRadius: 18,
                  borderColor: selected ? '#2563eb' : '#dbe4ee',
                  background: selected ? '#eff6ff' : '#ffffff',
                }}
              >
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Space size={[8, 8]} wrap>
                    <Typography.Text strong>{getNodeDisplayName(node)}</Typography.Text>
                    <Tag color={nodeMeta.color}>{nodeMeta.label}</Tag>
                    {node.orphan ? <Tag color="error">断链</Tag> : null}
                    {node.matched ? <Tag color="processing">命中筛选</Tag> : null}
                  </Space>
                  <Space size={[8, 8]} wrap>
                    <Typography.Text code>{node.deviceName}</Typography.Text>
                    {node.productKey ? <Typography.Text type="secondary">{node.productKey}</Typography.Text> : null}
                    <Badge status={onlineMeta.status} text={onlineMeta.text} />
                    <Tag color={STATUS_COLORS[node.status || ''] || 'default'}>
                      {STATUS_LABELS[node.status || ''] || node.status || '未知状态'}
                    </Tag>
                  </Space>
                </Space>
              </Card>
            </List.Item>
          );
        }}
      />
    );
  };

  const overview = topology.overview || {};
  const relationText = selectedNode
    ? selectedNode.orphan
      ? '当前设备引用了不存在或不可见的上级设备'
      : selectedNode.gatewayDeviceName
        ? `当前挂载到网关 ${selectedNode.gatewayDeviceName}`
        : (selectedNode.directChildCount || 0) > 0
          ? '当前是拓扑根节点'
          : '当前为独立设备'
    : '-';

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="设备拓扑"
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void loadTopology()} loading={loading}>
              刷新
            </Button>
            <Button onClick={() => setExpandedKeys(collectExpandedKeys(rootNodes, 99))} disabled={!rootNodes.length}>
              展开全部
            </Button>
            <Button onClick={() => setExpandedKeys(collectExpandedKeys(rootNodes, 1))} disabled={!rootNodes.length}>
              收起到首层
            </Button>
          </Space>
        }
      />

      <Card style={{ marginBottom: 16, borderRadius: 24 }}>
        <Row gutter={[16, 16]}>
          <Col xs={12} md={8} xl={4}>
            <Statistic title="命中设备" value={overview.matchedDevices || 0} prefix={<HddOutlined />} />
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Statistic title="当前展示" value={overview.visibleDevices || 0} prefix={<ApartmentOutlined />} />
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Statistic title="根节点" value={overview.rootNodes || 0} prefix={<DeploymentUnitOutlined />} />
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Statistic title="网关设备" value={overview.gatewayDevices || 0} prefix={<ShareAltOutlined />} />
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Statistic title="独立设备" value={overview.standaloneDevices || 0} prefix={<HddOutlined />} />
          </Col>
          <Col xs={12} md={8} xl={4}>
            <Statistic title="断链设备" value={overview.orphanDevices || 0} prefix={<DisconnectOutlined />} />
          </Col>
        </Row>
      </Card>

      <Card className="ff-query-card" style={{ borderRadius: 24 }}>
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            value={draftFilters.keyword}
            allowClear
            placeholder="搜索设备名称、别名、产品名称或产品 Key"
            onChange={(event) => {
              setDraftFilters((current) => ({ ...current, keyword: event.target.value }));
            }}
            onPressEnter={applyFilters}
          />
          <div className="ff-query-field" style={{ width: 240 }}>
            <ProductSelect
              style={{ width: '100%' }}
              placeholder="搜索并选择产品（名称或 productKey）"
              value={draftFilters.productId}
              onChange={(value) => {
                setDraftFilters((current) => ({ ...current, productId: value }));
              }}
            />
          </div>
          <Select
            className="ff-query-field"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="所属分组"
            style={{ width: 220 }}
            value={draftFilters.groupId}
            options={groupOptions}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, groupId: value }));
            }}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="设备状态"
            style={{ width: 140 }}
            value={draftFilters.status}
            options={[
              { value: 'INACTIVE', label: '未激活' },
              { value: 'ACTIVE', label: '已激活' },
              { value: 'DISABLED', label: '已禁用' },
            ]}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, status: value }));
            }}
          />
          <Select
            className="ff-query-field"
            allowClear
            placeholder="在线状态"
            style={{ width: 140 }}
            value={draftFilters.onlineStatus}
            options={[
              { value: 'ONLINE', label: '在线' },
              { value: 'OFFLINE', label: '离线' },
            ]}
            onChange={(value) => {
              setDraftFilters((current) => ({ ...current, onlineStatus: value }));
            }}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
        {optionsError ? (
          <Alert
            style={{ marginTop: 12 }}
            type="warning"
            showIcon
            message={optionsError}
            action={<Button size="small" onClick={() => void fetchFilterOptions()}>重试</Button>}
          />
        ) : null}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card style={{ borderRadius: 24 }} bodyStyle={{ paddingTop: 16 }}>
            {loadError ? (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                message={loadError}
                action={<Button size="small" onClick={() => void loadTopology()}>重试</Button>}
              />
            ) : null}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 420 }}>
                <Spin size="large" />
              </div>
            ) : !hasAnyData ? (
              <ListEmpty hasFilters={hasActiveFilters} emptyText="当前没有设备拓扑数据" filteredText="当前筛选下没有设备拓扑数据" onClearFilters={resetFilters} />
            ) : (
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    key: 'roots',
                    label: `拓扑链路 (${rootNodes.length})`,
                    children: rootNodes.length ? (
                      <Tree
                        blockNode
                        showLine={{ showLeafIcon: false }}
                        treeData={treeData}
                        expandedKeys={expandedKeys}
                        selectedKeys={selectedNodeId ? [String(selectedNodeId)] : []}
                        onExpand={(keys) => setExpandedKeys(keys)}
                        onSelect={(keys) => {
                          const nextKey = keys[0];
                          if (typeof nextKey === 'string') {
                            setSelectedNodeId(Number(nextKey));
                          }
                        }}
                      />
                    ) : (
                      <ListEmpty hasFilters={hasActiveFilters} emptyText="当前没有可展示的拓扑链路" filteredText="当前筛选下没有可展示的拓扑链路" onClearFilters={resetFilters} />
                    ),
                  },
                  {
                    key: 'standalone',
                    label: `独立设备 (${standaloneDevices.length})`,
                    children: renderNodeList(standaloneDevices, '当前筛选下没有独立设备'),
                  },
                  {
                    key: 'orphans',
                    label: `断链设备 (${orphanDevices.length})`,
                    children: renderNodeList(orphanDevices, '当前筛选下没有断链设备'),
                  },
                ]}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} xl={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="节点详情" style={{ borderRadius: 24 }}>
              {selectedNode ? (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Space size={[8, 8]} wrap>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {getNodeDisplayName(selectedNode)}
                    </Typography.Title>
                    <Tag color={(NODE_TYPE_META[selectedNode.nodeType || 'DEVICE'] || NODE_TYPE_META.DEVICE).color}>
                      {(NODE_TYPE_META[selectedNode.nodeType || 'DEVICE'] || NODE_TYPE_META.DEVICE).label}
                    </Tag>
                    {selectedNode.orphan ? <Tag color="error">断链</Tag> : null}
                    {selectedNode.matched ? <Tag color="processing">命中筛选</Tag> : null}
                  </Space>

                  <Descriptions column={1} size="small" labelStyle={{ width: 88 }}>
                    <Descriptions.Item label="设备名称">
                      <CopyText text={selectedNode.deviceName} />
                    </Descriptions.Item>
                    <Descriptions.Item label="产品">
                      <Space size={8} wrap>
                        <span>{selectedNode.productName || '-'}</span>
                        {selectedNode.productKey ? <CopyText text={selectedNode.productKey} secondary /> : null}
                      </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="链路位置">{relationText}</Descriptions.Item>
                    <Descriptions.Item label="在线状态">
                      <Badge
                        status={(ONLINE_BADGE[selectedNode.onlineStatus || 'UNKNOWN'] || ONLINE_BADGE.UNKNOWN).status}
                        text={(ONLINE_BADGE[selectedNode.onlineStatus || 'UNKNOWN'] || ONLINE_BADGE.UNKNOWN).text}
                      />
                    </Descriptions.Item>
                    <Descriptions.Item label="设备状态">
                      <Tag color={STATUS_COLORS[selectedNode.status || ''] || 'default'}>
                        {STATUS_LABELS[selectedNode.status || ''] || selectedNode.status || '未知状态'}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="直属下级">{selectedNode.directChildCount || 0}</Descriptions.Item>
                    <Descriptions.Item label="子树规模">{selectedNode.descendantCount || 0}</Descriptions.Item>
                    <Descriptions.Item label="固件版本">{selectedNode.firmwareVersion ? <CopyText text={selectedNode.firmwareVersion} /> : '-'}</Descriptions.Item>
                    <Descriptions.Item label="IP 地址">{selectedNode.ipAddress ? <CopyText text={selectedNode.ipAddress} /> : '-'}</Descriptions.Item>
                    <Descriptions.Item label="最后在线">{formatDateTime(selectedNode.lastOnlineAt)}</Descriptions.Item>
                    <Descriptions.Item label="创建时间">{formatDateTime(selectedNode.createdAt)}</Descriptions.Item>
                  </Descriptions>

                  <Card size="small" title="路径" style={{ borderRadius: 18 }}>
                    {selectedPath.length ? (
                      <Space size={[8, 8]} wrap>
                        {selectedPath.map((node, index) => (
                          <React.Fragment key={node.id}>
                            <Tag color={index === selectedPath.length - 1 ? 'processing' : 'default'}>
                              {getNodeDisplayName(node)}
                            </Tag>
                            {index < selectedPath.length - 1 ? <Typography.Text type="secondary">/</Typography.Text> : null}
                          </React.Fragment>
                        ))}
                      </Space>
                    ) : (
                      <Typography.Text type="secondary">暂无路径</Typography.Text>
                    )}
                  </Card>
                </Space>
              ) : (
                <ListEmpty emptyText="请在左侧拓扑树或设备列表中选择节点查看详情" />
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default DeviceTopologyPage;
