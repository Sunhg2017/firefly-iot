import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Modal,
  Row,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ClearOutlined,
  CodeOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import CopyText from '../../components/CopyText';
import JsonEditorField from '../../components/JsonEditorField';
import PageHeader from '../../components/PageHeader';
import { DeviceSelect } from '../../components/EntitySelect';
import { deviceApi, deviceMessageApi, productApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';

const { Paragraph, Text, Title } = Typography;

interface DeviceRecord {
  id: number;
  productId: number;
  deviceName: string;
  nickname?: string;
  onlineStatus?: string;
  status?: string;
}

interface DeviceOption {
  value: number;
  label: string;
  meta: DeviceRecord;
}

interface ProductRecord {
  id: number;
  name: string;
  productKey: string;
  status?: string;
}

interface ThingModelDataType extends Record<string, unknown> {
  type?: unknown;
  specs?: unknown;
}

interface ThingModelParameterItem {
  identifier?: unknown;
  name?: unknown;
  description?: unknown;
  required?: unknown;
  dataType?: ThingModelDataType;
}

interface ThingModelPropertyItem {
  identifier?: unknown;
  name?: unknown;
  description?: unknown;
  accessMode?: unknown;
  readonly?: unknown;
  dataType?: ThingModelDataType;
}

interface ThingModelServiceItem {
  identifier?: unknown;
  name?: unknown;
  description?: unknown;
  inputData?: ThingModelParameterItem[];
  outputData?: ThingModelParameterItem[];
}

interface ThingModelRoot {
  properties?: ThingModelPropertyItem[];
  services?: ThingModelServiceItem[];
}

interface ThingModelParameter {
  identifier: string;
  name: string;
  description?: string;
  required?: boolean;
  dataType?: Record<string, unknown>;
}

interface PropertyOption {
  value: string;
  label: string;
  description?: string;
  accessMode?: string;
  dataType?: Record<string, unknown>;
}

interface ServiceOption {
  value: string;
  label: string;
  description?: string;
  inputData: ThingModelParameter[];
  outputData: ThingModelParameter[];
}

interface ThingModelSummary {
  properties: PropertyOption[];
  services: ServiceOption[];
}

interface SendFeedback {
  status: 'success' | 'error';
  mode: string;
  title: string;
  detail: string;
  deviceId: number;
  deviceName: string;
  sentAt: string;
  payload?: string;
}

/** 按设备维度保存的编辑草稿，切换设备后恢复，避免把 A 设备的载荷发给 B 设备。 */
interface DeviceMessageDraft {
  propertyKeys?: string[];
  propertyText?: string;
  serviceName?: string;
  serviceText?: string;
  rawType?: string;
  rawText?: string;
}

interface BaseTabProps {
  selectedDevice: DeviceOption | null;
  thingModelLoading: boolean;
  onFeedback: (feedback: SendFeedback) => void;
  initialDraft?: DeviceMessageDraft;
  onDraftChange: (patch: Partial<DeviceMessageDraft>) => void;
  getActiveDeviceId: () => number | undefined;
}

interface PropertySetTabProps extends BaseTabProps {
  propertyOptions: PropertyOption[];
}

interface ServiceInvokeTabProps extends BaseTabProps {
  serviceOptions: ServiceOption[];
}

const EMPTY_JSON_TEXT = JSON.stringify({}, null, 2);

const RAW_MESSAGE_TYPE_OPTIONS = [
  { value: 'PROPERTY_SET', label: 'PROPERTY_SET' },
  { value: 'SERVICE_INVOKE', label: 'SERVICE_INVOKE' },
  { value: 'CONFIG_PUSH', label: 'CONFIG_PUSH' },
  { value: 'OTA_UPGRADE', label: 'OTA_UPGRADE' },
  { value: 'CUSTOM', label: 'CUSTOM' },
] as const;

const RAW_MESSAGE_TEMPLATES: Record<string, Record<string, unknown>> = {
  PROPERTY_SET: { properties: { temperature: 26, switch: true } },
  SERVICE_INVOKE: { service: 'serviceIdentifier', params: { timeout: 30 } },
  CONFIG_PUSH: { version: 'v1', config: { sampleRate: 60 } },
  OTA_UPGRADE: { taskId: 'ota-task-001', targetVersion: '1.0.1' },
  CUSTOM: { topic: '/custom/downstream', payload: { key: 'value' } },
};

const RAW_MESSAGE_HINTS: Record<string, string> = {
  PROPERTY_SET: '适合协议层需要自定义封装属性下发载荷的场景。',
  SERVICE_INVOKE: '适合协议侧自行识别服务标识和参数的高级场景。',
  CONFIG_PUSH: '适合向设备同步配置版本或策略集合。',
  OTA_UPGRADE: '适合协议适配层处理 OTA 升级任务通知。',
  CUSTOM: '保留给私有协议或脚本引擎消费的自定义下行消息。',
};

const onlineStatusTextMap: Record<string, string> = { ONLINE: '在线', OFFLINE: '离线', UNKNOWN: '未知' };
const onlineStatusColorMap: Record<string, string> = { ONLINE: 'success', OFFLINE: 'default', UNKNOWN: 'warning' };
const deviceStatusTextMap: Record<string, string> = { ACTIVE: '已激活', INACTIVE: '未激活', DISABLED: '已禁用' };
const deviceStatusColorMap: Record<string, string> = { ACTIVE: 'success', INACTIVE: 'default', DISABLED: 'error' };

const surfaceCardStyle = {
  borderRadius: 20,
  border: '1px solid rgba(148,163,184,0.18)',
  boxShadow: '0 18px 40px rgba(15,23,42,0.06)',
} as const;

const summaryCardStyle = {
  ...surfaceCardStyle,
  background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
} as const;

const editorCardStyle = { ...surfaceCardStyle, width: '100%' } as const;
const stretchColStyle = { display: 'flex' } as const;
const editorCardBodyStyle = { padding: 18, display: 'flex', flexDirection: 'column', gap: 16 } as const;
const helperCardBodyStyle = { padding: 18 } as const;

const formatSelectedDeviceLabel = (device: DeviceRecord) => {
  const display = device.nickname?.trim();
  const value = device.deviceName?.trim();
  if (!display || !value || display === value) {
    return value || display || '';
  }
  return `${display}（${value}）`;
};

const deduplicateByValue = <T extends { value: string }>(items: T[]) => {
  const mapped = new Map<string, T>();
  items.forEach((item) => {
    if (!mapped.has(item.value)) {
      mapped.set(item.value, item);
    }
  });
  return Array.from(mapped.values());
};

const normalizeParameter = (raw: unknown): ThingModelParameter | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const item = raw as ThingModelParameterItem;
  const identifier = typeof item.identifier === 'string' ? item.identifier.trim() : '';
  if (!identifier) {
    return null;
  }
  return {
    identifier,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : identifier,
    description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined,
    required: Boolean(item.required),
    dataType: item.dataType && typeof item.dataType === 'object' ? item.dataType : undefined,
  };
};

