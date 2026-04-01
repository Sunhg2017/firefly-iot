import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Tabs,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApiOutlined,
  BugOutlined,
  EditOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RollbackOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi, protocolParserApi, tenantSelfApi, deviceApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import { PROTOCOL_PARSER_TEMPLATES, ProtocolParserTemplate } from './parserTemplates';
import ProtocolParserRuntimePanel, {
  RuntimeMetrics,
  RuntimePlugin,
  RuntimePluginCatalogItem,
} from './ProtocolParserRuntimePanel';
import {
  VisualFlowDirection,
  buildScriptFromVisualConfig,
  defaultVisualConfigForDirection,
  normalizeVisualConfigText,
} from './visualFlow';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;
const LazyCodeEditorField = React.lazy(() => import('../../components/CodeEditorField'));

interface ProtocolCodeEditorProps {
  language: 'json' | 'javascript';
  path: string;
  height?: number | string;
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  readOnlyLabel?: string;
}

const ProtocolCodeEditor: React.FC<ProtocolCodeEditorProps> = ({
  language,
  path,
  height = 220,
  value,
  onChange,
  readOnly,
  readOnlyLabel,
}) => (
  <Suspense
    fallback={
      <div
        style={{
          minHeight: height,
          border: '1px solid #d9d9d9',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa',
        }}
      >
        <Text type="secondary">编辑器加载中...</Text>
      </div>
    }
  >
    <LazyCodeEditorField
      language={language}
      path={path}
      height={height}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      readOnlyLabel={readOnlyLabel}
    />
  </Suspense>
);

interface ProductOption {
  id: number;
  name: string;
  productKey: string;
  protocol?: string;
}

interface TenantOption {
  id: number;
  code: string;
  name: string;
  displayName?: string;
}

interface DeviceOption {
  productId?: number;
  deviceName: string;
}

type BusinessIdentifierPatch = {
  tenantCode?: string | null;
  productKey?: string | null;
};

interface ProtocolParserRecord {
  id: number;
  tenantId?: number;
  productId?: number | null;
  scopeType: 'PRODUCT' | 'TENANT' | string;
  scopeId?: number | null;
  protocol: string;
  transport: string;
  direction: 'UPLINK' | 'DOWNLINK' | string;
  parserMode: 'SCRIPT' | 'PLUGIN' | 'BUILTIN' | string;
  frameMode: string;
  matchRuleJson?: string;
  frameConfigJson?: string;
  parserConfigJson?: string;
  visualConfigJson?: string;
  scriptLanguage?: string;
  scriptContent?: string;
  pluginId?: string;
  pluginVersion?: string;
  timeoutMs?: number;
  errorPolicy?: string;
  releaseMode?: string;
  releaseConfigJson?: string;
  status: 'DRAFT' | 'ENABLED' | 'DISABLED' | string;
  currentVersion?: number;
  publishedVersion?: number | null;
  updatedAt?: string;
  createdAt?: string;
}

interface ProtocolParserVersionRecord {
  id: number;
  definitionId: number;
  versionNo: number;
  publishStatus?: string;
  changeLog?: string;
  createdBy?: number;
  createdAt?: string;
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

interface EditorFormValues {
  productId?: number;
  scopeType: 'PRODUCT' | 'TENANT';
  scopeId?: number;
  protocol: string;
  transport: string;
  direction: 'UPLINK' | 'DOWNLINK';
  parserMode: 'SCRIPT' | 'PLUGIN';
  frameMode: string;
  matchRuleJson: string;
  frameConfigJson: string;
  parserConfigJson: string;
  visualConfigJson: string;
  scriptLanguage: string;
  scriptContent: string;
  pluginId: string;
  pluginVersion: string;
  timeoutMs: number;
  errorPolicy: string;
  releaseMode: 'ALL' | 'DEVICE_LIST' | 'HASH_PERCENT';
  releaseConfigJson: string;
}

interface UplinkDebugFormValues {
  productId?: number;
  protocol?: string;
  transport?: string;
  topic?: string;
  payloadEncoding: 'TEXT' | 'JSON' | 'HEX' | 'BASE64';
  payload: string;
  headersText: string;
  sessionId?: string;
  remoteAddress?: string;
}

interface DownlinkDebugFormValues {
  productId?: number;
  topic?: string;
  messageType: string;
  deviceName?: string;
  headersText: string;
  sessionId?: string;
  remoteAddress?: string;
  payloadText: string;
}

interface PublishFormValues {
  changeLog?: string;
}

interface RollbackFormValues {
  version?: number;
}

type JsonEditorField =
  | 'matchRuleJson'
  | 'frameConfigJson'
  | 'parserConfigJson'
  | 'visualConfigJson'
  | 'releaseConfigJson';

type CodeEditorFieldName = JsonEditorField | 'scriptContent';

type ParserConfigPresetKind =
  | 'UPLINK_JSON_PROPERTY'
  | 'UPLINK_TEXT_PAIR'
  | 'UPLINK_RAW'
  | 'DOWNLINK_JSON'
  | 'DOWNLINK_HEX';

const PARSER_MODE_OPTIONS = [
  { value: 'SCRIPT', label: '脚本' },
  { value: 'PLUGIN', label: '插件' },
];

const FRAME_MODE_OPTIONS = [
  { value: 'NONE', label: '无拆帧' },
  { value: 'DELIMITER', label: '分隔符' },
  { value: 'FIXED_LENGTH', label: '固定长度' },
  { value: 'LENGTH_FIELD', label: '长度字段' },
];

const DIRECTION_OPTIONS = [
  { value: 'UPLINK', label: '上行' },
  { value: 'DOWNLINK', label: '下行' },
];

const ERROR_POLICY_OPTIONS = [
  { value: 'ERROR', label: '报错' },
  { value: 'DROP', label: '丢弃' },
  { value: 'RAW_DATA', label: '原始数据回退' },
];

const PAYLOAD_ENCODING_OPTIONS = [
  { value: 'TEXT', label: 'TEXT' },
  { value: 'JSON', label: 'JSON' },
  { value: 'HEX', label: 'HEX' },
  { value: 'BASE64', label: 'BASE64' },
];

const RELEASE_MODE_OPTIONS = [
  { value: 'ALL', label: '全部设备' },
  { value: 'DEVICE_LIST', label: '指定设备' },
  { value: 'HASH_PERCENT', label: '哈希百分比' },
];

const SCOPE_TYPE_OPTIONS = [
  { value: 'PRODUCT', label: '产品级' },
  { value: 'TENANT', label: '租户默认级' },
];

const PROTOCOL_OPTIONS = [
  { value: 'TCP_UDP', label: 'TCP/UDP' },
  { value: 'MQTT', label: 'MQTT' },
  { value: 'HTTP', label: 'HTTP' },
  { value: 'COAP', label: 'CoAP' },
  { value: 'WEBSOCKET', label: 'WebSocket' },
];

const TRANSPORT_OPTIONS = [
  { value: 'TCP', label: 'TCP' },
  { value: 'UDP', label: 'UDP' },
  { value: 'MQTT', label: 'MQTT' },
  { value: 'HTTP', label: 'HTTP' },
  { value: 'COAP', label: 'CoAP' },
  { value: 'WEBSOCKET', label: 'WebSocket' },
];

const SCRIPT_LANGUAGE_OPTIONS = [{ value: 'JS', label: 'JavaScript (JS)' }];

const MESSAGE_TYPE_OPTIONS = [
  { value: 'PROPERTY_REPORT', label: '属性上报' },
  { value: 'EVENT_REPORT', label: '事件上报' },
  { value: 'RAW_DATA', label: '原始数据' },
  { value: 'PROPERTY_SET', label: '属性设置' },
  { value: 'SERVICE_INVOKE', label: '服务调用' },
  { value: 'SERVICE_REPLY', label: '服务响应' },
];

const UPLINK_TOPIC_SUGGESTIONS = ['/up/property', '/data/report', '/coap/report', '/tcp/data', '/udp/data', '/ws/data'];
const DOWNLINK_TOPIC_SUGGESTIONS = ['/down/property', '/command/send', '/downstream'];

const STATUS_META: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'processing', label: '草稿' },
  ENABLED: { color: 'success', label: '已启用' },
  DISABLED: { color: 'default', label: '已停用' },
};

const VERSION_STATUS_META: Record<string, string> = {
  DRAFT: '草稿',
  PUBLISHED: '已发布',
  ENABLED: '已启用',
  DISABLED: '已停用',
  ROLLBACK: '已回滚',
  ROLLED_BACK: '已回滚',
};

const PROTOCOL_LABEL_MAP = Object.fromEntries(PROTOCOL_OPTIONS.map((item) => [item.value, item.label])) as Record<
  string,
  string
>;
const TRANSPORT_LABEL_MAP = Object.fromEntries(TRANSPORT_OPTIONS.map((item) => [item.value, item.label])) as Record<
  string,
  string
