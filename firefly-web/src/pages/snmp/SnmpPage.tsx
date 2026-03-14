import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
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
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import { deviceApi, productApi, snmpApi } from '../../services/api';

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
  productId: number | null;
  deviceId: number | null;
  deviceName: string | null;
}

const cardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: 'none',
  boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
};

const defaultTarget: SnmpTarget = {
  host: '',
  port: 161,
  version: 2,
  community: 'public',
};

const SnmpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tools');
  const [targetForm] = Form.useForm();
  const [collectorForm] = Form.useForm();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [systemInfo, setSystemInfo] = useState<Record<string, string> | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);

  const [getOids, setGetOids] = useState('');
  const [getResult, setGetResult] = useState<Record<string, string> | null>(null);
  const [getLoading, setGetLoading] = useState(false);

  const [walkOid, setWalkOid] = useState('');
  const [walkResult, setWalkResult] = useState<Record<string, string> | null>(null);
  const [walkLoading, setWalkLoading] = useState(false);

  const [collectors, setCollectors] = useState<CollectorTask[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<DeviceOption[]>([]);

  const productMap = useMemo(
    () => new Map(products.map((item) => [item.id, item])),
    [products],
  );

  const deviceMap = useMemo(
    () => new Map(devices.map((item) => [item.id, item])),
    [devices],
  );

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
      const res = await snmpApi.listCollectors();
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

  const getTarget = (): SnmpTarget => {
    const values = targetForm.getFieldsValue();
    return {
      host: values.host || '',
      port: values.port || 161,
      version: values.version || 2,
      community: values.community || 'public',
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

  const handleTest = async () => {
    const target = getTarget();
    if (!target.host) {
      message.warning('请输入目标主机地址');
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await snmpApi.test(target);
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

  const handleLoadSystemInfo = async () => {
    const target = getTarget();
    if (!target.host) {
      message.warning('请输入目标主机地址');
      return;
    }

    setSystemLoading(true);
    setSystemInfo(null);
    try {
      const res = await snmpApi.systemInfo(target);
      setSystemInfo(res.data?.data ?? null);
    } catch {
      message.error('获取系统信息失败');
    } finally {
      setSystemLoading(false);
    }
  };

  const handleGet = async () => {
    const target = getTarget();
    if (!target.host || !getOids.trim()) {
      message.warning('请输入目标主机和 OID');
      return;
    }

    setGetLoading(true);
    setGetResult(null);
    try {
      const oids = getOids.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
      const res = await snmpApi.get({ target, oids });
      setGetResult(res.data?.data ?? {});
    } catch {
      message.error('SNMP GET 失败');
    } finally {
      setGetLoading(false);
    }
  };

  const handleWalk = async () => {
    const target = getTarget();
    if (!target.host || !walkOid.trim()) {
      message.warning('请输入目标主机和根 OID');
      return;
    }

    setWalkLoading(true);
    setWalkResult(null);
    try {
      const res = await snmpApi.walk({ target, rootOid: walkOid.trim() });
      setWalkResult(res.data?.data ?? {});
    } catch {
      message.error('SNMP WALK 失败');
    } finally {
      setWalkLoading(false);
    }
  };

  const handleAddCollector = async () => {
    try {
      const values = await collectorForm.validateFields();
      const oids = (values.oids as string).split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
      const selectedDevice = values.deviceId ? deviceMap.get(values.deviceId) : undefined;
      let oidAliases: Record<string, string> | null = null;

      if (values.oidAliases?.trim()) {
        try {
          oidAliases = JSON.parse(values.oidAliases);
        } catch {
          message.error('OID 别名必须是合法的 JSON');
          return;
        }
      }

      await snmpApi.registerCollector({
        taskId: values.taskId,
        target: {
          host: values.host,
          port: values.port || 161,
          version: values.version || 2,
          community: values.community || 'public',
        },
        oids,
        oidAliases,
        intervalMs: values.intervalMs || 60000,
        productId: values.productId || null,
        deviceId: values.deviceId || null,
        deviceName: selectedDevice?.deviceName || null,
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
      await snmpApi.unregisterCollector(taskId);
      message.success('采集任务已移除');
      void fetchCollectors();
    } catch {
      message.error('移除采集任务失败');
    }
  };

  const renderResultTable = (data: Record<string, string> | null, loading: boolean) => {
    if (loading) {
      return <Spin style={{ marginTop: 16 }} />;
    }
    if (!data) {
      return null;
    }
    const rows = Object.entries(data);
    if (rows.length === 0) {
      return <Empty style={{ marginTop: 16 }} description="暂无返回数据" />;
    }

    return (
      <Table
        size="small"
        style={{ marginTop: 12 }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        rowKey="oid"
        dataSource={rows.map(([oid, value]) => ({ oid, value }))}
        columns={[
          {
            title: 'OID',
            dataIndex: 'oid',
            width: 280,
            render: (value: string) => <code>{value}</code>,
          },
          {
            title: '值',
            dataIndex: 'value',
            render: (value: string) => <Typography.Text>{value}</Typography.Text>,
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
      title: '目标主机',
      width: 180,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{record.target.host}:{record.target.port}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            SNMP {record.target.version === 2 ? 'v2c' : `v${record.target.version}`}
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
        const deviceLabel = device?.nickname || record.deviceName || device?.deviceName;
        return deviceLabel ? (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{deviceLabel}</Typography.Text>
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
      title: 'OID 数量',
      width: 100,
      render: (_value, record) => record.oids?.length ?? 0,
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
        <Popconfirm
          title="确认移除该采集任务？"
          onConfirm={() => void handleRemoveCollector(record.taskId)}
        >
          <Button type="link" danger size="small" icon={<DeleteOutlined />}>
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="SNMP 接入"
        description="用于网络设备连通性调试、OID 读取和轮询采集任务维护。"
      />

      <ProtocolAccessGuide
        title="先建立产品上下文，再做 SNMP 调试和采集"
        description="如果采集结果需要进入设备数据、规则告警和设备影子链路，建议先在产品接入中定义产品，再把采集任务绑定到设备。"
        endpoint="161 / UDP"
        tips={['适合交换机、路由器、UPS 等设备', '支持先调试后落采集', '采集任务可关联产品和设备']}
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
                    <Form.Item label="版本" name="version">
                      <Select
                        style={{ width: 110 }}
                        options={[
                          { value: 1, label: 'v1' },
                          { value: 2, label: 'v2c' },
                          { value: 3, label: 'v3' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="Community" name="community">
                      <Input placeholder="public" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item>
                      <Space>
                        <Button icon={<CheckCircleOutlined />} loading={testing} onClick={() => void handleTest()}>
                          测试连接
                        </Button>
                        <Button icon={<SearchOutlined />} loading={systemLoading} onClick={() => void handleLoadSystemInfo()}>
                          系统信息
                        </Button>
                      </Space>
                    </Form.Item>
                  </Form>

                  {testResult !== null ? (
                    <div style={{ marginTop: 12 }}>
                      {testResult ? (
                        <Tag color="success" icon={<CheckCircleOutlined />}>
                          连接成功
                        </Tag>
                      ) : (
                        <Tag color="error" icon={<CloseCircleOutlined />}>
                          连接失败
                        </Tag>
                      )}
                    </div>
                  ) : null}

                  {systemInfo ? (
                    <Descriptions bordered size="small" column={2} style={{ marginTop: 12 }}>
                      {Object.entries(systemInfo).map(([key, value]) => (
                        <Descriptions.Item key={key} label={key}>
                          {value}
                        </Descriptions.Item>
                      ))}
                    </Descriptions>
                  ) : null}
                </Card>

                <Row gutter={16}>
                  <Col xs={24} xl={12}>
                    <Card title="SNMP GET" style={{ ...cardStyle, marginBottom: 16 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <Input
                          value={getOids}
                          placeholder="多个 OID 用逗号、分号或换行分隔"
                          onChange={(event) => setGetOids(event.target.value)}
                          style={{ fontFamily: 'monospace' }}
                        />
                        <Button type="primary" icon={<PlayCircleOutlined />} loading={getLoading} onClick={() => void handleGet()}>
                          读取
                        </Button>
                      </Space.Compact>
                      {renderResultTable(getResult, getLoading)}
                    </Card>
                  </Col>
                  <Col xs={24} xl={12}>
                    <Card title="SNMP WALK" style={{ ...cardStyle, marginBottom: 16 }}>
                      <Space.Compact style={{ width: '100%' }}>
                        <Input
                          value={walkOid}
                          placeholder="输入根 OID，例如 1.3.6.1.2.1.1"
                          onChange={(event) => setWalkOid(event.target.value)}
                          style={{ fontFamily: 'monospace' }}
                        />
                        <Button type="primary" icon={<PlayCircleOutlined />} loading={walkLoading} onClick={() => void handleWalk()}>
                          遍历
                        </Button>
                      </Space.Compact>
                      {renderResultTable(walkResult, walkLoading)}
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
                  description="仅做连通性调试时可以不绑定产品和设备；如果希望采集数据进入设备管理、规则告警和数据分析链路，建议补充产品和设备关联。"
                />
                <Table<CollectorTask>
                  rowKey="taskId"
                  columns={collectorColumns}
                  dataSource={collectors}
                  loading={collectorsLoading}
                  scroll={{ x: 1000 }}
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
        title="新建 SNMP 采集任务"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={820}
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
          message="上下文绑定建议"
          description="采集任务绑定产品后，平台能按产品口径归档数据；继续绑定到设备后，采集数据可以直接用于设备画像、规则计算和后续通知。"
        />

        <Form
          form={collectorForm}
          layout="vertical"
          initialValues={{ port: 161, version: 2, community: 'public', intervalMs: 60000 }}
        >
          <Form.Item
            name="taskId"
            label="任务标识"
            rules={[{ required: true, message: '请输入任务标识' }]}
            extra="建议使用业务含义明确的编码，例如 switch-01-traffic。"
          >
            <Input placeholder="switch-01-traffic" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="host" label="目标主机" rules={[{ required: true, message: '请输入目标主机' }]}>
                <Input placeholder="192.168.1.1" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="port" label="端口">
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="version" label="SNMP 版本">
                <Select
                  options={[
                    { value: 1, label: 'v1' },
                    { value: 2, label: 'v2c' },
                    { value: 3, label: 'v3' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="community" label="Community">
                <Input placeholder="public" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="intervalMs" label="采集周期 (ms)">
                <InputNumber min={5000} step={5000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="oids"
            label="OID 列表"
            rules={[{ required: true, message: '请输入至少一个 OID' }]}
            extra="支持逗号、分号或换行分隔多个 OID。"
          >
            <Input.TextArea rows={4} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Form.Item
            name="oidAliases"
            label="OID 别名映射 (JSON)"
            extra='例如：{"1.3.6.1.2.1.1.3.0":"uptime"}'
          >
            <Input.TextArea rows={3} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="productId" label="关联产品">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="可选，按产品归档采集数据"
                  options={products.map((item) => ({
                    value: item.id,
                    label: `${item.name} (${item.productKey})`,
                  }))}
                  onChange={handleProductChange}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deviceId" label="关联设备">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={collectorForm.getFieldValue('productId') ? '可选，绑定到设备上下文' : '可先选择产品后再选设备'}
                  options={filteredDevices.map((item) => ({
                    value: item.id,
                    label: item.nickname ? `${item.nickname} (${item.deviceName})` : item.deviceName,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>
    </div>
  );
};

export default SnmpPage;
