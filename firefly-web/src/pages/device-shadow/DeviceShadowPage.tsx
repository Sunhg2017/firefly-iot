import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Popconfirm,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ClearOutlined,
  DeleteOutlined,
  EditOutlined,
  FullscreenOutlined,
  LockOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import CodeEditorField from '../../components/CodeEditorField';
import PageHeader from '../../components/PageHeader';
import ShadowPanelFullscreenDrawer from '../../components/ShadowPanelFullscreenDrawer';
import { deviceApi, productApi } from '../../services/api';
import { buildDesiredTemplateFromThingModel } from '../../utils/deviceShadowThingModel';

const { Paragraph, Title } = Typography;

interface ShadowData {
  deviceId: number;
  desired: Record<string, unknown>;
  reported: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

interface DeviceOptionRecord {
  id: number;
  productId?: number;
  deviceName: string;
  nickname?: string;
  onlineStatus?: string;
  status?: string;
}

interface DeviceOption {
  value: number;
  label: string;
  meta: DeviceOptionRecord;
}

type ShadowPanelKey = 'desired' | 'reported' | 'delta' | 'metadata';

const surfaceCardStyle = {
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.16)',
  boxShadow: '0 18px 40px rgba(15,23,42,0.06)',
} as const;

const metricCardStyle = {
  ...surfaceCardStyle,
  background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
} as const;

const editorCardStyle = {
  ...surfaceCardStyle,
  boxShadow: '0 14px 32px rgba(15,23,42,0.05)',
} as const;

const inlineEditorHeight = 320;
const editorDescriptionMinHeight = 88;
const editorColStyle = {
  display: 'flex',
} as const;
const editorCardBodyStyle = {
  padding: 18,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
} as const;

const formatJson = (value: Record<string, unknown> | null | undefined) =>
  JSON.stringify(value || {}, null, 2);

const countKeys = (value: Record<string, unknown> | null | undefined) =>
  value ? Object.keys(value).length : 0;

const onlineColorMap: Record<string, string> = {
  ONLINE: 'success',
  OFFLINE: 'default',
  UNKNOWN: 'warning',
};

const onlineTextMap: Record<string, string> = {
  ONLINE: '在线',
  OFFLINE: '离线',
  UNKNOWN: '未知',
};

const statusColorMap: Record<string, string> = {
  ACTIVE: 'success',
  INACTIVE: 'default',
  DISABLED: 'error',
};

const statusTextMap: Record<string, string> = {
  ACTIVE: '已激活',
  INACTIVE: '未激活',
  DISABLED: '已禁用',
};

const renderDeviceLabel = (device: DeviceOptionRecord) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ fontWeight: 600, color: '#0f172a' }}>{device.nickname || device.deviceName}</span>
    <span style={{ fontSize: 12, color: '#64748b' }}>{device.deviceName}</span>
  </div>
);

const readOnlyTitle = (title: string) => (
  <Space size={8}>
    <span>{title}</span>
    <Tag icon={<LockOutlined />} color="default" style={{ marginInlineEnd: 0 }}>
      只读
    </Tag>
  </Space>
);

const desiredEditorDescription = (
  <>
    平台期望设备最终达到的目标状态。点击“编辑”时会先根据产品物模型自动补齐可写属性，再叠加当前
    <code> desired </code>
    内容；保存时会按字段合并，属性值设为
    <code> null </code>
    可删除对应属性。
  </>
);

const reportedEditorDescription = '设备当前实际确认并上报的状态，仅用于查看和比对，不支持人工修改。';
const deltaEditorDescription = '系统根据 desired 与 reported 自动计算出的差异项，用于判断设备还有哪些目标状态尚未追平。';
const metadataEditorDescription = '字段更新时间、来源等元数据由系统自动维护，主要用于定位属性变更来源。';