>;
const MESSAGE_TYPE_LABEL_MAP = Object.fromEntries(
  MESSAGE_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>;

const findOptionLabel = (options: Array<{ value: string; label: string }>, value?: string) =>
  options.find((item) => item.value === value)?.label || value || '-';

const buildStringOptions = (values: Array<string | undefined>, labelMap?: Record<string, string>) =>
  Array.from(
    new Set(
      values
        .map((item) => item?.trim())
        .filter((item): item is string => Boolean(item)),
    ),
  ).map((value) => ({ value, label: labelMap?.[value] || value }));

const DEFAULT_EDITOR_VALUES: EditorFormValues = {
  scopeType: 'PRODUCT',
  protocol: 'TCP_UDP',
  transport: 'TCP',
  direction: 'UPLINK',
  parserMode: 'SCRIPT',
  frameMode: 'NONE',
  matchRuleJson: JSON.stringify({ topicPrefix: '/tcp/' }, null, 2),
  frameConfigJson: '{}',
  parserConfigJson: '{}',
  visualConfigJson: defaultVisualConfigForDirection('UPLINK'),
  scriptLanguage: 'JS',
  scriptContent: buildScriptFromVisualConfig(defaultVisualConfigForDirection('UPLINK'), 'UPLINK'),
  pluginId: '',
  pluginVersion: '',
  timeoutMs: 50,
  errorPolicy: 'ERROR',
  releaseMode: 'ALL',
  releaseConfigJson: '{}',
};

const EDITOR_STEPS = [
  {
    title: '模板与作用域',
    description: '先选择模板、作用域和产品范围。',
  },
  {
    title: '协议与匹配',
    description: '配置协议、方向、匹配规则和拆帧方式。',
  },
  {
    title: '解析实现',
    description: '配置解析 JSON、可视化流和脚本或插件。',
  },
  {
    title: '发布策略',
    description: '配置生效范围与灰度发布方式。',
  },
  {
    title: '预览确认',
    description: '确认关键配置后再保存规则。',
  },
] as const;

const EDITOR_STEP_FIELDS: Array<Array<keyof EditorFormValues>> = [
  ['scopeType', 'productId'],
  ['protocol', 'transport', 'direction', 'timeoutMs', 'parserMode', 'frameMode', 'errorPolicy', 'matchRuleJson', 'frameConfigJson'],
  ['parserConfigJson', 'visualConfigJson', 'scriptLanguage', 'scriptContent', 'pluginId', 'pluginVersion'],
  ['releaseMode', 'releaseConfigJson'],
  [],
];

const JSON_FIELD_LABELS: Record<JsonEditorField, string> = {
  matchRuleJson: '匹配规则',
  frameConfigJson: '拆帧配置',
  parserConfigJson: '解析配置',
  visualConfigJson: '可视化配置',
  releaseConfigJson: '灰度配置',
};

const EDITOR_STEP_JSON_FIELDS: Array<JsonEditorField[]> = [
  [],
  ['matchRuleJson', 'frameConfigJson'],
  ['parserConfigJson', 'visualConfigJson'],
  ['releaseConfigJson'],
  [],
];

const EDITOR_CONFIG_STEP_COUNT = EDITOR_STEPS.length - 1;

const CODE_EDITOR_FIELD_META: Record<
  CodeEditorFieldName,
  {
    label: string;
    language: 'json' | 'javascript';
    fullscreenPath: string;
    fullscreenTip: string;
  }
> = {
  matchRuleJson: {
    label: '匹配规则 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/matchRule.fullscreen.json',
    fullscreenTip: '适合在大窗口里集中维护 topic、header 与设备匹配条件。',
  },
  frameConfigJson: {
    label: '拆帧配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/frameConfig.fullscreen.json',
    fullscreenTip: '适合连续调整 delimiter、fixedLength、lengthField 等拆帧参数。',
  },
  parserConfigJson: {
    label: '解析配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/parserConfig.fullscreen.json',
    fullscreenTip: '适合集中维护 defaultTopic、messageType 和业务字段映射。',
  },
  visualConfigJson: {
    label: '可视化配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/visualConfig.fullscreen.json',
    fullscreenTip: '适合边看结构边调整可视化流模板与字段映射。',
  },
  releaseConfigJson: {
    label: '灰度配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/releaseConfig.fullscreen.json',
    fullscreenTip: '适合在大窗口里维护 deviceNames 或百分比等发布策略细节。',
  },
  scriptContent: {
    label: '脚本内容',
    language: 'javascript',
    fullscreenPath: 'file:///protocol-parser/scriptContent.fullscreen.js',
    fullscreenTip: '适合连续编辑长脚本，关闭后会保留同一份表单内容。',
  },
};

const DEFAULT_UPLINK_DEBUG_VALUES: UplinkDebugFormValues = {
  payloadEncoding: 'HEX',
  payload: '',
  headersText: '{}',
  sessionId: '',
  remoteAddress: '',
};

const DEFAULT_DOWNLINK_DEBUG_VALUES: DownlinkDebugFormValues = {
  messageType: 'PROPERTY_SET',
  headersText: '{}',
  sessionId: '',
  remoteAddress: '',
  payloadText: JSON.stringify({ payload: { power: true } }, null, 2),
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const trimOptional = (value?: string) => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const ensureJsonObjectText = (raw: string, fieldName: string) => {
  const source = raw.trim() || '{}';
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${fieldName}必须是合法的 JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldName}必须是 JSON 对象`);
  }
  return JSON.stringify(parsed);
};

const parseOptionalStringMap = (raw: string, fieldName: string) => {
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
};

const parseRequiredObject = (raw: string, fieldName: string) => {
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
};

const prettyJson = (value?: string) => {
  const source = value?.trim();
  if (!source) {
    return '{}';
  }
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
};

const getJsonObjectError = (raw: string | undefined, fieldName: string) => {
  try {
    ensureJsonObjectText(raw || '{}', fieldName);
    return undefined;
  } catch (error) {
    return getErrorMessage(error, `${fieldName}必须是合法的 JSON`);
  }
};

const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

const inferProtocolByTransport = (transport?: string) => {
  const transportKey = (transport || '').toUpperCase();
  if (transportKey === 'TCP' || transportKey === 'UDP') {
    return 'TCP_UDP';
  }
  return transportKey || DEFAULT_EDITOR_VALUES.protocol;
};

const defaultTopicByTransport = (transport?: string, direction: 'UPLINK' | 'DOWNLINK' = 'UPLINK') => {
  const transportKey = (transport || '').toUpperCase();
  if (direction === 'DOWNLINK') {
    switch (transportKey) {
      case 'MQTT':
        return '/down/property';
      case 'HTTP':
        return '/command/send';
      default:
        return '/downstream';
    }
  }
  switch (transportKey) {
    case 'TCP':
      return '/tcp/data';
    case 'UDP':
      return '/udp/data';
    case 'HTTP':
      return '/data/report';
    case 'WEBSOCKET':
      return '/ws/data';
    case 'MQTT':
      return '/up/property';
    case 'COAP':
      return '/coap/report';
    default:
      return '/debug';
  }
};

const transportColor = (transport?: string) => {
  switch ((transport || '').toUpperCase()) {
    case 'TCP':
      return 'volcano';
    case 'UDP':
      return 'orange';
    case 'MQTT':
      return 'green';
    case 'HTTP':
      return 'blue';
    case 'WEBSOCKET':
      return 'cyan';
    case 'COAP':
      return 'geekblue';
    default:
      return 'default';
  }
};

const releaseModePreset = (mode?: string) => {
  switch ((mode || '').toUpperCase()) {
    case 'DEVICE_LIST':
      return JSON.stringify({ deviceNames: ['demo-device-01'] }, null, 2);
    case 'HASH_PERCENT':
      return JSON.stringify({ percent: 10 }, null, 2);
    default:
      return '{}';
  }
};

const buildTopicOptions = (
  direction: 'UPLINK' | 'DOWNLINK',
  transport?: string,
  values: Array<string | undefined> = [],
) =>
  buildStringOptions(
    [
      defaultTopicByTransport(transport, direction),
      ...(direction === 'DOWNLINK' ? DOWNLINK_TOPIC_SUGGESTIONS : UPLINK_TOPIC_SUGGESTIONS),
      ...values,
    ],
  );

const buildMatchRulePreset = (transport?: string, direction: 'UPLINK' | 'DOWNLINK' = 'UPLINK') => {
  const topic = defaultTopicByTransport(transport, direction);
  if (direction === 'DOWNLINK') {
    return formatJson({
      topicPrefix: topic,
      messageTypeEquals: 'PROPERTY_SET',
    });
  }
  if ((transport || '').toUpperCase() === 'HTTP') {
    return formatJson({
      topicPrefix: topic,
      headerEquals: {
        'content-type': 'application/json',
      },
    });
  }
  return formatJson({
    topicPrefix: topic,
  });
};

const buildFrameConfigPreset = (frameMode?: string) => {
  switch ((frameMode || '').toUpperCase()) {
    case 'DELIMITER':
      return formatJson({
        delimiterHex: '0A',
        stripDelimiter: true,
      });
    case 'FIXED_LENGTH':
      return formatJson({
        fixedLength: 32,
      });
    case 'LENGTH_FIELD':
      return formatJson({
        byteOrder: 'BIG_ENDIAN',
        lengthFieldOffset: 1,
        lengthFieldLength: 2,
        lengthAdjust: 0,
        initialBytesToStrip: 0,
      });
    default:
      return '{}';
  }
};

const buildParserConfigPreset = (
  presetKind: ParserConfigPresetKind,
  transport?: string,
  options: BusinessIdentifierPatch = {},
) => {
  switch (presetKind) {
    case 'UPLINK_TEXT_PAIR':
      return buildTextPairParserConfig(transport, options);
    case 'UPLINK_RAW':
      return buildRawDataParserConfig(transport, options);
    case 'DOWNLINK_JSON':
      return buildDownlinkJsonParserConfig(transport, options);
    case 'DOWNLINK_HEX':
      return buildDownlinkHexParserConfig(transport, options);
    case 'UPLINK_JSON_PROPERTY':
    default:
      return buildJsonPropertyParserConfig(transport, options);
  }
};

const withBusinessIdentifiers = (
  baseConfig: Record<string, unknown>,
  options: BusinessIdentifierPatch,
) => {
  const nextConfig: Record<string, unknown> = { ...baseConfig };
  if ('tenantCode' in options) {
    if (options.tenantCode) {
      nextConfig.tenantCode = options.tenantCode;
    } else {
      delete nextConfig.tenantCode;
    }
  }
  if ('productKey' in options) {
    if (options.productKey) {
      nextConfig.productKey = options.productKey;
    } else {
      delete nextConfig.productKey;
    }
  }
  return formatJson(nextConfig);
};

const buildJsonPropertyParserConfig = (
  transport?: string,
  options: BusinessIdentifierPatch = {},
) =>
  withBusinessIdentifiers(
    {
      defaultTopic: defaultTopicByTransport(transport, 'UPLINK'),
      payloadField: 'properties',
      deviceNameField: 'deviceName',
      timestampField: 'timestamp',
      messageType: 'PROPERTY_REPORT',
    },
    options,
  );

const buildTextPairParserConfig = (
  transport?: string,
  options: BusinessIdentifierPatch = {},
) =>
  withBusinessIdentifiers(
    {
      defaultTopic: defaultTopicByTransport(transport, 'UPLINK'),
      messageType: 'PROPERTY_REPORT',
      pairSeparator: ',',
      kvSeparator: '=',
    },
    options,
  );

const buildRawDataParserConfig = (
  transport?: string,
  options: BusinessIdentifierPatch = {},
) =>
  withBusinessIdentifiers(
    {
      defaultTopic: defaultTopicByTransport(transport, 'UPLINK'),
      messageType: 'RAW_DATA',
    },
    options,
  );

const buildDownlinkJsonParserConfig = (
  transport?: string,
  options: BusinessIdentifierPatch = {},
) =>
  withBusinessIdentifiers(
    {
      defaultTopic: defaultTopicByTransport(transport, 'DOWNLINK'),
      payloadEncoding: 'JSON',
      headers: {
        qos: '1',
      },
    },
    options,
  );

const buildDownlinkHexParserConfig = (
  transport?: string,
  options: BusinessIdentifierPatch = {},
) =>
  withBusinessIdentifiers(
    {
      defaultTopic: defaultTopicByTransport(transport, 'DOWNLINK'),
      payloadEncoding: 'HEX',
      framePrefix: 'AA55',
    },
    options,
  );

const buildUplinkPayloadExample = (transport?: string) => {
  const transportKey = (transport || '').toUpperCase();
  if (transportKey === 'TCP' || transportKey === 'UDP') {
    return 'temp=23.6,humidity=48';
  }
  return formatJson({
    deviceName: 'demo-device-01',
    timestamp: 1710000000000,
    properties: {
      temperature: 23.6,
      humidity: 48,
    },
  });
};

const buildUplinkHeadersExample = (transport?: string) => {
  const transportKey = (transport || '').toUpperCase();
  if (transportKey === 'HTTP') {
    return formatJson({
      'content-type': 'application/json',
      'x-request-id': 'debug-http-001',
    });
  }
  if (transportKey === 'MQTT') {
    return formatJson({
      clientId: 'mqtt-debug-client',
      qos: '1',
    });
  }
  return '{}';
};

const buildDownlinkPayloadExample = (messageType?: string) => {
  if ((messageType || '').toUpperCase() === 'SERVICE_INVOKE') {
    return formatJson({
      service: 'togglePower',
      payload: {
        power: true,
      },
    });
  }
  return formatJson({
    payload: {
      power: true,
      brightness: 80,
    },
  });
};

const UPLINK_HEX_PAYLOAD_EXAMPLE = '74656D703D32332E362C68756D69646974793D3438';

const injectBusinessIdentifiersIntoJson = (
  rawJson: string,
  options: BusinessIdentifierPatch,
) => {
  try {
    const source = rawJson?.trim() || '{}';
    const parsed = JSON.parse(source) as Record<string, unknown>;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return rawJson;
    }
    return withBusinessIdentifiers(parsed, options);
  } catch {
    return rawJson;
  }
};

const normalizeJsonObjectForCompare = (raw?: string) => {
  try {
    return ensureJsonObjectText(raw || '{}', 'JSON');
  } catch {
    return undefined;
  }
};

const isSameJsonObjectText = (left?: string, right?: string) => {
  const normalizedLeft = normalizeJsonObjectForCompare(left);
  const normalizedRight = normalizeJsonObjectForCompare(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
};

const normalizeVisualConfigSafely = (raw: string | undefined, direction: VisualFlowDirection) => {
  try {
    return normalizeVisualConfigText(raw || '{}', direction);
  } catch {
    return undefined;
  }
};

const detectParserConfigPresetKind = (
  rawJson: string | undefined,
  direction: 'UPLINK' | 'DOWNLINK',
  transport?: string,
  options: BusinessIdentifierPatch = {},
) => {
  const candidates: ParserConfigPresetKind[] =
    direction === 'DOWNLINK'
      ? ['DOWNLINK_JSON', 'DOWNLINK_HEX']
      : ['UPLINK_JSON_PROPERTY', 'UPLINK_TEXT_PAIR', 'UPLINK_RAW'];
  return candidates.find((presetKind) =>
    isSameJsonObjectText(rawJson, buildParserConfigPreset(presetKind, transport, options)),
  );
};

const formatReleaseSummary = (record: ProtocolParserRecord) => {
  const releaseMode = (record.releaseMode || 'ALL').toUpperCase();
  try {
    const config = JSON.parse(record.releaseConfigJson || '{}') as Record<string, unknown>;
    if (releaseMode === 'HASH_PERCENT') {
      return `${config.percent || 0}%`;
    }
    if (releaseMode === 'DEVICE_LIST') {
      const deviceNames = Array.isArray(config.deviceNames) ? config.deviceNames.length : 0;
      return `${deviceNames} 个目标设备`;
    }
    return '全部设备';
  } catch {
    return findOptionLabel(RELEASE_MODE_OPTIONS, releaseMode);
  }
};

interface ProtocolParserListFilters {
  productId?: number;
  protocol?: string;
  transport?: string;
  status?: string;
}

const ProtocolParserPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const initialProductId = useMemo(() => {
    const rawValue = searchParams.get('productId');
    const parsed = rawValue ? Number(rawValue) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }, [searchParams]);

  const [records, setRecords] = useState<ProtocolParserRecord[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [currentTenant, setCurrentTenant] = useState<TenantOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [draftFilters, setDraftFilters] = useState<ProtocolParserListFilters>({ productId: initialProductId });
  const [filters, setFilters] = useState<ProtocolParserListFilters>({ productId: initialProductId });
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeReloading, setRuntimeReloading] = useState(false);
  const [runtimeMetrics, setRuntimeMetrics] = useState<RuntimeMetrics | null>(null);
  const [runtimePlugins, setRuntimePlugins] = useState<RuntimePlugin[]>([]);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimePluginCatalogItem[]>([]);
  const [mainTabKey, setMainTabKey] = useState<'rules' | 'runtime'>('rules');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [currentRecord, setCurrentRecord] = useState<ProtocolParserRecord | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>();
  const [editorStepIndex, setEditorStepIndex] = useState(0);
  const [editorMaxStepIndex, setEditorMaxStepIndex] = useState(0);
  const [fullscreenEditorField, setFullscreenEditorField] = useState<CodeEditorFieldName | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uplinkDebugOpen, setUplinkDebugOpen] = useState(false);
  const [downlinkDebugOpen, setDownlinkDebugOpen] = useState(false);
  const [debugRecord, setDebugRecord] = useState<ProtocolParserRecord | null>(null);
  const [debugSubmitting, setDebugSubmitting] = useState(false);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [encodeResult, setEncodeResult] = useState<EncodeDebugResult | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishRecord, setPublishRecord] = useState<ProtocolParserRecord | null>(null);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackRecord, setRollbackRecord] = useState<ProtocolParserRecord | null>(null);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionRecord, setVersionRecord] = useState<ProtocolParserRecord | null>(null);
  const [versionItems, setVersionItems] = useState<ProtocolParserVersionRecord[]>([]);

  const [editorForm] = Form.useForm<EditorFormValues>();
  const [uplinkDebugForm] = Form.useForm<UplinkDebugFormValues>();
  const [downlinkDebugForm] = Form.useForm<DownlinkDebugFormValues>();
  const [publishForm] = Form.useForm<PublishFormValues>();
  const [rollbackForm] = Form.useForm<RollbackFormValues>();

  const currentParserMode = Form.useWatch('parserMode', editorForm) || DEFAULT_EDITOR_VALUES.parserMode;
  const currentProtocol = Form.useWatch('protocol', editorForm) || DEFAULT_EDITOR_VALUES.protocol;
  const currentDirection = Form.useWatch('direction', editorForm) || DEFAULT_EDITOR_VALUES.direction;
  const currentScopeType = Form.useWatch('scopeType', editorForm) || DEFAULT_EDITOR_VALUES.scopeType;
  const currentReleaseMode = Form.useWatch('releaseMode', editorForm) || DEFAULT_EDITOR_VALUES.releaseMode;
  const currentEditorTransport = Form.useWatch('transport', editorForm) || DEFAULT_EDITOR_VALUES.transport;
  const currentFrameMode = Form.useWatch('frameMode', editorForm) || DEFAULT_EDITOR_VALUES.frameMode;
  const currentTimeoutMs = Form.useWatch('timeoutMs', editorForm) || DEFAULT_EDITOR_VALUES.timeoutMs;
  const currentPluginId = Form.useWatch('pluginId', editorForm);
  const currentScriptLanguage = Form.useWatch('scriptLanguage', editorForm) || DEFAULT_EDITOR_VALUES.scriptLanguage;
  const currentScriptContent = Form.useWatch('scriptContent', editorForm) || '';
  const currentMatchRuleJson = Form.useWatch('matchRuleJson', editorForm) || DEFAULT_EDITOR_VALUES.matchRuleJson;
  const currentFrameConfigJson = Form.useWatch('frameConfigJson', editorForm) || DEFAULT_EDITOR_VALUES.frameConfigJson;
  const currentParserConfigJson = Form.useWatch('parserConfigJson', editorForm) || DEFAULT_EDITOR_VALUES.parserConfigJson;
  const currentVisualConfigJson = Form.useWatch('visualConfigJson', editorForm) || DEFAULT_EDITOR_VALUES.visualConfigJson;
  const currentReleaseConfigJson = Form.useWatch('releaseConfigJson', editorForm) || DEFAULT_EDITOR_VALUES.releaseConfigJson;
  const currentEditorProductId = Form.useWatch('productId', editorForm);
  const currentUplinkTransport = Form.useWatch('transport', uplinkDebugForm) || DEFAULT_EDITOR_VALUES.transport;
  const currentDownlinkProductId = Form.useWatch('productId', downlinkDebugForm);
  const currentDownlinkDeviceName = Form.useWatch('deviceName', downlinkDebugForm);
  const currentDownlinkMessageType =
    Form.useWatch('messageType', downlinkDebugForm) || DEFAULT_DOWNLINK_DEBUG_VALUES.messageType;
  const currentFullscreenEditorMeta = fullscreenEditorField ? CODE_EDITOR_FIELD_META[fullscreenEditorField] : undefined;
  const currentFullscreenEditorValue =
    fullscreenEditorField === 'matchRuleJson'
      ? currentMatchRuleJson
      : fullscreenEditorField === 'frameConfigJson'
        ? currentFrameConfigJson
        : fullscreenEditorField === 'parserConfigJson'
          ? currentParserConfigJson
          : fullscreenEditorField === 'visualConfigJson'
            ? currentVisualConfigJson
            : fullscreenEditorField === 'releaseConfigJson'
              ? currentReleaseConfigJson
              : fullscreenEditorField === 'scriptContent'
                ? currentScriptContent
                : '';

  const canCreate = hasPermission('protocol-parser:create');
  const canUpdate = hasPermission('protocol-parser:update');
  const canTest = hasPermission('protocol-parser:test');
  const canPublish = hasPermission('protocol-parser:publish');
  const canRead = hasPermission('protocol-parser:read');

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const selectedProduct = filters.productId ? productMap.get(filters.productId) : undefined;
  const currentEditorProduct = currentEditorProductId ? productMap.get(currentEditorProductId) : undefined;
  const currentTenantLabel = currentTenant?.displayName || currentTenant?.name || '当前租户';
  const productOptions = useMemo(
    () => products.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey})` })),
    [products],
  );
  const templateOptions = useMemo(
    () => PROTOCOL_PARSER_TEMPLATES.map((item) => ({ value: item.key, label: item.label })),
    [],
  );
  const selectedTemplate = useMemo(
    () => PROTOCOL_PARSER_TEMPLATES.find((item) => item.key === selectedTemplateKey),
    [selectedTemplateKey],
  );
  const quickTemplates = useMemo(() => PROTOCOL_PARSER_TEMPLATES, []);
  const editorStepItems = useMemo(
    () =>
      EDITOR_STEPS.map((item, index) => {
        const status: 'finish' | 'process' | 'wait' =
          index < editorStepIndex ? 'finish' : index === editorStepIndex ? 'process' : 'wait';
        return {
          title: item.title,
          description: item.description,
          disabled: index > editorMaxStepIndex,
          status,
        };
      }),
    [editorMaxStepIndex, editorStepIndex],
  );
  const isLastEditorStep = editorStepIndex === EDITOR_STEPS.length - 1;

  // Keep dropdown choices aligned with products, existing rules, and built-in templates.
  const protocolOptions = useMemo(
    () =>
      buildStringOptions(
        [
          ...PROTOCOL_OPTIONS.map((item) => item.value),
          ...products.map((item) => item.protocol),
          ...records.map((item) => item.protocol),
          ...PROTOCOL_PARSER_TEMPLATES.map((item) => item.protocol),
          currentRecord?.protocol,
        ],
        PROTOCOL_LABEL_MAP,
      ),
    [currentRecord?.protocol, products, records],
  );
  const transportOptions = useMemo(
    () =>
      buildStringOptions(
        [
          ...TRANSPORT_OPTIONS.map((item) => item.value),
          ...records.map((item) => item.transport),
          ...PROTOCOL_PARSER_TEMPLATES.map((item) => item.transport),
          currentRecord?.transport,
          debugRecord?.transport,
        ],
        TRANSPORT_LABEL_MAP,
      ),
    [currentRecord?.transport, debugRecord?.transport, records],
  );
  const messageTypeOptions = useMemo(
    () =>
      buildStringOptions(
        [...MESSAGE_TYPE_OPTIONS.map((item) => item.value), currentDownlinkMessageType],
        MESSAGE_TYPE_LABEL_MAP,
      ),
    [currentDownlinkMessageType],
  );
  const editorTopicOptions = useMemo(
    () =>
      buildTopicOptions(
        currentDirection,
        currentEditorTransport,
        records
          .filter((item) => item.direction === currentDirection)
          .map((item) => {
            try {
              const parsed = JSON.parse(item.parserConfigJson || '{}') as Record<string, unknown>;
              return typeof parsed.defaultTopic === 'string' ? parsed.defaultTopic : undefined;
            } catch {
              return undefined;
            }
          }),
      ),
    [currentDirection, currentEditorTransport, records],
  );
  const uplinkTopicOptions = useMemo(
    () => buildTopicOptions('UPLINK', currentUplinkTransport),
    [currentUplinkTransport],
  );
  const downlinkTopicOptions = useMemo(
    () => buildTopicOptions('DOWNLINK', debugRecord?.transport),
    [debugRecord?.transport],
  );
  const pluginOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    runtimePlugins.forEach((item) => {
      options.set(item.pluginId, {
        value: item.pluginId,
        label: `${item.displayName || item.pluginId}${item.version ? ` (${item.version})` : ''}`,
      });
    });
    runtimeCatalog.forEach((item) => {
      if (!options.has(item.pluginId)) {
        options.set(item.pluginId, {
          value: item.pluginId,
          label: `${item.displayName || item.pluginId}${item.latestVersion ? ` (${item.latestVersion})` : ''}`,
        });
      }
    });
    return Array.from(options.values());
  }, [runtimeCatalog, runtimePlugins]);
  const pluginVersionOptions = useMemo(
    () =>
      buildStringOptions(
        [
          runtimePlugins.find((item) => item.pluginId === currentPluginId)?.version,
          runtimeCatalog.find((item) => item.pluginId === currentPluginId)?.installedVersion,
          runtimeCatalog.find((item) => item.pluginId === currentPluginId)?.latestVersion,
          currentRecord?.pluginVersion,
        ],
      ),
    [currentPluginId, currentRecord?.pluginVersion, runtimeCatalog, runtimePlugins],
  );
  const downlinkDeviceOptions = useMemo(() => {
    const visibleDevices = currentDownlinkProductId
      ? deviceOptions.filter((item) => item.productId === currentDownlinkProductId)
      : deviceOptions;
    return visibleDevices.map((item) => ({
      value: item.deviceName,
      label: item.deviceName,
    }));
  }, [currentDownlinkProductId, deviceOptions]);

  const stats = useMemo(
    () => ({
      enabled: records.filter((item) => item.status === 'ENABLED').length,
      drafts: records.filter((item) => item.status === 'DRAFT').length,
      downlink: records.filter((item) => item.direction === 'DOWNLINK').length,
      tenantDefault: records.filter((item) => item.scopeType === 'TENANT').length,
    }),
    [records],
  );
  const overviewItems = useMemo(
    () => [
      { title: '已启用', value: stats.enabled, color: '#16a34a' },
      { title: '草稿', value: stats.drafts, color: '#2563eb' },
      { title: '下行规则', value: stats.downlink, color: '#c2410c' },
      { title: '租户默认', value: stats.tenantDefault, color: '#7c3aed' },
    ],
    [stats],
  );

  const editorBusinessIdentifiers = useMemo(() => {
    const patch: BusinessIdentifierPatch = {};
    if (currentTenant?.code) {
      patch.tenantCode = currentTenant.code;
    }
    patch.productKey = currentScopeType === 'PRODUCT' ? currentEditorProduct?.productKey ?? null : null;
    return patch;
  }, [currentEditorProduct?.productKey, currentScopeType, currentTenant?.code]);

  const editorScopeSummary = useMemo(() => {
    if (currentScopeType === 'TENANT') {
      return `租户默认级规则会自动绑定当前租户，界面展示为 tenantCode=${currentTenant?.code || '待加载'}。`;
    }
    if (currentEditorProduct) {
      return `产品级规则会自动补齐 tenantCode=${currentTenant?.code || '待加载'} 与 ProductKey=${currentEditorProduct.productKey}。`;
    }
    return `产品级规则会在保存时补齐 tenantCode，选择产品后会自动带出 ProductKey。`;
  }, [currentEditorProduct, currentScopeType, currentTenant?.code]);
  const editorPreviewSummary = useMemo(
    () => [
      {
        key: 'template',
        label: '已选模板',
        value: selectedTemplate?.label || '未使用模板',
      },
      {
        key: 'scope',
        label: '作用域',
        value:
          currentScopeType === 'TENANT'
            ? `${findOptionLabel(SCOPE_TYPE_OPTIONS, currentScopeType)} (${currentTenant?.code || '待补齐 tenantCode'})`
            : currentEditorProduct
              ? `${currentEditorProduct.name} (${currentEditorProduct.productKey})`
              : '产品级（待选择产品）',
      },
      {
        key: 'protocol',
        label: '协议 / 传输',
        value: `${findOptionLabel(PROTOCOL_OPTIONS, currentProtocol)} / ${findOptionLabel(
          TRANSPORT_OPTIONS,
          currentEditorTransport,
        )}`,
      },
      {
        key: 'direction',
        label: '方向 / 解析方式',
        value: `${findOptionLabel(DIRECTION_OPTIONS, currentDirection)} / ${findOptionLabel(
          PARSER_MODE_OPTIONS,
          currentParserMode,
        )}`,
      },
      {
        key: 'frame',
        label: '拆帧 / 超时 / 发布',
        value: `${findOptionLabel(FRAME_MODE_OPTIONS, currentFrameMode)} / ${currentTimeoutMs} ms / ${findOptionLabel(
          RELEASE_MODE_OPTIONS,
          currentReleaseMode,
        )}`,
      },
    ],
    [
      currentDirection,
      currentEditorProduct,
      currentEditorTransport,
      currentFrameMode,
      currentParserMode,
      currentProtocol,
      currentReleaseMode,
      currentScopeType,
      currentTenant?.code,
      currentTimeoutMs,
      selectedTemplate?.label,
    ],
  );
  // Keep the side panel in sync with the live form state so users can spot missing fields
  // or broken JSON before they navigate away from the current step.
  const editorStepChecks = useMemo(() => {
    const checks: Array<{ ready: boolean; issues: string[] }> = [];

    checks.push({
      ready: currentScopeType !== 'PRODUCT' || Boolean(currentEditorProductId),
      issues: currentScopeType === 'PRODUCT' && !currentEditorProductId ? ['请选择产品'] : [],
    });

    const stepOneIssues: string[] = [];
    if (!trimOptional(currentProtocol)) {
      stepOneIssues.push('请选择协议');
    }
    if (!trimOptional(currentEditorTransport)) {
      stepOneIssues.push('请选择传输方式');
    }
    if (!trimOptional(currentDirection)) {
      stepOneIssues.push('请选择方向');
    }
    if (!currentTimeoutMs || currentTimeoutMs < 1) {
      stepOneIssues.push('请输入有效的超时时间');
    }
    const matchRuleError = getJsonObjectError(currentMatchRuleJson, JSON_FIELD_LABELS.matchRuleJson);
    if (matchRuleError) {
      stepOneIssues.push(matchRuleError);
    }
    const frameConfigError = getJsonObjectError(currentFrameConfigJson, JSON_FIELD_LABELS.frameConfigJson);
    if (frameConfigError) {
      stepOneIssues.push(frameConfigError);
    }
    checks.push({
      ready: stepOneIssues.length === 0,
      issues: stepOneIssues,
    });

    const stepTwoIssues: string[] = [];
    const parserConfigError = getJsonObjectError(currentParserConfigJson, JSON_FIELD_LABELS.parserConfigJson);
    if (parserConfigError) {
      stepTwoIssues.push(parserConfigError);
    }
    const visualConfigError = getJsonObjectError(currentVisualConfigJson, JSON_FIELD_LABELS.visualConfigJson);
    if (visualConfigError) {
      stepTwoIssues.push(visualConfigError);
    }
    if (currentParserMode === 'SCRIPT') {
      if (!trimOptional(currentScriptLanguage)) {
        stepTwoIssues.push('请选择脚本语言');
      }
      if (!trimOptional(currentScriptContent)) {
        stepTwoIssues.push('请输入脚本内容');
      }
    } else if (!trimOptional(currentPluginId)) {
      stepTwoIssues.push('请输入插件 ID');
    }
    checks.push({
      ready: stepTwoIssues.length === 0,
      issues: stepTwoIssues,
    });

    const stepThreeIssues: string[] = [];
    if (!trimOptional(currentReleaseMode)) {
      stepThreeIssues.push('请选择发布方式');
    }
    const releaseConfigError = getJsonObjectError(currentReleaseConfigJson, JSON_FIELD_LABELS.releaseConfigJson);
    if (releaseConfigError) {
      stepThreeIssues.push(releaseConfigError);
    }
    checks.push({
      ready: stepThreeIssues.length === 0,
      issues: stepThreeIssues,
    });

    const incompleteStepTitles = checks
      .slice(0, EDITOR_CONFIG_STEP_COUNT)
      .flatMap((item, index) => (item.ready ? [] : [`请先完成「${EDITOR_STEPS[index].title}」`]));
    checks.push({
      ready: incompleteStepTitles.length === 0,
      issues: incompleteStepTitles,
    });

    return checks;
  }, [
    currentDirection,
    currentEditorProductId,
    currentEditorTransport,
    currentFrameConfigJson,
    currentMatchRuleJson,
    currentParserConfigJson,
    currentParserMode,
    currentPluginId,
    currentProtocol,
    currentReleaseConfigJson,
    currentReleaseMode,
    currentScopeType,
    currentScriptContent,
    currentScriptLanguage,
    currentTimeoutMs,
    currentVisualConfigJson,
  ]);
  const currentEditorStepCheck = editorStepChecks[editorStepIndex] || { ready: true, issues: [] };
  const readyEditorStepCount = editorStepChecks.slice(0, EDITOR_CONFIG_STEP_COUNT).filter((item) => item.ready).length;
  const editorProgressPercent = Math.round((readyEditorStepCount / EDITOR_CONFIG_STEP_COUNT) * 100);

  const describeRecordScope = (record?: ProtocolParserRecord | null) => {
    if (!record) {
      return '';
    }
    if (record.scopeType === 'TENANT') {
      return `${currentTenantLabel}${currentTenant?.code ? ` (${currentTenant.code})` : ''}`;
    }
    const product = record.productId ? productMap.get(record.productId) : undefined;
    return product ? `${product.name} (${product.productKey})` : '产品规则';
  };

  const fetchProducts = async () => {
    setProductLoading(true);
    try {
      const response = await productApi.list({ pageNum: 1, pageSize: 500 });
      const page = response.data.data as { records?: ProductOption[] };
      setProducts(page.records || []);
    } catch (error) {
      message.error(getErrorMessage(error, '加载产品列表失败'));
    } finally {
      setProductLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const response = await deviceApi.list({ pageSize: 500 });
      const page = response.data.data as { records?: DeviceOption[] };
      setDeviceOptions(
        (page.records || []).map((d: DeviceOption) => ({
          productId: d.productId,
          deviceName: d.deviceName,
        })),
      );
    } catch {
      // ignore
    }
  };

  const fetchCurrentTenant = async () => {
    try {
      const response = await tenantSelfApi.get();
      setCurrentTenant((response.data.data || null) as TenantOption | null);
    } catch (error) {
      message.warning(getErrorMessage(error, '加载当前租户信息失败，业务编码将暂时无法自动补齐'));
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await protocolParserApi.list({
        pageNum,
        pageSize,
        productId: filters.productId,
        protocol: filters.protocol,
        transport: filters.transport,
        status: filters.status,
      });
      const page = response.data.data as { records?: ProtocolParserRecord[]; total?: number };
      setRecords(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载协议解析规则失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchRuntime = async () => {
    if (!canRead) {
      return;
    }
    setRuntimeLoading(true);
    try {
      const [metricsResponse, pluginsResponse, catalogResponse] = await Promise.all([
        protocolParserApi.runtimeMetrics(),
        protocolParserApi.runtimePlugins(),
        protocolParserApi.pluginCatalog(),
      ]);
      setRuntimeMetrics((metricsResponse.data.data || null) as RuntimeMetrics | null);
      setRuntimePlugins((pluginsResponse.data.data || []) as RuntimePlugin[]);
      setRuntimeCatalog((catalogResponse.data.data || []) as RuntimePluginCatalogItem[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载运行时状态失败'));
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    void fetchCurrentTenant();
    void fetchProducts();
    void fetchDevices();
  }, []);

  useEffect(() => {
    void fetchData();
  }, [filters, pageNum, pageSize]);

  const applyFilters = () => {
    setFilters({
      productId: draftFilters.productId,
      protocol: draftFilters.protocol,
      transport: draftFilters.transport,
      status: draftFilters.status,
    });
    setPageNum(1);
  };

  const resetFilters = () => {
    const initialFilters = { productId: initialProductId } as ProtocolParserListFilters;
    setDraftFilters(initialFilters);
    setFilters(initialFilters);
    setPageNum(1);
  };

  useEffect(() => {
    void fetchRuntime();
  }, [canRead]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const parserConfigJson = (editorForm.getFieldValue('parserConfigJson') as string) || '{}';
    const nextParserConfigJson = injectBusinessIdentifiersIntoJson(parserConfigJson, editorBusinessIdentifiers);
    if (nextParserConfigJson !== parserConfigJson) {
      // Keep copied config examples aligned with the visible tenant/product selection.
      editorForm.setFieldsValue({
        scopeId: undefined,
        parserConfigJson: nextParserConfigJson,
      });
    }
  }, [editorBusinessIdentifiers, editorForm, editorOpen]);

  const editorAutoSyncRef = useRef<{
    direction: 'UPLINK' | 'DOWNLINK';
    transport: string;
    frameMode: string;
    releaseMode: 'ALL' | 'DEVICE_LIST' | 'HASH_PERCENT';
    parserMode: 'SCRIPT' | 'PLUGIN';
    matchRuleJson: string;
    frameConfigJson: string;
    parserConfigJson: string;
    visualConfigJson: string;
    scriptContent: string;
    releaseConfigJson: string;
  } | null>(null);

  useEffect(() => {
    if (!editorOpen) {
      editorAutoSyncRef.current = null;
      return;
    }

    const currentSnapshot = {
      direction: currentDirection,
      transport: currentEditorTransport,
      frameMode: currentFrameMode,
      releaseMode: currentReleaseMode,
      parserMode: currentParserMode,
      matchRuleJson: currentMatchRuleJson,
      frameConfigJson: currentFrameConfigJson,
      parserConfigJson: currentParserConfigJson,
      visualConfigJson: currentVisualConfigJson,
      scriptContent: currentScriptContent,
      releaseConfigJson: currentReleaseConfigJson,
    };
    const previousSnapshot = editorAutoSyncRef.current;
    if (!previousSnapshot) {
      editorAutoSyncRef.current = currentSnapshot;
      return;
    }

    // Only rotate fields that are still on generated defaults. Once a user edits a JSON block
    // manually, we stop auto-overwriting it and leave the custom content untouched.
    const patch: Partial<EditorFormValues> = {};
    if (
      previousSnapshot.transport !== currentEditorTransport ||
      previousSnapshot.direction !== currentDirection
    ) {
      if (
        isSameJsonObjectText(
          previousSnapshot.matchRuleJson,
          buildMatchRulePreset(previousSnapshot.transport, previousSnapshot.direction),
        )
      ) {
        patch.matchRuleJson = buildMatchRulePreset(currentEditorTransport, currentDirection);
      }

      const parserPresetKind = detectParserConfigPresetKind(
        previousSnapshot.parserConfigJson,
        previousSnapshot.direction,
        previousSnapshot.transport,
        editorBusinessIdentifiers,
      );
      if (parserPresetKind) {
        patch.parserConfigJson = buildParserConfigPreset(parserPresetKind, currentEditorTransport, editorBusinessIdentifiers);
      }
    }

    if (
      previousSnapshot.frameMode !== currentFrameMode &&
      isSameJsonObjectText(previousSnapshot.frameConfigJson, buildFrameConfigPreset(previousSnapshot.frameMode))
    ) {
      patch.frameConfigJson = buildFrameConfigPreset(currentFrameMode);
    }

    if (previousSnapshot.direction !== currentDirection) {
      const previousVisualDefault = defaultVisualConfigForDirection(previousSnapshot.direction);
      if (isSameJsonObjectText(previousSnapshot.visualConfigJson, previousVisualDefault)) {
        patch.visualConfigJson = defaultVisualConfigForDirection(currentDirection);
      }

      if (currentParserMode === 'SCRIPT') {
        const previousVisualForScript =
          normalizeVisualConfigSafely(patch.visualConfigJson ?? previousSnapshot.visualConfigJson, currentDirection) ||
          normalizeVisualConfigSafely(previousSnapshot.visualConfigJson, previousSnapshot.direction);
        const previousGeneratedScript = normalizeVisualConfigSafely(
          previousSnapshot.visualConfigJson,
          previousSnapshot.direction,
        )
          ? buildScriptFromVisualConfig(
              normalizeVisualConfigSafely(previousSnapshot.visualConfigJson, previousSnapshot.direction)!,
              previousSnapshot.direction,
            )
          : undefined;
        if (!trimOptional(previousSnapshot.scriptContent) || previousSnapshot.scriptContent === previousGeneratedScript) {
          const nextVisualConfig =
            patch.visualConfigJson ||
            normalizeVisualConfigSafely(currentVisualConfigJson, currentDirection) ||
            previousVisualForScript;
          if (nextVisualConfig) {
            patch.scriptLanguage = 'JS';
            patch.scriptContent = buildScriptFromVisualConfig(nextVisualConfig, currentDirection);
          }
        }
      }
    }

    if (
      previousSnapshot.releaseMode !== currentReleaseMode &&
      isSameJsonObjectText(previousSnapshot.releaseConfigJson, releaseModePreset(previousSnapshot.releaseMode))
    ) {
      patch.releaseConfigJson = releaseModePreset(currentReleaseMode);
    }

    if (Object.keys(patch).length > 0) {
      editorForm.setFieldsValue(patch);
    }
    editorAutoSyncRef.current = {
      ...currentSnapshot,
      ...patch,
    };
  }, [
    currentDirection,
    currentEditorTransport,
    currentFrameConfigJson,
    currentFrameMode,
    currentMatchRuleJson,
    currentParserConfigJson,
    currentParserMode,
    currentReleaseConfigJson,
    currentReleaseMode,
    currentScriptContent,
    currentVisualConfigJson,
    editorBusinessIdentifiers,
    editorForm,
    editorOpen,
  ]);

  useEffect(() => {
    if (!currentDownlinkDeviceName) {
      return;
    }
    const stillVisible = downlinkDeviceOptions.some((item) => item.value === currentDownlinkDeviceName);
    if (!stillVisible) {
      downlinkDebugForm.setFieldsValue({ deviceName: undefined });
    }
  }, [currentDownlinkDeviceName, downlinkDebugForm, downlinkDeviceOptions]);

  useEffect(() => {
    if (currentParserMode !== 'SCRIPT' && fullscreenEditorField === 'scriptContent') {
      setFullscreenEditorField(null);
    }
  }, [currentParserMode, fullscreenEditorField]);

  // Auto-pick a detected version so plugin mode usually needs only one selection.
  useEffect(() => {
    if (currentParserMode !== 'PLUGIN' || !currentPluginId) {
      return;
    }
    if (trimOptional(editorForm.getFieldValue('pluginVersion') as string | undefined)) {
      return;
    }
    const [firstVersionOption] = pluginVersionOptions;
    if (firstVersionOption?.value) {
      editorForm.setFieldsValue({ pluginVersion: firstVersionOption.value });
    }
  }, [currentParserMode, currentPluginId, editorForm, pluginVersionOptions]);

  const closeEditorModal = () => {
    setEditorOpen(false);
    setFullscreenEditorField(null);
    setCurrentRecord(null);
    setSelectedTemplateKey(undefined);
    setEditorStepIndex(0);
    setEditorMaxStepIndex(0);
  };

  const applyTemplate = (template?: ProtocolParserTemplate) => {
    if (!template) {
      message.warning('请先选择模板');
      return;
    }
    const visualConfigJson = defaultVisualConfigForDirection(template.direction as VisualFlowDirection);
    editorForm.setFieldsValue({
      protocol: template.protocol,
      transport: template.transport,
      direction: template.direction as 'UPLINK' | 'DOWNLINK',
      parserMode: template.parserMode as 'SCRIPT' | 'PLUGIN',
      frameMode: template.frameMode,
      matchRuleJson: template.matchRuleJson,
      frameConfigJson: template.frameConfigJson,
      parserConfigJson: injectBusinessIdentifiersIntoJson(template.parserConfigJson, editorBusinessIdentifiers),
      visualConfigJson,
      scriptLanguage: template.scriptLanguage,
      scriptContent: template.scriptContent,
      timeoutMs: template.timeoutMs,
      errorPolicy: template.errorPolicy,
    });
    message.success(`已应用模板：${template.label}`);
  };

  const applyEditorJsonPreset = (
    field: 'matchRuleJson' | 'frameConfigJson' | 'parserConfigJson' | 'visualConfigJson' | 'releaseConfigJson',
    value: string,
  ) => {
    editorForm.setFieldsValue({ [field]: value } as Partial<EditorFormValues>);
  };

  const formatEditorJsonFields = (fields: JsonEditorField[]) => {
    if (fields.length === 0) {
      return;
    }
    const nextValues: Partial<EditorFormValues> = {};
    for (const field of fields) {
      const rawValue = (editorForm.getFieldValue(field) as string | undefined) || '{}';
      try {
        nextValues[field] = prettyJson(ensureJsonObjectText(rawValue, JSON_FIELD_LABELS[field]));
      } catch (error) {
        message.error(getErrorMessage(error, `${JSON_FIELD_LABELS[field]}格式化失败`));
        return;
      }
    }
    editorForm.setFieldsValue(nextValues);
    message.success(`已格式化${fields.map((field) => JSON_FIELD_LABELS[field]).join('、')}`);
  };

  const openFullscreenEditor = (field: CodeEditorFieldName) => {
    setFullscreenEditorField(field);
  };

  const handleFullscreenEditorChange = (value: string) => {
    if (!fullscreenEditorField) {
      return;
    }
    editorForm.setFieldsValue({ [fullscreenEditorField]: value } as Partial<EditorFormValues>);
  };

  const handleFormatFullscreenEditor = () => {
    if (!fullscreenEditorField || fullscreenEditorField === 'scriptContent') {
      return;
    }
    try {
      const currentValue = (editorForm.getFieldValue(fullscreenEditorField) as string | undefined) || '{}';
      editorForm.setFieldsValue({
        [fullscreenEditorField]: prettyJson(ensureJsonObjectText(currentValue, JSON_FIELD_LABELS[fullscreenEditorField])),
      } as Partial<EditorFormValues>);
      message.success(`已格式化${JSON_FIELD_LABELS[fullscreenEditorField]}`);
    } catch (error) {
      message.error(getErrorMessage(error, `${JSON_FIELD_LABELS[fullscreenEditorField]}格式化失败`));
    }
  };

  const validateJsonObjectRule = (field: JsonEditorField) => async (_: unknown, value?: string) => {
    const errorMessage = getJsonObjectError(value, JSON_FIELD_LABELS[field]);
    if (errorMessage) {
      return Promise.reject(new Error(errorMessage));
    }
    return Promise.resolve();
  };

  const handleEditorTransportChange = (transport: string) => {
    editorForm.setFieldsValue({
      protocol: inferProtocolByTransport(transport),
    });
  };

  const handleEditorScopeTypeChange = (scopeType: 'PRODUCT' | 'TENANT') => {
    if (scopeType === 'TENANT') {
      editorForm.setFieldsValue({
        productId: undefined,
        scopeId: undefined,
      });
      return;
    }
    editorForm.setFieldsValue({ scopeId: undefined });
  };

  const handleEditorProductChange = () => {
    editorForm.setFieldsValue({ scopeId: undefined });
  };

  const handleValidateCurrentEditorStep = async () => {
    try {
      if (editorStepIndex === EDITOR_CONFIG_STEP_COUNT) {
        // The preview step has no own form fields, so validation here means re-checking
        // every editable step before the final submit.
        for (let stepIndex = 0; stepIndex < EDITOR_CONFIG_STEP_COUNT; stepIndex += 1) {
          await validateEditorStep(stepIndex);
        }
        message.success('前置步骤已全部校验通过');
        return;
      }
      await validateEditorStep();
      message.success(`第 ${editorStepIndex + 1} 步已校验通过`);
    } catch {
      // antd form will surface validation feedback inline
    }
  };

  const validateEditorStep = async (stepIndex = editorStepIndex) => {
    const fields = EDITOR_STEP_FIELDS[stepIndex].filter((field) => {
      if (field === 'productId') {
        return currentScopeType === 'PRODUCT';
      }
      if (field === 'scriptLanguage' || field === 'scriptContent') {
        return currentParserMode === 'SCRIPT';
      }
      if (field === 'pluginId' || field === 'pluginVersion') {
        return currentParserMode === 'PLUGIN';
      }
      return true;
    });
    if (fields.length === 0) {
      return;
    }
    await editorForm.validateFields(fields);
  };

  const moveToEditorStep = (stepIndex: number) => {
    const boundedStep = Math.min(Math.max(stepIndex, 0), EDITOR_STEPS.length - 1);
    setEditorStepIndex(boundedStep);
    setEditorMaxStepIndex((prev) => Math.max(prev, boundedStep));
  };

  const handleEditorNextStep = async () => {
    try {
      await validateEditorStep();
      moveToEditorStep(editorStepIndex + 1);
    } catch {
      // antd form will surface validation feedback inline
    }
  };

  const handleEditorStepChange = async (targetStep: number) => {
    if (targetStep === editorStepIndex) {
      return;
    }
    if (targetStep < editorStepIndex) {
      setEditorStepIndex(targetStep);
      return;
    }
    if (targetStep > editorMaxStepIndex) {
      return;
    }
    try {
      await validateEditorStep();
      setEditorStepIndex(targetStep);
    } catch {
      // keep the user on the current step when required fields are incomplete
    }
  };

  // Switching transport also aligns the protocol and default debug payload shape.
  const handleUplinkTransportChange = (transport: string) => {
    uplinkDebugForm.setFieldsValue({
      protocol: inferProtocolByTransport(transport),
      topic: defaultTopicByTransport(transport, 'UPLINK'),
      payloadEncoding: transport === 'TCP' || transport === 'UDP' ? 'HEX' : 'JSON',
      headersText: buildUplinkHeadersExample(transport),
    });
  };

  const fillUplinkDebugPayload = (mode: 'AUTO' | 'HEX' = 'AUTO') => {
    const transport = (uplinkDebugForm.getFieldValue('transport') || currentUplinkTransport) as string;
    if (mode === 'HEX') {
      uplinkDebugForm.setFieldsValue({
        payloadEncoding: 'HEX',
        payload: UPLINK_HEX_PAYLOAD_EXAMPLE,
      });
      return;
    }
    const payloadEncoding = transport === 'TCP' || transport === 'UDP' ? 'TEXT' : 'JSON';
    uplinkDebugForm.setFieldsValue({
      payloadEncoding,
      payload: buildUplinkPayloadExample(transport),
    });
  };

  const fillDownlinkDebugPayload = (messageType = currentDownlinkMessageType) => {
    downlinkDebugForm.setFieldsValue({
      messageType,
      topic: defaultTopicByTransport(debugRecord?.transport, 'DOWNLINK'),
      payloadText: buildDownlinkPayloadExample(messageType),
    });
  };

  const openCreateModal = () => {
    const createScopeType = filters.productId ? 'PRODUCT' : DEFAULT_EDITOR_VALUES.scopeType;
    const defaultProduct = filters.productId ? productMap.get(filters.productId) : undefined;
    const createBusinessIdentifiers: BusinessIdentifierPatch = {};
    if (currentTenant?.code) {
      createBusinessIdentifiers.tenantCode = currentTenant.code;
    }
    createBusinessIdentifiers.productKey =
      createScopeType === 'PRODUCT' ? defaultProduct?.productKey ?? null : null;
    editorForm.resetFields();
    editorForm.setFieldsValue({
      ...DEFAULT_EDITOR_VALUES,
      productId: filters.productId,
      scopeType: createScopeType,
      scopeId: undefined,
      // Start from a usable scenario default so users can refine instead of typing from empty JSON.
      matchRuleJson: buildMatchRulePreset(DEFAULT_EDITOR_VALUES.transport, DEFAULT_EDITOR_VALUES.direction),
      parserConfigJson: buildParserConfigPreset(
        'UPLINK_JSON_PROPERTY',
        DEFAULT_EDITOR_VALUES.transport,
        createBusinessIdentifiers,
      ),
    });
    setCurrentRecord(null);
    setEditorMode('create');
    setSelectedTemplateKey(undefined);
    setEditorStepIndex(0);
    setEditorMaxStepIndex(0);
    setEditorOpen(true);
  };

  const openEditModal = async (record: ProtocolParserRecord) => {
    setSubmitting(true);
    try {
      const response = await protocolParserApi.get(record.id);
      const detail = response.data.data as ProtocolParserRecord;
      const detailProduct = detail.productId ? productMap.get(detail.productId) : undefined;
      const detailBusinessIdentifiers: BusinessIdentifierPatch = {};
      if (currentTenant?.code) {
        detailBusinessIdentifiers.tenantCode = currentTenant.code;
      }
      if (detail.scopeType === 'TENANT') {
        detailBusinessIdentifiers.productKey = null;
      } else if (detailProduct?.productKey) {
        detailBusinessIdentifiers.productKey = detailProduct.productKey;
      }
      setCurrentRecord(detail);
      editorForm.resetFields();
      editorForm.setFieldsValue({
        productId: detail.productId || undefined,
        scopeType: detail.scopeType === 'TENANT' ? 'TENANT' : 'PRODUCT',
        scopeId: detail.scopeId || undefined,
        protocol: detail.protocol,
        transport: detail.transport,
        direction: (detail.direction || 'UPLINK') as 'UPLINK' | 'DOWNLINK',
        parserMode: (detail.parserMode === 'PLUGIN' ? 'PLUGIN' : 'SCRIPT') as 'SCRIPT' | 'PLUGIN',
        frameMode: detail.frameMode || 'NONE',
        matchRuleJson: prettyJson(detail.matchRuleJson),
        frameConfigJson: prettyJson(detail.frameConfigJson),
        parserConfigJson: prettyJson(
          injectBusinessIdentifiersIntoJson(detail.parserConfigJson || '{}', detailBusinessIdentifiers),
        ),
        visualConfigJson: prettyJson(
          detail.visualConfigJson ||
            defaultVisualConfigForDirection((detail.direction || 'UPLINK') as VisualFlowDirection),
        ),
        scriptLanguage: detail.scriptLanguage || 'JS',
        scriptContent: detail.scriptContent || '',
        pluginId: detail.pluginId || '',
        pluginVersion: detail.pluginVersion || '',
        timeoutMs: detail.timeoutMs || 50,
        errorPolicy: detail.errorPolicy || 'ERROR',
        releaseMode: (detail.releaseMode || 'ALL') as 'ALL' | 'DEVICE_LIST' | 'HASH_PERCENT',
        releaseConfigJson: prettyJson(detail.releaseConfigJson),
      });
      setSelectedTemplateKey(undefined);
      setEditorMode('edit');
      setEditorStepIndex(0);
      setEditorMaxStepIndex(0);
      setEditorOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载解析规则详情失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const buildEditorPayload = (values: EditorFormValues) => {
    if (values.scopeType === 'PRODUCT' && !values.productId) {
      throw new Error('产品级规则必须选择产品');
    }
    if (values.parserMode === 'SCRIPT' && !trimOptional(values.scriptContent)) {
      throw new Error('脚本模式必须填写脚本内容');
    }
    if (values.parserMode === 'PLUGIN' && !trimOptional(values.pluginId)) {
      throw new Error('插件模式必须填写插件 ID');
    }

    const payloadProduct = values.productId ? productMap.get(values.productId) : undefined;
    const payloadBusinessIdentifiers: BusinessIdentifierPatch = {};
    if (currentTenant?.code) {
      payloadBusinessIdentifiers.tenantCode = currentTenant.code;
    }
    payloadBusinessIdentifiers.productKey =
      values.scopeType === 'PRODUCT' ? payloadProduct?.productKey ?? null : null;

    return {
      productId: values.scopeType === 'PRODUCT' ? values.productId : undefined,
      scopeType: values.scopeType,
      scopeId: values.scopeId,
      protocol: values.protocol.trim(),
      transport: values.transport.trim(),
      direction: values.direction,
      parserMode: values.parserMode,
      frameMode: values.frameMode,
      matchRuleJson: ensureJsonObjectText(values.matchRuleJson, '匹配规则'),
      frameConfigJson: ensureJsonObjectText(values.frameConfigJson, '拆帧配置'),
      parserConfigJson: injectBusinessIdentifiersIntoJson(
        ensureJsonObjectText(values.parserConfigJson, '解析配置'),
        payloadBusinessIdentifiers,
      ),
      visualConfigJson: ensureJsonObjectText(values.visualConfigJson, '可视化配置'),
      scriptLanguage: values.parserMode === 'SCRIPT' ? trimOptional(values.scriptLanguage) || 'JS' : undefined,
      scriptContent: values.parserMode === 'SCRIPT' ? values.scriptContent : undefined,
      pluginId: values.parserMode === 'PLUGIN' ? trimOptional(values.pluginId) : undefined,
      pluginVersion: values.parserMode === 'PLUGIN' ? trimOptional(values.pluginVersion) : undefined,
      timeoutMs: values.timeoutMs,
      errorPolicy: values.errorPolicy,
      releaseMode: values.releaseMode,
      releaseConfigJson: ensureJsonObjectText(values.releaseConfigJson, '灰度配置'),
    };
  };

  const handleSubmitEditor = async (values: EditorFormValues) => {
    setSubmitting(true);
    try {
      const payload = buildEditorPayload(values);
      if (editorMode === 'create') {
        await protocolParserApi.create(payload);
        message.success('协议解析规则已创建');
      } else if (currentRecord) {
        await protocolParserApi.update(currentRecord.id, payload);
        message.success('协议解析规则已更新');
      }
      closeEditorModal();
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, '保存协议解析规则失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateVisualScript = () => {
    try {
      const direction = (editorForm.getFieldValue('direction') || 'UPLINK') as VisualFlowDirection;
      const rawVisualConfig = (editorForm.getFieldValue('visualConfigJson') || '{}') as string;
      const normalizedVisualConfig = normalizeVisualConfigText(rawVisualConfig, direction);
      const scriptContent = buildScriptFromVisualConfig(normalizedVisualConfig, direction);
      editorForm.setFieldsValue({
        parserMode: 'SCRIPT',
        scriptLanguage: 'JS',
        visualConfigJson: normalizedVisualConfig,
        scriptContent,
      });
      message.success('已根据可视化配置生成脚本');
    } catch (error) {
      message.error(getErrorMessage(error, '根据可视化配置生成脚本失败'));
    }
  };

  const openUplinkDebugModal = (record: ProtocolParserRecord) => {
    const transport = record.transport || 'TCP';
    setDebugRecord(record);
    setDebugResult(null);
    setEncodeResult(null);
    uplinkDebugForm.resetFields();
    uplinkDebugForm.setFieldsValue({
      ...DEFAULT_UPLINK_DEBUG_VALUES,
      productId: record.productId || filters.productId,
      protocol: record.protocol,
      transport,
      topic: defaultTopicByTransport(transport, 'UPLINK'),
      payloadEncoding: transport === 'TCP' || transport === 'UDP' ? 'HEX' : 'JSON',
      headersText: buildUplinkHeadersExample(transport),
    });
    setUplinkDebugOpen(true);
  };

  const openDownlinkDebugModal = (record: ProtocolParserRecord) => {
    setDebugRecord(record);
    setDebugResult(null);
    setEncodeResult(null);
    downlinkDebugForm.resetFields();
    downlinkDebugForm.setFieldsValue({
      ...DEFAULT_DOWNLINK_DEBUG_VALUES,
      productId: record.productId || filters.productId,
      topic: defaultTopicByTransport(record.transport, 'DOWNLINK'),
      payloadText: buildDownlinkPayloadExample(DEFAULT_DOWNLINK_DEBUG_VALUES.messageType),
    });
    setDownlinkDebugOpen(true);
  };

  const handleUplinkDebug = async (values: UplinkDebugFormValues) => {
    if (!debugRecord) {
      return;
    }
    setDebugSubmitting(true);
    try {
      const headers = parseOptionalStringMap(values.headersText, '请求头');
      const response = await protocolParserApi.test(debugRecord.id, {
        productId: values.productId,
        protocol: trimOptional(values.protocol),
        transport: trimOptional(values.transport),
        topic: trimOptional(values.topic),
        payloadEncoding: values.payloadEncoding,
        payload: values.payload,
        headers,
        sessionId: trimOptional(values.sessionId),
        remoteAddress: trimOptional(values.remoteAddress),
      });
      const data = response.data.data as DebugResult;
      setDebugResult(data);
      if (data.success) {
        message.success('上行调试完成');
      } else {
        message.warning(data.errorMessage || '上行调试返回异常');
      }
    } catch (error) {
      message.error(getErrorMessage(error, '执行上行调试失败'));
    } finally {
      setDebugSubmitting(false);
    }
  };

  const handleDownlinkDebug = async (values: DownlinkDebugFormValues) => {
    if (!debugRecord) {
      return;
    }
    setDebugSubmitting(true);
    try {
      const headers = parseOptionalStringMap(values.headersText, '请求头');
      const payload = parseRequiredObject(values.payloadText, '载荷');
      const response = await protocolParserApi.encodeTest(debugRecord.id, {
        productId: values.productId,
        topic: trimOptional(values.topic),
        messageType: trimOptional(values.messageType),
        deviceName: trimOptional(values.deviceName),
        headers,
        sessionId: trimOptional(values.sessionId),
        remoteAddress: trimOptional(values.remoteAddress),
        payload,
      });
      const data = response.data.data as EncodeDebugResult;
      setEncodeResult(data);
      if (data.success) {
        message.success('下行编码测试完成');
      } else {
        message.warning(data.errorMessage || '下行编码测试返回异常');
      }
    } catch (error) {
      message.error(getErrorMessage(error, '执行下行编码测试失败'));
    } finally {
      setDebugSubmitting(false);
    }
  };

  const fetchVersions = async (record: ProtocolParserRecord) => {
    setVersionLoading(true);
    try {
      const response = await protocolParserApi.versions(record.id);
      const items = (response.data.data || []) as ProtocolParserVersionRecord[];
      setVersionItems(items);
      return items;
    } catch (error) {
      message.error(getErrorMessage(error, '加载版本历史失败'));
      return [];
    } finally {
      setVersionLoading(false);
    }
  };

  const openVersionModal = async (record: ProtocolParserRecord) => {
    setVersionRecord(record);
    setVersionOpen(true);
    await fetchVersions(record);
  };

  const openPublishModal = (record: ProtocolParserRecord) => {
    setPublishRecord(record);
    publishForm.resetFields();
    setPublishOpen(true);
  };

  const handlePublish = async (values: PublishFormValues) => {
    if (!publishRecord) {
      return;
    }
    setPublishSubmitting(true);
    try {
      await protocolParserApi.publish(publishRecord.id, trimOptional(values.changeLog));
      message.success('协议解析规则已发布');
      setPublishOpen(false);
      setPublishRecord(null);
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, '发布协议解析规则失败'));
    } finally {
      setPublishSubmitting(false);
    }
  };

  const openRollbackModal = async (record: ProtocolParserRecord) => {
    setRollbackRecord(record);
    rollbackForm.resetFields();
    setRollbackOpen(true);
    const items = await fetchVersions(record);
    const option = items.find((item) => item.versionNo !== record.currentVersion);
    if (option) {
      rollbackForm.setFieldsValue({ version: option.versionNo });
    }
  };

  const handleRollback = async (values: RollbackFormValues) => {
    if (!rollbackRecord || !values.version) {
      return;
    }
    setRollbackSubmitting(true);
    try {
      await protocolParserApi.rollback(rollbackRecord.id, values.version);
      message.success('协议解析规则已回滚');
      setRollbackOpen(false);
      setRollbackRecord(null);
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, '回滚协议解析规则失败'));
    } finally {
      setRollbackSubmitting(false);
    }
  };

  const handleToggleStatus = async (record: ProtocolParserRecord) => {
    try {
      if (record.status === 'ENABLED') {
        await protocolParserApi.disable(record.id);
        message.success('协议解析规则已停用');
      } else {
        await protocolParserApi.enable(record.id);
        message.success('协议解析规则已启用');
      }
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, '切换规则状态失败'));
    }
  };

  const handleReloadPlugins = async () => {
    setRuntimeReloading(true);
    try {
      await protocolParserApi.reloadRuntimePlugins();
      message.success('运行时插件已重载');
      await fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, '重载运行时插件失败'));
    } finally {
      setRuntimeReloading(false);
    }
  };

  const versionColumns: ColumnsType<ProtocolParserVersionRecord> = [
    {
      title: '版本',
      dataIndex: 'versionNo',
      width: 100,
      render: (value: number) => <Tag color="blue">v{value}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'publishStatus',
      width: 140,
      render: (value?: string) => (value ? VERSION_STATUS_META[value] || value : '-'),
    },
    {
      title: '变更说明',
      dataIndex: 'changeLog',
      render: (value?: string) => value || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
  ];

  const rollbackVersionOptions = versionItems
    .filter((item) => item.versionNo !== rollbackRecord?.currentVersion)
    .map((item) => ({ value: item.versionNo, label: `v${item.versionNo}` }));

  const columns: ColumnsType<ProtocolParserRecord> = [
    {
      title: '作用域',
      width: 220,
      render: (_, record) => {
        const product = record.productId ? productMap.get(record.productId) : undefined;
        return (
          <Space direction="vertical" size={2}>
            <Space wrap>
              <Tag color={record.scopeType === 'TENANT' ? 'gold' : 'blue'}>
                {record.scopeType === 'TENANT' ? '租户默认级' : '产品级'}
              </Tag>
            </Space>
            <Text strong>{product ? product.name : record.scopeType === 'TENANT' ? currentTenantLabel : '未知产品'}</Text>
            <Text type="secondary">
              {record.scopeType === 'TENANT'
                ? `tenantCode：${currentTenant?.code || '-'}`
                : `ProductKey：${product?.productKey || '-'}`}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '协议',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Tag color={transportColor(record.transport)}>{record.transport}</Tag>
            <Tag>{record.protocol}</Tag>
            <Tag color={record.direction === 'DOWNLINK' ? 'purple' : 'green'}>
              {findOptionLabel(DIRECTION_OPTIONS, record.direction)}
            </Tag>
          </Space>
          <Text type="secondary">{findOptionLabel(FRAME_MODE_OPTIONS, record.frameMode || 'NONE')}</Text>
        </Space>
      ),
    },
    {
      title: '执行方式',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Tag color={record.parserMode === 'PLUGIN' ? 'magenta' : 'geekblue'}>
              {findOptionLabel(PARSER_MODE_OPTIONS, record.parserMode)}
            </Tag>
            <Tag>{findOptionLabel(ERROR_POLICY_OPTIONS, record.errorPolicy || 'ERROR')}</Tag>
          </Space>
          <Text type="secondary">
            {record.parserMode === 'PLUGIN'
              ? `${record.pluginId || '-'} ${record.pluginVersion || ''}`.trim()
              : `${record.scriptLanguage || 'JS'} · ${record.timeoutMs || 50} ms`}
          </Text>
        </Space>
      ),
    },
    {
      title: '灰度发布',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Tag color={record.releaseMode === 'ALL' ? 'default' : 'orange'}>
            {findOptionLabel(RELEASE_MODE_OPTIONS, record.releaseMode || 'ALL')}
          </Tag>
          <Text type="secondary">{formatReleaseSummary(record)}</Text>
        </Space>
      ),
    },
    {
      title: '版本',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>草稿 v{record.currentVersion || 1}</Text>
          <Text type="secondary">
            已发布 {record.publishedVersion ? `v${record.publishedVersion}` : '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value: string) => {
        const meta = STATUS_META[value] || { color: 'default', label: value };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
    {
      title: '操作',
      width: 380,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          {canUpdate ? (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openEditModal(record)}>
              编辑
            </Button>
          ) : null}
          {canTest && record.direction === 'UPLINK' ? (
            <Button type="link" size="small" icon={<BugOutlined />} onClick={() => openUplinkDebugModal(record)}>
              调试
            </Button>
          ) : null}
          {canTest && record.direction === 'DOWNLINK' ? (
            <Button type="link" size="small" icon={<BugOutlined />} onClick={() => openDownlinkDebugModal(record)}>
              编码测试
            </Button>
          ) : null}
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => void openVersionModal(record)}>
            版本
          </Button>
          {canPublish ? (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => openPublishModal(record)}>
              发布
            </Button>
          ) : null}
          {canPublish ? (
            <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => void openRollbackModal(record)}>
              回滚
            </Button>
          ) : null}
          {canUpdate ? (
            <Button
              type="link"
              size="small"
              icon={record.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => void handleToggleStatus(record)}
            >
              {record.status === 'ENABLED' ? '停用' : '启用'}
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="自定义协议解析"
        description={
          selectedProduct
            ? `共 ${total} 条规则，当前筛选产品：${selectedProduct.name} (${selectedProduct.productKey})`
            : `共 ${total} 条规则，覆盖产品级与租户默认级规则${currentTenant?.code ? `，当前租户 ${currentTenantLabel} (${currentTenant.code})` : ''}`
        }
        extra={
          <Space wrap>
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                新建规则
              </Button>
            ) : null}
            <Button icon={<ApiOutlined />} onClick={() => void fetchData()}>
              刷新规则
            </Button>
          </Space>
        }
      />

      <Card title="页面总览" size="small" style={{ marginBottom: 16, borderRadius: 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Tag color="blue">{currentTenant?.code ? `${currentTenantLabel} (${currentTenant.code})` : currentTenantLabel}</Tag>
            {selectedProduct ? <Tag color="gold">{`${selectedProduct.name} (${selectedProduct.productKey})`}</Tag> : <Tag>当前查看全部产品</Tag>}
            <Tag color="green">规则总数 {total}</Tag>
            <Tag>{`已加载插件 ${runtimePlugins.length}`}</Tag>
          </Space>
          <Row gutter={[12, 12]}>
            {overviewItems.map((item) => (
              <Col xs={12} md={6} key={item.title}>
                <Card size="small" style={{ borderRadius: 14, background: '#fafafa' }}>
                  <Text type="secondary">{item.title}</Text>
                  <div style={{ fontSize: 28, fontWeight: 700, color: item.color }}>{item.value}</div>
                </Card>
              </Col>
            ))}
          </Row>
        </Space>
      </Card>

      <Tabs
        activeKey={mainTabKey}
        onChange={(key) => setMainTabKey(key as 'rules' | 'runtime')}
        items={[
          { key: 'rules', label: '规则维护' },
          { key: 'runtime', label: '运行时状态' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {mainTabKey === 'rules' ? (
        <Card title="筛选条件" size="small" className="ff-query-card" style={{ marginBottom: 16, borderRadius: 16 }}>
          <div className="ff-query-bar">
            <div className="ff-query-field" style={{ width: 240 }}>
              <Select
                allowClear
                showSearch
                loading={productLoading}
                value={draftFilters.productId}
                style={{ width: '100%' }}
                placeholder="按产品筛选"
                options={productOptions}
                optionFilterProp="label"
                onChange={(value) => {
                  setDraftFilters((current) => ({ ...current, productId: value }));
                }}
              />
            </div>
            <div className="ff-query-field" style={{ width: 180 }}>
              <Select
                allowClear
                showSearch
                value={draftFilters.protocol}
                style={{ width: '100%' }}
                placeholder="协议"
                options={protocolOptions}
                optionFilterProp="label"
                onChange={(value) => {
                  setDraftFilters((current) => ({ ...current, protocol: value }));
                }}
              />
            </div>
            <div className="ff-query-field" style={{ width: 180 }}>
              <Select
                allowClear
                showSearch
                value={draftFilters.transport}
                style={{ width: '100%' }}
                placeholder="传输方式"
                options={transportOptions}
                optionFilterProp="label"
                onChange={(value) => {
                  setDraftFilters((current) => ({ ...current, transport: value }));
                }}
              />
            </div>
            <div className="ff-query-field" style={{ width: 150 }}>
              <Select
                allowClear
                value={draftFilters.status}
                style={{ width: '100%' }}
                placeholder="状态"
                options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
                onChange={(value) => {
                  setDraftFilters((current) => ({ ...current, status: value }));
                }}
              />
            </div>
            <div className="ff-query-actions">
              <Space wrap>
                <Button type="primary" onClick={applyFilters}>
                  查询
                </Button>
                <Button
                  onClick={() => {
                    resetFilters();
                  }}
                >
                  重置
                </Button>
                <Button icon={<ApiOutlined />} onClick={() => void fetchData()}>
                  刷新规则
                </Button>
              </Space>
            </div>
          </div>
        </Card>
      ) : null}

      {mainTabKey === 'runtime' ? <ProtocolParserRuntimePanel
        loading={runtimeLoading}
        reloading={runtimeReloading}
        metrics={runtimeMetrics}
        plugins={runtimePlugins}
        catalog={runtimeCatalog}
        onRefresh={() => void fetchRuntime()}
        onReload={() => void handleReloadPlugins()}
      /> : null}

      {mainTabKey === 'rules' ? <Card title="规则列表" size="small" style={{ borderRadius: 16 }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={records}
          scroll={{ x: 1700 }}
          locale={{ emptyText: <Empty description="暂无协议解析规则" /> }}
          pagination={{
            current: pageNum,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPageNum(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card> : null}

      <Drawer
        title={editorMode === 'create' ? '新建协议解析规则' : '编辑协议解析规则'}
        open={editorOpen}
        width={1280}
        destroyOnClose
        onClose={closeEditorModal}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeEditorModal}>取消</Button>
            {editorStepIndex > 0 ? <Button onClick={() => moveToEditorStep(editorStepIndex - 1)}>上一步</Button> : null}
            {isLastEditorStep ? (
              <Button type="primary" loading={submitting} onClick={() => editorForm.submit()}>
              {editorMode === 'create' ? '新建协议解析规则' : '保存协议解析规则'}
            </Button>
            ) : (
              <Button type="primary" onClick={() => void handleEditorNextStep()}>
                下一步
              </Button>
            )}
          </Space>
        }
      >
        <Form form={editorForm} layout="vertical" onFinish={handleSubmitEditor}>
          <Steps
            current={editorStepIndex}
            items={editorStepItems}
            onChange={(step) => void handleEditorStepChange(step)}
            size="small"
            style={{ marginBottom: 16 }}
          />
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={EDITOR_STEPS[editorStepIndex].description}
            description="抽屉会保留已经填写的内容，你可以返回前面的步骤继续调整。"
          />
          <Row gutter={[16, 16]} align="top">
            <Col xs={24} xl={16}>
          {editorStepIndex === 0 ? (
          <>
          <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={10}>
                <Form.Item label="模板" style={{ marginBottom: 0 }}>
                  <Select
                    allowClear
                    showSearch
                    placeholder="选择解析模板"
                    value={selectedTemplateKey}
                    options={templateOptions}
                    optionFilterProp="label"
                    onChange={(value) => setSelectedTemplateKey(value)}
                  />
                </Form.Item>
                <Space wrap style={{ marginTop: 12 }}>
                  {quickTemplates.map((item) => (
                    <Button
                      key={item.key}
                      size="small"
                      type={selectedTemplateKey === item.key ? 'primary' : 'default'}
                      onClick={() => {
                        setSelectedTemplateKey(item.key);
                        applyTemplate(item);
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
                </Space>
              </Col>
              <Col xs={24} lg={14}>
                {selectedTemplate ? (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{selectedTemplate.label}</Text>
                      <Tag color={transportColor(selectedTemplate.transport)}>{selectedTemplate.transport}</Tag>
                      <Tag>{selectedTemplate.protocol}</Tag>
                      <Tag color="green">{findOptionLabel(DIRECTION_OPTIONS, selectedTemplate.direction)}</Tag>
                      {selectedTemplate.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </Space>
                    <Text type="secondary">{selectedTemplate.description}</Text>
                    <Alert type="info" showIcon message={selectedTemplate.tip} />
                    <Space wrap>
                      <Button onClick={() => applyTemplate(selectedTemplate)}>应用模板</Button>
                      <Text type="secondary">模板只会覆盖解析相关字段，会保留你当前选择的作用域。</Text>
                    </Space>
                  </Space>
                ) : (
                  <Text type="secondary">模板覆盖上行和下行常见场景，先一键填充，再做细化调整会更高效。</Text>
                )}
              </Col>
            </Row>
          </Card>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="scopeType" label="作用域">
                <Select options={SCOPE_TYPE_OPTIONS} onChange={handleEditorScopeTypeChange} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="productId"
                label="产品"
                rules={[
                  {
                    validator: (_, value) => {
                      if (currentScopeType === 'PRODUCT' && !value) {
                        return Promise.reject(new Error('产品级规则必须选择产品'));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
              >
                <Select
                  allowClear
                  showSearch
                  disabled={currentScopeType === 'TENANT'}
                  placeholder={currentScopeType === 'TENANT' ? '租户默认级规则无需选择产品' : '选择产品'}
                  options={productOptions}
                  optionFilterProp="label"
                  onChange={handleEditorProductChange}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="scopeId" hidden>
            <InputNumber min={1} />
          </Form.Item>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} message={editorScopeSummary} />
          </>
          ) : null}

          {editorStepIndex === 1 ? <><Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item
                name="protocol"
                label="协议"
                extra="用于匹配协议族，例如 TCP_UDP、MQTT、HTTP。"
                rules={[{ required: true, message: '请选择协议' }]}
              >
                <Select showSearch options={protocolOptions} optionFilterProp="label" placeholder="选择协议" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="transport"
                label="传输方式"
                extra="用于匹配实际通道；TCP/UDP 共用协议族 TCP_UDP，但运行时仍需区分 TCP 与 UDP。"
                rules={[{ required: true, message: '请选择传输方式' }]}
              >
                <Select
                  showSearch
                  options={transportOptions}
                  optionFilterProp="label"
                  placeholder="选择传输方式"
                  onChange={handleEditorTransportChange}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="direction" label="方向">
                <Select options={DIRECTION_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="timeoutMs" label="超时时间（ms）" rules={[{ required: true, message: '请输入超时时间' }]}>
                <InputNumber min={1} max={60000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="parserMode" label="解析方式">
                <Select options={PARSER_MODE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="frameMode" label="拆帧模式">
                <Select options={FRAME_MODE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="errorPolicy" label="异常策略">
                <Select options={ERROR_POLICY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="一条解析规则即可覆盖产品级、租户默认级、上行解码、下行编码、灰度发布和可视化流配置。"
            description={
              currentDirection === 'DOWNLINK'
                ? `下行规则会用于运行时编码和编码测试接口，当前推荐主题：${editorTopicOptions[0]?.value || defaultTopicByTransport(currentEditorTransport, 'DOWNLINK')}`
                : `上行规则会用于运行时解析、设备标识匹配和调试解析接口，当前推荐主题：${editorTopicOptions[0]?.value || defaultTopicByTransport(currentEditorTransport, 'UPLINK')}`
            }
          />

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item
                name="matchRuleJson"
                label="匹配规则 JSON"
                extra={
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">
                      支持 topicPrefix、topicEquals、messageTypeEquals、deviceNameEquals、productKeyEquals、headerEquals 和
                      remoteAddressPrefix。
                    </Text>
                    <Space wrap>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset('matchRuleJson', buildMatchRulePreset(currentEditorTransport, currentDirection))
                        }
                      >
                        按默认主题
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset(
                            'matchRuleJson',
                            formatJson({
                              topicEquals: defaultTopicByTransport(currentEditorTransport, currentDirection),
                            }),
                          )
                        }
                      >
                        精确主题
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset(
                            'matchRuleJson',
                            formatJson({
                              headerEquals: {
                                'content-type': 'application/json',
                              },
                            }),
                          )
                        }
                      >
                        按请求头
                      </Button>
                      <Button
                        size="small"
                        icon={<FullscreenOutlined />}
                        onClick={() => openFullscreenEditor('matchRuleJson')}
                      >
                        全屏编辑
                      </Button>
                    </Space>
                  </Space>
                }
                rules={[
                  { required: true, message: '请输入匹配规则 JSON' },
                  { validator: validateJsonObjectRule('matchRuleJson') },
                ]}
              >
                <ProtocolCodeEditor language="json" path="file:///protocol-parser/matchRule.json" height={220} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="frameConfigJson"
                label="拆帧配置 JSON"
                extra={
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">可使用 delimiter、fixedLength 或长度字段配置完成 TCP/UDP 报文切分。</Text>
                    <Space wrap>
                      <Button
                        size="small"
                        onClick={() => applyEditorJsonPreset('frameConfigJson', buildFrameConfigPreset(currentFrameMode))}
                      >
                        按当前模式
                      </Button>
                      <Button
                        size="small"
                        onClick={() => applyEditorJsonPreset('frameConfigJson', buildFrameConfigPreset('DELIMITER'))}
                      >
                        换行分隔
                      </Button>
                      <Button
                        size="small"
                        onClick={() => applyEditorJsonPreset('frameConfigJson', buildFrameConfigPreset('FIXED_LENGTH'))}
                      >
                        固定 32 字节
                      </Button>
                      <Button
                        size="small"
                        onClick={() => applyEditorJsonPreset('frameConfigJson', buildFrameConfigPreset('LENGTH_FIELD'))}
                      >
                        2 字节长度字段
                      </Button>
                      <Button
                        size="small"
                        icon={<FullscreenOutlined />}
                        onClick={() => openFullscreenEditor('frameConfigJson')}
                      >
                        全屏编辑
                      </Button>
                    </Space>
                  </Space>
                }
                rules={[
                  { required: true, message: '请输入拆帧配置 JSON' },
                  { validator: validateJsonObjectRule('frameConfigJson') },
                ]}
              >
                <ProtocolCodeEditor language="json" path="file:///protocol-parser/frameConfig.json" height={220} />
              </Form.Item>
            </Col>
          </Row>

          </> : null}

          {editorStepIndex === 2 ? <><Form.Item
            name="parserConfigJson"
            label="解析配置 JSON"
            extra={
              <Space direction="vertical" size={4}>
                <Text type="secondary">会注入到运行时的 ctx.config，供脚本或插件执行时使用。</Text>
                <Text type="secondary">系统会自动补齐 tenantCode 和 ProductKey，避免把数据库主键暴露给页面用户。</Text>
                <Space wrap>
                  {currentDirection === 'DOWNLINK' ? (
                    <>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset(
                            'parserConfigJson',
                            buildDownlinkJsonParserConfig(currentEditorTransport, editorBusinessIdentifiers),
                          )
                        }
                      >
                        JSON 下发
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset(
                            'parserConfigJson',
                            buildDownlinkHexParserConfig(currentEditorTransport, editorBusinessIdentifiers),
                          )
                        }
                      >
                        HEX 下发
                      </Button>
                      <Button
                        size="small"
                        icon={<FullscreenOutlined />}
                        onClick={() => openFullscreenEditor('parserConfigJson')}
                      >
                        全屏编辑
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset(
                            'parserConfigJson',
                            buildJsonPropertyParserConfig(currentEditorTransport, editorBusinessIdentifiers),
                          )
                        }
                      >
                        JSON 属性
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset(
                            'parserConfigJson',
                            buildTextPairParserConfig(currentEditorTransport, editorBusinessIdentifiers),
                          )
                        }
                      >
                        文本键值对
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset(
                            'parserConfigJson',
                            buildRawDataParserConfig(currentEditorTransport, editorBusinessIdentifiers),
                          )
                        }
                      >
                        原始透传
                      </Button>
                      <Button
                        size="small"
                        icon={<FullscreenOutlined />}
                        onClick={() => openFullscreenEditor('parserConfigJson')}
                      >
                        全屏编辑
                      </Button>
                    </>
                  )}
                </Space>
              </Space>
            }
            rules={[
              { required: true, message: '请输入解析配置 JSON' },
              { validator: validateJsonObjectRule('parserConfigJson') },
            ]}
          >
            <ProtocolCodeEditor language="json" path="file:///protocol-parser/parserConfig.json" height={220} />
          </Form.Item>

          <Card
            size="small"
            title="可视化流"
            extra={
              <Space>
                <Button
                  onClick={() =>
                    applyEditorJsonPreset(
                      'visualConfigJson',
                      defaultVisualConfigForDirection(currentDirection as VisualFlowDirection),
                    )
                  }
                >
                  当前方向默认值
                </Button>
                <Button
                  onClick={() =>
                    applyEditorJsonPreset('visualConfigJson', defaultVisualConfigForDirection('UPLINK'))
                  }
                >
                  上行默认值
                </Button>
                <Button
                  onClick={() =>
                    applyEditorJsonPreset('visualConfigJson', defaultVisualConfigForDirection('DOWNLINK'))
                  }
                >
                  下行默认值
                </Button>
                <Button onClick={handleGenerateVisualScript}>生成脚本</Button>
              </Space>
            }
            style={{ marginBottom: 16, borderRadius: 12 }}
          >
            <Form.Item
              name="visualConfigJson"
              label="可视化配置 JSON"
              extra={
                <Space wrap>
                  <Text type="secondary">三期轻量可视化编排：维护结构化配置，并一键生成 JS 脚本。</Text>
                  <Button
                    size="small"
                    icon={<FullscreenOutlined />}
                    onClick={() => openFullscreenEditor('visualConfigJson')}
                  >
                    全屏编辑
                  </Button>
                </Space>
              }
              rules={[
                { required: true, message: '请输入可视化配置 JSON' },
                { validator: validateJsonObjectRule('visualConfigJson') },
              ]}
              style={{ marginBottom: 0 }}
            >
              <ProtocolCodeEditor language="json" path="file:///protocol-parser/visualConfig.json" height={220} />
            </Form.Item>
          </Card>

          {currentParserMode === 'SCRIPT' ? (
            <>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="scriptLanguage" label="脚本语言">
                    <Select options={SCRIPT_LANGUAGE_OPTIONS} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="scriptContent"
                label="脚本内容"
                extra={
                  <Space wrap>
                    <Button
                      size="small"
                      icon={<FullscreenOutlined />}
                      onClick={() => openFullscreenEditor('scriptContent')}
                    >
                      全屏编辑
                    </Button>
                    <Text type="secondary">长脚本建议切到全屏后再写，保存仍以当前表单内容为准。</Text>
                  </Space>
                }
                rules={[
                  {
                    validator: async (_, value?: string) =>
                      trimOptional(value) ? Promise.resolve() : Promise.reject(new Error('请输入脚本内容')),
                  },
                ]}
              >
                <ProtocolCodeEditor language="javascript" path="file:///protocol-parser/scriptContent.js" height={320} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="pluginId"
                label="插件 ID"
                rules={[
                  {
                    validator: async (_, value?: string) =>
                      trimOptional(value) ? Promise.resolve() : Promise.reject(new Error('请输入插件 ID')),
                  },
                ]}
                extra={
                  pluginOptions.length > 0
                    ? '优先从下拉中选择已安装或目录可见的插件，减少手工输入错误。'
                    : '插件可从 classpath 或 plugins/protocol-parsers 目录加载。'
                }
              >
                <Select
                  showSearch
                  options={pluginOptions}
                  optionFilterProp="label"
                  placeholder="选择插件"
                />
              </Form.Item>
              <Form.Item name="pluginVersion" label="插件版本">
                <Select
                  allowClear
                  showSearch
                  options={pluginVersionOptions}
                  optionFilterProp="label"
                  placeholder="优先使用检测到的版本"
                />
              </Form.Item>
            </>
          )}
          </> : null}

          {editorStepIndex === 3 ? <><Card
            size="small"
            title="灰度发布"
            extra={
              <Space wrap>
                <Button onClick={() => editorForm.setFieldsValue({ releaseMode: 'ALL', releaseConfigJson: '{}' })}>
                  全量发布
                </Button>
                <Button
                  onClick={() =>
                    editorForm.setFieldsValue({
                      releaseMode: 'DEVICE_LIST',
                      releaseConfigJson: releaseModePreset('DEVICE_LIST'),
                    })
                  }
                >
                  设备名单
                </Button>
                <Button
                  onClick={() =>
                    editorForm.setFieldsValue({
                      releaseMode: 'HASH_PERCENT',
                      releaseConfigJson: releaseModePreset('HASH_PERCENT'),
                    })
                  }
                >
                  灰度 10%
                </Button>
                <Button onClick={() => editorForm.setFieldsValue({ releaseConfigJson: releaseModePreset(currentReleaseMode) })}>
                  按当前模式填充
                </Button>
              </Space>
            }
            style={{ borderRadius: 12 }}
          >
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="releaseMode" label="发布方式">
                  <Select options={RELEASE_MODE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item
                  name="releaseConfigJson"
                  label="灰度配置 JSON"
                  extra={
                    <Space direction="vertical" size={4}>
                      <Text type="secondary">
                        ALL 使用 {'{}'}，DEVICE_LIST 优先使用 deviceNames，HASH_PERCENT 使用 {'{ percent }'}。
                      </Text>
                      <Space wrap>
                        <Button size="small" onClick={() => applyEditorJsonPreset('releaseConfigJson', '{}')}>
                          空配置
                        </Button>
                        <Button
                          size="small"
                          onClick={() =>
                            applyEditorJsonPreset('releaseConfigJson', releaseModePreset('DEVICE_LIST'))
                          }
                        >
                          设备名单示例
                        </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          applyEditorJsonPreset('releaseConfigJson', releaseModePreset('HASH_PERCENT'))
                        }
                      >
                        百分比示例
                      </Button>
                      <Button
                        size="small"
                        icon={<FullscreenOutlined />}
                        onClick={() => openFullscreenEditor('releaseConfigJson')}
                      >
                        全屏编辑
                      </Button>
                    </Space>
                  </Space>
                }
                  rules={[
                    { required: true, message: '请输入灰度配置 JSON' },
                    { validator: validateJsonObjectRule('releaseConfigJson') },
                  ]}
                >
                  <ProtocolCodeEditor language="json" path="file:///protocol-parser/releaseConfig.json" height={220} />
                </Form.Item>
              </Col>
            </Row>
          </Card>
          </> : null}

          {editorStepIndex === 4 ? (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" title="关键信息确认" style={{ borderRadius: 12 }}>
                <Descriptions size="small" column={1} bordered>
                  {editorPreviewSummary.map((item) => (
                    <Descriptions.Item key={item.key} label={item.label}>
                      {item.value}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Card>

              <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                  <Card size="small" title="匹配规则" style={{ borderRadius: 12 }}>
                    <TextArea
                      readOnly
                      value={(editorForm.getFieldValue('matchRuleJson') as string) || '{}'}
                      autoSize={{ minRows: 6, maxRows: 12 }}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card size="small" title="拆帧配置" style={{ borderRadius: 12 }}>
                    <TextArea
                      readOnly
                      value={(editorForm.getFieldValue('frameConfigJson') as string) || '{}'}
                      autoSize={{ minRows: 6, maxRows: 12 }}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card size="small" title="解析配置" style={{ borderRadius: 12 }}>
                    <TextArea
                      readOnly
                      value={(editorForm.getFieldValue('parserConfigJson') as string) || '{}'}
                      autoSize={{ minRows: 6, maxRows: 12 }}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card size="small" title="可视化流" style={{ borderRadius: 12 }}>
                    <TextArea
                      readOnly
                      value={(editorForm.getFieldValue('visualConfigJson') as string) || '{}'}
                      autoSize={{ minRows: 6, maxRows: 12 }}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card size="small" title={currentParserMode === 'SCRIPT' ? '脚本内容' : '插件信息'} style={{ borderRadius: 12 }}>
                    {currentParserMode === 'SCRIPT' ? (
                      <TextArea
                        readOnly
                        value={(editorForm.getFieldValue('scriptContent') as string) || ''}
                        autoSize={{ minRows: 8, maxRows: 16 }}
                        style={{ fontFamily: 'monospace' }}
                      />
                    ) : (
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label="插件 ID">
                          {(editorForm.getFieldValue('pluginId') as string) || '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label="插件版本">
                          {(editorForm.getFieldValue('pluginVersion') as string) || '自动选择'}
                        </Descriptions.Item>
                      </Descriptions>
                    )}
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card size="small" title="发布配置" style={{ borderRadius: 12 }}>
                    <TextArea
                      readOnly
                      value={(editorForm.getFieldValue('releaseConfigJson') as string) || '{}'}
                      autoSize={{ minRows: 8, maxRows: 16 }}
                      style={{ fontFamily: 'monospace' }}
                    />
                  </Card>
                </Col>
              </Row>
            </Space>
          ) : null}
            </Col>
            <Col xs={24} xl={8}>
              <Space direction="vertical" size={16} style={{ width: '100%', position: 'sticky', top: 0 }}>
                <Card
                  size="small"
                  title="编辑进度"
                  extra={<Text type="secondary">{readyEditorStepCount}/{EDITOR_CONFIG_STEP_COUNT} 步就绪</Text>}
                  style={{ borderRadius: 12 }}
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Progress percent={editorProgressPercent} size="small" status="active" />
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      {EDITOR_STEPS.map((step, index) => {
                        const stepCheck = editorStepChecks[index] || { ready: true, issues: [] };
                        const stepClickable = index !== editorStepIndex && index <= editorMaxStepIndex;
                        const statusLabel =
                          index === editorStepIndex
                            ? '当前步骤'
                            : stepCheck.ready
                              ? '已就绪'
                              : '待补齐';
                        const statusColor = index === editorStepIndex ? 'processing' : stepCheck.ready ? 'success' : 'default';
                        return (
                          <Card
                            key={step.title}
                            size="small"
                            hoverable={stepClickable}
                            bodyStyle={{ padding: 12 }}
                            onClick={stepClickable ? () => void handleEditorStepChange(index) : undefined}
                            style={{
                              borderRadius: 10,
                              borderColor: index === editorStepIndex ? '#1677ff' : undefined,
                              background: index === editorStepIndex ? '#f0f7ff' : undefined,
                              cursor: stepClickable ? 'pointer' : 'default',
                            }}
                          >
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Space wrap align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                                <Text strong>{`${index + 1}. ${step.title}`}</Text>
                                <Tag color={statusColor}>{statusLabel}</Tag>
                              </Space>
                              <Text type="secondary">{step.description}</Text>
                              {stepCheck.issues.length > 0 && index !== EDITOR_STEPS.length - 1 ? (
                                <Text type="secondary">{`待补齐 ${stepCheck.issues.length} 项`}</Text>
                              ) : null}
                            </Space>
                          </Card>
                        );
                      })}
                    </Space>
                  </Space>
                </Card>

                <Card
                  size="small"
                  title="当前步骤检查"
                  extra={
                    <Space size={8}>
                      {EDITOR_STEP_JSON_FIELDS[editorStepIndex].length > 0 ? (
                        <Button
                          size="small"
                          onClick={() => formatEditorJsonFields(EDITOR_STEP_JSON_FIELDS[editorStepIndex])}
                        >
                          格式化 JSON
                        </Button>
                      ) : null}
                      <Button size="small" onClick={() => void handleValidateCurrentEditorStep()}>
                        校验本步
                      </Button>
                    </Space>
                  }
                  style={{ borderRadius: 12 }}
                >
                  {currentEditorStepCheck.ready ? (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Alert
                        type="success"
                        showIcon
                        message="当前步骤已满足进入下一步的条件"
                      />
                      {editorStepIndex >= 1 && editorStepIndex <= 3 ? (
                        <Text type="secondary">
                          未手改过的默认 JSON 会跟随协议、方向、拆帧或发布方式自动同步。
                        </Text>
                      ) : null}
                    </Space>
                  ) : (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Alert
                        type="warning"
                        showIcon
                        message={`当前步骤还需补齐 ${currentEditorStepCheck.issues.length} 项`}
                      />
                      {editorStepIndex >= 1 && editorStepIndex <= 3 ? (
                        <Text type="secondary">
                          如果刚切过协议、方向、拆帧或发布方式，可以先看默认 JSON 是否已经自动同步。
                        </Text>
                      ) : null}
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        {currentEditorStepCheck.issues.map((issue) => (
                          <Text key={issue} type="secondary">{`- ${issue}`}</Text>
                        ))}
                      </Space>
                    </Space>
                  )}
                </Card>

                <Card size="small" title="当前摘要" style={{ borderRadius: 12 }}>
                  <Descriptions size="small" column={1}>
                    {editorPreviewSummary.map((item) => (
                      <Descriptions.Item key={item.key} label={item.label}>
                        {item.value}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </Card>
              </Space>
            </Col>
          </Row>
        </Form>
      </Drawer>

      <Modal
        title={currentFullscreenEditorMeta ? `${currentFullscreenEditorMeta.label}全屏编辑` : '代码全屏编辑'}
        open={Boolean(fullscreenEditorField)}
        width="96vw"
        destroyOnClose={false}
        onCancel={() => setFullscreenEditorField(null)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            {fullscreenEditorField && fullscreenEditorField !== 'scriptContent' ? (
              <Button onClick={handleFormatFullscreenEditor}>格式化 JSON</Button>
            ) : null}
            <Button onClick={() => setFullscreenEditorField(null)}>关闭</Button>
          </Space>
        }
        styles={{ body: { paddingTop: 12 } }}
      >
        {currentFullscreenEditorMeta ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message={`${currentFullscreenEditorMeta.label}会直接同步当前表单内容。`}
              description={currentFullscreenEditorMeta.fullscreenTip}
            />
            <ProtocolCodeEditor
              language={currentFullscreenEditorMeta.language}
              path={currentFullscreenEditorMeta.fullscreenPath}
              height="72vh"
              value={currentFullscreenEditorValue}
              onChange={handleFullscreenEditorChange}
            />
          </Space>
        ) : null}
      </Modal>

      <Drawer
        title={debugRecord ? `上行调试 · ${describeRecordScope(debugRecord)}` : '上行调试'}
        open={uplinkDebugOpen}
        width={960}
        destroyOnClose
        onClose={() => setUplinkDebugOpen(false)}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setUplinkDebugOpen(false)}>取消</Button>
            <Button type="primary" loading={debugSubmitting} onClick={() => uplinkDebugForm.submit()}>
              执行上行调试
            </Button>
          </Space>
        }
      >
        <Form form={uplinkDebugForm} layout="vertical" preserve={false} onFinish={handleUplinkDebug}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="优先使用下拉和示例填充，通常只需选择传输方式并准备载荷即可完成上行调试。"
          />
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="productId" label="调试产品">
                <Select
                  allowClear
                  showSearch
                  options={productOptions}
                  optionFilterProp="label"
                  placeholder="租户默认级规则调试时请选择产品"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="protocol" label="协议">
                <Select showSearch options={protocolOptions} optionFilterProp="label" placeholder="选择协议" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="transport" label="传输方式">
                <Select
                  showSearch
                  options={transportOptions}
                  optionFilterProp="label"
                  placeholder="选择传输方式"
                  onChange={handleUplinkTransportChange}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="topic" label="主题 / 路径">
                <Select
                  showSearch
                  options={uplinkTopicOptions}
                  optionFilterProp="label"
                  placeholder="选择主题"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="payloadEncoding" label="载荷编码">
                <Select options={PAYLOAD_ENCODING_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sessionId" label="会话 ID">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="remoteAddress" label="远端地址">
                <Input placeholder="10.0.0.10:9000" />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Alert
                type="warning"
                showIcon
                message="请确认载荷中包含可识别设备的字段，调试时会自动匹配设备。"
              />
            </Col>
          </Row>
          <Form.Item
            name="payload"
            label="载荷"
            extra={
              <Space wrap>
                <Button size="small" onClick={() => fillUplinkDebugPayload('AUTO')}>
                  填充示例载荷
                </Button>
                <Button size="small" onClick={() => fillUplinkDebugPayload('HEX')}>
                  填充 HEX 示例
                </Button>
              </Space>
            }
            rules={[{ required: true, message: '请输入载荷' }]}
          >
            <TextArea rows={6} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item
            name="headersText"
            label="请求头 JSON"
            extra={
              <Space wrap>
                <Button
                  size="small"
                  onClick={() =>
                    uplinkDebugForm.setFieldsValue({
                      headersText: buildUplinkHeadersExample(
                        (uplinkDebugForm.getFieldValue('transport') || currentUplinkTransport) as string,
                      ),
                    })
                  }
                >
                  按传输方式填充
                </Button>
                <Button size="small" onClick={() => uplinkDebugForm.setFieldsValue({ headersText: '{}' })}>
                  清空请求头
                </Button>
              </Space>
            }
          >
            <TextArea rows={6} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>

        {debugResult ? (
          <Card size="small" style={{ marginTop: 16, borderRadius: 12 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Alert
                type={debugResult.success ? 'success' : 'error'}
                showIcon
                message={debugResult.success ? '上行调试成功' : '上行调试失败'}
                description={
                  debugResult.success
                    ? `匹配版本 v${debugResult.matchedVersion || '-'}，耗时 ${debugResult.costMs || 0} ms`
                    : debugResult.errorMessage || '未知错误'
                }
              />

              {debugResult.identity ? (
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="识别模式">{debugResult.identity.mode || '-'}</Descriptions.Item>
                  <Descriptions.Item label="产品 Key">{debugResult.identity.productKey || '-'}</Descriptions.Item>
                  <Descriptions.Item label="设备名称">{debugResult.identity.deviceName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="标识类型">{debugResult.identity.locatorType || '-'}</Descriptions.Item>
                  <Descriptions.Item label="标识值">{debugResult.identity.locatorValue || '-'}</Descriptions.Item>
                </Descriptions>
              ) : null}

              <div>
                <Text strong>输出消息（{debugResult.messages?.length || 0}）</Text>
                {debugResult.messages && debugResult.messages.length > 0 ? (
                  <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
                    {debugResult.messages.map((item, index) => (
                      <Card key={`${item.messageId || 'msg'}-${index}`} size="small">
                        <Descriptions bordered size="small" column={2}>
                          <Descriptions.Item label="消息 ID">{item.messageId || '-'}</Descriptions.Item>
                          <Descriptions.Item label="类型">{item.type || '-'}</Descriptions.Item>
                          <Descriptions.Item label="主题" span={2}>
                            {item.topic || '-'}
                          </Descriptions.Item>
                          <Descriptions.Item label="设备名称">{item.deviceName || '-'}</Descriptions.Item>
                          <Descriptions.Item label="时间戳">{item.timestamp || '-'}</Descriptions.Item>
                        </Descriptions>
                        <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
                          <pre
                            style={{
                              margin: 0,
                              padding: 12,
                              borderRadius: 8,
                              background: '#111827',
                              color: '#f9fafb',
                              overflow: 'auto',
                              fontSize: 12,
                            }}
                          >
                            {formatJson(item.payload)}
                          </pre>
                        </Paragraph>
                      </Card>
                    ))}
                  </Space>
                ) : (
                  <Empty description="未返回消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            </Space>
          </Card>
        ) : null}
      </Drawer>

      <Drawer
        title={debugRecord ? `下行编码测试 · ${describeRecordScope(debugRecord)}` : '下行编码测试'}
        open={downlinkDebugOpen}
        width={920}
        destroyOnClose
        onClose={() => setDownlinkDebugOpen(false)}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setDownlinkDebugOpen(false)}>取消</Button>
            <Button type="primary" loading={debugSubmitting} onClick={() => downlinkDebugForm.submit()}>
              执行下行编码测试
            </Button>
          </Space>
        }
      >
        <Form form={downlinkDebugForm} layout="vertical" preserve={false} onFinish={handleDownlinkDebug}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="优先选择主题和消息类型，再一键填充示例载荷，可以快速验证下行编码结果。"
          />
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="productId" label="调试产品">
                <Select
                  allowClear
                  showSearch
                  options={productOptions}
                  optionFilterProp="label"
                  placeholder="租户默认级规则调试时请选择产品"
                  onChange={() => downlinkDebugForm.setFieldsValue({ deviceName: undefined })}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="topic" label="主题">
                <Select
                  showSearch
                  options={downlinkTopicOptions}
                  optionFilterProp="label"
                  placeholder="选择主题"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="messageType" label="消息类型" rules={[{ required: true, message: '请选择消息类型' }]}>
                <Select showSearch options={messageTypeOptions} optionFilterProp="label" placeholder="选择消息类型" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="deviceName" label="设备名称">
                <Select
                  placeholder={currentDownlinkProductId ? '请选择设备名称' : '可先选择产品再选择设备'}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={downlinkDeviceOptions}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sessionId" label="会话 ID">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="remoteAddress" label="远端地址">
                <Input placeholder="10.0.0.10:9000" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="headersText" label="请求头 JSON">
                <TextArea rows={4} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="payloadText"
            label="载荷 JSON"
            extra={
              <Space wrap>
                <Button size="small" onClick={() => fillDownlinkDebugPayload('PROPERTY_SET')}>
                  属性设置示例
                </Button>
                <Button size="small" onClick={() => fillDownlinkDebugPayload('SERVICE_INVOKE')}>
                  服务调用示例
                </Button>
              </Space>
            }
            rules={[{ required: true, message: '请输入载荷 JSON' }]}
          >
            <TextArea rows={8} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>

        {encodeResult ? (
          <Card size="small" style={{ marginTop: 16, borderRadius: 12 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Alert
                type={encodeResult.success ? 'success' : 'error'}
                showIcon
                message={encodeResult.success ? '编码测试成功' : '编码测试失败'}
                description={
                  encodeResult.success
                    ? `匹配版本 v${encodeResult.matchedVersion || '-'}，耗时 ${encodeResult.costMs || 0} ms`
                    : encodeResult.errorMessage || '未知错误'
                }
              />
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="主题">{encodeResult.topic || '-'}</Descriptions.Item>
                <Descriptions.Item label="编码">{encodeResult.payloadEncoding || '-'}</Descriptions.Item>
              </Descriptions>
              {encodeResult.payloadText ? (
                <div>
                  <Text strong>文本载荷</Text>
                  <Paragraph>
                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 8,
                        background: '#111827',
                        color: '#f9fafb',
                        overflow: 'auto',
                        fontSize: 12,
                      }}
                    >
                      {encodeResult.payloadText}
                    </pre>
                  </Paragraph>
                </div>
              ) : null}
              {encodeResult.payloadHex ? (
                <div>
                  <Text strong>十六进制载荷</Text>
                  <Paragraph copyable={{ text: encodeResult.payloadHex }}>{encodeResult.payloadHex}</Paragraph>
                </div>
              ) : null}
              {encodeResult.headers ? (
                <div>
                  <Text strong>请求头</Text>
                  <Paragraph>
                    <pre
                      style={{
                        margin: 0,
                        padding: 12,
                        borderRadius: 8,
                        background: '#111827',
                        color: '#f9fafb',
                        overflow: 'auto',
                        fontSize: 12,
                      }}
                    >
                      {formatJson(encodeResult.headers)}
                    </pre>
                  </Paragraph>
                </div>
              ) : null}
            </Space>
          </Card>
        ) : null}
      </Drawer>

      <Modal
        title={versionRecord ? `版本历史 · ${describeRecordScope(versionRecord)}` : '版本历史'}
        open={versionOpen}
        width={860}
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setVersionOpen(false);
          setVersionRecord(null);
          setVersionItems([]);
        }}
      >
        <Table
          rowKey="id"
          size="small"
          loading={versionLoading}
          columns={versionColumns}
          dataSource={versionItems}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无版本历史" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Modal>

      <Modal
        title={publishRecord ? `发布规则 · ${describeRecordScope(publishRecord)}` : '发布规则'}
        open={publishOpen}
        destroyOnHidden
        confirmLoading={publishSubmitting}
        onCancel={() => {
          setPublishOpen(false);
          setPublishRecord(null);
        }}
        onOk={() => publishForm.submit()}
      >
        <Form form={publishForm} layout="vertical" preserve={false} onFinish={handlePublish}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="发布后会刷新连接器运行时缓存，并让当前草稿版本正式生效。"
          />
          <Form.Item name="changeLog" label="变更说明">
            <TextArea rows={5} maxLength={500} showCount placeholder="描述本次发布的变更内容" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={rollbackRecord ? `回滚规则 · ${describeRecordScope(rollbackRecord)}` : '回滚规则'}
        open={rollbackOpen}
        destroyOnHidden
        confirmLoading={rollbackSubmitting}
        onCancel={() => {
          setRollbackOpen(false);
          setRollbackRecord(null);
        }}
        onOk={() => rollbackForm.submit()}
      >
        <Form form={rollbackForm} layout="vertical" preserve={false} onFinish={handleRollback}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="回滚会恢复历史快照，并基于该快照生成新的工作草稿版本。"
            description={
              rollbackRecord?.publishedVersion ? `当前已发布版本：v${rollbackRecord.publishedVersion}` : '当前尚未发布任何版本'
            }
          />
          <Form.Item name="version" label="目标版本" rules={[{ required: true, message: '请选择目标版本' }]}>
            <Select loading={versionLoading} placeholder="选择历史版本" options={rollbackVersionOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProtocolParserPage;
