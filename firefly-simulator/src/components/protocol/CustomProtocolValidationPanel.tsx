import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { ApiOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import type { SimDevice } from '../../store';
import { useSimStore } from '../../store';
import {
  getActiveEnvironment,
  isSimulatorAuthInvalid,
  useSimWorkspaceStore,
} from '../../workspaceStore';
import { resolveMqttIdentity } from '../../utils/mqtt';
import type { MqttMsg } from './MqttControlPanel';
import type { TcpUdpMsg } from './TcpUdpControlPanel';
import type { WsMsg } from './WebSocketControlPanel';

const { Text } = Typography;

type UplinkPayloadEncoding = 'TEXT' | 'JSON' | 'HEX' | 'BASE64';

interface ProductRecord {
  id: number;
  productKey: string;
  name: string;
}

interface ProtocolParserRecord {
  id: number;
  productId?: number | null;
  scopeType: string;
  protocol: string;
  transport: string;
  direction: string;
  status: string;
  parserMode?: string;
  currentVersion?: number;
  publishedVersion?: number | null;
}

interface DebugIdentity {
  mode?: string;
  productKey?: string;
  deviceName?: string;
  locatorType?: string;
  locatorValue?: string;
}

interface DebugMessage {
  messageId?: string;
  type?: string;
  topic?: string;
  payload?: Record<string, unknown>;
  timestamp?: number;
  deviceName?: string;
}

interface DebugResult {
  success: boolean;
  matchedVersion?: number;
  identity?: DebugIdentity | null;
  messages?: DebugMessage[];
  costMs?: number;
  errorMessage?: string;
}

interface EncodeDebugResult {
  success: boolean;
  matchedVersion?: number;
  topic?: string;
  payloadEncoding?: string;
  payloadText?: string;
  payloadHex?: string;
  headers?: Record<string, string>;
  costMs?: number;
  errorMessage?: string;
}

interface PayloadSample {
  id: string;
  label: string;
  payload: string;
  topic?: string;
}

interface ParserContext {
  protocol: string;
  transport: string;
  productProtocolQuery: string;
  defaultUplinkTopic: string;
  defaultDownlinkTopic: string;
  defaultUplinkEncoding: UplinkPayloadEncoding;
}

interface Props {
  device: SimDevice;
  mqttMessages?: MqttMsg[];
  wsMessages?: WsMsg[];
  tcpMessages?: TcpUdpMsg[];
}

function trimText(value?: string | null) {
  return (value ?? '').trim();
}

function supportsCustomProtocolValidation(protocol?: SimDevice['protocol']) {
  return protocol === 'HTTP'
    || protocol === 'MQTT'
    || protocol === 'CoAP'
    || protocol === 'WebSocket'
    || protocol === 'TCP'
    || protocol === 'UDP';
}

function resolveParserContext(device: SimDevice): ParserContext | null {
  switch (device.protocol) {
    case 'HTTP':
      return {
        protocol: 'HTTP',
        transport: 'HTTP',
        productProtocolQuery: 'HTTP',
        defaultUplinkTopic: '/data/report',
        defaultDownlinkTopic: '/command/send',
        defaultUplinkEncoding: 'JSON',
      };
    case 'MQTT':
      return {
        protocol: 'MQTT',
        transport: 'MQTT',
        productProtocolQuery: 'MQTT',
        defaultUplinkTopic: '/up/property',
        defaultDownlinkTopic: '/down/property',
        defaultUplinkEncoding: 'JSON',
      };
    case 'CoAP':
      return {
        protocol: 'COAP',
        transport: 'COAP',
        productProtocolQuery: 'COAP',
        defaultUplinkTopic: '/coap/report',
        defaultDownlinkTopic: '/downstream',
        defaultUplinkEncoding: 'JSON',
      };
    case 'WebSocket':
      return {
        protocol: 'WEBSOCKET',
        transport: 'WEBSOCKET',
        productProtocolQuery: 'CUSTOM',
        defaultUplinkTopic: '/ws/data',
        defaultDownlinkTopic: '/downstream',
        defaultUplinkEncoding: 'JSON',
      };
    case 'TCP':
      return {
        protocol: 'TCP_UDP',
        transport: 'TCP',
        productProtocolQuery: 'CUSTOM',
        defaultUplinkTopic: '/tcp/data',
        defaultDownlinkTopic: '/downstream',
        defaultUplinkEncoding: 'TEXT',
      };
    case 'UDP':
      return {
        protocol: 'TCP_UDP',
        transport: 'UDP',
        productProtocolQuery: 'CUSTOM',
        defaultUplinkTopic: '/udp/data',
        defaultDownlinkTopic: '/downstream',
        defaultUplinkEncoding: 'TEXT',
      };
    default:
      return null;
  }
}

function buildDefaultUplinkPayload(transport: string) {
  const transportKey = transport.toUpperCase();
  if (transportKey === 'TCP' || transportKey === 'UDP') {
    return 'temp=23.6,humidity=48';
  }
  return JSON.stringify({
    deviceName: 'demo-device-01',
    timestamp: 1710000000000,
    properties: {
      temperature: 23.6,
      humidity: 48,
    },
  }, null, 2);
}

function buildDefaultDownlinkPayload() {
  return JSON.stringify({
    payload: {
      power: true,
      brightness: 80,
    },
  }, null, 2);
}

function buildDefaultUplinkHeaders(device: SimDevice, context: ParserContext) {
  if (context.transport === 'HTTP') {
    return JSON.stringify({
      'content-type': 'application/json',
      'x-request-id': 'simulator-debug-http',
    }, null, 2);
  }
  if (context.transport === 'MQTT') {
    const identity = resolveMqttIdentity(device);
    return JSON.stringify({
      clientId: identity.clientId,
      qos: '1',
    }, null, 2);
  }
  return '{}';
}

function parseOptionalStringMap(raw: string, fieldName: string) {
  const source = raw.trim();
  if (!source) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${fieldName}必须是合法的 JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldName}必须是 JSON 对象`);
  }
  return parsed as Record<string, string>;
}

function parseRequiredObject(raw: string, fieldName: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim() || '{}');
  } catch {
    throw new Error(`${fieldName}必须是合法的 JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldName}必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function formatSampleTime(labelPrefix: string, timestamp?: number) {
  if (!timestamp) {
    return labelPrefix;
  }
  return `${labelPrefix} ${new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })}`;
}