const buildDefaultValueFromDataType = (dataType?: Record<string, unknown>) => {
  const type = typeof dataType?.type === 'string' ? dataType.type : 'string';
  const specs = Array.isArray((dataType as { specs?: unknown } | undefined)?.specs)
    ? ((dataType as { specs?: unknown[] }).specs ?? [])
    : [];

  if (type === 'int' || type === 'float' || type === 'double') return 0;
  if (type === 'bool') return false;
  if (type === 'date') return new Date().toISOString();
  if (type === 'array') return [];
  if (type === 'struct') {
    return specs.reduce<Record<string, unknown>>((current, item) => {
      const parameter = normalizeParameter(item);
      if (parameter) current[parameter.identifier] = buildDefaultValueFromDataType(parameter.dataType);
      return current;
    }, {});
  }
  if (type === 'enum') {
    const firstSpec = specs[0];
    if (firstSpec && typeof firstSpec === 'object' && !Array.isArray(firstSpec) && 'value' in firstSpec) {
      return (firstSpec as { value?: unknown }).value ?? '';
    }
  }
  return '';
};

const buildTemplateText = (entries: Array<{ identifier: string; dataType?: Record<string, unknown> }>) =>
  JSON.stringify(
    entries.reduce<Record<string, unknown>>((current, item) => {
      current[item.identifier] = buildDefaultValueFromDataType(item.dataType);
      return current;
    }, {}),
    null,
    2,
  );

const parseJsonObject = (value: string, fieldName: string) => {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName}必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
};

const buildRawMessageTemplate = (type: string) => JSON.stringify(RAW_MESSAGE_TEMPLATES[type] || RAW_MESSAGE_TEMPLATES.CUSTOM, null, 2);

const formatDeviceLabelForConfirm = (device: DeviceRecord) => {
  const display = device.nickname?.trim();
  return display && display !== device.deviceName ? `${display}（${device.deviceName}）` : device.deviceName;
};

/** 发送前必须让用户再次确认目标设备，降低把 A 设备载荷误发到 B 设备的概率。 */
const confirmSendTarget = (device: DeviceOption, action: string) => new Promise<boolean>((resolve) => {
  let settled = false;
  const settle = (value: boolean) => {
    if (!settled) {
      settled = true;
      resolve(value);
    }
  };
  Modal.confirm({
    title: `确认向该设备发送${action}？`,
    content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span>目标设备：<strong>{formatDeviceLabelForConfirm(device.meta)}</strong></span>
        <span style={{ color: '#cf1322' }}>命令只会发送到该设备，请确认不是误选其他设备。</span>
      </div>
    ),
    okText: '确认发送',
    cancelText: '取消',
    onOk: () => settle(true),
    onCancel: () => settle(false),
    afterClose: () => settle(false),
  });
});

