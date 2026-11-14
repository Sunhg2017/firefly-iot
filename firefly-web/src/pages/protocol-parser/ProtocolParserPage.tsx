import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AutoComplete,
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
  Tooltip,
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
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { productApi, protocolParserApi, tenantSelfApi, deviceApi, tcpUdpApi, websocketApi } from '../../services/api';
import { ProductSelect } from '../../components/EntitySelect';
import useAuthStore from '../../store/useAuthStore';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage, getErrorStatus } from '../../utils/errors';
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
const LazyJsonEditorField = React.lazy(() => import('../../components/JsonEditorField'));

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

interface ProtocolJsonEditorProps {
  path: string;
  height?: number;
  hint?: string;
  value?: string;
  onChange?: (value: string) => void;
}

/**
 * Lazy JSON editor for debug payload/headers.
 * It uses the shared JsonEditorField (format + inline JSON validation) while keeping Monaco out
 * of the page chunk, matching the lazy loading used by the other code editors on this page.
 */
const ProtocolJsonEditor: React.FC<ProtocolJsonEditorProps> = ({ height = 160, ...rest }) => (
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
    <LazyJsonEditorField height={height} {...rest} />
  </Suspense>
);

const CODE_BLOCK_STYLE: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: '#111827',
  color: '#f9fafb',
  overflow: 'auto',
  fontSize: 12,
};

/**
 * Read-only code block with an explicit copy action.
 * Long parsed payloads / scripts are otherwise impossible to move into tickets or other tools.
 */
const CopyableCodeBlock: React.FC<{ text: string; label?: string; maxHeight?: number }> = ({
  text,
  label,
  maxHeight = 260,
}) => (
  <div>
    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
      {label ? <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text> : <span />}
      <CopyText text={text}>
        <span style={{ fontSize: 12 }}>复制</span>
      </CopyText>
    </Space>
    <pre style={{ ...CODE_BLOCK_STYLE, maxHeight }}>{text}</pre>
  </div>
);

/** Order-independent snapshot so programmatic key ordering never looks like an unsaved edit. */
const buildValuesSnapshot = (values: Record<string, unknown>) =>
  JSON.stringify(Object.keys(values).sort().map((key) => [key, values[key]]));

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

/** Session candidate shown in the debug drawers; sourced from the TCP/UDP and WebSocket session APIs. */
interface DebugSessionOption {
  sessionId: string;
  transport: string;
  remoteAddress?: string;
  deviceName?: string;
}

interface RawTcpSession {
  sessionId?: string;
  protocol?: string;
  remoteAddress?: string;
  binding?: { deviceName?: string | null } | null;
}

