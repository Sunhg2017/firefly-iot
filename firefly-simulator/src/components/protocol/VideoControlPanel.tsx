import {
  Button, Form, Modal, Select, Space, Typography, Divider, message,
} from 'antd';
import { PlayCircleOutlined, PauseCircleOutlined, BugOutlined, DashboardOutlined, EditOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import { useSimStore } from '../../store';
import type { SimDevice } from '../../store';
import { getActiveEnvironment, useSimWorkspaceStore } from '../../workspaceStore';
import {
  buildFallbackLocalVideoModes,
  buildLocalCameraSourceUrl,
  buildLocalVideoModeKey,
  type LocalVideoModeOption,
  selectPreferredLocalVideoMode,
} from '../../utils/video';

const { Text } = Typography;

interface Props {
  device: SimDevice;
}

function isVideoBizSuccess(result: any) {
  return Boolean(result?.success) && Number(result?.data?.code ?? 0) === 0;
}

function extractVideoResultMessage(result: any, fallback: string) {
  return result?.data?.message
    || result?.data?.msg
    || result?.message
    || fallback;
}

export default function VideoControlPanel({ device }: Props) {
  const { addLog, updateDevice } = useSimStore();
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const activeEnvironment = getActiveEnvironment(environments, activeEnvironmentId);
  const activeSession = sessions[activeEnvironment.id];
  const isOnline = device.status === 'online';
  const gatewayBaseUrl = activeEnvironment.gatewayBaseUrl;
  const token = activeSession?.accessToken;
  const isGb28181 = device.streamMode === 'GB28181';
  const isLocalProxySource = device.videoSourceType === 'LOCAL_CAMERA' && (device.streamMode === 'RTSP' || device.streamMode === 'RTMP');
  const localProxyTarget = isLocalProxySource
    ? buildLocalCameraSourceUrl(gatewayBaseUrl, device.streamMode, device.id)
    : '';
  const [mediaParamOpen, setMediaParamOpen] = useState(false);
  const [mediaParamForm] = Form.useForm();
  const [localVideoSources, setLocalVideoSources] = useState<Array<{ value: string; label: string }>>([]);
  const [localVideoSourceLoading, setLocalVideoSourceLoading] = useState(false);
  const [localVideoModes, setLocalVideoModes] = useState<LocalVideoModeOption[]>([]);
  const [localVideoModeLoading, setLocalVideoModeLoading] = useState(false);
  const selectedCameraDevice = Form.useWatch('cameraDevice', mediaParamForm);
  const selectedMediaWidth = Form.useWatch('mediaWidth', mediaParamForm);
  const selectedMediaHeight = Form.useWatch('mediaHeight', mediaParamForm);
  const selectedMediaFps = Form.useWatch('mediaFps', mediaParamForm);
  const selectedCameraModeKey = buildLocalVideoModeKey(selectedMediaWidth, selectedMediaHeight, selectedMediaFps);
  const availableLocalVideoModes = useMemo(
    () => (localVideoModes.length > 0
      ? localVideoModes
      : buildFallbackLocalVideoModes({
        width: selectedMediaWidth || device.mediaWidth,
        height: selectedMediaHeight || device.mediaHeight,
        fps: selectedMediaFps || device.mediaFps,
      })),
    [device.mediaFps, device.mediaHeight, device.mediaWidth, localVideoModes, selectedMediaFps, selectedMediaHeight, selectedMediaWidth],
  );

  useEffect(() => {
    if (!mediaParamOpen || !isLocalProxySource) {
      setLocalVideoSources([]);
      setLocalVideoModes([]);
      setLocalVideoSourceLoading(false);
      setLocalVideoModeLoading(false);
      return;
    }
    let cancelled = false;
    const loadLocalVideoSources = async () => {
      setLocalVideoSourceLoading(true);
      const result = await window.electronAPI.localVideoListSources();
      if (cancelled) {
        return;
      }
      const records = result?.success && Array.isArray(result.data) ? result.data : [];
      setLocalVideoSources(records);
      setLocalVideoSourceLoading(false);
      if (records.length === 0) {
        return;
      }
      const currentCameraDevice = String(mediaParamForm.getFieldValue('cameraDevice') || '').trim();
      if (currentCameraDevice && records.some((item: { value: string }) => item.value === currentCameraDevice)) {
        return;
      }
      mediaParamForm.setFieldsValue({ cameraDevice: records[0].value });
    };
    void loadLocalVideoSources();
    return () => {
      cancelled = true;
    };
  }, [isLocalProxySource, mediaParamForm, mediaParamOpen]);

  useEffect(() => {
    if (!mediaParamOpen || !isLocalProxySource) {
      setLocalVideoModes([]);
      setLocalVideoModeLoading(false);
      return;
    }
    const probeCameraDevice = String(selectedCameraDevice || localVideoSources[0]?.value || '').trim();
    if (!probeCameraDevice) {
      setLocalVideoModes([]);
      setLocalVideoModeLoading(false);
      return;
    }
    let cancelled = false;
    const loadLocalVideoModes = async () => {
      setLocalVideoModeLoading(true);
      const result = await window.electronAPI.localVideoListModes(probeCameraDevice);
      if (cancelled) {
        return;
      }
      const records = result?.success && Array.isArray(result.data) ? result.data as LocalVideoModeOption[] : [];
      setLocalVideoModes(records);
      setLocalVideoModeLoading(false);
      if (records.length === 0) {
        return;
      }
      const currentModeKey = buildLocalVideoModeKey(
        mediaParamForm.getFieldValue('mediaWidth'),
        mediaParamForm.getFieldValue('mediaHeight'),
        mediaParamForm.getFieldValue('mediaFps'),
      );
      if (records.some((item) => item.key === currentModeKey)) {
        return;
      }
      const preferredMode = selectPreferredLocalVideoMode(records, {
        width: mediaParamForm.getFieldValue('mediaWidth'),
        height: mediaParamForm.getFieldValue('mediaHeight'),
        fps: mediaParamForm.getFieldValue('mediaFps'),
      });
      if (!preferredMode) {
        return;
      }
      mediaParamForm.setFieldsValue({
        mediaWidth: preferredMode.width,
        mediaHeight: preferredMode.height,
        mediaFps: preferredMode.fps,
      });
    };
    void loadLocalVideoModes();
    return () => {
      cancelled = true;
    };
  }, [isLocalProxySource, localVideoSources, mediaParamForm, mediaParamOpen, selectedCameraDevice]);

  if (device.protocol !== 'Video' || !isOnline || !device.platformDeviceId) return null;

  return (
    <>
      <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space><PlayCircleOutlined /><Text strong>流控制</Text></Space>
          {isLocalProxySource ? (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              style={{ fontSize: 11, padding: 0 }}
              onClick={() => {
                mediaParamForm.setFieldsValue({
                  cameraDevice: device.cameraDevice,
                  mediaFps: device.mediaFps,
                  mediaWidth: device.mediaWidth,
                  mediaHeight: device.mediaHeight,
                });
                setMediaParamOpen(true);
              }}
            >
              采集参数
            </Button>
          ) : null}
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {isLocalProxySource ? (
            <div style={{ padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                摄像头: {device.cameraDevice || '系统默认'} | 模式: {device.mediaWidth} x {device.mediaHeight} @ {device.mediaFps}fps
              </Text>
            </div>
          ) : null}
          <Space wrap>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '请求开始推流...');
                if (!token) {
                  addLog(device.id, device.name, 'error', '未登录当前环境，无法调用视频接口');
                  return;
                }
                if (isLocalProxySource) {
                  const localStart = await window.electronAPI.localVideoStart(device.id, {
                    mode: device.streamMode === 'RTMP' ? 'RTMP' : 'RTSP',
                    targetUrl: localProxyTarget,
                    fps: device.mediaFps,
                    width: device.mediaWidth,
                    height: device.mediaHeight,
                    cameraDevice: device.cameraDevice,
                  });
                  if (!localStart.success) {
                    addLog(device.id, device.name, 'error', `本地摄像头推流启动失败: ${localStart.message || '未知错误'}`);
                    return;
                  }
                  addLog(device.id, device.name, 'success', `本地摄像头推流已启动: ${localProxyTarget}`);
                }
                const res = await window.electronAPI.videoControlStartStream(gatewayBaseUrl, device.platformDeviceId!, {}, token);
                if (isVideoBizSuccess(res) && res.data?.data) {
                  const session = res.data.data;
                  const url = session.playUrl || session.rtspUrl || session.flvUrl || '';
                  updateDevice(device.id, { streamUrl: url });
                  addLog(device.id, device.name, 'success', `推流已开始: ${url || JSON.stringify(session).slice(0, 150)}`);
                } else {
                  if (isLocalProxySource) {
                    await window.electronAPI.localVideoStop(device.id);
                  }
                  addLog(device.id, device.name, 'error', `推流失败: ${extractVideoResultMessage(res, '开始推流失败')}`);
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
                if (!token) {
                  addLog(device.id, device.name, 'error', '未登录当前环境，无法调用视频接口');
                  return;
                }
                const res = await window.electronAPI.videoControlStopStream(gatewayBaseUrl, device.platformDeviceId!, token);
                if (isVideoBizSuccess(res)) {
                  await window.electronAPI.localVideoStop(device.id);
                  updateDevice(device.id, { streamUrl: '' });
                  addLog(device.id, device.name, 'success', '推流已停止');
                } else {
                  addLog(device.id, device.name, 'error', `停止推流失败: ${extractVideoResultMessage(res, '停止推流失败')}`);
                }
              }}
            >
              停止推流
            </Button>
            <Button
              icon={<BugOutlined />}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '截图中...');
                if (!token) {
                  addLog(device.id, device.name, 'error', '未登录当前环境，无法调用视频接口');
                  return;
                }
                const res = await window.electronAPI.videoControlSnapshot(gatewayBaseUrl, device.platformDeviceId!, token);
                if (isVideoBizSuccess(res) && res.data?.data?.imageUrl) {
                  addLog(device.id, device.name, 'success', `截图成功: ${res.data.data.imageUrl}`);
                } else {
                  addLog(device.id, device.name, 'error', `截图失败: ${extractVideoResultMessage(res, '截图失败')}`);
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

      <Modal
        title="编辑本地采集参数"
        open={mediaParamOpen}
        width={420}
        destroyOnHidden
        onCancel={() => setMediaParamOpen(false)}
        onOk={async () => {
          const vals = await mediaParamForm.validateFields();
          updateDevice(device.id, {
            cameraDevice: vals.cameraDevice || '',
            mediaFps: Number(vals.mediaFps) || device.mediaFps,
            mediaWidth: Number(vals.mediaWidth) || device.mediaWidth,
            mediaHeight: Number(vals.mediaHeight) || device.mediaHeight,
          });
          message.success(device.streamUrl
            ? '采集参数已保存，请停止后重新开始推流以应用新配置'
            : '采集参数已保存');
          setMediaParamOpen(false);
        }}
      >
        <Form form={mediaParamForm} layout="vertical" size="small">
          <Form.Item name="cameraDevice" label="摄像头设备" style={{ marginBottom: 8 }}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={localVideoSourceLoading}
              options={localVideoSources.map((item) => ({
                value: item.value,
                label: item.label,
              }))}
              placeholder={localVideoSources.length > 0 ? '选择本机摄像头' : '未检测到本机摄像头时将使用系统默认设备'}
              onChange={() => {
                setLocalVideoModes([]);
                mediaParamForm.setFieldsValue({
                  mediaWidth: 1280,
                  mediaHeight: 720,
                  mediaFps: 30,
                });
              }}
            />
          </Form.Item>
          <Form.Item
            label="采集模式"
            style={{ marginBottom: 0 }}
            extra={localVideoModes.length > 0 ? undefined : '未读取到设备支持模式时，可先选择通用采集模式'}
          >
            <Select
              value={selectedCameraModeKey}
              loading={localVideoModeLoading}
              options={availableLocalVideoModes.map((item) => ({
                value: item.key,
                label: item.label,
              }))}
              onChange={(value) => {
                const mode = availableLocalVideoModes.find((item) => item.key === value);
                if (!mode) {
                  return;
                }
                mediaParamForm.setFieldsValue({
                  mediaWidth: mode.width,
                  mediaHeight: mode.height,
                  mediaFps: mode.fps,
                });
              }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        <Space style={{ marginBottom: 8 }}><DashboardOutlined /><Text strong>云台 PTZ / 录制</Text></Space>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space wrap>
            {(['UP', 'DOWN', 'LEFT', 'RIGHT', 'ZOOM_IN', 'ZOOM_OUT'] as const).map((cmd) => (
              <Button
                key={cmd}
                size="small"
                disabled={!isGb28181 || !token}
                onClick={async () => {
                  addLog(device.id, device.name, 'info', `PTZ: ${cmd}`);
                  const res = await window.electronAPI.videoControlPtz(gatewayBaseUrl, device.platformDeviceId!, { command: cmd, speed: 50 }, token);
                  if (isVideoBizSuccess(res)) {
                    addLog(device.id, device.name, 'success', `PTZ ${cmd} 执行成功`);
                  } else {
                    addLog(device.id, device.name, 'error', `PTZ 失败: ${extractVideoResultMessage(res, 'PTZ 控制失败')}`);
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
              disabled={!isGb28181 || !token}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '查询 GB28181 设备目录...');
                const res = await window.electronAPI.videoControlCatalog(gatewayBaseUrl, device.platformDeviceId!, token);
                if (isVideoBizSuccess(res)) {
                  addLog(device.id, device.name, 'success', `目录查询已发送`);
                } else {
                  addLog(device.id, device.name, 'error', `目录查询失败: ${extractVideoResultMessage(res, '目录查询失败')}`);
                }
              }}
            >
              查询目录
            </Button>
            <Button
              size="small"
              disabled={!isGb28181 || !token}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '查询 GB28181 设备信息...');
                const res = await window.electronAPI.videoControlDeviceInfo(gatewayBaseUrl, device.platformDeviceId!, token);
                if (isVideoBizSuccess(res)) {
                  addLog(device.id, device.name, 'success', '设备信息查询已发送');
                } else {
                  addLog(device.id, device.name, 'error', `设备信息查询失败: ${extractVideoResultMessage(res, '设备信息查询失败')}`);
                }
              }}
            >
              设备信息
            </Button>
            <Button
              size="small"
              disabled={!token}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '查询通道列表...');
                const res = await window.electronAPI.deviceVideoChannels(gatewayBaseUrl, device.platformDeviceId!, token);
                if (isVideoBizSuccess(res) && res.data?.data) {
                  const channels = res.data.data;
                  addLog(device.id, device.name, 'success', `通道数: ${Array.isArray(channels) ? channels.length : 0}, ${JSON.stringify(channels).slice(0, 200)}`);
                } else {
                  addLog(device.id, device.name, 'error', `查询失败: ${extractVideoResultMessage(res, '查询通道失败')}`);
                }
              }}
            >
              通道列表
            </Button>
            <Button
              size="small"
              type="primary"
              ghost
              disabled={!token}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '开始录制...');
                const res = await window.electronAPI.videoControlStartRecording(gatewayBaseUrl, device.platformDeviceId!, token);
                if (isVideoBizSuccess(res) && res.data?.data) {
                  addLog(device.id, device.name, 'success', `录制已开始: ${JSON.stringify(res.data.data).slice(0, 150)}`);
                } else {
                  addLog(device.id, device.name, 'error', `录制失败: ${extractVideoResultMessage(res, '开始录制失败')}`);
                }
              }}
            >
              开始录制
            </Button>
            <Button
              size="small"
              danger
              ghost
              disabled={!token}
              onClick={async () => {
                addLog(device.id, device.name, 'info', '停止录制...');
                const res = await window.electronAPI.videoControlStopRecording(gatewayBaseUrl, device.platformDeviceId!, token);
                if (isVideoBizSuccess(res)) {
                  addLog(device.id, device.name, 'success', '录制已停止');
                } else {
                  addLog(device.id, device.name, 'error', `停止录制失败: ${extractVideoResultMessage(res, '停止录制失败')}`);
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
