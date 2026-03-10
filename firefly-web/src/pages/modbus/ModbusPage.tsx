import React, { useEffect, useState } from 'react';
import {
  Card, Button, Space, message, Form, Input, InputNumber, Select, Table, Tag, Tabs,
  Row, Col, Popconfirm, Modal, Radio, Empty, Spin,
} from 'antd';
import {
  ApiOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, PlayCircleOutlined, EditOutlined, ReadOutlined,
} from '@ant-design/icons';
import { modbusApi, productApi, deviceApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

interface ModbusTarget {
  host: string;
  port: number;
  slaveId: number;
  mode: string;
  [key: string]: unknown;
}

interface RegisterDef {
  alias: string;
  functionCode: number;
  address: number;
  quantity: number;
}

interface CollectorTask {
  taskId: string;
  target: ModbusTarget;
  registers: RegisterDef[];
  intervalMs: number;
  tenantId: number | null;
  productId: number | null;
  deviceId: number | null;
  deviceName: string | null;
}

const defaultTarget: ModbusTarget = { host: '', port: 502, slaveId: 1, mode: 'TCP' };

// 产品和设备选项类型
interface ProductOption {
  id: number;
  productName: string;
}

interface DeviceOption {
  id: number;
  deviceName: string;
  productId?: number;
}

const ModbusPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tools');

  // 产品和设备列表
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // ==================== Tools State ====================
  const [targetForm] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  // Read
  const [readFc, setReadFc] = useState<number>(3);
  const [readAddr, setReadAddr] = useState(0);
  const [readQty, setReadQty] = useState(10);
  const [readResult, setReadResult] = useState<number[] | boolean[] | null>(null);
  const [readLoading, setReadLoading] = useState(false);

  // Write
  const [writeFc, setWriteFc] = useState<number>(6);
  const [writeAddr, setWriteAddr] = useState(0);
  const [writeSingleVal, setWriteSingleVal] = useState(0);
  const [writeMultiVals, setWriteMultiVals] = useState('');
  const [writeLoading, setWriteLoading] = useState(false);

  // ==================== Collectors State ====================
  const [collectors, setCollectors] = useState<CollectorTask[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [collectorForm] = Form.useForm();

  const getTarget = (): ModbusTarget => {
    const vals = targetForm.getFieldsValue();
    return {
      host: vals.host || '',
      port: vals.port || 502,
      slaveId: vals.slaveId || 1,
      mode: vals.mode || 'TCP',
    };
  };

  // ==================== Tools Handlers ====================

  const handleTest = async () => {
    const target = getTarget();
    if (!target.host) { message.warning('请输入主机地址'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await modbusApi.test(target);
      setTestResult(res.data.data);
      message.info(res.data.data ? '连接成功' : '连接失败');
    } catch { setTestResult(false); message.error('连接失败'); }
    finally { setTesting(false); }
  };

  const handleRead = async () => {
    const target = getTarget();
    if (!target.host) { message.warning('请输入主机地址'); return; }
    setReadLoading(true);
    setReadResult(null);
    try {
      const payload = { ...target, address: readAddr, quantity: readQty };
      let res;
      switch (readFc) {
        case 1: res = await modbusApi.readCoils(payload); break;
        case 2: res = await modbusApi.readDiscreteInputs(payload); break;
        case 3: res = await modbusApi.readHoldingRegisters(payload); break;
        case 4: res = await modbusApi.readInputRegisters(payload); break;
        default: return;
      }
      setReadResult(res.data.data);
    } catch { message.error('读取失败'); }
    finally { setReadLoading(false); }
  };

  const handleWrite = async () => {
    const target = getTarget();
    if (!target.host) { message.warning('请输入主机地址'); return; }
    setWriteLoading(true);
    try {
      const base = { ...target, address: writeAddr };
      switch (writeFc) {
        case 5:
          await modbusApi.writeSingleCoil({ ...base, value: writeSingleVal !== 0 });
          break;
        case 6:
          await modbusApi.writeSingleRegister({ ...base, value: writeSingleVal });
          break;
        case 15: {
          const vals = writeMultiVals.split(',').map(v => v.trim() !== '0');
          await modbusApi.writeMultipleCoils({ ...base, values: vals });
          break;
        }
        case 16: {
          const vals = writeMultiVals.split(',').map(v => Number(v.trim()) || 0);
          await modbusApi.writeMultipleRegisters({ ...base, values: vals });
          break;
        }
      }
      message.success('写入成功');
    } catch { message.error('写入失败'); }
    finally { setWriteLoading(false); }
  };

  // ==================== Collectors Handlers ====================

  const fetchCollectors = async () => {
    setCollectorsLoading(true);
    try {
      const res = await modbusApi.listCollectors();
      setCollectors(res.data.data || []);
    } catch { setCollectors([]); }
    finally { setCollectorsLoading(false); }
  };

  // 加载产品和设备列表
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [prodRes, devRes] = await Promise.all([
          productApi.list({ pageSize: 500 }),
          deviceApi.list({ pageSize: 500 }),
        ]);
        const products = (prodRes.data.data?.records || []).map((p: ProductOption) => ({ id: p.id, productName: p.productName }));
        const devices = (devRes.data.data?.records || []).map((d: DeviceOption & { productId?: number }) => ({ 
          id: d.id, deviceName: d.deviceName, productId: d.productId 
        }));
        setProductOptions(products);
        setDeviceOptions(devices);
        setFilteredDevices(devices);
      } catch { /* ignore */ }
    };
    loadOptions();
  }, []);

  useEffect(() => {
    if (activeTab === 'collectors') fetchCollectors();
  }, [activeTab]);

  // 产品选择变化时，联动筛选设备
  const handleProductChange = (productId: number | null) => {
    setSelectedProductId(productId);
    collectorForm.setFieldValue('deviceId', undefined);
    collectorForm.setFieldValue('deviceName', undefined);
    if (productId) {
      setFilteredDevices(deviceOptions.filter(d => d.productId === productId));
    } else {
      setFilteredDevices(deviceOptions);
    }
  };

  // 设备选择变化时，自动填充设备名称
  const handleDeviceChange = (deviceId: number | null) => {
    const device = deviceOptions.find(d => d.id === deviceId);
    if (device) {
      collectorForm.setFieldValue('deviceName', device.deviceName);
    }
  };

  const handleAddCollector = async () => {
    const vals = await collectorForm.validateFields();
    try {
      let registers: RegisterDef[] = [];
      try { registers = JSON.parse(vals.registers); } catch { message.error('寄存器定义 JSON 格式错误'); return; }
      await modbusApi.registerCollector({
        taskId: vals.taskId,
        target: { host: vals.host, port: vals.port || 502, slaveId: vals.slaveId || 1, mode: vals.mode || 'TCP' },
        registers,
        intervalMs: vals.intervalMs || 60000,
        tenantId: vals.tenantId || null,
        productId: vals.productId || null,
        deviceId: vals.deviceId || null,
        deviceName: vals.deviceName || null,
      });
      message.success('采集任务已注册');
      setModalOpen(false);
      collectorForm.resetFields();
      fetchCollectors();
    } catch { message.error('注册失败'); }
  };

  const handleRemoveCollector = async (taskId: string) => {
    await modbusApi.unregisterCollector(taskId);
    message.success('已注销');
    fetchCollectors();
  };

  // ==================== Columns ====================

  const collectorColumns: ColumnsType<CollectorTask> = [
    { title: '任务ID', dataIndex: 'taskId', width: 150 },
    { title: '主机', width: 140, render: (_: unknown, r: CollectorTask) => `${r.target.host}:${r.target.port}` },
    { title: 'Slave ID', width: 80, render: (_: unknown, r: CollectorTask) => r.target.slaveId },
    { title: '模式', width: 100, render: (_: unknown, r: CollectorTask) => <Tag>{r.target.mode}</Tag> },
    { title: '寄存器数', width: 90, render: (_: unknown, r: CollectorTask) => r.registers?.length || 0 },
    { title: '采集间隔', dataIndex: 'intervalMs', width: 100, render: (v: number) => `${(v / 1000).toFixed(0)}s` },
    { title: '设备', width: 140, render: (_: unknown, r: CollectorTask) => r.deviceName || (r.deviceId ? `#${r.deviceId}` : '-') },
    {
      title: '操作', width: 100,
      render: (_: unknown, r: CollectorTask) => (
        <Popconfirm title="确认注销该采集任务？" onConfirm={() => handleRemoveCollector(r.taskId)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>注销</Button>
        </Popconfirm>
      ),
    },
  ];

  // ==================== Read Result Render ====================

  const renderReadResult = () => {
    if (readLoading) return <Spin style={{ marginTop: 16 }} />;
    if (!readResult) return null;
    if (readResult.length === 0) return <Empty description="无数据" style={{ marginTop: 16 }} />;
    const isBoolean = readFc === 1 || readFc === 2;
    return (
      <Table size="small" style={{ marginTop: 12 }}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        dataSource={readResult.map((v, i) => ({ key: i, address: readAddr + i, value: v }))}
        columns={[
          { title: '地址', dataIndex: 'address', width: 100, render: (v: number) => <code style={{ fontSize: 12 }}>{v}</code> },
          {
            title: '值', dataIndex: 'value',
            render: (v: number | boolean) => isBoolean
              ? (v ? <Tag color="success">ON (1)</Tag> : <Tag>OFF (0)</Tag>)
              : <code style={{ fontSize: 12 }}>{v}</code>,
          },
        ]} />
    );
  };

  const isSingleWrite = writeFc === 5 || writeFc === 6;

  const registerTemplate = JSON.stringify([
    { alias: 'temperature', functionCode: 3, address: 0, quantity: 1 },
    { alias: 'humidity', functionCode: 3, address: 1, quantity: 1 },
  ], null, 2);

  return (
    <div>
      <PageHeader title="Modbus 设备接入" description="Modbus TCP 连接测试、寄存器读写、数据采集" />

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'tools', label: '调试工具',
          children: (
            <div>
              {/* Target Config */}
              <Card title={<Space><ApiOutlined /> 目标设备</Space>} style={{ borderRadius: 12, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <Form form={targetForm} layout="inline" initialValues={defaultTarget}>
                  <Form.Item label="主机" name="host" rules={[{ required: true }]}>
                    <Input placeholder="192.168.1.1" style={{ width: 180 }} />
                  </Form.Item>
                  <Form.Item label="端口" name="port">
                    <InputNumber min={1} max={65535} style={{ width: 90 }} />
                  </Form.Item>
                  <Form.Item label="Slave ID" name="slaveId">
                    <InputNumber min={1} max={247} style={{ width: 80 }} />
                  </Form.Item>
                  <Form.Item label="模式" name="mode">
                    <Select style={{ width: 130 }} options={[
                      { value: 'TCP', label: 'Modbus TCP' },
                      { value: 'RTU_OVER_TCP', label: 'RTU over TCP' },
                    ]} />
                  </Form.Item>
                  <Form.Item>
                    <Button icon={<CheckCircleOutlined />} onClick={handleTest} loading={testing}>
                      测试连接
                    </Button>
                  </Form.Item>
                </Form>
                {testResult !== null && (
                  <div style={{ marginTop: 8 }}>
                    {testResult
                      ? <Tag color="success" icon={<CheckCircleOutlined />}>连接成功</Tag>
                      : <Tag color="error" icon={<CloseCircleOutlined />}>连接失败</Tag>}
                  </div>
                )}
              </Card>

              {/* Read / Write */}
              <Row gutter={16}>
                <Col span={12}>
                  <Card title={<Space><ReadOutlined /> 读取寄存器</Space>}
                    style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Radio.Group value={readFc} onChange={e => setReadFc(e.target.value)} size="small">
                        <Radio.Button value={1}>FC01 线圈</Radio.Button>
                        <Radio.Button value={2}>FC02 离散输入</Radio.Button>
                        <Radio.Button value={3}>FC03 保持寄存器</Radio.Button>
                        <Radio.Button value={4}>FC04 输入寄存器</Radio.Button>
                      </Radio.Group>
                      <Row gutter={8}>
                        <Col span={8}>
                          <InputNumber size="small" min={0} max={65535} value={readAddr}
                            onChange={v => setReadAddr(v || 0)} style={{ width: '100%' }} addonBefore="地址" />
                        </Col>
                        <Col span={8}>
                          <InputNumber size="small" min={1} max={125} value={readQty}
                            onChange={v => setReadQty(v || 1)} style={{ width: '100%' }} addonBefore="数量" />
                        </Col>
                        <Col span={8}>
                          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleRead}
                            loading={readLoading} block size="small">读取</Button>
                        </Col>
                      </Row>
                      {renderReadResult()}
                    </Space>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title={<Space><EditOutlined /> 写入寄存器</Space>}
                    style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Radio.Group value={writeFc} onChange={e => setWriteFc(e.target.value)} size="small">
                        <Radio.Button value={5}>FC05 写单线圈</Radio.Button>
                        <Radio.Button value={6}>FC06 写单寄存器</Radio.Button>
                        <Radio.Button value={15}>FC15 写多线圈</Radio.Button>
                        <Radio.Button value={16}>FC16 写多寄存器</Radio.Button>
                      </Radio.Group>
                      <Row gutter={8}>
                        <Col span={8}>
                          <InputNumber size="small" min={0} max={65535} value={writeAddr}
                            onChange={v => setWriteAddr(v || 0)} style={{ width: '100%' }} addonBefore="地址" />
                        </Col>
                        <Col span={isSingleWrite ? 8 : 16}>
                          {isSingleWrite ? (
                            <InputNumber size="small" value={writeSingleVal}
                              onChange={v => setWriteSingleVal(v ?? 0)} style={{ width: '100%' }}
                              addonBefore={writeFc === 5 ? '值(0/1)' : '值'}
                              min={writeFc === 5 ? 0 : -32768} max={writeFc === 5 ? 1 : 65535} />
                          ) : (
                            <Input size="small" value={writeMultiVals}
                              onChange={e => setWriteMultiVals(e.target.value)}
                              placeholder={writeFc === 15 ? '1,0,1,1,0' : '100,200,300'}
                              addonBefore="值" />
                          )}
                        </Col>
                        {isSingleWrite && (
                          <Col span={8}>
                            <Button type="primary" icon={<EditOutlined />} onClick={handleWrite}
                              loading={writeLoading} block size="small">写入</Button>
                          </Col>
                        )}
                      </Row>
                      {!isSingleWrite && (
                        <Button type="primary" icon={<EditOutlined />} onClick={handleWrite}
                          loading={writeLoading} size="small">写入</Button>
                      )}
                    </Space>
                  </Card>
                </Col>
              </Row>
            </div>
          ),
        },
        {
          key: 'collectors', label: '采集任务',
          children: (
            <div>
              <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                extra={
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchCollectors}>刷新</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { collectorForm.resetFields(); setModalOpen(true); }}>
                      注册采集
                    </Button>
                  </Space>
                }>
                <Table rowKey="taskId" columns={collectorColumns} dataSource={collectors} loading={collectorsLoading}
                  size="small" pagination={false} />
              </Card>

              <Modal title="注册 Modbus 采集任务" open={modalOpen} onCancel={() => setModalOpen(false)}
                onOk={handleAddCollector} width={640} destroyOnClose>
                <Form form={collectorForm} layout="vertical" style={{ marginTop: 16 }}
                  initialValues={{ port: 502, slaveId: 1, mode: 'TCP', intervalMs: 60000 }}>
                  <Form.Item label="任务ID" name="taskId" rules={[{ required: true }]}>
                    <Input placeholder="唯一标识，如: plc-01-temps" />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item label="主机地址" name="host" rules={[{ required: true }]}>
                        <Input placeholder="192.168.1.1" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item label="端口" name="port">
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item label="Slave ID" name="slaveId">
                        <InputNumber min={1} max={247} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="模式" name="mode">
                        <Select options={[
                          { value: 'TCP', label: 'Modbus TCP' },
                          { value: 'RTU_OVER_TCP', label: 'RTU over TCP' },
                        ]} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="采集间隔 (ms)" name="intervalMs">
                    <InputNumber min={5000} step={5000} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item label="寄存器定义 (JSON 数组)" name="registers" rules={[{ required: true }]}
                    extra="每项: { alias, functionCode (3=保持/4=输入), address, quantity }">
                    <Input.TextArea rows={5} placeholder={registerTemplate}
                      style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item label="关联产品" name="productId">
                        <Select
                          placeholder="请选择产品"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={productOptions.map(p => ({ value: p.id, label: p.productName }))}
                          onChange={handleProductChange}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="关联设备" name="deviceId">
                        <Select
                          placeholder="请选择设备"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={filteredDevices.map(d => ({ value: d.id, label: d.deviceName }))}
                          onChange={handleDeviceChange}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="设备名称" name="deviceName">
                        <Input placeholder="选择设备后自动填充" disabled />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              </Modal>
            </div>
          ),
        },
      ]} />
    </div>
  );
};

export default ModbusPage;