const parseThingModelDefinition = (rawThingModel: unknown): ThingModelSummary => {
  let parsed: ThingModelRoot | null = null;

  if (typeof rawThingModel === 'string') {
    if (!rawThingModel.trim()) return { properties: [], services: [] };
    try {
      parsed = JSON.parse(rawThingModel) as ThingModelRoot;
    } catch {
      // 物模型内容非法时按“无可用物模型”处理，页面会提示加载失败并允许刷新重试。
      return { properties: [], services: [] };
    }
  } else if (rawThingModel && typeof rawThingModel === 'object' && !Array.isArray(rawThingModel)) {
    parsed = rawThingModel as ThingModelRoot;
  }

  if (!parsed) return { properties: [], services: [] };

  const propertyCandidates = (Array.isArray(parsed.properties) ? parsed.properties : [])
    .map<PropertyOption | null>((item) => {
      const identifier = typeof item.identifier === 'string' ? item.identifier.trim() : '';
      if (!identifier) return null;
      const accessMode = typeof item.accessMode === 'string' ? item.accessMode : undefined;
      if (Boolean(item.readonly) || accessMode === 'r') return null;
      return {
        value: identifier,
        label: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : identifier,
        description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined,
        accessMode,
        dataType: item.dataType && typeof item.dataType === 'object' ? item.dataType : undefined,
      };
    })
    .filter((item): item is PropertyOption => item !== null);

  const properties = deduplicateByValue(propertyCandidates);

  const serviceCandidates = (Array.isArray(parsed.services) ? parsed.services : [])
    .map<ServiceOption | null>((item) => {
      const identifier = typeof item.identifier === 'string' ? item.identifier.trim() : '';
      if (!identifier) return null;
      return {
        value: identifier,
        label: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : identifier,
        description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined,
        inputData: (Array.isArray(item.inputData) ? item.inputData : [])
          .map(normalizeParameter)
          .filter((parameter): parameter is ThingModelParameter => parameter !== null),
        outputData: (Array.isArray(item.outputData) ? item.outputData : [])
          .map(normalizeParameter)
          .filter((parameter): parameter is ThingModelParameter => parameter !== null),
      };
    })
    .filter((item): item is ServiceOption => item !== null);

  const services = deduplicateByValue(serviceCandidates);

  return { properties, services };
};

