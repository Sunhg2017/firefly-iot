import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
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
import CodeEditorField from '../../components/CodeEditorField';
import PageHeader from '../../components/PageHeader';
import { deviceApi, deviceMessageApi, productApi } from '../../services/api';

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
  sentAt: string;
}

interface BaseTabProps {
  selectedDevice: DeviceOption | null;
  thingModelLoading: boolean;
  onFeedback: (feedback: SendFeedback) => void;
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

const formatCommandTime = () => new Date().toLocaleString('zh-CN', { hour12: false });

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

const formatJsonText = (value: string) => JSON.stringify(JSON.parse(value), null, 2);

const parseJsonObject = (value: string, fieldName: string) => {
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName}必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
};

const buildRawMessageTemplate = (type: string) => JSON.stringify(RAW_MESSAGE_TEMPLATES[type] || RAW_MESSAGE_TEMPLATES.CUSTOM, null, 2);

const parseThingModelDefinition = (rawThingModel: unknown): ThingModelSummary => {
  let parsed: ThingModelRoot | null = null;

  if (typeof rawThingModel === 'string') {
    if (!rawThingModel.trim()) return { properties: [], services: [] };
    try {
      parsed = JSON.parse(rawThingModel) as ThingModelRoot;
    } catch {
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
}) => {
  const [selectedPropertyKeys, setSelectedPropertyKeys] = useState<string[]>([]);
  const [editorText, setEditorText] = useState(EMPTY_JSON_TEXT);
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

  const applyTemplate = (targets: PropertyOption[]) => {
    if (!targets.length) {
      message.warning('当前产品暂无可写属性模板');
      return;
    }
    setEditorText(buildTemplateText(targets.map((item) => ({ identifier: item.value, dataType: item.dataType }))));
  };

  const handleFormat = () => {
    try {
      setEditorText(formatJsonText(editorText));
      message.success('属性 JSON 已格式化');
    } catch {
      message.warning('属性 JSON 格式不正确');
    }
  };

  const handleSend = async () => {
    if (!selectedDevice) {
      message.warning('请先选择设备');
      return;
    }

    setSending(true);
    try {
      const payload = parseJsonObject(editorText, '属性 JSON');
      await deviceMessageApi.setProperty(selectedDevice.value, payload);
      const propertyCount = Object.keys(payload).length;
      message.success('属性设置命令已发送');
      onFeedback({
        status: 'success',
        mode: '属性设置',
        title: '属性设置命令已发送',
        detail: `设备 ${selectedDevice.meta.deviceName} 已收到 ${propertyCount} 个属性字段的下发请求。`,
        sentAt: formatCommandTime(),
      });
    } catch (error) {
      const detail =
        error instanceof SyntaxError
          ? '属性 JSON 格式错误，请先修正后再发送。'
          : error instanceof Error
            ? error.message
            : '属性设置发送失败，请稍后重试。';
      message.error(detail);
      onFeedback({
        status: 'error',
        mode: '属性设置',
        title: '属性设置发送失败',
        detail,
        sentAt: formatCommandTime(),
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
              <Button icon={<CodeOutlined />} onClick={handleFormat}>格式化 JSON</Button>
              <Button icon={<ClearOutlined />} onClick={() => setEditorText(EMPTY_JSON_TEXT)}>清空</Button>
            </Space>
          }
        >
          <Alert
            type={selectedDevice ? 'info' : 'warning'}
            showIcon
            message={selectedDevice ? '按物模型可写属性组织下发内容' : '请先在页面顶部选择目标设备'}
            description={selectedDevice ? '右侧可以直接从产品物模型生成属性 JSON 骨架，避免手工敲字段名。' : '设备选定后，系统会自动加载该设备所属产品的可写属性模板。'}
          />
          <CodeEditorField
            language="json"
            path={`file:///device-message/${selectedDevice?.value || 'draft'}/property-set.json`}
            value={editorText}
            onChange={setEditorText}
            height={340}
          />
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary">平台会按标准属性设置接口下发，不会修改你当前编辑器里的草稿。</Text>
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
                onChange={setSelectedPropertyKeys}
                optionFilterProp="label"
                options={propertyOptions.map((item) => ({ value: item.value, label: item.label }))}
              />
              <Space wrap>
                <Button disabled={!selectedProperties.length} onClick={() => applyTemplate(selectedProperties)}>填充已选属性</Button>
                <Button disabled={!propertyOptions.length} onClick={() => applyTemplate(propertyOptions)}>填充全部可写属性</Button>
              </Space>
              <Text type="secondary">适合先生成一版模板，再针对个别字段调整值。</Text>
            </Space>
          </Card>
          <Card title={`可写属性 (${propertyOptions.length})`} style={surfaceCardStyle} bodyStyle={helperCardBodyStyle}>
            {thingModelLoading ? (
              <Alert type="info" showIcon message="正在加载物模型" description="加载完成后会自动展示当前产品可写属性。" />
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
}) => {
  const [selectedServiceName, setSelectedServiceName] = useState<string>();
  const [paramsText, setParamsText] = useState(EMPTY_JSON_TEXT);
  const [sending, setSending] = useState(false);
  const autoTemplateRef = useRef(EMPTY_JSON_TEXT);

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
    // Keep the user's draft when possible; only replace the editor when it still contains the previous auto template.
    const nextTemplate = selectedService
      ? buildTemplateText(selectedService.inputData.map((item) => ({ identifier: item.identifier, dataType: item.dataType })))
      : EMPTY_JSON_TEXT;

    setParamsText((current) => {
      if (!current.trim() || current === EMPTY_JSON_TEXT || current === autoTemplateRef.current) {
        autoTemplateRef.current = nextTemplate;
        return nextTemplate;
      }
      autoTemplateRef.current = nextTemplate;
      return current;
    });
  }, [selectedService]);

  const handleFormat = () => {
    try {
      setParamsText(formatJsonText(paramsText));
      message.success('服务参数 JSON 已格式化');
    } catch {
      message.warning('服务参数 JSON 格式不正确');
    }
  };

  const handleFillTemplate = () => {
    if (!selectedService) {
      message.warning('请先选择服务');
      return;
    }
    const nextTemplate = buildTemplateText(selectedService.inputData.map((item) => ({ identifier: item.identifier, dataType: item.dataType })));
    autoTemplateRef.current = nextTemplate;
    setParamsText(nextTemplate);
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

    setSending(true);
    try {
      const payload = parseJsonObject(paramsText, '服务参数 JSON');
      await deviceMessageApi.invokeService(selectedDevice.value, selectedService.value, payload);
      message.success('服务调用命令已发送');
      onFeedback({
        status: 'success',
        mode: '服务调用',
        title: '服务调用命令已发送',
        detail: `已向设备 ${selectedDevice.meta.deviceName} 下发服务 ${selectedService.label}（${selectedService.value}）。`,
        sentAt: formatCommandTime(),
      });
    } catch (error) {
      const detail =
        error instanceof SyntaxError
          ? '服务参数 JSON 格式错误，请先修正后再发送。'
          : error instanceof Error
            ? error.message
            : '服务调用发送失败，请稍后重试。';
      message.error(detail);
      onFeedback({
        status: 'error',
        mode: '服务调用',
        title: '服务调用发送失败',
        detail,
        sentAt: formatCommandTime(),
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
              <Button icon={<CodeOutlined />} onClick={handleFormat}>格式化 JSON</Button>
              <Button icon={<ClearOutlined />} onClick={() => setParamsText(EMPTY_JSON_TEXT)}>清空</Button>
            </Space>
          }
        >
          <Alert
            type={selectedDevice ? 'info' : 'warning'}
            showIcon
            message={selectedDevice ? '选择服务并填写入参' : '请先在页面顶部选择目标设备'}
            description={selectedDevice ? '服务列表会按当前设备所属产品自动加载。' : '选定设备后可直接开始属性、事件和服务调用。'}
          />
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={selectedDevice ? '请选择服务' : '请先选择设备'}
            disabled={!selectedDevice || !serviceOptions.length}
            loading={thingModelLoading}
            value={selectedServiceName}
            onChange={setSelectedServiceName}
            options={serviceOptions.map((item) => ({ value: item.value, label: item.label }))}
          />
          <CodeEditorField
            language="json"
            path={`file:///device-message/${selectedDevice?.value || 'draft'}/service-invoke.json`}
            value={paramsText}
            onChange={setParamsText}
            height={340}
          />
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary">切换服务后会优先使用该服务的入参结构生成模板骨架。</Text>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={sending} disabled={!selectedDevice || !selectedService} onClick={() => void handleSend()}>
              发送服务调用
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="服务说明" style={surfaceCardStyle} bodyStyle={helperCardBodyStyle}>
            {thingModelLoading ? (
              <Alert type="info" showIcon message="正在加载物模型" description="加载完成后会展示服务描述、入参和出参摘要。" />
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
                  <Alert type="info" showIcon message="当前服务没有定义输入参数" description="如果协议层需要参数，也可以在左侧编辑器里手工补充 JSON。" />
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

const RawMessageTab: React.FC<BaseTabProps> = ({ selectedDevice, onFeedback }) => {
  const [messageType, setMessageType] = useState<string>('SERVICE_INVOKE');
  const [payloadText, setPayloadText] = useState(() => buildRawMessageTemplate('SERVICE_INVOKE'));
  const [sending, setSending] = useState(false);
  const autoTemplateRef = useRef(buildRawMessageTemplate('SERVICE_INVOKE'));

  const applyTemplateByType = (nextType: string, force = false) => {
    const nextTemplate = buildRawMessageTemplate(nextType);
    setPayloadText((current) => {
      if (force || !current.trim() || current === EMPTY_JSON_TEXT || current === autoTemplateRef.current) {
        autoTemplateRef.current = nextTemplate;
        return nextTemplate;
      }
      autoTemplateRef.current = nextTemplate;
      return current;
    });
  };

  const handleTypeChange = (nextType: string) => {
    setMessageType(nextType);
    applyTemplateByType(nextType);
  };

  const handleFormat = () => {
    try {
      setPayloadText(formatJsonText(payloadText));
      message.success('原始消息 JSON 已格式化');
    } catch {
      message.warning('原始消息 JSON 格式不正确');
    }
  };

  const handleSend = async () => {
    if (!selectedDevice) {
      message.warning('请先选择设备');
      return;
    }

    setSending(true);
    try {
      const payload = parseJsonObject(payloadText, '原始消息 Payload JSON');
      await deviceMessageApi.publishDownstream({
        deviceId: selectedDevice.value,
        type: messageType,
        payload,
      });
      message.success('原始下行消息已发送');
      onFeedback({
        status: 'success',
        mode: '原始消息',
        title: '原始下行消息已发送',
        detail: `已向设备 ${selectedDevice.meta.deviceName} 下发 ${messageType} 类型的原始消息。`,
        sentAt: formatCommandTime(),
      });
    } catch (error) {
      const detail =
        error instanceof SyntaxError
          ? '原始消息 Payload JSON 格式错误，请先修正后再发送。'
          : error instanceof Error
            ? error.message
            : '原始消息发送失败，请稍后重试。';
      message.error(detail);
      onFeedback({
        status: 'error',
        mode: '原始消息',
        title: '原始消息发送失败',
        detail,
        sentAt: formatCommandTime(),
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
              <Button icon={<CodeOutlined />} onClick={handleFormat}>格式化 JSON</Button>
              <Button icon={<ClearOutlined />} onClick={() => setPayloadText(EMPTY_JSON_TEXT)}>清空</Button>
            </Space>
          }
        >
          <Alert
            type="warning"
            showIcon
            message={selectedDevice ? '原始下行消息适合高级调试场景' : '请先在页面顶部选择目标设备'}
            description={selectedDevice ? '当标准属性设置或服务调用无法覆盖协议细节时，再使用原始消息自行组织载荷。' : '设备选定后再发送，可避免把调试消息下发到错误设备。'}
          />
          <Select
            value={messageType}
            onChange={handleTypeChange}
            options={RAW_MESSAGE_TYPE_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          />
          <CodeEditorField
            language="json"
            path={`file:///device-message/${selectedDevice?.value || 'draft'}/raw-message.json`}
            value={payloadText}
            onChange={setPayloadText}
            height={340}
          />
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text type="secondary">切换消息类型时，系统会尽量帮你带入对应类型的示例 JSON。</Text>
            <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!selectedDevice} onClick={() => void handleSend()}>
              发送原始消息
            </Button>
          </Space>
        </Card>
      </Col>
      <Col xs={24} xl={8}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card title="类型说明" style={surfaceCardStyle} bodyStyle={helperCardBodyStyle}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Descriptions size="small" column={1}>
                <Descriptions.Item label="当前类型">{messageType}</Descriptions.Item>
              </Descriptions>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>{RAW_MESSAGE_HINTS[messageType] || RAW_MESSAGE_HINTS.CUSTOM}</Paragraph>
              <Space wrap>
                <Button onClick={() => applyTemplateByType(messageType, true)}>重新载入示例</Button>
              </Space>
              <Alert type="info" showIcon message="发送前建议先检查载荷字段" description="原始消息不会替你校验业务字段，只会校验 JSON 是否可解析。" />
            </Space>
          </Card>
        </Space>
      </Col>
    </Row>
  );
};

const DeviceMessagePage: React.FC = () => {
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [thingModelLoading, setThingModelLoading] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number>();
  const [thingModelSummary, setThingModelSummary] = useState<ThingModelSummary>({ properties: [], services: [] });
  const [feedback, setFeedback] = useState<SendFeedback | null>(null);
  const thingModelCacheRef = useRef<Map<number, ThingModelSummary>>(new Map());

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);

  const selectedDevice = useMemo(
    () => deviceOptions.find((item) => item.value === selectedDeviceId) ?? null,
    [deviceOptions, selectedDeviceId],
  );

  const selectedProduct = useMemo(
    () => (selectedDevice ? productMap.get(selectedDevice.meta.productId) ?? null : null),
    [productMap, selectedDevice],
  );

  const fetchPageContext = useCallback(async () => {
    setDeviceLoading(true);
    try {
      const [deviceResponse, productResponse] = await Promise.all([
        deviceApi.list({ pageNum: 1, pageSize: 500 }),
        productApi.list({ pageNum: 1, pageSize: 500 }),
      ]);

      const deviceRecords = (deviceResponse.data.data?.records || []) as DeviceRecord[];
      const productRecords = (productResponse.data.data?.records || []) as ProductRecord[];

      setDeviceOptions(deviceRecords.map((item) => ({ value: item.id, label: formatSelectedDeviceLabel(item), meta: item })));
      setProducts(productRecords);
      setSelectedDeviceId((current) => (current && deviceRecords.some((item) => item.id === current) ? current : undefined));
    } catch {
      message.error('加载设备消息页基础数据失败');
    } finally {
      setDeviceLoading(false);
    }
  }, []);

  const loadThingModelSummary = useCallback(async (productId: number, force = false) => {
    // Cache per product so switching tabs or switching back to the same device doesn't refetch the same thing model.
    if (!force) {
      const cached = thingModelCacheRef.current.get(productId);
      if (cached) {
        setThingModelSummary(cached);
        return;
      }
    }

    setThingModelLoading(true);
    try {
      const response = await productApi.getThingModel(productId);
      const parsed = parseThingModelDefinition(response.data.data);
      thingModelCacheRef.current.set(productId, parsed);
      setThingModelSummary(parsed);
    } catch {
      setThingModelSummary({ properties: [], services: [] });
      message.warning('加载产品物模型失败，请稍后重试');
    } finally {
      setThingModelLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPageContext();
  }, [fetchPageContext]);

  useEffect(() => {
    if (!selectedDevice?.meta.productId) {
      setThingModelSummary({ properties: [], services: [] });
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

  return (
    <div>
      <PageHeader
        title="设备消息工作台"
        description="面向单设备统一下发属性设置、服务调用和原始消息。先锁定目标设备，再按场景组织消息内容，减少重复选择和手工拼 JSON。"
        extra={
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchPageContext()} loading={deviceLoading}>刷新设备</Button>
            <Button icon={<CodeOutlined />} onClick={handleRefreshThingModel} loading={thingModelLoading} disabled={!selectedDevice}>刷新物模型</Button>
          </Space>
        }
      />

      <Card style={summaryCardStyle} bodyStyle={{ padding: 20, background: 'transparent' }}>
        <Row gutter={[20, 20]} align="top">
          <Col xs={24} xl={14}>
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
              <div>
                <Title level={5} style={{ margin: 0 }}>目标设备</Title>
                <Text type="secondary">先选择设备，下面三个发送场景都会使用当前设备。</Text>
              </div>
              <Select
                showSearch
                allowClear
                optionFilterProp="label"
                placeholder="搜索设备名称或别名"
                loading={deviceLoading}
                value={selectedDeviceId}
                onChange={setSelectedDeviceId}
                options={deviceOptions.map((item) => ({ value: item.value, label: item.label }))}
                style={{ width: '100%' }}
              />
              <Space wrap>
                {selectedProduct ? <Tag color="processing" style={{ marginInlineEnd: 0 }}>{selectedProduct.name}（{selectedProduct.productKey}）</Tag> : null}
                {selectedDevice?.meta.onlineStatus ? <Tag color={onlineStatusColorMap[selectedDevice.meta.onlineStatus] || 'default'} style={{ marginInlineEnd: 0 }}>{onlineStatusTextMap[selectedDevice.meta.onlineStatus] || selectedDevice.meta.onlineStatus}</Tag> : null}
                {selectedDevice?.meta.status ? <Tag color={deviceStatusColorMap[selectedDevice.meta.status] || 'default'} style={{ marginInlineEnd: 0 }}>{deviceStatusTextMap[selectedDevice.meta.status] || selectedDevice.meta.status}</Tag> : null}
                {thingModelLoading ? <Tag color="processing" style={{ marginInlineEnd: 0 }}>物模型加载中</Tag> : null}
              </Space>
              {feedback ? (
                <Alert
                  type={feedback.status === 'success' ? 'success' : 'error'}
                  showIcon
                  message={`${feedback.mode}结果：${feedback.title}`}
                  description={<Space direction="vertical" size={4}><span>{feedback.detail}</span><Text type="secondary">发送时间：{feedback.sentAt}</Text></Space>}
                />
              ) : (
                <Alert type="info" showIcon message="操作提示" description="先选择设备，再切换到属性、事件或服务调用页签继续发送。" />
              )}
            </Space>
          </Col>
          <Col xs={24} xl={10}>
            <Card style={{ ...surfaceCardStyle, height: '100%', background: 'rgba(255,255,255,0.78)' }} bodyStyle={{ padding: 18 }}>
              {selectedDevice ? (
                <Descriptions column={1} size="small" title="当前设备上下文">
                  <Descriptions.Item label="设备标识">{selectedDevice.meta.deviceName}</Descriptions.Item>
                  <Descriptions.Item label="展示名称">{selectedDevice.meta.nickname || '-'}</Descriptions.Item>
                  <Descriptions.Item label="所属产品">{selectedProduct ? `${selectedProduct.name}（${selectedProduct.productKey}）` : '-'}</Descriptions.Item>
                  <Descriptions.Item label="在线状态"><Tag color={onlineStatusColorMap[selectedDevice.meta.onlineStatus || 'UNKNOWN'] || 'default'}>{onlineStatusTextMap[selectedDevice.meta.onlineStatus || 'UNKNOWN'] || selectedDevice.meta.onlineStatus || '未知'}</Tag></Descriptions.Item>
                  <Descriptions.Item label="设备状态"><Tag color={deviceStatusColorMap[selectedDevice.meta.status || 'INACTIVE'] || 'default'}>{deviceStatusTextMap[selectedDevice.meta.status || 'INACTIVE'] || selectedDevice.meta.status || '未知'}</Tag></Descriptions.Item>
                  <Descriptions.Item label="可写属性">{thingModelSummary.properties.length}</Descriptions.Item>
                  <Descriptions.Item label="可调服务">{thingModelSummary.services.length}</Descriptions.Item>
                </Descriptions>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先选择设备，再开始组织下发消息" />
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
              children: <PropertySetTab selectedDevice={selectedDevice} propertyOptions={thingModelSummary.properties} thingModelLoading={thingModelLoading} onFeedback={setFeedback} />,
            },
            {
              key: 'service-invoke',
              label: <span><ThunderboltOutlined style={{ marginRight: 6 }} />服务调用</span>,
              children: <ServiceInvokeTab selectedDevice={selectedDevice} serviceOptions={thingModelSummary.services} thingModelLoading={thingModelLoading} onFeedback={setFeedback} />,
            },
            {
              key: 'raw-message',
              label: <span><SendOutlined style={{ marginRight: 6 }} />原始消息</span>,
              children: <RawMessageTab selectedDevice={selectedDevice} thingModelLoading={thingModelLoading} onFeedback={setFeedback} />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DeviceMessagePage;