const DeviceShadowPage: React.FC = () => {
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [deviceSearchText, setDeviceSearchText] = useState('');
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>();
  const [shadow, setShadow] = useState<ShadowData | null>(null);
  const [delta, setDelta] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingDesired, setEditingDesired] = useState(false);
  const [prefillingDesired, setPrefillingDesired] = useState(false);
  const [desiredText, setDesiredText] = useState('{}');
  const [thingModel, setThingModel] = useState<unknown>(null);
  const [expandedPanelKey, setExpandedPanelKey] = useState<ShadowPanelKey | null>(null);

  const selectedDevice = useMemo(
    () => deviceOptions.find((item) => item.value === selectedDeviceId),
    [deviceOptions, selectedDeviceId],
  );

  const deltaCount = countKeys(delta);
  const desiredCount = countKeys(shadow?.desired);
  const reportedCount = countKeys(shadow?.reported);

  const closeExpandedPanel = () => {
    setExpandedPanelKey(null);
  };

  const renderExpandTrigger = (panelKey: ShadowPanelKey) => (
    <Button size="small" icon={<FullscreenOutlined />} onClick={() => setExpandedPanelKey(panelKey)}>
      全屏
    </Button>
  );

  const loadDeviceOptions = async (keyword = '') => {
    try {
      const res = await deviceApi.list({
        pageNum: 1,
        pageSize: 30,
        keyword: keyword || undefined,
      });
      const records = (res.data.data?.records || []) as DeviceOptionRecord[];
      setDeviceOptions(
        records.map((item) => ({
          value: item.id,
          label: item.nickname ? `${item.nickname} / ${item.deviceName}` : item.deviceName,
          meta: item,
        })),
      );
    } catch {
      message.error('加载设备选项失败');
    }
  };

  useEffect(() => {
    void loadDeviceOptions();
  }, []);

  const fetchShadow = async (deviceId?: number) => {
    const targetDeviceId = deviceId ?? selectedDeviceId;
    const targetDevice = deviceOptions.find((item) => item.value === targetDeviceId);
    if (!targetDeviceId) {
      message.warning('请先选择设备');
      return;
    }

    setLoading(true);
    try {
      const [shadowRes, deltaRes, thingModelRes] = await Promise.all([
        deviceApi.getShadow(targetDeviceId),
        deviceApi.getDelta(targetDeviceId),
        targetDevice?.meta.productId
          ? productApi.getThingModel(targetDevice.meta.productId).catch(() => null)
          : Promise.resolve(null),
      ]);
      const nextShadow = shadowRes.data.data as ShadowData;
      setShadow(nextShadow);
      setDesiredText(formatJson(nextShadow.desired));
      setDelta((deltaRes.data.data || {}) as Record<string, unknown>);
      // Cache the latest thing model so desired editing and drawer expansion share one source of truth.
      setThingModel(thingModelRes?.data?.data ?? null);
      setEditingDesired(false);
    } catch {
      message.error('加载设备影子失败');
    } finally {
      setLoading(false);
    }
  };

  const loadThingModelForEdit = async () => {
    const targetProductId = selectedDevice?.meta.productId;
    if (!targetProductId) {
      return thingModel;
    }
    try {
      const res = await productApi.getThingModel(targetProductId);
      const payload = res.data.data ?? null;
      setThingModel(payload);
      return payload;
    } catch {
      if (thingModel) {
        message.warning('最新物模型加载失败，已按当前缓存的物模型生成 desired 草稿');
        return thingModel;
      }
      message.warning('加载产品物模型失败，已按当前 desired 打开编辑器');
      return null;
    }
  };

  const handleEditDesired = async () => {
    if (!shadow) {
      return;
    }
    setPrefillingDesired(true);
    try {
      const latestThingModel = await loadThingModelForEdit();
      const { desired } = buildDesiredTemplateFromThingModel(latestThingModel, shadow.desired);
      setDesiredText(formatJson(desired));
      setEditingDesired(true);
    } finally {
      setPrefillingDesired(false);
    }
  };

  const handleSaveDesired = async () => {
    if (!selectedDeviceId) {
      return;
    }

    try {
      const parsed = JSON.parse(desiredText);
      await deviceApi.updateDesired(selectedDeviceId, parsed);
      message.success('期望值已更新');
      await fetchShadow(selectedDeviceId);
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        message.error('Desired JSON 格式错误');
        return;
      }
      message.error('更新期望值失败');
    }
  };

  const handleClearDesired = async () => {
    if (!selectedDeviceId) {
      return;
    }
    try {
      await deviceApi.clearDesired(selectedDeviceId);
      message.success('期望值已清空');
      await fetchShadow(selectedDeviceId);
    } catch {
      message.error('清空期望值失败');
    }
  };

  const handleDeleteShadow = async () => {
    if (!selectedDeviceId) {
      return;
    }
    try {
      await deviceApi.deleteShadow(selectedDeviceId);
      message.success('设备影子已删除');
      setShadow(null);
      setDelta(null);
      setDesiredText('{}');
      setEditingDesired(false);
      closeExpandedPanel();
    } catch {
      message.error('删除设备影子失败');
    }
  };

  const renderEditorPane = ({
    description,
    path,
    value,
    onChange,
    readOnly = false,
    readOnlyLabel,
    height,
  }: {
    description: React.ReactNode;
    path: string;
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    readOnlyLabel?: string;
    height: number;
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', height: '100%' }}>
      {/* Keep the four cards visually aligned even when descriptions wrap to different line counts. */}
      <Paragraph style={{ margin: 0, color: '#64748b', minHeight: editorDescriptionMinHeight, lineHeight: 1.6 }}>
        {description}
      </Paragraph>
      <CodeEditorField
        language="json"
        path={path}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        readOnlyLabel={readOnlyLabel}
        height={height}
      />
    </div>
  );

  const renderDesiredActions = (includeExpand = false) => (
    <Space size={8}>
      {!editingDesired ? (
        <Button
          size="small"
          icon={<EditOutlined />}
          loading={prefillingDesired}
          onClick={() => void handleEditDesired()}
        >
          编辑
        </Button>
      ) : (
        <>
          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => void handleSaveDesired()}>
            保存
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditingDesired(false);
              setDesiredText(formatJson(shadow?.desired));
            }}
          >
            取消
          </Button>
        </>
      )}
      <Popconfirm
        title="确认清空 desired 吗？"
        description="清空后设备将不再有待同步的目标状态。"
        onConfirm={() => void handleClearDesired()}
      >
        <Button size="small" danger icon={<ClearOutlined />}>
          清空
        </Button>
      </Popconfirm>
      {includeExpand ? renderExpandTrigger('desired') : null}
    </Space>
  );

  const overviewItems = [
    {
      key: 'version',
      label: '影子版本',
      value: `${shadow?.version ?? 0}`,
      hint: '只有影子状态实际变更时才会递增。',
      color: '#2563eb',
      bg: 'rgba(37,99,235,0.10)',
    },
    {
      key: 'desired',
      label: '期望属性',
      value: `${desiredCount}`,
      hint: '平台希望设备最终达到的目标状态数。',
      color: '#d97706',
      bg: 'rgba(217,119,6,0.10)',
    },
    {
      key: 'reported',
      label: '上报属性',
      value: `${reportedCount}`,
      hint: '设备已确认并上报的当前状态数。',
      color: '#059669',
      bg: 'rgba(5,150,105,0.10)',
    },
    {
      key: 'delta',
      label: '待同步差异',
      value: `${deltaCount}`,
      hint: deltaCount > 0 ? '设备仍有属性未追平平台期望。' : '设备当前已与平台期望一致。',
      color: deltaCount > 0 ? '#dc2626' : '#4f46e5',
      bg: deltaCount > 0 ? 'rgba(220,38,38,0.10)' : 'rgba(79,70,229,0.10)',
    },
  ];

  const expandedPanelTitle = useMemo(() => {
    switch (expandedPanelKey) {
      case 'desired':
        return 'Desired / 期望值';
      case 'reported':
        return 'Reported / 上报值';
      case 'delta':
        return 'Delta / 差异';
      case 'metadata':
        return 'Metadata / 元数据';
      default:
        return '';
    }
  }, [expandedPanelKey]);

  const renderExpandedPanelExtra = () => {
    if (expandedPanelKey === 'desired') {
      return renderDesiredActions(false);
    }
    if (expandedPanelKey === 'delta') {
      return (
        <Tag color={deltaCount > 0 ? 'warning' : 'success'} style={{ marginInlineEnd: 0 }}>
          {deltaCount > 0 ? `${deltaCount} 项待同步` : '已同步'}
        </Tag>
      );
    }
    return null;
  };

  const renderExpandedPanelBody = () => {
    // Both the page cards and the 75vw drawer share the same draft state so edits never drift.
    switch (expandedPanelKey) {
      case 'desired':
        return renderEditorPane({
          description: desiredEditorDescription,
          path: 'file:///device-shadow/desired-expanded.json',
          value: desiredText,
          onChange: setDesiredText,
          readOnly: !editingDesired,
          readOnlyLabel: editingDesired ? undefined : '查看态',
          height: 640,
        });
      case 'reported':
        return renderEditorPane({
          description: reportedEditorDescription,
          path: 'file:///device-shadow/reported-expanded.json',
          value: formatJson(shadow?.reported),
          readOnly: true,
          readOnlyLabel: '只读',
          height: 640,
        });
      case 'delta':
        return renderEditorPane({
          description: deltaEditorDescription,
          path: 'file:///device-shadow/delta-expanded.json',
          value: formatJson(delta || {}),
          readOnly: true,
          readOnlyLabel: '只读',
          height: 560,
        });
      case 'metadata':
        return renderEditorPane({
          description: metadataEditorDescription,
          path: 'file:///device-shadow/metadata-expanded.json',
          value: formatJson(shadow?.metadata),
          readOnly: true,
          readOnlyLabel: '只读',
          height: 560,
        });
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="设备影子"
        description="按设备查看 desired、reported、delta 与 metadata，并仅对 desired 提供维护能力。"
      />

      <Card
        style={{
          ...surfaceCardStyle,
          marginBottom: 20,
          background: 'linear-gradient(135deg, #f8fbff 0%, #ffffff 50%, #eef6ff 100%)',
        }}
        styles={{ body: { padding: 24 } }}
      >
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
              先选择设备，再查看影子状态
            </Title>
            <Paragraph style={{ margin: 0, color: '#64748b' }}>
              这里优先用设备名称和别名定位设备，避免用户手工输入数据库主键。查询后可以直接维护
              desired，同时查看设备实际上报状态、同步差异和元数据。
            </Paragraph>
          </Space>

          <Space wrap style={{ width: '100%' }} size={12}>
            <Select<number>
              showSearch
              allowClear
              filterOption={false}
              placeholder="搜索设备名称或别名"
              style={{ minWidth: 360, flex: '1 1 360px' }}
              value={selectedDeviceId}
              options={deviceOptions.map((item) => ({
                value: item.value,
                label: renderDeviceLabel(item.meta),
              }))}
              onSearch={(value) => {
                setDeviceSearchText(value);
                void loadDeviceOptions(value.trim());
              }}
              onChange={(value) => {
                setSelectedDeviceId(value);
                closeExpandedPanel();
                if (!value) {
                  setShadow(null);
                  setDelta(null);
                  setDesiredText('{}');
                  setThingModel(null);
                  setEditingDesired(false);
                }
              }}
              notFoundContent={deviceSearchText ? '未找到匹配设备' : '暂无设备'}
            />
            <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={() => void fetchShadow()}>
              查询影子
            </Button>
            <Button icon={<ReloadOutlined />} disabled={!selectedDeviceId} onClick={() => void fetchShadow()}>
              刷新
            </Button>
            <Popconfirm
              title="确认删除当前设备影子吗？"
              description="删除后 desired、reported、metadata 会一起清空。"
              onConfirm={() => void handleDeleteShadow()}
              disabled={!selectedDeviceId}
            >
              <Button danger icon={<DeleteOutlined />} disabled={!selectedDeviceId}>
                删除影子
              </Button>
            </Popconfirm>
          </Space>

          {selectedDevice ? (
            <Descriptions
              size="small"
              column={3}
              items={[
                {
                  key: 'deviceName',
                  label: '设备名称',
                  children: selectedDevice.meta.deviceName,
                },
                {
                  key: 'nickname',
                  label: '设备别名',
                  children: selectedDevice.meta.nickname || '未设置',
                },
                {
                  key: 'onlineStatus',
                  label: '在线状态',
                  children: (
                    <Tag color={onlineColorMap[selectedDevice.meta.onlineStatus || 'UNKNOWN']}>
                      {onlineTextMap[selectedDevice.meta.onlineStatus || 'UNKNOWN']}
                    </Tag>
                  ),
                },
                {
                  key: 'status',
                  label: '设备状态',
                  children: (
                    <Tag color={statusColorMap[selectedDevice.meta.status || 'INACTIVE']}>
                      {statusTextMap[selectedDevice.meta.status || 'INACTIVE']}
                    </Tag>
                  ),
                },
                {
                  key: 'updatedAt',
                  label: '最近更新时间',
                  children: shadow?.updatedAt || '尚未生成影子',
                },
                {
                  key: 'sync',
                  label: '同步状态',
                  children:
                    shadow && deltaCount === 0 ? (
                      <Tag color="success">已同步</Tag>
                    ) : shadow ? (
                      <Tag color="warning">存在差异</Tag>
                    ) : (
                      <Tag>未查询</Tag>
                    ),
                },
              ]}
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="还未选择设备"
              description="可以按设备名称或别名搜索，选中后再查看影子。"
            />
          )}
        </Space>
      </Card>

      {!shadow && !loading ? (
        <Card style={surfaceCardStyle} styles={{ body: { padding: 48 } }}>
          <Empty
            description="选择设备后即可查看影子、差异和元数据。"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : null}

      {shadow ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
            {overviewItems.map((item) => (
              <Col xs={24} sm={12} lg={6} key={item.key}>
                <Card style={metricCardStyle} styles={{ body: { padding: 18 } }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: item.bg,
                        color: item.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        fontWeight: 700,
                      }}
                    >
                      {item.value}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>{item.label}</div>
                      <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8' }}>{item.hint}</div>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Alert
            type="info"
            showIcon
            style={{ ...surfaceCardStyle, marginBottom: 20 }}
            message="编辑说明"
            description="只有 Desired 可以人工维护。Reported 由设备上报，Delta 与 Metadata 由系统自动计算，这三部分页面仅支持查看和复制。"
          />

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12} style={editorColStyle}>
              <Card
                title="Desired / 期望值"
                extra={renderDesiredActions(true)}
                style={{ ...editorCardStyle, width: '100%' }}
                styles={{ body: editorCardBodyStyle }}
              >
                {renderEditorPane({
                  description: desiredEditorDescription,
                  path: `file:///device-shadow/desired-${editingDesired ? 'draft' : 'view'}.json`,
                  value: desiredText,
                  onChange: setDesiredText,
                  readOnly: !editingDesired,
                  readOnlyLabel: editingDesired ? undefined : '查看态',
                  height: inlineEditorHeight,
                })}
              </Card>
            </Col>

            <Col xs={24} xl={12} style={editorColStyle}>
              <Card
                title={readOnlyTitle('Reported / 上报值')}
                extra={renderExpandTrigger('reported')}
                style={{ ...editorCardStyle, width: '100%' }}
                styles={{ body: editorCardBodyStyle }}
              >
                {renderEditorPane({
                  description: reportedEditorDescription,
                  path: 'file:///device-shadow/reported.json',
                  value: formatJson(shadow.reported),
                  readOnly: true,
                  readOnlyLabel: '只读',
                  height: inlineEditorHeight,
                })}
              </Card>
            </Col>

            <Col xs={24} xl={12} style={editorColStyle}>
              <Card
                title={
                  <Space size={8}>
                    {readOnlyTitle('Delta / 差异')}
                    <Tag color={deltaCount > 0 ? 'warning' : 'success'}>
                      {deltaCount > 0 ? `${deltaCount} 项待同步` : '已同步'}
                    </Tag>
                  </Space>
                }
                extra={renderExpandTrigger('delta')}
                style={{ ...editorCardStyle, width: '100%' }}
                styles={{ body: editorCardBodyStyle }}
              >
                {renderEditorPane({
                  description: deltaEditorDescription,
                  path: 'file:///device-shadow/delta.json',
                  value: formatJson(delta || {}),
                  readOnly: true,
                  readOnlyLabel: '只读',
                  height: inlineEditorHeight,
                })}
              </Card>
            </Col>

            <Col xs={24} xl={12} style={editorColStyle}>
              <Card
                title={readOnlyTitle('Metadata / 元数据')}
                extra={renderExpandTrigger('metadata')}
                style={{ ...editorCardStyle, width: '100%' }}
                styles={{ body: editorCardBodyStyle }}
              >
                {renderEditorPane({
                  description: metadataEditorDescription,
                  path: 'file:///device-shadow/metadata.json',
                  value: formatJson(shadow.metadata),
                  readOnly: true,
                  readOnlyLabel: '只读',
                  height: inlineEditorHeight,
                })}
              </Card>
            </Col>
          </Row>
        </>
      ) : null}

      <ShadowPanelFullscreenDrawer
        title={expandedPanelTitle}
        open={!!shadow && !!expandedPanelKey}
        onClose={closeExpandedPanel}
        extra={renderExpandedPanelExtra()}
      >
        {renderExpandedPanelBody()}
      </ShadowPanelFullscreenDrawer>
    </div>
  );
};

export default DeviceShadowPage;
