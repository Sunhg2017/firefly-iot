import {
  Button, Space, Typography, Divider,
} from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, BugOutlined, DashboardOutlined } from '@ant-design/icons';
import { useSimStore } from '../../store';
import type { SimDevice } from '../../store';

const { Text } = Typography;

interface Props {
  device: SimDevice;
}

export default function VideoControlPanel({ device }: Props) {
  const { addLog, updateDevice } = useSimStore();
  const isOnline = device.status === 'online';

  if (device.protocol !== 'Video' || !isOnline || !device.videoDeviceId) return null;

  return (
    <>
      <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        <Space style={{ marginBottom: 8 }}><PlayCircleOutlined /><Text strong>流控制</Text></Space>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '请求开始推流...');
                const res = await window.electronAPI.videoStartStream(device.mediaBaseUrl, device.videoDeviceId!, {});
                if (res.success && res.data?.data) {
                  const session = res.data.data;
                  const url = session.playUrl || session.rtspUrl || session.flvUrl || '';
                  updateDevice(device.id, { streamUrl: url });
                  addLog(device.id, device.name, 'success', `推流已开始: ${url || JSON.stringify(session).slice(0, 150)}`);
                } else {
                  addLog(device.id, device.name, 'error', `推流失败: ${res.data?.msg || res.message || JSON.stringify(res.data)}`);
                }
              }}
            >
              开始推流
            </Button>
            <Button
              danger
              icon={<PauseCircleOutlined />}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '请求停止推流...');
                const res = await window.electronAPI.videoStopStream(device.mediaBaseUrl, device.videoDeviceId!);
                if (res.success) {
                  updateDevice(device.id, { streamUrl: '' });
                  addLog(device.id, device.name, 'success', '推流已停止');
                } else {
                  addLog(device.id, device.name, 'error', `停止推流失败: ${res.message || JSON.stringify(res.data)}`);
                }
              }}
            >
              停止推流
            </Button>
            <Button
              icon={<BugOutlined />}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '截图中...');
                const res = await window.electronAPI.videoSnapshot(device.mediaBaseUrl, device.videoDeviceId!);
                if (res.success && res.data?.data?.imageUrl) {
                  addLog(device.id, device.name, 'success', `截图成功: ${res.data.data.imageUrl}`);
                } else {
                  addLog(device.id, device.name, 'error', `截图失败: ${res.data?.msg || res.message || JSON.stringify(res.data)}`);
                }
              }}
            >
              截图
            </Button>
          </Space>
          {device.streamUrl && (
            <div style={{ padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>播放地址: </Text>
              <Text code style={{ fontSize: 11, wordBreak: 'break-all' }}>{device.streamUrl}</Text>
            </div>
          )}
        </Space>
      </div>

      <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        <Space style={{ marginBottom: 8 }}><DashboardOutlined /><Text strong>云台 PTZ / 录制</Text></Space>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            {(['UP', 'DOWN', 'LEFT', 'RIGHT', 'ZOOM_IN', 'ZOOM_OUT'] as const).map((cmd) => (
              <Button
                key={cmd}
                size="small"
                onClick={async () => {
                  addLog(device.id, device.name, 'info', `PTZ: ${cmd}`);
                  const res = await window.electronAPI.videoPtzControl(device.mediaBaseUrl, device.videoDeviceId!, { command: cmd, speed: 50 });
                  if (res.success && res.data?.code === 0) {
                    addLog(device.id, device.name, 'success', `PTZ ${cmd} 执行成功`);
                  } else {
                    addLog(device.id, device.name, 'error', `PTZ 失败: ${res.data?.msg || res.message}`);
                  }
                }}
              >
                {({ UP: '⬆ 上', DOWN: '⬇ 下', LEFT: '⬅ 左', RIGHT: '➡ 右', ZOOM_IN: '🔍+', ZOOM_OUT: '🔍-' } as any)[cmd]}
              </Button>
            ))}
          </Space>
          <Divider style={{ margin: '4px 0' }} />
          <Space wrap>
            <Button
              size="small"
              onClick={async () => {
                addLog(device.id, device.name, 'info', '查询 GB28181 设备目录...');
                const res = await window.electronAPI.videoQueryCatalog(device.mediaBaseUrl, device.videoDeviceId!);
                if (res.success) {
                  addLog(device.id, device.name, 'success', `目录查询已发送`);
                } else {
                  addLog(device.id, device.name, 'error', `目录查询失败: ${res.message}`);
                }
              }}
            >
              查询目录
            </Button>
            <Button
              size="small"
              onClick={async () => {
                addLog(device.id, device.name, 'info', '查询通道列表...');
                const res = await window.electronAPI.videoListChannels(device.mediaBaseUrl, device.videoDeviceId!);
                if (res.success && res.data?.data) {
                  const channels = res.data.data;
                  addLog(device.id, device.name, 'success', `通道数: ${Array.isArray(channels) ? channels.length : 0}, ${JSON.stringify(channels).slice(0, 200)}`);
                } else {
                  addLog(device.id, device.name, 'error', `查询失败: ${res.data?.msg || res.message}`);
                }
              }}
            >
              通道列表
            </Button>
            <Button
              size="small"
              type="primary"
              ghost
              onClick={async () => {
                addLog(device.id, device.name, 'info', '开始录制...');
                const res = await window.electronAPI.videoStartRecording(device.mediaBaseUrl, device.videoDeviceId!);
                if (res.success && res.data?.data) {
                  addLog(device.id, device.name, 'success', `录制已开始: ${JSON.stringify(res.data.data).slice(0, 150)}`);
                } else {
                  addLog(device.id, device.name, 'error', `录制失败: ${res.data?.msg || res.message}`);
                }
              }}
            >
              开始录制
            </Button>
            <Button
              size="small"
              danger
              ghost
              onClick={async () => {
                addLog(device.id, device.name, 'info', '停止录制...');
                const res = await window.electronAPI.videoStopRecording(device.mediaBaseUrl, device.videoDeviceId!);
                if (res.success) {
                  addLog(device.id, device.name, 'success', '录制已停止');
                } else {
                  addLog(device.id, device.name, 'error', `停止录制失败: ${res.data?.msg || res.message}`);
                }
              }}
            >
              停止录制
            </Button>
          </Space>
        </Space>
      </div>
    </>
  );
}