interface RawWebSocketSession {
  sessionId?: string;
  remoteAddress?: string;
  deviceName?: string | null;
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

interface EditorPreviewSummaryItem {
  key: string;
  label: string;
  value: string;
  stepIndex: number;
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
    description: '产品级必须选择产品；租户默认级适用于当前租户全部产品。',
  },
  {
    title: '协议与匹配',
    description: '匹配规则决定哪些报文进入该规则，拆帧配置决定报文如何分帧。',
  },
  {
    title: '解析实现',
    description: '脚本模式下脚本内容必填；插件模式下插件 ID 必填。',
  },
  {
    title: '发布策略',
    description: '灰度配置决定规则对哪些设备生效。',
  },
  {
    title: '预览确认',
    description: '确认关键配置后保存；保存后仍需发布才会对线上报文生效。',
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
  }
> = {
  matchRuleJson: {
    label: '匹配规则 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/matchRule.fullscreen.json',
  },
  frameConfigJson: {
    label: '拆帧配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/frameConfig.fullscreen.json',
  },
  parserConfigJson: {
    label: '解析配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/parserConfig.fullscreen.json',
  },
  visualConfigJson: {
    label: '可视化配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/visualConfig.fullscreen.json',
  },
  releaseConfigJson: {
    label: '灰度配置 JSON',
    language: 'json',
    fullscreenPath: 'file:///protocol-parser/releaseConfig.fullscreen.json',
  },
  scriptContent: {
    label: '脚本内容',
    language: 'javascript',
    fullscreenPath: 'file:///protocol-parser/scriptContent.fullscreen.js',
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

/** `{}` is the generated starting point, not user content, so presets may replace it without asking. */
const isBlankOrEmptyJson = (raw?: string) => {
  const source = (raw || '').trim();
  return source === '' || isSameJsonObjectText(source, '{}');
};

const normalizeVisualConfigSafely = (raw: string | undefined, direction: VisualFlowDirection) => {
  try {
    return normalizeVisualConfigText(raw || '{}', direction);
  } catch {
    return undefined;
  }
};

const buildScriptSkeletonByDirection = (direction: VisualFlowDirection) =>
  buildScriptFromVisualConfig(defaultVisualConfigForDirection(direction), direction);

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
  const [versionError, setVersionError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeUpdatedAt, setRuntimeUpdatedAt] = useState<Date | null>(null);
  const [statusTogglingId, setStatusTogglingId] = useState<number | null>(null);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [debugSessions, setDebugSessions] = useState<DebugSessionOption[]>([]);
  const [debugSessionLoading, setDebugSessionLoading] = useState(false);
  const [deviceOptionsError, setDeviceOptionsError] = useState<string | null>(null);
  const editorBaselineRef = useRef<string | null>(null);
  const runtimeFetchingRef = useRef(false);

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
  const currentUplinkDebugProductId = Form.useWatch('productId', uplinkDebugForm);
  const currentDownlinkMessageType =
    Form.useWatch('messageType', downlinkDebugForm) || DEFAULT_DOWNLINK_DEBUG_VALUES.messageType;
  const currentUplinkPayload = Form.useWatch('payload', uplinkDebugForm) || '';
  const currentUplinkHeadersText = Form.useWatch('headersText', uplinkDebugForm) || '';
  const currentDownlinkPayloadText = Form.useWatch('payloadText', downlinkDebugForm) || '';
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

  const confirmDiscard = useConfirmDiscard();

  // Register unsaved editor content with the tab-close guard and protect mask/ESC/取消.
  useDirtyGuard(editorOpen && isEditorDirty);

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const selectedProduct = filters.productId ? productMap.get(filters.productId) : undefined;
  const currentEditorProduct = currentEditorProductId ? productMap.get(currentEditorProductId) : undefined;
  const uplinkDebugProduct = currentUplinkDebugProductId ? productMap.get(currentUplinkDebugProductId) : undefined;
  const downlinkDebugProduct = currentDownlinkProductId ? productMap.get(currentDownlinkProductId) : undefined;
  const currentTenantLabel = currentTenant?.displayName || currentTenant?.name || '当前租户';
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
  const downlinkDeviceOptions = useMemo(
    () => deviceOptions.map((item) => ({ value: item.deviceName, label: item.deviceName })),
    [deviceOptions],
  );
  const debugSessionIdOptions = useMemo(
    () =>
      debugSessions.map((item) => ({
        value: item.sessionId,
        label: [item.transport, item.deviceName, item.remoteAddress, item.sessionId].filter(Boolean).join(' · '),
      })),
    [debugSessions],
  );
  const debugRemoteAddressOptions = useMemo(
    () => buildStringOptions(debugSessions.map((item) => item.remoteAddress)),
    [debugSessions],
  );

  const stats = useMemo(
    () => ({
      enabled: records.filter((item) => item.status === 'ENABLED').length,
      drafts: records.filter((item) => item.status === 'DRAFT').length,
      downlink: records.filter((item) => item.direction === 'DOWNLINK').length,
      tenantDefault: records.filter((item) => item.scopeType === 'TENANT').length,
    }),
    [records],
  );
  const hasActiveListFilters = Boolean(
    filters.productId || trimOptional(filters.protocol) || trimOptional(filters.transport) || filters.status,
  );

  const editorBusinessIdentifiers = useMemo(() => {
    const patch: BusinessIdentifierPatch = {};
    if (currentTenant?.code) {
      patch.tenantCode = currentTenant.code;
    }
    patch.productKey = currentScopeType === 'PRODUCT' ? currentEditorProduct?.productKey ?? null : null;
    return patch;
  }, [currentEditorProduct?.productKey, currentScopeType, currentTenant?.code]);

  const editorPreviewSummary = useMemo<EditorPreviewSummaryItem[]>(
    () => [
      {
        key: 'template',
        label: '已选模板',
        value: selectedTemplate?.label || '未使用模板',
        stepIndex: 0,
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
        stepIndex: 0,
      },
      {
        key: 'protocol',
        label: '协议 / 传输',
        value: `${findOptionLabel(PROTOCOL_OPTIONS, currentProtocol)} / ${findOptionLabel(
          TRANSPORT_OPTIONS,
          currentEditorTransport,
        )}`,
        stepIndex: 1,
      },
      {
        key: 'direction',
        label: '方向 / 解析方式',
        value: `${findOptionLabel(DIRECTION_OPTIONS, currentDirection)} / ${findOptionLabel(
          PARSER_MODE_OPTIONS,
          currentParserMode,
        )}`,
        stepIndex: 2,
      },
      {
        key: 'frame',
        label: '拆帧 / 超时 / 发布',
        value: `${findOptionLabel(FRAME_MODE_OPTIONS, currentFrameMode)} / ${currentTimeoutMs} ms / ${findOptionLabel(
          RELEASE_MODE_OPTIONS,
          currentReleaseMode,
        )}`,
        stepIndex: 3,
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

  // 产品以 keyword 远程搜索；本页仍需要 productKey 参与业务编码，因此缓存已加载/已选产品的详情。
  const productsRef = useRef<Map<number, ProductOption>>(new Map());
  const productRequestRef = useRef<Set<number>>(new Set());

  const mergeProducts = useCallback((records: ProductOption[]) => {
    if (records.length === 0) {
      return;
    }
    const merged = new Map(productsRef.current);
    records.forEach((item) => merged.set(item.id, item));
    productsRef.current = merged;
    setProducts(Array.from(merged.values()));
  }, []);

  const resolveProduct = useCallback(async (id?: number): Promise<ProductOption | undefined> => {
    if (!id) {
      return undefined;
    }
    const cached = productsRef.current.get(id);
    if (cached) {
      return cached;
    }
    try {
      const response = await productApi.get(id);
      const record = response.data.data as ProductOption | null;
      if (record?.id) {
        mergeProducts([record]);
        return record;
      }
    } catch {
      // 产品详情只用于补齐 productKey；补查失败时保留原 productId，由提交校验兜底。
    }
    return undefined;
  }, [mergeProducts]);

  const ensureProductLabels = useCallback((ids: Array<number | undefined | null>) => {
    const missing = Array.from(new Set(
      ids.filter((id): id is number => typeof id === 'number' && id > 0),
    )).filter((id) => !productsRef.current.has(id) && !productRequestRef.current.has(id));
    if (missing.length === 0) {
      return;
    }
    missing.forEach((id) => productRequestRef.current.add(id));
    void Promise.all(missing.map(async (id) => {
      try {
        const response = await productApi.get(id);
        const record = response.data.data as ProductOption | null;
        return record?.id ? record : null;
      } catch {
        productRequestRef.current.delete(id);
        return null;
      }
    })).then((records) => {
      mergeProducts(records.filter((item): item is ProductOption => item !== null));
    });
  }, [mergeProducts]);

  const downlinkDeviceTimerRef = useRef<number | null>(null);
  const downlinkDeviceRequestRef = useRef(0);
  const [downlinkDeviceLoading, setDownlinkDeviceLoading] = useState(false);

  const searchDownlinkDevices = useCallback(async (keyword: string, productId?: number) => {
    const requestId = downlinkDeviceRequestRef.current + 1;
    downlinkDeviceRequestRef.current = requestId;
    setDownlinkDeviceLoading(true);
    try {
      const response = await deviceApi.list({
        pageNum: 1,
        pageSize: 20,
        keyword: keyword.trim() || undefined,
        productId,
      });
      const records = ((response.data.data?.records || []) as Array<{ productId?: number; deviceName?: string }>)
        .filter((item) => Boolean(item.deviceName));
      if (requestId !== downlinkDeviceRequestRef.current) {
        return;
      }
      setDeviceOptions(records.map((item) => ({
        productId: item.productId,
        deviceName: String(item.deviceName),
      })));
      setDeviceOptionsError(null);
    } catch (error) {
      // 搜索失败保留上一次候选，避免已选设备名称被清空；错误在字段下方提示并可重试。
      if (requestId === downlinkDeviceRequestRef.current) {
        setDeviceOptionsError(getErrorMessage(error, '加载设备候选失败，可稍后重试'));
      }
    } finally {
      if (requestId === downlinkDeviceRequestRef.current) {
        setDownlinkDeviceLoading(false);
      }
    }
  }, []);

  const handleDownlinkDeviceSearch = useCallback((keyword: string) => {
    if (downlinkDeviceTimerRef.current) {
      window.clearTimeout(downlinkDeviceTimerRef.current);
    }
    downlinkDeviceTimerRef.current = window.setTimeout(() => {
      void searchDownlinkDevices(keyword, currentDownlinkProductId);
    }, 300);
  }, [currentDownlinkProductId, searchDownlinkDevices]);

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
      const records = page.records || [];
      setRecords(records);
      setTotal(page.total || 0);
      setListError(null);
      ensureProductLabels(records.map((item) => item.productId));
    } catch (error) {
      const errorText = getErrorMessage(error, '加载协议解析规则失败');
      setListError(errorText);
      message.error(errorText);
    } finally {
      setLoading(false);
    }
  };

  const fetchRuntime = async () => {
    if (!canRead || runtimeFetchingRef.current) {
      return;
    }
    runtimeFetchingRef.current = true;
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
      setRuntimeError(null);
      setRuntimeUpdatedAt(new Date());
    } catch (error) {
      const errorText = getErrorMessage(error, '加载运行时状态失败');
      setRuntimeError(errorText);
      // The console polls every 30s; only the first failure needs a toast, later ones stay inline.
      if (!runtimeError) {
        message.error(errorText);
      }
    } finally {
      runtimeFetchingRef.current = false;
      setRuntimeLoading(false);
    }
  };

  /** Session candidates come from the TCP/UDP and WebSocket consoles; MQTT/HTTP sessions stay manually typed. */
  const fetchDebugSessions = async () => {
    setDebugSessionLoading(true);
    try {
      const results = await Promise.allSettled([tcpUdpApi.listTcpSessions(), websocketApi.listSessions()]);
      const nextSessions: DebugSessionOption[] = [];
      if (results[0].status === 'fulfilled') {
        const rawSessions = results[0].value.data?.data as unknown;
        if (Array.isArray(rawSessions)) {
          rawSessions.forEach((item) => {
            const session = item as RawTcpSession;
            if (!session.sessionId) {
              return;
            }
            nextSessions.push({
              sessionId: session.sessionId,
              transport: session.protocol || 'TCP',
              remoteAddress: session.remoteAddress,
              deviceName: session.binding?.deviceName || undefined,
            });
          });
        }
      }
      if (results[1].status === 'fulfilled') {
        const rawSessions = results[1].value.data?.data as unknown;
        if (Array.isArray(rawSessions)) {
          rawSessions.forEach((item) => {
            const session = item as RawWebSocketSession;
            if (!session.sessionId) {
              return;
            }
            nextSessions.push({
              sessionId: session.sessionId,
              transport: 'WEBSOCKET',
              remoteAddress: session.remoteAddress,
              deviceName: session.deviceName || undefined,
            });
          });
        }
      }
      setDebugSessions(nextSessions);
      const firstRejection = results.find((item) => item.status === 'rejected');
      const rejectionStatus =
        firstRejection && firstRejection.status === 'rejected' ? getErrorStatus(firstRejection.reason) : undefined;
      // Missing connector read permission is expected here; the fields still accept manual input.
      if (results.every((item) => item.status === 'rejected') && rejectionStatus !== 401 && rejectionStatus !== 403) {
        message.warning(
          firstRejection && firstRejection.status === 'rejected'
            ? getErrorMessage(firstRejection.reason, '会话候选加载失败，可手动填写会话 ID')
            : '会话候选加载失败，可手动填写会话 ID',
        );
      }
    } finally {
      setDebugSessionLoading(false);
    }
  };

  // Poll the runtime console only while its tab is open; the hook also pauses polling in
  // background tabs and never overlaps a slow request with the next tick.
  const runtimeAutoRefresh = useAutoRefresh(fetchRuntime, {
    intervalMs: 30000,
    enabled: canRead && mainTabKey === 'runtime',
    immediate: false,
  });

  useEffect(() => {
    void fetchCurrentTenant();
    if (initialProductId) {
      void resolveProduct(initialProductId);
    }
  }, [initialProductId, resolveProduct]);

  useEffect(() => {
    void fetchData();
  }, [filters, pageNum, pageSize]);

  useEffect(() => {
    if (!uplinkDebugOpen && !downlinkDebugOpen) {
      return;
    }
    void fetchDebugSessions();
  }, [downlinkDebugOpen, uplinkDebugOpen]);

  // Entering the runtime tab shows fresh metrics immediately instead of waiting for the next tick.
  const refreshRuntime = runtimeAutoRefresh.refresh;
  useEffect(() => {
    if (mainTabKey !== 'runtime') {
      return;
    }
    void refreshRuntime();
  }, [mainTabKey, refreshRuntime]);

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

  // Snapshot right after the open-time defaults and derived identifiers settle, so merely
  // opening the drawer never looks dirty; every later comparison is against this snapshot.
  useEffect(() => {
    if (!editorOpen) {
      editorBaselineRef.current = null;
      setIsEditorDirty(false);
      return;
    }
    editorBaselineRef.current = buildValuesSnapshot(
      editorForm.getFieldsValue(true) as unknown as Record<string, unknown>,
    );
    setIsEditorDirty(false);
  }, [editorForm, editorOpen]);

  const setEditorDirtyFromForm = () => {
    if (!editorBaselineRef.current) {
      setIsEditorDirty(true);
      return;
    }
    const currentSnapshot = buildValuesSnapshot(
      editorForm.getFieldsValue(true) as unknown as Record<string, unknown>,
    );
    setIsEditorDirty(currentSnapshot !== editorBaselineRef.current);
  };

  // Programmatic fills bypass Form.onValuesChange (antd setFieldsValue does not emit it),
  // so every button/preset that writes editor fields has to recompute the dirty state explicitly.
  const applyEditorValues = (patch: Partial<EditorFormValues>) => {
    editorForm.setFieldsValue(patch);
    setEditorDirtyFromForm();
  };

  const confirmOverwriteEditor = (content: string, action: () => void) => {
    Modal.confirm({
      title: '将覆盖当前内容，是否继续？',
      content,
      okText: '覆盖',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: action,
    });
  };

  const closeEditorModal = () => {
    setIsEditorDirty(false);
    editorBaselineRef.current = null;
    setEditorOpen(false);
    setFullscreenEditorField(null);
    setCurrentRecord(null);
    setSelectedTemplateKey(undefined);
    setEditorStepIndex(0);
    setEditorMaxStepIndex(0);
  };

  const handleCloseEditor = () => {
    confirmDiscard(isEditorDirty, closeEditorModal);
  };

  const applyTemplate = (template?: ProtocolParserTemplate) => {
    if (!template) {
      message.warning('请先选择模板');
      return;
    }
    const visualConfigJson = defaultVisualConfigForDirection(template.direction as VisualFlowDirection);
    const applyValues = () => {
      setSelectedTemplateKey(template.key);
      applyEditorValues({
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
    // A template rewrites the whole protocol/parse configuration. First-time selection on a
    // pristine create form stays one click; editing an existing rule or changing an already
    // modified form always asks before replacing the current content.
    if (!isEditorDirty && editorMode === 'create') {
      applyValues();
      return;
    }
    confirmOverwriteEditor(
      `应用模板「${template.label}」会覆盖当前协议、匹配规则、解析配置与脚本，明确后才会生效。`,
      applyValues,
    );
  };

  const applyEditorJsonPreset = (
    field: 'matchRuleJson' | 'frameConfigJson' | 'parserConfigJson' | 'visualConfigJson' | 'releaseConfigJson',
    value: string,
  ) => {
    const currentValue = ((editorForm.getFieldValue(field) as string | undefined) || '').trim();
    const applyValue = () => applyEditorValues({ [field]: value } as Partial<EditorFormValues>);
    if (isBlankOrEmptyJson(currentValue)) {
      applyValue();
      return;
    }
    if (isSameJsonObjectText(currentValue, value)) {
      message.info(`「${JSON_FIELD_LABELS[field]}」与所选预设一致，无需覆盖`);
      return;
    }
    confirmOverwriteEditor(
      `「${JSON_FIELD_LABELS[field]}」已有内容，覆盖后原内容将丢失。`,
      applyValue,
    );
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
    // Formatting only rewrites whitespace, so it should not trigger the unsaved-changes guard.
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
    applyEditorValues({ [fullscreenEditorField]: value } as Partial<EditorFormValues>);
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

  // Rebuild a field from the current transport/direction/frame/release context so users can
  // quickly recover from exploratory edits without reopening presets one by one.
  const getRecommendedEditorValue = (field: CodeEditorFieldName) => {
    switch (field) {
      case 'matchRuleJson':
        return buildMatchRulePreset(currentEditorTransport, currentDirection);
      case 'frameConfigJson':
        return buildFrameConfigPreset(currentFrameMode);
      case 'parserConfigJson':
        return buildParserConfigPreset(
          currentDirection === 'DOWNLINK' ? 'DOWNLINK_JSON' : 'UPLINK_JSON_PROPERTY',
          currentEditorTransport,
          editorBusinessIdentifiers,
        );
      case 'visualConfigJson':
        return defaultVisualConfigForDirection(currentDirection as VisualFlowDirection);
      case 'releaseConfigJson':
        return releaseModePreset(currentReleaseMode);
      case 'scriptContent':
        return buildScriptSkeletonByDirection(currentDirection as VisualFlowDirection);
      default:
        return '';
    }
  };

  const applyRecommendedEditorValue = (field: CodeEditorFieldName) => {
    const currentValue = ((editorForm.getFieldValue(field) as string | undefined) || '').trim();
    const recommendedValue = getRecommendedEditorValue(field);
    const applyValue = () => applyEditorValues({ [field]: recommendedValue } as Partial<EditorFormValues>);

    if (field === 'scriptContent') {
      if (!currentValue) {
        applyValue();
        return;
      }
      if (currentValue === recommendedValue.trim()) {
        message.info('当前脚本已与推荐骨架一致');
        return;
      }
      confirmOverwriteEditor('「脚本内容」已有内容，覆盖后原脚本将丢失。', applyValue);
      return;
    }

    if (isBlankOrEmptyJson(currentValue)) {
      applyValue();
      return;
    }
    if (isSameJsonObjectText(currentValue, recommendedValue)) {
      message.info(`「${JSON_FIELD_LABELS[field]}」已是推荐值，无需覆盖`);
      return;
    }
    confirmOverwriteEditor(`「${JSON_FIELD_LABELS[field]}」已有内容，覆盖后原内容将丢失。`, applyValue);
  };

  const handleRegenerateScriptFromVisual = () => {
    try {
      const direction = (editorForm.getFieldValue('direction') || 'UPLINK') as VisualFlowDirection;
      const rawVisualConfig = (editorForm.getFieldValue('visualConfigJson') || '{}') as string;
      const normalizedVisualConfig = normalizeVisualConfigText(rawVisualConfig, direction);
      const nextScript = buildScriptFromVisualConfig(normalizedVisualConfig, direction);
      const applyValues = () => {
        applyEditorValues({
          parserMode: 'SCRIPT',
          scriptLanguage: 'JS',
          visualConfigJson: normalizedVisualConfig,
          scriptContent: nextScript,
        });
        message.success('已按当前可视化配置重建脚本');
      };
      const currentScript = ((editorForm.getFieldValue('scriptContent') as string | undefined) || '').trim();
      if (!currentScript || currentScript === nextScript.trim()) {
        applyValues();
        return;
      }
      confirmOverwriteEditor('重建会覆盖当前脚本内容，是否继续？', applyValues);
    } catch (error) {
      message.error(getErrorMessage(error, '按当前可视化配置重建脚本失败'));
    }
  };

  const applyReleasePreset = (mode: 'ALL' | 'DEVICE_LIST' | 'HASH_PERCENT') => {
    const nextConfig = releaseModePreset(mode);
    const currentConfig = ((editorForm.getFieldValue('releaseConfigJson') as string | undefined) || '').trim();
    const applyValues = () => applyEditorValues({ releaseMode: mode, releaseConfigJson: nextConfig });
    if (isBlankOrEmptyJson(currentConfig) || isSameJsonObjectText(currentConfig, nextConfig)) {
      applyValues();
      return;
    }
    confirmOverwriteEditor(
      `「灰度配置」已有内容，切换为「${findOptionLabel(RELEASE_MODE_OPTIONS, mode)}」会覆盖当前配置。`,
      applyValues,
    );
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

  const navigateToEditorStep = (targetStep: number) => {
    if (targetStep === editorStepIndex) {
      return;
    }
    if (targetStep < editorStepIndex) {
      moveToEditorStep(targetStep);
      return;
    }
    void handleEditorStepChange(targetStep);
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

  const openCreateModal = async () => {
    const createScopeType = filters.productId ? 'PRODUCT' : DEFAULT_EDITOR_VALUES.scopeType;
    const defaultProduct = await resolveProduct(filters.productId);
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
      const detailProduct = await resolveProduct(detail.productId ?? undefined);
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

  const buildEditorPayload = async (values: EditorFormValues) => {
    if (values.scopeType === 'PRODUCT' && !values.productId) {
      throw new Error('产品级规则必须选择产品');
    }
    if (values.parserMode === 'SCRIPT' && !trimOptional(values.scriptContent)) {
      throw new Error('脚本模式必须填写脚本内容');
    }
    if (values.parserMode === 'PLUGIN' && !trimOptional(values.pluginId)) {
      throw new Error('插件模式必须填写插件 ID');
    }

    const payloadProduct = await resolveProduct(values.productId);
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
      const payload = await buildEditorPayload(values);
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
    handleRegenerateScriptFromVisual();
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
    void searchDownlinkDevices('', record.productId || filters.productId);
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
    setVersionError(null);
    try {
      const response = await protocolParserApi.versions(record.id);
      const items = (response.data.data || []) as ProtocolParserVersionRecord[];
      setVersionItems(items);
      return items;
    } catch (error) {
      const errorText = getErrorMessage(error, '加载版本历史失败');
      setVersionError(errorText);
      message.error(errorText);
      return [];
    } finally {
      setVersionLoading(false);
    }
  };

  const openVersionModal = async (record: ProtocolParserRecord) => {
    setVersionRecord(record);
    setVersionItems([]);
    setVersionError(null);
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
    setVersionItems([]);
    setVersionError(null);
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
      message.success(`已回滚到 v${values.version}，回滚结果立即生效`);
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

  const performToggleStatus = async (record: ProtocolParserRecord) => {
    const disabling = record.status === 'ENABLED';
    setStatusTogglingId(record.id);
    try {
      if (disabling) {
        await protocolParserApi.disable(record.id);
        message.success('规则已停用，命中该规则的报文将按兜底策略处理');
      } else {
        await protocolParserApi.enable(record.id);
        message.success('规则已启用，符合匹配条件的报文将使用该规则解析');
      }
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, disabling ? '停用协议解析规则失败' : '启用协议解析规则失败'));
    } finally {
      setStatusTogglingId(null);
    }
  };

  const handleToggleStatus = (record: ProtocolParserRecord) => {
    if (statusTogglingId !== null) {
      return;
    }
    const disabling = record.status === 'ENABLED';
    Modal.confirm({
      title: disabling ? '停用该协议解析规则？' : '启用该协议解析规则？',
      width: 560,
      content: (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text>
            {disabling
              ? '停用后规则立即退出匹配，命中该规则的报文会按异常策略处理，可能导致线上解析失败。'
              : '启用后规则立即参与匹配，符合匹配条件的报文会使用该规则解析。'}
          </Text>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="生效范围">{describeRecordScope(record)}</Descriptions.Item>
            <Descriptions.Item label="发布范围">
              {findOptionLabel(RELEASE_MODE_OPTIONS, record.releaseMode || 'ALL')}（{formatReleaseSummary(record)}）
            </Descriptions.Item>
            <Descriptions.Item label="异常策略">
              {findOptionLabel(ERROR_POLICY_OPTIONS, record.errorPolicy || 'ERROR')}
            </Descriptions.Item>
            <Descriptions.Item label="版本">
              已发布 {record.publishedVersion ? `v${record.publishedVersion}` : '未发布'}
            </Descriptions.Item>
          </Descriptions>
        </Space>
      ),
      okText: disabling ? '确认停用' : '确认启用',
      cancelText: '取消',
      okButtonProps: { danger: disabling },
      onOk: () => performToggleStatus(record),
    });
  };

  const handleReloadPlugins = () => {
    if (!canPublish) {
      message.warning('没有重载插件的权限（需要 protocol-parser:publish）');
      return;
    }
    if (runtimeReloading) {
      return;
    }
    Modal.confirm({
      title: '重载运行时插件？',
      content: '重载会刷新所有插件类，正在处理的报文可能短暂失败；完成后会自动刷新运行时状态。',
      okText: '确认重载',
      cancelText: '取消',
      onOk: async () => {
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
      },
    });
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
      render: (value?: string) => formatDateTime(value),
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
      render: (value?: string) => formatDateTime(value),
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
              loading={statusTogglingId === record.id}
              disabled={statusTogglingId !== null && statusTogglingId !== record.id}
              icon={record.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => handleToggleStatus(record)}
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
          canCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void openCreateModal()}>
              新建规则
            </Button>
          ) : null
        }
      />

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
        <>
          <Space wrap size={[8, 8]} style={{ marginBottom: 12 }}>
            <Tag color="green">本页已启用 {stats.enabled}</Tag>
            <Tag color="blue">本页草稿 {stats.drafts}</Tag>
            <Tag color="orange">本页下行 {stats.downlink}</Tag>
            <Tag color="purple">本页租户默认 {stats.tenantDefault}</Tag>
            <Tag>已加载插件 {runtimePlugins.length}</Tag>
          </Space>
          <Card title="筛选条件" size="small" className="ff-query-card" style={{ marginBottom: 16, borderRadius: 16 }}>
            <div className="ff-query-bar">
              <div className="ff-query-field" style={{ width: 240 }}>
                <ProductSelect
                  style={{ width: '100%' }}
                  placeholder="搜索并选择产品（名称或 productKey）"
                  value={draftFilters.productId}
                  pinnedLabel={selectedProduct ? `${selectedProduct.name} (${selectedProduct.productKey})` : undefined}
                  onChange={(value) => {
                    setDraftFilters((current) => ({ ...current, productId: value }));
                    void ensureProductLabels([value]);
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
                  <Button icon={<ApiOutlined />} loading={loading} onClick={() => void fetchData()}>
                    刷新规则
                  </Button>
                </Space>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {mainTabKey === 'runtime' ? (
        <ProtocolParserRuntimePanel
          loading={runtimeLoading}
          reloading={runtimeReloading}
          metrics={runtimeMetrics}
          plugins={runtimePlugins}
          catalog={runtimeCatalog}
          error={runtimeError}
          canReload={canPublish}
          lastUpdatedAt={runtimeUpdatedAt}
          autoRefreshPaused={runtimeAutoRefresh.paused}
          onToggleAutoRefresh={runtimeAutoRefresh.togglePaused}
          onRefresh={() => void runtimeAutoRefresh.refresh()}
          onReload={handleReloadPlugins}
        />
      ) : null}

      {mainTabKey === 'rules' ? (
        <Card title="规则列表" size="small" style={{ borderRadius: 16 }}>
          {listError ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message="规则列表加载失败"
              description={listError}
              action={
                <Button size="small" onClick={() => void fetchData()}>
                  重试
                </Button>
              }
            />
          ) : null}
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={records}
            scroll={{ x: 1700 }}
            locale={{
              emptyText: (
                <ListEmpty
                  hasFilters={hasActiveListFilters}
                  emptyText="暂无协议解析规则"
                  filteredText="没有符合当前筛选条件的规则"
                  onClearFilters={resetFilters}
                />
              ),
            }}
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
        </Card>
      ) : null}

      <Drawer
        title={editorMode === 'create' ? '新建协议解析规则' : '编辑协议解析规则'}
        open={editorOpen}
        width={1280}
        onClose={handleCloseEditor}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={handleCloseEditor}>取消</Button>
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
        <Form
          form={editorForm}
          layout="vertical"
          onValuesChange={setEditorDirtyFromForm}
          onFinish={handleSubmitEditor}
        >
          <Steps
            current={editorStepIndex}
            items={editorStepItems}
            onChange={(step) => void handleEditorStepChange(step)}
            size="small"
            style={{ marginBottom: 16 }}
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
                    placeholder="选择解析模板（选中即应用）"
                    value={selectedTemplateKey}
                    options={templateOptions}
                    optionFilterProp="label"
                    optionRender={(option) => {
                      const template = PROTOCOL_PARSER_TEMPLATES.find((item) => item.key === String(option.value));
                      if (!template) {
                        return option.label;
                      }
                      return (
                        <Space direction="vertical" size={0} style={{ maxWidth: 420 }}>
                          <Text strong>{template.label}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>{template.description}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>提示：{template.tip}</Text>
                        </Space>
                      );
                    }}
                    onChange={(value?: string) => {
                      const template = PROTOCOL_PARSER_TEMPLATES.find((item) => item.key === value);
                      if (template) {
                        // Selecting a template applies it immediately; the explicit 应用模板
                        // button stays as a re-apply shortcut after later manual edits.
                        applyTemplate(template);
                        return;
                      }
                      setSelectedTemplateKey(undefined);
                    }}
                  />
                </Form.Item>
                <Space wrap style={{ marginTop: 12 }}>
                  {quickTemplates.map((item) => (
                    <Tooltip key={item.key} title={`${item.description} ${item.tip}`}>
                      <Button
                        size="small"
                        type={selectedTemplateKey === item.key ? 'primary' : 'default'}
                        onClick={() => applyTemplate(item)}
                      >
                        {item.label}
                      </Button>
                    </Tooltip>
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
                    <Text type="secondary">提示：{selectedTemplate.tip}</Text>
                    <Space wrap>
                      <Button onClick={() => applyTemplate(selectedTemplate)}>应用模板</Button>
                    </Space>
                  </Space>
                ) : (
                  <Text type="secondary">选择模板后会立即填充协议、匹配规则、解析配置与脚本，可随后逐步修改。</Text>
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
                <ProductSelect
                  disabled={currentScopeType === 'TENANT'}
                  placeholder={currentScopeType === 'TENANT' ? '租户默认级规则无需选择产品' : '搜索并选择产品（名称或 productKey）'}
                  pinnedLabel={currentEditorProduct ? `${currentEditorProduct.name} (${currentEditorProduct.productKey})` : undefined}
                  onChange={(value) => {
                    handleEditorProductChange();
                    void ensureProductLabels([value]);
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="scopeId" hidden>
            <InputNumber min={1} />
          </Form.Item>
          </>
          ) : null}

          {editorStepIndex === 1 ? <><Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item
                name="protocol"
                label="协议"
                rules={[{ required: true, message: '请选择协议' }]}
              >
                <Select showSearch options={protocolOptions} optionFilterProp="label" placeholder="选择协议" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="transport"
                label="传输方式"
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

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item
                name="matchRuleJson"
                label="匹配规则 JSON"
                extra={
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
                    <Button size="small" onClick={() => applyRecommendedEditorValue('scriptContent')}>
                      当前方向骨架
                    </Button>
                    <Button size="small" onClick={handleRegenerateScriptFromVisual}>
                      按可视化重建
                    </Button>
                    <CopyText text={currentScriptContent}>
                      <span style={{ fontSize: 12 }}>复制脚本</span>
                    </CopyText>
                    <Button
                      size="small"
                      icon={<FullscreenOutlined />}
                      onClick={() => openFullscreenEditor('scriptContent')}
                    >
                      全屏编辑
                    </Button>
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
                  placeholder="默认自动选择检测到的版本"
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
                <Button onClick={() => applyReleasePreset('ALL')}>全量发布</Button>
                <Button onClick={() => applyReleasePreset('DEVICE_LIST')}>设备名单</Button>
                <Button onClick={() => applyReleasePreset('HASH_PERCENT')}>灰度 10%</Button>
                <Button onClick={() => applyEditorJsonPreset('releaseConfigJson', releaseModePreset(currentReleaseMode))}>
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
                  <Card
                    size="small"
                    title="匹配规则"
                    extra={
                      <Space size={4}>
                        <Button size="small" onClick={() => navigateToEditorStep(1)}>回到本步</Button>
                        <Button size="small" icon={<FullscreenOutlined />} onClick={() => openFullscreenEditor('matchRuleJson')}>
                          全屏编辑
                        </Button>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    <CopyableCodeBlock
                      text={(editorForm.getFieldValue('matchRuleJson') as string) || '{}'}
                      maxHeight={220}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card
                    size="small"
                    title="拆帧配置"
                    extra={
                      <Space size={4}>
                        <Button size="small" onClick={() => navigateToEditorStep(1)}>回到本步</Button>
                        <Button size="small" icon={<FullscreenOutlined />} onClick={() => openFullscreenEditor('frameConfigJson')}>
                          全屏编辑
                        </Button>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    <CopyableCodeBlock
                      text={(editorForm.getFieldValue('frameConfigJson') as string) || '{}'}
                      maxHeight={220}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card
                    size="small"
                    title="解析配置"
                    extra={
                      <Space size={4}>
                        <Button size="small" onClick={() => navigateToEditorStep(2)}>回到本步</Button>
                        <Button size="small" icon={<FullscreenOutlined />} onClick={() => openFullscreenEditor('parserConfigJson')}>
                          全屏编辑
                        </Button>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    <CopyableCodeBlock
                      text={(editorForm.getFieldValue('parserConfigJson') as string) || '{}'}
                      maxHeight={220}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card
                    size="small"
                    title="可视化流"
                    extra={
                      <Space size={4}>
                        <Button size="small" onClick={() => navigateToEditorStep(2)}>回到本步</Button>
                        <Button size="small" icon={<FullscreenOutlined />} onClick={() => openFullscreenEditor('visualConfigJson')}>
                          全屏编辑
                        </Button>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    <CopyableCodeBlock
                      text={(editorForm.getFieldValue('visualConfigJson') as string) || '{}'}
                      maxHeight={220}
                    />
                  </Card>
                </Col>
                <Col xs={24} lg={12}>
                  <Card
                    size="small"
                    title={currentParserMode === 'SCRIPT' ? '脚本内容' : '插件信息'}
                    extra={
                      currentParserMode === 'SCRIPT' ? (
                        <Space size={4}>
                          <Button size="small" onClick={() => navigateToEditorStep(2)}>回到本步</Button>
                          <Button size="small" icon={<FullscreenOutlined />} onClick={() => openFullscreenEditor('scriptContent')}>
                            全屏编辑
                          </Button>
                        </Space>
                      ) : (
                        <Button size="small" onClick={() => navigateToEditorStep(2)}>回到本步</Button>
                      )
                    }
                    style={{ borderRadius: 12 }}
                  >
                    {currentParserMode === 'SCRIPT' ? (
                      <CopyableCodeBlock
                        text={(editorForm.getFieldValue('scriptContent') as string) || ''}
                        maxHeight={320}
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
                  <Card
                    size="small"
                    title="发布配置"
                    extra={
                      <Space size={4}>
                        <Button size="small" onClick={() => navigateToEditorStep(3)}>回到本步</Button>
                        <Button size="small" icon={<FullscreenOutlined />} onClick={() => openFullscreenEditor('releaseConfigJson')}>
                          全屏编辑
                        </Button>
                      </Space>
                    }
                    style={{ borderRadius: 12 }}
                  >
                    <CopyableCodeBlock
                      text={(editorForm.getFieldValue('releaseConfigJson') as string) || '{}'}
                      maxHeight={280}
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
                        message="本步已就绪"
                      />
                    </Space>
                  ) : (
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Alert
                        type="warning"
                        showIcon
                        message={`还需补齐 ${currentEditorStepCheck.issues.length} 项`}
                      />
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
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text>{item.value}</Text>
                          {item.stepIndex <= editorMaxStepIndex ? (
                            <Button
                              type="link"
                              size="small"
                              disabled={item.stepIndex === editorStepIndex}
                              style={{ paddingInline: 0, alignSelf: 'flex-start' }}
                              onClick={() => navigateToEditorStep(item.stepIndex)}
                            >
                              {item.stepIndex === editorStepIndex ? '正在编辑本步' : `回到第 ${item.stepIndex + 1} 步`}
                            </Button>
                          ) : null}
                        </Space>
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
        destroyOnHidden={false}
        onCancel={() => setFullscreenEditorField(null)}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            {fullscreenEditorField === 'scriptContent' ? (
              <>
                <Button onClick={() => applyRecommendedEditorValue('scriptContent')}>当前方向骨架</Button>
                <Button onClick={handleRegenerateScriptFromVisual}>按可视化重建</Button>
              </>
            ) : null}
            {fullscreenEditorField && fullscreenEditorField !== 'scriptContent' ? (
              <>
                <Button onClick={() => applyRecommendedEditorValue(fullscreenEditorField)}>恢复推荐值</Button>
                <Button onClick={handleFormatFullscreenEditor}>格式化 JSON</Button>
              </>
            ) : null}
            <CopyText text={currentFullscreenEditorValue}>
              <span style={{ fontSize: 12 }}>复制内容</span>
            </CopyText>
            <Button onClick={() => setFullscreenEditorField(null)}>关闭</Button>
          </Space>
        }
        styles={{ body: { paddingTop: 12 } }}
      >
        {currentFullscreenEditorMeta ? (
          <ProtocolCodeEditor
            language={currentFullscreenEditorMeta.language}
            path={currentFullscreenEditorMeta.fullscreenPath}
            height="72vh"
            value={currentFullscreenEditorValue}
            onChange={handleFullscreenEditorChange}
          />
        ) : null}
      </Modal>

      <Drawer
        title={debugRecord ? `上行调试 · ${describeRecordScope(debugRecord)}` : '上行调试'}
        open={uplinkDebugOpen}
        width={960}
        destroyOnHidden
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
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="productId" label="调试产品">
                <ProductSelect
                  placeholder="搜索并选择产品（名称或 productKey）"
                  pinnedLabel={uplinkDebugProduct ? `${uplinkDebugProduct.name} (${uplinkDebugProduct.productKey})` : undefined}
                  onChange={(value) => void ensureProductLabels([value])}
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
              <Form.Item
                name="sessionId"
                label="会话 ID"
                extra={
                  <Button size="small" loading={debugSessionLoading} onClick={() => void fetchDebugSessions()}>
                    刷新会话候选
                  </Button>
                }
              >
                <AutoComplete
                  allowClear
                  options={debugSessionIdOptions}
                  placeholder="可搜索 TCP/WebSocket 在线会话，也可手动填写"
                  filterOption={(inputValue, option) =>
                    String(option?.label ?? option?.value ?? '')
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="remoteAddress" label="远端地址">
                <AutoComplete
                  allowClear
                  options={debugRemoteAddressOptions}
                  placeholder="可从在线会话中选择，也可手动填写 IP:端口"
                  filterOption={(inputValue, option) =>
                    String(option?.value ?? '')
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Alert
                type="warning"
                showIcon
                message="载荷需包含可识别设备的字段，否则调试会因无法匹配设备而失败。"
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
                <CopyText text={currentUplinkPayload}>
                  <span style={{ fontSize: 12 }}>复制载荷</span>
                </CopyText>
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
                <CopyText text={currentUplinkHeadersText}>
                  <span style={{ fontSize: 12 }}>复制请求头</span>
                </CopyText>
              </Space>
            }
          >
            <ProtocolJsonEditor height={140} path="file:///protocol-parser/debug-uplink-headers.json" hint="JSON 对象，可为空" />
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
                  <Descriptions.Item label="产品 Key">
                    <CopyText text={debugResult.identity.productKey} />
                  </Descriptions.Item>
                  <Descriptions.Item label="设备名称">
                    <CopyText text={debugResult.identity.deviceName} />
                  </Descriptions.Item>
                  <Descriptions.Item label="标识类型">{debugResult.identity.locatorType || '-'}</Descriptions.Item>
                  <Descriptions.Item label="标识值">
                    <CopyText text={debugResult.identity.locatorValue} />
                  </Descriptions.Item>
                </Descriptions>
              ) : null}

              <div>
                <Text strong>输出消息（{debugResult.messages?.length || 0}）</Text>
                {debugResult.messages && debugResult.messages.length > 0 ? (
                  <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
                    {debugResult.messages.map((item, index) => (
                      <Card key={`${item.messageId || 'msg'}-${index}`} size="small">
                        <Descriptions bordered size="small" column={2}>
                          <Descriptions.Item label="消息 ID">
                            <CopyText text={item.messageId} />
                          </Descriptions.Item>
                          <Descriptions.Item label="类型">{item.type || '-'}</Descriptions.Item>
                          <Descriptions.Item label="主题" span={2}>
                            <CopyText text={item.topic} ellipsis />
                          </Descriptions.Item>
                          <Descriptions.Item label="设备名称">
                            <CopyText text={item.deviceName} />
                          </Descriptions.Item>
                          <Descriptions.Item label="时间戳">{item.timestamp || '-'}</Descriptions.Item>
                        </Descriptions>
                        <div style={{ marginTop: 12 }}>
                          <CopyableCodeBlock text={formatJson(item.payload)} label="输出报文载荷" />
                        </div>
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
        destroyOnHidden
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
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="productId" label="调试产品">
                <ProductSelect
                  placeholder="搜索并选择产品（名称或 productKey）"
                  pinnedLabel={downlinkDebugProduct ? `${downlinkDebugProduct.name} (${downlinkDebugProduct.productKey})` : undefined}
                  onChange={(value) => {
                    downlinkDebugForm.setFieldsValue({ deviceName: undefined });
                    void ensureProductLabels([value]);
                    void searchDownlinkDevices('', value);
                  }}
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
              <Form.Item
                name="deviceName"
                label="设备名称"
                extra={
                  deviceOptionsError ? (
                    <Space size={4} wrap>
                      <Text type="warning">{deviceOptionsError}</Text>
                      <Button size="small" onClick={() => void searchDownlinkDevices('', currentDownlinkProductId)}>
                        重试
                      </Button>
                    </Space>
                  ) : undefined
                }
              >
                <Select
                  placeholder={currentDownlinkProductId ? '搜索并选择设备（输入设备名称）' : '可先选择产品再选择设备'}
                  allowClear
                  showSearch
                  filterOption={false}
                  onSearch={handleDownlinkDeviceSearch}
                  loading={downlinkDeviceLoading}
                  options={downlinkDeviceOptions}
                  notFoundContent={downlinkDeviceLoading ? '设备搜索中...' : '未找到匹配设备，换个关键字试试'}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sessionId" label="会话 ID">
                <AutoComplete
                  allowClear
                  options={debugSessionIdOptions}
                  placeholder="可搜索 TCP/WebSocket 在线会话，也可手动填写"
                  filterOption={(inputValue, option) =>
                    String(option?.label ?? option?.value ?? '')
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="remoteAddress" label="远端地址">
                <AutoComplete
                  allowClear
                  options={debugRemoteAddressOptions}
                  placeholder="可从在线会话中选择，也可手动填写 IP:端口"
                  filterOption={(inputValue, option) =>
                    String(option?.value ?? '')
                      .toLowerCase()
                      .includes(inputValue.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="headersText" label="请求头 JSON">
                <ProtocolJsonEditor height={140} path="file:///protocol-parser/debug-downlink-headers.json" hint="JSON 对象，可为空" />
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
                <CopyText text={currentDownlinkPayloadText}>
                  <span style={{ fontSize: 12 }}>复制载荷</span>
                </CopyText>
              </Space>
            }
            rules={[{ required: true, message: '请输入载荷 JSON' }]}
          >
            <ProtocolJsonEditor height={220} path="file:///protocol-parser/debug-downlink-payload.json" />
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
                <Descriptions.Item label="主题">
                  <CopyText text={encodeResult.topic} />
                </Descriptions.Item>
                <Descriptions.Item label="编码">{encodeResult.payloadEncoding || '-'}</Descriptions.Item>
              </Descriptions>
              {encodeResult.payloadText ? (
                <CopyableCodeBlock text={encodeResult.payloadText} label="文本载荷" />
              ) : null}
              {encodeResult.payloadHex ? (
                <div>
                  <Text strong>十六进制载荷</Text>
                  <Paragraph style={{ marginBottom: 0 }}>
                    <CopyText text={encodeResult.payloadHex} />
                  </Paragraph>
                </div>
              ) : null}
              {encodeResult.headers ? (
                <CopyableCodeBlock text={formatJson(encodeResult.headers)} label="请求头" />
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
          setVersionError(null);
        }}
      >
        {versionError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 12 }}
            message="版本历史加载失败"
            description={versionError}
            action={
              <Button size="small" loading={versionLoading} onClick={() => versionRecord && void fetchVersions(versionRecord)}>
                重试
              </Button>
            }
          />
        ) : null}
        <Table
          rowKey="id"
          size="small"
          loading={versionLoading}
          columns={versionColumns}
          dataSource={versionItems}
          pagination={false}
          locale={{ emptyText: <ListEmpty compact emptyText="暂无版本历史" /> }}
        />
      </Modal>

      <Modal
        title={publishRecord ? `发布规则 · ${describeRecordScope(publishRecord)}` : '发布规则'}
        open={publishOpen}
        destroyOnHidden
        confirmLoading={publishSubmitting}
        okText="确认发布"
        cancelText="取消"
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
            message="发布后草稿版本立即生效并刷新连接器运行时缓存，命中该规则的报文将改用新版本解析。"
          />
          {publishRecord ? (
            <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="生效范围">{describeRecordScope(publishRecord)}</Descriptions.Item>
              <Descriptions.Item label="发布范围">
                {findOptionLabel(RELEASE_MODE_OPTIONS, publishRecord.releaseMode || 'ALL')}（
                {formatReleaseSummary(publishRecord)}）
              </Descriptions.Item>
              <Descriptions.Item label="版本变化">
                草稿 v{publishRecord.currentVersion || 1}
                {publishRecord.publishedVersion ? ` → 替换已发布 v${publishRecord.publishedVersion}` : ' → 首次发布'}
              </Descriptions.Item>
            </Descriptions>
          ) : null}
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
        okText="确认回滚"
        cancelText="取消"
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
            style={{ marginBottom: 12 }}
            message="回滚会恢复所选历史快照并立即生效，正在使用当前版本解析的报文将改按回滚版本处理。"
            description={
              rollbackRecord?.publishedVersion
                ? `当前已发布版本：v${rollbackRecord.publishedVersion}`
                : '当前尚未发布任何版本'
            }
          />
          {rollbackRecord ? (
            <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="生效范围">{describeRecordScope(rollbackRecord)}</Descriptions.Item>
              <Descriptions.Item label="发布范围">
                {findOptionLabel(RELEASE_MODE_OPTIONS, rollbackRecord.releaseMode || 'ALL')}（
                {formatReleaseSummary(rollbackRecord)}）
              </Descriptions.Item>
            </Descriptions>
          ) : null}
          {versionError ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 12 }}
              message="版本历史加载失败"
              description={versionError}
              action={
                <Button size="small" loading={versionLoading} onClick={() => rollbackRecord && void fetchVersions(rollbackRecord)}>
                  重试
                </Button>
              }
            />
          ) : null}
          <Form.Item name="version" label="目标版本" rules={[{ required: true, message: '请选择目标版本' }]}>
            <Select loading={versionLoading} placeholder="选择历史版本" options={rollbackVersionOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProtocolParserPage;
