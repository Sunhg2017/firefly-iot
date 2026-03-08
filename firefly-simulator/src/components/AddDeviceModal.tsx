import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Switch,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useSimStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
}

const initialValues = {
  protocol: 'HTTP',
  httpBaseUrl: 'http://localhost:9070',
  coapBaseUrl: 'http://localhost:9070',
  mqttAuthMode: 'DEVICE_SECRET',
  mqttRegisterBaseUrl: 'http://localhost:9070',
  mqttBrokerUrl: 'mqtt://localhost:1883',
  mqttClean: true,
  mqttKeepalive: 60,
  mqttWillQos: 1,
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

export default function AddDeviceModal({ open, onClose }: Props) {
  const { addLog } = useSimStore();
  const [form] = Form.useForm();

  const handleAdd = async () => {
    const values = await form.validateFields();
    useSimStore.getState().addDevice(values);
    addLog('system', 'System', 'info', `Added simulated device: ${values.name}`);
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Add Simulated Device"
      open={open}
      onOk={handleAdd}
      onCancel={onClose}
      destroyOnHidden
      width={560}
    >
      <Form form={form} layout="vertical" initialValues={initialValues}>
        <Form.Item name="name" label="Display Name" rules={[{ required: true, message: 'Please enter a display name' }]}>
          <Input placeholder="Temp Sensor 01" />
        </Form.Item>

        <Form.Item name="protocol" label="Protocol">
          <Radio.Group>
            <Radio.Button value="HTTP">HTTP</Radio.Button>
            <Radio.Button value="MQTT">MQTT</Radio.Button>
            <Radio.Button value="CoAP">CoAP</Radio.Button>
            <Radio.Button value="Video">Video</Radio.Button>
            <Radio.Button value="SNMP">SNMP</Radio.Button>
            <Radio.Button value="Modbus">Modbus</Radio.Button>
            <Radio.Button value="WebSocket">WebSocket</Radio.Button>
            <Radio.Button value="TCP">TCP</Radio.Button>
            <Radio.Button value="UDP">UDP</Radio.Button>
            <Radio.Button value="LoRaWAN">LoRaWAN</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.protocol !== cur.protocol || prev.mqttAuthMode !== cur.mqttAuthMode || prev.streamMode !== cur.streamMode}>
          {({ getFieldValue }) => {
            const protocol = getFieldValue('protocol');
            const mqttAuthMode = getFieldValue('mqttAuthMode');
            const streamMode = getFieldValue('streamMode');

            if (protocol === 'MQTT') {
              return (
                <>
                  <Form.Item name="productKey" label="Product Key" rules={[{ required: true, message: 'Product Key is required' }]}>
                    <Input placeholder="pk_demo" />
                  </Form.Item>
                  <Form.Item name="deviceName" label="Device Name" rules={[{ required: true, message: 'Device Name is required' }]}>
                    <Input placeholder="device_001" />
                  </Form.Item>
                  <Form.Item name="mqttAuthMode" label="Auth Mode">
                    <Radio.Group>
                      <Radio.Button value="DEVICE_SECRET">One Device One Secret</Radio.Button>
                      <Radio.Button value="PRODUCT_SECRET">One Type One Secret</Radio.Button>
                    </Radio.Group>
                  </Form.Item>

                  {mqttAuthMode === 'PRODUCT_SECRET' ? (
                    <>
                      <Form.Item
                        name="mqttRegisterBaseUrl"
                        label="Register API Base URL"
                        extra="Used for POST /api/v1/protocol/device/register before MQTT connect."
                      >
                        <Input placeholder="http://localhost:9070" />
                      </Form.Item>
                      <Form.Item name="productSecret" label="Product Secret" rules={[{ required: true, message: 'Product Secret is required' }]}>
                        <Input.Password placeholder="Product Secret for dynamic registration" />
                      </Form.Item>
                    </>
                  ) : (
                    <Form.Item name="deviceSecret" label="Device Secret" rules={[{ required: true, message: 'Device Secret is required' }]}>
                      <Input.Password placeholder="Device Secret for direct MQTT auth" />
                    </Form.Item>
                  )}

                  <Form.Item
                    name="mqttBrokerUrl"
                    label="MQTT Broker URL"
                    extra="Default points to firefly-connector embedded MQTT on port 1883."
                  >
                    <Input placeholder="mqtt://localhost:1883" />
                  </Form.Item>
                  <Form.Item name="mqttClientId" label="Client ID" extra="Leave blank to auto-generate as productKey.deviceName">
                    <Input placeholder="Auto-generated when empty" />
                  </Form.Item>
                  <Form.Item name="mqttUsername" label="Username" extra="Leave blank to auto-generate as deviceName&productKey">
                    <Input placeholder="Auto-generated when empty" />
                  </Form.Item>
                  <Form.Item name="mqttPassword" label="Password" extra="Leave blank to use Device Secret">
                    <Input.Password placeholder="Optional explicit MQTT password" />
                  </Form.Item>

                  <Divider orientation="left" style={{ margin: '8px 0', fontSize: 12 }}>
                    Connection Options
                  </Divider>
                  <Row gutter={8}>
                    <Col span={12}>
                      <Form.Item name="mqttClean" label="Clean Session" valuePropName="checked">
                        <Switch size="small" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="mqttKeepalive" label="Keepalive (sec)">
                        <InputNumber min={10} max={600} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider orientation="left" style={{ margin: '8px 0', fontSize: 12 }}>
                    Last Will
                  </Divider>
                  <Form.Item name="mqttWillTopic" label="Will Topic">
                    <Input placeholder="/device/offline" />
                  </Form.Item>
                  <Form.Item name="mqttWillPayload" label="Will Payload">
                    <Input placeholder='{"status":"offline"}' />
                  </Form.Item>
                  <Row gutter={8}>
                    <Col span={12}>
                      <Form.Item name="mqttWillQos" label="Will QoS">
                        <Select
                          options={[
                            { value: 0, label: 'QoS 0' },
                            { value: 1, label: 'QoS 1' },
                            { value: 2, label: 'QoS 2' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="mqttWillRetain" label="Will Retain" valuePropName="checked">
                        <Switch size="small" />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              );
            }

            if (protocol === 'Video') {
              return (
                <>
                  <Form.Item name="mediaBaseUrl" label="Media Service URL">
                    <Input placeholder="http://localhost:9040" />
                  </Form.Item>
                  <Form.Item name="streamMode" label="Video Mode">
                    <Radio.Group>
                      <Radio.Button value="GB28181">GB28181</Radio.Button>
                      <Radio.Button value="RTSP_PROXY">RTSP Proxy</Radio.Button>
                    </Radio.Group>
                  </Form.Item>

                  {streamMode === 'RTSP_PROXY' ? (
                    <Form.Item name="rtspUrl" label="RTSP Source URL" rules={[{ required: true, message: 'RTSP URL is required' }]}>
                      <Input placeholder="rtsp://admin:pass@192.168.1.100:554/stream1" />
                    </Form.Item>
                  ) : (
                    <>
                      <Form.Item name="gbDeviceId" label="GB28181 Device ID" rules={[{ required: true, message: 'GB28181 Device ID is required' }]}>
                        <Input placeholder="34020000001320000001" />
                      </Form.Item>
                      <Form.Item name="gbDomain" label="GB28181 Domain">
                        <Input placeholder="3402000000" />
                      </Form.Item>

                      <Divider orientation="left" style={{ margin: '8px 0', fontSize: 12 }}>
                        SIP Server
                      </Divider>
                      <Form.Item name="sipServerIp" label="SIP Server IP">
                        <Input placeholder="127.0.0.1" />
                      </Form.Item>
                      <Form.Item name="sipServerPort" label="SIP Server Port">
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="sipServerId" label="SIP Server ID">
                        <Input placeholder="34020000002000000001" />
                      </Form.Item>
                      <Form.Item name="sipLocalPort" label="Local SIP Port">
                        <InputNumber min={1024} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="sipKeepaliveInterval" label="Keepalive Interval (sec)">
                        <InputNumber min={10} max={300} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="sipTransport" label="SIP Transport">
                        <Radio.Group>
                          <Radio.Button value="UDP">UDP</Radio.Button>
                          <Radio.Button value="TCP">TCP</Radio.Button>
                        </Radio.Group>
                      </Form.Item>
                      <Form.Item name="sipPassword" label="SIP Password" extra="Leave blank to skip digest authentication.">
                        <Input.Password placeholder="Optional" />
                      </Form.Item>

                      <Divider orientation="left" style={{ margin: '8px 0', fontSize: 12 }}>
                        SIP Channels
                      </Divider>
                      <Form.List name="sipChannels">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map(({ key, name, ...restField }) => (
                              <Card
                                key={key}
                                size="small"
                                style={{ marginBottom: 8 }}
                                title={`Channel #${name + 1}`}
                                extra={<MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />}
                              >
                                <Row gutter={8}>
                                  <Col span={16}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'channelId']}
                                      label="Channel ID"
                                      rules={[{ required: true, message: 'Channel ID is required' }]}
                                      style={{ marginBottom: 6 }}
                                    >
                                      <Input size="small" placeholder="20-digit channel ID" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={8}>
                                    <Form.Item {...restField} name={[name, 'status']} label="Status" style={{ marginBottom: 6 }}>
                                      <Select size="small" options={[{ value: 'ON', label: 'Online' }, { value: 'OFF', label: 'Offline' }]} />
                                    </Form.Item>
                                  </Col>
                                </Row>
                                <Row gutter={8}>
                                  <Col span={12}>
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'name']}
                                      label="Name"
                                      rules={[{ required: true, message: 'Name is required' }]}
                                      style={{ marginBottom: 6 }}
                                    >
                                      <Input size="small" placeholder="Channel name" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={12}>
                                    <Form.Item {...restField} name={[name, 'ptzType']} label="PTZ Type" style={{ marginBottom: 6 }}>
                                      <Select
                                        size="small"
                                        options={[
                                          { value: 0, label: '0 - Unknown' },
                                          { value: 1, label: '1 - Dome' },
                                          { value: 2, label: '2 - Half Dome' },
                                          { value: 3, label: '3 - Fixed' },
                                        ]}
                                      />
                                    </Form.Item>
                                  </Col>
                                </Row>
                                <Row gutter={8}>
                                  <Col span={12}>
                                    <Form.Item {...restField} name={[name, 'manufacturer']} label="Manufacturer" style={{ marginBottom: 6 }}>
                                      <Input size="small" placeholder="Firefly Simulator" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={12}>
                                    <Form.Item {...restField} name={[name, 'model']} label="Model" style={{ marginBottom: 6 }}>
                                      <Input size="small" placeholder="VCam-1080P" />
                                    </Form.Item>
                                  </Col>
                                </Row>
                                <Row gutter={8}>
                                  <Col span={12}>
                                    <Form.Item {...restField} name={[name, 'longitude']} label="Longitude" style={{ marginBottom: 0 }}>
                                      <InputNumber size="small" step={0.001} style={{ width: '100%' }} placeholder="116.397" />
                                    </Form.Item>
                                  </Col>
                                  <Col span={12}>
                                    <Form.Item {...restField} name={[name, 'latitude']} label="Latitude" style={{ marginBottom: 0 }}>
                                      <InputNumber size="small" step={0.001} style={{ width: '100%' }} placeholder="39.909" />
                                    </Form.Item>
                                  </Col>
                                </Row>
                              </Card>
                            ))}

                            <Button
                              type="dashed"
                              size="small"
                              block
                              icon={<PlusOutlined />}
                              onClick={() => {
                                const gbDeviceId = form.getFieldValue('gbDeviceId') || '34020000001320000001';
                                const index = fields.length + 1;
                                add({
                                  channelId: gbDeviceId.slice(0, 14) + '131' + String(index).padStart(3, '0'),
                                  name: `Channel ${index}`,
                                  manufacturer: 'Firefly Simulator',
                                  model: 'VCam-1080P',
                                  status: 'ON',
                                  ptzType: 1,
                                  longitude: +(116.397 + Math.random() * 0.01).toFixed(6),
                                  latitude: +(39.909 + Math.random() * 0.01).toFixed(6),
                                });
                              }}
                            >
                              Add Channel
                            </Button>
                          </>
                        )}
                      </Form.List>
                    </>
                  )}
                </>
              );
            }

            if (protocol === 'CoAP') {
              return (
                <>
                  <Form.Item name="coapBaseUrl" label="CoAP Bridge URL">
                    <Input placeholder="http://localhost:9070" />
                  </Form.Item>
                  <Form.Item name="productKey" label="Product Key" rules={[{ required: true, message: 'Product Key is required' }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="deviceName" label="Device Name" rules={[{ required: true, message: 'Device Name is required' }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="deviceSecret" label="Device Secret" rules={[{ required: true, message: 'Device Secret is required' }]}>
                    <Input.Password />
                  </Form.Item>
                </>
              );
            }

            if (protocol === 'SNMP') {
              return (
                <>
                  <Form.Item name="snmpConnectorUrl" label="Connector URL">
                    <Input placeholder="http://localhost:9070" />
                  </Form.Item>
                  <Form.Item name="snmpHost" label="SNMP Target Host" rules={[{ required: true, message: 'SNMP target host is required' }]}>
                    <Input placeholder="192.168.1.1" />
                  </Form.Item>
                  <Row gutter={8}>
                    <Col span={8}>
                      <Form.Item name="snmpPort" label="Port">
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="snmpVersion" label="Version">
                        <Select options={[{ value: 1, label: 'v1' }, { value: 2, label: 'v2c' }, { value: 3, label: 'v3' }]} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="snmpCommunity" label="Community">
                        <Input placeholder="public" />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              );
            }

            if (protocol === 'Modbus') {
              return (
                <>
                  <Form.Item name="modbusConnectorUrl" label="Connector URL">
                    <Input placeholder="http://localhost:9070" />
                  </Form.Item>
                  <Form.Item name="modbusHost" label="Modbus Target Host" rules={[{ required: true, message: 'Modbus target host is required' }]}>
                    <Input placeholder="192.168.1.1" />
                  </Form.Item>
                  <Row gutter={8}>
                    <Col span={8}>
                      <Form.Item name="modbusPort" label="Port">
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="modbusSlaveId" label="Slave ID">
                        <InputNumber min={1} max={247} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="modbusMode" label="Mode">
                        <Select options={[{ value: 'TCP', label: 'Modbus TCP' }, { value: 'RTU_OVER_TCP', label: 'RTU over TCP' }]} />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              );
            }

            if (protocol === 'WebSocket') {
              return (
                <>
                  <Form.Item name="wsConnectorUrl" label="Connector REST URL">
                    <Input placeholder="http://localhost:9070" />
                  </Form.Item>
                  <Form.Item name="wsEndpoint" label="WebSocket Endpoint" rules={[{ required: true, message: 'WebSocket endpoint is required' }]}>
                    <Input placeholder="ws://localhost:9070/ws/device" />
                  </Form.Item>
                  <Row gutter={8}>
                    <Col span={8}>
                      <Form.Item name="wsDeviceId" label="Device ID">
                        <Input placeholder="Optional" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="wsProductId" label="Product ID">
                        <Input placeholder="Optional" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="wsTenantId" label="Tenant ID">
                        <Input placeholder="Optional" />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              );
            }

            if (protocol === 'TCP') {
              return (
                <>
                  <Form.Item name="tcpHost" label="TCP Host" rules={[{ required: true, message: 'TCP host is required' }]}>
                    <Input placeholder="localhost" />
                  </Form.Item>
                  <Form.Item name="tcpPort" label="TCP Port">
                    <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              );
            }

            if (protocol === 'UDP') {
              return (
                <>
                  <Form.Item name="udpHost" label="UDP Host" rules={[{ required: true, message: 'UDP host is required' }]}>
                    <Input placeholder="localhost" />
                  </Form.Item>
                  <Form.Item name="udpPort" label="UDP Port">
                    <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              );
            }

            if (protocol === 'LoRaWAN') {
              return (
                <>
                  <Form.Item name="loraWebhookUrl" label="Webhook URL" rules={[{ required: true, message: 'Webhook URL is required' }]}>
                    <Input placeholder="http://localhost:9070/api/v1/lorawan/webhook/up" />
                  </Form.Item>
                  <Form.Item name="loraDevEui" label="DevEUI" rules={[{ required: true, message: 'DevEUI is required' }]}>
                    <Input placeholder="0102030405060708" style={{ fontFamily: 'monospace' }} />
                  </Form.Item>
                  <Form.Item name="loraAppId" label="Application ID">
                    <Input placeholder="Application ID" />
                  </Form.Item>
                  <Form.Item name="loraFPort" label="fPort">
                    <InputNumber min={1} max={255} style={{ width: '100%' }} />
                  </Form.Item>
                </>
              );
            }

            return (
              <>
                <Form.Item name="httpBaseUrl" label="Connector URL">
                  <Input placeholder="http://localhost:9070" />
                </Form.Item>
                <Form.Item name="productKey" label="Product Key" rules={[{ required: true, message: 'Product Key is required' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="deviceName" label="Device Name" rules={[{ required: true, message: 'Device Name is required' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="deviceSecret" label="Device Secret" rules={[{ required: true, message: 'Device Secret is required' }]}>
                  <Input.Password />
                </Form.Item>
              </>
            );
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
}
