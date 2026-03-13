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
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import CodeEditorField from '../../components/CodeEditorField';
import { deviceApi } from '../../services/api';

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
  deviceName?: string;
  nickname?: string;
  productName?: string;
  productKey?: string;
  open: boolean;
  onClose: () => void;
}

const cardStyle = {
  borderRadius: 18,
  border: '1px solid rgba(148,163,184,0.16)',
  boxShadow: '0 14px 32px rgba(15,23,42,0.06)',
} as const;

const formatJson = (value: Record<string, unknown> | null | undefined) =>
  JSON.stringify(value || {}, null, 2);

const countKeys = (value: Record<string, unknown> | null | undefined) =>
  value ? Object.keys(value).length : 0;

const DeviceShadowDrawer: React.FC<Props> = ({
  deviceId,
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
  const [desiredJson, setDesiredJson] = useState('{}');
  const displayName = nickname || deviceName || '未命名设备';
  const productDisplay = productName
    ? productKey
      ? `${productName} / ${productKey}`
      : productName
    : productKey || '未关联产品信息';

  const desiredCount = countKeys(shadow?.desired);
  const reportedCount = countKeys(shadow?.reported);
  const deltaCount = countKeys(delta);

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
      const [shadowRes, deltaRes] = await Promise.all([
        deviceApi.getShadow(deviceId),
        deviceApi.getDelta(deviceId),
      ]);
      const nextShadow = shadowRes.data.data as ShadowData;
      setShadow(nextShadow);
      setDelta((deltaRes.data.data || {}) as Record<string, unknown>);
      setDesiredJson(formatJson(nextShadow.desired));
      setEditingDesired(false);
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
    }
  }, [open, deviceId]);

  const handleUpdateDesired = async () => {
    if (!deviceId) {
      return;
    }
    try {
      const parsed = JSON.parse(desiredJson);
      await deviceApi.updateDesired(deviceId, parsed);
      message.success('期望属性已更新');
      await fetchShadow();
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
      await deviceApi.clearDesired(deviceId);
      message.success('期望属性已清空');
      await fetchShadow();
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
    } catch {
      message.error('删除设备影子失败');
    }
  };

  return (
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
            title="确认删除当前影子？"
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
          <Empty description="当前设备还没有影子数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
                  description="可在下方查看 delta 差异项，判断设备还有哪些属性未追平期望状态。"
                />
              ) : (
                <Alert
                  type="success"
                  showIcon
                  message="当前设备影子已同步"
                  description="desired 与 reported 没有差异，设备状态与平台期望一致。"
                />
              )}
            </Space>
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card
                title="Desired / 期望属性"
                extra={
                  <Space size={8}>
                    {!editingDesired ? (
                      <Button size="small" icon={<EditOutlined />} onClick={() => setEditingDesired(true)}>
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
                            setDesiredJson(formatJson(shadow.desired));
                          }}
                        >
                          取消
                        </Button>
                      </>
                    )}
                    <Popconfirm
                      title="确认清空 desired？"
                      description="清空后设备将不再存在待同步期望项。"
                      onConfirm={() => void handleClearDesired()}
                    >
                      <Button danger size="small" icon={<ClearOutlined />}>
                        清空
                      </Button>
                    </Popconfirm>
                  </Space>
                }
                style={cardStyle}
                styles={{ body: { padding: 16 } }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Paragraph style={{ margin: 0, color: '#64748b' }}>
                    维护平台期望设备达到的目标状态。保存时会合并字段，值设为 `null` 可删除对应属性。
                  </Paragraph>
                  <CodeEditorField
                    language="json"
                    path={`file:///device-shadow/${deviceName || deviceId || 'unknown'}/desired.json`}
                    value={desiredJson}
                    onChange={setDesiredJson}
                    readOnly={!editingDesired}
                    height={320}
                  />
                </Space>
              </Card>
            </Col>

            <Col xs={24} xl={12}>
              <Card
                title="Reported / 上报属性"
                style={cardStyle}
                styles={{ body: { padding: 16 } }}
              >
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Paragraph style={{ margin: 0, color: '#64748b' }}>
                    设备当前已经确认并上报的状态，用于和 desired 做同步差异对比。
                  </Paragraph>
                  <CodeEditorField
                    language="json"
                    path={`file:///device-shadow/${deviceName || deviceId || 'unknown'}/reported.json`}
                    value={formatJson(shadow.reported)}
                    onChange={() => undefined}
                    readOnly
                    height={320}
                  />
                </Space>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card
                title={
                  <Space size={8}>
                    <span>Delta / 差异</span>
                    <Tag color={deltaCount > 0 ? 'warning' : 'success'}>
                      {deltaCount > 0 ? `${deltaCount} 项待同步` : '已同步'}
                    </Tag>
                  </Space>
                }
                style={cardStyle}
                styles={{ body: { padding: 16 } }}
              >
                <CodeEditorField
                  language="json"
                  path={`file:///device-shadow/${deviceName || deviceId || 'unknown'}/delta.json`}
                  value={formatJson(delta)}
                  onChange={() => undefined}
                  readOnly
                  height={240}
                />
              </Card>
            </Col>

            <Col xs={24} xl={12}>
              <Card
                title="Metadata / 元数据"
                style={cardStyle}
                styles={{ body: { padding: 16 } }}
              >
                <CodeEditorField
                  language="json"
                  path={`file:///device-shadow/${deviceName || deviceId || 'unknown'}/metadata.json`}
                  value={formatJson(shadow.metadata)}
                  onChange={() => undefined}
                  readOnly
                  height={240}
                />
              </Card>
            </Col>
          </Row>
        </Space>
      ) : null}
    </Drawer>
  );
};

export default DeviceShadowDrawer;
