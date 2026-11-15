import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Checkbox, Col, Divider, Drawer, Form, Input, InputNumber,
  Progress, Row, Select, Space, Tag, Typography, message,
} from 'antd';
import { CloudDownloadOutlined, PlusOutlined } from '@ant-design/icons';
import { useSimStore, type Protocol } from '../store';
import {
  buildEnvironmentDeviceDefaults,
  getActiveEnvironment,
  useSimWorkspaceStore,
} from '../workspaceStore';
import { connectDevices } from '../utils/fleetOps';

const { Text } = Typography;

interface BulkCreateDevicesDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultProtocol?: Protocol;
  onCreated?: (deviceIds: string[]) => void;
}

interface ProductOption {
  id: number;
  productKey: string;
  name: string;
  deviceAuthType: 'DEVICE_SECRET' | 'PRODUCT_SECRET';
}

interface BulkFormValues {
  protocol: Protocol;
  count: number;
  prefix: string;
  startIndex: number;
  padding: number;
  accessUrl?: string;
  mqttBrokerUrl?: string;
  wsEndpoint?: string;
  tcpHost?: string;
  tcpPort?: number;
  udpHost?: string;
  udpPort?: number;
  loraWebhookUrl?: string;
  loraAppId?: string;
  loraFPort?: number;
  snmpHost?: string;
  snmpPort?: number;
  snmpVersion?: number;
  snmpCommunity?: string;
  snmpSecurityName?: string;
  modbusHost?: string;
  modbusPort?: number;
  modbusSlaveId?: number;
  productKey?: string;
  productSecret?: string;
  deviceSecret?: string;
  authMode?: 'DEVICE_SECRET' | 'PRODUCT_SECRET';
  autoConnect: boolean;
  connectConcurrency: number;
}

const PROTOCOL_OPTIONS: Array<{ value: Protocol; label: string; description: string }> = [
  { value: 'HTTP', label: 'HTTP', description: '属性/事件上报，支持动态注册' },
  { value: 'MQTT', label: 'MQTT', description: '长连接上报，支持动态注册' },
  { value: 'CoAP', label: 'CoAP', description: 'CoAP Bridge 上报' },
  { value: 'WebSocket', label: 'WebSocket', description: '自定义协议长连接' },
  { value: 'TCP', label: 'TCP', description: '自定义协议 TCP' },
  { value: 'UDP', label: 'UDP', description: '自定义协议 UDP' },
  { value: 'LoRaWAN', label: 'LoRaWAN', description: '模拟网络服务器 Webhook 上行' },
  { value: 'SNMP', label: 'SNMP', description: '通过 Connector 访问 SNMP 目标' },
  { value: 'Modbus', label: 'Modbus', description: '通过 Connector 读取 Modbus 寄存器' },
];

function padIndex(value: number, padding: number): string {
  return String(value).padStart(Math.max(1, padding), '0');
}

function productProtocolQuery(protocol: Protocol): string | undefined {
  if (protocol === 'HTTP') return 'HTTP';
  if (protocol === 'MQTT') return 'MQTT';
  if (protocol === 'CoAP') return 'COAP';
  if (protocol === 'WebSocket' || protocol === 'TCP' || protocol === 'UDP') return 'CUSTOM';
  return undefined;
}

