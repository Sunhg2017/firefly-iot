import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReadOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import { deviceApi, modbusApi, productApi } from '../../services/api';

interface ModbusTarget {
  host: string;
  port: number;
  slaveId: number;
  mode: 'TCP' | 'RTU_OVER_TCP' | string;
  [key: string]: unknown;
}

interface RegisterDef {
  alias: string;
  functionCode: number;
  address: number;
  quantity: number;
}

interface ProductOption {
  id: number;
  productKey: string;
  name: string;
}

interface DeviceOption {
  id: number;
  deviceName: string;
  nickname?: string;
  productId: number;
}

interface CollectorTask {
  taskId: string;
  target: ModbusTarget;
  registers: RegisterDef[];
  intervalMs: number;
  productId: number | null;
  deviceId: number | null;
  deviceName: string | null;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: 'none',
  boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
};

const defaultTarget: ModbusTarget = {
  host: '',
  port: 502,
  slaveId: 1,
  mode: 'TCP',
};

const registerTemplate = JSON.stringify(
  [
    { alias: 'temperature', functionCode: 3, address: 0, quantity: 1 },
    { alias: 'humidity', functionCode: 3, address: 1, quantity: 1 },
  ],
  null,
  2,
);

const ModbusPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tools');
  const [targetForm] = Form.useForm();
  const [collectorForm] = Form.useForm();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const [readFc, setReadFc] = useState(3);
  const [readAddr, setReadAddr] = useState(0);
  const [readQty, setReadQty] = useState(10);
  const [readResult, setReadResult] = useState<number[] | boolean[] | null>(null);
  const [readLoading, setReadLoading] = useState(false);

  const [writeFc, setWriteFc] = useState(6);
  const [writeAddr, setWriteAddr] = useState(0);
  const [writeSingleValue, setWriteSingleValue] = useState(0);
  const [writeMultiValues, setWriteMultiValues] = useState('');
  const [writeLoading, setWriteLoading] = useState(false);

  const [collectors, setCollectors] = useState<CollectorTask[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceOption[]>([]);

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
  const deviceMap = useMemo(() => new Map(devices.map((item) => [item.id, item])), [devices]);

  const fetchContextOptions = useCallback(async () => {
    try {
      const [productRes, deviceRes] = await Promise.all([
        productApi.list({ pageNum: 1, pageSize: 500 }),
        deviceApi.list({ pageNum: 1, pageSize: 500 }),
      ]);

      const productRecords = productRes.data?.data?.records ?? [];
      const deviceRecords = deviceRes.data?.data?.records ?? [];

      const nextProducts = productRecords.map((item: ProductOption) => ({
        id: item.id,
        productKey: item.productKey,
        name: item.name,
      }));
      const nextDevices = deviceRecords.map((item: DeviceOption) => ({
        id: item.id,
        deviceName: item.deviceName,
        nickname: item.nickname,
        productId: item.productId,
      }));

      setProducts(nextProducts);
      setDevices(nextDevices);
      setFilteredDevices(nextDevices);
    } catch {
      setProducts([]);
      setDevices([]);
      setFilteredDevices([]);
    }
  }, []);

  useEffect(() => {
    void fetchContextOptions();
  }, [fetchContextOptions]);

  const fetchCollectors = useCallback(async () => {
    setCollectorsLoading(true);
    try {
      const res = await modbusApi.listCollectors();
      setCollectors(res.data?.data ?? []);
    } catch {
      setCollectors([]);
    } finally {
      setCollectorsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'collectors') {
      void fetchCollectors();
    }
  }, [activeTab, fetchCollectors]);

  const getTarget = (): ModbusTarget => {
    const values = targetForm.getFieldsValue();
    return {
      host: values.host || '',
      port: values.port || 502,
      slaveId: values.slaveId || 1,
      mode: values.mode || 'TCP',
    };
  };

  const handleProductChange = (productId?: number) => {
    collectorForm.setFieldValue('deviceId', undefined);
    if (productId) {
      setFilteredDevices(devices.filter((item) => item.productId === productId));
      return;
    }
    setFilteredDevices(devices);
  };

  const handleDeviceChange = (deviceId?: number) => {
    const device = deviceId ? deviceMap.get(deviceId) : undefined;
    collectorForm.setFieldValue('deviceName', device?.deviceName || undefined);
  };

  const handleTest = async () => {
    const target = getTarget();
    if (!target.host) {
      message.warning('请输入目标主机地址');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await modbusApi.test(target);
      const success = Boolean(res.data?.data);
      setTestResult(success);
      message[success ? 'success' : 'error'](success ? '连接成功' : '连接失败');
    } catch {
      setTestResult(false);
      message.error('连接失败');
    } finally {
      setTesting(false);
    }
  };

  const handleRead = async () => {
    const target = getTarget();
    if (!target.host) {
      message.warning('请输入目标主机地址');
      return;
    }

    setReadLoading(true);
    setReadResult(null);
    try {
      const payload = { ...target, address: readAddr, quantity: readQty };
      let res;

      switch (readFc) {
        case 1:
          res = await modbusApi.readCoils(payload);
          break;
        case 2:
          res = await modbusApi.readDiscreteInputs(payload);
          break;
        case 3:
          res = await modbusApi.readHoldingRegisters(payload);
          break;
        case 4:
          res = await modbusApi.readInputRegisters(payload);
          break;
        default:
          res = { data: { data: [] } };
      }

      setReadResult(res.data?.data ?? []);
    } catch {
      message.error('读取寄存器失败');
    } finally {
      setReadLoading(false);
    }
  };

  const handleWrite = async () => {
    const target = getTarget();
    if (!target.host) {
      message.warning('请输入目标主机地址');
      return;
    }

    setWriteLoading(true);
    try {
      const payload = { ...target, address: writeAddr };
      switch (writeFc) {
        case 5:
          await modbusApi.writeSingleCoil({ ...payload, value: writeSingleValue !== 0 });
          break;
        case 6:
          await modbusApi.writeSingleRegister({ ...payload, value: writeSingleValue });
          break;
        case 15:
          await modbusApi.writeMultipleCoils({
            ...payload,
            values: writeMultiValues.split(',').map((item) => item.trim() !== '0'),
          });
          break;
        case 16:
          await modbusApi.writeMultipleRegisters({
            ...payload,
            values: writeMultiValues.split(',').map((item) => Number(item.trim()) || 0),
          });
          break;
        default:
          break;
      }
      message.success('写入成功');
    } catch {
      message.error('写入失败');
    } finally {
      setWriteLoading(false);
    }
  };

  const handleAddCollector = async () => {
    try {
      const values = await collectorForm.validateFields();
      let registers: RegisterDef[] = [];
      try {
        registers = JSON.parse(values.registers);
      } catch {
        message.error('寄存器定义必须是合法的 JSON');
        return;
      }

      const selectedDevice = values.deviceId ? deviceMap.get(values.deviceId) : undefined;

      await modbusApi.registerCollector({
        taskId: values.taskId,
        target: {
          host: values.host,
          port: values.port || 502,
          slaveId: values.slaveId || 1,
          mode: values.mode || 'TCP',
        },
        registers,
        intervalMs: values.intervalMs || 60000,
        productId: values.productId || null,
        deviceId: values.deviceId || null,
        deviceName: selectedDevice?.deviceName || values.deviceName || null,
      });

      message.success('采集任务注册成功');
      setDrawerOpen(false);
      collectorForm.resetFields();
      setFilteredDevices(devices);
      void fetchCollectors();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error('采集任务注册失败');
    }
  };

  const handleRemoveCollector = async (taskId: string) => {
    try {
      await modbusApi.unregisterCollector(taskId);
      message.success('采集任务已移除');
      void fetchCollectors();
    } catch {
      message.error('移除采集任务失败');
    }
  };

  const renderReadResult = () => {
    if (readLoading) {
      return <Spin style={{ marginTop: 16 }} />;
    }
    if (!readResult) {
      return null;
    }
    if (readResult.length === 0) {
      return <Empty style={{ marginTop: 16 }} description="暂无返回数据" />;
    }

    const isBooleanValue = readFc === 1 || readFc === 2;
    return (
      <Table
        size="small"
        style={{ marginTop: 12 }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        rowKey="address"
        dataSource={readResult.map((value, index) => ({
          address: readAddr + index,
          value,
        }))}
        columns={[
          {
            title: '地址',
            dataIndex: 'address',
            width: 100,
            render: (value: number) => <code>{value}</code>,
          },
          {
            title: '值',
            dataIndex: 'value',
            render: (value: number | boolean) => (
              isBooleanValue ? (
                value ? <Tag color="success">ON (1)</Tag> : <Tag>OFF (0)</Tag>
              ) : (
                <code>{String(value)}</code>
              )
            ),
          },
        ]}
      />
    );
  };

  const collectorColumns: ColumnsType<CollectorTask> = [
    {
      title: '任务标识',
      dataIndex: 'taskId',
      width: 160,
      render: (value: string) => <code>{value}</code>,
    },
    {
      title: '目标连接',
      width: 220,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{record.target.host}:{record.target.port}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Slave ID {record.target.slaveId} / {record.target.mode}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '关联产品',
      width: 220,
      render: (_value, record) => {
        const product = record.productId ? productMap.get(record.productId) : undefined;
        if (!product) {
          return <Typography.Text type="secondary">未关联</Typography.Text>;
        }
        return (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{product.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {product.productKey}
            </Typography.Text>
          </Space>
        );
      },
    },
    {
      title: '关联设备',
      width: 180,
      render: (_value, record) => {
        const device = record.deviceId ? deviceMap.get(record.deviceId) : undefined;
        const label = device?.nickname || record.deviceName || device?.deviceName;
        return label ? (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{label}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {device?.deviceName || record.deviceName}
            </Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="secondary">未关联</Typography.Text>
        );
      },
    },
    {
      title: '寄存器项数',
      width: 100,
      render: (_value, record) => record.registers?.length ?? 0,
    },
    {
      title: '采集周期',
      dataIndex: 'intervalMs',
      width: 100,
      render: (value: number) => `${Math.round(value / 1000)} 秒`,
    },
    {
      title: '操作',
      width: 100,
      render: (_value, record) => (
        <Popconfirm title="确认移除该采集任务？" onConfirm={() => void handleRemoveCollector(record.taskId)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const isSingleWrite = writeFc === 5 || writeFc === 6;

  return (
    <div>
      <PageHeader
        title="Modbus 接入"
        description="先配置目标设备，再执行读写调试或维护采集任务。"
      />

      <ProtocolAccessGuide
        title="先调试，再绑定采集上下文"
        description="只做寄存器调试可直接使用工具；需要进入设备链路时再把采集任务绑定到产品和设备。"
        endpoint="502 / TCP"
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'tools',
            label: '调试工具',
            children: (
              <>
                <Card title={<Space><ApiOutlined />目标设备</Space>} style={{ ...cardStyle, marginBottom: 16 }}>
                  <Form form={targetForm} layout="inline" initialValues={defaultTarget}>
                    <Form.Item label="主机地址" name="host" rules={[{ required: true, message: '请输入主机地址' }]}>
                      <Input placeholder="192.168.1.1" style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item label="端口" name="port">
                      <InputNumber min={1} max={65535} style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item label="Slave ID" name="slaveId">
                      <InputNumber min={1} max={247} style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item label="模式" name="mode">
                      <Select
                        style={{ width: 150 }}
                        options={[
                          { value: 'TCP', label: 'Modbus TCP' },
                          { value: 'RTU_OVER_TCP', label: 'RTU over TCP' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item>
                      <Button icon={<CheckCircleOutlined />} loading={testing} onClick={() => void handleTest()}>
                        测试连接
                      </Button>
                    </Form.Item>
                  </Form>

                  {testResult !== null ? (
                    <div style={{ marginTop: 12 }}>
                      {testResult ? (
                        <Tag color="success" icon={<CheckCircleOutlined />}>连接成功</Tag>
                      ) : (
                        <Tag color="error" icon={<CloseCircleOutlined />}>连接失败</Tag>
                      )}
                    </div>
                  ) : null}
                </Card>

                <Row gutter={16}>
                  <Col xs={24} xl={12}>
                    <Card title={<Space><ReadOutlined />读取寄存器</Space>} style={{ ...cardStyle, marginBottom: 16 }}>
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Radio.Group value={readFc} onChange={(event) => setReadFc(event.target.value)} size="small">
                          <Radio.Button value={1}>FC01 线圈</Radio.Button>
                          <Radio.Button value={2}>FC02 离散输入</Radio.Button>
                          <Radio.Button value={3}>FC03 保持寄存器</Radio.Button>
                          <Radio.Button value={4}>FC04 输入寄存器</Radio.Button>
                        </Radio.Group>
                        <Row gutter={8}>
                          <Col span={8}>
                            <InputNumber
                              min={0}
                              max={65535}
                              style={{ width: '100%' }}
                              addonBefore="地址"
                              value={readAddr}
                              onChange={(value) => setReadAddr(value || 0)}
                            />
                          </Col>
                          <Col span={8}>
                            <InputNumber
                              min={1}
                              max={125}
                              style={{ width: '100%' }}
                              addonBefore="数量"
                              value={readQty}
                              onChange={(value) => setReadQty(value || 1)}
                            />
                          </Col>
                          <Col span={8}>
                            <Button type="primary" block icon={<PlayCircleOutlined />} loading={readLoading} onClick={() => void handleRead()}>
                              读取
                            </Button>
                          </Col>
                        </Row>
                        {renderReadResult()}
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card title={<Space><EditOutlined />写入寄存器</Space>} style={{ ...cardStyle, marginBottom: 16 }}>
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Radio.Group value={writeFc} onChange={(event) => setWriteFc(event.target.value)} size="small">
                          <Radio.Button value={5}>FC05 单线圈</Radio.Button>
                          <Radio.Button value={6}>FC06 单寄存器</Radio.Button>
                          <Radio.Button value={15}>FC15 多线圈</Radio.Button>
                          <Radio.Button value={16}>FC16 多寄存器</Radio.Button>
                        </Radio.Group>

                        <Row gutter={8}>
                          <Col span={8}>
                            <InputNumber
                              min={0}
                              max={65535}
                              style={{ width: '100%' }}
                              addonBefore="地址"
                              value={writeAddr}
                              onChange={(value) => setWriteAddr(value || 0)}
                            />
                          </Col>
                          <Col span={isSingleWrite ? 8 : 16}>
                            {isSingleWrite ? (
                              <InputNumber
                                style={{ width: '100%' }}
                                addonBefore={writeFc === 5 ? '值(0/1)' : '值'}
                                value={writeSingleValue}
                                onChange={(value) => setWriteSingleValue(value ?? 0)}
                                min={writeFc === 5 ? 0 : -32768}
                                max={writeFc === 5 ? 1 : 65535}
                              />
                            ) : (
                              <Input
                                addonBefore="值列表"
                                value={writeMultiValues}
                                onChange={(event) => setWriteMultiValues(event.target.value)}
                                placeholder={writeFc === 15 ? '1,0,1,1' : '100,200,300'}
                              />
                            )}
                          </Col>
                          {isSingleWrite ? (
                            <Col span={8}>
                              <Button type="primary" block icon={<EditOutlined />} loading={writeLoading} onClick={() => void handleWrite()}>
                                写入
                              </Button>
                            </Col>
                          ) : null}
                        </Row>

                        {!isSingleWrite ? (
                          <Button type="primary" icon={<EditOutlined />} loading={writeLoading} onClick={() => void handleWrite()}>
                            写入
                          </Button>
                        ) : null}
                      </Space>
                    </Card>
                  </Col>
                </Row>
              </>
            ),
          },
          {
            key: 'collectors',
            label: '采集任务',
            children: (
              <Card
                style={cardStyle}
                extra={
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={() => void fetchCollectors()}>
                      刷新
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        collectorForm.resetFields();
                        setFilteredDevices(devices);
                        setDrawerOpen(true);
                      }}
                    >
                      新建采集任务
                    </Button>
                  </Space>
                }
              >
                <Alert
                  showIcon
                  type="info"
                  style={{ marginBottom: 16 }}
                  message="采集任务说明"
                  description="采集任务绑定到产品和设备后，寄存器数据会按设备链路归集，便于在设备管理、规则引擎和消息通知中直接复用。"
                />
                <Table<CollectorTask>
                  rowKey="taskId"
                  columns={collectorColumns}
                  dataSource={collectors}
                  loading={collectorsLoading}
                  scroll={{ x: 1080 }}
                  pagination={false}
                  locale={{ emptyText: '暂无采集任务' }}
                />
              </Card>
            ),
          },
        ]}
      />

      <Drawer
        destroyOnClose
        title="新建 Modbus 采集任务"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={860}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={() => void handleAddCollector()}>
              保存任务
            </Button>
          </Space>
        }
      >
        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16 }}
          message="寄存器定义说明"
          description="一个采集任务可以定义多组寄存器。建议别名(alias)直接对应产品物模型字段，后续更容易串联设备数据和告警规则。"
        />

        <Form
          form={collectorForm}
          layout="vertical"
          initialValues={{ port: 502, slaveId: 1, mode: 'TCP', intervalMs: 60000 }}
        >
          <Form.Item
            name="taskId"
            label="任务标识"
            rules={[{ required: true, message: '请输入任务标识' }]}
            extra="建议使用业务含义明确的编码，例如 plc-01-env。"
          >
            <Input placeholder="plc-01-env" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="host" label="目标主机" rules={[{ required: true, message: '请输入目标主机' }]}>
                <Input placeholder="192.168.1.1" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="port" label="端口">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="slaveId" label="Slave ID">
                <InputNumber min={1} max={247} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="mode" label="模式">
                <Select
                  options={[
                    { value: 'TCP', label: 'Modbus TCP' },
                    { value: 'RTU_OVER_TCP', label: 'RTU over TCP' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="intervalMs" label="采集周期 (ms)">
            <InputNumber min={5000} step={5000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="registers"
            label="寄存器定义 (JSON 数组)"
            rules={[{ required: true, message: '请输入寄存器定义' }]}
            extra="每一项需要包含 alias、functionCode、address、quantity。"
          >
            <Input.TextArea rows={8} placeholder={registerTemplate} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="productId" label="关联产品">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="可选，按产品归档寄存器数据"
                  options={products.map((item) => ({
                    value: item.id,
                    label: `${item.name} (${item.productKey})`,
                  }))}
                  onChange={handleProductChange}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="deviceId" label="关联设备">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="可选，绑定到具体设备"
                  options={filteredDevices.map((item) => ({
                    value: item.id,
                    label: item.nickname ? `${item.nickname} (${item.deviceName})` : item.deviceName,
                  }))}
                  onChange={handleDeviceChange}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="deviceName" label="设备名称">
                <Input disabled placeholder="选择设备后自动回填" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  );
};

export default ModbusPage;
