import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  InputNumber,
  Row,
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
  getActiveEnvironment,
  isSimulatorAuthInvalid,
  useSimWorkspaceStore,
} from '../workspaceStore';
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
  buildDefaultMqttSubscriptions,
  buildMqttPublishTopic,
  dynamicRegisterDevice,
  resolveMqttIdentity,
  shouldDynamicRegister,
  shouldRetryDynamicRegisterAfterFailure,
  validateMqttDevice,
} from '../utils/mqtt';
import { getDeviceAccessOverviewItems, getDeviceAccessValidationError } from '../utils/deviceAccess';
import { buildLifecycleEventPayload, invokeHttpLifecycle } from '../utils/httpLifecycle';
import { buildTransportBindingPayload, buildWebSocketConnectParams } from '../utils/transportBinding';
import {
  buildRandomEventPayload,
  buildDefaultFixedValue,
  buildRandomPropertyBatchPayload,
  buildRandomPropertyPayload,
  describeThingModelItemFields,
  parseThingModelText,
  resolveThingModelEnumCandidates,
  resolveThingModelValueTypeLabel,
  type ThingModelFieldDescriptor,
  type ThingModelRoot,
  type ThingModelSimulationRule,
} from '../utils/thingModel';
import { connectSimDevice, disconnectSimDevice } from '../utils/runtime';

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
  offline: '离线',
  connecting: '连接中',
  online: '在线',
  error: '异常',
} as const;

