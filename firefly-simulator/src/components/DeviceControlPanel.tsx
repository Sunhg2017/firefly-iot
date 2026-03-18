import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Empty,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Tooltip,
  message,
} from 'antd';
import {
  ApiOutlined,
  CloudUploadOutlined,
  DisconnectOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { SimDevice } from '../store';
import { useSimStore } from '../store';
import {
  CoapControlPanel,
  HttpControlPanel,
  LoRaWanControlPanel,
  ModbusControlPanel,
  MqttControlPanel,
  SipControlPanel,
  SnmpControlPanel,
  TcpUdpControlPanel,
  VideoControlPanel,
  WebSocketControlPanel,
} from './protocol';
import type { HttpHistoryEntry, LoRaMsg, MqttMsg, SipMsg, TcpUdpMsg, WsMsg } from './protocol';
import {
  buildMqttPublishTopic,
  buildMqttServiceTopic,
  dynamicRegisterDevice,
  resolveMqttIdentity,
  shouldDynamicRegister,
  validateMqttDevice,
} from '../utils/mqtt';
import { getDeviceAccessOverviewItems, getDeviceAccessValidationError } from '../utils/deviceAccess';
import {
  buildRandomEventPayload,
  buildRandomPropertyBatchPayload,
  buildRandomPropertyPayload,
  parseThingModelText,
  type ThingModelRoot,
} from '../utils/thingModel';

const { Text, Title } = Typography;

const PROTOCOL_COLORS: Record<string, string> = {
  HTTP: 'blue',
  MQTT: 'green',
  CoAP: 'orange',
  Video: 'purple',
  SNMP: 'cyan',
  Modbus: 'geekblue',
  WebSocket: 'volcano',
  TCP: 'magenta',
  UDP: 'lime',
  LoRaWAN: 'gold',
};

const STATUS_TEXT = {
  offline: 'Offline',
  connecting: 'Connecting',
  online: 'Online',
  error: 'Error',
} as const;

const ALL_PROPERTIES_VALUE = '__all_properties__';
const HEARTBEAT_INTERVAL_OPTIONS = [15, 30, 60, 120, 300].map((value) => ({
  label: `${value} sec`,
  value,
}));
const LIFECYCLE_EVENT_LABELS: Record<'online' | 'offline' | 'heartbeat', string> = {
  online: 'Online',
  offline: 'Offline',
  heartbeat: 'Heartbeat',
};

function maskSecret(value?: string | null): string {
  const text = (value ?? '').trim();
  if (!text) return '未配置';
  if (text.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
}

function supportsThingModelReport(protocol?: string): boolean {
  return protocol === 'HTTP' || protocol === 'CoAP' || protocol === 'MQTT';
}

function resolveThingModelBaseUrl(device: SimDevice): string {
  if (device.protocol === 'HTTP') return (device.httpBaseUrl || '').trim();
  if (device.protocol === 'CoAP') return (device.coapBaseUrl || '').trim();
  if (device.protocol === 'MQTT') return (device.mqttRegisterBaseUrl || '').trim();
  return '';
}

function buildLifecycleEventPayload(device: SimDevice, identifier: 'online' | 'offline' | 'heartbeat'): Record<string, unknown> {
  return {
    identifier,
    eventType: identifier,
    eventName: LIFECYCLE_EVENT_LABELS[identifier],
    timestamp: Date.now(),
    occurredAt: new Date().toISOString(),
    protocol: device.protocol,
    productKey: device.productKey,
    deviceName: device.deviceName,
    ip: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 253) + 2}`,
  };
}

export default function DeviceControlPanel() {
  const { devices, selectedDeviceId, updateDevice, addLog } = useSimStore();
  const device = devices.find((item) => item.id === selectedDeviceId);

  const [sending, setSending] = useState(false);
  const [selectedModelIdentifier, setSelectedModelIdentifier] = useState('');
  const [payloadMode, setPayloadMode] = useState<'model' | 'custom'>('model');
  const [customPayload, setCustomPayload] = useState('{\n  "temperature": 25.5,\n  "humidity": 60\n}');
  const [reportType, setReportType] = useState<'property' | 'event' | 'ota'>('property');
  const [mqttTopic, setMqttTopic] = useState('');
  const [modelPreviewNonce, setModelPreviewNonce] = useState(0);
  const [thingModelLoading, setThingModelLoading] = useState(false);
  const [thingModelError, setThingModelError] = useState('');
  const [thingModelRoot, setThingModelRoot] = useState<ThingModelRoot | null>(null);
  const [sipMessages, setSipMessages] = useState<SipMsg[]>([]);
  const [httpHistory, setHttpHistory] = useState<HttpHistoryEntry[]>([]);
  const [coapShadowPolling, setCoapShadowPolling] = useState(false);
  const [coapShadowData, setCoapShadowData] = useState('');
  const [mqttQos, setMqttQos] = useState<0 | 1 | 2>(1);
  const [mqttRetain, setMqttRetain] = useState(false);
  const [mqttSubs, setMqttSubs] = useState<Array<{ topic: string; qos: number }>>([]);
  const [mqttMessages, setMqttMessages] = useState<MqttMsg[]>([]);
  const [wsMessages, setWsMessages] = useState<WsMsg[]>([]);
  const [tcpMessages, setTcpMessages] = useState<TcpUdpMsg[]>([]);
  const [loraMessages, setLoraMessages] = useState<LoRaMsg[]>([]);

  const autoTimerRef = useRef<number | null>(null);
  const coapPollRef = useRef<number | null>(null);

  function stopAutoReportForDevice(deviceId: string, options?: { silent?: boolean; reason?: string }) {
    const current = useSimStore.getState().devices.find((item) => item.id === deviceId);
    if (!current || !current.autoReport) {
      if (selectedDeviceId === deviceId) {
        autoTimerRef.current = null;
      }
      return;
    }

    if (selectedDeviceId === deviceId && autoTimerRef.current) {
      clearInterval(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    if (current.autoTimerId) {
      clearInterval(current.autoTimerId);
    }

    updateDevice(deviceId, { autoReport: false, autoTimerId: null });
    if (!options?.silent) {
      addLog(deviceId, current.name, 'info', options?.reason || 'Auto report stopped');
    }
  }

  function stopHeartbeatForDevice(deviceId: string, options?: { silent?: boolean; reason?: string }) {
    const current = useSimStore.getState().devices.find((item) => item.id === deviceId);
    if (!current || !current.heartbeatTimerId) {
      return;
    }

    clearInterval(current.heartbeatTimerId);
    updateDevice(deviceId, { heartbeatTimerId: null });
    if (!options?.silent) {
      addLog(deviceId, current.name, 'info', options?.reason || 'Heartbeat stopped');
    }
  }

  useEffect(() => {
    if (!device || device.protocol !== 'MQTT') {
      setMqttTopic('');
      return;
    }
    setMqttTopic(buildMqttPublishTopic(device, reportType === 'event' ? 'event' : 'property'));
  }, [selectedDeviceId, device?.protocol, device?.productKey, device?.deviceName, reportType]);

  useEffect(() => {
    if (!device || !supportsThingModelReport(device.protocol)) {
      setThingModelRoot(null);
      setThingModelError('');
      setThingModelLoading(false);
      return;
    }

    const productKey = (device.productKey || '').trim();
    const baseUrl = resolveThingModelBaseUrl(device);
    if (!productKey || !baseUrl) {
      setThingModelRoot(null);
      setThingModelError(productKey ? '产品物模型服务地址未配置' : '请先配置 ProductKey');
      setThingModelLoading(false);
      return;
    }

    let cancelled = false;
    setThingModelLoading(true);
    setThingModelError('');

    void window.electronAPI.productGetThingModel(baseUrl, productKey)
      .then((result) => {
        if (cancelled) return;
        if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
          setThingModelRoot(null);
          setThingModelError(result?.message || result?.msg || '加载产品物模型失败');
          return;
        }
        setThingModelRoot(parseThingModelText(typeof result.data === 'string' ? result.data : '{}'));
      })
      .catch((error: any) => {
        if (!cancelled) {
          setThingModelRoot(null);
          setThingModelError(error?.message || '加载产品物模型失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setThingModelLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedDeviceId,
    device?.protocol,
    device?.productKey,
    device?.httpBaseUrl,
    device?.coapBaseUrl,
    device?.mqttRegisterBaseUrl,
  ]);

  const availableModelItems = useMemo(
    () => {
      if (!thingModelRoot) return [];
      if (reportType === 'property') return thingModelRoot.properties.filter((item) => Boolean(item.identifier));
      if (reportType === 'event') return thingModelRoot.events.filter((item) => Boolean(item.identifier));
      return [];
    },
    [thingModelRoot, reportType],
  );

  const activeModelItem = useMemo(
    () => availableModelItems.find((item) => item.identifier === selectedModelIdentifier) || null,
    [availableModelItems, selectedModelIdentifier],
  );

  const modelPreview = useMemo(() => {
    if (payloadMode !== 'model' || reportType === 'ota') return '';
    if (reportType === 'property') {
      const payload = selectedModelIdentifier === ALL_PROPERTIES_VALUE
        ? buildRandomPropertyBatchPayload(availableModelItems)
        : activeModelItem
          ? buildRandomPropertyPayload(activeModelItem)
          : null;
      return payload ? JSON.stringify(payload, null, 2) : '';
    }
    if (reportType === 'event' && activeModelItem) {
      return JSON.stringify(buildRandomEventPayload(activeModelItem), null, 2);
    }
    return '';
  }, [activeModelItem, availableModelItems, modelPreviewNonce, payloadMode, reportType, selectedModelIdentifier]);

  useEffect(() => {
    if (payloadMode !== 'model' || reportType === 'ota' || thingModelLoading) return;
    if (reportType === 'property') {
      if (selectedModelIdentifier === ALL_PROPERTIES_VALUE) return;
      if (activeModelItem) return;
      if (availableModelItems.length > 0) {
        setSelectedModelIdentifier(ALL_PROPERTIES_VALUE);
        return;
      }
    } else if (activeModelItem) {
      return;
    }
    if (availableModelItems.length > 0) {
      setSelectedModelIdentifier(availableModelItems[0].identifier as string);
      return;
    }
    setPayloadMode('custom');
    setSelectedModelIdentifier('');
  }, [payloadMode, reportType, thingModelLoading, activeModelItem, availableModelItems, selectedModelIdentifier]);

  useEffect(() => {
    if (thingModelLoading) return;
    if ((reportType === 'ota' || availableModelItems.length === 0) && payloadMode === 'model') {
      setPayloadMode('custom');
      return;
    }
    if (reportType !== 'ota' && availableModelItems.length > 0 && payloadMode === 'custom' && !customPayload.trim()) {
      setPayloadMode('model');
    }
  }, [availableModelItems, customPayload, payloadMode, reportType, thingModelLoading]);

  useEffect(() => () => {
    if (autoTimerRef.current) clearInterval(autoTimerRef.current);
    if (coapPollRef.current) clearInterval(coapPollRef.current);
  }, []);

  useEffect(() => {
    if (coapPollRef.current) {
      clearInterval(coapPollRef.current);
      coapPollRef.current = null;
    }
    setCoapShadowPolling(false);
    setCoapShadowData('');
    setHttpHistory([]);
    setMqttMessages([]);
    setMqttSubs([]);
    setWsMessages([]);
    setTcpMessages([]);
    setLoraMessages([]);
    setSipMessages([]);
    setSelectedModelIdentifier('');
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsubMsg = window.electronAPI.onMqttMessage((id, topic, payload) => {
      if (id === selectedDeviceId) {
        setMqttMessages((prev) => [...prev.slice(-199), { dir: 'sub', topic, payload, qos: 0, ts: Date.now() }]);
      }
    });
    const unsubDc = window.electronAPI.onMqttDisconnected((id) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      stopAutoReportForDevice(id, { reason: 'Auto report stopped because device disconnected' });
      stopHeartbeatForDevice(id, { silent: true });
      useSimStore.getState().updateDevice(id, { status: 'offline' });
      useSimStore.getState().addLog(id, current.name, 'info', 'MQTT disconnected');
    });
    const unsubErr = window.electronAPI.onMqttError((id, errorText) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      useSimStore.getState().updateDevice(id, { status: 'error' });
      useSimStore.getState().addLog(id, current.name, 'error', `MQTT error: ${errorText}`);
    });
    return () => { unsubMsg(); unsubDc(); unsubErr(); };
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsubMsg = window.electronAPI.onWsMessage((id, payload) => {
      if (id === selectedDeviceId) {
        setWsMessages((prev) => [...prev.slice(-199), { dir: 'rx', payload, ts: Date.now() }]);
      }
    });
    const unsubDc = window.electronAPI.onWsDisconnected((id, code, reason) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      stopAutoReportForDevice(id, { reason: 'Auto report stopped because device disconnected' });
      useSimStore.getState().updateDevice(id, { status: 'offline' });
      useSimStore.getState().addLog(id, current.name, 'info', `WebSocket disconnected (${code}${reason ? `, ${reason}` : ''})`);
    });
    const unsubErr = window.electronAPI.onWsError((id, errorText) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      useSimStore.getState().addLog(id, current.name, 'error', `WebSocket error: ${errorText}`);
    });
    return () => { unsubMsg(); unsubDc(); unsubErr(); };
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsubMsg = window.electronAPI.onTcpMessage((id, payload) => {
      if (id === selectedDeviceId) {
        setTcpMessages((prev) => [...prev.slice(-199), { dir: 'rx', payload, ts: Date.now() }]);
      }
    });
    const unsubDc = window.electronAPI.onTcpDisconnected((id) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      stopAutoReportForDevice(id, { reason: 'Auto report stopped because device disconnected' });
      useSimStore.getState().updateDevice(id, { status: 'offline' });
      useSimStore.getState().addLog(id, current.name, 'info', 'TCP disconnected');
    });
    const unsubErr = window.electronAPI.onTcpError((id, errorText) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      useSimStore.getState().addLog(id, current.name, 'error', `TCP error: ${errorText}`);
    });
    return () => { unsubMsg(); unsubDc(); unsubErr(); };
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsub = window.electronAPI.onSipEvent((id, event) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      const store = useSimStore.getState();
      switch (event.type) {
        case 'registered':
          store.updateDevice(id, { sipRegistered: true });
          store.addLog(id, current.name, 'success', `SIP registered (${event.expires}s)`);
          break;
        case 'unregistered':
          store.updateDevice(id, { sipRegistered: false });
          store.addLog(id, current.name, 'info', 'SIP unregistered');
          break;
        case 'keepalive_sent':
          store.addLog(id, current.name, 'info', `SIP keepalive sent (${event.sn})`);
          break;
        case 'catalog_response_sent':
          store.addLog(id, current.name, 'success', `Catalog response sent (${event.channelCount})`);
          break;
        case 'device_info_response_sent':
          store.addLog(id, current.name, 'success', 'Device info response sent');
          break;
        case 'invite_accepted':
          store.addLog(id, current.name, 'success', `INVITE accepted (${event.channelId})`);
          break;
        case 'bye_accepted':
          store.addLog(id, current.name, 'info', 'BYE accepted');
          break;
        case 'auth_challenge':
          store.addLog(id, current.name, 'info', `Auth challenge (${event.realm})`);
          break;
        case 'ptz_received':
          store.addLog(id, current.name, 'info', `PTZ received: ${event.command}`);
          break;
        case 'error':
          store.addLog(id, current.name, 'error', `SIP error: ${event.message}`);
          break;
        case 'sip_rx':
          setSipMessages((prev) => [...prev.slice(-99), { dir: 'rx', method: event.method, raw: event.raw, ts: Date.now() }]);
          break;
        case 'sip_tx':
          setSipMessages((prev) => [...prev.slice(-99), { dir: 'tx', method: event.method, raw: event.raw, ts: Date.now() }]);
          break;
        default:
          break;
      }
    });
    return unsub;
  }, []);

  if (!device) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 32,
        }}
      >
        <Card
          style={{
            width: 'min(560px, 100%)',
            borderRadius: 28,
            border: '1px solid rgba(148,163,184,0.14)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.82) 0%, rgba(8,15,29,0.96) 100%)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.20)',
          }}
          styles={{ body: { padding: 28 } }}
        >
          <Space direction="vertical" size={18} style={{ width: '100%', textAlign: 'center' }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 24,
                margin: '0 auto',
                background: 'linear-gradient(135deg, rgba(59,130,246,0.28), rgba(245,158,11,0.18))',
                border: '1px solid rgba(147,197,253,0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#bfdbfe',
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              IoT
            </div>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Title level={3} style={{ margin: 0, color: '#f8fafc', fontFamily: 'Georgia, Times New Roman, serif' }}>
                选择一台模拟设备开始控制
              </Title>
              <Text type="secondary" style={{ fontSize: 14 }}>
                左侧设备管理器支持创建、筛选、复制和批量连接设备。选中设备后，这里会展示接入信息、发送面板和协议专属控制区。
              </Text>
            </Space>
            <Empty description="当前还没有选中设备" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </Space>
        </Card>
      </div>
    );
  }

  const isOnline = device.status === 'online';
  const showGenericReport = device.protocol === 'HTTP' || device.protocol === 'CoAP' || device.protocol === 'MQTT';
  const mqttIdentity = device.protocol === 'MQTT' ? resolveMqttIdentity(device) : null;
  const accessError = getDeviceAccessValidationError(device);
  const accessItems = getDeviceAccessOverviewItems(device);

  const publishPayload = async (
    target: SimDevice,
    type: 'property' | 'event' | 'ota',
    payload: Record<string, unknown>,
    options?: { trackHttpHistory?: boolean; preferSelectedMqttTopic?: boolean },
  ) => {
    if (target.protocol === 'HTTP') {
      if (type === 'ota') {
        return { success: false, message: 'HTTP has no generic ota channel' };
      }
      const url = `${target.httpBaseUrl}/api/v1/protocol/http/${type === 'property' ? 'property/post' : 'event/post'}`;
      const result = type === 'property'
        ? await window.electronAPI.httpReportProperty(target.httpBaseUrl, target.token, payload)
        : await window.electronAPI.httpReportEvent(target.httpBaseUrl, target.token, payload);
      if (options?.trackHttpHistory && target.id === selectedDeviceId) {
        setHttpHistory((prev) => [...prev.slice(-99), {
          method: 'POST',
          url,
          reqBody: JSON.stringify(payload, null, 2),
          status: result._status || 0,
          resBody: JSON.stringify(result, null, 2),
          resHeaders: result._headers || {},
          elapsed: result._elapsed || 0,
          ts: Date.now(),
        }]);
      }
      return result;
    }

    if (target.protocol === 'CoAP') {
      if (type === 'property') {
        return window.electronAPI.coapReportProperty(target.coapBaseUrl, target.token, payload);
      }
      if (type === 'event') {
        return window.electronAPI.coapReportEvent(target.coapBaseUrl, target.token, payload);
      }
      return window.electronAPI.coapReportOtaProgress(target.coapBaseUrl, target.token, payload);
    }

    if (target.protocol === 'MQTT') {
      if (type === 'ota') {
        return { success: false, message: 'MQTT has no generic ota channel' };
      }
      const topic = options?.preferSelectedMqttTopic && target.id === selectedDeviceId && mqttTopic
        ? mqttTopic
        : buildMqttPublishTopic(target, type === 'event' ? 'event' : 'property');
      const payloadText = JSON.stringify(payload);
      const result = await window.electronAPI.mqttPublish(target.id, topic, payloadText, mqttQos, mqttRetain);
      if (result.success && target.id === selectedDeviceId) {
        setMqttMessages((prev) => [...prev.slice(-199), { dir: 'pub', topic, payload: payloadText, qos: mqttQos, ts: Date.now() }]);
      }
      return result;
    }

    return { success: false, message: `${target.protocol} has no generic ${type} channel` };
  };

  const sendLifecycleEvent = async (
    target: SimDevice,
    identifier: 'online' | 'offline' | 'heartbeat',
    options?: { silentSuccess?: boolean; silentFailure?: boolean },
  ) => {
    if (!supportsThingModelReport(target.protocol)) {
      return { success: false, skipped: true };
    }

    const payload = buildLifecycleEventPayload(target, identifier);
    const result = await publishPayload(target, 'event', payload, { trackHttpHistory: target.id === selectedDeviceId });
    if (identifier === 'heartbeat' && target.protocol === 'HTTP' && target.token) {
      const heartbeatResult = await window.electronAPI.httpHeartbeat(target.httpBaseUrl, target.token);
      if (!heartbeatResult?.success || (typeof heartbeatResult.code === 'number' && heartbeatResult.code !== 0)) {
        if (!options?.silentFailure) {
          addLog(target.id, target.name, 'warn', `Heartbeat presence refresh failed: ${heartbeatResult?.message || heartbeatResult?.msg || 'unknown error'}`);
        }
        return heartbeatResult;
      }
    }

    if (result.success) {
      if (!options?.silentSuccess) {
        addLog(target.id, target.name, 'info', `${LIFECYCLE_EVENT_LABELS[identifier]} event sent`);
      }
    } else if (!options?.silentFailure) {
      addLog(target.id, target.name, 'warn', `${LIFECYCLE_EVENT_LABELS[identifier]} event failed: ${result.message || JSON.stringify(result)}`);
    }
    return result;
  };

  const sendHeartbeatByDeviceId = async (deviceId: string) => {
    const latest = useSimStore.getState().devices.find((item) => item.id === deviceId);
    if (!latest || latest.status !== 'online') {
      stopHeartbeatForDevice(deviceId, { silent: true });
      return;
    }
    try {
      await sendLifecycleEvent(latest, 'heartbeat', { silentSuccess: true });
    } catch (error: any) {
      addLog(latest.id, latest.name, 'warn', `Heartbeat event failed: ${error?.message || 'unknown error'}`);
    }
  };

  const startHeartbeatForDevice = (target: SimDevice, options?: { silent?: boolean }) => {
    if (!supportsThingModelReport(target.protocol)) {
      return;
    }
    stopHeartbeatForDevice(target.id, { silent: true });
    const intervalSeconds = target.heartbeatIntervalSec || 30;
    const timerId = window.setInterval(() => { void sendHeartbeatByDeviceId(target.id); }, intervalSeconds * 1000);
    updateDevice(target.id, { heartbeatTimerId: timerId });
    if (!options?.silent) {
      addLog(target.id, target.name, 'info', `Heartbeat started (${intervalSeconds}s)`);
    }
  };

  const connectMqtt = async () => {
    const validationError = validateMqttDevice(device);
    if (validationError) throw new Error(validationError);

    let target = device;
    if (shouldDynamicRegister(device)) {
      const registerResult = await dynamicRegisterDevice(device, device.mqttRegisterBaseUrl);
      target = { ...device, deviceSecret: registerResult.deviceSecret };
      updateDevice(device.id, { deviceSecret: registerResult.deviceSecret, dynamicRegistered: true });
      addLog(device.id, device.name, 'success', `Dynamic registration succeeded: ${registerResult.deviceName}`);
    }

    const identity = resolveMqttIdentity(target);
    const mqttOpts: any = { clean: target.mqttClean, keepalive: target.mqttKeepalive || 60 };
    if (target.mqttWillTopic) {
      mqttOpts.willTopic = target.mqttWillTopic;
      mqttOpts.willPayload = target.mqttWillPayload || '';
      mqttOpts.willQos = target.mqttWillQos ?? 1;
      mqttOpts.willRetain = target.mqttWillRetain ?? false;
    }

    const result = await window.electronAPI.mqttConnect(
      target.id,
      target.mqttBrokerUrl,
      identity.clientId,
      identity.username,
      identity.password,
      mqttOpts,
    );
    if (!result.success) throw new Error(result.message || 'MQTT connect failed');

    const serviceTopic = buildMqttServiceTopic(target);
    if (serviceTopic) {
      const subResult = await window.electronAPI.mqttSubscribe(target.id, serviceTopic, 1);
      if (subResult.success) {
        setMqttSubs((prev) => prev.some((item) => item.topic === serviceTopic) ? prev : [...prev, { topic: serviceTopic, qos: 1 }]);
      } else {
        addLog(target.id, target.name, 'warn', `Subscribe failed: ${subResult.message}`);
      }
    }
    updateDevice(target.id, { status: 'online', restoreOnLaunch: true });
    addLog(target.id, target.name, 'success', `MQTT connected: ${target.mqttBrokerUrl}`);
    await sendLifecycleEvent(target, 'online', { silentFailure: true });
    startHeartbeatForDevice(target);
  };

  const handleConnect = async () => {
    if (accessError) {
      updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
      addLog(device.id, device.name, 'warn', accessError);
      message.warning(accessError);
      return;
    }

    updateDevice(device.id, { status: 'connecting' });
    addLog(device.id, device.name, 'info', 'Connecting...');

    try {
      if (device.protocol === 'HTTP') {
        const authUrl = `${device.httpBaseUrl}/api/v1/protocol/http/auth`;
        let target = device;
        if (shouldDynamicRegister(device)) {
          const registerResult = await dynamicRegisterDevice(device, device.httpRegisterBaseUrl);
          target = { ...device, deviceSecret: registerResult.deviceSecret };
          updateDevice(device.id, { deviceSecret: registerResult.deviceSecret, dynamicRegistered: true });
          addLog(device.id, device.name, 'success', `HTTP 动态注册成功：${registerResult.deviceName}`);
        }
        const result = await window.electronAPI.httpAuth(target.httpBaseUrl, target.productKey, target.deviceName, target.deviceSecret);
        setHttpHistory((prev) => [...prev.slice(-99), {
          method: 'POST',
          url: authUrl,
          reqBody: JSON.stringify({
            productKey: target.productKey || '',
            deviceName: target.deviceName || '',
            deviceSecret: maskSecret(target.deviceSecret),
          }, null, 2),
          status: result._status || 0,
          resBody: JSON.stringify(result, null, 2),
          resHeaders: result._headers || {},
          elapsed: result._elapsed || 0,
          ts: Date.now(),
        }]);
        if (result.success && result.data?.token) {
          const targetOnline = { ...target, status: 'online' as const, token: result.data.token };
          updateDevice(device.id, { status: 'online', token: result.data.token, restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `HTTP auth succeeded: ${result.data.token.slice(0, 20)}...`);
          await sendLifecycleEvent(targetOnline, 'online', { silentFailure: true });
          startHeartbeatForDevice(targetOnline);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `HTTP auth failed: ${result.message || result.msg || JSON.stringify(result)}`);
        }
        return;
      }

      if (device.protocol === 'CoAP') {
        const result = await window.electronAPI.coapAuth(device.coapBaseUrl, {
          productKey: device.productKey,
          deviceName: device.deviceName,
          deviceSecret: device.deviceSecret,
        });
        if (result.success && result.data?.token) {
          const targetOnline = { ...device, status: 'online' as const, token: result.data.token };
          updateDevice(device.id, { status: 'online', token: result.data.token, restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `CoAP auth succeeded: ${result.data.token.slice(0, 20)}...`);
          await sendLifecycleEvent(targetOnline, 'online', { silentFailure: true });
          startHeartbeatForDevice(targetOnline);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `CoAP auth failed: ${result.message || result.msg || JSON.stringify(result)}`);
        }
        return;
      }

      if (device.protocol === 'SNMP') {
        const result = await window.electronAPI.snmpTest(device.snmpConnectorUrl, {
          host: device.snmpHost, port: device.snmpPort, version: device.snmpVersion, community: device.snmpCommunity,
        });
        updateDevice(device.id, {
          status: result.success && result.data?.data === true ? 'online' : 'error',
          restoreOnLaunch: result.success && result.data?.data === true,
        });
        addLog(device.id, device.name, result.success && result.data?.data === true ? 'success' : 'error', result.success && result.data?.data === true ? `SNMP ready: ${device.snmpHost}:${device.snmpPort}` : `SNMP failed: ${result.data?.message || result.message || 'target unavailable'}`);
        return;
      }

      if (device.protocol === 'Modbus') {
        const result = await window.electronAPI.modbusTest(device.modbusConnectorUrl, {
          host: device.modbusHost, port: device.modbusPort, slaveId: device.modbusSlaveId, mode: device.modbusMode,
        });
        updateDevice(device.id, {
          status: result.success && result.data?.data === true ? 'online' : 'error',
          restoreOnLaunch: result.success && result.data?.data === true,
        });
        addLog(device.id, device.name, result.success && result.data?.data === true ? 'success' : 'error', result.success && result.data?.data === true ? `Modbus ready: ${device.modbusHost}:${device.modbusPort}` : `Modbus failed: ${result.data?.message || result.message || 'target unavailable'}`);
        return;
      }

      if (device.protocol === 'WebSocket') {
        const result = await window.electronAPI.wsConnect(device.id, device.wsEndpoint, {
          deviceId: device.wsDeviceId, productId: device.wsProductId, tenantId: device.wsTenantId, deviceName: device.name,
        });
        if (result.success) {
          updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `WebSocket connected: ${device.wsEndpoint}`);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `WebSocket failed: ${result.message}`);
        }
        return;
      }

      if (device.protocol === 'TCP') {
        const result = await window.electronAPI.tcpConnect(device.id, device.tcpHost, device.tcpPort);
        if (result.success) {
          updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `TCP connected: ${device.tcpHost}:${device.tcpPort}`);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `TCP failed: ${result.message}`);
        }
        return;
      }

      if (device.protocol === 'UDP') {
        updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        addLog(device.id, device.name, 'success', `UDP ready: ${device.udpHost}:${device.udpPort}`);
        return;
      }

      if (device.protocol === 'LoRaWAN') {
        updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        addLog(device.id, device.name, 'success', `LoRaWAN ready: ${device.loraDevEui}`);
        return;
      }

      if (device.protocol === 'Video') {
        const dto: any = { name: device.name, streamMode: device.streamMode };
        if (device.streamMode === 'GB28181') {
          dto.gbDeviceId = device.gbDeviceId;
          dto.gbDomain = device.gbDomain;
          dto.transport = 'UDP';
        } else {
          dto.ip = '127.0.0.1';
        }
        const result = await window.electronAPI.videoCreateDevice(device.mediaBaseUrl, dto);
        if (result.success && result.data?.data?.id) {
          updateDevice(device.id, { status: 'online', videoDeviceId: result.data.data.id, restoreOnLaunch: false });
          addLog(device.id, device.name, 'success', `Video device created: ${result.data.data.id}`);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `Video failed: ${result.data?.msg || result.message || JSON.stringify(result.data)}`);
        }
        return;
      }

      await connectMqtt();
    } catch (error: any) {
      updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
      addLog(device.id, device.name, 'error', `Connect error: ${error?.message || 'unknown error'}`);
      message.error(`Connect failed: ${error?.message || 'unknown error'}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      stopAutoReportForDevice(device.id, { silent: true });
      stopHeartbeatForDevice(device.id, { silent: true });
      if (device.status === 'online' && supportsThingModelReport(device.protocol)) {
        await sendLifecycleEvent(device, 'offline', { silentFailure: true });
      }
      if (device.protocol === 'MQTT') await window.electronAPI.mqttDisconnect(device.id);
      if (device.protocol === 'WebSocket') await window.electronAPI.wsDisconnect(device.id);
      if (device.protocol === 'TCP') await window.electronAPI.tcpDisconnect(device.id);
      if (device.protocol === 'Video' && device.streamMode === 'GB28181') await window.electronAPI.sipStop(device.id);
      updateDevice(device.id, { status: 'offline', token: '', videoDeviceId: null, streamUrl: '', sipRegistered: false, restoreOnLaunch: false, heartbeatTimerId: null });
      addLog(device.id, device.name, 'info', 'Disconnected');
    } catch (error: any) {
      updateDevice(device.id, { status: 'offline', restoreOnLaunch: false, heartbeatTimerId: null });
      addLog(device.id, device.name, 'warn', `Disconnect warning: ${error?.message || 'unknown error'}`);
    }
  };

  const getPayload = (): Record<string, any> | null => {
    if (payloadMode === 'model') {
      if (reportType === 'property') {
        if (selectedModelIdentifier === ALL_PROPERTIES_VALUE) {
          if (availableModelItems.length === 0) {
            message.warning('当前产品物模型还没有可模拟的属性');
            return null;
          }
          return buildRandomPropertyBatchPayload(availableModelItems);
        }
        if (!activeModelItem) {
          message.warning('请先选择要模拟的属性');
          return null;
        }
        return buildRandomPropertyPayload(activeModelItem);
      }
      if (reportType === 'event') {
        if (!activeModelItem) {
          message.warning('请先选择要模拟的事件');
          return null;
        }
        return buildRandomEventPayload(activeModelItem);
      }
      return null;
    }
    try {
      return JSON.parse(customPayload);
    } catch {
      message.error('Invalid JSON payload');
      return null;
    }
  };

  const sendData = async () => {
    const latestDevice = useSimStore.getState().devices.find((item) => item.id === device.id);
    if (!latestDevice || latestDevice.status !== 'online') {
      stopAutoReportForDevice(device.id, { reason: 'Auto report stopped because device is offline' });
      return;
    }

    const payload = getPayload();
    if (!payload) return;

    setSending(true);
    try {
      if (!supportsThingModelReport(latestDevice.protocol) && reportType !== 'ota') {
        message.info(`${latestDevice.protocol} has its own send panel`);
        return;
      }
      const result = await publishPayload(latestDevice, reportType, payload, {
        trackHttpHistory: true,
        preferSelectedMqttTopic: true,
      });

      const current = useSimStore.getState().devices.find((item) => item.id === device.id) || latestDevice;
      if (result.success) {
        updateDevice(device.id, { sentCount: current.sentCount + 1 });
        addLog(device.id, device.name, 'success', `[${reportType}] sent: ${JSON.stringify(payload).slice(0, 120)}`);
      } else {
        updateDevice(device.id, { errorCount: current.errorCount + 1 });
        addLog(device.id, device.name, 'error', `Send failed: ${result.message || JSON.stringify(result)}`);
      }
    } catch (error: any) {
      const current = useSimStore.getState().devices.find((item) => item.id === device.id) || device;
      updateDevice(device.id, { errorCount: current.errorCount + 1 });
      addLog(device.id, device.name, 'error', `Send error: ${error?.message || 'unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  const handleAutoToggle = (checked: boolean) => {
    if (checked) {
      const interval = (device.autoIntervalSec || 5) * 1000;
      const timerId = window.setInterval(() => { void sendData(); }, interval);
      autoTimerRef.current = timerId;
      updateDevice(device.id, { autoReport: true, autoTimerId: timerId });
      addLog(device.id, device.name, 'info', `Auto report started (${device.autoIntervalSec || 5}s)`);
      return;
    }
    stopAutoReportForDevice(device.id);
  };

  const handleHeartbeatIntervalChange = (value: number) => {
    updateDevice(device.id, { heartbeatIntervalSec: value });
    const latest = useSimStore.getState().devices.find((item) => item.id === device.id);
    if (latest?.status === 'online') {
      startHeartbeatForDevice({ ...latest, heartbeatIntervalSec: value }, { silent: true });
    }
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          padding: '18px 20px',
          borderRadius: 24,
          border: '1px solid rgba(148,163,184,0.14)',
          background: 'linear-gradient(135deg, rgba(30,41,59,0.88) 0%, rgba(8,15,29,0.96) 100%)',
          boxShadow: '0 12px 30px rgba(0,0,0,0.16)',
        }}
      >
        <Space>
          <Title level={4} style={{ margin: 0, color: '#f8fafc', fontFamily: 'Georgia, Times New Roman, serif' }}>{device.name}</Title>
          <Tag color={PROTOCOL_COLORS[device.protocol] || 'default'}>{device.protocol}</Tag>
          <Badge status={isOnline ? 'success' : device.status === 'connecting' ? 'processing' : device.status === 'error' ? 'error' : 'default'} text={STATUS_TEXT[device.status]} />
        </Space>
        {!isOnline ? (
          <Button type="primary" icon={<ApiOutlined />} onClick={handleConnect} loading={device.status === 'connecting'}>Connect</Button>
        ) : (
          <Button danger icon={<DisconnectOutlined />} onClick={handleDisconnect}>Disconnect</Button>
        )}
      </div>

      <Card
        size="small"
        style={{
          marginBottom: 18,
          borderRadius: 22,
          border: '1px solid rgba(148,163,184,0.12)',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(8,15,29,0.92) 100%)',
        }}
        title={<Space><ApiOutlined />接入概览</Space>}
        styles={{ header: { borderBottom: '1px solid rgba(148,163,184,0.08)' } }}
      >
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {accessItems.map((item) => (
              <div
                key={item.label}
                style={{
                  padding: '12px 14px',
                  borderRadius: 16,
                  border: `1px solid ${item.highlight ? 'rgba(99,102,241,0.32)' : 'rgba(148,163,184,0.12)'}`,
                  background: item.highlight
                    ? 'linear-gradient(135deg, rgba(79,70,229,0.20), rgba(15,23,42,0.88))'
                    : 'linear-gradient(180deg, rgba(15,23,42,0.64) 0%, rgba(8,15,29,0.92) 100%)',
                }}
              >
                <Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Text>
                <div style={{ marginTop: 6, color: '#f8fafc', fontSize: 13, wordBreak: 'break-all' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {device.protocol === 'MQTT' && mqttIdentity ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Client ID</Text>
                <div style={{ marginTop: 4, color: '#cbd5e1', wordBreak: 'break-all' }}>{mqttIdentity.clientId || '自动生成'}</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>Username</Text>
                <div style={{ marginTop: 4, color: '#cbd5e1', wordBreak: 'break-all' }}>{mqttIdentity.username || '自动生成'}</div>
              </div>
            </div>
          ) : null}

          {device.token ? (
            <Alert
              type="success"
              showIcon
              message="当前设备已获取认证令牌"
              description={`Token 片段：${device.token.slice(0, 30)}...`}
            />
          ) : null}

          {accessError ? (
            <Alert
              type="warning"
              showIcon
              message="接入参数还不完整"
              description={`${accessError}。请先补齐后再发起连接，避免服务端收到空认证参数。`}
            />
          ) : null}
        </Space>
      </Card>

      {showGenericReport && (
        <Card
          title={<Space><CloudUploadOutlined />Data Report</Space>}
          size="small"
          style={{
            marginBottom: 16,
            borderRadius: 22,
            border: '1px solid rgba(148,163,184,0.12)',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.70) 0%, rgba(8,15,29,0.92) 100%)',
          }}
          styles={{ header: { borderBottom: '1px solid rgba(148,163,184,0.08)' } }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <Space direction="vertical" size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>上报类型</Text>
                <Radio.Group value={reportType} onChange={(event) => setReportType(event.target.value)} size="small">
                  <Radio.Button value="property">Property</Radio.Button>
                  <Radio.Button value="event">Event</Radio.Button>
                  {device.protocol === 'CoAP' && <Radio.Button value="ota">OTA</Radio.Button>}
                </Radio.Group>
              </Space>
              <Space size={16} wrap>
                <Text type="secondary">Sent: <Text strong style={{ color: '#52c41a' }}>{device.sentCount}</Text></Text>
                <Text type="secondary">Errors: <Text strong style={{ color: '#ff4d4f' }}>{device.errorCount}</Text></Text>
              </Space>
            </div>

            {device.protocol === 'HTTP' ? (
              <Alert
                type="info"
                showIcon
                message="HTTP 认证与上报已拆开展示"
                description="先通过上方接入概览确认 ProductKey、DeviceName、DeviceSecret 是否齐全。连接成功后，再在这里发送属性或事件。"
              />
            ) : null}

            {device.protocol === 'MQTT' && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Topic</Text>
                <Input size="small" value={mqttTopic} onChange={(event) => setMqttTopic(event.target.value)} style={{ marginTop: 4 }} />
              </div>
            )}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>数据源</Text>
                <Radio.Group
                  size="small"
                  value={payloadMode}
                  onChange={(event) => setPayloadMode(event.target.value)}
                >
                  <Radio.Button value="model" disabled={reportType === 'ota' || availableModelItems.length === 0 || thingModelLoading}>物模型模拟</Radio.Button>
                  <Radio.Button value="custom">自定义 JSON</Radio.Button>
                </Radio.Group>
              </div>
            </div>

            {payloadMode === 'model' && reportType !== 'ota' && (
              <>
                {thingModelError ? (
                  <Alert
                    type="warning"
                    showIcon
                    message="物模型加载失败"
                    description={thingModelError}
                  />
                ) : null}

                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>物模型项</Text>
                  <Select
                    size="small"
                    placeholder={reportType === 'property' ? '选择要模拟的属性' : '选择要模拟的事件'}
                    value={selectedModelIdentifier || undefined}
                    onChange={(value) => setSelectedModelIdentifier(value)}
                    style={{ width: '100%', marginTop: 4 }}
                    loading={thingModelLoading}
                    options={[
                      ...(reportType === 'property'
                        ? [{ label: '全部属性', value: ALL_PROPERTIES_VALUE }]
                        : []),
                      ...availableModelItems.map((item) => ({
                        label: `${item.name || item.identifier} (${item.identifier})`,
                        value: item.identifier,
                      })),
                    ]}
                  />
                </div>

                {(selectedModelIdentifier === ALL_PROPERTIES_VALUE || activeModelItem) ? (
                  <>
                    <Alert
                      type="success"
                      showIcon
                      message="当前将按物模型生成随机数据"
                      description="每次点击发送或自动上报，都会根据当前物模型重新生成一份随机 payload。"
                    />

                    <div style={{ padding: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                        <Space size={6} wrap>
                          <Text style={{ fontSize: 12, color: '#f8fafc' }}>字段预览</Text>
                          {selectedModelIdentifier === ALL_PROPERTIES_VALUE
                            ? availableModelItems.map((item) => (
                              <Tag key={item.identifier} style={{ margin: 0 }}>{item.identifier}</Tag>
                            ))
                            : activeModelItem
                              ? [
                                <Tag key="identifier" style={{ margin: 0 }}>{activeModelItem.identifier}</Tag>,
                                ...(Array.isArray(activeModelItem.outputData)
                                  ? activeModelItem.outputData.map((field) => (
                                    <Tag key={String(field.identifier)} style={{ margin: 0 }}>{String(field.identifier)}</Tag>
                                  ))
                                  : []),
                              ]
                              : null}
                        </Space>
                        <Tooltip title="刷新一份新的随机样例">
                          <Button
                            size="small"
                            type="text"
                            icon={<ReloadOutlined />}
                            onClick={() => setModelPreviewNonce((value) => value + 1)}
                          >
                            换一组
                          </Button>
                        </Tooltip>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>随机样例预览</Text>
                      <Input.TextArea
                        rows={6}
                        value={modelPreview}
                        readOnly
                        style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 6 }}
                      />
                    </div>
                  </>
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message="当前上报类型没有可模拟项"
                    description="可以先切到自定义 JSON，或检查产品物模型里是否已配置对应属性或事件。"
                  />
                )}
              </>
            )}

            {payloadMode === 'custom' && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>Custom JSON</Text>
                <Input.TextArea rows={5} value={customPayload} onChange={(event) => setCustomPayload(event.target.value)} style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }} />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Button type="primary" icon={<SendOutlined />} onClick={sendData} loading={sending} disabled={!isOnline}>Send</Button>
              <Space size={8}>
                <Switch checked={device.autoReport} onChange={handleAutoToggle} disabled={!isOnline} checkedChildren={<PlayCircleOutlined />} unCheckedChildren={<PauseCircleOutlined />} />
                <Text style={{ fontSize: 12 }}>Auto report</Text>
                <InputNumber size="small" min={1} max={3600} value={device.autoIntervalSec} onChange={(value) => updateDevice(device.id, { autoIntervalSec: value || 5 })} disabled={device.autoReport} style={{ width: 90 }} addonAfter="sec" />
              </Space>
              {supportsThingModelReport(device.protocol) ? (
                <Space size={8}>
                  <Text style={{ fontSize: 12 }}>Heartbeat</Text>
                  <Select
                    size="small"
                    style={{ width: 108 }}
                    value={device.heartbeatIntervalSec || 30}
                    options={HEARTBEAT_INTERVAL_OPTIONS}
                    onChange={handleHeartbeatIntervalChange}
                    disabled={!isOnline}
                  />
                </Space>
              ) : null}
            </div>
          </Space>
        </Card>
      )}

      <HttpControlPanel device={device} httpHistory={httpHistory} setHttpHistory={setHttpHistory} />
      <MqttControlPanel device={device} mqttQos={mqttQos} setMqttQos={setMqttQos} mqttRetain={mqttRetain} setMqttRetain={setMqttRetain} mqttSubs={mqttSubs} setMqttSubs={setMqttSubs} mqttMessages={mqttMessages} setMqttMessages={setMqttMessages} />
      <CoapControlPanel device={device} coapShadowPolling={coapShadowPolling} setCoapShadowPolling={setCoapShadowPolling} coapShadowData={coapShadowData} setCoapShadowData={setCoapShadowData} coapPollRef={coapPollRef} />
      <SnmpControlPanel device={device} />
      <ModbusControlPanel device={device} />
      <WebSocketControlPanel device={device} wsMessages={wsMessages} setWsMessages={setWsMessages} />
      <TcpUdpControlPanel device={device} tcpMessages={tcpMessages} setTcpMessages={setTcpMessages} />
      <LoRaWanControlPanel device={device} loraMessages={loraMessages} setLoraMessages={setLoraMessages} />
      <VideoControlPanel device={device} />
      <SipControlPanel device={device} sipMessages={sipMessages} setSipMessages={setSipMessages} />
    </div>
  );
}
