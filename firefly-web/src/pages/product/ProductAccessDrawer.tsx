import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Space,
  Steps,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  DeploymentUnitOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  UsbOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { deviceAccessApi, productApi } from '../../services/api';

type AccessMode = 'secret' | 'register' | null;
type AccessTabKey = 'guide' | 'protocol' | 'register';

interface ProductTarget {
  id: number;
  name: string;
  productKey: string;
  status: string;
  protocol: string;
  nodeType: string;
  deviceAuthType: string;
  deviceCount: number;
}

interface DynamicRegisterResult {
  productKey?: string;
  deviceName: string;
  deviceSecret: string;
}

interface DeviceLocatorFormItem {
  locatorType?: string;
  locatorValue?: string;
  primaryLocator?: boolean;
}

interface DynamicRegisterFormValues {
  productKey?: string;
  productSecret?: string;
  deviceName?: string;
  nickname?: string;
  description?: string;
  tags?: string;
  locators?: DeviceLocatorFormItem[];
}

interface ProtocolGuideSection {
  title: string;
  description: string;
  rows: Array<{
    label: string;
    value: string;
    copyable?: boolean;
  }>;
  tips?: string[];
}

interface Props {
  product: ProductTarget | null;
  mode: AccessMode;
  open: boolean;
  onClose: () => void;
  onOpenDeviceManager?: () => void;
  onOpenVideoManager?: () => void;
  onOpenProtocolParser?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  DEVELOPMENT: '开发中',
  PUBLISHED: '已发布',
  DEPRECATED: '已废弃',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  DEVICE: '直连设备',
  GATEWAY: '网关设备',
};

const DEVICE_AUTH_LABELS: Record<string, string> = {
  DEVICE_SECRET: '一机一密',
  PRODUCT_SECRET: '一型一密',
};

const DEVICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{1,63}$/;
const DEVICE_NAME_RULE_MESSAGE =
  '设备名称支持 2-64 位字母、数字、冒号、下划线、中划线、小数点，且需以字母或数字开头';
const DEVICE_NAME_EXAMPLE = 'SN20240301001';
const LOCATOR_TYPE_OPTIONS = [
  { value: 'IMEI', label: 'IMEI' },
  { value: 'ICCID', label: 'ICCID' },
  { value: 'MAC', label: 'MAC' },
  { value: 'SERIAL', label: 'SERIAL' },
];
const VIDEO_PROTOCOL_VALUES = new Set(['GB28181', 'RTSP', 'RTMP']);

const ERROR_MESSAGE_MAP: Record<string, string> = {
  PRODUCT_DYNAMIC_REGISTER_DISABLED: '当前产品未启用一型一密认证，不能进行动态注册',
  INVALID_PRODUCT_SECRET: 'ProductSecret 校验失败，请刷新后重试',
  DEVICE_NAME_EXISTS: '设备名称已存在，请更换后重试',
  INVALID_DEVICE_NAME: DEVICE_NAME_RULE_MESSAGE,
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return ERROR_MESSAGE_MAP[response.data.message] || response.data.message;
    }
  }
  return fallback;
};

const normalizeLocatorInputs = (locators?: DeviceLocatorFormItem[]) => {
  const normalized = (locators || [])
    .map((item) => ({
      locatorType: item.locatorType?.trim().toUpperCase(),
      locatorValue: item.locatorValue?.trim(),
      primaryLocator: Boolean(item.primaryLocator),
    }))
    .filter((item): item is { locatorType: string; locatorValue: string; primaryLocator: boolean } => Boolean(item.locatorType && item.locatorValue));
  if (normalized.length > 0 && !normalized.some((item) => item.primaryLocator)) {
    normalized[0].primaryLocator = true;
  }
  return normalized.length > 0 ? normalized : undefined;
};

const isVideoProtocol = (protocol?: string) => Boolean(protocol && VIDEO_PROTOCOL_VALUES.has(protocol));

const resolveAccessAuthPresentation = (product: Pick<ProductTarget, 'protocol' | 'deviceAuthType'>) => {
  if (isVideoProtocol(product.protocol)) {
    return {
      color: 'cyan',
      label: '视频协议接入',
    };
  }

  const authType = product.deviceAuthType || 'DEVICE_SECRET';
  return {
    color: DEVICE_AUTH_LABELS[authType] === '一型一密' ? 'gold' : 'blue',
    label: DEVICE_AUTH_LABELS[authType] || authType,
  };
};

