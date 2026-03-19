import React from 'react';
import { Button, Divider, Space, Switch, Typography } from 'antd';
import { ThunderboltOutlined, WifiOutlined } from '@ant-design/icons';
import { useSimStore } from '../../store';
import type { SimDevice } from '../../store';

const { Text } = Typography;

interface Props {
  device: SimDevice;
  coapShadowPolling: boolean;
  setCoapShadowPolling: React.Dispatch<React.SetStateAction<boolean>>;
  coapShadowData: string;
  setCoapShadowData: React.Dispatch<React.SetStateAction<string>>;
  coapPollRef: React.MutableRefObject<number | null>;
}

export default function CoapControlPanel({
  device,
  coapShadowPolling,
  setCoapShadowPolling,
  coapShadowData,
  setCoapShadowData,
  coapPollRef,
}: Props) {
  const { addLog } = useSimStore();
  const isOnline = device.status === 'online';

  if (device.protocol !== 'CoAP' || !isOnline) return null;

  return (
    <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
      <Space style={{ marginBottom: 8 }}>
        <ThunderboltOutlined />
        <Text strong>设备影子</Text>
      </Space>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Space>
          <Button
            icon={<WifiOutlined />}
            onClick={async () => {
              addLog(device.id, device.name, 'info', '开始拉取设备影子期望值...');
              const result = await window.electronAPI.coapGetShadow(device.coapBaseUrl, device.token);
              if (result.success) {
                const data = JSON.stringify(result.data || result, null, 2);
                setCoapShadowData(data);
                addLog(device.id, device.name, 'success', `影子期望值：${data.slice(0, 200)}`);
              } else {
                addLog(device.id, device.name, 'error', `拉取失败：${result.message || JSON.stringify(result)}`);
              }
            }}
            size="small"
          >
            拉取期望属性
          </Button>
          <Divider type="vertical" />
          <Switch
            size="small"
            checked={coapShadowPolling}
            onChange={(checked) => {
              if (checked) {
                const poll = async () => {
                  const result = await window.electronAPI.coapGetShadow(device.coapBaseUrl, device.token);
                  if (result.success) {
                    setCoapShadowData(JSON.stringify(result.data || result, null, 2));
                  }
                };
                poll();
                const timerId = window.setInterval(poll, 10000);
                coapPollRef.current = timerId;
                setCoapShadowPolling(true);
                addLog(device.id, device.name, 'info', '已开启影子自动拉取（10秒）');
              } else {
                if (coapPollRef.current) {
                  clearInterval(coapPollRef.current);
                  coapPollRef.current = null;
                }
                setCoapShadowPolling(false);
                addLog(device.id, device.name, 'info', '已关闭影子自动拉取');
              }
            }}
            checkedChildren="自动"
            unCheckedChildren="手动"
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            低功耗设备定期拉取期望状态
          </Text>
        </Space>
        {coapShadowData && (
          <div style={{ padding: 8, background: '#0d1117', borderRadius: 6, maxHeight: 160, overflow: 'auto' }}>
            <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: '#d4d4d4', whiteSpace: 'pre-wrap' }}>
              {coapShadowData}
            </pre>
          </div>
        )}
      </Space>
    </div>
  );
}
