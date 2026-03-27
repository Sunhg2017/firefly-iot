import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { Protocol, SimDevice, SimDeviceLocator, SipChannel } from '../store';
import { useSimStore } from '../store';
import {
  buildEnvironmentDeviceDefaults,
  getActiveEnvironment,
  isSimulatorAuthInvalid,
  useSimWorkspaceStore,
} from '../workspaceStore';
import {
  buildFallbackLocalVideoModes,
  buildLocalVideoModeKey,
  getVideoSourceFieldLabel,
  isProxyVideoMode,
  type LocalVideoModeOption,
  normalizeVideoStreamMode,
  parseVideoSourceUrl,
  resolveVideoDeviceName,
  resolveVideoProductProtocol,
  selectPreferredLocalVideoMode,
} from '../utils/video';
import { disconnectSimDevice } from '../utils/runtime';

const { Paragraph, Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  editingDevice?: SimDevice | null;
}

interface TenantProductRecord {
  id: number;
  productKey: string;
  name: string;
  protocol: string;
  deviceAuthType: 'DEVICE_SECRET' | 'PRODUCT_SECRET';
}

interface LocalVideoSourceOption {
  value: string;
  label: string;
}

const STEP_TITLES = ['基本信息', '接入参数', '扩展配置'];

const AUTH_MODE_LABELS: Record<'DEVICE_SECRET' | 'PRODUCT_SECRET', string> = {
  DEVICE_SECRET: '一机一密',
  PRODUCT_SECRET: '一型一密',
};

const PROTOCOL_META: Record<Protocol, { label: string; description: string }> = {
  HTTP: { label: 'HTTP 设备', description: '支持一机一密鉴权，也支持先动态注册再通过 HTTP 鉴权上报。' },
  MQTT: { label: 'MQTT 设备', description: '支持一机一密和一型一密动态注册。' },
  CoAP: { label: 'CoAP 设备', description: '支持 CoAP Bridge 鉴权、上报和影子拉取。' },
  Video: { label: '视频设备', description: '支持 GB28181、RTSP、RTMP 三种模式。' },
  SNMP: { label: 'SNMP 设备', description: '用于 SNMP 连通性和 OID 读写测试。' },
  Modbus: { label: 'Modbus 设备', description: '用于 Modbus TCP / RTU over TCP 调试。' },
  WebSocket: { label: 'WebSocket 设备', description: '通过 `/ws/device` 建立实时双向连接。' },
  TCP: { label: 'TCP 设备', description: '适合文本报文和 Socket 联调。' },
  UDP: { label: 'UDP 设备', description: '适合无连接报文发送测试。' },
  LoRaWAN: { label: 'LoRaWAN 设备', description: '通过 Webhook 模拟 LoRaWAN 上行。' },
};

const LOCATOR_TYPE_OPTIONS = [
  { value: 'IMEI', label: 'IMEI' },
  { value: 'ICCID', label: 'ICCID' },
  { value: 'MAC', label: 'MAC' },
  { value: 'SERIAL', label: 'SERIAL' },
];

const drawerPanelCardStyle: CSSProperties = {
  borderRadius: 24,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,251,255,0.96) 100%)',
  border: '1px solid rgba(226,232,240,0.95)',
  boxShadow: '0 18px 42px rgba(15,23,42,0.08)',
};

const drawerSectionCardStyle: CSSProperties = {
  borderRadius: 18,
  background: '#ffffff',
  border: '1px solid rgba(226,232,240,0.92)',
  boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
};

const drawerInnerCardStyle: CSSProperties = {
  borderRadius: 14,
  background: '#f8fbff',
  border: '1px solid rgba(226,232,240,0.92)',
  boxShadow: 'none',
};

function trimText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveEffectiveDeviceName(values: Record<string, unknown>): string {
  if (values.protocol === 'Video') {
    return resolveVideoDeviceName({
      name: trimText(values.name),
      gbDeviceId: trimText(values.gbDeviceId),
      streamMode: typeof values.streamMode === 'string' ? values.streamMode : undefined,
    });
  }
  return trimText(values.deviceName);
}

function supportsTenantProductSelection(protocol: Protocol): boolean {
  return protocol === 'HTTP' || protocol === 'MQTT' || protocol === 'CoAP' || protocol === 'Video';
}

function resolveProductProtocolQuery(protocol: Protocol, streamMode?: string): string | undefined {
  switch (protocol) {
    case 'HTTP':
      return 'HTTP';
    case 'MQTT':
      return 'MQTT';
    case 'CoAP':
      return 'COAP';
    case 'Video':
      return resolveVideoProductProtocol(streamMode);
    default:
      return undefined;
  }
}

function normalizeVideoSourceType(value: unknown): 'LOCAL_CAMERA' | 'REMOTE_SOURCE' {
  return value === 'REMOTE_SOURCE' ? 'REMOTE_SOURCE' : 'LOCAL_CAMERA';
}

function buildAutoLocalSourcePreview(baseUrl: string, streamMode?: string, seedName?: string): string {
  const normalizedMode = normalizeVideoStreamMode(streamMode);
  if (!isProxyVideoMode(normalizedMode)) {
    return '';
  }
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname || '127.0.0.1';
    const sanitizedSeed = (seedName || 'simulator-camera')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'simulator-camera';
    return normalizedMode === 'RTMP'
      ? `rtmp://${host}:1935/live/${sanitizedSeed}`
      : `rtsp://${host}:554/live/${sanitizedSeed}`;
  } catch {
    return '';
  }
}

function buildInitialValues(
  environment: ReturnType<typeof getActiveEnvironment>,
): Record<string, unknown> {
  const environmentDefaults = buildEnvironmentDeviceDefaults(environment);
  return {
    protocol: 'HTTP',
    httpAuthMode: 'DEVICE_SECRET',
    mqttAuthMode: 'DEVICE_SECRET',
    mqttClean: true,
    mqttKeepalive: 60,
    mqttWillQos: 1,
    mqttWillRetain: false,
    streamMode: 'GB28181',
    videoSourceType: 'LOCAL_CAMERA',
    gbDomain: '3402000000',
    ip: '127.0.0.1',
    sipServerIp: '127.0.0.1',
    sipServerPort: 5060,
    sipServerId: '34020000002000000001',
    sipLocalPort: 5080,
    sipKeepaliveInterval: 60,
    sipTransport: 'UDP',
    sipPassword: '',
    cameraDevice: '',
    mediaFps: 15,
    mediaWidth: 1280,
    mediaHeight: 720,
    snmpPort: 161,
    snmpVersion: 2,
    snmpCommunity: 'public',
    modbusPort: 502,
    modbusSlaveId: 1,
    modbusMode: 'TCP',
    tcpHost: 'localhost',
    tcpPort: 8900,
    udpHost: 'localhost',
    udpPort: 8901,
    loraFPort: 1,
    ...environmentDefaults,
  };
}

