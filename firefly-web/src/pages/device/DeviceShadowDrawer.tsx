import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
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
import CopyText from '../../components/CopyText';
import JsonEditorField, { isValidJson } from '../../components/JsonEditorField';
import ListEmpty from '../../components/ListEmpty';
import ShadowPanelFullscreenDrawer from '../../components/ShadowPanelFullscreenDrawer';
import { deviceApi, productApi } from '../../services/api';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { buildDesiredTemplateFromThingModel } from '../../utils/deviceShadowThingModel';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';

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
  const [savingDesired, setSavingDesired] = useState(false);
  const [clearingDesired, setClearingDesired] = useState(false);
  const [deletingShadow, setDeletingShadow] = useState(false);
  const [desiredJson, setDesiredJson] = useState('{}');
  const [thingModel, setThingModel] = useState<unknown>(null);
  const [expandedPanelKey, setExpandedPanelKey] = useState<ShadowPanelKey | null>(null);
  const confirmDiscard = useConfirmDiscard();

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
  // 编辑态下只有内容真正发生变化才需要拦截关闭，避免仅点击“编辑”也被要求确认。
  const desiredDirty = editingDesired && desiredJson !== formatJson(shadow?.desired);
  useDirtyGuard(desiredDirty);

  const closeExpandedPanel = () => {
    setExpandedPanelKey(null);
  };

  const handleRequestClose = () => {
    confirmDiscard(
      desiredDirty,
      () => {
        setEditingDesired(false);
        setDesiredJson(formatJson(shadow?.desired));
        closeExpandedPanel();
        onClose();
      },
      {
        title: '放弃未保存的期望属性修改？',
        content: '关闭后本次编辑的 desired 内容将丢失，且无法恢复。',
      },
    );
  };

  const handleRefresh = () => {
    confirmDiscard(
      desiredDirty,
      () => {
        setEditingDesired(false);
        void fetchShadow();
      },
      {
        title: '放弃未保存的期望属性修改？',
        content: '刷新会重新加载影子数据，本次编辑的 desired 内容将丢失。',
      },
    );
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
    } catch (error) {
      if (warningMessage) {
        message.warning(getErrorMessage(error, warningMessage));
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
    } catch (error) {
      message.error(getErrorMessage(error, '加载设备影子失败'));
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
    } catch (error) {
      if (thingModel) {
        message.warning(getErrorMessage(error, '最新物模型加载失败，已按当前缓存的物模型生成 desired 草稿'));
        return thingModel;
      }
      message.warning(getErrorMessage(error, '加载产品物模型失败，已按当前 desired 打开编辑器'));
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
    if (!deviceId || savingDesired) {
      return;
    }
    if (!isValidJson(desiredJson)) {
      message.error('期望属性不是合法的 JSON');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(desiredJson);
    } catch (error) {
      message.error(getErrorMessage(error, '期望属性不是合法的 JSON'));
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      message.error('期望属性必须是 JSON 对象');
      return;
    }
    setSavingDesired(true);
    try {
      const updateRes = await deviceApi.updateDesired(deviceId, parsed as Record<string, unknown>);
      applyShadowSnapshot(updateRes.data.data as ShadowData);
      message.success('期望属性已更新');
      await refreshDelta('期望属性已更新，但差异刷新失败，请手动点击刷新');
    } catch (error) {
      message.error(getErrorMessage(error, '更新期望属性失败'));
    } finally {
      setSavingDesired(false);
    }
  };

  const handleClearDesired = async () => {
    if (!deviceId || clearingDesired) {
      return;
    }
    setClearingDesired(true);
    try {
      const clearRes = await deviceApi.clearDesired(deviceId);
      applyShadowSnapshot(clearRes.data.data as ShadowData);
      setDelta({});
      message.success('期望属性已清空');
    } catch (error) {
      message.error(getErrorMessage(error, '清空期望属性失败'));
    } finally {
      setClearingDesired(false);
    }
  };

  const handleDeleteShadow = async () => {
    if (!deviceId || deletingShadow) {
      return;
    }
    setDeletingShadow(true);
    try {
      await deviceApi.deleteShadow(deviceId);
      message.success('设备影子已删除');
      setShadow(null);
      setDelta({});
      setDesiredJson('{}');
      setEditingDesired(false);
      closeExpandedPanel();
    } catch (error) {
      message.error(getErrorMessage(error, '删除设备影子失败'));
    } finally {
      setDeletingShadow(false);
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

  const renderDesiredEditor = (height: number, path: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <Paragraph style={{ margin: 0, color: '#64748b', minHeight: editorDescriptionMinHeight, lineHeight: 1.6 }}>
        {desiredEditorDescription}
      </Paragraph>
      <JsonEditorField
        value={desiredJson}
        onChange={setDesiredJson}
        height={height}
        path={path}
        disabled={!editingDesired}
      />
    </div>
  );

  const renderDesiredActions = (includeExpand = false) => (
    <Space size={8} wrap>
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
          <Button size="small" type="primary" icon={<SaveOutlined />} loading={savingDesired} onClick={() => void handleUpdateDesired()}>
            保存
          </Button>
          <Button
            size="small"
            disabled={savingDesired}
            onClick={() => {
              setEditingDesired(false);
              setDesiredJson(formatJson(shadow?.desired));
            }}
          >
            取消
          </Button>
        </>
      )}
      <CopyText text={desiredJson}><span>复制</span></CopyText>
      <Popconfirm
        title="确认清空全部期望属性？"
        description="清空后设备不会再有新的期望指令，未同步的 desired 修改会丢失；reported 上报属性不受影响，此操作不可恢复。"
        okText="清空"
        okButtonProps={{ danger: true }}
        onConfirm={() => handleClearDesired()}
      >
        <Button danger size="small" icon={<ClearOutlined />} loading={clearingDesired} disabled={editingDesired && savingDesired}>
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
    if (expandedPanelKey === 'reported') {
      return <CopyText text={formatJson(shadow?.reported)}><span>复制 JSON</span></CopyText>;
    }
    if (expandedPanelKey === 'metadata') {
      return <CopyText text={formatJson(shadow?.metadata)}><span>复制 JSON</span></CopyText>;
    }
    if (expandedPanelKey === 'delta') {
      return (
        <Space size={8}>
          <CopyText text={formatJson(delta)}><span>复制 JSON</span></CopyText>
          <Tag color={deltaCount > 0 ? 'warning' : 'success'} style={{ marginInlineEnd: 0 }}>
            {deltaCount > 0 ? `${deltaCount} 项待同步` : '已同步'}
          </Tag>
        </Space>
      );
    }
    return null;
  };

  const renderExpandedPanelBody = () => {
    switch (expandedPanelKey) {
      case 'desired':
        return renderDesiredEditor(600, `file:///device-shadow/${deviceName || deviceId || 'unknown'}/desired-expanded.json`);
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
        onClose={handleRequestClose}
        width={860}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} size="small" loading={loading} onClick={handleRefresh}>
              刷新
            </Button>
            <Popconfirm
              title="确认删除设备影子？"
              description="删除后 desired、reported、metadata 将全部清空且无法恢复；设备下次上报会重新生成影子。"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDeleteShadow()}
            >
              <Button danger icon={<DeleteOutlined />} size="small" loading={deletingShadow}>
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
            <ListEmpty emptyText="当前设备还没有影子数据；设备上报属性或设置期望属性后会自动生成" />
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
                      children: shadow.updatedAt ? formatDateTime(shadow.updatedAt) : '-',
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
                  {renderDesiredEditor(inlineEditorHeight, desiredInlineEditorPath)}
                </Card>
              </Col>

              <Col xs={24} xl={12} style={editorColStyle}>
                <Card
                  title={readOnlyTitle('Reported / 上报属性')}
                  extra={(
                    <Space size={8}>
                      <CopyText text={formatJson(shadow.reported)}><span>复制 JSON</span></CopyText>
                      {renderExpandTrigger('reported')}
                    </Space>
                  )}
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
                  extra={(
                    <Space size={8}>
                      <CopyText text={formatJson(delta)}><span>复制 JSON</span></CopyText>
                      {renderExpandTrigger('delta')}
                    </Space>
                  )}
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
                  extra={(
                    <Space size={8}>
                      <CopyText text={formatJson(shadow.metadata)}><span>复制 JSON</span></CopyText>
                      {renderExpandTrigger('metadata')}
                    </Space>
                  )}
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
