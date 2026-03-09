import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApiOutlined,
  BugOutlined,
  EditOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RollbackOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi, protocolParserApi } from '../../services/api';
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

interface ProductOption {
  id: number;
  name: string;
  productKey: string;
  protocol?: string;
}

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
  deviceId?: number;
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
  deviceId?: number;
  deviceName?: string;
}

interface DownlinkDebugFormValues {
  productId?: number;
  topic?: string;
  messageType: string;
  deviceId?: number;
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

const PARSER_MODE_OPTIONS = [
  { value: 'SCRIPT', label: 'Script' },
  { value: 'PLUGIN', label: 'Plugin' },
];

const FRAME_MODE_OPTIONS = [
  { value: 'NONE', label: 'None' },
  { value: 'DELIMITER', label: 'Delimiter' },
  { value: 'FIXED_LENGTH', label: 'Fixed Length' },
  { value: 'LENGTH_FIELD', label: 'Length Field' },
];

const DIRECTION_OPTIONS = [
  { value: 'UPLINK', label: 'Uplink' },
  { value: 'DOWNLINK', label: 'Downlink' },
];

const ERROR_POLICY_OPTIONS = [
  { value: 'ERROR', label: 'Error' },
  { value: 'DROP', label: 'Drop' },
  { value: 'RAW_DATA', label: 'Raw Data Fallback' },
];

const PAYLOAD_ENCODING_OPTIONS = [
  { value: 'TEXT', label: 'TEXT' },
  { value: 'JSON', label: 'JSON' },
  { value: 'HEX', label: 'HEX' },
  { value: 'BASE64', label: 'BASE64' },
];

const RELEASE_MODE_OPTIONS = [
  { value: 'ALL', label: 'All Devices' },
  { value: 'DEVICE_LIST', label: 'Device List' },
  { value: 'HASH_PERCENT', label: 'Hash Percent' },
];

const SCOPE_TYPE_OPTIONS = [
  { value: 'PRODUCT', label: 'Product Scope' },
  { value: 'TENANT', label: 'Tenant Default Scope' },
];

const STATUS_META: Record<string, { color: string; label: string }> = {
  DRAFT: { color: 'processing', label: 'Draft' },
  ENABLED: { color: 'success', label: 'Enabled' },
  DISABLED: { color: 'default', label: 'Disabled' },
};

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

const DEFAULT_UPLINK_DEBUG_VALUES: UplinkDebugFormValues = {
  payloadEncoding: 'HEX',
  payload: '',
  headersText: '{}',
  sessionId: '',
  remoteAddress: '',
  deviceName: '',
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
    throw new Error(`${fieldName} must be valid JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldName} must be a JSON object`);
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
    throw new Error(`${fieldName} must be valid JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldName} must be a JSON object`);
  }
  return parsed as Record<string, string>;
};