function resolveSamplePayload(rawPayload: string): { encoding: UplinkPayloadEncoding; payload: string } {
  if (rawPayload.startsWith('base64:')) {
    return {
      encoding: 'BASE64',
      payload: rawPayload.slice('base64:'.length),
    };
  }
  try {
    JSON.parse(rawPayload);
    return {
      encoding: 'JSON',
      payload: rawPayload,
    };
  } catch {
    return {
      encoding: 'TEXT',
      payload: rawPayload,
    };
  }
}

function buildParserOptionLabel(record: ProtocolParserRecord) {
  const scopeLabel = record.scopeType === 'TENANT' ? '租户默认级' : '产品级';
  const directionLabel = record.direction === 'DOWNLINK' ? '下行' : '上行';
  const versionLabel = record.publishedVersion ?? record.currentVersion;
  return `${scopeLabel} · ${directionLabel} · ${record.status}${versionLabel ? ` · v${versionLabel}` : ''}`;
}

export default function CustomProtocolValidationPanel({
  device,
  mqttMessages = [],
  wsMessages = [],
  tcpMessages = [],
}: Props) {
  const addLog = useSimStore((state) => state.addLog);
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const clearWorkspaceSession = useSimWorkspaceStore((state) => state.clearSession);

  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  );
  const activeSession = sessions[activeEnvironment.id];
  const parserContext = useMemo(() => resolveParserContext(device), [device.protocol]);
  const productKey = trimText(device.productKey);
  const currentDeviceName = trimText(device.deviceName);
  const locatorCount = Array.isArray(device.locators) ? device.locators.length : 0;
  const isOnline = device.status === 'online';

  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState('');
  const [currentProduct, setCurrentProduct] = useState<ProductRecord | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [parserLoading, setParserLoading] = useState(false);
  const [parserError, setParserError] = useState('');
  const [parserRecords, setParserRecords] = useState<ProtocolParserRecord[]>([]);
  const [selectedUplinkParserId, setSelectedUplinkParserId] = useState<number | undefined>(undefined);
  const [selectedDownlinkParserId, setSelectedDownlinkParserId] = useState<number | undefined>(undefined);

  const [uplinkTopic, setUplinkTopic] = useState('');
  const [uplinkPayloadEncoding, setUplinkPayloadEncoding] = useState<UplinkPayloadEncoding>('JSON');
  const [uplinkPayload, setUplinkPayload] = useState('');
  const [uplinkHeadersText, setUplinkHeadersText] = useState('{}');
  const [uplinkSessionId, setUplinkSessionId] = useState('');
  const [uplinkRemoteAddress, setUplinkRemoteAddress] = useState('');
  const [uplinkSubmitting, setUplinkSubmitting] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);

  const [downlinkTopic, setDownlinkTopic] = useState('');
  const [downlinkMessageType, setDownlinkMessageType] = useState('PROPERTY_SET');
  const [downlinkDeviceName, setDownlinkDeviceName] = useState('');
  const [downlinkPayloadText, setDownlinkPayloadText] = useState(buildDefaultDownlinkPayload());
  const [downlinkHeadersText, setDownlinkHeadersText] = useState('{}');
  const [downlinkSessionId, setDownlinkSessionId] = useState('');
  const [downlinkRemoteAddress, setDownlinkRemoteAddress] = useState('');
  const [downlinkSubmitting, setDownlinkSubmitting] = useState(false);
  const [encodeResult, setEncodeResult] = useState<EncodeDebugResult | null>(null);

  useEffect(() => {
    if (!parserContext) {
      return;
    }
    setUplinkTopic(parserContext.defaultUplinkTopic);
    setUplinkPayloadEncoding(parserContext.defaultUplinkEncoding);
    setUplinkPayload(buildDefaultUplinkPayload(parserContext.transport));
    setUplinkHeadersText(buildDefaultUplinkHeaders(device, parserContext));
    setUplinkSessionId('');
    setUplinkRemoteAddress('');
    setDebugResult(null);

    setDownlinkTopic(parserContext.defaultDownlinkTopic);
    setDownlinkMessageType('PROPERTY_SET');
    setDownlinkDeviceName(currentDeviceName);
    setDownlinkPayloadText(buildDefaultDownlinkPayload());
    setDownlinkHeadersText('{}');
    setDownlinkSessionId('');
    setDownlinkRemoteAddress('');
    setEncodeResult(null);
  }, [
    currentDeviceName,
    device.id,
    device.mqttClientId,
    device.name,
    parserContext,
  ]);

  useEffect(() => {
    if (!parserContext || !supportsCustomProtocolValidation(device.protocol)) {
      setCurrentProduct(null);
      setProductError('');
      setProductLoading(false);
      return;
    }
    if (!activeSession?.accessToken || !productKey) {
      setCurrentProduct(null);
      setProductError(productKey ? '' : '请先配置 ProductKey');
      setProductLoading(false);
      return;
    }

    let cancelled = false;
    const loadCurrentProduct = async () => {
      setProductLoading(true);
      setProductError('');

      // 模拟器里允许手工录入 ProductKey，因此这里按业务唯一键回查产品，
      // 并在协议筛选查不到时再退回全量查询，避免把“手填 ProductKey”误判成无效配置。
      const loadByProtocol = async (protocol?: string) => window.electronAPI.simulatorProductList(
        activeEnvironment.gatewayBaseUrl,
        activeSession.accessToken,
        {
          pageNum: 1,
          pageSize: 50,
          keyword: productKey,
          protocol,
        },
        navigator.userAgent,
      );

      let result = await loadByProtocol(parserContext.productProtocolQuery);
      if (isSimulatorAuthInvalid(result)) {
        clearWorkspaceSession(activeEnvironment.id);
        if (!cancelled) {
          setCurrentProduct(null);
          setProductError('登录已失效，请重新登录');
          setProductLoading(false);
        }
        return;
      }

      if ((!result?.success || (typeof result.code === 'number' && result.code !== 0))
        && parserContext.productProtocolQuery) {
        result = await loadByProtocol(undefined);
      }

      if (cancelled) {
        return;
      }

      if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
        setCurrentProduct(null);
        setProductError(result?.message || '产品信息加载失败');
        setProductLoading(false);
        return;
      }

      const records = Array.isArray(result.data?.records)
        ? result.data.records
        : Array.isArray(result.data)
          ? result.data
          : [];
      const matched = records.find((item: any) => trimText(item?.productKey) === productKey);
      if (!matched) {
        setCurrentProduct(null);
        setProductError('当前环境下未找到匹配 ProductKey 的产品');
        setProductLoading(false);
        return;
      }

      setCurrentProduct({
        id: Number(matched.id),
        productKey: String(matched.productKey || ''),
        name: String(matched.name || matched.productKey || ''),
      });
      setProductError('');
      setProductLoading(false);
    };

    void loadCurrentProduct();

    return () => {
      cancelled = true;
    };
  }, [
    activeEnvironment.gatewayBaseUrl,
    activeEnvironment.id,
    activeSession?.accessToken,
    clearWorkspaceSession,
    device.protocol,
    parserContext,
    productKey,
    reloadNonce,
  ]);

  useEffect(() => {
    if (!parserContext || !currentProduct?.id || !activeSession?.accessToken) {
      setParserRecords([]);
      setParserError('');
      setParserLoading(false);
      return;
    }

    let cancelled = false;
    const loadParserRecords = async () => {
      setParserLoading(true);
      setParserError('');
      const result = await window.electronAPI.simulatorProtocolParserList(
        activeEnvironment.gatewayBaseUrl,
        activeSession.accessToken,
        {
          pageNum: 1,
          pageSize: 100,
          productId: currentProduct.id,
          protocol: parserContext.protocol,
          transport: parserContext.transport,
        },
        navigator.userAgent,
      );

      if (cancelled) {
        return;
      }

      if (isSimulatorAuthInvalid(result)) {
        clearWorkspaceSession(activeEnvironment.id);
        setParserRecords([]);
        setParserError('登录已失效，请重新登录');
        setParserLoading(false);
        return;
      }

      if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
        setParserRecords([]);
        setParserError(result?.message || '协议规则加载失败');
        setParserLoading(false);
        return;
      }

      const pageData = result.data?.data || result.data;
      const records = Array.isArray(pageData?.records)
        ? pageData.records
        : Array.isArray(pageData)
          ? pageData
          : [];

      setParserRecords(records.map((item: any) => ({
        id: Number(item.id),
        productId: item.productId == null ? null : Number(item.productId),
        scopeType: String(item.scopeType || ''),
        protocol: String(item.protocol || ''),
        transport: String(item.transport || ''),
        direction: String(item.direction || ''),
        status: String(item.status || ''),
        parserMode: String(item.parserMode || ''),
        currentVersion: item.currentVersion == null ? undefined : Number(item.currentVersion),
        publishedVersion: item.publishedVersion == null ? null : Number(item.publishedVersion),
      })));
      setParserError('');
      setParserLoading(false);
    };

    void loadParserRecords();

    return () => {
      cancelled = true;
    };
  }, [
    activeEnvironment.gatewayBaseUrl,
    activeEnvironment.id,
    activeSession?.accessToken,
    clearWorkspaceSession,
    currentProduct?.id,
    parserContext,
    reloadNonce,
  ]);

  const uplinkParsers = useMemo(
    () => parserRecords.filter((item) => item.direction === 'UPLINK'),
    [parserRecords],
  );
  const downlinkParsers = useMemo(
    () => parserRecords.filter((item) => item.direction === 'DOWNLINK'),
    [parserRecords],
  );

  useEffect(() => {
    setSelectedUplinkParserId((current) => (
      current && uplinkParsers.some((item) => item.id === current)
        ? current
        : uplinkParsers[0]?.id
    ));
  }, [uplinkParsers]);

  useEffect(() => {
    setSelectedDownlinkParserId((current) => (
      current && downlinkParsers.some((item) => item.id === current)
        ? current
        : downlinkParsers[0]?.id
    ));
  }, [downlinkParsers]);

  const recentUplinkSamples = useMemo<PayloadSample[]>(() => {
    // 直接复用最近一次真实发送报文，减少联调时重复拷贝 payload 的成本。
    if (device.protocol === 'MQTT') {
      return mqttMessages
        .filter((item) => item.dir === 'pub')
        .slice(-3)
        .reverse()
        .map((item, index) => ({
          id: `mqtt-pub-${index}-${item.ts}`,
          label: `${item.topic} · ${formatSampleTime('上行', item.ts)}`,
          payload: item.payload,
          topic: item.topic,
        }));
    }
    if (device.protocol === 'WebSocket') {
      return wsMessages
        .filter((item) => item.dir === 'tx')
        .slice(-3)
        .reverse()
        .map((item, index) => ({
          id: `ws-tx-${index}-${item.ts}`,
          label: formatSampleTime('最近发送', item.ts),
          payload: item.payload,
        }));
    }
    if (device.protocol === 'TCP' || device.protocol === 'UDP') {
      return tcpMessages
        .filter((item) => item.dir === 'tx')
        .slice(-3)
        .reverse()
        .map((item, index) => ({
          id: `tcpudp-tx-${index}-${item.ts}`,
          label: formatSampleTime('最近发送', item.ts),
          payload: item.payload,
        }));
    }
    return [];
  }, [device.protocol, mqttMessages, tcpMessages, wsMessages]);

  const runtimeIdentityReady = useMemo(() => {
    if (!parserContext) {
      return false;
    }
    if (device.protocol === 'WebSocket' || device.protocol === 'TCP' || device.protocol === 'UDP') {
      return Boolean(productKey) && (Boolean(currentDeviceName) || locatorCount > 0);
    }
    return Boolean(productKey && currentDeviceName);
  }, [currentDeviceName, device.protocol, locatorCount, parserContext, productKey]);

  const selectedUplinkParser = uplinkParsers.find((item) => item.id === selectedUplinkParserId);
  const selectedDownlinkParser = downlinkParsers.find((item) => item.id === selectedDownlinkParserId);

  if (!supportsCustomProtocolValidation(device.protocol) || !parserContext) {
    return null;
  }

  const handleApplySample = (sample: PayloadSample) => {
    const parsed = resolveSamplePayload(sample.payload);
    setUplinkPayload(parsed.payload);
    setUplinkPayloadEncoding(parsed.encoding);
    if (sample.topic) {
      setUplinkTopic(sample.topic);
    }
  };

  const handleReloadRules = () => {
    if (!activeSession?.accessToken) {
      return;
    }
    setReloadNonce((value) => value + 1);
  };

  const handleRunUplinkDebug = async () => {
    if (!activeSession?.accessToken) {
      message.warning('请先登录当前环境');
      return;
    }
    if (!currentProduct?.id) {
      message.warning('请先确认当前设备已绑定有效 ProductKey');
      return;
    }
    if (!selectedUplinkParser) {
      message.warning('当前没有可用的上行规则');
      return;
    }

    setUplinkSubmitting(true);
    try {
      const headers = parseOptionalStringMap(uplinkHeadersText, '上行请求头');
      const result = await window.electronAPI.simulatorProtocolParserTest(
        activeEnvironment.gatewayBaseUrl,
        activeSession.accessToken,
        selectedUplinkParser.id,
        {
          productId: currentProduct.id,
          protocol: parserContext.protocol,
          transport: parserContext.transport,
          topic: trimText(uplinkTopic) || undefined,
          payloadEncoding: uplinkPayloadEncoding,
          payload: uplinkPayload,
          headers,
          sessionId: trimText(uplinkSessionId) || undefined,
          remoteAddress: trimText(uplinkRemoteAddress) || undefined,
        },
        navigator.userAgent,
      );

      if (isSimulatorAuthInvalid(result)) {
        clearWorkspaceSession(activeEnvironment.id);
        throw new Error('登录已失效，请重新登录');
      }
      if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
        throw new Error(result?.message || '执行上行调试失败');
      }

      const data = (result.data?.data || result.data) as DebugResult;
      setDebugResult(data);
      if (data.success) {
        addLog(device.id, device.name, 'success', `自定义协议上行调试成功：${parserContext.transport}`);
        message.success('上行调试完成');
      } else {
        addLog(device.id, device.name, 'warn', `自定义协议上行调试返回异常：${data.errorMessage || '未知错误'}`);
        message.warning(data.errorMessage || '上行调试返回异常');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '执行上行调试失败';
      addLog(device.id, device.name, 'error', `自定义协议上行调试失败：${errorMessage}`);
      message.error(errorMessage);
    } finally {
      setUplinkSubmitting(false);
    }
  };

  const handleRunDownlinkEncode = async () => {
    if (!activeSession?.accessToken) {
      message.warning('请先登录当前环境');
      return;
    }
    if (!currentProduct?.id) {
      message.warning('请先确认当前设备已绑定有效 ProductKey');
      return;
    }
    if (!selectedDownlinkParser) {
      message.warning('当前没有可用的下行规则');
      return;
    }

    setDownlinkSubmitting(true);
    try {
      const headers = parseOptionalStringMap(downlinkHeadersText, '下行请求头');
      const payload = parseRequiredObject(downlinkPayloadText, '下行载荷');
      const result = await window.electronAPI.simulatorProtocolParserEncodeTest(
        activeEnvironment.gatewayBaseUrl,
        activeSession.accessToken,
        selectedDownlinkParser.id,
        {
          productId: currentProduct.id,
          topic: trimText(downlinkTopic) || undefined,
          messageType: trimText(downlinkMessageType) || undefined,
          deviceName: trimText(downlinkDeviceName) || undefined,
          headers,
          sessionId: trimText(downlinkSessionId) || undefined,
          remoteAddress: trimText(downlinkRemoteAddress) || undefined,
          payload,
        },
        navigator.userAgent,
      );

      if (isSimulatorAuthInvalid(result)) {
        clearWorkspaceSession(activeEnvironment.id);
        throw new Error('登录已失效，请重新登录');
      }
      if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
        throw new Error(result?.message || '执行下行编码失败');
      }

      const data = (result.data?.data || result.data) as EncodeDebugResult;
      setEncodeResult(data);
      if (data.success) {
        addLog(device.id, device.name, 'success', `自定义协议下行编码成功：${parserContext.transport}`);
        message.success('下行编码完成');
      } else {
        addLog(device.id, device.name, 'warn', `自定义协议下行编码返回异常：${data.errorMessage || '未知错误'}`);
        message.warning(data.errorMessage || '下行编码返回异常');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '执行下行编码失败';
      addLog(device.id, device.name, 'error', `自定义协议下行编码失败：${errorMessage}`);
      message.error(errorMessage);
    } finally {
      setDownlinkSubmitting(false);
    }
  };

  const runtimeAlert = runtimeIdentityReady
    ? {
        type: isOnline ? 'success' as const : 'info' as const,
        message: isOnline
          ? '当前连接已具备运行态校验上下文'
          : '当前设备已具备运行态校验上下文',
        description: device.protocol === 'WebSocket' || device.protocol === 'TCP' || device.protocol === 'UDP'
          ? '连接后会自动把 ProductKey / DeviceName / 定位器带入绑定链路，发送原始报文即可进入真实协议解析。'
          : '上线后按当前 ProductKey / DeviceName 发报文，即可进入真实协议解析链路。',
      }
    : {
        type: 'warning' as const,
        message: '当前设备还不能做完整运行态校验',
        description: device.protocol === 'WebSocket' || device.protocol === 'TCP' || device.protocol === 'UDP'
          ? '请至少补齐 ProductKey，并配置 DeviceName 或定位器；否则只能做原始连通性测试，无法校验自定义协议规则。'
          : '请先补齐 ProductKey 和 DeviceName，再进行运行态协议校验。',
      };

  return (
    <Card
      title={<Space><ApiOutlined />自定义协议验证</Space>}
      extra={(
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={handleReloadRules}
          loading={productLoading || parserLoading}
          disabled={!activeSession?.accessToken}
        >
          刷新规则
        </Button>
      )}
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          showIcon
          type={activeSession?.accessToken ? runtimeAlert.type : 'warning'}
          message={activeSession?.accessToken ? runtimeAlert.message : '请先登录当前环境'}
          description={activeSession?.accessToken
            ? runtimeAlert.description
            : '登录后才能查询当前产品和协议解析规则；未登录时仍可做原始连通性测试。'}
        />

        <Descriptions
          size="small"
          column={2}
          items={[
            {
              key: 'transport',
              label: '协议上下文',
              children: (
                <Space wrap>
                  <Tag color="processing">{parserContext.transport}</Tag>
                  <Tag>{parserContext.protocol}</Tag>
                </Space>
              ),
            },
            {
              key: 'product',
              label: '当前产品',
              children: currentProduct
                ? `${currentProduct.name} (${currentProduct.productKey})`
                : productLoading
                  ? '正在加载...'
                  : productError || '未绑定',
            },
            {
              key: 'deviceName',
              label: '当前 DeviceName',
              children: currentDeviceName || '未配置',
            },
            {
              key: 'locators',
              label: '定位器',
              children: locatorCount > 0 ? `${locatorCount} 个` : '未配置',
            },
            {
              key: 'rules',
              label: '规则数量',
              children: `上行 ${uplinkParsers.length} / 下行 ${downlinkParsers.length}`,
            },
            {
              key: 'status',
              label: '连接状态',
              children: isOnline ? '在线' : '离线',
            },
          ]}
        />

        {productError ? (
          <Alert type="warning" showIcon message="产品解析失败" description={productError} />
        ) : null}

        {parserError ? (
          <Alert type="warning" showIcon message="协议规则加载失败" description={parserError} />
        ) : null}

        <Card size="small" title="直接上行调试">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Select
              value={selectedUplinkParserId}
              onChange={setSelectedUplinkParserId}
              placeholder="选择上行规则"
              loading={parserLoading}
              options={uplinkParsers.map((item) => ({
                value: item.id,
                label: buildParserOptionLabel(item),
              }))}
            />

            {recentUplinkSamples.length > 0 ? (
              <Space wrap>
                {recentUplinkSamples.map((sample) => (
                  <Button key={sample.id} size="small" onClick={() => handleApplySample(sample)}>
                    {sample.label}
                  </Button>
                ))}
              </Space>
            ) : null}

            <Space style={{ width: '100%' }} size={12} wrap>
              <div style={{ minWidth: 220, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Topic / Path</Text>
                <Input value={uplinkTopic} onChange={(event) => setUplinkTopic(event.target.value)} style={{ marginTop: 4 }} />
              </div>
              <div style={{ minWidth: 160 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>载荷编码</Text>
                <Select
                  value={uplinkPayloadEncoding}
                  onChange={(value) => setUplinkPayloadEncoding(value)}
                  style={{ width: '100%', marginTop: 4 }}
                  options={[
                    { value: 'TEXT', label: 'TEXT' },
                    { value: 'JSON', label: 'JSON' },
                    { value: 'HEX', label: 'HEX' },
                    { value: 'BASE64', label: 'BASE64' },
                  ]}
                />
              </div>
            </Space>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>原始载荷</Text>
              <Input.TextArea
                rows={5}
                value={uplinkPayload}
                onChange={(event) => setUplinkPayload(event.target.value)}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>请求头（JSON）</Text>
              <Input.TextArea
                rows={3}
                value={uplinkHeadersText}
                onChange={(event) => setUplinkHeadersText(event.target.value)}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            <Space style={{ width: '100%' }} size={12} wrap>
              <div style={{ minWidth: 220, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>SessionId（可选）</Text>
                <Input value={uplinkSessionId} onChange={(event) => setUplinkSessionId(event.target.value)} style={{ marginTop: 4 }} />
              </div>
              <div style={{ minWidth: 220, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>远端地址（可选）</Text>
                <Input value={uplinkRemoteAddress} onChange={(event) => setUplinkRemoteAddress(event.target.value)} style={{ marginTop: 4 }} />
              </div>
            </Space>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => void handleRunUplinkDebug()}
              loading={uplinkSubmitting}
              disabled={!selectedUplinkParser}
            >
              执行上行调试
            </Button>

            {debugResult ? (
              <Card size="small" type="inner" title="上行调试结果">
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Descriptions
                    size="small"
                    column={2}
                    items={[
                      { key: 'success', label: '结果', children: debugResult.success ? '成功' : '失败' },
                      { key: 'version', label: '命中版本', children: debugResult.matchedVersion ?? '-' },
                      { key: 'cost', label: '耗时', children: debugResult.costMs == null ? '-' : `${debugResult.costMs} ms` },
                      {
                        key: 'identity',
                        label: '识别设备',
                        children: debugResult.identity?.deviceName || debugResult.identity?.locatorValue || '-',
                      },
                    ]}
                  />

                  {debugResult.errorMessage ? (
                    <Alert type="warning" showIcon message={debugResult.errorMessage} />
                  ) : null}

                  {Array.isArray(debugResult.messages) && debugResult.messages.length > 0 ? (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {debugResult.messages.map((item, index) => (
                        <Card key={`${item.messageId || index}`} size="small" type="inner">
                          <Space direction="vertical" size={8} style={{ width: '100%' }}>
                            <Space wrap>
                              <Tag color="success">{item.type || 'UNKNOWN'}</Tag>
                              <Tag>{item.topic || '-'}</Tag>
                              {item.deviceName ? <Tag color="processing">{item.deviceName}</Tag> : null}
                            </Space>
                            <Input.TextArea
                              rows={4}
                              value={prettyJson(item.payload)}
                              readOnly
                              style={{ fontFamily: 'monospace', fontSize: 12 }}
                            />
                          </Space>
                        </Card>
                      ))}
                    </Space>
                  ) : (
                    <Empty description="本次调试没有产出标准消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Space>
              </Card>
            ) : null}
          </Space>
        </Card>

        <Card size="small" title="直接下行编码">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Select
              value={selectedDownlinkParserId}
              onChange={setSelectedDownlinkParserId}
              placeholder="选择下行规则"
              loading={parserLoading}
              options={downlinkParsers.map((item) => ({
                value: item.id,
                label: buildParserOptionLabel(item),
              }))}
            />

            <Space style={{ width: '100%' }} size={12} wrap>
              <div style={{ minWidth: 220, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Topic / Path</Text>
                <Input value={downlinkTopic} onChange={(event) => setDownlinkTopic(event.target.value)} style={{ marginTop: 4 }} />
              </div>
              <div style={{ minWidth: 160 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>消息类型</Text>
                <Select
                  value={downlinkMessageType}
                  onChange={setDownlinkMessageType}
                  style={{ width: '100%', marginTop: 4 }}
                  options={[
                    { value: 'PROPERTY_REPORT', label: '属性上报' },
                    { value: 'EVENT_REPORT', label: '事件上报' },
                    { value: 'RAW_DATA', label: '原始数据' },
                    { value: 'PROPERTY_SET', label: '属性设置' },
                    { value: 'SERVICE_INVOKE', label: '服务调用' },
                    { value: 'SERVICE_REPLY', label: '服务响应' },
                  ]}
                />
              </div>
            </Space>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>DeviceName（可选）</Text>
              <Input value={downlinkDeviceName} onChange={(event) => setDownlinkDeviceName(event.target.value)} style={{ marginTop: 4 }} />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>下行载荷（JSON）</Text>
              <Input.TextArea
                rows={5}
                value={downlinkPayloadText}
                onChange={(event) => setDownlinkPayloadText(event.target.value)}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>请求头（JSON）</Text>
              <Input.TextArea
                rows={3}
                value={downlinkHeadersText}
                onChange={(event) => setDownlinkHeadersText(event.target.value)}
                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>

            <Space style={{ width: '100%' }} size={12} wrap>
              <div style={{ minWidth: 220, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>SessionId（可选）</Text>
                <Input value={downlinkSessionId} onChange={(event) => setDownlinkSessionId(event.target.value)} style={{ marginTop: 4 }} />
              </div>
              <div style={{ minWidth: 220, flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>远端地址（可选）</Text>
                <Input value={downlinkRemoteAddress} onChange={(event) => setDownlinkRemoteAddress(event.target.value)} style={{ marginTop: 4 }} />
              </div>
            </Space>

            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => void handleRunDownlinkEncode()}
              loading={downlinkSubmitting}
              disabled={!selectedDownlinkParser}
            >
              执行下行编码
            </Button>

            {encodeResult ? (
              <Card size="small" type="inner" title="下行编码结果">
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Descriptions
                    size="small"
                    column={2}
                    items={[
                      { key: 'success', label: '结果', children: encodeResult.success ? '成功' : '失败' },
                      { key: 'version', label: '命中版本', children: encodeResult.matchedVersion ?? '-' },
                      { key: 'topic', label: '输出 Topic', children: encodeResult.topic || '-' },
                      { key: 'encoding', label: '编码方式', children: encodeResult.payloadEncoding || '-' },
                      { key: 'cost', label: '耗时', children: encodeResult.costMs == null ? '-' : `${encodeResult.costMs} ms` },
                    ]}
                  />

                  {encodeResult.errorMessage ? (
                    <Alert type="warning" showIcon message={encodeResult.errorMessage} />
                  ) : null}

                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>文本载荷</Text>
                    <Input.TextArea
                      rows={4}
                      value={encodeResult.payloadText || ''}
                      readOnly
                      style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>HEX 载荷</Text>
                    <Input.TextArea
                      rows={4}
                      value={encodeResult.payloadHex || ''}
                      readOnly
                      style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>输出请求头</Text>
                    <Input.TextArea
                      rows={3}
                      value={prettyJson(encodeResult.headers || {})}
                      readOnly
                      style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                </Space>
              </Card>
            ) : null}
          </Space>
        </Card>
      </Space>
    </Card>
  );
}
