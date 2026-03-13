import { useMemo, useState } from 'react';
import {
  Alert,
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
  Typography,
  message,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type { Protocol } from '../store';
import { useSimStore } from '../store';

const { Paragraph, Text } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
}

const initialValues = {
  protocol: 'HTTP',
  httpBaseUrl: 'http://localhost:9070',
  httpAuthMode: 'DEVICE_SECRET',
  httpRegisterBaseUrl: 'http://localhost:9070',
  coapBaseUrl: 'http://localhost:9070',
  mqttAuthMode: 'DEVICE_SECRET',
  mqttRegisterBaseUrl: 'http://localhost:9070',
  mqttBrokerUrl: 'mqtt://localhost:1883',
  mqttClean: true,
  mqttKeepalive: 60,
  mqttWillQos: 1,
  mqttWillRetain: false,
  mediaBaseUrl: 'http://localhost:9040',
  streamMode: 'GB28181',
  gbDomain: '3402000000',
  sipServerIp: '127.0.0.1',
  sipServerPort: 5060,
  sipServerId: '34020000002000000001',
  sipLocalPort: 5080,
  sipKeepaliveInterval: 60,
  sipTransport: 'UDP',
  sipPassword: '',
  snmpConnectorUrl: 'http://localhost:9070',
  snmpPort: 161,
  snmpVersion: 2,
  snmpCommunity: 'public',
  modbusConnectorUrl: 'http://localhost:9070',
  modbusPort: 502,
  modbusSlaveId: 1,
  modbusMode: 'TCP',
  wsConnectorUrl: 'http://localhost:9070',
  wsEndpoint: 'ws://localhost:9070/ws/device',
  tcpHost: 'localhost',
  tcpPort: 8900,
  udpHost: 'localhost',
  udpPort: 8901,
  loraWebhookUrl: 'http://localhost:9070/api/v1/lorawan/webhook/up',
  loraFPort: 1,
};

const STEP_TITLES = ['基本信息', '接入参数', '扩展配置'];

const PROTOCOL_META: Record<Protocol, { label: string; description: string }> = {
  HTTP: { label: 'HTTP 设备', description: '支持一机一密鉴权，也支持先动态注册再通过 HTTP 鉴权上报。' },
  MQTT: { label: 'MQTT 设备', description: '支持一机一密和一型一密动态注册。' },
  CoAP: { label: 'CoAP 设备', description: '支持 CoAP Bridge 鉴权、上报和影子拉取。' },
  Video: { label: '视频设备', description: '支持 GB28181 和 RTSP 代理两种模式。' },
  SNMP: { label: 'SNMP 设备', description: '用于 SNMP 连通性和 OID 读写测试。' },
  Modbus: { label: 'Modbus 设备', description: '用于 Modbus TCP / RTU over TCP 调试。' },
  WebSocket: { label: 'WebSocket 设备', description: '通过 `/ws/device` 建立实时双向连接。' },
  TCP: { label: 'TCP 设备', description: '适合文本报文和 Socket 联调。' },
  UDP: { label: 'UDP 设备', description: '适合无连接报文发送测试。' },
  LoRaWAN: { label: 'LoRaWAN 设备', description: '通过 Webhook 模拟 LoRaWAN 上行。' },
};

const drawerPanelCardStyle = {
  borderRadius: 16,
  background: 'linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(8,15,29,0.94) 100%)',
  border: '1px solid rgba(59,130,246,0.18)',
  boxShadow: '0 14px 30px rgba(2,6,23,0.24)',
} as const;