const buildGuideSteps = (
  product: ProductTarget,
  supportsProductSecret: boolean,
  canRegister: boolean,
) => {
  if (isVideoProtocol(product.protocol)) {
    return [
      {
        title: '确认产品协议',
        description: `当前产品使用 ${product.protocol} 协议。`,
      },
      {
        title: '新增视频设备',
        description: '跳转到设备资产的视频设备视图后直接新增。',
      },
      {
        title: '联调媒体控制',
        description: '保存后可执行播放、目录、设备信息、截图、录像和云台控制。',
      },
    ];
  }

  if (supportsProductSecret) {
    return [
      {
        title: '确认产品密钥',
        description: '从当前页面查看 ProductSecret，并确认设备名称符合命名规则。',
      },
      {
        title: '动态注册换取设备密钥',
        description: canRegister
          ? '调用动态注册后会真实创建一台设备，并返回专属 DeviceSecret。'
          : '当前产品未启用一型一密认证，只能先查看接入参数。',
      },
      {
        title: `按 ${product.protocol} 建立连接`,
        description: '设备后续统一使用 DeviceSecret 鉴权连接，并按协议口径上报属性、事件或心跳。',
      },
    ];
  }

  return [
    {
      title: '先在平台创建设备',
      description: '一机一密产品需要先到设备管理页手动创建或批量导入设备。',
    },
    {
      title: '获取专属 DeviceSecret',
      description: '每台设备都有独立 DeviceSecret，不能和其他设备复用。',
    },
    {
      title: `按 ${product.protocol} 直接连接`,
      description: '创建设备后即可直接使用 DeviceSecret 接入，无需再走动态注册。',
    },
  ];
};

