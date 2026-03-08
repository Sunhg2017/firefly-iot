import React, { useState } from 'react';
import { Button, Space, message, Input, Card, Row, Col, Tag, Popconfirm, Empty, Typography } from 'antd';
import { SearchOutlined, ReloadOutlined, DeleteOutlined, ClearOutlined, EditOutlined, SaveOutlined } from '@ant-design/icons';
import { deviceApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';

const { Text } = Typography;

interface ShadowData {
  deviceId: number;
  desired: Record<string, unknown>;
  reported: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: number;
  updatedAt: string;
}

interface JsonEditorProps {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}

const JsonEditor: React.FC<JsonEditorProps> = ({ value, onChange, readOnly }) => (
  <Input.TextArea
    value={value}
    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
    readOnly={readOnly}
    rows={12}
    style={{ fontFamily: 'monospace', fontSize: 13 }}
  />
);

const DeviceShadowPage: React.FC = () => {
  const [deviceId, setDeviceId] = useState<string>('');
  const [shadow, setShadow] = useState<ShadowData | null>(null);
  const [delta, setDelta] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const [editingDesired, setEditingDesired] = useState(false);
  const [desiredText, setDesiredText] = useState('');

  const fetchShadow = async () => {
    if (!deviceId) { message.warning('请输入设备 ID'); return; }
    setLoading(true);
    try {
      const res = await deviceApi.getShadow(Number(deviceId));
      const data = res.data.data;
      setShadow(data);
      setDesiredText(JSON.stringify(data.desired || {}, null, 2));
      setEditingDesired(false);
      setDelta(null);
    } catch { message.error('加载设备影子失败'); } finally { setLoading(false); }
  };

  const fetchDelta = async () => {
    if (!deviceId) return;
    try {
      const res = await deviceApi.getDelta(Number(deviceId));
      setDelta(res.data.data);
    } catch { message.error('加载 delta 失败'); }
  };

  const handleSaveDesired = async () => {
    try {
      const parsed = JSON.parse(desiredText);
      await deviceApi.updateDesired(Number(deviceId), parsed);
      message.success('Desired 已更新');
      setEditingDesired(false);
      fetchShadow();
    } catch (e: unknown) {
      if (e instanceof SyntaxError) message.error('JSON 格式错误');
      else message.error('更新失败');
    }
  };

  const handleClearDesired = async () => {
    await deviceApi.clearDesired(Number(deviceId));
    message.success('Desired 已清空');
    fetchShadow();
  };

  const handleDeleteShadow = async () => {
    await deviceApi.deleteShadow(Number(deviceId));
    message.success('影子已删除');
    setShadow(null);
    setDelta(null);
  };

  return (
    <div>
      <PageHeader title="设备影子" description="查看和管理设备期望状态与上报状态" />

      {/* Search bar */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input placeholder="输入设备 ID" style={{ width: 200 }} value={deviceId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeviceId(e.target.value)}
            onPressEnter={fetchShadow} />
          <Button type="primary" icon={<SearchOutlined />} onClick={fetchShadow} loading={loading}>查询</Button>
          {shadow && (
            <>
              <Button icon={<ReloadOutlined />} onClick={fetchShadow}>刷新</Button>
              <Button onClick={fetchDelta}>查看 Delta</Button>
              <Popconfirm title="确认删除整个设备影子？" onConfirm={handleDeleteShadow}>
                <Button danger icon={<DeleteOutlined />}>删除影子</Button>
              </Popconfirm>
            </>
          )}
        </Space>
        {shadow && (
          <Space style={{ marginTop: 12 }}>
            <Tag color="blue">设备 ID: {shadow.deviceId}</Tag>
            <Tag color="green">版本: {shadow.version}</Tag>
            {shadow.updatedAt && <Tag>更新: {shadow.updatedAt}</Tag>}
          </Space>
        )}
      </Card>

      {!shadow && !loading && (
        <Empty description="输入设备 ID 查询影子" style={{ marginTop: 60 }} />
      )}

      {shadow && (
        <Row gutter={16}>
          <Col span={12}>
            <Card
              title={<span>Desired <Tag color="orange">期望值</Tag></span>}
              size="small"
              style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
              extra={
                <Space>
                  {!editingDesired ? (
                    <Button size="small" icon={<EditOutlined />} onClick={() => setEditingDesired(true)}>编辑</Button>
                  ) : (
                    <>
                      <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSaveDesired}>保存</Button>
                      <Button size="small" onClick={() => { setEditingDesired(false); setDesiredText(JSON.stringify(shadow.desired || {}, null, 2)); }}>取消</Button>
                    </>
                  )}
                  <Popconfirm title="清空 desired？" onConfirm={handleClearDesired}>
                    <Button size="small" danger icon={<ClearOutlined />}>清空</Button>
                  </Popconfirm>
                </Space>
              }>
              <JsonEditor value={desiredText} onChange={setDesiredText} readOnly={!editingDesired} />
            </Card>
          </Col>
          <Col span={12}>
            <Card title={<span>Reported <Tag color="green">上报值</Tag></span>} size="small" style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <JsonEditor value={JSON.stringify(shadow.reported || {}, null, 2)} onChange={() => {}} readOnly />
            </Card>
          </Col>
        </Row>
      )}

      {delta && (
        <Card title={<span>Delta <Tag color="red">差异</Tag></span>} size="small" style={{ marginTop: 16, borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <Text><pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 13 }}>{JSON.stringify(delta, null, 2)}</pre></Text>
        </Card>
      )}

      {shadow && shadow.metadata && Object.keys(shadow.metadata).length > 0 && (
        <Card title="Metadata" size="small" style={{ marginTop: 16, borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <Text><pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 13 }}>{JSON.stringify(shadow.metadata, null, 2)}</pre></Text>
        </Card>
      )}
    </div>
  );
};

export default DeviceShadowPage;