function getStepFields(protocol: Protocol, step: number, mqttAuthMode?: string, streamMode?: string, httpAuthMode?: string): string[] {
  if (step === 0) return ['name', 'protocol'];
  if (step === 1) {
    switch (protocol) {
      case 'HTTP':
        return ['httpBaseUrl', 'productKey', 'deviceName', ...(httpAuthMode === 'PRODUCT_SECRET' ? ['httpRegisterBaseUrl', 'productSecret'] : ['deviceSecret'])];
      case 'MQTT':
        return ['productKey', 'deviceName', 'mqttBrokerUrl', ...(mqttAuthMode === 'PRODUCT_SECRET' ? ['mqttRegisterBaseUrl', 'productSecret'] : ['deviceSecret'])];
      case 'Video':
        return ['mediaBaseUrl', 'streamMode', ...(streamMode === 'RTSP_PROXY' ? ['rtspUrl'] : ['gbDeviceId', 'gbDomain'])];
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
    return ['sipServerIp', 'sipServerPort', 'sipServerId', 'sipLocalPort'];
  }
  return [];
}

function buildSummary(values: Record<string, unknown>) {
  const protocol = (values.protocol || 'HTTP') as string;
  return [
    { key: 'name', label: '模拟设备名称', value: values.name || '-' },
    { key: 'protocol', label: '接入协议', value: protocol },
    { key: 'main1', label: '核心标识', value: values.productKey || values.gbDeviceId || values.loraDevEui || values.snmpHost || values.modbusHost || values.wsEndpoint || values.tcpHost || values.udpHost || '-' },
    { key: 'main2', label: '连接地址', value: values.httpBaseUrl || values.coapBaseUrl || values.mqttBrokerUrl || values.mediaBaseUrl || values.loraWebhookUrl || '-' },
  ];
}

export default function AddDeviceModal({ open, onClose }: Props) {
  const addLog = useSimStore((state) => state.addLog);
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [formSnapshot, setFormSnapshot] = useState<Record<string, unknown>>(initialValues);

  const protocol = ((formSnapshot.protocol as Protocol | undefined) || 'HTTP') as Protocol;
  const httpAuthMode = formSnapshot.httpAuthMode as string | undefined;
  const mqttAuthMode = formSnapshot.mqttAuthMode as string | undefined;
  const streamMode = formSnapshot.streamMode as string | undefined;
  const meta = useMemo(() => PROTOCOL_META[protocol], [protocol]);

  const closeDrawer = () => {
    form.resetFields();
    setCurrentStep(0);
    setFormSnapshot(initialValues);
    onClose();
  };

  const nextStep = async () => {
    const fields = getStepFields(protocol, currentStep, mqttAuthMode, streamMode, httpAuthMode);
    if (fields.length > 0) {
      await form.validateFields(fields);
    }
    setCurrentStep((prev) => Math.min(prev + 1, STEP_TITLES.length - 1));
  };

  const handleAdd = async () => {
    const values = await form.validateFields();
    useSimStore.getState().addDevice(values);
    addLog('system', 'System', 'info', `新增模拟设备：${values.name}`);
    message.success(`已新增模拟设备：${values.name}`);
    closeDrawer();
  };

  const renderBasicStep = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="复杂表单改为抽屉分步配置"
        description="先选协议，再按协议只显示真正需要的字段，避免一次性录入过多无关参数。"
      />
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
      <Card size="small" style={drawerPanelCardStyle}>
        <Text strong>{meta.label}</Text>
        <Paragraph type="secondary" style={{ margin: '8px 0 0' }}>{meta.description}</Paragraph>
      </Card>
    </Space>
  );

  const renderThreeTuple = (baseField: string, baseLabel: string) => (
    <>
      <Form.Item name={baseField} label={baseLabel} rules={[{ required: true, message: `请输入${baseLabel}` }]}>
        <Input placeholder="http://localhost:9070" />
      </Form.Item>
      <Form.Item name="productKey" label="ProductKey" rules={[{ required: true, message: '请输入 ProductKey' }]}>
        <Input placeholder="例如：sensor_gateway" />
      </Form.Item>
      <Form.Item name="deviceName" label="DeviceName" rules={[{ required: true, message: '请输入 DeviceName' }]}>
        <Input placeholder="例如：device-01" />
      </Form.Item>
      <Form.Item name="deviceSecret" label="DeviceSecret" rules={[{ required: true, message: '请输入 DeviceSecret' }]}>
        <Input.Password placeholder="输入设备密钥" />
      </Form.Item>
    </>
  );

  const renderHttpAccessStep = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="HTTP 支持一机一密和一型一密动态注册"
        description="一型一密会先通过产品密钥动态注册换取 DeviceSecret，再继续走现有 HTTP 鉴权接口。"
      />
      <Form.Item name="httpBaseUrl" label="HTTP 服务地址" rules={[{ required: true, message: '请输入 HTTP 服务地址' }]}>
        <Input placeholder="http://localhost:9070" />
      </Form.Item>
      <Form.Item name="productKey" label="ProductKey" rules={[{ required: true, message: '请输入 ProductKey' }]}>
        <Input placeholder="例如：sensor_gateway" />
      </Form.Item>
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
            <Input placeholder="http://localhost:9070" />
          </Form.Item>
          <Form.Item name="productSecret" label="ProductSecret" rules={[{ required: true, message: '请输入 ProductSecret' }]}>
            <Input.Password placeholder="输入产品密钥" />
          </Form.Item>
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
            <Alert type="info" showIcon message="MQTT 口径与平台保持一致" description="一型一密会先走动态注册，一机一密直接使用 DeviceSecret。" />
            <Form.Item name="productKey" label="ProductKey" rules={[{ required: true, message: '请输入 ProductKey' }]}><Input /></Form.Item>
            <Form.Item name="deviceName" label="DeviceName" rules={[{ required: true, message: '请输入 DeviceName' }]}><Input /></Form.Item>
            <Form.Item name="mqttAuthMode" label="认证方式">
              <Radio.Group>
                <Radio.Button value="DEVICE_SECRET">一机一密</Radio.Button>
                <Radio.Button value="PRODUCT_SECRET">一型一密</Radio.Button>
              </Radio.Group>
            </Form.Item>
            {mqttAuthMode === 'PRODUCT_SECRET' ? (
              <>
                <Form.Item name="mqttRegisterBaseUrl" label="动态注册服务地址" rules={[{ required: true, message: '请输入动态注册服务地址' }]}><Input /></Form.Item>
                <Form.Item name="productSecret" label="ProductSecret" rules={[{ required: true, message: '请输入 ProductSecret' }]}><Input.Password /></Form.Item>
              </>
            ) : (
              <Form.Item name="deviceSecret" label="DeviceSecret" rules={[{ required: true, message: '请输入 DeviceSecret' }]}><Input.Password /></Form.Item>
            )}
            <Form.Item name="mqttBrokerUrl" label="MQTT Broker 地址" rules={[{ required: true, message: '请输入 MQTT Broker 地址' }]}><Input /></Form.Item>
          </Space>
        );
      case 'Video':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert type="info" showIcon message="先配置视频模式，再录入对应参数" description="GB28181 的 SIP 与通道配置放在下一步，RTSP 只保留最小必填项。" />
            <Form.Item name="mediaBaseUrl" label="媒体服务地址" rules={[{ required: true, message: '请输入媒体服务地址' }]}><Input /></Form.Item>
            <Form.Item name="streamMode" label="视频模式">
              <Radio.Group>
                <Radio.Button value="GB28181">GB28181</Radio.Button>
                <Radio.Button value="RTSP_PROXY">RTSP 代理</Radio.Button>
              </Radio.Group>
            </Form.Item>
            {streamMode === 'RTSP_PROXY' ? (
              <Form.Item name="rtspUrl" label="RTSP 源地址" rules={[{ required: true, message: '请输入 RTSP 源地址' }]}><Input /></Form.Item>
            ) : (
              <>
                <Form.Item name="gbDeviceId" label="国标设备 ID" rules={[{ required: true, message: '请输入国标设备 ID' }]}><Input /></Form.Item>
                <Form.Item name="gbDomain" label="国标域" rules={[{ required: true, message: '请输入国标域' }]}><Input /></Form.Item>
              </>
            )}
          </Space>
        );
      case 'CoAP':
        return <Space direction="vertical" size={16} style={{ width: '100%' }}>{renderThreeTuple('coapBaseUrl', 'CoAP Bridge 地址')}</Space>;
      case 'SNMP':
        return (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Form.Item name="snmpConnectorUrl" label="Connector 地址" rules={[{ required: true, message: '请输入 Connector 地址' }]}><Input /></Form.Item>
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
            <Form.Item name="modbusConnectorUrl" label="Connector 地址" rules={[{ required: true, message: '请输入 Connector 地址' }]}><Input /></Form.Item>
            <Form.Item name="modbusHost" label="目标主机" rules={[{ required: true, message: '请输入目标主机' }]}><Input /></Form.Item>
            <Row gutter={12}>
              <Col span={8}><Form.Item name="modbusPort" label="端口"><InputNumber min={1} max={65535} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="modbusSlaveId" label="从站 ID"><InputNumber min={1} max={247} style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={8}><Form.Item name="modbusMode" label="模式"><Select options={[{ value: 'TCP', label: 'Modbus TCP' }, { value: 'RTU_OVER_TCP', label: 'RTU over TCP' }]} /></Form.Item></Col>
            </Row>
          </Space>
        );
      case 'WebSocket':
        return <Form.Item name="wsEndpoint" label="WebSocket 地址" rules={[{ required: true, message: '请输入 WebSocket 地址' }]}><Input /></Form.Item>;
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
            <Form.Item name="loraWebhookUrl" label="Webhook 地址" rules={[{ required: true, message: '请输入 Webhook 地址' }]}><Input /></Form.Item>
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
        <Card size="small" title="MQTT 扩展配置" style={{ borderRadius: 16 }}>
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

      {protocol === 'Video' && streamMode === 'GB28181' ? (
        <>
          <Card size="small" title="SIP 配置" style={{ borderRadius: 16 }}>
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
            <Form.Item name="sipPassword" label="SIP 密码"><Input.Password placeholder="留空表示不做 Digest 鉴权" /></Form.Item>
          </Card>
          <Card size="small" title="通道配置" style={{ borderRadius: 16 }}>
            <Form.List name="sipChannels">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Card key={key} size="small" style={{ marginBottom: 12, borderRadius: 12 }} title={`通道 ${name + 1}`} extra={<MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />}>
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
      ) : null}

      {protocol === 'WebSocket' ? (
        <Card size="small" title="WebSocket 连接参数" style={{ borderRadius: 16 }}>
          <Paragraph type="secondary">当前 connector 的 `/ws/device` 仍使用 deviceId、productId、tenantId 建立上下文，因此放在高级配置中维护。</Paragraph>
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
          items={buildSummary(formSnapshot).map((item) => ({
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
      title="新建模拟设备"
      open={open}
      width={720}
      destroyOnClose
      onClose={closeDrawer}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button onClick={closeDrawer}>取消</Button>
          <Space>
            <Button disabled={currentStep === 0} onClick={() => setCurrentStep((prev) => prev - 1)}>上一步</Button>
            {currentStep < STEP_TITLES.length - 1 ? (
              <Button type="primary" onClick={() => void nextStep()}>下一步</Button>
            ) : (
              <Button type="primary" onClick={() => void handleAdd()}>创建设备</Button>
            )}
          </Space>
        </Space>
      }
      styles={{
        header: {
          borderBottom: '1px solid rgba(148,163,184,0.12)',
          background: 'linear-gradient(180deg, rgba(15,23,42,0.94) 0%, rgba(8,15,29,0.98) 100%)',
        },
        body: {
          paddingBottom: 24,
          background: 'linear-gradient(180deg, rgba(11,18,32,0.98) 0%, rgba(15,23,42,0.96) 100%)',
        },
        footer: {
          borderTop: '1px solid rgba(148,163,184,0.12)',
          background: 'linear-gradient(180deg, rgba(8,15,29,0.98) 0%, rgba(4,8,17,1) 100%)',
          padding: '16px 24px',
        },
      }}
    >
      {/* 抽屉关闭时表单会被销毁，这里保留一份快照状态，避免继续监听未挂载的 form 实例。 */}
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onValuesChange={(_changedValues, allValues) => setFormSnapshot(allValues)}
      >
        <Steps
          current={currentStep}
          items={STEP_TITLES.map((title) => ({ title }))}
          style={{ marginBottom: 24 }}
          onChange={(next) => {
            if (next <= currentStep) {
              setCurrentStep(next);
            }
          }}
        />
        {currentStep === 0 ? renderBasicStep() : null}
        {currentStep === 1 ? renderAccessStep() : null}
        {currentStep === 2 ? renderAdvancedStep() : null}
      </Form>
    </Drawer>
  );
}