const buildProtocolGuideSections = (
  product: ProductTarget,
  supportsProductSecret: boolean,
): ProtocolGuideSection[] => {
  if (isVideoProtocol(product.protocol)) {
    switch (product.protocol) {
      case 'GB28181':
        return [
          {
            title: '视频设备创建',
            description: '在设备资产的视频设备视图中新增 GB/T 28181 设备。',
            rows: [
              { label: '推荐页面', value: '/device', copyable: true },
              { label: '接入方式', value: 'GB/T 28181', copyable: true },
              { label: '认证方式', value: '统一认证字段（默认用户名=GB 设备编号）' },
              { label: '必填参数', value: '设备名称、GB 设备编号、GB 域、传输协议、IP、端口、认证信息' },
            ],
          },
        ];
      case 'RTSP':
        return [
          {
            title: '视频设备创建',
            description: '在设备资产的视频设备视图中新增 RTSP 设备。',
            rows: [
              { label: '推荐页面', value: '/device', copyable: true },
              { label: '接入方式', value: 'RTSP', copyable: true },
              { label: '认证方式', value: '统一认证字段（按需启用）' },
              { label: '必填参数', value: '设备名称、视频源地址或 IP/端口；本地摄像头流需补齐认证信息' },
            ],
          },
        ];
      case 'RTMP':
        return [
          {
            title: '视频设备创建',
            description: '在设备资产的视频设备视图中新增 RTMP 设备。',
            rows: [
              { label: '推荐页面', value: '/device', copyable: true },
              { label: '接入方式', value: 'RTMP', copyable: true },
              { label: '认证方式', value: '统一认证字段（按需启用）' },
              { label: '必填参数', value: '设备名称、视频源地址或 IP/端口；本地摄像头流需补齐认证信息' },
            ],
          },
        ];
      default:
        return [];
    }
  }

  const authSecretHint = supportsProductSecret
    ? '先动态注册，使用返回的 DeviceSecret'
    : '直接使用设备的 DeviceSecret';
  const registerPayload = `{
  "productKey": "${product.productKey}",
  "productSecret": "<ProductSecret>",
  "deviceName": "${DEVICE_NAME_EXAMPLE}",
  "locators": [
    {
      "locatorType": "IMEI",
      "locatorValue": "860001234567890",
      "primaryLocator": true
    }
  ]
}`;
  const httpAuthPayload = `{
  "productKey": "${product.productKey}",
  "deviceName": "${DEVICE_NAME_EXAMPLE}",
  "deviceSecret": "<DeviceSecret>"
}`;
  const coapAuthPayload = httpAuthPayload;

  switch (product.protocol) {
    case 'MQTT':
      return [
        {
          title: '连接鉴权',
          description: 'MQTT 设备连接 Broker 时完成鉴权，用户名和客户端标识都使用业务唯一键拼装。',
          rows: [
            { label: 'ClientId', value: `${product.productKey}.${DEVICE_NAME_EXAMPLE}`, copyable: true },
            { label: 'Username', value: `${DEVICE_NAME_EXAMPLE}&${product.productKey}`, copyable: true },
            { label: 'Password', value: authSecretHint },
          ],
          tips: supportsProductSecret
            ? ['一型一密设备要先调用动态注册接口，拿到 DeviceSecret 后再连接 MQTT。']
            : ['一机一密产品可以在设备管理页创建设备后直接连接 MQTT。'],
        },
        {
          title: '上报与订阅',
          description: '设备接入后，统一按固定 Topic 进行属性、事件上报和服务调用订阅。',
          rows: [
            {
              label: '属性上报 Topic',
              value: `/sys/${product.productKey}/${DEVICE_NAME_EXAMPLE}/thing/property/post`,
              copyable: true,
            },
            {
              label: '事件上报 Topic',
              value: `/sys/${product.productKey}/${DEVICE_NAME_EXAMPLE}/thing/event/post`,
              copyable: true,
            },
            {
              label: '服务订阅 Topic',
              value: `/sys/${product.productKey}/${DEVICE_NAME_EXAMPLE}/thing/service/+`,
              copyable: true,
            },
          ],
          tips: ['MQTT 连接建立和断开会自动驱动设备上线、离线事件，无需额外调用生命周期接口。'],
        },
      ];
    case 'HTTP':
      return [
        {
          title: '认证换取 Token',
          description: 'HTTP 设备先调用认证接口换取 24 小时有效的 Token，后续请求都用 Token 鉴权。',
          rows: [
            { label: '认证接口', value: 'POST /api/v1/protocol/http/auth', copyable: true },
            { label: '认证请求体', value: httpAuthPayload, copyable: true },
            { label: 'Token Header', value: 'X-Device-Token: <token>', copyable: true },
          ],
          tips: supportsProductSecret
            ? [
                '一型一密设备先调用动态注册接口换取 DeviceSecret，再调用 /api/v1/protocol/http/auth。',
                `动态注册请求体示例：${registerPayload}`,
              ]
            : ['一机一密产品可以直接调用认证接口，无需动态注册。'],
        },
        {
          title: '上报与心跳',
          description: '认证成功后，属性、事件和心跳都走标准 HTTP 入口。',
          rows: [
            { label: '属性上报', value: 'POST /api/v1/protocol/http/property/post', copyable: true },
            { label: '事件上报', value: 'POST /api/v1/protocol/http/event/post', copyable: true },
            { label: '设备心跳', value: 'POST /api/v1/protocol/http/heartbeat', copyable: true },
          ],
          tips: ['HTTP 设备上线、心跳和离线由平台生命周期服务自动维护，建议定期发送心跳保持在线状态。'],
        },
      ];
    case 'COAP':
      return [
        {
          title: '认证与令牌',
          description: 'CoAP 设备先发送 JSON 认证载荷，换取平台签发的设备 Token。',
          rows: [
            { label: '认证接口', value: 'POST /api/v1/protocol/coap/auth', copyable: true },
            { label: '认证载荷', value: coapAuthPayload, copyable: true },
            { label: 'Token 参数', value: 'token=<token>', copyable: true },
          ],
          tips: supportsProductSecret
            ? ['一型一密同样先动态注册换取 DeviceSecret，再进行 CoAP 鉴权。']
            : ['一机一密产品可直接使用 DeviceSecret 发起 CoAP 认证。'],
        },
        {
          title: '属性、事件与 OTA',
          description: 'CoAP 的属性上报、事件上报和 OTA 进度都通过标准资源路径处理。',
          rows: [
            { label: '属性上报', value: 'POST /api/v1/protocol/coap/property?token=<token>', copyable: true },
            { label: '事件上报', value: 'POST /api/v1/protocol/coap/event?token=<token>', copyable: true },
            { label: 'OTA 进度', value: 'POST /api/v1/protocol/coap/ota/progress?token=<token>', copyable: true },
          ],
          tips: ['如需自定义二进制帧解析，请在协议解析页面补充匹配规则和脚本。'],
        },
      ];
    default:
      return [
        {
          title: '当前协议接入说明',
          description: '该协议当前没有内置的专用页面示例，建议结合协议解析和设备模拟器完成联调。',
          rows: [
            { label: '产品 Key', value: product.productKey, copyable: true },
            { label: '认证方式', value: DEVICE_AUTH_LABELS[product.deviceAuthType] || product.deviceAuthType },
            { label: '推荐动作', value: '优先补齐协议解析规则，再使用设备模拟器联调链路' },
          ],
          tips: supportsProductSecret
            ? ['如果设备使用一型一密，仍需先动态注册，换取 DeviceSecret 后再进入自定义协议链路。']
            : ['如果设备使用一机一密，请先到设备管理页创建设备并获取 DeviceSecret。'],
        },
      ];
  }
};