const parseRequiredObject = (raw: string, fieldName: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim() || '{}');
  } catch {
    throw new Error(`${fieldName} must be valid JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error(`${fieldName} must be a JSON object`);
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

const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2);

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
      return JSON.stringify({ deviceIds: [1001], deviceNames: ['demo-device-01'] }, null, 2);
    case 'HASH_PERCENT':
      return JSON.stringify({ percent: 10 }, null, 2);
    default:
      return '{}';
  }
};

const formatReleaseSummary = (record: ProtocolParserRecord) => {
  const releaseMode = (record.releaseMode || 'ALL').toUpperCase();
  try {
    const config = JSON.parse(record.releaseConfigJson || '{}') as Record<string, unknown>;
    if (releaseMode === 'HASH_PERCENT') {
      return `${config.percent || 0}%`;
    }
    if (releaseMode === 'DEVICE_LIST') {
      const deviceIds = Array.isArray(config.deviceIds) ? config.deviceIds.length : 0;
      const deviceNames = Array.isArray(config.deviceNames) ? config.deviceNames.length : 0;
      return `${deviceIds + deviceNames} targets`;
    }
    return 'All devices';
  } catch {
    return releaseMode;
  }
};

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
  const [loading, setLoading] = useState(false);
  const [productLoading, setProductLoading] = useState(false);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filterProductId, setFilterProductId] = useState<number | undefined>(initialProductId);
  const [filterProtocol, setFilterProtocol] = useState<string | undefined>();
  const [filterTransport, setFilterTransport] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeReloading, setRuntimeReloading] = useState(false);
  const [runtimeMetrics, setRuntimeMetrics] = useState<RuntimeMetrics | null>(null);
  const [runtimePlugins, setRuntimePlugins] = useState<RuntimePlugin[]>([]);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimePluginCatalogItem[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [currentRecord, setCurrentRecord] = useState<ProtocolParserRecord | null>(null);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>();
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
  const currentDirection = Form.useWatch('direction', editorForm) || DEFAULT_EDITOR_VALUES.direction;
  const currentScopeType = Form.useWatch('scopeType', editorForm) || DEFAULT_EDITOR_VALUES.scopeType;
  const currentReleaseMode = Form.useWatch('releaseMode', editorForm) || DEFAULT_EDITOR_VALUES.releaseMode;

  const canCreate = hasPermission('protocol-parser:create');
  const canUpdate = hasPermission('protocol-parser:update');
  const canTest = hasPermission('protocol-parser:test');
  const canPublish = hasPermission('protocol-parser:publish');
  const canRead = hasPermission('protocol-parser:read');

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const selectedProduct = filterProductId ? productMap.get(filterProductId) : undefined;
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

  const stats = useMemo(
    () => ({
      enabled: records.filter((item) => item.status === 'ENABLED').length,
      drafts: records.filter((item) => item.status === 'DRAFT').length,
      downlink: records.filter((item) => item.direction === 'DOWNLINK').length,
      tenantDefault: records.filter((item) => item.scopeType === 'TENANT').length,
    }),
    [records],
  );

  const fetchProducts = async () => {
    setProductLoading(true);
    try {
      const response = await productApi.list({ pageNum: 1, pageSize: 500 });
      const page = response.data.data as { records?: ProductOption[] };
      setProducts(page.records || []);
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to load products'));
    } finally {
      setProductLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await protocolParserApi.list({
        pageNum,
        pageSize,
        productId: filterProductId,
        protocol: filterProtocol,
        transport: filterTransport,
        status: filterStatus,
      });
      const page = response.data.data as { records?: ProtocolParserRecord[]; total?: number };
      setRecords(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to load protocol parsers'));
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
      message.error(getErrorMessage(error, 'Failed to load runtime status'));
    } finally {
      setRuntimeLoading(false);
    }
  };

  useEffect(() => {
    void fetchProducts();
  }, []);

  useEffect(() => {
    void fetchData();
  }, [pageNum, pageSize, filterProductId, filterProtocol, filterTransport, filterStatus]);

  useEffect(() => {
    void fetchRuntime();
  }, [canRead]);

  const closeEditorModal = () => {
    setEditorOpen(false);
    setCurrentRecord(null);
    setSelectedTemplateKey(undefined);
  };

  const applyTemplate = (template?: ProtocolParserTemplate) => {
    if (!template) {
      message.warning('Please select a template first');
      return;
    }
    const visualConfigJson = defaultVisualConfigForDirection(template.direction as VisualFlowDirection);
    editorForm.setFieldsValue({
      protocol: template.protocol,
      transport: template.transport,
      direction: template.direction as 'UPLINK' | 'DOWNLINK',
      parserMode: 'SCRIPT',
      frameMode: template.frameMode,
      matchRuleJson: template.matchRuleJson,
      frameConfigJson: template.frameConfigJson,
      parserConfigJson: template.parserConfigJson,
      visualConfigJson,
      scriptLanguage: template.scriptLanguage,
      scriptContent: template.scriptContent,
      timeoutMs: template.timeoutMs,
      errorPolicy: template.errorPolicy,
    });
    message.success(`Template applied: ${template.label}`);
  };

  const openCreateModal = () => {
    editorForm.resetFields();
    editorForm.setFieldsValue({
      ...DEFAULT_EDITOR_VALUES,
      productId: filterProductId,
      scopeType: filterProductId ? 'PRODUCT' : DEFAULT_EDITOR_VALUES.scopeType,
    });
    setCurrentRecord(null);
    setEditorMode('create');
    setSelectedTemplateKey(undefined);
    setEditorOpen(true);
  };

  const openEditModal = async (record: ProtocolParserRecord) => {
    setSubmitting(true);
    try {
      const response = await protocolParserApi.get(record.id);
      const detail = response.data.data as ProtocolParserRecord;
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
        parserConfigJson: prettyJson(detail.parserConfigJson),
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
      setEditorOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to load parser detail'));
    } finally {
      setSubmitting(false);
    }
  };

  const buildEditorPayload = (values: EditorFormValues) => {
    if (values.scopeType === 'PRODUCT' && !values.productId) {
      throw new Error('Product scope requires a product');
    }
    if (values.parserMode === 'SCRIPT' && !trimOptional(values.scriptContent)) {
      throw new Error('Script mode requires script content');
    }
    if (values.parserMode === 'PLUGIN' && !trimOptional(values.pluginId)) {
      throw new Error('Plugin mode requires pluginId');
    }

    return {
      productId: values.scopeType === 'PRODUCT' ? values.productId : undefined,
      scopeType: values.scopeType,
      scopeId: values.scopeId,
      protocol: values.protocol.trim(),
      transport: values.transport.trim(),
      direction: values.direction,
      parserMode: values.parserMode,
      frameMode: values.frameMode,
      matchRuleJson: ensureJsonObjectText(values.matchRuleJson, 'Match rule'),
      frameConfigJson: ensureJsonObjectText(values.frameConfigJson, 'Frame config'),
      parserConfigJson: ensureJsonObjectText(values.parserConfigJson, 'Parser config'),
      visualConfigJson: ensureJsonObjectText(values.visualConfigJson, 'Visual config'),
      scriptLanguage: values.parserMode === 'SCRIPT' ? trimOptional(values.scriptLanguage) || 'JS' : undefined,
      scriptContent: values.parserMode === 'SCRIPT' ? values.scriptContent : undefined,
      pluginId: values.parserMode === 'PLUGIN' ? trimOptional(values.pluginId) : undefined,
      pluginVersion: values.parserMode === 'PLUGIN' ? trimOptional(values.pluginVersion) : undefined,
      timeoutMs: values.timeoutMs,
      errorPolicy: values.errorPolicy,
      releaseMode: values.releaseMode,
      releaseConfigJson: ensureJsonObjectText(values.releaseConfigJson, 'Release config'),
    };
  };

  const handleSubmitEditor = async (values: EditorFormValues) => {
    setSubmitting(true);
    try {
      const payload = buildEditorPayload(values);
      if (editorMode === 'create') {
        await protocolParserApi.create(payload);
        message.success('Protocol parser created');
      } else if (currentRecord) {
        await protocolParserApi.update(currentRecord.id, payload);
        message.success('Protocol parser updated');
      }
      closeEditorModal();
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to save protocol parser'));
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
      message.success('Script generated from visual config');
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to generate script from visual config'));
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
      productId: record.productId || filterProductId,
      protocol: record.protocol,
      transport,
      topic: defaultTopicByTransport(transport, 'UPLINK'),
      payloadEncoding: transport === 'TCP' || transport === 'UDP' ? 'HEX' : 'JSON',
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
      productId: record.productId || filterProductId,
      topic: defaultTopicByTransport(record.transport, 'DOWNLINK'),
    });
    setDownlinkDebugOpen(true);
  };

  const handleUplinkDebug = async (values: UplinkDebugFormValues) => {
    if (!debugRecord) {
      return;
    }
    setDebugSubmitting(true);
    try {
      const headers = parseOptionalStringMap(values.headersText, 'Headers');
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
        deviceId: values.deviceId,
        deviceName: trimOptional(values.deviceName),
      });
      const data = response.data.data as DebugResult;
      setDebugResult(data);
      if (data.success) {
        message.success('Uplink debug completed');
      } else {
        message.warning(data.errorMessage || 'Uplink debug returned an error');
      }
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to run uplink debug'));
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
      const headers = parseOptionalStringMap(values.headersText, 'Headers');
      const payload = parseRequiredObject(values.payloadText, 'Payload');
      const response = await protocolParserApi.encodeTest(debugRecord.id, {
        productId: values.productId,
        topic: trimOptional(values.topic),
        messageType: trimOptional(values.messageType),
        deviceId: values.deviceId,
        deviceName: trimOptional(values.deviceName),
        headers,
        sessionId: trimOptional(values.sessionId),
        remoteAddress: trimOptional(values.remoteAddress),
        payload,
      });
      const data = response.data.data as EncodeDebugResult;
      setEncodeResult(data);
      if (data.success) {
        message.success('Downlink encode test completed');
      } else {
        message.warning(data.errorMessage || 'Downlink encode test returned an error');
      }
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to run downlink encode test'));
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
      message.error(getErrorMessage(error, 'Failed to load version history'));
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
      message.success('Protocol parser published');
      setPublishOpen(false);
      setPublishRecord(null);
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to publish protocol parser'));
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
      message.success('Protocol parser rolled back');
      setRollbackOpen(false);
      setRollbackRecord(null);
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to rollback protocol parser'));
    } finally {
      setRollbackSubmitting(false);
    }
  };

  const handleToggleStatus = async (record: ProtocolParserRecord) => {
    try {
      if (record.status === 'ENABLED') {
        await protocolParserApi.disable(record.id);
        message.success('Protocol parser disabled');
      } else {
        await protocolParserApi.enable(record.id);
        message.success('Protocol parser enabled');
      }
      void fetchData();
      void fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to change parser status'));
    }
  };

  const handleReloadPlugins = async () => {
    setRuntimeReloading(true);
    try {
      await protocolParserApi.reloadRuntimePlugins();
      message.success('Runtime plugins reloaded');
      await fetchRuntime();
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to reload runtime plugins'));
    } finally {
      setRuntimeReloading(false);
    }
  };

  const versionColumns: ColumnsType<ProtocolParserVersionRecord> = [
    {
      title: 'Version',
      dataIndex: 'versionNo',
      width: 100,
      render: (value: number) => <Tag color="blue">v{value}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'publishStatus',
      width: 140,
      render: (value?: string) => value || '-',
    },
    {
      title: 'Change Log',
      dataIndex: 'changeLog',
      render: (value?: string) => value || '-',
    },
    {
      title: 'Created At',
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
      title: 'Scope',
      width: 220,
      render: (_, record) => {
        const product = record.productId ? productMap.get(record.productId) : undefined;
        return (
          <Space direction="vertical" size={2}>
            <Space wrap>
              <Tag color={record.scopeType === 'TENANT' ? 'gold' : 'blue'}>
                {record.scopeType === 'TENANT' ? 'Tenant Default' : 'Product'}
              </Tag>
              {record.productId ? <Text type="secondary">#{record.productId}</Text> : null}
            </Space>
            <Text strong>{product ? product.name : record.scopeType === 'TENANT' ? 'Tenant Shared Rule' : 'Unknown Product'}</Text>
            <Text type="secondary">scopeId: {record.scopeId || '-'}</Text>
          </Space>
        );
      },
    },
    {
      title: 'Protocol',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Tag color={transportColor(record.transport)}>{record.transport}</Tag>
            <Tag>{record.protocol}</Tag>
            <Tag color={record.direction === 'DOWNLINK' ? 'purple' : 'green'}>{record.direction}</Tag>
          </Space>
          <Text type="secondary">{record.frameMode || 'NONE'}</Text>
        </Space>
      ),
    },
    {
      title: 'Execution',
      width: 220,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Tag color={record.parserMode === 'PLUGIN' ? 'magenta' : 'geekblue'}>{record.parserMode}</Tag>
            <Tag>{record.errorPolicy || 'ERROR'}</Tag>
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
      title: 'Release',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          <Tag color={record.releaseMode === 'ALL' ? 'default' : 'orange'}>{record.releaseMode || 'ALL'}</Tag>
          <Text type="secondary">{formatReleaseSummary(record)}</Text>
        </Space>
      ),
    },
    {
      title: 'Version',
      width: 140,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text>Draft v{record.currentVersion || 1}</Text>
          <Text type="secondary">
            Published {record.publishedVersion ? `v${record.publishedVersion}` : '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (value: string) => {
        const meta = STATUS_META[value] || { color: 'default', label: value };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: 'Updated At',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
    {
      title: 'Actions',
      width: 380,
      fixed: 'right',
      render: (_, record) => (
        <Space wrap>
          {canUpdate ? (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openEditModal(record)}>
              Edit
            </Button>
          ) : null}
          {canTest && record.direction === 'UPLINK' ? (
            <Button type="link" size="small" icon={<BugOutlined />} onClick={() => openUplinkDebugModal(record)}>
              Debug
            </Button>
          ) : null}
          {canTest && record.direction === 'DOWNLINK' ? (
            <Button type="link" size="small" icon={<BugOutlined />} onClick={() => openDownlinkDebugModal(record)}>
              Encode Test
            </Button>
          ) : null}
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => void openVersionModal(record)}>
            Versions
          </Button>
          {canPublish ? (
            <Button type="link" size="small" icon={<RocketOutlined />} onClick={() => openPublishModal(record)}>
              Publish
            </Button>
          ) : null}
          {canPublish ? (
            <Button type="link" size="small" icon={<RollbackOutlined />} onClick={() => void openRollbackModal(record)}>
              Rollback
            </Button>
          ) : null}
          {canUpdate ? (
            <Button
              type="link"
              size="small"
              icon={record.status === 'ENABLED' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={() => void handleToggleStatus(record)}
            >
              {record.status === 'ENABLED' ? 'Disable' : 'Enable'}
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Custom Protocol Parsers"
        description={
          selectedProduct
            ? `${total} rules · current filter: ${selectedProduct.name} (${selectedProduct.productKey})`
            : `${total} rules across product and tenant scopes`
        }
        extra={
          <Space wrap>
            {canCreate ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                New Parser
              </Button>
            ) : null}
            <Button icon={<ApiOutlined />} onClick={() => void fetchData()}>
              Refresh Rules
            </Button>
          </Space>
        }
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: 'Enabled', value: stats.enabled, color: '#16a34a' },
          { title: 'Draft', value: stats.drafts, color: '#2563eb' },
          { title: 'Downlink', value: stats.downlink, color: '#c2410c' },
          { title: 'Tenant Default', value: stats.tenantDefault, color: '#7c3aed' },
        ].map((item) => (
          <Col xs={12} md={6} key={item.title}>
            <Card size="small" style={{ borderRadius: 16 }}>
              <Text type="secondary">{item.title}</Text>
              <div style={{ fontSize: 28, fontWeight: 700, color: item.color }}>{item.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card style={{ marginBottom: 16, borderRadius: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} md={6}>
            <Select
              allowClear
              showSearch
              loading={productLoading}
              value={filterProductId}
              style={{ width: '100%' }}
              placeholder="Filter by product"
              options={productOptions}
              optionFilterProp="label"
              onChange={(value) => {
                setFilterProductId(value);
                setPageNum(1);
              }}
            />
          </Col>
          <Col xs={24} md={5}>
            <Input
              value={filterProtocol}
              placeholder="Protocol"
              onChange={(event) => {
                setFilterProtocol(trimOptional(event.target.value));
                setPageNum(1);
              }}
            />
          </Col>
          <Col xs={24} md={5}>
            <Input
              value={filterTransport}
              placeholder="Transport"
              onChange={(event) => {
                setFilterTransport(trimOptional(event.target.value));
                setPageNum(1);
              }}
            />
          </Col>
          <Col xs={24} md={4}>
            <Select
              allowClear
              value={filterStatus}
              style={{ width: '100%' }}
              placeholder="Status"
              options={Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))}
              onChange={(value) => {
                setFilterStatus(value);
                setPageNum(1);
              }}
            />
          </Col>
          <Col xs={24} md={4}>
            <Space wrap>
              <Button
                onClick={() => {
                  setFilterProductId(undefined);
                  setFilterProtocol(undefined);
                  setFilterTransport(undefined);
                  setFilterStatus(undefined);
                  setPageNum(1);
                }}
              >
                Reset
              </Button>
              <Button onClick={() => void fetchRuntime()}>Refresh Runtime</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <ProtocolParserRuntimePanel
        loading={runtimeLoading}
        reloading={runtimeReloading}
        metrics={runtimeMetrics}
        plugins={runtimePlugins}
        catalog={runtimeCatalog}
        onRefresh={() => void fetchRuntime()}
        onReload={() => void handleReloadPlugins()}
      />

      <Card style={{ borderRadius: 16 }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={records}
          scroll={{ x: 1700 }}
          locale={{ emptyText: <Empty description="No protocol parser rules" /> }}
          pagination={{
            current: pageNum,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `${count} items`,
            onChange: (nextPage, nextPageSize) => {
              setPageNum(nextPage);
              setPageSize(nextPageSize);
            },
          }}
        />
      </Card>

      <Modal
        title={editorMode === 'create' ? 'New Protocol Parser' : 'Edit Protocol Parser'}
        open={editorOpen}
        width={1080}
        destroyOnHidden
        confirmLoading={submitting}
        onCancel={closeEditorModal}
        onOk={() => editorForm.submit()}
      >
        <Form form={editorForm} layout="vertical" preserve={false} onFinish={handleSubmitEditor}>
          <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
            <Row gutter={[16, 16]} align="middle">
              <Col xs={24} lg={10}>
                <Form.Item label="Template" style={{ marginBottom: 0 }}>
                  <Select
                    allowClear
                    showSearch
                    placeholder="Choose a parser template"
                    value={selectedTemplateKey}
                    options={templateOptions}
                    optionFilterProp="label"
                    onChange={(value) => setSelectedTemplateKey(value)}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} lg={14}>
                {selectedTemplate ? (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                      <Text strong>{selectedTemplate.label}</Text>
                      <Tag color={transportColor(selectedTemplate.transport)}>{selectedTemplate.transport}</Tag>
                      <Tag>{selectedTemplate.protocol}</Tag>
                      <Tag color="green">{selectedTemplate.direction}</Tag>
                      {selectedTemplate.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </Space>
                    <Text type="secondary">{selectedTemplate.description}</Text>
                    <Space wrap>
                      <Button onClick={() => applyTemplate(selectedTemplate)}>Apply Template</Button>
                      <Text type="secondary">Template only updates parser-related fields and keeps your scope choice.</Text>
                    </Space>
                  </Space>
                ) : (
                  <Text type="secondary">Templates speed up common uplink onboarding and can be refined afterward.</Text>
                )}
              </Col>
            </Row>
          </Card>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="scopeType" label="Scope">
                <Select options={SCOPE_TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="productId"
                label="Product"
                rules={[
                  {
                    validator: (_, value) => {
                      if (currentScopeType === 'PRODUCT' && !value) {
                        return Promise.reject(new Error('Product scope requires a product'));
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
                  placeholder={currentScopeType === 'TENANT' ? 'Tenant scope uses tenant default' : 'Select product'}
                  options={productOptions}
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="scopeId" label="Scope ID">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="Optional override" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={6}>
              <Form.Item name="protocol" label="Protocol" rules={[{ required: true, message: 'Please enter protocol' }]}>
                <Input placeholder="TCP_UDP / MQTT / HTTP / COAP" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="transport" label="Transport" rules={[{ required: true, message: 'Please enter transport' }]}>
                <Input placeholder="TCP / UDP / MQTT / HTTP / COAP" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="direction" label="Direction">
                <Select options={DIRECTION_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="timeoutMs" label="Timeout (ms)" rules={[{ required: true, message: 'Please enter timeout' }]}>
                <InputNumber min={1} max={60000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="parserMode" label="Parser Mode">
                <Select options={PARSER_MODE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="frameMode" label="Frame Mode">
                <Select options={FRAME_MODE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="errorPolicy" label="Error Policy">
                <Select options={ERROR_POLICY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="One parser definition now covers product scope, tenant default scope, uplink decode, downlink encode, gray release, and visual flow config."
            description={
              currentDirection === 'DOWNLINK'
                ? 'Downlink rules are used by runtime encoding and the encode-test endpoint.'
                : 'Uplink rules are used by runtime parse, device locator matching, and the debug parse endpoint.'
            }
          />

          <Row gutter={16}>
            <Col xs={24} lg={12}>
              <Form.Item
                name="matchRuleJson"
                label="Match Rule JSON"
                extra="Supports topicPrefix, topicEquals, messageTypeEquals, deviceNameEquals, productKeyEquals, headerEquals, and remoteAddressPrefix."
                rules={[{ required: true, message: 'Please enter match rule JSON' }]}
              >
                <TextArea rows={8} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col xs={24} lg={12}>
              <Form.Item
                name="frameConfigJson"
                label="Frame Config JSON"
                extra="Use delimiter, fixedLength, or length field settings for TCP/UDP packet splitting."
                rules={[{ required: true, message: 'Please enter frame config JSON' }]}
              >
                <TextArea rows={8} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="parserConfigJson"
            label="Parser Config JSON"
            extra="Injected into runtime ctx.config for script or plugin execution."
            rules={[{ required: true, message: 'Please enter parser config JSON' }]}
          >
            <TextArea rows={6} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Card
            size="small"
            title="Visual Flow"
            extra={
              <Space>
                <Button
                  onClick={() =>
                    editorForm.setFieldsValue({
                      visualConfigJson: defaultVisualConfigForDirection(currentDirection as VisualFlowDirection),
                    })
                  }
                >
                  Use Default
                </Button>
                <Button onClick={handleGenerateVisualScript}>Generate Script</Button>
              </Space>
            }
            style={{ marginBottom: 16, borderRadius: 12 }}
          >
            <Form.Item
              name="visualConfigJson"
              label="Visual Config JSON"
              extra="Phase 3 minimal visual orchestration: maintain a structured config and generate the JS script with one click."
              rules={[{ required: true, message: 'Please enter visual config JSON' }]}
              style={{ marginBottom: 0 }}
            >
              <TextArea rows={8} style={{ fontFamily: 'monospace' }} />
            </Form.Item>
          </Card>

          {currentParserMode === 'SCRIPT' ? (
            <>
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name="scriptLanguage" label="Script Language">
                    <Input placeholder="JS" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item
                name="scriptContent"
                label="Script Content"
                rules={[{ required: true, message: 'Please enter script content' }]}
              >
                <TextArea rows={14} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="pluginId"
                label="Plugin ID"
                rules={[{ required: true, message: 'Please enter plugin ID' }]}
                extra={
                  runtimePlugins.length > 0
                    ? `Available runtime plugins: ${runtimePlugins.map((item) => item.pluginId).join(', ')}`
                    : 'Plugin can be loaded from classpath or plugins/protocol-parsers directory.'
                }
              >
                <Input placeholder="demo-json-bridge" />
              </Form.Item>
              <Form.Item name="pluginVersion" label="Plugin Version">
                <Input placeholder="1.0.0" />
              </Form.Item>
            </>
          )}

          <Card
            size="small"
            title="Gray Release"
            extra={
              <Button onClick={() => editorForm.setFieldsValue({ releaseConfigJson: releaseModePreset(currentReleaseMode) })}>
                Fill Preset
              </Button>
            }
            style={{ borderRadius: 12 }}
          >
            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="releaseMode" label="Release Mode">
                  <Select options={RELEASE_MODE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item
                  name="releaseConfigJson"
                  label="Release Config JSON"
                  extra="ALL uses {}, DEVICE_LIST uses deviceIds/deviceNames, HASH_PERCENT uses { percent }."
                  rules={[{ required: true, message: 'Please enter release config JSON' }]}
                >
                  <TextArea rows={6} style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Form>
      </Modal>

      <Modal
        title={`Uplink Debug${debugRecord ? ` · #${debugRecord.id}` : ''}`}
        open={uplinkDebugOpen}
        width={960}
        destroyOnHidden
        confirmLoading={debugSubmitting}
        onCancel={() => setUplinkDebugOpen(false)}
        onOk={() => uplinkDebugForm.submit()}
      >
        <Form form={uplinkDebugForm} layout="vertical" preserve={false} onFinish={handleUplinkDebug}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="productId" label="Debug Product ID">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="Required for tenant default rules" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="protocol" label="Protocol">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="transport" label="Transport">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="topic" label="Topic / Path">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="payloadEncoding" label="Payload Encoding">
                <Select options={PAYLOAD_ENCODING_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sessionId" label="Session ID">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="remoteAddress" label="Remote Address">
                <Input placeholder="10.0.0.10:9000" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="deviceId" label="Device ID">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="deviceName" label="Device Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="payload" label="Payload" rules={[{ required: true, message: 'Please enter payload' }]}>
            <TextArea rows={6} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="headersText" label="Headers JSON">
            <TextArea rows={6} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>

        {debugResult ? (
          <Card size="small" style={{ marginTop: 16, borderRadius: 12 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Alert
                type={debugResult.success ? 'success' : 'error'}
                showIcon
                message={debugResult.success ? 'Uplink debug succeeded' : 'Uplink debug failed'}
                description={
                  debugResult.success
                    ? `matched version v${debugResult.matchedVersion || '-'}, cost ${debugResult.costMs || 0} ms`
                    : debugResult.errorMessage || 'Unknown error'
                }
              />

              {debugResult.identity ? (
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="Identity Mode">{debugResult.identity.mode || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Device ID">{debugResult.identity.deviceId || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Product Key">{debugResult.identity.productKey || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Device Name">{debugResult.identity.deviceName || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Locator Type">{debugResult.identity.locatorType || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Locator Value">{debugResult.identity.locatorValue || '-'}</Descriptions.Item>
                </Descriptions>
              ) : null}

              <div>
                <Text strong>Output Messages ({debugResult.messages?.length || 0})</Text>
                {debugResult.messages && debugResult.messages.length > 0 ? (
                  <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 12 }}>
                    {debugResult.messages.map((item, index) => (
                      <Card key={`${item.messageId || 'msg'}-${index}`} size="small">
                        <Descriptions bordered size="small" column={2}>
                          <Descriptions.Item label="Message ID">{item.messageId || '-'}</Descriptions.Item>
                          <Descriptions.Item label="Type">{item.type || '-'}</Descriptions.Item>
                          <Descriptions.Item label="Topic" span={2}>
                            {item.topic || '-'}
                          </Descriptions.Item>
                          <Descriptions.Item label="Device Name">{item.deviceName || '-'}</Descriptions.Item>
                          <Descriptions.Item label="Timestamp">{item.timestamp || '-'}</Descriptions.Item>
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
                  <Empty description="No messages returned" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </div>
            </Space>
          </Card>
        ) : null}
      </Modal>

      <Modal
        title={`Downlink Encode Test${debugRecord ? ` · #${debugRecord.id}` : ''}`}
        open={downlinkDebugOpen}
        width={920}
        destroyOnHidden
        confirmLoading={debugSubmitting}
        onCancel={() => setDownlinkDebugOpen(false)}
        onOk={() => downlinkDebugForm.submit()}
      >
        <Form form={downlinkDebugForm} layout="vertical" preserve={false} onFinish={handleDownlinkDebug}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="productId" label="Debug Product ID">
                <InputNumber min={1} style={{ width: '100%' }} placeholder="Required for tenant default rules" />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="topic" label="Topic">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="messageType" label="Message Type" rules={[{ required: true, message: 'Please enter message type' }]}>
                <Input placeholder="PROPERTY_SET / SERVICE_INVOKE" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="deviceId" label="Device ID">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="deviceName" label="Device Name">
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="sessionId" label="Session ID">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="remoteAddress" label="Remote Address">
                <Input placeholder="10.0.0.10:9000" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="headersText" label="Headers JSON">
                <TextArea rows={4} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="payloadText"
            label="Payload JSON"
            rules={[{ required: true, message: 'Please enter payload JSON' }]}
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
                message={encodeResult.success ? 'Encode test succeeded' : 'Encode test failed'}
                description={
                  encodeResult.success
                    ? `matched version v${encodeResult.matchedVersion || '-'}, cost ${encodeResult.costMs || 0} ms`
                    : encodeResult.errorMessage || 'Unknown error'
                }
              />
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="Topic">{encodeResult.topic || '-'}</Descriptions.Item>
                <Descriptions.Item label="Encoding">{encodeResult.payloadEncoding || '-'}</Descriptions.Item>
              </Descriptions>
              {encodeResult.payloadText ? (
                <div>
                  <Text strong>Payload Text</Text>
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
                  <Text strong>Payload Hex</Text>
                  <Paragraph copyable={{ text: encodeResult.payloadHex }}>{encodeResult.payloadHex}</Paragraph>
                </div>
              ) : null}
              {encodeResult.headers ? (
                <div>
                  <Text strong>Headers</Text>
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
      </Modal>

      <Modal
        title={`Version History${versionRecord ? ` · #${versionRecord.id}` : ''}`}
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
          locale={{ emptyText: <Empty description="No version history" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      </Modal>

      <Modal
        title={`Publish Parser${publishRecord ? ` · #${publishRecord.id}` : ''}`}
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
            message="Publishing refreshes connector runtime caches and makes the current draft available for live traffic."
          />
          <Form.Item name="changeLog" label="Change Log">
            <TextArea rows={5} maxLength={500} showCount placeholder="Describe what changed in this release" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Rollback Parser${rollbackRecord ? ` · #${rollbackRecord.id}` : ''}`}
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
            message="Rollback restores a historical snapshot and creates a new working draft version."
            description={
              rollbackRecord?.publishedVersion ? `Current published version: v${rollbackRecord.publishedVersion}` : 'No published version yet'
            }
          />
          <Form.Item name="version" label="Target Version" rules={[{ required: true, message: 'Please choose a version' }]}>
            <Select loading={versionLoading} placeholder="Choose a historical version" options={rollbackVersionOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProtocolParserPage;