function resolveNumberValue(value: unknown, fallback: number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function resolveBooleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function cloneLocators(locators: SimDeviceLocator[] | undefined): SimDeviceLocator[] {
  if (!Array.isArray(locators)) {
    return [];
  }
  return locators.map((item) => ({
    locatorType: trimText(item.locatorType),
    locatorValue: trimText(item.locatorValue),
    primaryLocator: Boolean(item.primaryLocator),
  }));
}

function cloneSipChannels(channels: SipChannel[] | undefined): SipChannel[] {
  if (!Array.isArray(channels)) {
    return [];
  }
  return channels.map((item) => ({
    channelId: trimText(item.channelId),
    name: trimText(item.name),
    manufacturer: trimText(item.manufacturer),
    model: trimText(item.model),
    status: item.status === 'OFF' ? 'OFF' : 'ON',
    ptzType: resolveNumberValue(item.ptzType, 1),
    longitude: resolveNumberValue(item.longitude, 0),
    latitude: resolveNumberValue(item.latitude, 0),
  }));
}

function buildEditableDeviceValues(
  device: SimDevice,
  environment: ReturnType<typeof getActiveEnvironment>,
): Record<string, unknown> {
  return {
    ...buildInitialValues(environment),
    name: device.name,
    protocol: device.protocol,
    httpBaseUrl: device.httpBaseUrl,
    httpAuthMode: device.httpAuthMode,
    httpRegisterBaseUrl: device.httpRegisterBaseUrl,
    productKey: device.productKey,
    productSecret: device.productSecret,
    deviceName: device.deviceName,
    deviceSecret: device.deviceSecret,
    locators: cloneLocators(device.locators),
    mqttAuthMode: device.mqttAuthMode,
    mqttRegisterBaseUrl: device.mqttRegisterBaseUrl,
    mqttBrokerUrl: device.mqttBrokerUrl,
    mqttClientId: device.mqttClientId,
    mqttUsername: device.mqttUsername,
    mqttPassword: device.mqttPassword,
    mqttClean: device.mqttClean,
    mqttKeepalive: device.mqttKeepalive,
    mqttWillTopic: device.mqttWillTopic,
    mqttWillPayload: device.mqttWillPayload,
    mqttWillQos: device.mqttWillQos,
    mqttWillRetain: device.mqttWillRetain,
    coapBaseUrl: device.coapBaseUrl,
    streamMode: device.streamMode,
    videoSourceType: device.videoSourceType,
    gbDeviceId: device.gbDeviceId,
    gbDomain: device.gbDomain,
    sourceUrl: device.sourceUrl,
    ip: device.ip,
    manufacturer: device.manufacturer,
    model: device.model,
    firmware: device.firmware,
    sipServerIp: device.sipServerIp,
    sipServerPort: device.sipServerPort,
    sipServerId: device.sipServerId,
    sipLocalPort: device.sipLocalPort,
    sipKeepaliveInterval: device.sipKeepaliveInterval,
    sipPassword: device.sipPassword,
    sipTransport: device.sipTransport,
    cameraDevice: device.cameraDevice,
    mediaFps: device.mediaFps,
    mediaWidth: device.mediaWidth,
    mediaHeight: device.mediaHeight,
    sipChannels: cloneSipChannels(device.sipChannels),
    snmpConnectorUrl: device.snmpConnectorUrl,
    snmpHost: device.snmpHost,
    snmpPort: device.snmpPort,
    snmpVersion: device.snmpVersion,
    snmpCommunity: device.snmpCommunity,
    modbusConnectorUrl: device.modbusConnectorUrl,
    modbusHost: device.modbusHost,
    modbusPort: device.modbusPort,
    modbusSlaveId: device.modbusSlaveId,
    modbusMode: device.modbusMode,
    wsConnectorUrl: device.wsConnectorUrl,
    wsEndpoint: device.wsEndpoint,
    wsDeviceId: device.wsDeviceId,
    wsProductId: device.wsProductId,
    wsTenantId: device.wsTenantId,
    tcpHost: device.tcpHost,
    tcpPort: device.tcpPort,
    udpHost: device.udpHost,
    udpPort: device.udpPort,
    loraWebhookUrl: device.loraWebhookUrl,
    loraDevEui: device.loraDevEui,
    loraAppId: device.loraAppId,
    loraFPort: device.loraFPort,
  };
}

function buildNormalizedDeviceDraft(values: Record<string, unknown>): Partial<SimDevice> {
  const protocol = (values.protocol || 'HTTP') as Protocol;
  const normalizedStreamMode = normalizeVideoStreamMode(typeof values.streamMode === 'string' ? values.streamMode : undefined);
  const normalizedVideoSourceType = normalizeVideoSourceType(values.videoSourceType);
  const effectiveDeviceName = resolveEffectiveDeviceName(values);

  return {
    name: trimText(values.name),
    nickname: trimText(values.name),
    protocol,
    httpBaseUrl: trimText(values.httpBaseUrl as string | undefined),
    httpAuthMode: values.httpAuthMode === 'PRODUCT_SECRET' ? 'PRODUCT_SECRET' : 'DEVICE_SECRET',
    httpRegisterBaseUrl: trimText(values.httpRegisterBaseUrl as string | undefined),
    productKey: trimText(values.productKey as string | undefined),
    productSecret: trimText(values.productSecret as string | undefined),
    deviceName: effectiveDeviceName,
    deviceSecret: trimText(values.deviceSecret as string | undefined),
    locators: cloneLocators(values.locators as SimDeviceLocator[] | undefined),
    mqttAuthMode: values.mqttAuthMode === 'PRODUCT_SECRET' ? 'PRODUCT_SECRET' : 'DEVICE_SECRET',
    mqttRegisterBaseUrl: trimText(values.mqttRegisterBaseUrl as string | undefined),
    mqttBrokerUrl: trimText(values.mqttBrokerUrl as string | undefined),
    mqttClientId: trimText(values.mqttClientId as string | undefined),
    mqttUsername: trimText(values.mqttUsername as string | undefined),
    mqttPassword: trimText(values.mqttPassword as string | undefined),
    mqttClean: resolveBooleanValue(values.mqttClean, true),
    mqttKeepalive: resolveNumberValue(values.mqttKeepalive, 60),
    mqttWillTopic: trimText(values.mqttWillTopic as string | undefined),
    mqttWillPayload: trimText(values.mqttWillPayload as string | undefined),
    mqttWillQos: resolveNumberValue(values.mqttWillQos, 1),
    mqttWillRetain: resolveBooleanValue(values.mqttWillRetain, false),
    coapBaseUrl: trimText(values.coapBaseUrl as string | undefined),
    streamMode: normalizedStreamMode,
    videoSourceType: normalizedVideoSourceType,
    gbDeviceId: trimText(values.gbDeviceId as string | undefined),
    gbDomain: trimText(values.gbDomain as string | undefined),
    sourceUrl: protocol === 'Video'
      && isProxyVideoMode(normalizedStreamMode)
      && normalizedVideoSourceType === 'LOCAL_CAMERA'
      ? ''
      : trimText(values.sourceUrl as string | undefined),
    ip: trimText(values.ip as string | undefined),
    manufacturer: trimText(values.manufacturer as string | undefined),
    model: trimText(values.model as string | undefined),
    firmware: trimText(values.firmware as string | undefined),
    sipServerIp: trimText(values.sipServerIp as string | undefined),
    sipServerPort: resolveNumberValue(values.sipServerPort, 5060),
    sipServerId: trimText(values.sipServerId as string | undefined),
    sipLocalPort: resolveNumberValue(values.sipLocalPort, 5080),
    sipKeepaliveInterval: resolveNumberValue(values.sipKeepaliveInterval, 60),
    sipPassword: trimText(values.sipPassword as string | undefined),
    sipTransport: values.sipTransport === 'TCP' ? 'TCP' : 'UDP',
    cameraDevice: trimText(values.cameraDevice as string | undefined),
    mediaFps: resolveNumberValue(values.mediaFps, 15),
    mediaWidth: resolveNumberValue(values.mediaWidth, 1280),
    mediaHeight: resolveNumberValue(values.mediaHeight, 720),
    sipChannels: cloneSipChannels(values.sipChannels as SipChannel[] | undefined),
    snmpConnectorUrl: trimText(values.snmpConnectorUrl as string | undefined),
    snmpHost: trimText(values.snmpHost as string | undefined),
    snmpPort: resolveNumberValue(values.snmpPort, 161),
    snmpVersion: resolveNumberValue(values.snmpVersion, 2),
    snmpCommunity: trimText(values.snmpCommunity as string | undefined),
    modbusConnectorUrl: trimText(values.modbusConnectorUrl as string | undefined),
    modbusHost: trimText(values.modbusHost as string | undefined),
    modbusPort: resolveNumberValue(values.modbusPort, 502),
    modbusSlaveId: resolveNumberValue(values.modbusSlaveId, 1),
    modbusMode: values.modbusMode === 'RTU_OVER_TCP' ? 'RTU_OVER_TCP' : 'TCP',
    wsConnectorUrl: trimText(values.wsConnectorUrl as string | undefined),
    wsEndpoint: trimText(values.wsEndpoint as string | undefined),
    wsDeviceId: trimText(values.wsDeviceId as string | undefined),
    wsProductId: trimText(values.wsProductId as string | undefined),
    wsTenantId: trimText(values.wsTenantId as string | undefined),
    tcpHost: trimText(values.tcpHost as string | undefined),
    tcpPort: resolveNumberValue(values.tcpPort, 8900),
    udpHost: trimText(values.udpHost as string | undefined),
    udpPort: resolveNumberValue(values.udpPort, 8901),
    loraWebhookUrl: trimText(values.loraWebhookUrl as string | undefined),
    loraDevEui: trimText(values.loraDevEui as string | undefined),
    loraAppId: trimText(values.loraAppId as string | undefined),
    loraFPort: resolveNumberValue(values.loraFPort, 1),
  };
}

function buildVideoBindingKey(device: Pick<SimDevice, 'protocol' | 'streamMode' | 'videoSourceType' | 'gbDeviceId' | 'sourceUrl'>): string | null {
  if (device.protocol !== 'Video') {
    return null;
  }
  const streamMode = normalizeVideoStreamMode(device.streamMode);
  if (streamMode === 'GB28181') {
    return `GB28181:${trimText(device.gbDeviceId)}`;
  }
  const videoSourceType = normalizeVideoSourceType(device.videoSourceType);
  if (videoSourceType === 'LOCAL_CAMERA') {
    return `LOCAL_CAMERA:${streamMode}`;
  }
  try {
    return `REMOTE_SOURCE:${streamMode}:${parseVideoSourceUrl(streamMode, device.sourceUrl)?.normalizedUrl || trimText(device.sourceUrl)}`;
  } catch {
    return `REMOTE_SOURCE:${streamMode}:${trimText(device.sourceUrl)}`;
  }
}

function getStepFields(
  protocol: Protocol,
  step: number,
  mqttAuthMode?: string,
  streamMode?: string,
  httpAuthMode?: string,
  videoSourceType?: string,
): string[] {
  if (step === 0) return ['name', 'protocol'];
  if (step === 1) {
    switch (protocol) {
      case 'HTTP':
        return ['httpBaseUrl', 'productKey', 'deviceName', ...(httpAuthMode === 'PRODUCT_SECRET' ? ['httpRegisterBaseUrl', 'productSecret'] : ['deviceSecret'])];
      case 'MQTT':
        return ['productKey', 'deviceName', 'mqttBrokerUrl', ...(mqttAuthMode === 'PRODUCT_SECRET' ? ['mqttRegisterBaseUrl', 'productSecret'] : ['deviceSecret'])];
      case 'Video':
        return [
          'productKey',
          'streamMode',
          'videoSourceType',
          ...(isProxyVideoMode(streamMode) && normalizeVideoSourceType(videoSourceType) === 'REMOTE_SOURCE'
            ? ['sourceUrl']
            : []),
          ...(!isProxyVideoMode(streamMode) ? ['gbDeviceId', 'gbDomain'] : []),
        ];
      case 'CoAP':
        return ['coapBaseUrl', 'productKey', 'deviceName', 'deviceSecret'];
      case 'SNMP':
        return ['snmpConnectorUrl', 'snmpHost'];
      case 'Modbus':
        return ['modbusConnectorUrl', 'modbusHost'];
      case 'WebSocket':
        return ['wsEndpoint'];
      case 'TCP':
        return ['tcpHost'];
      case 'UDP':
        return ['udpHost'];
      case 'LoRaWAN':
        return ['loraWebhookUrl', 'loraDevEui'];
      default:
        return ['httpBaseUrl', 'productKey', 'deviceName', 'deviceSecret'];
    }
  }
  if (step === 2 && protocol === 'Video' && streamMode === 'GB28181') {
    return ['sipServerIp', 'sipServerPort', 'sipServerId', 'sipLocalPort', 'sipPassword'];
  }
  return [];
}

function buildSummary(values: Record<string, unknown>, products: TenantProductRecord[], gatewayBaseUrl: string) {
  const protocol = (values.protocol || 'HTTP') as string;
  const selectedProduct = products.find((item) => item.productKey === values.productKey);
  const streamMode = normalizeVideoStreamMode(typeof values.streamMode === 'string' ? values.streamMode : undefined);
  const videoSourceType = normalizeVideoSourceType(values.videoSourceType);
  const localPreview = buildAutoLocalSourcePreview(
    gatewayBaseUrl,
    streamMode,
    trimText(values.name as string | undefined),
  );
  const videoEndpoint = isProxyVideoMode(streamMode)
    ? (videoSourceType === 'LOCAL_CAMERA'
      ? localPreview
      : trimText(values.sourceUrl))
    : [trimText(values.ip as string | undefined) || '127.0.0.1', values.sipLocalPort || 5080].join(':');
  const items = [
    { key: 'name', label: '设备名称', value: values.name || '-' },
    { key: 'protocol', label: '协议', value: protocol },
    {
      key: 'main1',
      label: '所属产品',
      value: selectedProduct ? `${selectedProduct.name} (${selectedProduct.productKey})` : values.productKey || '-',
    },
    { key: 'deviceName', label: 'DeviceName', value: resolveEffectiveDeviceName(values) || '-' },
    {
      key: 'main2',
      label: '接入地址',
      value: protocol === 'Video'
        ? videoEndpoint || '-'
        : values.httpBaseUrl || values.coapBaseUrl || values.mqttBrokerUrl || values.loraWebhookUrl || '-',
    },
  ];
  return items;
}

export default function AddDeviceModal({ open, onClose, editingDevice = null }: Props) {
  const addLog = useSimStore((state) => state.addLog);
  const updateDevice = useSimStore((state) => state.updateDevice);
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const clearWorkspaceSession = useSimWorkspaceStore((state) => state.clearSession);
  const [form] = Form.useForm();
  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  );
  const activeSession = sessions[activeEnvironment.id];
  const [currentStep, setCurrentStep] = useState(0);
  const [formSnapshot, setFormSnapshot] = useState<Record<string, unknown>>(() => buildInitialValues(activeEnvironment));
  const [products, setProducts] = useState<TenantProductRecord[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productLoadError, setProductLoadError] = useState('');
  const [localVideoSources, setLocalVideoSources] = useState<LocalVideoSourceOption[]>([]);
  const [localVideoSourceLoading, setLocalVideoSourceLoading] = useState(false);
  const [localVideoModes, setLocalVideoModes] = useState<LocalVideoModeOption[]>([]);
  const [localVideoModeLoading, setLocalVideoModeLoading] = useState(false);
  const previousVideoStreamModeRef = useRef<string | undefined>(undefined);

  const protocol = ((formSnapshot.protocol as Protocol | undefined) || 'HTTP') as Protocol;
  const httpAuthMode = formSnapshot.httpAuthMode as string | undefined;
  const mqttAuthMode = formSnapshot.mqttAuthMode as string | undefined;
  const streamMode = formSnapshot.streamMode as string | undefined;
  const videoSourceType = normalizeVideoSourceType(formSnapshot.videoSourceType);
  const usesLocalCamera = protocol === 'Video' && (!isProxyVideoMode(streamMode) || videoSourceType === 'LOCAL_CAMERA');
  const selectedCameraDevice = trimText(formSnapshot.cameraDevice as string | undefined);
  const selectedCameraModeKey = buildLocalVideoModeKey(
    formSnapshot.mediaWidth,
    formSnapshot.mediaHeight,
    formSnapshot.mediaFps,
  );
  const availableLocalVideoModes = useMemo(
    () => (localVideoModes.length > 0
      ? localVideoModes
      : buildFallbackLocalVideoModes({
        width: formSnapshot.mediaWidth,
        height: formSnapshot.mediaHeight,
        fps: formSnapshot.mediaFps,
      })),
    [formSnapshot.mediaFps, formSnapshot.mediaHeight, formSnapshot.mediaWidth, localVideoModes],
  );
  const meta = useMemo(() => PROTOCOL_META[protocol], [protocol]);
  const sourcePreview = useMemo(() => {
    if (protocol !== 'Video' || !isProxyVideoMode(streamMode) || videoSourceType !== 'REMOTE_SOURCE') {
      return null;
    }
    try {
      return parseVideoSourceUrl(streamMode, trimText(formSnapshot.sourceUrl as string | undefined));
    } catch {
      return null;
    }
  }, [formSnapshot.sourceUrl, protocol, streamMode, videoSourceType]);
  const canSelectTenantProduct = supportsTenantProductSelection(protocol)
    && Boolean(activeSession?.accessToken)
    && !productLoadError
    && (productLoading || products.length > 0);

  const drawerTitle = editingDevice ? '编辑设备' : '新建设备';
  const submitButtonLabel = editingDevice ? '保存修改' : '创建设备';

  const resetForm = () => {
    const nextValues = editingDevice
      ? buildEditableDeviceValues(editingDevice, activeEnvironment)
      : buildInitialValues(activeEnvironment);
    form.resetFields();
    form.setFieldsValue(nextValues);
    setCurrentStep(0);
    setFormSnapshot(nextValues);
  };

  const closeDrawer = () => {
    resetForm();
    setProducts([]);
    setProductLoading(false);
    setProductLoadError('');
    setLocalVideoSources([]);
    setLocalVideoModes([]);
    setLocalVideoSourceLoading(false);
    setLocalVideoModeLoading(false);
    onClose();
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    resetForm();
  }, [activeEnvironment, editingDevice, open]);

  useEffect(() => {
    if (!open) {
      previousVideoStreamModeRef.current = undefined;
      return;
    }

    const previousStreamMode = previousVideoStreamModeRef.current;
    previousVideoStreamModeRef.current = protocol === 'Video' ? streamMode : undefined;

    if (protocol !== 'Video' || !streamMode || !previousStreamMode || previousStreamMode === streamMode) {
      return;
    }

    const currentProductKey = trimText(form.getFieldValue('productKey'));
    if (!currentProductKey) {
      return;
    }

    // Video 的产品协议由当前视频模式决定，模式切换后不能继续复用旧 ProductKey。
    form.setFieldValue('productKey', undefined);
    if (!isProxyVideoMode(streamMode)) {
      form.setFieldValue('videoSourceType', 'LOCAL_CAMERA');
    }
    setFormSnapshot(form.getFieldsValue(true));
    message.info('视频模式已切换，请重新选择匹配当前模式的产品');
  }, [form, open, protocol, streamMode]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!supportsTenantProductSelection(protocol)) {
      setProducts([]);
      setProductLoadError('');
      setProductLoading(false);
      return;
    }
    if (!activeSession?.accessToken) {
      setProducts([]);
      setProductLoadError('');
      setProductLoading(false);
      return;
    }

    let cancelled = false;
    const loadTenantProducts = async () => {
      setProductLoading(true);
      setProductLoadError('');
      const result = await window.electronAPI.simulatorProductList(
        activeEnvironment.gatewayBaseUrl,
        activeSession.accessToken,
        {
          pageNum: 1,
          pageSize: 200,
          protocol: resolveProductProtocolQuery(protocol, streamMode),
        },
        navigator.userAgent,
      );

      if (cancelled) {
        return;
      }

      if (isSimulatorAuthInvalid(result)) {
        clearWorkspaceSession(activeEnvironment.id);
        setProducts([]);
        setProductLoadError('登录已失效，请重新登录');
        setProductLoading(false);
        return;
      }

      if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
        setProducts([]);
        setProductLoadError(result?.message || '产品列表加载失败');
        setProductLoading(false);
        return;
      }

      const records = Array.isArray(result.data?.records)
        ? result.data.records
        : Array.isArray(result.data)
          ? result.data
          : [];

      setProducts(
        records.map((item: any) => ({
          id: Number(item.id),
          productKey: String(item.productKey || ''),
          name: String(item.name || item.productKey || ''),
          protocol: String(item.protocol || ''),
          deviceAuthType: item.deviceAuthType === 'PRODUCT_SECRET' ? 'PRODUCT_SECRET' : 'DEVICE_SECRET',
        })),
      );
      setProductLoading(false);
      setProductLoadError('');
    };

    void loadTenantProducts();

    return () => {
      cancelled = true;
    };
  }, [
    activeEnvironment.gatewayBaseUrl,
    activeEnvironment.id,
    activeSession?.accessToken,
    clearWorkspaceSession,
    open,
    protocol,
    streamMode,
  ]);

  useEffect(() => {
    if (!open || !usesLocalCamera) {
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
      const records = result?.success && Array.isArray(result.data) ? result.data as LocalVideoSourceOption[] : [];
      setLocalVideoSources(records);
      setLocalVideoSourceLoading(false);
      if (records.length === 0) {
        return;
      }
      const currentCameraDevice = trimText(form.getFieldValue('cameraDevice'));
      if (currentCameraDevice && records.some((item) => item.value === currentCameraDevice)) {
        return;
      }
      form.setFieldsValue({ cameraDevice: records[0].value });
      setFormSnapshot(form.getFieldsValue(true));
    };
    void loadLocalVideoSources();

    return () => {
      cancelled = true;
    };
  }, [form, open, usesLocalCamera]);

  useEffect(() => {
    if (!open || !usesLocalCamera) {
      setLocalVideoModes([]);
      setLocalVideoModeLoading(false);
      return;
    }

    const probeCameraDevice = selectedCameraDevice || localVideoSources[0]?.value || '';
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
        form.getFieldValue('mediaWidth'),
        form.getFieldValue('mediaHeight'),
        form.getFieldValue('mediaFps'),
      );
      if (records.some((item) => item.key === currentModeKey)) {
        return;
      }
      const preferredMode = selectPreferredLocalVideoMode(records, {
        width: form.getFieldValue('mediaWidth'),
        height: form.getFieldValue('mediaHeight'),
        fps: form.getFieldValue('mediaFps'),
      });
      if (!preferredMode) {
        return;
      }
      form.setFieldsValue({
        mediaWidth: preferredMode.width,
        mediaHeight: preferredMode.height,
        mediaFps: preferredMode.fps,
      });
      setFormSnapshot(form.getFieldsValue(true));
    };
    void loadLocalVideoModes();

    return () => {
      cancelled = true;
    };
  }, [form, localVideoSources, open, selectedCameraDevice, usesLocalCamera]);

  const nextStep = async () => {
    const fields = getStepFields(protocol, currentStep, mqttAuthMode, streamMode, httpAuthMode, videoSourceType);
    if (fields.length > 0) {
      await form.validateFields(fields);
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEP_TITLES.length - 1));
  };

  const handleSubmitDevice = async () => {
    const submitFields = Array.from(new Set([
      ...getStepFields(protocol, 0, mqttAuthMode, streamMode, httpAuthMode),
      ...getStepFields(protocol, 1, mqttAuthMode, streamMode, httpAuthMode, videoSourceType),
      ...getStepFields(protocol, 2, mqttAuthMode, streamMode, httpAuthMode, videoSourceType),
    ]));
    if (submitFields.length > 0) {
      await form.validateFields(submitFields);
    }

    const values = form.getFieldsValue(true);
    const normalizedDraft = buildNormalizedDeviceDraft(values);

    if (editingDevice) {
      const nextVideoBindingKey = buildVideoBindingKey({
        protocol: normalizedDraft.protocol || editingDevice.protocol,
        streamMode: normalizedDraft.streamMode || editingDevice.streamMode,
        videoSourceType: normalizedDraft.videoSourceType || editingDevice.videoSourceType,
        gbDeviceId: normalizedDraft.gbDeviceId || '',
        sourceUrl: normalizedDraft.sourceUrl || '',
      } as Pick<SimDevice, 'protocol' | 'streamMode' | 'videoSourceType' | 'gbDeviceId' | 'sourceUrl'>);
      const currentVideoBindingKey = buildVideoBindingKey(editingDevice);
      const editingRequiresReconnect = editingDevice.status !== 'offline';
      if (editingRequiresReconnect) {
        const disconnectResult = await disconnectSimDevice(editingDevice.id, { silent: true });
        if (!disconnectResult.success) {
          addLog(
            editingDevice.id,
            editingDevice.name,
            'warn',
            `编辑前断开连接存在告警：${disconnectResult.message || 'unknown warning'}`,
          );
        }
      }
      updateDevice(editingDevice.id, {
        ...normalizedDraft,
        ...(currentVideoBindingKey !== nextVideoBindingKey ? { platformDeviceId: null } : {}),
      });
      addLog('system', 'System', 'info', `更新模拟设备：${normalizedDraft.name}`);
      message.success(editingRequiresReconnect
        ? `已更新模拟设备：${normalizedDraft.name}，当前连接已断开，请重新连接以应用新配置`
        : `已更新模拟设备：${normalizedDraft.name}`);
      if (currentVideoBindingKey !== nextVideoBindingKey) {
        addLog(editingDevice.id, normalizedDraft.name || editingDevice.name, 'info', '视频设备身份已更新，已清空旧的平台设备关联');
      }
      closeDrawer();
      return;
    }

    useSimStore.getState().addDevice(normalizedDraft);
    addLog('system', 'System', 'info', `新增模拟设备：${normalizedDraft.name}`);
    message.success(`已新增模拟设备：${normalizedDraft.name}`);
    closeDrawer();
  };

  const loadProductSecret = async (product: TenantProductRecord) => {
    if (!activeSession?.accessToken || product.deviceAuthType !== 'PRODUCT_SECRET') {
      form.setFieldValue('productSecret', '');
      setFormSnapshot(form.getFieldsValue(true));
      return;
    }

    const result = await window.electronAPI.simulatorProductSecret(
      activeEnvironment.gatewayBaseUrl,
      activeSession.accessToken,
      product.id,
      navigator.userAgent,
    );

    if (isSimulatorAuthInvalid(result)) {
      clearWorkspaceSession(activeEnvironment.id);
      form.setFieldValue('productSecret', '');
      setFormSnapshot(form.getFieldsValue(true));
      message.warning('登录已失效，请重新登录');
      return;
    }

    if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
      form.setFieldValue('productSecret', '');
      setFormSnapshot(form.getFieldsValue(true));
      message.error(result?.message || '获取 ProductSecret 失败');
      return;
    }

    form.setFieldValue('productSecret', typeof result.data === 'string' ? result.data : '');
    setFormSnapshot(form.getFieldsValue(true));
  };

  const handleProductSelect = async (productKey: string) => {
    const targetProduct = products.find((item) => item.productKey === productKey);
    if (!targetProduct) {
      return;
    }

    const nextValues: Record<string, unknown> = {
      productKey: targetProduct.productKey,
    };

    if (protocol === 'HTTP') {
      nextValues.httpAuthMode = targetProduct.deviceAuthType;
      if (targetProduct.deviceAuthType !== 'PRODUCT_SECRET') {
        nextValues.productSecret = '';
      }
    }

    if (protocol === 'MQTT') {
      nextValues.mqttAuthMode = targetProduct.deviceAuthType;
      if (targetProduct.deviceAuthType !== 'PRODUCT_SECRET') {
        nextValues.productSecret = '';
      }
    }

    form.setFieldsValue(nextValues);
    setFormSnapshot(form.getFieldsValue(true));

    if (targetProduct.deviceAuthType === 'PRODUCT_SECRET') {
      await loadProductSecret(targetProduct);
    }
  };

  const renderBasicStep = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card size="small" style={drawerPanelCardStyle}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space size={8} wrap>
            <Text strong style={{ color: '#0f172a' }}>{meta.label}</Text>
            <Tag style={{ margin: 0 }}>{activeEnvironment.name}</Tag>
            <Tag style={{ margin: 0 }} color={activeSession ? 'success' : 'default'}>
              {activeSession ? '已登录' : '未登录'}
            </Tag>
          </Space>
          <Text type="secondary">{meta.description}</Text>
          <Text type="secondary">
            {activeSession ? `${activeSession.user.tenantName} / ${activeSession.user.realName || activeSession.user.username}` : '未登录时可手工填写 ProductKey'}
          </Text>
        </Space>
      </Card>
      <Form.Item name="name" label="模拟设备名称" rules={[{ required: true, message: '请输入模拟设备名称' }]}>
        <Input placeholder="例如：华东厂区温湿度模拟器-01" maxLength={64} />
      </Form.Item>
      <Form.Item name="protocol" label="接入协议" rules={[{ required: true, message: '请选择接入协议' }]}>
        <Select
          options={Object.entries(PROTOCOL_META).map(([value, item]) => ({
            value,
            label: `${value} · ${item.label}`,
          }))}
        />
      </Form.Item>
    </Space>
  );

  const renderProductField = () => {
    if (canSelectTenantProduct) {
      return (
        <Form.Item
          name="productKey"
          label="所属产品"
          rules={[{ required: true, message: '请选择产品' }]}
          extra={productLoading ? '正在加载当前租户产品' : undefined}
        >
          <Select
            showSearch
            loading={productLoading}
            optionFilterProp="label"
            placeholder="请选择产品"
            options={products.map((item) => ({
              value: item.productKey,
              label: `${item.name} (${item.productKey}) · ${AUTH_MODE_LABELS[item.deviceAuthType]}`,
            }))}
            onChange={(value) => {
              void handleProductSelect(value);
            }}
          />
        </Form.Item>
      );
    }

    const extraText = !activeSession
      ? '未登录时请手工填写 ProductKey'
      : productLoadError
        ? `${productLoadError}，可改为手工填写`
        : !productLoading && supportsTenantProductSelection(protocol)
          ? '当前协议下未查询到产品，可手工填写'
          : undefined;

    return (
      <Form.Item
        name="productKey"
        label="ProductKey"
        rules={[{ required: true, message: '请输入 ProductKey' }]}
        extra={extraText}
      >
        <Input placeholder="例如：sensor_gateway" />
      </Form.Item>
    );
  };

  const renderThreeTuple = (baseField: string, baseLabel: string) => (
    <>
      <Form.Item name={baseField} label={baseLabel} rules={[{ required: true, message: `请输入${baseLabel}` }]}>
        <Input placeholder={activeEnvironment.protocolBaseUrl} />
      </Form.Item>
      {renderProductField()}
      <Form.Item name="deviceName" label="DeviceName" rules={[{ required: true, message: '请输入 DeviceName' }]}>
        <Input placeholder="例如：device-01" />
      </Form.Item>
      <Form.Item name="deviceSecret" label="DeviceSecret" rules={[{ required: true, message: '请输入 DeviceSecret' }]}>
        <Input.Password placeholder="输入设备密钥" />
      </Form.Item>
    </>
  );

  const renderLocatorList = (description: string) => (
    <Card size="small" style={drawerSectionCardStyle}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Text strong style={{ color: '#0f172a' }}>设备标识</Text>
        <Paragraph style={{ margin: 0, color: '#64748b' }}>{description}</Paragraph>
        <Form.List name="locators">
          {(fields, { add, remove }) => (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {fields.map((field, index) => (
                <Card key={field.key} size="small" style={drawerInnerCardStyle}>
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Text strong style={{ color: '#0f172a' }}>{`标识 ${index + 1}`}</Text>
                      <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>
                        删除
                      </Button>
                    </Space>
                    <Row gutter={12}>
                      <Col span={8}>
                        <Form.Item name={[field.name, 'locatorType']} label="标识类型" rules={[{ required: true, message: '请选择标识类型' }]} style={{ marginBottom: 0 }}>
                          <Select showSearch optionFilterProp="label" options={LOCATOR_TYPE_OPTIONS} placeholder="选择类型" />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name={[field.name, 'locatorValue']} label="标识值" rules={[{ required: true, message: '请输入标识值' }]} style={{ marginBottom: 0 }}>
                          <Input placeholder="输入设备真实上报的标识值" maxLength={128} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item name={[field.name, 'primaryLocator']} label="主标识" valuePropName="checked" style={{ marginBottom: 0 }}>
                          <Switch checkedChildren="是" unCheckedChildren="否" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Space>
                </Card>
              ))}
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ locatorType: 'IMEI', primaryLocator: fields.length === 0 })}>
                新增设备标识
              </Button>
            </Space>
          )}
        </Form.List>
      </Space>
    </Card>
  );

  const renderHttpAccessStep = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Form.Item name="httpBaseUrl" label="HTTP 服务地址" rules={[{ required: true, message: '请输入 HTTP 服务地址' }]}>
        <Input placeholder={activeEnvironment.protocolBaseUrl} />
      </Form.Item>
      {renderProductField()}
      <Form.Item name="deviceName" label="DeviceName" rules={[{ required: true, message: '请输入 DeviceName' }]}>
        <Input placeholder="例如：device-01" />
      </Form.Item>
      <Form.Item name="httpAuthMode" label="认证方式">
        <Radio.Group>
          <Radio.Button value="DEVICE_SECRET">一机一密</Radio.Button>
          <Radio.Button value="PRODUCT_SECRET">一型一密</Radio.Button>
        </Radio.Group>
      </Form.Item>
      {httpAuthMode === 'PRODUCT_SECRET' ? (
        <>
          <Form.Item name="httpRegisterBaseUrl" label="动态注册服务地址" rules={[{ required: true, message: '请输入动态注册服务地址' }]}>
            <Input placeholder={activeEnvironment.protocolBaseUrl} />
          </Form.Item>
          <Form.Item name="productSecret" label="ProductSecret" rules={[{ required: true, message: '请输入 ProductSecret' }]}>
            <Input.Password placeholder="输入产品密钥" />
          </Form.Item>
          {renderLocatorList('需要自动注册时再补充这些标识。')}
        </>
      ) : (
        <Form.Item name="deviceSecret" label="DeviceSecret" rules={[{ required: true, message: '请输入 DeviceSecret' }]}>
          <Input.Password placeholder="输入设备密钥" />
        </Form.Item>
      )}
    </Space>
  );

  const renderAccessStep = () => {
    switch (protocol) {
      case 'HTTP':
        return renderHttpAccessStep();
      case 'MQTT':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {renderProductField()}
            <Form.Item name="deviceName" label="DeviceName" rules={[{ required: true, message: '请输入 DeviceName' }]}><Input /></Form.Item>
            <Form.Item name="mqttAuthMode" label="认证方式">
              <Radio.Group>
                <Radio.Button value="DEVICE_SECRET">一机一密</Radio.Button>
                <Radio.Button value="PRODUCT_SECRET">一型一密</Radio.Button>
              </Radio.Group>
            </Form.Item>
            {mqttAuthMode === 'PRODUCT_SECRET' ? (
              <>
                <Form.Item name="mqttRegisterBaseUrl" label="动态注册服务地址" rules={[{ required: true, message: '请输入动态注册服务地址' }]}><Input placeholder={activeEnvironment.protocolBaseUrl} /></Form.Item>
                <Form.Item name="productSecret" label="ProductSecret" rules={[{ required: true, message: '请输入 ProductSecret' }]}><Input.Password /></Form.Item>
                {renderLocatorList('需要自动注册时再补充这些标识。')}
              </>
            ) : (
              <Form.Item name="deviceSecret" label="DeviceSecret" rules={[{ required: true, message: '请输入 DeviceSecret' }]}><Input.Password /></Form.Item>
            )}
            <Form.Item name="mqttBrokerUrl" label="MQTT Broker 地址" rules={[{ required: true, message: '请输入 MQTT Broker 地址' }]}><Input placeholder={activeEnvironment.mqttBrokerUrl} /></Form.Item>
          </Space>
        );
      case 'Video':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {renderProductField()}
            <Form.Item name="streamMode" label="视频模式">
              <Radio.Group>
                <Radio.Button value="GB28181">GB28181</Radio.Button>
                <Radio.Button value="RTSP">RTSP</Radio.Button>
                <Radio.Button value="RTMP">RTMP</Radio.Button>
              </Radio.Group>
            </Form.Item>
            {isProxyVideoMode(streamMode) ? (
              <Form.Item name="videoSourceType" label="媒体源">
                <Radio.Group>
                  <Radio.Button value="LOCAL_CAMERA">本地摄像头</Radio.Button>
                  <Radio.Button value="REMOTE_SOURCE">外部源地址</Radio.Button>
                </Radio.Group>
              </Form.Item>
            ) : null}
            {isProxyVideoMode(streamMode) ? (
              <>
                {videoSourceType === 'REMOTE_SOURCE' ? (
                  <Form.Item
                    name="sourceUrl"
                    label={getVideoSourceFieldLabel(streamMode)}
                    rules={[
                      { required: true, message: `请输入${getVideoSourceFieldLabel(streamMode)}` },
                      {
                        validator: async (_, value) => {
                          if (!trimText(value)) {
                            return;
                          }
                          parseVideoSourceUrl(streamMode, value);
                        },
                      },
                    ]}
                  >
                    <Input placeholder={streamMode === 'RTMP' ? 'rtmp://127.0.0.1/live/camera-001' : 'rtsp://127.0.0.1:554/live/camera-001'} />
                  </Form.Item>
                ) : null}
                <Form.Item label="平台接入地址">
                  <Input
                    readOnly
                    value={videoSourceType === 'LOCAL_CAMERA'
                      ? buildAutoLocalSourcePreview(activeEnvironment.gatewayBaseUrl, streamMode, trimText(formSnapshot.name))
                      : (sourcePreview ? `${sourcePreview.host}:${sourcePreview.port}` : '')}
                    placeholder={videoSourceType === 'LOCAL_CAMERA'
                      ? '根据当前环境自动生成本地推流地址'
                      : '根据源地址自动解析 IP 和端口'}
                  />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item name="gbDeviceId" label="国标设备 ID" rules={[{ required: true, message: '请输入国标设备 ID' }]}><Input /></Form.Item>
                <Form.Item name="gbDomain" label="国标域" rules={[{ required: true, message: '请输入国标域' }]}><Input /></Form.Item>
                <Form.Item name="ip" label="设备 IP"><Input placeholder="默认 127.0.0.1" /></Form.Item>
              </>
            )}
            <Form.Item
              label="DeviceName"
              extra={isProxyVideoMode(streamMode) ? 'RTSP / RTMP 默认复用模拟设备名称作为 DeviceName。' : 'GB28181 默认复用国标设备 ID 作为 DeviceName。'}
            >
              <Input
                readOnly
                value={resolveVideoDeviceName({
                  name: trimText(formSnapshot.name),
                  gbDeviceId: trimText(formSnapshot.gbDeviceId),
                  streamMode,
                })}
                placeholder={isProxyVideoMode(streamMode) ? '创建时自动使用模拟设备名称' : '创建时自动使用国标设备 ID'}
              />
            </Form.Item>
          </Space>
        );
      case 'CoAP':
        return <Space direction="vertical" size={16} style={{ width: '100%' }}>{renderThreeTuple('coapBaseUrl', 'CoAP Bridge 地址')}</Space>;
      case 'SNMP':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Form.Item name="snmpConnectorUrl" label="Connector 地址" rules={[{ required: true, message: '请输入 Connector 地址' }]}><Input placeholder={activeEnvironment.protocolBaseUrl} /></Form.Item>
            <Form.Item name="snmpHost" label="目标主机" rules={[{ required: true, message: '请输入目标主机' }]}><Input /></Form.Item>
            <Row gutter={12}>
              <Col span={8}><Form.Item name="snmpPort" label="端口"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="snmpVersion" label="版本"><Select options={[{ value: 1, label: 'v1' }, { value: 2, label: 'v2c' }, { value: 3, label: 'v3' }]} /></Form.Item></Col>
              <Col span={8}><Form.Item name="snmpCommunity" label="Community"><Input /></Form.Item></Col>
            </Row>
          </Space>
        );
      case 'Modbus':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Form.Item name="modbusConnectorUrl" label="Connector 地址" rules={[{ required: true, message: '请输入 Connector 地址' }]}><Input placeholder={activeEnvironment.protocolBaseUrl} /></Form.Item>
            <Form.Item name="modbusHost" label="目标主机" rules={[{ required: true, message: '请输入目标主机' }]}><Input /></Form.Item>
            <Row gutter={12}>
              <Col span={8}><Form.Item name="modbusPort" label="端口"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="modbusSlaveId" label="从站 ID"><InputNumber min={1} max={247} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="modbusMode" label="模式"><Select options={[{ value: 'TCP', label: 'Modbus TCP' }, { value: 'RTU_OVER_TCP', label: 'RTU over TCP' }]} /></Form.Item></Col>
            </Row>
          </Space>
        );
      case 'WebSocket':
        return <Form.Item name="wsEndpoint" label="WebSocket 地址" rules={[{ required: true, message: '请输入 WebSocket 地址' }]}><Input placeholder={String(buildEnvironmentDeviceDefaults(activeEnvironment).wsEndpoint)} /></Form.Item>;
      case 'TCP':
        return (
          <>
            <Form.Item name="tcpHost" label="TCP 主机" rules={[{ required: true, message: '请输入 TCP 主机' }]}><Input /></Form.Item>
            <Form.Item name="tcpPort" label="TCP 端口"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item>
          </>
        );
      case 'UDP':
        return (
          <>
            <Form.Item name="udpHost" label="UDP 主机" rules={[{ required: true, message: '请输入 UDP 主机' }]}><Input /></Form.Item>
            <Form.Item name="udpPort" label="UDP 端口"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item>
          </>
        );
      case 'LoRaWAN':
        return (
          <>
            <Form.Item name="loraWebhookUrl" label="Webhook 地址" rules={[{ required: true, message: '请输入 Webhook 地址' }]}><Input placeholder={String(buildEnvironmentDeviceDefaults(activeEnvironment).loraWebhookUrl)} /></Form.Item>
            <Form.Item name="loraDevEui" label="DevEUI" rules={[{ required: true, message: '请输入 DevEUI' }]}><Input style={{ fontFamily: 'monospace' }} /></Form.Item>
            <Form.Item name="loraAppId" label="应用 ID"><Input /></Form.Item>
            <Form.Item name="loraFPort" label="fPort"><InputNumber min={1} max={255} style={{ width: '100%' }} /></Form.Item>
          </>
        );
      default:
        return <Space direction="vertical" size={16} style={{ width: '100%' }}>{renderThreeTuple('httpBaseUrl', 'HTTP 接入地址')}</Space>;
    }
  };

  const renderAdvancedStep = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {protocol === 'MQTT' ? (
        <Card size="small" title="MQTT 扩展配置" style={drawerSectionCardStyle}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="mqttClientId" label="Client ID"><Input placeholder="留空自动生成" /></Form.Item></Col>
            <Col span={12}><Form.Item name="mqttUsername" label="用户名"><Input placeholder="留空自动生成" /></Form.Item></Col>
          </Row>
          <Form.Item name="mqttPassword" label="密码"><Input.Password placeholder="留空默认使用 DeviceSecret" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="mqttClean" label="清理会话" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={12}><Form.Item name="mqttKeepalive" label="Keepalive（秒）"><InputNumber min={10} max={600} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Divider orientation="left">遗嘱消息</Divider>
          <Form.Item name="mqttWillTopic" label="遗嘱 Topic"><Input /></Form.Item>
          <Form.Item name="mqttWillPayload" label="遗嘱 Payload"><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="mqttWillQos" label="遗嘱 QoS"><Select options={[{ value: 0, label: 'QoS 0' }, { value: 1, label: 'QoS 1' }, { value: 2, label: 'QoS 2' }]} /></Form.Item></Col>
            <Col span={12}><Form.Item name="mqttWillRetain" label="遗嘱 Retain" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
        </Card>
      ) : null}

      {protocol === 'Video' ? (
        <>
          <Card size="small" title="设备信息" style={drawerSectionCardStyle}>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="manufacturer" label="厂商"><Input placeholder="如：Firefly-Simulator" /></Form.Item></Col>
              <Col span={12}><Form.Item name="model" label="型号"><Input placeholder="如：Virtual-Camera" /></Form.Item></Col>
            </Row>
            <Form.Item name="firmware" label="固件版本"><Input placeholder="如：1.0.0" /></Form.Item>
          </Card>
          {usesLocalCamera ? (
            <Card size="small" title="本地采集" style={drawerSectionCardStyle}>
              <Row gutter={12}>
                <Col span={24}>
                  <Form.Item name="cameraDevice" label="摄像头设备">
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
                        form.setFieldsValue({
                          mediaWidth: 1280,
                          mediaHeight: 720,
                          mediaFps: 30,
                        });
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                label="采集模式"
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
                    form.setFieldsValue({
                      mediaWidth: mode.width,
                      mediaHeight: mode.height,
                      mediaFps: mode.fps,
                    });
                    setFormSnapshot(form.getFieldsValue(true));
                  }}
                />
              </Form.Item>
            </Card>
          ) : null}
          {streamMode === 'GB28181' ? (
            <>
          <Card size="small" title="SIP 配置" style={drawerSectionCardStyle}>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="sipServerIp" label="SIP 服务 IP" rules={[{ required: true, message: '请输入 SIP 服务 IP' }]}><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="sipServerPort" label="SIP 服务端口" rules={[{ required: true, message: '请输入 SIP 服务端口' }]}><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="sipServerId" label="SIP 服务 ID" rules={[{ required: true, message: '请输入 SIP 服务 ID' }]}><Input /></Form.Item></Col>
              <Col span={12}><Form.Item name="sipLocalPort" label="本地 SIP 端口" rules={[{ required: true, message: '请输入本地 SIP 端口' }]}><InputNumber min={1024} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}><Form.Item name="sipKeepaliveInterval" label="心跳间隔（秒）"><InputNumber min={10} max={300} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="sipTransport" label="传输协议"><Radio.Group><Radio.Button value="UDP">UDP</Radio.Button><Radio.Button value="TCP">TCP</Radio.Button></Radio.Group></Form.Item></Col>
            </Row>
            <Form.Item
              name="sipPassword"
              label="SIP 密码"
              rules={[{ required: true, message: '请输入 SIP 密码' }]}
            >
              <Input.Password placeholder="请输入设备级 SIP 密码" />
            </Form.Item>
          </Card>
          <Card size="small" title="通道配置" style={drawerSectionCardStyle}>
            <Form.List name="sipChannels">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Card key={key} size="small" style={{ ...drawerInnerCardStyle, marginBottom: 12 }} title={`通道 ${name + 1}`} extra={<MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />}>
                      <Row gutter={12}>
                        <Col span={16}><Form.Item {...restField} name={[name, 'channelId']} label="通道 ID" rules={[{ required: true, message: '请输入通道 ID' }]}><Input size="small" /></Form.Item></Col>
                        <Col span={8}><Form.Item {...restField} name={[name, 'status']} label="状态"><Select size="small" options={[{ value: 'ON', label: '在线' }, { value: 'OFF', label: '离线' }]} /></Form.Item></Col>
                      </Row>
                      <Row gutter={12}>
                        <Col span={12}><Form.Item {...restField} name={[name, 'name']} label="通道名称" rules={[{ required: true, message: '请输入通道名称' }]}><Input size="small" /></Form.Item></Col>
                        <Col span={12}><Form.Item {...restField} name={[name, 'ptzType']} label="云台类型"><Select size="small" options={[{ value: 0, label: '未知' }, { value: 1, label: '球机' }, { value: 2, label: '半球' }, { value: 3, label: '固定枪机' }]} /></Form.Item></Col>
                      </Row>
                    </Card>
                  ))}
                  <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const gbDeviceId = form.getFieldValue('gbDeviceId') || '34020000001320000001';
                      const index = fields.length + 1;
                      add({ channelId: gbDeviceId.slice(0, 14) + '131' + String(index).padStart(3, '0'), name: `通道 ${index}`, status: 'ON', ptzType: 1 });
                    }}
                  >
                    新增通道
                  </Button>
                </>
              )}
            </Form.List>
          </Card>
            </>
          ) : (
            <Card size="small" title="源地址摘要" style={drawerSectionCardStyle}>
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: 'sourceUrl',
                    label: getVideoSourceFieldLabel(streamMode),
                    children: <Text>{videoSourceType === 'LOCAL_CAMERA'
                      ? buildAutoLocalSourcePreview(activeEnvironment.gatewayBaseUrl, streamMode, trimText(formSnapshot.name))
                      : (trimText(formSnapshot.sourceUrl) || '-')}</Text>,
                  },
                  {
                    key: 'endpoint',
                    label: '平台接入地址',
                    children: <Text>{sourcePreview ? `${sourcePreview.host}:${sourcePreview.port}` : '-'}</Text>,
                  },
                ]}
              />
            </Card>
          )}
        </>
      ) : null}

      {protocol === 'WebSocket' ? (
        <Card size="small" title="WebSocket 连接参数" style={drawerSectionCardStyle}>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="wsDeviceId" label="设备标识"><Input placeholder="可选" /></Form.Item></Col>
            <Col span={8}><Form.Item name="wsProductId" label="产品标识"><Input placeholder="可选" /></Form.Item></Col>
            <Col span={8}><Form.Item name="wsTenantId" label="租户标识"><Input placeholder="可选" /></Form.Item></Col>
          </Row>
        </Card>
      ) : null}

      <Card size="small" title="配置摘要" style={drawerPanelCardStyle}>
        <Descriptions
          size="small"
          column={1}
          items={buildSummary(formSnapshot, products, activeEnvironment.gatewayBaseUrl).map((item) => ({
            key: item.key,
            label: item.label,
            children: <Text>{String(item.value)}</Text>,
          }))}
        />
      </Card>
    </Space>
  );

  return (
    <Drawer
      title={(
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 18, color: '#0f172a' }}>{drawerTitle}</Text>
          <Text style={{ fontSize: 12, color: '#64748b' }}>{activeEnvironment.name}</Text>
        </Space>
      )}
      open={open}
      width={720}
      destroyOnClose
      onClose={closeDrawer}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Text style={{ color: '#64748b' }}>
            第 {currentStep + 1} 步，共 {STEP_TITLES.length} 步
          </Text>
          <Space>
            <Button onClick={closeDrawer}>取消</Button>
            <Button disabled={currentStep === 0} onClick={() => setCurrentStep((prev) => prev - 1)}>上一步</Button>
            {currentStep < STEP_TITLES.length - 1 ? (
              <Button type="primary" onClick={() => void nextStep()}>下一步</Button>
            ) : (
              <Button type="primary" onClick={() => void handleSubmitDevice()}>{submitButtonLabel}</Button>
            )}
          </Space>
        </Space>
      }
      styles={{
        header: {
          borderBottom: '1px solid rgba(226,232,240,0.9)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,251,255,0.98) 100%)',
        },
        body: {
          paddingBottom: 24,
          background: 'linear-gradient(180deg, #f6f9fc 0%, #eef4f8 100%)',
        },
        footer: {
          borderTop: '1px solid rgba(226,232,240,0.9)',
          background: 'rgba(255,255,255,0.96)',
          padding: '16px 24px',
        },
      }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={buildInitialValues(activeEnvironment)}
        onValuesChange={() => setFormSnapshot(form.getFieldsValue(true))}
      >
        <Card size="small" style={{ ...drawerPanelCardStyle, marginBottom: 24 }}>
          <Steps
            current={currentStep}
            items={STEP_TITLES.map((title) => ({ title }))}
            onChange={(next) => {
              if (next <= currentStep) {
                setCurrentStep(next);
              }
            }}
          />
        </Card>
        {currentStep === 0 ? renderBasicStep() : null}
        {currentStep === 1 ? renderAccessStep() : null}
        {currentStep === 2 ? renderAdvancedStep() : null}
      </Form>
    </Drawer>
  );
}
