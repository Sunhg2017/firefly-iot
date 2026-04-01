import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Popconfirm,
  Row,
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
} from '@ant-design/icons';
import CodeEditorField from '../../components/CodeEditorField';
import ShadowPanelFullscreenDrawer from '../../components/ShadowPanelFullscreenDrawer';
import { deviceApi, productApi } from '../../services/api';
import { buildDesiredTemplateFromThingModel } from '../../utils/deviceShadowThingModel';

const { Paragraph } = Typography;

interface ShadowData {
  deviceId: number;
  desired: Record<string, unknown>;
  reported: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

interface Props {
  deviceId: number | null;
  productId?: number;
  deviceName?: string;
  nickname?: string;
  productName?: string;
  productKey?: string;
  open: boolean;
  onClose: () => void;
}

type ShadowPanelKey = 'desired' | 'reported' | 'delta' | 'metadata';

const cardStyle = {
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.16)',
  boxShadow: '0 14px 32px rgba(15,23,42,0.06)',
} as const;

const inlineEditorHeight = 320;
const editorDescriptionMinHeight = 88;
const editorColStyle = {
  display: 'flex',
} as const;
const editorCardBodyStyle = {
  padding: 16,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
} as const;

const formatJson = (value: Record<string, unknown> | null | undefined) =>
  JSON.stringify(value || {}, null, 2);

const countKeys = (value: Record<string, unknown> | null | undefined) =>
  value ? Object.keys(value).length : 0;

const readOnlyTitle = (title: string) => (
  <Space size={8}>
    <span>{title}</span>
    <Tag icon={<LockOutlined />} color="default" style={{ marginInlineEnd: 0 }}>
      只读
    </Tag>
  </Space>
);

const desiredEditorDescription = <>属性值设为 <code>null</code> 可删除对应属性。</>;
const reportedEditorDescription = null;
const deltaEditorDescription = null;
const metadataEditorDescription = null;

