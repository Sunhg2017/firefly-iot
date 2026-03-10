import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Card, Button, Space, message, Form, Input, Select, InputNumber, Table, Tag, Tabs,
  Row, Col, Popconfirm, Modal, Descriptions, Empty, Spin,
} from 'antd';
import {
  ApiOutlined, SearchOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, PlayCircleOutlined,
} from '@ant-design/icons';
import { snmpApi, productApi, deviceApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

// 产品和设备选项类型
interface ProductOption {
  id: number;
  productKey: string;
  name: string;
}

interface DeviceOption {
  id: number;
  deviceName: string;
  productId: number;
}

interface SnmpTarget {
  host: string;
  port: number;
  version: number;
  community: string;
  [key: string]: unknown;
}

interface CollectorTask {
  taskId: string;
  target: SnmpTarget;
  oids: string[];
  oidAliases: Record<string, string> | null;
  intervalMs: number;
  tenantId: number | null;
  productId: number | null;
  deviceId: number | null;
  deviceName: string | null;
}

const defaultTarget: SnmpTarget = { host: '', port: 161, version: 2, community: 'public' };

const SnmpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tools');

  // ==================== Tools State ====================
  const [targetForm] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [sysInfo, setSysInfo] = useState<Record<string, string> | null>(null);
  const [sysLoading, setSysLoading] = useState(false);

  // GET/WALK
  const [getOids, setGetOids] = useState('');
  const [getResult, setGetResult] = useState<Record<string, string> | null>(null);
  const [getLoading, setGetLoading] = useState(false);
  const [walkOid, setWalkOid] = useState('');
  const [walkResult, setWalkResult] = useState<Record<string, string> | null>(null);
  const [walkLoading, setWalkLoading] = useState(false);

  // ==================== Collectors State ====================
  const [collectors, setCollectors] = useState<CollectorTask[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [collectorForm] = Form.useForm();

  // ==================== 产品/设备选项 ====================
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceOption[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // 构建设备ID到名称的映射
  const deviceMap = useMemo(() => {
    const map: Record<number, DeviceOption> = {};
    deviceOptions.forEach(d => { map[d.id] = d; });
    return map;
  }, [deviceOptions]);

  // 加载产品列表
  const fetchProducts = useCallback(async () => {
    try {
      const res = await productApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setProductOptions(records.map((p: ProductOption) => ({ id: p.id, productKey: p.productKey, name: p.name })));
    } catch { /* ignore */ }
  }, []);

  // 加载设备列表
  const fetchDevices = useCallback(async () => {
    try {
      const res = await deviceApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      const devices = records.map((d: DeviceOption) => ({ id: d.id, deviceName: d.deviceName, productId: d.productId }));
      setDeviceOptions(devices);
      setFilteredDevices(devices);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProducts(); fetchDevices(); }, [fetchProducts, fetchDevices]);

  // 产品选择变化时，联动筛选设备
  const handleProductChange = (productId: number | null) => {
    setSelectedProductId(productId);
    collectorForm.setFieldValue('deviceId', undefined);
    if (productId) {
      setFilteredDevices(deviceOptions.filter(d => d.productId === productId));
    } else {
      setFilteredDevices(deviceOptions);
    }
  };

  const getTarget = (): SnmpTarget => {
    const vals = targetForm.getFieldsValue();
    return {
      host: vals.host || '',
      port: vals.port || 161,
      version: vals.version || 2,
      community: vals.community || 'public',
    };
  };

  // ==================== Tools Handlers ====================

  const handleTest = async () => {
    const target = getTarget();
    if (!target.host) { message.warning('请输入主机地址'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await snmpApi.test(target);
      setTestResult(res.data.data);
      message.info(res.data.data ? '连接成功' : '连接失败');
    } catch { setTestResult(false); message.error('连接失败'); }
    finally { setTesting(false); }
  };

  const handleSysInfo = async () => {
    const target = getTarget();
    if (!target.host) { message.warning('请输入主机地址'); return; }
    setSysLoading(true);
    setSysInfo(null);
    try {
      const res = await snmpApi.systemInfo(target);
      setSysInfo(res.data.data);
    } catch { message.error('获取系统信息失败'); }
    finally { setSysLoading(false); }
  };

  const handleGet = async () => {
    const target = getTarget();
    if (!target.host || !getOids.trim()) { message.warning('请输入主机和 OID'); return; }
    setGetLoading(true);
    setGetResult(null);
    try {
      const oids = getOids.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
      const res = await snmpApi.get({ target, oids });
      setGetResult(res.data.data);
    } catch { message.error('GET 操作失败'); }
    finally { setGetLoading(false); }
  };

  const handleWalk = async () => {
    const target = getTarget();
    if (!target.host || !walkOid.trim()) { message.warning('请输入主机和根 OID'); return; }
    setWalkLoading(true);
    setWalkResult(null);
    try {
      const res = await snmpApi.walk({ target, rootOid: walkOid.trim() });
      setWalkResult(res.data.data);
    } catch { message.error('WALK 操作失败'); }
    finally { setWalkLoading(false); }
  };

  // ==================== Collectors Handlers ====================

  const fetchCollectors = async () => {
    setCollectorsLoading(true);
    try {
      const res = await snmpApi.listCollectors();
      setCollectors(res.data.data || []);
    } catch { setCollectors([]); }
    finally { setCollectorsLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'collectors') fetchCollectors();
  }, [activeTab]);

  const handleAddCollector = async () => {
    const vals = await collectorForm.validateFields();
    try {
      const oids = (vals.oids as string).split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean);
      let oidAliases: Record<string, string> | null = null;
      if (vals.oidAliases) {
        try { oidAliases = JSON.parse(vals.oidAliases); } catch { /* ignore */ }
      }
      // 从选中的设备获取设备名称
      const selectedDevice = vals.deviceId ? deviceMap[vals.deviceId] : null;
      await snmpApi.registerCollector({
        taskId: vals.taskId,
        target: { host: vals.host, port: vals.port || 161, version: vals.version || 2, community: vals.community || 'public' },
        oids,
        oidAliases,
        intervalMs: vals.intervalMs || 60000,
        tenantId: vals.tenantId || null,
        productId: vals.productId || null,
        deviceId: vals.deviceId || null,
        deviceName: selectedDevice?.deviceName || null,
      });
      message.success('采集任务已注册');
      setModalOpen(false);
      collectorForm.resetFields();
      setSelectedProductId(null);
      setFilteredDevices(deviceOptions);
      fetchCollectors();
    } catch { message.error('注册失败'); }
  };

  const handleRemoveCollector = async (taskId: string) => {
    await snmpApi.unregisterCollector(taskId);
    message.success('已注销');
    fetchCollectors();
  };

  // ==================== Columns ====================

  const collectorColumns: ColumnsType<CollectorTask> = [
    { title: '任务ID', dataIndex: 'taskId', width: 150 },
    { title: '主机', width: 140, render: (_: unknown, r: CollectorTask) => `${r.target.host}:${r.target.port}` },
    { title: '版本', width: 70, render: (_: unknown, r: CollectorTask) => `v${r.target.version === 1 ? '1' : r.target.version === 3 ? '3' : '2c'}` },
    { title: 'OID 数量', width: 90, render: (_: unknown, r: CollectorTask) => r.oids?.length || 0 },
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

  // ==================== Result Table Helper ====================

  const renderOidTable = (data: Record<string, string> | null, loading: boolean) => {
    if (loading) return <Spin style={{ marginTop: 16 }} />;
    if (!data) return null;
    const entries = Object.entries(data);
    if (entries.length === 0) return <Empty description="无数据" style={{ marginTop: 16 }} />;
    return (
      <Table size="small" dataSource={entries.map(([k, v], i) => ({ key: i, oid: k, value: v }))}
        pagination={{ pageSize: 50, showSizeChanger: false }}
        style={{ marginTop: 12 }}
        columns={[
          { title: 'OID', dataIndex: 'oid', width: 280, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
          { title: 'Value', dataIndex: 'value', ellipsis: true },
        ]} />
    );
  };

  return (
    <div>
      <PageHeader title="SNMP 设备接入" description="SNMP 连接测试、数据采集、Trap 监听" />

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
                  <Form.Item label="版本" name="version">
                    <Select style={{ width: 90 }} options={[{ value: 1, label: 'v1' }, { value: 2, label: 'v2c' }, { value: 3, label: 'v3' }]} />
                  </Form.Item>
                  <Form.Item label="Community" name="community">
                    <Input placeholder="public" style={{ width: 130 }} />
                  </Form.Item>
                  <Form.Item>
                    <Space>
                      <Button icon={<CheckCircleOutlined />} onClick={handleTest} loading={testing}>
                        测试连接
                      </Button>
                      <Button icon={<SearchOutlined />} onClick={handleSysInfo} loading={sysLoading}>
                        系统信息
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
                {testResult !== null && (
                  <div style={{ marginTop: 8 }}>
                    {testResult
                      ? <Tag color="success" icon={<CheckCircleOutlined />}>连接成功</Tag>
                      : <Tag color="error" icon={<CloseCircleOutlined />}>连接失败</Tag>}
                  </div>
                )}
                {sysInfo && (
                  <Descriptions size="small" bordered column={2} style={{ marginTop: 12 }}>
                    {Object.entries(sysInfo).map(([k, v]) => (
                      <Descriptions.Item key={k} label={k}>{v}</Descriptions.Item>
                    ))}
                  </Descriptions>
                )}
              </Card>

              {/* SNMP GET */}
              <Row gutter={16}>
                <Col span={12}>
                  <Card title="SNMP GET" style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input placeholder="OID（多个用逗号分隔）如: 1.3.6.1.2.1.1.1.0" value={getOids}
                        onChange={e => setGetOids(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                      <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleGet} loading={getLoading}>GET</Button>
                    </Space.Compact>
                    {renderOidTable(getResult, getLoading)}
                  </Card>
                </Col>
                <Col span={12}>
                  <Card title="SNMP WALK" style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 16 }}>
                    <Space.Compact style={{ width: '100%' }}>
                      <Input placeholder="根 OID 如: 1.3.6.1.2.1.1" value={walkOid}
                        onChange={e => setWalkOid(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />
                      <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleWalk} loading={walkLoading}>WALK</Button>
                    </Space.Compact>
                    {renderOidTable(walkResult, walkLoading)}
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

              <Modal title="注册 SNMP 采集任务" open={modalOpen} onCancel={() => setModalOpen(false)}
                onOk={handleAddCollector} width={600} destroyOnClose>
                <Form form={collectorForm} layout="vertical" style={{ marginTop: 16 }}
                  initialValues={{ port: 161, version: 2, community: 'public', intervalMs: 60000 }}>
                  <Form.Item label="任务ID" name="taskId" rules={[{ required: true }]}>
                    <Input placeholder="唯一标识，如: switch-01-cpu" />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="主机地址" name="host" rules={[{ required: true }]}>
                        <Input placeholder="192.168.1.1" />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label="端口" name="port">
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={6}>
                      <Form.Item label="版本" name="version">
                        <Select options={[{ value: 1, label: 'v1' }, { value: 2, label: 'v2c' }, { value: 3, label: 'v3' }]} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="Community" name="community">
                        <Input placeholder="public" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="采集间隔 (ms)" name="intervalMs">
                        <InputNumber min={5000} step={5000} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="OID 列表" name="oids" rules={[{ required: true }]}
                    extra="多个 OID 用逗号或换行分隔">
                    <Input.TextArea rows={3} placeholder="1.3.6.1.2.1.1.3.0, 1.3.6.1.2.1.2.2.1.10.1" style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  </Form.Item>
                  <Form.Item label="OID 别名映射 (JSON)" name="oidAliases"
                    extra='如: {"1.3.6.1.2.1.1.3.0": "uptime"}'>
                    <Input.TextArea rows={2} placeholder='{"1.3.6.1.2.1.1.3.0": "uptime"}' style={{ fontFamily: 'monospace', fontSize: 12 }} />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item label="关联产品" name="productId">
                        <Select
                          placeholder="可选，选择后筛选设备"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={productOptions.map(p => ({ value: p.id, label: `${p.name} (${p.productKey})` }))}
                          onChange={handleProductChange}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="关联设备" name="deviceId">
                        <Select
                          placeholder="可选，选择设备"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={filteredDevices.map(d => ({ value: d.id, label: d.deviceName }))}
                        />
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

export default SnmpPage;