const PropertySetTab: React.FC<PropertySetTabProps> = ({
  selectedDevice,
  propertyOptions,
  thingModelLoading,
  onFeedback,
  initialDraft,
  onDraftChange,
  getActiveDeviceId,
}) => {
  const [selectedPropertyKeys, setSelectedPropertyKeys] = useState<string[]>(initialDraft?.propertyKeys ?? []);
  const [editorText, setEditorText] = useState(initialDraft?.propertyText ?? EMPTY_JSON_TEXT);
  const [sending, setSending] = useState(false);

  const selectedProperties = useMemo(
    () => propertyOptions.filter((item) => selectedPropertyKeys.includes(item.value)),
    [propertyOptions, selectedPropertyKeys],
  );

  useEffect(() => {
    setSelectedPropertyKeys((current) =>
      current.filter((item) => propertyOptions.some((property) => property.value === item)),
    );
  }, [propertyOptions]);

  const updateEditorText = (next: string) => {
    setEditorText(next);
    onDraftChange({ propertyText: next });
  };

  const updateSelectedPropertyKeys = (keys: string[]) => {
    setSelectedPropertyKeys(keys);
    onDraftChange({ propertyKeys: keys });
  };

  const applyTemplate = (targets: PropertyOption[]) => {
    if (!targets.length) {
      message.warning('当前产品暂无可写属性模板');
      return;
    }
    updateEditorText(buildTemplateText(targets.map((item) => ({ identifier: item.value, dataType: item.dataType }))));
  };

  const handleSend = async () => {
    if (!selectedDevice) {
      message.warning('请先选择设备');
      return;
    }
    const device = selectedDevice;
    const confirmed = await confirmSendTarget(device, '属性设置');
    if (!confirmed) {
      return;
    }
    if (getActiveDeviceId() !== device.value) {
      message.warning('目标设备已切换，本次发送已取消，请重新确认目标设备');
      return;
    }

    setSending(true);
    try {
      const payload = parseJsonObject(editorText, '属性 JSON');
      await deviceMessageApi.setProperty(device.value, payload);
      const propertyCount = Object.keys(payload).length;
      message.success(`属性设置命令已发送到 ${device.meta.deviceName}`);
      onFeedback({
        status: 'success',
        mode: '属性设置',
        title: '属性设置命令已发送',
        detail: `设备 ${formatDeviceLabelForConfirm(device.meta)} 已收到 ${propertyCount} 个属性字段的下发请求。`,
        deviceId: device.value,
        deviceName: formatDeviceLabelForConfirm(device.meta),
        sentAt: new Date().toISOString(),
        payload: JSON.stringify(payload, null, 2),
      });
    } catch (error) {
      const detail = error instanceof SyntaxError
        ? '属性 JSON 格式错误，请先修正后再发送。'
        : getErrorMessage(error, '属性设置发送失败，请稍后重试。');
      message.error(detail);
      onFeedback({
        status: 'error',
        mode: '属性设置',
        title: '属性设置发送失败',
        detail,
        deviceId: device.value,
        deviceName: formatDeviceLabelForConfirm(device.meta),
        sentAt: new Date().toISOString(),
        payload: editorText,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={16} style={stretchColStyle}>
        <Card
          title="属性设置工作区"
          style={editorCardStyle}
          bodyStyle={editorCardBodyStyle}
          extra={
            <Space wrap>
              <Button icon={<ClearOutlined />} onClick={() => updateEditorText(EMPTY_JSON_TEXT)}>清空</Button>
            </Space>
          }
        >
          <JsonEditorField
            height={340}
            path={`file:///device-message/${selectedDevice?.value || 'draft'}/property-set.json`}
            value={editorText}
            onChange={updateEditorText}
            hint="仅支持 JSON 对象，键为属性标识"
          />
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button type="primary" icon={<SettingOutlined />} loading={sending} disabled={!selectedDevice} onClick={() => void handleSend()}>
              发送属性设置
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="快捷模板" style={surfaceCardStyle} bodyStyle={helperCardBodyStyle}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Select
                mode="multiple"
                allowClear
                placeholder={selectedDevice ? '先选想要下发的属性字段' : '选择设备后可按属性生成模板'}
                disabled={!selectedDevice || !propertyOptions.length}
                value={selectedPropertyKeys}
                onChange={updateSelectedPropertyKeys}
                optionFilterProp="label"
                options={propertyOptions.map((item) => ({ value: item.value, label: item.label }))}
              />
              <Space wrap>
                <Button disabled={!selectedProperties.length} onClick={() => applyTemplate(selectedProperties)}>填充已选属性</Button>
                <Button disabled={!propertyOptions.length} onClick={() => applyTemplate(propertyOptions)}>填充全部可写属性</Button>
              </Space>
            </Space>
          </Card>
          <Card title={`可写属性 (${propertyOptions.length})`} style={surfaceCardStyle} bodyStyle={helperCardBodyStyle}>
            {thingModelLoading ? (
              <Alert type="info" showIcon message="正在加载物模型" />
            ) : propertyOptions.length ? (
              <Space wrap size={[8, 8]}>
                {propertyOptions.map((item) => (
                  <Tag key={item.value} color="blue" style={{ marginInlineEnd: 0 }}>{item.label}</Tag>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedDevice ? '当前产品暂无可写属性' : '选择设备后查看可写属性'} />
            )}
          </Card>
        </Space>
      </Col>
    </Row>
  );
};

const ServiceInvokeTab: React.FC<ServiceInvokeTabProps> = ({
  selectedDevice,
  serviceOptions,
  thingModelLoading,
  onFeedback,
  initialDraft,
  onDraftChange,
  getActiveDeviceId,
}) => {
  const [selectedServiceName, setSelectedServiceName] = useState<string | undefined>(initialDraft?.serviceName);
  const [paramsText, setParamsText] = useState(initialDraft?.serviceText ?? EMPTY_JSON_TEXT);
  const [sending, setSending] = useState(false);
  const autoTemplateRef = useRef(EMPTY_JSON_TEXT);
  const paramsTextRef = useRef(paramsText);

  useEffect(() => {
    paramsTextRef.current = paramsText;
  }, [paramsText]);

  const selectedService = useMemo(
    () => serviceOptions.find((item) => item.value === selectedServiceName) ?? null,
    [selectedServiceName, serviceOptions],
  );

  useEffect(() => {
    setSelectedServiceName((current) => {
      if (!serviceOptions.length) {
        return undefined;
      }
      return serviceOptions.some((item) => item.value === current) ? current : serviceOptions[0].value;
    });
  }, [serviceOptions]);

  useEffect(() => {
    // 保留用户草稿：仅当编辑器仍是上一份自动模板时才替换为新服务的入参模板。
    const nextTemplate = selectedService
      ? buildTemplateText(selectedService.inputData.map((item) => ({ identifier: item.identifier, dataType: item.dataType })))
      : EMPTY_JSON_TEXT;
    const current = paramsTextRef.current;
    const shouldReplace = !current.trim() || current === EMPTY_JSON_TEXT || current === autoTemplateRef.current;
    autoTemplateRef.current = nextTemplate;
    if (shouldReplace) {
      setParamsText(nextTemplate);
      onDraftChange({ serviceText: nextTemplate });
    }
  }, [onDraftChange, selectedService]);

  const updateParamsText = (next: string) => {
    setParamsText(next);
    onDraftChange({ serviceText: next });
  };

  const handleFillTemplate = () => {
    if (!selectedService) {
      message.warning('请先选择服务');
      return;
    }
    const nextTemplate = buildTemplateText(selectedService.inputData.map((item) => ({ identifier: item.identifier, dataType: item.dataType })));
    autoTemplateRef.current = nextTemplate;
    updateParamsText(nextTemplate);
  };

  const handleSend = async () => {
    if (!selectedDevice) {
      message.warning('请先选择设备');
      return;
    }
    if (!selectedService) {
      message.warning('请先选择服务');
      return;
    }
    const device = selectedDevice;
    const confirmed = await confirmSendTarget(device, '服务调用');
    if (!confirmed) {
      return;
    }
    if (getActiveDeviceId() !== device.value) {
      message.warning('目标设备已切换，本次发送已取消，请重新确认目标设备');
      return;
    }

    setSending(true);
    try {
      const payload = parseJsonObject(paramsText, '服务参数 JSON');
      await deviceMessageApi.invokeService(device.value, selectedService.value, payload);
      message.success(`服务调用命令已发送到 ${device.meta.deviceName}`);
      onFeedback({
        status: 'success',
        mode: '服务调用',
        title: '服务调用命令已发送',
        detail: `已向设备 ${formatDeviceLabelForConfirm(device.meta)} 下发服务 ${selectedService.label}（${selectedService.value}）。`,
        deviceId: device.value,
        deviceName: formatDeviceLabelForConfirm(device.meta),
        sentAt: new Date().toISOString(),
        payload: JSON.stringify(payload, null, 2),
      });
    } catch (error) {
      const detail = error instanceof SyntaxError
        ? '服务参数 JSON 格式错误，请先修正后再发送。'
        : getErrorMessage(error, '服务调用发送失败，请稍后重试。');
      message.error(detail);
      onFeedback({
        status: 'error',
        mode: '服务调用',
        title: '服务调用发送失败',
        detail,
        deviceId: device.value,
        deviceName: formatDeviceLabelForConfirm(device.meta),
        sentAt: new Date().toISOString(),
        payload: paramsText,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={16} style={stretchColStyle}>
        <Card
          title="服务调用工作区"
          style={editorCardStyle}
          bodyStyle={editorCardBodyStyle}
          extra={
            <Space wrap>
              <Button icon={<ClearOutlined />} onClick={() => updateParamsText(EMPTY_JSON_TEXT)}>清空</Button>
            </Space>
          }
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={selectedDevice ? '请选择服务' : '请先选择设备'}
            disabled={!selectedDevice || !serviceOptions.length}
            loading={thingModelLoading}
            value={selectedServiceName}
            onChange={(name) => {
              setSelectedServiceName(name);
              onDraftChange({ serviceName: name });
            }}
            options={serviceOptions.map((item) => ({ value: item.value, label: item.label }))}
          />
          <JsonEditorField
            height={340}
            path={`file:///device-message/${selectedDevice?.value || 'draft'}/service-invoke.json`}
            value={paramsText}
            onChange={updateParamsText}
            hint="仅支持 JSON 对象，作为服务入参"
          />
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={sending} disabled={!selectedDevice || !selectedService} onClick={() => void handleSend()}>
              发送服务调用
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="服务信息" style={surfaceCardStyle} bodyStyle={helperCardBodyStyle}>
            {thingModelLoading ? (
              <Alert type="info" showIcon message="正在加载物模型" />
            ) : selectedService ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="服务标识">{selectedService.value}</Descriptions.Item>
                  <Descriptions.Item label="服务名称">{selectedService.label}</Descriptions.Item>
                  <Descriptions.Item label="入参数量">{selectedService.inputData.length}</Descriptions.Item>
                  <Descriptions.Item label="出参数量">{selectedService.outputData.length}</Descriptions.Item>
                </Descriptions>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>{selectedService.description || '当前服务未补充描述。'}</Paragraph>
                <Space wrap>
                  <Button onClick={handleFillTemplate}>带入入参模板</Button>
                </Space>
                {selectedService.inputData.length ? (
                  <Space wrap size={[8, 8]}>
                    {selectedService.inputData.map((item) => (
                      <Tag key={item.identifier} color={item.required ? 'gold' : 'blue'} style={{ marginInlineEnd: 0 }}>{item.name}</Tag>
                    ))}
                  </Space>
                ) : (
                  <Alert type="info" showIcon message="当前服务没有定义输入参数" />
                )}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedDevice ? '当前产品暂无可调用服务' : '选择设备后查看服务信息'} />
            )}
          </Card>
        </Space>
      </Col>
    </Row>
  );
};

const RawMessageTab: React.FC<BaseTabProps> = ({
  selectedDevice,
  onFeedback,
  initialDraft,
  onDraftChange,
  getActiveDeviceId,
}) => {
  const initialMessageType = initialDraft?.rawType ?? 'SERVICE_INVOKE';
  const [messageType, setMessageType] = useState(initialMessageType);
  const [payloadText, setPayloadText] = useState(initialDraft?.rawText ?? buildRawMessageTemplate(initialMessageType));
  const [sending, setSending] = useState(false);
  const autoTemplateRef = useRef(buildRawMessageTemplate(initialMessageType));

  const updatePayloadText = (next: string) => {
    setPayloadText(next);
    onDraftChange({ rawText: next });
  };

  const applyTemplateByType = (nextType: string, force = false) => {
    const nextTemplate = buildRawMessageTemplate(nextType);
    const shouldReplace = force || !payloadText.trim() || payloadText === EMPTY_JSON_TEXT || payloadText === autoTemplateRef.current;
    autoTemplateRef.current = nextTemplate;
    if (shouldReplace) {
      updatePayloadText(nextTemplate);
    }
  };

  const handleTypeChange = (nextType: string) => {
    setMessageType(nextType);
    onDraftChange({ rawType: nextType });
    applyTemplateByType(nextType);
  };

  const handleSend = async () => {
    if (!selectedDevice) {
      message.warning('请先选择设备');
      return;
    }
    const device = selectedDevice;
    const confirmed = await confirmSendTarget(device, '原始下行消息');
    if (!confirmed) {
      return;
    }
    if (getActiveDeviceId() !== device.value) {
      message.warning('目标设备已切换，本次发送已取消，请重新确认目标设备');
      return;
    }

    setSending(true);
    try {
      const payload = parseJsonObject(payloadText, '原始消息 Payload JSON');
      await deviceMessageApi.publishDownstream({
        deviceId: device.value,
        type: messageType,
        payload,
      });
      message.success(`原始下行消息已发送到 ${device.meta.deviceName}`);
      onFeedback({
        status: 'success',
        mode: '原始消息',
        title: '原始下行消息已发送',
        detail: `已向设备 ${formatDeviceLabelForConfirm(device.meta)} 下发 ${messageType} 类型的原始消息。`,
        deviceId: device.value,
        deviceName: formatDeviceLabelForConfirm(device.meta),
        sentAt: new Date().toISOString(),
        payload: JSON.stringify(payload, null, 2),
      });
    } catch (error) {
      const detail = error instanceof SyntaxError
        ? '原始消息 Payload JSON 格式错误，请先修正后再发送。'
        : getErrorMessage(error, '原始消息发送失败，请稍后重试。');
      message.error(detail);
      onFeedback({
        status: 'error',
        mode: '原始消息',
        title: '原始消息发送失败',
        detail,
        deviceId: device.value,
        deviceName: formatDeviceLabelForConfirm(device.meta),
        sentAt: new Date().toISOString(),
        payload: payloadText,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={16} style={stretchColStyle}>
        <Card
          title="原始下行消息工作区"
          style={editorCardStyle}
          bodyStyle={editorCardBodyStyle}
          extra={
            <Space wrap>
              <Button icon={<ClearOutlined />} onClick={() => updatePayloadText(EMPTY_JSON_TEXT)}>清空</Button>
            </Space>
          }
        >
          <Select
            value={messageType}
            onChange={handleTypeChange}
            options={RAW_MESSAGE_TYPE_OPTIONS.map((item) => ({ value: item.value, label: item.value }))}
          />
          <JsonEditorField
            height={340}
            path={`file:///device-message/${selectedDevice?.value || 'draft'}/raw-message.json`}
            value={payloadText}
            onChange={updatePayloadText}
            hint="仅支持 JSON 对象，作为原始下行 Payload"
          />
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!selectedDevice} onClick={() => void handleSend()}>
              发送原始消息
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="当前类型" style={surfaceCardStyle} bodyStyle={helperCardBodyStyle}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="当前类型">{messageType}</Descriptions.Item>
              </Descriptions>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>{RAW_MESSAGE_HINTS[messageType] || RAW_MESSAGE_HINTS.CUSTOM}</Paragraph>
              <Space wrap>
                <Button onClick={() => applyTemplateByType(messageType, true)}>重新载入示例</Button>
              </Space>
            </Space>
          </Card>
        </Space>
      </Col>
    </Row>
  );
};

const DeviceMessagePage: React.FC = () => {
  const [selectedDevice, setSelectedDevice] = useState<DeviceOption | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [thingModelLoading, setThingModelLoading] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number>();
  const [thingModelSummary, setThingModelSummary] = useState<ThingModelSummary>({ properties: [], services: [] });
  const [feedback, setFeedback] = useState<SendFeedback | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [thingModelError, setThingModelError] = useState<string | null>(null);
  const thingModelCacheRef = useRef<Map<number, ThingModelSummary>>(new Map());
  const draftsRef = useRef<Map<number, DeviceMessageDraft>>(new Map());
  const activeDeviceIdRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    activeDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  const handleDraftChange = useCallback((patch: Partial<DeviceMessageDraft>) => {
    const deviceId = activeDeviceIdRef.current;
    if (!deviceId) {
      return;
    }
    const current = draftsRef.current.get(deviceId) ?? {};
    draftsRef.current.set(deviceId, { ...current, ...patch });
  }, []);

  const getActiveDeviceId = useCallback(() => activeDeviceIdRef.current, []);

  const deviceDetailRequestRef = useRef(0);

  const loadDeviceDetail = useCallback(async (deviceId?: number) => {
    const requestId = deviceDetailRequestRef.current + 1;
    deviceDetailRequestRef.current = requestId;
    if (!deviceId) {
      setSelectedDevice(null);
      setSelectedProduct(null);
      setPageError(null);
      setDeviceLoading(false);
      return;
    }
    setDeviceLoading(true);
    setPageError(null);
    try {
      const response = await deviceApi.get(deviceId);
      const record = response.data.data as DeviceRecord | null;
      if (requestId !== deviceDetailRequestRef.current) {
        return;
      }
      if (!record) {
        throw new Error('设备详情为空');
      }
      setSelectedDevice({ value: record.id, label: formatSelectedDeviceLabel(record), meta: record });
      // 设备下拉只返回值，产品名称与物模型依赖 productId，因此选中后补查单个产品详情。
      try {
        const productResponse = await productApi.get(record.productId);
        if (requestId !== deviceDetailRequestRef.current) {
          return;
        }
        const product = productResponse.data.data as ProductRecord | null;
        setSelectedProduct(product?.id ? product : null);
      } catch {
        // 产品名称仅用于展示，补查失败不影响设备消息下发。
        if (requestId === deviceDetailRequestRef.current) {
          setSelectedProduct(null);
        }
      }
    } catch (error) {
      if (requestId === deviceDetailRequestRef.current) {
        setSelectedDevice(null);
        setSelectedProduct(null);
        setPageError(getErrorMessage(error, '加载设备详情失败'));
      }
    } finally {
      if (requestId === deviceDetailRequestRef.current) {
        setDeviceLoading(false);
      }
    }
  }, []);

  const loadThingModelSummary = useCallback(async (productId: number, force = false) => {
    // Cache per product so switching tabs or switching back to the same device doesn't refetch the same thing model.
    if (!force) {
      const cached = thingModelCacheRef.current.get(productId);
      if (cached) {
        setThingModelSummary(cached);
        setThingModelError(null);
        return;
      }
    }

    setThingModelLoading(true);
    setThingModelError(null);
    try {
      const response = await productApi.getThingModel(productId);
      const parsed = parseThingModelDefinition(response.data.data);
      thingModelCacheRef.current.set(productId, parsed);
      setThingModelSummary(parsed);
    } catch (error) {
      setThingModelSummary({ properties: [], services: [] });
      setThingModelError(getErrorMessage(error, '加载产品物模型失败，请稍后重试'));
    } finally {
      setThingModelLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeviceDetail(selectedDeviceId);
  }, [loadDeviceDetail, selectedDeviceId]);

  useEffect(() => {
    if (!selectedDevice?.meta.productId) {
      setThingModelSummary({ properties: [], services: [] });
      setThingModelError(null);
      return;
    }
    void loadThingModelSummary(selectedDevice.meta.productId);
  }, [loadThingModelSummary, selectedDevice]);

  const handleRefreshThingModel = () => {
    if (!selectedDevice?.meta.productId) {
      message.warning('请先选择设备');
      return;
    }
    thingModelCacheRef.current.delete(selectedDevice.meta.productId);
    void loadThingModelSummary(selectedDevice.meta.productId, true);
  };

  const handleDeviceChange = (value?: number) => {
    if (value === selectedDeviceId) {
      return;
    }
    activeDeviceIdRef.current = value;
    setSelectedDeviceId(value);
    setSelectedDevice(null);
    setSelectedProduct(null);
    // 切换设备必须丢弃上一台设备的结果提示，编辑区通过 key 重新挂载并恢复该设备自己的草稿。
    setFeedback(null);
    if (value != null && draftsRef.current.has(value)) {
      message.info('已恢复该设备上次草稿');
    }
  };

  const deviceKey = String(selectedDeviceId ?? 'none');
  const initialDraft = selectedDeviceId != null ? draftsRef.current.get(selectedDeviceId) : undefined;

  return (
    <div>
      <PageHeader
        title="设备消息工作台"
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void loadDeviceDetail(selectedDeviceId)} loading={deviceLoading}>刷新设备</Button>
            <Button icon={<CodeOutlined />} onClick={handleRefreshThingModel} loading={thingModelLoading} disabled={!selectedDevice}>刷新物模型</Button>
          </Space>
        }
      />

      {pageError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载设备详情失败"
          description={pageError}
          action={<Button size="small" danger onClick={() => void loadDeviceDetail(selectedDeviceId)}>重试</Button>}
        />
      ) : null}

      <Card style={summaryCardStyle} bodyStyle={{ padding: 20, background: 'transparent' }}>
        <Row gutter={[20, 20]} align="top">
          <Col xs={24} xl={14}>
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <Title level={5} style={{ margin: 0 }}>目标设备</Title>
              <DeviceSelect
                placeholder="搜索并选择设备（名称或别名）"
                value={selectedDeviceId}
                onChange={handleDeviceChange}
                style={{ width: '100%' }}
              />
              <Space wrap>
                {selectedProduct ? <Tag color="processing" style={{ marginInlineEnd: 0 }}>{selectedProduct.name}（{selectedProduct.productKey}）</Tag> : null}
                {selectedDevice?.meta.onlineStatus ? <Tag color={onlineStatusColorMap[selectedDevice.meta.onlineStatus] || 'default'} style={{ marginInlineEnd: 0 }}>{onlineStatusTextMap[selectedDevice.meta.onlineStatus] || selectedDevice.meta.onlineStatus}</Tag> : null}
                {selectedDevice?.meta.status ? <Tag color={deviceStatusColorMap[selectedDevice.meta.status] || 'default'} style={{ marginInlineEnd: 0 }}>{deviceStatusTextMap[selectedDevice.meta.status] || selectedDevice.meta.status}</Tag> : null}
                {thingModelLoading ? <Tag color="processing" style={{ marginInlineEnd: 0 }}>物模型加载中</Tag> : null}
              </Space>
              {thingModelError ? (
                <Alert
                  type="warning"
                  showIcon
                  message="加载物模型失败，属性与服务模板可能不完整"
                  description={thingModelError}
                  action={<Button size="small" onClick={handleRefreshThingModel}>重试</Button>}
                />
              ) : null}
              {feedback && feedback.deviceId === selectedDeviceId ? (
                <Alert
                  type={feedback.status === 'success' ? 'success' : 'error'}
                  showIcon
                  message={`${feedback.mode}结果：${feedback.title}`}
                  description={(
                    <Space direction="vertical" size={4}>
                      <span>{feedback.detail}</span>
                      <Text type="secondary">目标设备：{feedback.deviceName}</Text>
                      <Text type="secondary">发送时间：{formatDateTime(feedback.sentAt)}</Text>
                      {feedback.payload ? (
                        <Space size={6} wrap>
                          <Text type="secondary">下发载荷：</Text>
                          <CopyText text={feedback.payload} ellipsis />
                        </Space>
                      ) : null}
                    </Space>
                  )}
                />
              ) : null}
            </Space>
          </Col>
          <Col xs={24} xl={10}>
            <Card style={{ ...surfaceCardStyle, height: '100%', background: 'rgba(255,255,255,0.78)' }} bodyStyle={{ padding: 18 }}>
              {selectedDevice ? (
                <Descriptions column={1} size="small" title="当前设备上下文">
                  <Descriptions.Item label="设备标识"><CopyText text={selectedDevice.meta.deviceName} ellipsis /></Descriptions.Item>
                  <Descriptions.Item label="展示名称">{selectedDevice.meta.nickname || '-'}</Descriptions.Item>
                  <Descriptions.Item label="所属产品">{selectedProduct ? `${selectedProduct.name}（${selectedProduct.productKey}）` : '-'}</Descriptions.Item>
                  <Descriptions.Item label="在线状态"><Tag color={onlineStatusColorMap[selectedDevice.meta.onlineStatus || 'UNKNOWN'] || 'default'}>{onlineStatusTextMap[selectedDevice.meta.onlineStatus || 'UNKNOWN'] || selectedDevice.meta.onlineStatus || '未知'}</Tag></Descriptions.Item>
                  <Descriptions.Item label="设备状态"><Tag color={deviceStatusColorMap[selectedDevice.meta.status || 'INACTIVE'] || 'default'}>{deviceStatusTextMap[selectedDevice.meta.status || 'INACTIVE'] || selectedDevice.meta.status || '未知'}</Tag></Descriptions.Item>
                  <Descriptions.Item label="可写属性">{thingModelSummary.properties.length}</Descriptions.Item>
                  <Descriptions.Item label="可调服务">{thingModelSummary.services.length}</Descriptions.Item>
                </Descriptions>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择设备" />
              )}
            </Card>
          </Col>
        </Row>
      </Card>

      <Card style={{ ...surfaceCardStyle, marginTop: 20 }}>
        <Tabs
          destroyInactiveTabPane={false}
          items={[
            {
              key: 'property-set',
              label: <span><SettingOutlined style={{ marginRight: 6 }} />属性设置</span>,
              children: (
                <PropertySetTab
                  key={deviceKey}
                  selectedDevice={selectedDevice}
                  propertyOptions={thingModelSummary.properties}
                  thingModelLoading={thingModelLoading}
                  onFeedback={setFeedback}
                  initialDraft={initialDraft}
                  onDraftChange={handleDraftChange}
                  getActiveDeviceId={getActiveDeviceId}
                />
              ),
            },
            {
              key: 'service-invoke',
              label: <span><ThunderboltOutlined style={{ marginRight: 6 }} />服务调用</span>,
              children: (
                <ServiceInvokeTab
                  key={deviceKey}
                  selectedDevice={selectedDevice}
                  serviceOptions={thingModelSummary.services}
                  thingModelLoading={thingModelLoading}
                  onFeedback={setFeedback}
                  initialDraft={initialDraft}
                  onDraftChange={handleDraftChange}
                  getActiveDeviceId={getActiveDeviceId}
                />
              ),
            },
            {
              key: 'raw-message',
              label: <span><SendOutlined style={{ marginRight: 6 }} />原始消息</span>,
              children: (
                <RawMessageTab
                  key={deviceKey}
                  selectedDevice={selectedDevice}
                  thingModelLoading={thingModelLoading}
                  onFeedback={setFeedback}
                  initialDraft={initialDraft}
                  onDraftChange={handleDraftChange}
                  getActiveDeviceId={getActiveDeviceId}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DeviceMessagePage;