const ALL_PROPERTIES_VALUE = '__all_properties__';
const HEARTBEAT_INTERVAL_OPTIONS = [15, 30, 60, 120, 300].map((value) => ({
  label: `${value} 秒`,
  value,
}));
const LIFECYCLE_EVENT_LABELS: Record<'online' | 'offline' | 'heartbeat', string> = {
  online: '上线',
  offline: '下线',
  heartbeat: '心跳',
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function supportsRangeRule(valueType: ThingModelFieldDescriptor['valueType']): boolean {
  return valueType === 'int' || valueType === 'float' || valueType === 'double' || valueType === 'date';
}

function supportsJsonFixedValue(valueType: ThingModelFieldDescriptor['valueType']): boolean {
  return valueType === 'array' || valueType === 'struct';
}

function supportsStringRandomConfig(valueType: ThingModelFieldDescriptor['valueType']): boolean {
  return valueType === 'string';
}

function supportsArrayRandomConfig(valueType: ThingModelFieldDescriptor['valueType']): boolean {
  return valueType === 'array';
}

function maskSecret(value?: string | null): string {
  const text = (value ?? '').trim();
  if (!text) return '未配置';
  if (text.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
}

function supportsThingModelSync(protocol?: string): boolean {
  return protocol === 'HTTP' || protocol === 'CoAP' || protocol === 'MQTT' || protocol === 'Video';
}

function supportsThingModelReport(protocol?: string): boolean {
  return protocol === 'HTTP' || protocol === 'CoAP' || protocol === 'MQTT';
}

function isVideoDevice(device?: SimDevice | null): boolean {
  return device?.protocol === 'Video';
}

function isGb28181VideoDevice(device?: SimDevice | null): boolean {
  return isVideoDevice(device) && device?.streamMode === 'GB28181';
}

function resolveVideoSyncMetric(device: SimDevice) {
  if (isGb28181VideoDevice(device)) {
    return {
      label: 'SIP 心跳',
      value: device.sipKeepaliveEnabled ? '已开启' : '未开启',
      color: device.sipKeepaliveEnabled ? '#15803d' : '#64748b',
      background: device.sipKeepaliveEnabled ? '#f0fdf4' : '#f8fafc',
    };
  }

  const synced = Boolean(device.platformDeviceId) && device.status === 'online';
  return {
    label: '平台同步',
    value: synced ? '已完成' : device.status === 'connecting' ? '同步中' : '待同步',
    color: synced ? '#15803d' : '#64748b',
    background: synced ? '#f0fdf4' : '#f8fafc',
  };
}

function resolveVideoConnectionMetric(device: SimDevice) {
  if (isGb28181VideoDevice(device)) {
    if (device.sipRegistered) {
      return {
        label: 'SIP 注册',
        value: '已注册',
        color: '#0f766e',
        background: '#ecfeff',
      };
    }
    return {
      label: 'SIP 注册',
      value: device.platformDeviceId ? '待注册' : device.status === 'connecting' ? '同步中' : '待连接',
      color: '#0f766e',
      background: '#ecfeff',
    };
  }

  const connected = Boolean(device.platformDeviceId) && device.status === 'online';
  return {
    label: '连接状态',
    value: connected ? '已连接' : device.status === 'connecting' ? '同步中' : '待连接',
    color: '#0f766e',
    background: '#ecfeff',
  };
}

export default function DeviceControlPanel() {
  const { devices, selectedDeviceId, updateDevice, addLog } = useSimStore();
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const clearWorkspaceSession = useSimWorkspaceStore((state) => state.clearSession);
  const device = devices.find((item) => item.id === selectedDeviceId);
  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  );
  const activeSession = sessions[activeEnvironment.id];

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
  const [ruleJsonDrafts, setRuleJsonDrafts] = useState<Record<string, string>>({});
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
  const [thingModelRefreshNonce, setThingModelRefreshNonce] = useState(0);

  const autoTimerRef = useRef<number | null>(null);
  const coapPollRef = useRef<number | null>(null);
  const loraPollRef = useRef<number | null>(null);
  const loraDownlinkCursorRef = useRef(0);

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
      addLog(deviceId, current.name, 'info', options?.reason || '已停止自动上报');
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
      addLog(deviceId, current.name, 'info', options?.reason || '已停止心跳上报');
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
    if (!device || !supportsThingModelSync(device.protocol)) {
      setThingModelRoot(null);
      setThingModelError('');
      setThingModelLoading(false);
      return;
    }

    const productKey = (device.productKey || '').trim();
    if (!productKey) {
      setThingModelRoot(null);
      setThingModelError('请先配置 ProductKey');
      setThingModelLoading(false);
      return;
    }
    if (!activeSession?.accessToken) {
      setThingModelRoot(null);
      setThingModelError('请先登录当前环境后再同步物模型');
      setThingModelLoading(false);
      return;
    }

    let cancelled = false;
    setThingModelLoading(true);
    setThingModelError('');

    // 物模型跟随当前环境登录态请求平台接口，不再维护设备级 AK/SK。
    void window.electronAPI.simulatorProductThingModel(
      activeEnvironment.gatewayBaseUrl,
      activeSession.accessToken,
      productKey,
      navigator.userAgent,
    )
      .then((result) => {
        if (cancelled) return;
        if (isSimulatorAuthInvalid(result)) {
          clearWorkspaceSession(activeEnvironment.id);
          setThingModelRoot(null);
          setThingModelError('当前环境登录已失效，请重新登录后再同步物模型');
          message.warning('当前环境登录已失效，请重新登录后再同步物模型');
          return;
        }
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
    activeEnvironment.gatewayBaseUrl,
    activeEnvironment.id,
    activeSession?.accessToken,
    clearWorkspaceSession,
    thingModelRefreshNonce,
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

  const thingModelRules = device?.thingModelSimulationRules || {};

  const activeRuleFields = useMemo(() => {
    if (payloadMode !== 'model' || reportType === 'ota') return [];
    if (reportType === 'property') {
      const items = selectedModelIdentifier === ALL_PROPERTIES_VALUE
        ? availableModelItems
        : activeModelItem
          ? [activeModelItem]
          : [];
      return items.flatMap((item) => describeThingModelItemFields(item, 'property'));
    }
    if (reportType === 'event' && activeModelItem) {
      return describeThingModelItemFields(activeModelItem, 'event');
    }
    return [];
  }, [activeModelItem, availableModelItems, payloadMode, reportType, selectedModelIdentifier]);

  const customizedRuleCount = useMemo(
    () => activeRuleFields.filter((field) => Boolean(thingModelRules[field.ruleKey])).length,
    [activeRuleFields, thingModelRules],
  );

  const modelPreview = useMemo(() => {
    if (payloadMode !== 'model' || reportType === 'ota') return '';
    if (reportType === 'property') {
      const payload = selectedModelIdentifier === ALL_PROPERTIES_VALUE
        ? buildRandomPropertyBatchPayload(availableModelItems, thingModelRules)
        : activeModelItem
          ? buildRandomPropertyPayload(activeModelItem, thingModelRules)
          : null;
      return payload ? JSON.stringify(payload, null, 2) : '';
    }
    if (reportType === 'event' && activeModelItem) {
      return JSON.stringify(buildRandomEventPayload(activeModelItem, thingModelRules), null, 2);
    }
    return '';
  }, [activeModelItem, availableModelItems, modelPreviewNonce, payloadMode, reportType, selectedModelIdentifier, thingModelRules]);

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
    if (loraPollRef.current) clearInterval(loraPollRef.current);
  }, []);

  useEffect(() => {
    if (coapPollRef.current) {
      clearInterval(coapPollRef.current);
      coapPollRef.current = null;
    }
    if (loraPollRef.current) {
      clearInterval(loraPollRef.current);
      loraPollRef.current = null;
    }
    loraDownlinkCursorRef.current = 0;
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
    setRuleJsonDrafts({});
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
      stopAutoReportForDevice(id, { reason: '设备断开，已停止自动上报' });
      stopHeartbeatForDevice(id, { silent: true });
      useSimStore.getState().updateDevice(id, { status: 'offline' });
      useSimStore.getState().addLog(id, current.name, 'info', 'MQTT 已断开连接');
    });
    const unsubErr = window.electronAPI.onMqttError((id, errorText) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      useSimStore.getState().updateDevice(id, { status: 'error' });
      useSimStore.getState().addLog(id, current.name, 'error', `MQTT 异常：${errorText}`);
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
      stopAutoReportForDevice(id, { reason: '设备断开，已停止自动上报' });
      useSimStore.getState().updateDevice(id, { status: 'offline' });
      useSimStore.getState().addLog(id, current.name, 'info', `WebSocket 已断开（${code}${reason ? `，${reason}` : ''}）`);
    });
    const unsubErr = window.electronAPI.onWsError((id, errorText) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      useSimStore.getState().addLog(id, current.name, 'error', `WebSocket 异常：${errorText}`);
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
      stopAutoReportForDevice(id, { reason: '设备断开，已停止自动上报' });
      useSimStore.getState().updateDevice(id, { status: 'offline' });
      useSimStore.getState().addLog(id, current.name, 'info', 'TCP 已断开连接');
    });
    const unsubErr = window.electronAPI.onTcpError((id, errorText) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      useSimStore.getState().addLog(id, current.name, 'error', `TCP 异常：${errorText}`);
    });
    return () => { unsubMsg(); unsubDc(); unsubErr(); };
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsubMsg = window.electronAPI.onUdpMessage((id, payload) => {
      if (id === selectedDeviceId) {
        setTcpMessages((prev) => [...prev.slice(-199), { dir: 'rx', payload, ts: Date.now() }]);
      }
    });
    const unsubDc = window.electronAPI.onUdpDisconnected((id) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      stopAutoReportForDevice(id, { reason: '设备断开，已停止自动上报' });
      useSimStore.getState().updateDevice(id, { status: 'offline' });
      useSimStore.getState().addLog(id, current.name, 'info', 'UDP 已断开连接');
    });
    const unsubErr = window.electronAPI.onUdpError((id, errorText) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      useSimStore.getState().addLog(id, current.name, 'error', `UDP 异常：${errorText}`);
    });
    return () => { unsubMsg(); unsubDc(); unsubErr(); };
  }, [selectedDeviceId]);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    if (!device || device.protocol !== 'LoRaWAN' || device.status !== 'online') {
      if (loraPollRef.current) {
        clearInterval(loraPollRef.current);
        loraPollRef.current = null;
      }
      return undefined;
    }

    let cancelled = false;
    const pollDownlinks = async () => {
      const current = useSimStore.getState().devices.find((item) => item.id === device.id);
      if (!current || current.protocol !== 'LoRaWAN' || current.status !== 'online') {
        return;
      }
      const result = await window.electronAPI.lorawanListDownlinks(
        current.loraWebhookUrl,
        current.loraDevEui,
        loraDownlinkCursorRef.current || undefined,
      );
      if (!result?.success || (typeof result.code === 'number' && result.code !== 0) || cancelled) {
        return;
      }
      const records = Array.isArray(result.data) ? result.data : [];
      if (records.length === 0) {
        return;
      }
      loraDownlinkCursorRef.current = records.reduce(
        (maxValue: number, item: any) => Math.max(maxValue, Number(item?.queuedAt) || 0),
        loraDownlinkCursorRef.current,
      );
      setLoraMessages((prev) => [
        ...prev.slice(Math.max(0, prev.length + records.length - 200)),
        ...records.map((item: any) => ({
          dir: 'rx' as const,
          payload: item?.displayPayload || item?.data || '',
          ts: Number(item?.queuedAt) || Date.now(),
        })),
      ]);
    };

    void pollDownlinks();
    loraPollRef.current = window.setInterval(() => {
      void pollDownlinks();
    }, 1500);

    return () => {
      cancelled = true;
      if (loraPollRef.current) {
        clearInterval(loraPollRef.current);
        loraPollRef.current = null;
      }
    };
  }, [selectedDeviceId, device?.id, device?.protocol, device?.status, device?.loraWebhookUrl, device?.loraDevEui]);

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    const unsub = window.electronAPI.onSipEvent((id, event) => {
      const current = useSimStore.getState().devices.find((item) => item.id === id);
      if (!current) return;
      const store = useSimStore.getState();
      switch (event.type) {
        case 'registered':
          store.updateDevice(id, { sipRegistered: true, sipKeepaliveEnabled: false });
          store.addLog(id, current.name, 'success', `SIP 注册成功（${event.expires}秒）`);
          break;
        case 'unregistered':
          store.updateDevice(id, { sipRegistered: false, sipKeepaliveEnabled: false });
          store.addLog(id, current.name, 'info', 'SIP 已注销');
          break;
        case 'keepalive_sent':
          store.updateDevice(id, { sipKeepaliveEnabled: true });
          store.addLog(id, current.name, 'info', `SIP 心跳已发送（${event.sn}）`);
          break;
        case 'catalog_response_sent':
          store.addLog(id, current.name, 'success', `已响应目录查询（${event.channelCount} 个通道）`);
          break;
        case 'device_info_response_sent':
          store.addLog(id, current.name, 'success', '已响应设备信息查询');
          break;
        case 'invite_accepted':
          store.addLog(id, current.name, 'success', `已接受 INVITE（${event.channelId} -> ${event.rtpIp}:${event.rtpPort}）`);
          break;
        case 'bye_accepted':
          store.addLog(id, current.name, 'info', '已接受 BYE');
          break;
        case 'auth_challenge':
          store.addLog(id, current.name, 'info', `收到鉴权挑战（${event.realm}）`);
          break;
        case 'ptz_received':
          store.addLog(id, current.name, 'info', `收到 PTZ 控制：${event.command}`);
          break;
        case 'error':
          store.addLog(id, current.name, 'error', `SIP 异常：${event.message}`);
          break;
        case 'local_media_retry':
          store.addLog(id, current.name, 'warn', `SIP 提示：${event.message}`);
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
            borderRadius: 32,
            border: '1px solid rgba(226,232,240,0.92)',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(243,248,255,0.95) 100%)',
            boxShadow: '0 20px 48px rgba(15,23,42,0.08)',
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
                background: 'linear-gradient(135deg, rgba(59,130,246,0.14), rgba(14,165,233,0.08))',
                border: '1px solid rgba(147,197,253,0.32)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              IoT
            </div>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Title
                level={3}
                style={{
                  margin: 0,
                  color: '#0f172a',
                  fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif',
                }}
              >
                选择一台模拟设备开始控制
              </Title>
              <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.8 }}>
                先从左侧选择设备，再在这里连接、上报和调试。
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
  const showThingModelSync = supportsThingModelSync(device.protocol);
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
        return { success: false, message: 'HTTP 不支持通用 OTA 通道' };
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
        return { success: false, message: 'MQTT 不支持通用 OTA 通道' };
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

    return { success: false, message: `${target.protocol} 暂不支持该通用上报通道` };
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
    let result: any;
    if (target.protocol === 'HTTP') {
      // HTTP lifecycle uses dedicated endpoints so online/offline semantics do not get
      // mixed back into the generic event reporting path.
      const lifecycle = await invokeHttpLifecycle(target, identifier, payload);
      result = lifecycle.result;
      if (target.id === selectedDeviceId) {
        setHttpHistory((prev) => [...prev.slice(-99), {
          method: 'POST',
          url: lifecycle.url,
          reqBody: JSON.stringify(lifecycle.payload, null, 2),
          status: result._status || 0,
          resBody: JSON.stringify(result, null, 2),
          resHeaders: result._headers || {},
          elapsed: result._elapsed || 0,
          ts: Date.now(),
        }]);
      }
    } else {
      result = await publishPayload(target, 'event', payload, { trackHttpHistory: target.id === selectedDeviceId });
    }

    const succeeded = result?.success && (typeof result.code !== 'number' || result.code === 0);
    if (succeeded) {
      if (!options?.silentSuccess) {
        addLog(target.id, target.name, 'info', `${LIFECYCLE_EVENT_LABELS[identifier]}事件已发送`);
      }
    } else if (!options?.silentFailure) {
      addLog(target.id, target.name, 'warn', `${LIFECYCLE_EVENT_LABELS[identifier]}事件发送失败：${result.message || JSON.stringify(result)}`);
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
      addLog(latest.id, latest.name, 'warn', `心跳事件发送失败：${error?.message || '未知错误'}`);
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
      addLog(target.id, target.name, 'info', `已开启心跳上报（${intervalSeconds}秒）`);
    }
  };

  const refreshDynamicRegistrationSecret = async (target: SimDevice) => {
    const registerBaseUrl = target.protocol === 'HTTP' ? target.httpRegisterBaseUrl : target.mqttRegisterBaseUrl;
    const registerResult = await dynamicRegisterDevice(target, registerBaseUrl);
    const refreshedTarget = {
      ...target,
      deviceSecret: registerResult.deviceSecret,
      dynamicRegistered: true,
    };
    updateDevice(target.id, {
      deviceSecret: registerResult.deviceSecret,
      dynamicRegistered: true,
    });
    addLog(target.id, target.name, 'info', '已通过动态注册刷新缓存的 DeviceSecret');
    return refreshedTarget;
  };

  const connectMqtt = async () => {
    const validationError = validateMqttDevice(device);
    if (validationError) throw new Error(validationError);

    let target = device;
    if (shouldDynamicRegister(device)) {
      const registerResult = await dynamicRegisterDevice(device, device.mqttRegisterBaseUrl);
      target = { ...device, deviceSecret: registerResult.deviceSecret };
      updateDevice(device.id, { deviceSecret: registerResult.deviceSecret, dynamicRegistered: true });
      addLog(device.id, device.name, 'success', `动态注册成功：${registerResult.deviceName}`);
    }

    let identity = resolveMqttIdentity(target);
    const mqttOpts: any = { clean: target.mqttClean, keepalive: target.mqttKeepalive || 60 };
    if (target.mqttWillTopic) {
      mqttOpts.willTopic = target.mqttWillTopic;
      mqttOpts.willPayload = target.mqttWillPayload || '';
      mqttOpts.willQos = target.mqttWillQos ?? 1;
      mqttOpts.willRetain = target.mqttWillRetain ?? false;
    }

    let result = await window.electronAPI.mqttConnect(
      target.id,
      target.mqttBrokerUrl,
      identity.clientId,
      identity.username,
      identity.password,
      mqttOpts,
    );
    if (!result.success && shouldRetryDynamicRegisterAfterFailure(target, result)) {
      addLog(target.id, target.name, 'warn', '缓存 DeviceSecret 连接 MQTT 失败，正在重试动态注册');
      try {
        target = await refreshDynamicRegistrationSecret(target);
        identity = resolveMqttIdentity(target);
        result = await window.electronAPI.mqttConnect(
          target.id,
          target.mqttBrokerUrl,
          identity.clientId,
          identity.username,
          identity.password,
          mqttOpts,
        );
      } catch (retryError: any) {
        addLog(target.id, target.name, 'warn', `动态注册重试失败：${retryError?.message || '未知错误'}`);
      }
    }
    if (!result.success) throw new Error(result.message || 'MQTT 连接失败');

    // Subscribe to every platform-managed downstream topic family so the simulator can
    // verify commands from the device message workbench without manual topic setup.
    for (const subscription of buildDefaultMqttSubscriptions(target)) {
      const subResult = await window.electronAPI.mqttSubscribe(target.id, subscription.topic, subscription.qos);
      if (subResult.success) {
        setMqttSubs((prev) => (
          prev.some((item) => item.topic === subscription.topic)
            ? prev
            : [...prev, { topic: subscription.topic, qos: subscription.qos }]
        ));
      } else {
        addLog(target.id, target.name, 'warn', `自动订阅${subscription.label}主题失败：${subResult.message}`);
      }
    }
    updateDevice(target.id, { status: 'online', restoreOnLaunch: true });
    addLog(target.id, target.name, 'success', `MQTT 已连接：${target.mqttBrokerUrl}`);
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
    addLog(device.id, device.name, 'info', '正在连接...');

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
        let result = await window.electronAPI.httpAuth(target.httpBaseUrl, target.productKey, target.deviceName, target.deviceSecret);
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
        if ((!result.success || !result.data?.token) && shouldRetryDynamicRegisterAfterFailure(target, result)) {
          addLog(device.id, device.name, 'warn', '缓存 DeviceSecret 的 HTTP 鉴权失败，正在重试动态注册');
          try {
            target = await refreshDynamicRegistrationSecret(target);
            result = await window.electronAPI.httpAuth(target.httpBaseUrl, target.productKey, target.deviceName, target.deviceSecret);
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
          } catch (retryError: any) {
            addLog(device.id, device.name, 'warn', `动态注册重试失败：${retryError?.message || '未知错误'}`);
          }
        }
        if (result.success && result.data?.token) {
          const targetOnline = { ...target, status: 'online' as const, token: result.data.token };
          updateDevice(device.id, { status: 'online', token: result.data.token, restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `HTTP 鉴权成功：${result.data.token.slice(0, 20)}...`);
          await sendLifecycleEvent(targetOnline, 'online', { silentFailure: true });
          startHeartbeatForDevice(targetOnline);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `HTTP 鉴权失败：${result.message || result.msg || JSON.stringify(result)}`);
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
          addLog(device.id, device.name, 'success', `CoAP 鉴权成功：${result.data.token.slice(0, 20)}...`);
          await sendLifecycleEvent(targetOnline, 'online', { silentFailure: true });
          startHeartbeatForDevice(targetOnline);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `CoAP 鉴权失败：${result.message || result.msg || JSON.stringify(result)}`);
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
        addLog(device.id, device.name, result.success && result.data?.data === true ? 'success' : 'error', result.success && result.data?.data === true ? `SNMP 已就绪：${device.snmpHost}:${device.snmpPort}` : `SNMP 连接失败：${result.data?.message || result.message || '目标不可达'}`);
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
        addLog(device.id, device.name, result.success && result.data?.data === true ? 'success' : 'error', result.success && result.data?.data === true ? `Modbus 已就绪：${device.modbusHost}:${device.modbusPort}` : `Modbus 连接失败：${result.data?.message || result.message || '目标不可达'}`);
        return;
      }

      if (device.protocol === 'WebSocket') {
        const result = await window.electronAPI.wsConnect(device.id, device.wsEndpoint, buildWebSocketConnectParams(device));
        if (result.success) {
          updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `WebSocket 已连接：${device.wsEndpoint}`);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `WebSocket 连接失败：${result.message}`);
        }
        return;
      }

      if (device.protocol === 'TCP') {
        const result = await window.electronAPI.tcpConnect(device.id, device.tcpHost, device.tcpPort);
        if (result.success) {
          const bindingResult = await window.electronAPI.tcpSend(device.id, buildTransportBindingPayload(device));
          if (!bindingResult.success) {
            await window.electronAPI.tcpDisconnect(device.id);
            updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
            addLog(device.id, device.name, 'error', `TCP 绑定失败：${bindingResult.message || '未知错误'}`);
            return;
          }
          updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `TCP 已连接：${device.tcpHost}:${device.tcpPort}`);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `TCP 连接失败：${result.message}`);
        }
        return;
      }

      if (device.protocol === 'UDP') {
        const result = await window.electronAPI.udpConnect(device.id, device.udpHost, device.udpPort);
        if (result.success) {
          const bindingResult = await window.electronAPI.udpSend(device.id, buildTransportBindingPayload(device));
          if (!bindingResult.success) {
            await window.electronAPI.udpDisconnect(device.id);
            updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
            addLog(device.id, device.name, 'error', `UDP 绑定失败：${bindingResult.message || '未知错误'}`);
            return;
          }
          updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
          addLog(device.id, device.name, 'success', `UDP 已连接：${device.udpHost}:${device.udpPort}`);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `UDP 连接失败：${result.message}`);
        }
        return;
      }

      if (device.protocol === 'LoRaWAN') {
        updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        addLog(device.id, device.name, 'success', `LoRaWAN 已就绪：${device.loraDevEui}`);
        return;
      }

      if (device.protocol === 'Video') {
        const result = await connectSimDevice(device.id, { silent: true });
        const latest = useSimStore.getState().devices.find((item) => item.id === device.id);
        if (result.success && latest?.platformDeviceId) {
          addLog(device.id, device.name, 'success', `设备资产已同步：${latest.platformDeviceId}`);
        } else {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'error', `视频设备同步失败：${result.message || '未知错误'}`);
        }
        return;
      }

      await connectMqtt();
    } catch (error: any) {
      updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
      addLog(device.id, device.name, 'error', `连接异常：${error?.message || '未知错误'}`);
      message.error(`连接失败：${error?.message || '未知错误'}`);
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
      if (device.protocol === 'UDP') await window.electronAPI.udpDisconnect(device.id);
      if (device.protocol === 'Video') {
        await disconnectSimDevice(device.id, { silent: true });
        updateDevice(device.id, {
          status: 'offline',
          token: '',
          streamUrl: '',
          sipRegistered: false,
          sipKeepaliveEnabled: false,
          restoreOnLaunch: false,
          heartbeatTimerId: null,
        });
        addLog(device.id, device.name, 'info', '已断开连接');
        return;
      }
      updateDevice(device.id, {
        status: 'offline',
        token: '',
        platformDeviceId: null,
        streamUrl: '',
        sipRegistered: false,
        sipKeepaliveEnabled: false,
        restoreOnLaunch: false,
        heartbeatTimerId: null,
      });
      addLog(device.id, device.name, 'info', '已断开连接');
    } catch (error: any) {
      updateDevice(device.id, { status: 'offline', restoreOnLaunch: false, heartbeatTimerId: null, sipKeepaliveEnabled: false });
      addLog(device.id, device.name, 'warn', `断开连接时出现告警：${error?.message || '未知错误'}`);
    }
  };

  const updateThingModelRule = (ruleKey: string, patch: Partial<ThingModelSimulationRule>) => {
    const nextRule = {
      ...(thingModelRules[ruleKey] || {}),
      ...patch,
    };
    const hasMeaningfulValue = Object.entries(nextRule).some(([, value]) => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') return value !== '';
      return true;
    });
    const nextRules = { ...thingModelRules };
    if (hasMeaningfulValue) {
      nextRules[ruleKey] = nextRule;
    } else {
      delete nextRules[ruleKey];
    }
    updateDevice(device.id, { thingModelSimulationRules: nextRules });
  };

  const clearThingModelRule = (ruleKey: string) => {
    const nextRules = { ...thingModelRules };
    delete nextRules[ruleKey];
    updateDevice(device.id, { thingModelSimulationRules: nextRules });
    setRuleJsonDrafts((prev) => {
      if (!(ruleKey in prev)) return prev;
      const nextDrafts = { ...prev };
      delete nextDrafts[ruleKey];
      return nextDrafts;
    });
  };

  const getRuleMode = (field: ThingModelFieldDescriptor) => thingModelRules[field.ruleKey]?.mode || 'random';

  const handleRuleModeChange = (
    field: ThingModelFieldDescriptor,
    mode: NonNullable<ThingModelSimulationRule['mode']>,
  ) => {
    updateThingModelRule(field.ruleKey, { mode });
    if (mode === 'fixed' && thingModelRules[field.ruleKey]?.fixedValue === undefined) {
      const defaultValue = buildDefaultFixedValue(field.identifier, field.dataType);
      updateThingModelRule(field.ruleKey, { mode, fixedValue: defaultValue });
      if (supportsJsonFixedValue(field.valueType)) {
        setRuleJsonDrafts((prev) => ({
          ...prev,
          [field.ruleKey]: JSON.stringify(defaultValue, null, 2),
        }));
      }
    }
  };

  const getJsonRuleDraft = (field: ThingModelFieldDescriptor) => {
    if (ruleJsonDrafts[field.ruleKey] !== undefined) {
      return ruleJsonDrafts[field.ruleKey];
    }
    const fixedValue = thingModelRules[field.ruleKey]?.fixedValue;
    return JSON.stringify(fixedValue ?? buildDefaultFixedValue(field.identifier, field.dataType), null, 2);
  };

  const commitJsonRuleDraft = (field: ThingModelFieldDescriptor, draft: string) => {
    try {
      const parsed = JSON.parse(draft);
      if (field.valueType === 'array' && !Array.isArray(parsed)) {
        throw new Error('固定值必须是 JSON 数组');
      }
      if (field.valueType === 'struct' && !isJsonObject(parsed)) {
        throw new Error('固定值必须是 JSON 对象');
      }
      updateThingModelRule(field.ruleKey, { mode: 'fixed', fixedValue: parsed });
      setRuleJsonDrafts((prev) => ({
        ...prev,
        [field.ruleKey]: JSON.stringify(parsed, null, 2),
      }));
    } catch (error: any) {
      message.warning(error?.message || 'JSON 规则格式不正确');
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
          return buildRandomPropertyBatchPayload(availableModelItems, thingModelRules);
        }
        if (!activeModelItem) {
          message.warning('请先选择要模拟的属性');
          return null;
        }
        return buildRandomPropertyPayload(activeModelItem, thingModelRules);
      }
      if (reportType === 'event') {
        if (!activeModelItem) {
          message.warning('请先选择要模拟的事件');
          return null;
        }
        return buildRandomEventPayload(activeModelItem, thingModelRules);
      }
      return null;
    }
    try {
      return JSON.parse(customPayload);
    } catch {
      message.error('JSON 载荷格式不正确');
      return null;
    }
  };

  const sendData = async () => {
    const latestDevice = useSimStore.getState().devices.find((item) => item.id === device.id);
    if (!latestDevice || latestDevice.status !== 'online') {
      stopAutoReportForDevice(device.id, { reason: '设备离线，已停止自动上报' });
      return;
    }

    const payload = getPayload();
    if (!payload) return;

    setSending(true);
    try {
      if (!supportsThingModelReport(latestDevice.protocol) && reportType !== 'ota') {
        message.info(`${latestDevice.protocol} 协议请使用专属发送面板`);
        return;
      }
      const result = await publishPayload(latestDevice, reportType, payload, {
        trackHttpHistory: true,
        preferSelectedMqttTopic: true,
      });

      const current = useSimStore.getState().devices.find((item) => item.id === device.id) || latestDevice;
      if (result.success) {
        updateDevice(device.id, { sentCount: current.sentCount + 1 });
        addLog(device.id, device.name, 'success', `[${reportType === 'property' ? '属性' : reportType === 'event' ? '事件' : 'OTA'}] 已发送：${JSON.stringify(payload).slice(0, 120)}`);
      } else {
        updateDevice(device.id, { errorCount: current.errorCount + 1 });
        addLog(device.id, device.name, 'error', `发送失败：${result.message || JSON.stringify(result)}`);
      }
    } catch (error: any) {
      const current = useSimStore.getState().devices.find((item) => item.id === device.id) || device;
      updateDevice(device.id, { errorCount: current.errorCount + 1 });
      addLog(device.id, device.name, 'error', `发送异常：${error?.message || '未知错误'}`);
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
      addLog(device.id, device.name, 'info', `已开启自动上报（${device.autoIntervalSec || 5}秒）`);
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

  const renderSimulationRuleEditor = (field: ThingModelFieldDescriptor) => {
    const rule = thingModelRules[field.ruleKey] || {};
    const mode = getRuleMode(field);
    const enumCandidates = resolveThingModelEnumCandidates(field.dataType);
    const canUseRange = supportsRangeRule(field.valueType);
    const valueTypeLabel = resolveThingModelValueTypeLabel(field.dataType);

    return (
      <div
        key={field.ruleKey}
        style={{
          padding: '12px 14px',
          borderRadius: 16,
          border: '1px solid rgba(226,232,240,0.9)',
          background: '#ffffff',
          marginLeft: field.depth * 18,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
            <Space size={8} wrap>
              <Text style={{ color: '#0f172a', fontSize: 13 }}>{field.label}</Text>
              <Tag color="blue" style={{ margin: 0 }}>{valueTypeLabel}</Tag>
              {field.category === 'property' ? (
                <Tag style={{ margin: 0 }}>{field.itemName}</Tag>
              ) : (
                <Tag color="gold" style={{ margin: 0 }}>{field.itemName}</Tag>
              )}
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              规则键：{field.ruleKey}
            </Text>
          </Space>
          <Button size="small" type="link" onClick={() => clearThingModelRule(field.ruleKey)}>
            重置
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>生成方式</Text>
            <Select
              size="small"
              value={mode}
              style={{ width: '100%', marginTop: 4 }}
              onChange={(value) => handleRuleModeChange(field, value as NonNullable<ThingModelSimulationRule['mode']>)}
              options={[
                { label: '随机', value: 'random' },
                ...(canUseRange ? [{ label: '区间', value: 'range' }] : []),
                { label: '固定', value: 'fixed' },
              ]}
            />
          </div>

          {mode === 'random' && supportsStringRandomConfig(field.valueType) ? (
            <>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>字符串生成器</Text>
                <Select
                  size="small"
                  value={rule.stringGenerator || (field.identifier === 'ip' ? 'ip' : 'random')}
                  style={{ width: '100%', marginTop: 4 }}
                  onChange={(value) => updateThingModelRule(field.ruleKey, { mode, stringGenerator: value as 'random' | 'ip' })}
                  options={[
                      { label: '随机字符串', value: 'random' },
                      { label: 'IP 地址', value: 'ip' },
                  ]}
                />
              </div>
              <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>长度</Text>
                <InputNumber
                  size="small"
                  min={1}
                  max={64}
                  value={typeof rule.stringLength === 'number' ? rule.stringLength : undefined}
                  style={{ width: '100%', marginTop: 4 }}
                  onChange={(value) => updateThingModelRule(field.ruleKey, { mode, stringLength: value || undefined })}
                />
              </div>
            </>
          ) : null}

          {mode === 'random' && supportsArrayRandomConfig(field.valueType) ? (
            <>
              <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>最小长度</Text>
                <InputNumber
                  size="small"
                  min={0}
                  max={99}
                  value={typeof rule.arrayMinLength === 'number' ? rule.arrayMinLength : undefined}
                  style={{ width: '100%', marginTop: 4 }}
                  onChange={(value) => updateThingModelRule(field.ruleKey, { mode, arrayMinLength: value || 0 })}
                />
              </div>
              <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>最大长度</Text>
                <InputNumber
                  size="small"
                  min={0}
                  max={99}
                  value={typeof rule.arrayMaxLength === 'number' ? rule.arrayMaxLength : undefined}
                  style={{ width: '100%', marginTop: 4 }}
                  onChange={(value) => updateThingModelRule(field.ruleKey, { mode, arrayMaxLength: value || 0 })}
                />
              </div>
            </>
          ) : null}

          {mode === 'random' && (field.valueType === 'float' || field.valueType === 'double') ? (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>精度</Text>
              <InputNumber
                size="small"
                min={0}
                max={6}
                value={typeof rule.precision === 'number' ? rule.precision : undefined}
                style={{ width: '100%', marginTop: 4 }}
                onChange={(value) => updateThingModelRule(field.ruleKey, { mode, precision: value ?? undefined })}
              />
            </div>
          ) : null}

          {mode === 'range' ? (
            <>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>最小值</Text>
                <InputNumber
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  value={typeof rule.min === 'number' ? rule.min : undefined}
                  onChange={(value) => updateThingModelRule(field.ruleKey, { mode, min: value ?? undefined })}
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>最大值</Text>
                <InputNumber
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  value={typeof rule.max === 'number' ? rule.max : undefined}
                  onChange={(value) => updateThingModelRule(field.ruleKey, { mode, max: value ?? undefined })}
                />
              </div>
              {(field.valueType === 'float' || field.valueType === 'double') ? (
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>精度</Text>
                  <InputNumber
                    size="small"
                    min={0}
                    max={6}
                    style={{ width: '100%', marginTop: 4 }}
                    value={typeof rule.precision === 'number' ? rule.precision : undefined}
                    onChange={(value) => updateThingModelRule(field.ruleKey, { mode, precision: value ?? undefined })}
                  />
                </div>
              ) : null}
            </>
          ) : null}

          {mode === 'fixed' && (field.valueType === 'int' || field.valueType === 'float' || field.valueType === 'double' || field.valueType === 'date') ? (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{field.valueType === 'date' ? '时间戳' : '固定值'}</Text>
              <InputNumber
                size="small"
                style={{ width: '100%', marginTop: 4 }}
                value={typeof rule.fixedValue === 'number' ? rule.fixedValue : undefined}
                onChange={(value) => updateThingModelRule(field.ruleKey, { mode, fixedValue: value ?? undefined })}
              />
            </div>
          ) : null}

          {mode === 'fixed' && field.valueType === 'bool' ? (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>固定值</Text>
              <div style={{ marginTop: 8 }}>
                <Switch
                  checked={Boolean(rule.fixedValue)}
                  onChange={(checked) => updateThingModelRule(field.ruleKey, { mode, fixedValue: checked })}
                />
              </div>
            </div>
          ) : null}

          {mode === 'fixed' && field.valueType === 'string' ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>固定值</Text>
              <Input
                size="small"
                style={{ marginTop: 4 }}
                value={typeof rule.fixedValue === 'string' ? rule.fixedValue : ''}
                onChange={(event) => updateThingModelRule(field.ruleKey, { mode, fixedValue: event.target.value })}
              />
            </div>
          ) : null}

          {mode === 'fixed' && field.valueType === 'enum' ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>固定枚举值</Text>
              {enumCandidates.length > 0 ? (
                <Select
                  size="small"
                  style={{ width: '100%', marginTop: 4 }}
                  value={rule.fixedValue as string | number | undefined}
                  onChange={(value) => updateThingModelRule(field.ruleKey, { mode, fixedValue: value })}
                  options={enumCandidates.map((value) => ({ label: String(value), value }))}
                />
              ) : (
                <Input
                  size="small"
                  style={{ marginTop: 4 }}
                  value={rule.fixedValue == null ? '' : String(rule.fixedValue)}
                  onChange={(event) => updateThingModelRule(field.ruleKey, { mode, fixedValue: event.target.value })}
                />
              )}
            </div>
          ) : null}
        </div>

        {mode === 'fixed' && supportsJsonFixedValue(field.valueType) ? (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>固定 JSON</Text>
            <Input.TextArea
              rows={4}
              style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
              value={getJsonRuleDraft(field)}
              onChange={(event) => setRuleJsonDrafts((prev) => ({ ...prev, [field.ruleKey]: event.target.value }))}
              onBlur={(event) => commitJsonRuleDraft(field, event.target.value)}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const statusToneMap = {
    offline: { color: '#64748b', background: '#f8fafc', border: '#e2e8f0' },
    connecting: { color: '#0ea5e9', background: '#f0f9ff', border: '#bae6fd' },
    online: { color: '#15803d', background: '#f0fdf4', border: '#bbf7d0' },
    error: { color: '#dc2626', background: '#fef2f2', border: '#fecaca' },
  } as const;

  const statusTone = statusToneMap[device.status];
  const syncMetric = isVideoDevice(device)
    ? resolveVideoSyncMetric(device)
    : {
      label: '自动上报',
      value: device.autoReport ? '已开启' : '未开启',
      color: device.autoReport ? '#15803d' : '#64748b',
      background: device.autoReport ? '#f0fdf4' : '#f8fafc',
    };
  const connectionMetric = isVideoDevice(device)
    ? resolveVideoConnectionMetric(device)
    : {
      label: supportsThingModelReport(device.protocol) ? '心跳周期' : '认证状态',
      value: supportsThingModelReport(device.protocol)
        ? `${device.heartbeatIntervalSec || 30} 秒`
        : device.token
          ? '已认证'
          : '待连接',
      color: supportsThingModelReport(device.protocol) ? '#7c3aed' : '#0f766e',
      background: supportsThingModelReport(device.protocol) ? '#f5f3ff' : '#ecfeff',
    };
  const heroMetrics = [
    { label: '发送次数', value: String(device.sentCount), color: '#2563eb', background: '#eff6ff' },
    { label: '错误次数', value: String(device.errorCount), color: '#dc2626', background: '#fef2f2' },
    syncMetric,
    connectionMetric,
  ];
  const basicInfoCardStyle = {
    marginBottom: 18,
    padding: 22,
    borderRadius: 28,
    border: '1px solid #dbe4ee',
    background: '#ffffff',
    boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto', background: '#f3f7fb' }}>
      <div style={basicInfoCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 420px', minWidth: 260 }}>
            <Space size={8} wrap>
              <Title
                level={3}
                style={{
                  margin: 0,
                  color: '#0f172a',
                  fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif',
                }}
              >
                {device.name}
              </Title>
              <Tag color={PROTOCOL_COLORS[device.protocol] || 'default'} style={{ margin: 0 }}>
                {device.protocol}
              </Tag>
              <Tag
                style={{
                  margin: 0,
                  color: statusTone.color,
                  background: statusTone.background,
                  borderColor: statusTone.border,
                  borderRadius: 999,
                }}
              >
                {STATUS_TEXT[device.status]}
              </Tag>
            </Space>
          </div>
          {!isOnline ? (
            <Button type="primary" icon={<ApiOutlined />} onClick={handleConnect} loading={device.status === 'connecting'}>
              连接设备
            </Button>
          ) : (
            <Button danger icon={<DisconnectOutlined />} onClick={handleDisconnect}>
              断开设备
            </Button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 18 }}>
          {heroMetrics.map((item) => (
            <div
              key={item.label}
              style={{
                padding: '14px 14px 12px',
                borderRadius: 20,
                border: '1px solid rgba(226,232,240,0.9)',
                background: item.background,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                {item.label}
              </Text>
              <div style={{ marginTop: 10, color: item.color, fontSize: 22, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(226,232,240,0.9)' }}>
          <Text strong style={{ color: '#0f172a', fontSize: 13 }}>接入参数</Text>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
            {accessItems.map((item) => (
              <div
                key={item.label}
                style={{
                  padding: '12px 14px',
                  borderRadius: 18,
                  border: `1px solid ${item.highlight ? '#c7d2fe' : '#e2e8f0'}`,
                  background: item.highlight ? '#eef2ff' : '#f8fafc',
                }}
              >
                <Text type="secondary" style={{ fontSize: 11 }}>{item.label}</Text>
                <div style={{ marginTop: 6, color: '#0f172a', fontSize: 13, wordBreak: 'break-all' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {device.protocol === 'MQTT' && mqttIdentity ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 12 }}>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid rgba(226,232,240,0.9)' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>客户端 ID</Text>
                <div style={{ marginTop: 4, color: '#0f172a', wordBreak: 'break-all' }}>{mqttIdentity.clientId || '自动生成'}</div>
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: '#f8fafc', border: '1px solid rgba(226,232,240,0.9)' }}>
                <Text type="secondary" style={{ fontSize: 11 }}>用户名</Text>
                <div style={{ marginTop: 4, color: '#0f172a', wordBreak: 'break-all' }}>{mqttIdentity.username || '自动生成'}</div>
              </div>
            </div>
          ) : null}

          {device.token ? (
            <div style={{ marginTop: 12 }}>
              <Alert
                type="success"
                showIcon
                message="当前设备已获取认证令牌"
                description={`Token 片段：${device.token.slice(0, 30)}...`}
              />
            </div>
          ) : null}

          {accessError ? (
            <div style={{ marginTop: 12 }}>
              <Alert
                type="warning"
                showIcon
                message="接入参数还不完整"
                description={`${accessError}。请先补齐后再发起连接，避免服务端收到空认证参数。`}
              />
            </div>
          ) : null}
        </div>
      </div>

      {showThingModelSync && (
        <Card
          title={<Space><ApiOutlined />平台物模型</Space>}
          extra={(
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => setThingModelRefreshNonce((value) => value + 1)}
              disabled={!activeSession?.accessToken || !(device.productKey || '').trim()}
              loading={thingModelLoading}
            >
              刷新
            </Button>
          )}
          size="small"
          style={{
            marginBottom: 16,
            borderRadius: 24,
            border: '1px solid rgba(226,232,240,0.92)',
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
            boxShadow: '0 14px 34px rgba(15,23,42,0.05)',
          }}
          styles={{ header: { borderBottom: '1px solid rgba(226,232,240,0.9)' }, body: { padding: 18 } }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Alert
              type={activeSession?.accessToken ? 'success' : 'warning'}
              showIcon
              message={activeSession?.accessToken ? `当前环境：${activeEnvironment.name}` : '请先登录当前环境'}
              description={activeSession?.accessToken
                ? `将通过 ${activeEnvironment.gatewayBaseUrl || '-'} 按 ProductKey 同步当前产品的属性、事件和服务定义。`
                : '登录后可自动同步物模型；未登录时仍可继续调试当前协议接入。'}
            />

            {thingModelLoading ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                正在同步物模型...
              </Text>
            ) : null}

            {!thingModelLoading && thingModelRoot ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                已同步 {thingModelRoot.properties.length} 个属性、{thingModelRoot.events.length} 个事件、{thingModelRoot.services.length} 个服务。
              </Text>
            ) : null}

            {!thingModelLoading && thingModelError ? (
              <Alert
                type="warning"
                showIcon
                message="最近一次物模型同步失败"
                description={thingModelError}
              />
            ) : null}
          </Space>
        </Card>
      )}

      {showGenericReport && (
        <Card
          title={<Space><CloudUploadOutlined />数据上报</Space>}
          size="small"
          style={{
            marginBottom: 16,
            borderRadius: 24,
            border: '1px solid rgba(226,232,240,0.92)',
            background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
            boxShadow: '0 14px 34px rgba(15,23,42,0.05)',
          }}
          styles={{ header: { borderBottom: '1px solid rgba(226,232,240,0.9)' }, body: { padding: 18 } }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <Space direction="vertical" size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>上报类型</Text>
                <Radio.Group value={reportType} onChange={(event) => setReportType(event.target.value)} size="small">
                  <Radio.Button value="property">属性</Radio.Button>
                  <Radio.Button value="event">事件</Radio.Button>
                  {device.protocol === 'CoAP' && <Radio.Button value="ota">OTA</Radio.Button>}
                </Radio.Group>
              </Space>
              <Space size={16} wrap>
                <Text type="secondary">已发送：<Text strong style={{ color: '#52c41a' }}>{device.sentCount}</Text></Text>
                <Text type="secondary">失败：<Text strong style={{ color: '#ff4d4f' }}>{device.errorCount}</Text></Text>
              </Space>
            </div>

            {device.protocol === 'HTTP' ? (
              <Alert
                type="info"
                showIcon
                message="请先连接设备"
                description="确认 ProductKey、DeviceName、DeviceSecret 无误后，先连接，再发送属性或事件。"
              />
            ) : null}

            {device.protocol === 'MQTT' && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>主题</Text>
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

                    {activeRuleFields.length > 0 ? (
                      <div style={{ padding: 14, background: '#f8fafc', borderRadius: 18, border: '1px solid rgba(226,232,240,0.9)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                          <Space direction="vertical" size={2}>
                            <Text style={{ fontSize: 12, color: '#0f172a' }}>字段模拟规则</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              已生效自定义规则：{customizedRuleCount}
                            </Text>
                          </Space>
                          {customizedRuleCount > 0 ? (
                            <Button
                              size="small"
                              onClick={() => {
                                const activeRuleKeys = new Set(activeRuleFields.map((field) => field.ruleKey));
                                const nextRules = Object.fromEntries(
                                  Object.entries(thingModelRules).filter(([ruleKey]) => !activeRuleKeys.has(ruleKey)),
                                );
                                updateDevice(device.id, { thingModelSimulationRules: nextRules });
                                setRuleJsonDrafts((prev) => {
                                  const nextDrafts = { ...prev };
                                  activeRuleFields.forEach((field) => {
                                    delete nextDrafts[field.ruleKey];
                                  });
                                  return nextDrafts;
                                });
                              }}
                            >
                              清空当前规则
                            </Button>
                          ) : null}
                        </div>
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                          {activeRuleFields.map(renderSimulationRuleEditor)}
                        </Space>
                      </div>
                    ) : null}

                    <div style={{ padding: 14, background: '#f8fafc', borderRadius: 18, border: '1px solid rgba(226,232,240,0.9)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                        <Space size={6} wrap>
                          <Text style={{ fontSize: 12, color: '#0f172a' }}>字段预览</Text>
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
                <Text type="secondary" style={{ fontSize: 12 }}>自定义 JSON</Text>
                <Input.TextArea rows={5} value={customPayload} onChange={(event) => setCustomPayload(event.target.value)} style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }} />
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Button type="primary" icon={<SendOutlined />} onClick={sendData} loading={sending} disabled={!isOnline}>发送</Button>
              <Space size={8}>
                <Switch checked={device.autoReport} onChange={handleAutoToggle} disabled={!isOnline} checkedChildren={<PlayCircleOutlined />} unCheckedChildren={<PauseCircleOutlined />} />
                <Text style={{ fontSize: 12 }}>自动上报</Text>
                <InputNumber size="small" min={1} max={3600} value={device.autoIntervalSec} onChange={(value) => updateDevice(device.id, { autoIntervalSec: value || 5 })} disabled={device.autoReport} style={{ width: 90 }} addonAfter="秒" />
              </Space>
              {supportsThingModelReport(device.protocol) ? (
                <Space size={8}>
                  <Text style={{ fontSize: 12 }}>心跳</Text>
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

      <Card
        size="small"
        style={{
          marginBottom: 16,
          borderRadius: 24,
          border: '1px solid rgba(226,232,240,0.92)',
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
          boxShadow: '0 14px 34px rgba(15,23,42,0.05)',
        }}
        title={<Space><ApiOutlined />协议专属工具</Space>}
        styles={{ header: { borderBottom: '1px solid rgba(226,232,240,0.9)' }, body: { padding: 18 } }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            连接后可在这里查看 HTTP 历史、MQTT 消息、CoAP 影子等协议调试结果。
          </Text>
          {!isOnline ? (
            <Alert
              type="info"
              showIcon
              message="连接设备后可查看更多协议调试能力"
              description="当前仍可继续调整接入参数和物模型配置。"
            />
          ) : null}
          <div>
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
        </Space>
      </Card>
    </div>
  );
}