export default function BulkCreateDevicesDrawer({ open, onClose, defaultProtocol = 'HTTP', onCreated }: BulkCreateDevicesDrawerProps) {
  const [form] = Form.useForm<BulkFormValues>();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const addDevices = useSimStore((state) => state.addDevices);
  const addLog = useSimStore((state) => state.addLog);
  const environments = useSimWorkspaceStore((state) => state.environments);
  const activeEnvironmentId = useSimWorkspaceStore((state) => state.activeEnvironmentId);
  const sessions = useSimWorkspaceStore((state) => state.sessions);
  const clearSession = useSimWorkspaceStore((state) => state.clearSession);
  const activeEnvironment = useMemo(
    () => getActiveEnvironment(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  );
  const environmentDefaults = useMemo(
    () => buildEnvironmentDeviceDefaults(activeEnvironment),
    [activeEnvironment],
  );
  const activeSession = sessions[activeEnvironment.id];
  const protocol = Form.useWatch('protocol', form) ?? defaultProtocol;
  const count = Form.useWatch('count', form) ?? 20;
  const prefix = Form.useWatch('prefix', form) ?? 'sim-device';
  const padding = Form.useWatch('padding', form) ?? 4;
  const startIndex = Form.useWatch('startIndex', form) ?? 1;
  const authMode = Form.useWatch('authMode', form) ?? 'DEVICE_SECRET';
  const productKey = Form.useWatch('productKey', form);
  const supportsProduct = protocol === 'HTTP' || protocol === 'MQTT' || protocol === 'CoAP'
    || protocol === 'WebSocket' || protocol === 'TCP' || protocol === 'UDP';
  const supportsDynamicRegister = protocol === 'HTTP' || protocol === 'MQTT';

  const preview = useMemo(() => {
    const firstName = `${prefix}-${padIndex(startIndex, padding)}`;
    const lastName = `${prefix}-${padIndex(Number(startIndex) + Number(count) - 1, padding)}`;
    return { firstName, lastName };
  }, [count, padding, prefix, startIndex]);

  const applyProtocolDefaults = (nextProtocol: Protocol) => {
    form.setFieldsValue({
      protocol: nextProtocol,
      productKey: '',
      productSecret: '',
      deviceSecret: '',
      authMode: 'DEVICE_SECRET',
      accessUrl: String(environmentDefaults.httpBaseUrl),
      mqttBrokerUrl: String(environmentDefaults.mqttBrokerUrl),
      wsEndpoint: String(environmentDefaults.wsEndpoint),
      tcpHost: 'localhost',
      tcpPort: 8900,
      udpHost: 'localhost',
      udpPort: 8901,
      loraWebhookUrl: String(environmentDefaults.loraWebhookUrl),
      loraAppId: 'simulator',
      loraFPort: 1,
      snmpHost: '127.0.0.1',
      snmpPort: 161,
      snmpVersion: 2,
      snmpCommunity: 'public',
      modbusHost: '127.0.0.1',
      modbusPort: 502,
      modbusSlaveId: 1,
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({
      protocol: defaultProtocol,
      count: 20,
      prefix: 'sim-device',
      startIndex: 1,
      padding: 4,
      autoConnect: false,
      connectConcurrency: 8,
      loraFPort: 1,
    });
    applyProtocolDefaults(defaultProtocol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !supportsProduct || !activeSession?.accessToken) {
      setProducts([]);
      setProductError(activeSession?.accessToken ? '' : '登录后可选择平台产品并自动带出 ProductKey');
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setProductLoading(true);
      setProductError('');
      const result = await window.electronAPI.simulatorProductList(
        activeEnvironment.gatewayBaseUrl,
        activeSession.accessToken,
        { pageNum: 1, pageSize: 200, protocol: productProtocolQuery(protocol) },
        navigator.userAgent,
      );
      if (cancelled) {
        return;
      }
      if (result?._status === 401 || result?.code === 1002 || result?.code === 2004) {
        clearSession(activeEnvironment.id);
        setProductError('登录已失效，请重新登录');
        setProductLoading(false);
        return;
      }
      if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
        setProductError(result?.message || '产品列表加载失败，可手工填写 ProductKey');
        setProducts([]);
        setProductLoading(false);
        return;
      }
      const records = Array.isArray(result.data?.records)
        ? result.data.records
        : Array.isArray(result.data)
          ? result.data
          : [];
      setProducts(records.map((item: any) => ({
        id: Number(item.id),
        productKey: String(item.productKey || ''),
        name: String(item.name || item.productKey || ''),
        deviceAuthType: item.deviceAuthType === 'PRODUCT_SECRET' ? 'PRODUCT_SECRET' : 'DEVICE_SECRET',
      })));
      setProductLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeEnvironment.gatewayBaseUrl, activeEnvironment.id, activeSession?.accessToken, clearSession, open, protocol, supportsProduct]);

  const handleProductChange = (productId: number) => {
    const product = products.find((item) => item.id === productId);
    if (!product) {
      return;
    }
    form.setFieldsValue({
      productKey: product.productKey,
      authMode: supportsDynamicRegister ? product.deviceAuthType : 'DEVICE_SECRET',
      productSecret: '',
      deviceSecret: '',
    });
  };

  const handleFetchProductSecret = async () => {
    const product = products.find((item) => item.productKey === productKey);
    if (!product || !activeSession?.accessToken) {
      message.warning('请选择平台产品并确保已登录');
      return;
    }
    const result = await window.electronAPI.simulatorProductSecret(
      activeEnvironment.gatewayBaseUrl,
      activeSession.accessToken,
      product.id,
      navigator.userAgent,
    );
    if (!result?.success || (typeof result.code === 'number' && result.code !== 0)) {
      message.error(result?.message || '获取 ProductSecret 失败');
      return;
    }
    form.setFieldsValue({ productSecret: typeof result.data === 'string' ? result.data : '' });
    message.success('已填入 ProductSecret');
  };

  const handleSubmit = async () => {
    let values: BulkFormValues;
    try {
      values = await form.validateFields();
    } catch (error) {
      const fields = (error as { errorFields?: Array<{ name: Array<string | number>; errors: string[] }> }).errorFields || [];
      const first = fields[0];
      message.warning(first ? `${first.name.join('.')}：${first.errors[0]}` : '请检查必填项');
      return;
    }
    if (supportsDynamicRegister && values.authMode === 'PRODUCT_SECRET' && !values.productSecret?.trim()) {
      message.warning('动态注册需要 ProductSecret');
      return;
    }
    if (!supportsDynamicRegister && !values.deviceSecret?.trim() && values.autoConnect) {
      message.warning('当前协议批量连接需要统一的 DeviceSecret，或创建后逐台补充');
      return;
    }
    const total = Number(values.count);
    const start = Number(values.startIndex);
    const partials = Array.from({ length: total }, (_, index) => {
      const sequence = start + index;
      const name = `${values.prefix}-${padIndex(sequence, values.padding)}`;
      const base: Record<string, unknown> = {
        name,
        nickname: name,
        protocol: values.protocol,
        productKey: values.productKey?.trim() || '',
        productSecret: values.productSecret?.trim() || '',
        deviceName: name,
        deviceSecret: values.deviceSecret?.trim() || '',
        httpAuthMode: values.authMode,
        mqttAuthMode: values.authMode,
        restoreOnLaunch: false,
      };
      if (values.protocol === 'HTTP') {
        base.httpBaseUrl = values.accessUrl;
        base.httpRegisterBaseUrl = values.accessUrl;
      }
      if (values.protocol === 'MQTT') {
        base.mqttBrokerUrl = values.mqttBrokerUrl;
        base.mqttRegisterBaseUrl = values.accessUrl ?? environmentDefaults.mqttRegisterBaseUrl;
      }
      if (values.protocol === 'CoAP') {
        base.coapBaseUrl = values.accessUrl;
      }
      if (values.protocol === 'WebSocket') {
        base.wsEndpoint = values.wsEndpoint;
        base.wsConnectorUrl = values.accessUrl ?? environmentDefaults.wsConnectorUrl;
      }
      if (values.protocol === 'TCP') {
        base.tcpHost = values.tcpHost;
        base.tcpPort = values.tcpPort;
      }
      if (values.protocol === 'UDP') {
        base.udpHost = values.udpHost;
        base.udpPort = values.udpPort;
      }
      if (values.protocol === 'LoRaWAN') {
        base.loraWebhookUrl = values.loraWebhookUrl;
        base.loraAppId = values.loraAppId;
        const devEuiSeed = `${values.prefix}${padIndex(sequence, values.padding)}`.replace(/[^0-9A-Fa-f]/g, '');
        base.loraDevEui = devEuiSeed.padEnd(16, '0').slice(0, 16).toUpperCase();
        base.loraFPort = values.loraFPort;
      }
      if (values.protocol === 'SNMP') {
        base.snmpConnectorUrl = values.accessUrl ?? environmentDefaults.snmpConnectorUrl;
        base.snmpHost = values.snmpHost;
        base.snmpPort = values.snmpPort;
        base.snmpVersion = values.snmpVersion;
        base.snmpCommunity = values.snmpCommunity;
      }
      if (values.protocol === 'Modbus') {
        base.modbusConnectorUrl = values.accessUrl ?? environmentDefaults.modbusConnectorUrl;
        base.modbusHost = values.modbusHost;
        base.modbusPort = values.modbusPort;
        base.modbusSlaveId = values.modbusSlaveId;
      }
      return base;
    });

    setSubmitting(true);
    try {
      const ids = addDevices(partials as any[]);
      addLog('system', '批量创建', 'success', `已创建 ${ids.length} 台 ${values.protocol} 模拟设备（${preview.firstName} ~ ${preview.lastName}）`);
      message.success(`已创建 ${ids.length} 台设备`);
      onCreated?.(ids);
      if (values.autoConnect) {
        setProgress({ current: 0, total: ids.length });
        const result = await connectDevices(ids, {
          concurrency: values.connectConcurrency,
          onProgress: (item) => setProgress({ current: item.current, total: item.total }),
        });
        if (result.failed > 0) {
          message.warning(`批量连接完成：成功 ${result.succeeded}，失败 ${result.failed}。失败原因：${result.errors.slice(0, 3).map((item) => `${item.deviceName} ${item.message}`).join('；')}`);
        } else {
          message.success(`已连接 ${result.succeeded} 台设备`);
        }
      }
      setProgress(null);
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '批量创建失败');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <Drawer
      title="批量创建设备"
      open={open}
      onClose={() => {
        if (!submitting) {
          onClose();
        }
      }}
      width={720}
      destroyOnHidden
      footer={(
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={submitting}>取消</Button>
          <Button type="primary" icon={<PlusOutlined />} loading={submitting} onClick={() => void handleSubmit()}>
            创建 {count} 台
          </Button>
        </Space>
      )}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="批量创建只生成本地模拟配置；勾选“创建后自动连接”会立即按协议接入。"
        description="大批量建议使用动态注册（HTTP/MQTT），每台设备连接时自动换取 DeviceSecret。"
      />
      <Form form={form} layout="vertical" initialValues={{ protocol: defaultProtocol, count: 20, prefix: 'sim-device', startIndex: 1, padding: 4, autoConnect: false, connectConcurrency: 8 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="protocol" label="协议" rules={[{ required: true }]}>
              <Select
                options={PROTOCOL_OPTIONS.map((item) => ({ value: item.value, label: `${item.label} · ${item.description}` }))}
                onChange={(value: Protocol) => applyProtocolDefaults(value)}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="count" label="数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={2000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="padding" label="序号位数">
              <InputNumber min={1} max={8} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="prefix" label="名称前缀" rules={[{ required: true, message: '请输入名称前缀' }]}>
              <Input placeholder="sim-device" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="startIndex" label="起始序号">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="名称预览">
              <Text type="secondary">{preview.firstName} ~ {preview.lastName}</Text>
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left">接入参数</Divider>
        {supportsProduct ? (
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item label="平台产品（可选）" extra={productError || '选择后自动填入 ProductKey；也可手工填写'}>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  loading={productLoading}
                  options={products.map((item) => ({
                    value: item.id,
                    label: `${item.name}（${item.productKey}） · ${item.deviceAuthType === 'PRODUCT_SECRET' ? '一型一密' : '一机一密'}`,
                  }))}
                  onChange={(value?: number) => (value ? handleProductChange(value) : form.setFieldsValue({ productKey: '' }))}
                  placeholder="搜索并选择产品"
                />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item
                name="productKey"
                label="ProductKey"
                rules={['HTTP', 'MQTT', 'CoAP', 'WebSocket', 'TCP', 'UDP'].includes(protocol)
                  ? [{ required: true, message: '请输入 ProductKey' }]
                  : []}
              >
                <Input placeholder="选择产品或手工填写" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="authMode"
                label={supportsDynamicRegister ? '认证模式' : '认证方式'}
                extra={supportsDynamicRegister ? '一型一密会在连接时动态注册每台设备' : '该协议不支持动态注册，需要提供 DeviceSecret'}
              >
                <Select
                  options={supportsDynamicRegister
                    ? [
                        { value: 'PRODUCT_SECRET', label: '动态注册（ProductSecret）' },
                        { value: 'DEVICE_SECRET', label: '统一 DeviceSecret' },
                      ]
                    : [{ value: 'DEVICE_SECRET', label: '统一 DeviceSecret' }]}
                />
              </Form.Item>
            </Col>
            {authMode === 'PRODUCT_SECRET' ? (
              <Col span={12}>
                <Form.Item
                  name="productSecret"
                  label="ProductSecret"
                  rules={[{ required: true, message: '请输入或获取 ProductSecret' }]}
                >
                  <Input.Password
                    placeholder="动态注册使用"
                    addonAfter={(
                      <Button
                        type="text"
                        size="small"
                        icon={<CloudDownloadOutlined />}
                        onClick={() => void handleFetchProductSecret()}
                        disabled={!productKey}
                      >
                        获取
                      </Button>
                    )}
                  />
                </Form.Item>
              </Col>
            ) : (
              <Col span={12}>
                <Form.Item name="deviceSecret" label="统一 DeviceSecret" extra="仅当所有设备使用同一密钥时填写">
                  <Input.Password placeholder="可留空，创建后逐台补充" />
                </Form.Item>
              </Col>
            )}
          </Row>
        ) : null}

        {protocol === 'HTTP' ? (
          <Form.Item name="accessUrl" label="HTTP 接入地址">
            <Input placeholder="http://localhost:9070" />
          </Form.Item>
        ) : null}
        {protocol === 'CoAP' ? (
          <Form.Item name="accessUrl" label="CoAP Bridge 地址">
            <Input placeholder="http://localhost:9070" />
          </Form.Item>
        ) : null}
        {protocol === 'MQTT' ? (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="mqttBrokerUrl" label="MQTT Broker">
                <Input placeholder="mqtt://localhost:1883" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="accessUrl" label="动态注册地址">
                <Input placeholder="http://localhost:9070" />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        {protocol === 'WebSocket' ? (
          <Form.Item name="wsEndpoint" label="WebSocket 地址">
            <Input placeholder="ws://localhost:9070/ws/device" />
          </Form.Item>
        ) : null}
        {protocol === 'TCP' ? (
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="tcpHost" label="TCP 主机">
                <Input placeholder="localhost" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="tcpPort" label="端口">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        {protocol === 'UDP' ? (
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="udpHost" label="UDP 主机">
                <Input placeholder="localhost" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="udpPort" label="端口">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        {protocol === 'LoRaWAN' ? (
          <Row gutter={16}>
            <Col span={14}>
              <Form.Item name="loraWebhookUrl" label="Webhook 地址">
                <Input placeholder="http://localhost:9070/api/v1/lorawan/webhook/up" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="loraAppId" label="AppID">
                <Input />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item name="loraFPort" label="FPort">
                <InputNumber min={1} max={255} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        {protocol === 'SNMP' ? (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="snmpHost" label="SNMP 主机">
                <Input placeholder="127.0.0.1" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="snmpPort" label="端口">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="snmpVersion" label="版本">
                <Select options={[{ value: 1, label: 'v1' }, { value: 2, label: 'v2c' }, { value: 3, label: 'v3' }]} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="snmpCommunity" label="Community">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        {protocol === 'Modbus' ? (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="modbusHost" label="Modbus 主机">
                <Input placeholder="127.0.0.1" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="modbusPort" label="端口">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="modbusSlaveId" label="Slave ID">
                <InputNumber min={1} max={255} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        ) : null}

        <Divider orientation="left">创建后操作</Divider>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Form.Item name="autoConnect" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>创建后自动连接</Checkbox>
          </Form.Item>
          <Form.Item name="connectConcurrency" label="连接并发" style={{ marginBottom: 0 }} extra="建议 5-20，避免瞬时压满 Connector">
            <InputNumber min={1} max={100} style={{ width: 160 }} />
          </Form.Item>
        </Space>
        {progress ? (
          <div style={{ marginTop: 16 }}>
            <Progress percent={Math.round((progress.current / Math.max(1, progress.total)) * 100)} status="active" />
            <Text type="secondary">正在连接 {progress.current}/{progress.total}</Text>
          </div>
        ) : null}
        <Alert
          style={{ marginTop: 16 }}
          type="warning"
          showIcon
          message="视频 / GB28181 不参与批量创建"
          description="视频设备依赖摄像头、ffmpeg 与 SIP 会话，批量模拟会迅速耗尽本机资源；请在设备详情中单台联调。"
        />
        <Tag color="processing" style={{ marginTop: 12 }}>名称示例：{preview.firstName}</Tag>
      </Form>
    </Drawer>
  );
}