const renderCodeValue = (value: string, copyable?: boolean) => (
  <Typography.Text
    copyable={copyable ? { text: value } : false}
    code={copyable}
    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
  >
    {value}
  </Typography.Text>
);

const ProductAccessDrawer: React.FC<Props> = ({
  product,
  mode,
  open,
  onClose,
  onOpenDeviceManager,
  onOpenVideoManager,
  onOpenProtocolParser,
}) => {
  const [activeTab, setActiveTab] = useState<AccessTabKey>('guide');
  const [secretLoading, setSecretLoading] = useState(false);
  const [productSecret, setProductSecret] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerResult, setRegisterResult] = useState<DynamicRegisterResult | null>(null);
  const [form] = Form.useForm<DynamicRegisterFormValues>();

  const isVideoProductAccess = isVideoProtocol(product?.protocol);
  const supportsProductSecret = !isVideoProductAccess && product?.deviceAuthType === 'PRODUCT_SECRET';
  const canRegister = supportsProductSecret;
  const authPresentation = product ? resolveAccessAuthPresentation(product) : null;

  const drawerTitle = useMemo(() => {
    if (!product) {
      return '设备接入';
    }
    return `设备接入 - ${product.name}`;
  }, [product]);

  const guideSteps = useMemo(() => {
    if (!product) {
      return [];
    }
    return buildGuideSteps(product, supportsProductSecret, canRegister);
  }, [canRegister, product, supportsProductSecret]);

  const protocolGuideSections = useMemo(() => {
    if (!product) {
      return [];
    }
    return buildProtocolGuideSections(product, supportsProductSecret);
  }, [product, supportsProductSecret]);

  const summaryAlert = useMemo(() => {
    if (!product) {
      return null;
    }
    if (isVideoProductAccess) {
      return {
        type: 'info' as const,
        message: '当前产品请在设备资产的视频设备视图中新增，系统会自动带入产品和协议。',
      };
    }
    if (supportsProductSecret) {
      if (canRegister) {
        return {
          type: 'success' as const,
          message: '当前产品已启用一型一密，可直接查看 ProductSecret 并调试动态注册，开发中产品同样支持联调。',
        };
      }
      return {
        type: 'warning' as const,
        message: '当前产品未启用一型一密，暂不能执行动态注册。',
      };
    }

    return {
      type: 'info' as const,
      message: '当前产品采用一机一密，需先在设备管理页创建设备，再使用每台设备自己的 DeviceSecret 接入。',
    };
  }, [canRegister, isVideoProductAccess, product, supportsProductSecret]);

  const syncFormValues = (secret: string) => {
    if (!product) {
      return;
    }

    form.setFieldsValue({
      productKey: product.productKey,
      productSecret: secret,
      deviceName: undefined,
      nickname: undefined,
      description: undefined,
      tags: undefined,
      locators: undefined,
    });
  };

  const loadSecret = async () => {
    if (!product) {
      return '';
    }
    if (!supportsProductSecret || isVideoProductAccess) {
      setProductSecret('');
      syncFormValues('');
      return '';
    }

    setSecretLoading(true);
    try {
      const res = await productApi.getSecret(product.id);
      const secret = res.data.data || '';
      setProductSecret(secret);
      syncFormValues(secret);
      return secret;
    } catch (error) {
      message.error(getErrorMessage(error, '获取 ProductSecret 失败'));
      setProductSecret('');
      syncFormValues('');
      return '';
    } finally {
      setSecretLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !product) {
      return;
    }

    setActiveTab(mode === 'register' && supportsProductSecret ? 'register' : 'guide');
    setRegisterResult(null);
    form.resetFields();

    if (!isVideoProductAccess && product.deviceAuthType === 'PRODUCT_SECRET') {
      void loadSecret();
    } else {
      setProductSecret('');
      syncFormValues('');
    }
  }, [form, isVideoProductAccess, mode, open, product, supportsProductSecret]);

  const handleSubmitRegister = async (values: DynamicRegisterFormValues) => {
    if (!product) {
      return;
    }

    if (!supportsProductSecret) {
      message.warning('当前产品未启用一型一密认证');
      return;
    }

    if (!canRegister) {
      message.warning('只有启用一型一密的产品才支持动态注册');
      return;
    }

    const deviceName = values.deviceName?.trim();
    if (!deviceName) {
      message.warning('请输入设备名称');
      return;
    }

    setRegisterSubmitting(true);
    try {
      const res = await deviceAccessApi.dynamicRegister({
        productKey: product.productKey,
        productSecret,
        deviceName,
        nickname: values.nickname,
        description: values.description,
        tags: values.tags,
        locators: normalizeLocatorInputs(values.locators),
      });
      const payload = res.data.data as DynamicRegisterResult;
      setRegisterResult(payload);
      message.success('动态注册成功，已生成设备密钥');
      form.setFieldValue('deviceName', undefined);
      form.setFieldValue('nickname', undefined);
      form.setFieldValue('description', undefined);
      form.setFieldValue('tags', undefined);
      form.setFieldValue('locators', undefined);
    } catch (error) {
      message.error(getErrorMessage(error, '动态注册失败'));
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const handleOpenDeviceManager = () => {
    onClose();
    onOpenDeviceManager?.();
  };

  const handleOpenProtocolParser = () => {
    onClose();
    onOpenProtocolParser?.();
  };

  const handleOpenVideoManager = () => {
    onClose();
    onOpenVideoManager?.();
  };

  const tabItems = [
    {
      key: 'guide',
      label: (
        <span>
          <DeploymentUnitOutlined /> 接入指引
        </span>
      ),
      children: product ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {summaryAlert ? <Alert type={summaryAlert.type} showIcon message={summaryAlert.message} /> : null}

          <Card
            size="small"
            title="接入路径"
            style={{ borderRadius: 16 }}
            styles={{ body: { paddingBottom: 8 } }}
          >
            <Steps direction="vertical" size="small" items={guideSteps} />
          </Card>

          <Card
            size="small"
            title={isVideoProductAccess ? '当前视频接入' : supportsProductSecret ? '当前接入凭证' : '当前认证约束'}
            style={{ borderRadius: 16 }}
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {isVideoProductAccess ? (
                <>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="接入协议">{product.protocol}</Descriptions.Item>
                    <Descriptions.Item label="推荐页面">设备资产 / 视频设备</Descriptions.Item>
                    <Descriptions.Item label="下一步">新增视频设备并联调控制</Descriptions.Item>
                  </Descriptions>
                  {onOpenVideoManager ? (
                    <Button type="primary" icon={<VideoCameraOutlined />} onClick={handleOpenVideoManager}>
                      去视频设备
                    </Button>
                  ) : null}
                </>
              ) : supportsProductSecret ? (
                <>
                  <Typography.Text type="secondary">
                    ProductSecret 只用于动态注册，设备接入时最终仍然使用动态注册换取的 DeviceSecret。
                  </Typography.Text>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="ProductSecret">
                      {renderCodeValue(secretLoading ? '加载中...' : productSecret || '未获取到密钥', !!productSecret)}
                    </Descriptions.Item>
                  </Descriptions>
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<UsbOutlined />}
                      disabled={!canRegister}
                      onClick={() => setActiveTab('register')}
                    >
                      调试动态注册
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      loading={secretLoading}
                      onClick={() => void loadSecret()}
                    >
                      刷新密钥
                    </Button>
                  </Space>
                </>
              ) : (
                <>
                  <Typography.Text type="secondary">
                    当前产品不开放 ProductSecret，也不支持动态注册，设备必须先创建后接入。
                  </Typography.Text>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="认证方式">一机一密</Descriptions.Item>
                    <Descriptions.Item label="接入凭证">每台设备独立 DeviceSecret</Descriptions.Item>
                    <Descriptions.Item label="推荐动作">前往设备管理页创建或批量导入设备</Descriptions.Item>
                  </Descriptions>
                  {onOpenDeviceManager ? (
                    <Button type="primary" onClick={handleOpenDeviceManager}>
                      去设备管理
                    </Button>
                  ) : null}
                </>
              )}
            </Space>
          </Card>

          <Card size="small" title="后续动作" style={{ borderRadius: 16 }}>
            <Space wrap>
              {isVideoProductAccess && onOpenVideoManager ? (
                <Button icon={<VideoCameraOutlined />} onClick={handleOpenVideoManager}>
                  视频设备
                </Button>
              ) : null}
              {!isVideoProductAccess && onOpenDeviceManager ? <Button onClick={handleOpenDeviceManager}>设备管理</Button> : null}
              {!isVideoProductAccess && onOpenProtocolParser ? (
                <Button icon={<ApiOutlined />} onClick={handleOpenProtocolParser}>
                  协议解析
                </Button>
              ) : null}
            </Space>
          </Card>
        </Space>
      ) : null,
    },
    {
      key: 'protocol',
      label: (
        <span>
          <ApiOutlined /> 协议参数
        </span>
      ),
      children: product ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {protocolGuideSections.map((section) => (
            <Card key={section.title} size="small" title={section.title} style={{ borderRadius: 16 }}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Typography.Text type="secondary">{section.description}</Typography.Text>
                <Descriptions column={1} size="small">
                  {section.rows.map((row) => (
                    <Descriptions.Item key={`${section.title}-${row.label}`} label={row.label}>
                      {renderCodeValue(row.value, row.copyable)}
                    </Descriptions.Item>
                  ))}
                </Descriptions>
              </Space>
            </Card>
          ))}
        </Space>
      ) : null,
    },
    {
      key: 'register',
      label: (
        <span>
          <UsbOutlined /> 动态注册
        </span>
      ),
      children: product ? (
        supportsProductSecret ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              type={canRegister ? 'info' : 'warning'}
              showIcon
              message={
                canRegister
                  ? '调试注册会真实创建一台设备，并返回新的 DeviceSecret。请避免在正式环境重复创建测试设备。'
                  : '当前产品未启用一型一密，暂不能执行动态注册。你可以先查看协议参数。'
              }
            />

            <Form form={form} layout="vertical" onFinish={handleSubmitRegister} disabled={!canRegister}>
              <Form.Item label="ProductKey" name="productKey">
                <Input readOnly />
              </Form.Item>
              <Form.Item label="ProductSecret" name="productSecret">
                <Input.Password readOnly visibilityToggle={false} />
              </Form.Item>
              <Form.Item
                label="设备名称"
                name="deviceName"
                rules={[
                  { required: true, message: '请输入设备名称' },
                  { pattern: DEVICE_NAME_PATTERN, message: DEVICE_NAME_RULE_MESSAGE },
                ]}
                extra="推荐使用设备 SN、MAC 或厂内唯一编号，避免后续重复创建。"
              >
                <Input placeholder={`例如：${DEVICE_NAME_EXAMPLE}`} maxLength={64} />
              </Form.Item>
              <Form.Item label="设备昵称" name="nickname">
                <Input placeholder="选填，用于后台展示" maxLength={64} />
              </Form.Item>
              <Form.Item label="设备描述" name="description">
                <Input.TextArea rows={3} placeholder="选填，记录设备安装位置或用途" maxLength={255} />
              </Form.Item>
              <Form.Item label="设备标识" extra="可选，动态注册成功时会同步写入设备标识，便于协议解析和设备识别。">
                <Form.List name="locators">
                  {(fields, { add, remove }) => (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {fields.map((field, index) => (
                        <Card key={field.key} size="small" style={{ borderRadius: 12 }}>
                          <Space align="start" style={{ display: 'flex' }}>
                            <Form.Item name={[field.name, 'locatorType']} label={index === 0 ? '标识类型' : undefined} rules={[{ required: true, message: '请选择标识类型' }]} style={{ width: 180, marginBottom: 0 }}>
                              <Select showSearch optionFilterProp="label" options={LOCATOR_TYPE_OPTIONS} placeholder="选择类型" />
                            </Form.Item>
                            <Form.Item name={[field.name, 'locatorValue']} label={index === 0 ? '标识值' : undefined} rules={[{ required: true, message: '请输入标识值' }]} style={{ flex: 1, marginBottom: 0 }}>
                              <Input placeholder="输入设备真实上报的标识值" maxLength={128} />
                            </Form.Item>
                            <Form.Item name={[field.name, 'primaryLocator']} label={index === 0 ? '主标识' : undefined} valuePropName="checked" style={{ marginBottom: 0 }}>
                              <Switch checkedChildren="是" unCheckedChildren="否" />
                            </Form.Item>
                            <Form.Item label={index === 0 ? ' ' : undefined} style={{ marginBottom: 0 }}>
                              <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>
                                删除
                              </Button>
                            </Form.Item>
                          </Space>
                        </Card>
                      ))}
                      <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ locatorType: 'IMEI', primaryLocator: fields.length === 0 })}>
                        新增设备标识
                      </Button>
                    </Space>
                  )}
                </Form.List>
              </Form.Item>
              <Form.Item
                label="扩展标签"
                name="tags"
                extra="如需一次性写入简单标签，可使用 key=value,key2=value2 的文本格式。"
              >
                <Input placeholder="例如：area=room1,type=test" maxLength={255} />
              </Form.Item>
              <Space wrap>
                <Button type="primary" htmlType="submit" loading={registerSubmitting} disabled={!canRegister}>
                  执行动态注册
                </Button>
                <Button onClick={() => setActiveTab('protocol')}>查看协议参数</Button>
              </Space>
            </Form>

            {registerResult ? (
              <Card size="small" title="注册结果" style={{ borderRadius: 16 }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="产品 Key">
                    {renderCodeValue(registerResult.productKey || product.productKey, true)}
                  </Descriptions.Item>
                  <Descriptions.Item label="设备名称">
                    {renderCodeValue(registerResult.deviceName, true)}
                  </Descriptions.Item>
                  <Descriptions.Item label="DeviceSecret">
                    {renderCodeValue(registerResult.deviceSecret, true)}
                  </Descriptions.Item>
                </Descriptions>
                <Divider style={{ margin: '12px 0' }} />
                <Typography.Text type="secondary">
                  下一步请使用这里返回的 DeviceSecret，按“协议参数”页中的 {product.protocol} 鉴权口径建立连接。
                </Typography.Text>
              </Card>
            ) : null}
          </Space>
        ) : (
          <Empty
            description="当前产品是一机一密，不支持动态注册"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            {onOpenDeviceManager ? (
              <Button type="primary" onClick={handleOpenDeviceManager}>
                去设备管理创建设备
              </Button>
            ) : null}
          </Empty>
        )
      ) : null,
    },
  ].filter((item) => !isVideoProductAccess || item.key !== 'register');

  return (
    <Drawer
      title={drawerTitle}
      open={open}
      onClose={onClose}
      width={760}
      destroyOnHidden
      extra={
        supportsProductSecret ? (
          <Button icon={<ReloadOutlined />} loading={secretLoading} onClick={() => void loadSecret()}>
            刷新密钥
          </Button>
        ) : null
      }
    >
      {product ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            size="small"
            style={{
              borderRadius: 18,
              border: '1px solid #e2e8f0',
              background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
            }}
          >
            <Descriptions column={2} size="small">
              <Descriptions.Item label="ProductKey" span={2}>
                {renderCodeValue(product.productKey, true)}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={product.status === 'PUBLISHED' ? 'success' : 'processing'}>
                  {STATUS_LABELS[product.status] || product.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="协议">{product.protocol}</Descriptions.Item>
              <Descriptions.Item label="节点类型">
                {NODE_TYPE_LABELS[product.nodeType] || product.nodeType}
              </Descriptions.Item>
              <Descriptions.Item label="认证方式">
                <Tag color={authPresentation?.color}>
                  {authPresentation?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="关联设备">{product.deviceCount}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as AccessTabKey)}
            items={tabItems}
          />
        </Space>
      ) : null}
    </Drawer>
  );
};

export default ProductAccessDrawer;
