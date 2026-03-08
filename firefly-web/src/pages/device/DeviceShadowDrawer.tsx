import React, { useEffect, useState } from 'react';
import { Drawer, Descriptions, Button, Space, message, Input, Tag, Popconfirm, Tabs, Empty } from 'antd';
import { SyncOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { deviceApi } from '../../services/api';

const { TextArea } = Input;

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
  open: boolean;
  onClose: () => void;
}

const DeviceShadowDrawer: React.FC<Props> = ({ deviceId, open, onClose }) => {
  const [shadow, setShadow] = useState<ShadowData | null>(null);
  const [delta, setDelta] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [desiredJson, setDesiredJson] = useState('');

  const fetchShadow = async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const [shadowRes, deltaRes] = await Promise.all([
        deviceApi.getShadow(deviceId),
        deviceApi.getDelta(deviceId),
      ]);
      setShadow(shadowRes.data.data);
      setDelta(deltaRes.data.data || {});
    } catch { message.error('加载影子失败'); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (open && deviceId) { fetchShadow(); setDesiredJson(''); }
  }, [open, deviceId]);

  const handleUpdateDesired = async () => {
    if (!deviceId || !desiredJson.trim()) return;
    try {
      const parsed = JSON.parse(desiredJson);
      await deviceApi.updateDesired(deviceId, parsed);
      message.success('期望属性已更新');
      setDesiredJson('');
      fetchShadow();
    } catch (e) {
      if (e instanceof SyntaxError) message.error('JSON 格式错误');
      else message.error('更新失败');
    }
  };

  const handleClearDesired = async () => {
    if (!deviceId) return;
    await deviceApi.clearDesired(deviceId);
    message.success('期望属性已清空');
    fetchShadow();
  };

  const handleDeleteShadow = async () => {
    if (!deviceId) return;
    await deviceApi.deleteShadow(deviceId);
    message.success('影子已删除');
    setShadow(null);
    setDelta({});
  };

  const renderJson = (data: Record<string, unknown> | null | undefined) => {
    if (!data || Object.keys(data).length === 0) return <Empty description="无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    return <pre style={{ margin: 0, fontSize: 12, maxHeight: 300, overflow: 'auto', background: '#fafafa', padding: 8, borderRadius: 4 }}>{JSON.stringify(data, null, 2)}</pre>;
  };

  const deltaCount = Object.keys(delta).length;

  return (
    <Drawer title={`设备影子 #${deviceId || ''}`} open={open} onClose={onClose} width={600}
      extra={<Space>
        <Button icon={<SyncOutlined />} onClick={fetchShadow} loading={loading} size="small">刷新</Button>
        <Popconfirm title="确认删除影子？" onConfirm={handleDeleteShadow}><Button danger icon={<DeleteOutlined />} size="small">删除</Button></Popconfirm>
      </Space>}>

      {shadow && (
        <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="版本">{shadow.version}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{shadow.updatedAt || '-'}</Descriptions.Item>
          <Descriptions.Item label="差异属性" span={2}>
            {deltaCount > 0 ? <Tag color="warning">{deltaCount} 个属性待同步</Tag> : <Tag color="success">已同步</Tag>}
          </Descriptions.Item>
        </Descriptions>
      )}

      <Tabs defaultActiveKey="desired" items={[
        {
          key: 'desired', label: '期望属性 (Desired)',
          children: (
            <div>
              {renderJson(shadow?.desired)}
              <div style={{ marginTop: 16 }}>
                <TextArea rows={4} value={desiredJson} onChange={e => setDesiredJson(e.target.value)}
                  placeholder='输入 JSON，如 {"temperature": 25, "mode": "auto"}&#10;设置 null 值可删除属性' />
                <Space style={{ marginTop: 8 }}>
                  <Button type="primary" icon={<SaveOutlined />} onClick={handleUpdateDesired} disabled={!desiredJson.trim()}>更新期望</Button>
                  <Popconfirm title="确认清空期望属性？" onConfirm={handleClearDesired}><Button danger>清空期望</Button></Popconfirm>
                </Space>
              </div>
            </div>
          ),
        },
        {
          key: 'reported', label: '上报属性 (Reported)',
          children: renderJson(shadow?.reported),
        },
        {
          key: 'delta', label: `差异 (Delta) ${deltaCount > 0 ? `(${deltaCount})` : ''}`,
          children: renderJson(delta),
        },
        {
          key: 'metadata', label: '元数据',
          children: renderJson(shadow?.metadata),
        },
      ]} />
    </Drawer>
  );
};

export default DeviceShadowDrawer;