const DeviceShadowDrawer: React.FC<Props> = ({
  deviceId,
  productId,
  deviceName,
  nickname,
  productName,
  productKey,
  open,
  onClose,
}) => {
  const [shadow, setShadow] = useState<ShadowData | null>(null);
  const [delta, setDelta] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [editingDesired, setEditingDesired] = useState(false);
  const [prefillingDesired, setPrefillingDesired] = useState(false);
  const [desiredJson, setDesiredJson] = useState('{}');
  const [thingModel, setThingModel] = useState<unknown>(null);
  const [expandedPanelKey, setExpandedPanelKey] = useState<ShadowPanelKey | null>(null);

  const displayName = nickname || deviceName || '未命名设备';
  const productDisplay = productName
    ? productKey
      ? `${productName} / ${productKey}`
      : productName
    : productKey || '未关联产品信息';

  const desiredCount = countKeys(shadow?.desired);
  const reportedCount = countKeys(shadow?.reported);
  const deltaCount = countKeys(delta);
  const desiredInlineEditorPath = `file:///device-shadow/${deviceName || deviceId || 'unknown'}/desired.json`;

  const closeExpandedPanel = () => {
    setExpandedPanelKey(null);
  };

  const applyShadowSnapshot = (nextShadow: ShadowData) => {
    setShadow(nextShadow);
    setDesiredJson(formatJson(nextShadow.desired));
    setEditingDesired(false);
  };

  const refreshDelta = async (warningMessage?: string) => {
    if (!deviceId) {
      return;
    }
    try {
      const deltaRes = await deviceApi.getDelta(deviceId);
      setDelta((deltaRes.data.data || {}) as Record<string, unknown>);
    } catch {
      if (warningMessage) {
        message.warning(warningMessage);
      }
    }
  };

  const renderExpandTrigger = (panelKey: ShadowPanelKey) => (
    <Button size="small" icon={<FullscreenOutlined />} onClick={() => setExpandedPanelKey(panelKey)}>
      全屏
    </Button>
  );

  const overviewItems = useMemo(
    () => [
      {
        key: 'version',
        label: '影子版本',
        value: `${shadow?.version ?? 0}`,
        color: '#2563eb',
        bg: 'rgba(37,99,235,0.10)',
      },
      {
        key: 'desired',
        label: '期望属性',
        value: `${desiredCount}`,
        color: '#d97706',
        bg: 'rgba(217,119,6,0.10)',
      },
      {
        key: 'reported',
        label: '上报属性',
        value: `${reportedCount}`,
        color: '#059669',
        bg: 'rgba(5,150,105,0.10)',
      },
      {
        key: 'delta',
        label: '待同步差异',
        value: `${deltaCount}`,
        color: deltaCount > 0 ? '#dc2626' : '#4f46e5',
        bg: deltaCount > 0 ? 'rgba(220,38,38,0.10)' : 'rgba(79,70,229,0.10)',
      },
    ],
    [deltaCount, desiredCount, reportedCount, shadow?.version],
  );

  const fetchShadow = async () => {
    if (!deviceId) {
      return;
    }
    setLoading(true);
    try {
      const [shadowRes, deltaRes, thingModelRes] = await Promise.all([
        deviceApi.getShadow(deviceId),
        deviceApi.getDelta(deviceId),
        productId ? productApi.getThingModel(productId).catch(() => null) : Promise.resolve(null),
      ]);
      const nextShadow = shadowRes.data.data as ShadowData;
      applyShadowSnapshot(nextShadow);
      setDelta((deltaRes.data.data || {}) as Record<string, unknown>);
      // Cache the latest thing model so the card and the nested drawer reuse the same desired draft source.
      setThingModel(thingModelRes?.data?.data ?? null);
    } catch {
      message.error('加载设备影子失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && deviceId) {
      void fetchShadow();
    }
    if (!open) {
      setEditingDesired(false);
      setThingModel(null);
      closeExpandedPanel();
    }
  }, [open, deviceId, productId]);

  const loadThingModelForEdit = async () => {
    if (!productId) {
      return thingModel;
    }
    try {
      const res = await productApi.getThingModel(productId);
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
      setDesiredJson(formatJson(desired));
      setEditingDesired(true);
    } finally {
      setPrefillingDesired(false);
    }
  };

  const handleUpdateDesired = async () => {
    if (!deviceId) {
      return;
    }
    try {
      const parsed = JSON.parse(desiredJson);
      const updateRes = await deviceApi.updateDesired(deviceId, parsed);
      applyShadowSnapshot(updateRes.data.data as ShadowData);
      message.success('期望属性已更新');
      await refreshDelta('期望属性已更新，但差异刷新失败，请手动点击刷新');
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error('Desired JSON 格式错误');
        return;
      }
      message.error('更新期望属性失败');
    }
  };

  const handleClearDesired = async () => {
    if (!deviceId) {
      return;
    }
    try {
      const clearRes = await deviceApi.clearDesired(deviceId);
      applyShadowSnapshot(clearRes.data.data as ShadowData);
      setDelta({});
      message.success('期望属性已清空');
    } catch {
      message.error('清空期望属性失败');
    }
  };

  const handleDeleteShadow = async () => {
    if (!deviceId) {
      return;
    }
    try {
      await deviceApi.deleteShadow(deviceId);
      message.success('设备影子已删除');
      setShadow(null);
      setDelta({});
      setDesiredJson('{}');
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
    description?: React.ReactNode;
    path: string;
    value: string;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    readOnlyLabel?: string;
    height: number;
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', height: '100%' }}>
      {description ? (
        <Paragraph style={{ margin: 0, color: '#64748b', minHeight: editorDescriptionMinHeight, lineHeight: 1.6 }}>
          {description}
        </Paragraph>
      ) : null}
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
          <Button size="small" type="primary" icon={<SaveOutlined />} onClick={() => void handleUpdateDesired()}>
            保存
          </Button>
          <Button
            size="small"
            onClick={() => {
              setEditingDesired(false);
              setDesiredJson(formatJson(shadow?.desired));
            }}
          >
            取消
          </Button>
        </>
      )}
      <Popconfirm
        title="确认清空 desired 吗？"
        description="清空后设备将不再存在待同步的目标状态。"
        onConfirm={() => void handleClearDesired()}
      >
        <Button danger size="small" icon={<ClearOutlined />}>
          清空
        </Button>
      </Popconfirm>
      {includeExpand ? renderExpandTrigger('desired') : null}
    </Space>
  );

  const expandedPanelTitle = useMemo(() => {
    switch (expandedPanelKey) {
      case 'desired':
        return 'Desired / 期望属性';
      case 'reported':
        return 'Reported / 上报属性';
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
    switch (expandedPanelKey) {
      case 'desired':
        return renderEditorPane({
          description: desiredEditorDescription,
          path: `file:///device-shadow/${deviceName || deviceId || 'unknown'}/desired-expanded.json`,
          value: desiredJson,
          onChange: setDesiredJson,
          readOnly: !editingDesired,
          readOnlyLabel: editingDesired ? undefined : '查看态',
          height: 640,
        });
      case 'reported':
        return renderEditorPane({
          description: reportedEditorDescription,
          path: `file:///device-shadow/${deviceName || deviceId || 'unknown'}/reported-expanded.json`,
          value: formatJson(shadow?.reported),
          readOnly: true,
          readOnlyLabel: '只读',
          height: 640,
        });
      case 'delta':
        return renderEditorPane({
          description: deltaEditorDescription,
          path: `file:///device-shadow/${deviceName || deviceId || 'unknown'}/delta-expanded.json`,
          value: formatJson(delta),
          readOnly: true,
          readOnlyLabel: '只读',
          height: 560,
        });
      case 'metadata':
        return renderEditorPane({
          description: metadataEditorDescription,
          path: `file:///device-shadow/${deviceName || deviceId || 'unknown'}/metadata-expanded.json`,
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
    <>
      <Drawer
        title={
          <Space direction="vertical" size={2}>
            <Typography.Text style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>
              设备影子
            </Typography.Text>
            <Space size={8} wrap>
              <Typography.Text style={{ color: '#334155' }}>{displayName}</Typography.Text>
              {deviceName && nickname ? (
                <Typography.Text code style={{ fontSize: 12 }}>
                  {deviceName}
                </Typography.Text>
              ) : null}
              {productName || productKey ? <Tag color="blue">{productDisplay}</Tag> : null}
            </Space>
          </Space>
        }
        open={open}
        onClose={onClose}
        width={860}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} size="small" loading={loading} onClick={() => void fetchShadow()}>
              刷新
            </Button>
            <Popconfirm
              title="确认删除当前影子吗？"
              description="删除后 desired、reported、metadata 会一起清空。"
              onConfirm={() => void handleDeleteShadow()}
            >
              <Button danger icon={<DeleteOutlined />} size="small">
                删除
              </Button>
            </Popconfirm>
          </Space>
        }
        styles={{
          body: {
            padding: 20,
            background: 'linear-gradient(180deg, #f8fbff 0%, #f5f8fc 100%)',
          },
        }}
      >
        {!shadow && !loading ? (
          <Card style={cardStyle} styles={{ body: { padding: 40 } }}>
            <Empty description="当前设备还没有影子数据。" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </Card>
        ) : null}

        {shadow ? (
          <Space direction="vertical" size={18} style={{ width: '100%' }}>
            <Card
              style={{
                ...cardStyle,
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 50%, #eef6ff 100%)',
              }}
              styles={{ body: { padding: 20 } }}
            >
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Descriptions
                  size="small"
                  column={3}
                  items={[
                    {
                      key: 'device',
                      label: '设备',
                      children: displayName,
                    },
                    {
                      key: 'deviceName',
                      label: '设备编码',
                      children: deviceName || '-',
                    },
                    {
                      key: 'product',
                      label: '所属产品',
                      children: productDisplay,
                    },
                    {
                      key: 'updatedAt',
                      label: '最近更新时间',
                      children: shadow.updatedAt || '-',
                    },
                    {
                      key: 'sync',
                      label: '同步状态',
                      children:
                        deltaCount > 0 ? (
                          <Tag color="warning">{deltaCount} 项待同步</Tag>
                        ) : (
                          <Tag color="success">已同步</Tag>
                        ),
                    },
                  ]}
                />

                <Row gutter={[12, 12]}>
                  {overviewItems.map((item) => (
                    <Col xs={12} lg={6} key={item.key}>
                      <Card
                        size="small"
                        style={{
                          borderRadius: 16,
                          border: '1px solid rgba(148,163,184,0.12)',
                          background: '#fff',
                        }}
                        styles={{ body: { padding: 14 } }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 14,
                              background: item.bg,
                              color: item.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 16,
                            }}
                          >
                            {item.value}
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>{item.label}</div>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  ))}
                </Row>

                {deltaCount > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="设备当前尚未完全同步 desired"
                  />
                ) : (
                  <Alert
                    type="success"
                    showIcon
                    message="当前设备影子已同步"
                  />
                )}
              </Space>
            </Card>

            <Row gutter={[16, 16]}>
              <Col xs={24} xl={12} style={editorColStyle}>
                <Card
                  title="Desired / 期望属性"
                  extra={renderDesiredActions(true)}
                  style={{ ...cardStyle, width: '100%' }}
                  styles={{ body: editorCardBodyStyle }}
                >
                  {renderEditorPane({
                    description: desiredEditorDescription,
                    // Keep one stable Monaco model so saving does not switch into an empty cached view model.
                    path: desiredInlineEditorPath,
                    value: desiredJson,
                    onChange: setDesiredJson,
                    readOnly: !editingDesired,
                    readOnlyLabel: editingDesired ? undefined : '查看态',
                    height: inlineEditorHeight,
                  })}
                </Card>
              </Col>

              <Col xs={24} xl={12} style={editorColStyle}>
                <Card
                  title={readOnlyTitle('Reported / 上报属性')}
                  extra={renderExpandTrigger('reported')}
                  style={{ ...cardStyle, width: '100%' }}
                  styles={{ body: editorCardBodyStyle }}
                >
                  {renderEditorPane({
                    description: reportedEditorDescription,
                    path: `file:///device-shadow/${deviceName || deviceId || 'unknown'}/reported.json`,
                    value: formatJson(shadow.reported),
                    readOnly: true,
                    readOnlyLabel: '只读',
                    height: inlineEditorHeight,
                  })}
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
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
                  style={{ ...cardStyle, width: '100%' }}
                  styles={{ body: editorCardBodyStyle }}
                >
                  {renderEditorPane({
                    description: deltaEditorDescription,
                    path: `file:///device-shadow/${deviceName || deviceId || 'unknown'}/delta.json`,
                    value: formatJson(delta),
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
                  style={{ ...cardStyle, width: '100%' }}
                  styles={{ body: editorCardBodyStyle }}
                >
                  {renderEditorPane({
                    description: metadataEditorDescription,
                    path: `file:///device-shadow/${deviceName || deviceId || 'unknown'}/metadata.json`,
                    value: formatJson(shadow.metadata),
                    readOnly: true,
                    readOnlyLabel: '只读',
                    height: inlineEditorHeight,
                  })}
                </Card>
              </Col>
            </Row>
          </Space>
        ) : null}
      </Drawer>

      <ShadowPanelFullscreenDrawer
        title={expandedPanelTitle}
        open={!!shadow && !!expandedPanelKey}
        onClose={closeExpandedPanel}
        extra={renderExpandedPanelExtra()}
      >
        {renderExpandedPanelBody()}
      </ShadowPanelFullscreenDrawer>
    </>
  );
};

export default DeviceShadowDrawer;
