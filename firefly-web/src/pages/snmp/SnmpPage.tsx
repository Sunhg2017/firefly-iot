import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { deviceApi, productApi, snmpApi } from '../../services/api';
import { DeviceSelect, ProductSelect } from '../../components/EntitySelect';
import { getErrorMessage } from '../../utils/errors';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { usePendingAction } from '../../hooks/usePendingAction';

interface ProductOption {
  id: number;
  productKey: string;
  name: string;
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

interface OidRow {
  oid?: string;
  alias?: string;
}

interface TargetFormValues {
  host?: string;
  port?: number;
  version?: number;
  community?: string;
}

interface CollectorFormValues {
  taskId: string;
  host: string;
  port?: number;
  version?: number;
  community?: string;
  intervalMs?: number;
  oids: OidRow[];
  productId?: number;
  deviceId?: number;
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

const OID_PATTERN = /^\.?\d+(\.\d+)+$/;

const SNMP_VERSION_OPTIONS = [
  { value: 1, label: 'v1' },
  { value: 2, label: 'v2c' },
  // 后端 SnmpController 虽然接收 v3 字段，但 SnmpService 仍用 CommunityTarget 且未注册 USM 用户，
  // 选中 v3 会必然失败；在服务端补齐 v3 认证实现前禁用该选项。
  { value: 3, label: 'v3（当前后端未开放）', disabled: true },
];

const formatClock = (value: Date | null) => (value ? dayjs(value).format('HH:mm:ss') : '--:--:--');

const isValidOid = (value: string): boolean => OID_PATTERN.test(value.trim());

const splitOidText = (value: string): string[] =>
  value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);

const getOidRows = (rows: OidRow[] | undefined): OidRow[] => (Array.isArray(rows) ? rows : []);

const formatVersion = (version: number): string => {
  if (version === 1) return 'v1';
  if (version === 3) return 'v3';
  return 'v2c';
};

const validateOidValue = async (_rule: unknown, value: unknown): Promise<void> => {
  if (typeof value !== 'string' || !value.trim()) {
    return;
  }
  if (!isValidOid(value)) {
    throw new Error('OID 格式应为数字点分，例如 1.3.6.1.2.1.1.3.0');
  }
};

const SnmpPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tools');
  const [targetForm] = Form.useForm<TargetFormValues>();
  const [collectorForm] = Form.useForm<CollectorFormValues>();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testTarget, setTestTarget] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<Record<string, string> | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState<string | null>(null);

  const [getOids, setGetOids] = useState('');
  const [getResult, setGetResult] = useState<Record<string, string> | null>(null);
  const [getLoading, setGetLoading] = useState(false);
  const [getError, setGetError] = useState<string | null>(null);

  const [walkOid, setWalkOid] = useState('');
  const [walkResult, setWalkResult] = useState<Record<string, string> | null>(null);
  const [walkLoading, setWalkLoading] = useState(false);
  const [walkError, setWalkError] = useState<string | null>(null);

  const [collectors, setCollectors] = useState<CollectorTask[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);
  const [collectorsError, setCollectorsError] = useState<string | null>(null);
  const [collectorFilter, setCollectorFilter] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const targetRequestRef = useRef(0);

  // 产品选择改为远程搜索后，仍缓存已展示过的产品信息，供采集任务列表展示名称与 productKey。
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedDeviceName, setSelectedDeviceName] = useState<string | undefined>();

  const removeAction = usePendingAction();

  // 设备下拉的 placeholder 依赖产品选择，必须用 useWatch 订阅表单值；
  // 直接 getFieldValue 只在渲染时读一次，选完产品不会刷新。
  const watchedProductId = Form.useWatch('productId', collectorForm);

  const productMap = useMemo(
    () => new Map(products.map((item) => [item.id, item])),
    [products],
  );

  const productRequestRef = useRef<Set<number>>(new Set());

  // 采集任务只保存 productId，列表展示产品名称需要按需补查，避免为映射名称预加载全部产品。
  useEffect(() => {
    const missing = Array.from(new Set(
      collectors
        .map((item) => item.productId)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    )).filter((id) => !productMap.has(id) && !productRequestRef.current.has(id));
    if (missing.length === 0) {
      return;
    }
    missing.forEach((id) => productRequestRef.current.add(id));
    void Promise.all(missing.map(async (id) => {
      try {
        const res = await productApi.get(id);
        const record = res.data.data as ProductOption | null;
        return record?.id ? record : null;
      } catch {
        productRequestRef.current.delete(id);
        return null;
      }
    })).then((records) => {
      const found = records.filter((item): item is ProductOption => item !== null);
      if (found.length === 0) {
        return;
      }
      setProducts((current) => {
        const merged = new Map(current.map((item) => [item.id, item]));
        found.forEach((item) => merged.set(item.id, item));
        return Array.from(merged.values());
      });
    });
  }, [collectors, productMap]);

  const deviceDetailRequestRef = useRef(0);

  const handleDeviceChange = async (deviceId?: number) => {
    const requestId = deviceDetailRequestRef.current + 1;
    deviceDetailRequestRef.current = requestId;
    if (!deviceId) {
      setSelectedDeviceName(undefined);
      return;
    }
    try {
      const res = await deviceApi.get(deviceId);
      const record = res.data.data as { deviceName?: string } | null;
      if (requestId === deviceDetailRequestRef.current) {
        setSelectedDeviceName(record?.deviceName);
      }
    } catch {
      if (requestId === deviceDetailRequestRef.current) {
        // 设备名称仅用于归档展示；补查失败时提交仍可正常带 deviceId。
        setSelectedDeviceName(undefined);
      }
    }
  };

  const fetchCollectors = useCallback(async () => {
    try {
      const res = await snmpApi.listCollectors();
      setCollectors(res.data?.data ?? []);
      setCollectorsError(null);
    } catch (error) {
      // 保留上一次的采集任务列表，请求失败不能显示为“暂无任务”。
      setCollectorsError(getErrorMessage(error, '加载采集任务失败'));
    }
  }, []);

  // 采集任务由后端调度器管理，提供可暂停的轮询。
  const {
    paused: collectorsPaused,
    togglePaused: toggleCollectorsPaused,
    lastUpdatedAt: collectorsUpdatedAt,
    refresh: refreshCollectors,
  } = useAutoRefresh(fetchCollectors, {
    intervalMs: 15000,
    enabled: activeTab === 'collectors',
    immediate: false,
  });

  const handleCollectorsRefresh = useCallback(() => {
    setCollectorsLoading(true);
    void refreshCollectors().finally(() => setCollectorsLoading(false));
  }, [refreshCollectors]);

  useEffect(() => {
    if (activeTab !== 'collectors') {
      return undefined;
    }
    let active = true;
    setCollectorsLoading(true);
    void refreshCollectors().finally(() => {
      if (active) {
        setCollectorsLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [activeTab, refreshCollectors]);

  const getTarget = (): SnmpTarget => {
    const values = targetForm.getFieldsValue();
    return {
      host: values.host?.trim() || '',
      port: values.port || 161,
      version: values.version || 2,
      community: values.community?.trim() || 'public',
    };
  };

  const clearTargetResults = () => {
    // 目标字段一变化就作废上一次测试/读取（包括在途请求），避免旧目标的结果回填。
    targetRequestRef.current += 1;
    setTestResult(null);
    setTestTarget(null);
    setTestError(null);
    setSystemInfo(null);
    setSystemError(null);
    setGetResult(null);
    setGetError(null);
    setWalkResult(null);
    setWalkError(null);
  };

  const handleProductChange = () => {
    collectorForm.setFieldValue('deviceId', undefined);
    setSelectedDeviceName(undefined);
  };

  /** 记录每次测试/请求的目标，避免改完目标后仍显示旧结果。 */
  const getTargetLabel = (target: SnmpTarget): string =>
    `${target.host}:${target.port}（${formatVersion(target.version)}）`;

  const handleTest = async () => {
    const target = getTarget();
    if (!target.host) {
      message.warning('请输入目标主机地址');
      return;
    }
    if (testing) {
      return;
    }

    const label = getTargetLabel(target);
    const requestId = targetRequestRef.current;
    setTesting(true);
    setTestResult(null);
    setTestTarget(label);
    setTestError(null);
    try {
      const res = await snmpApi.test(target);
      if (targetRequestRef.current !== requestId) {
        return;
      }
      const success = Boolean(res.data?.data);
      setTestResult(success);
      if (success) {
        message.success(`连接成功：${label}`);
      } else {
        message.error(`连接失败：${label}`);
      }
    } catch (error) {
      if (targetRequestRef.current !== requestId) {
        return;
      }
      const detail = getErrorMessage(error, '连接失败');
      setTestResult(false);
      setTestError(detail);
      message.error(`${detail}（目标 ${label}）`);
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
    if (systemLoading) {
      return;
    }

    const label = getTargetLabel(target);
    const requestId = targetRequestRef.current;
    setSystemLoading(true);
    setSystemError(null);
    try {
      const res = await snmpApi.systemInfo(target);
      if (targetRequestRef.current !== requestId) {
        return;
      }
      setSystemInfo(res.data?.data ?? null);
    } catch (error) {
      if (targetRequestRef.current !== requestId) {
        return;
      }
      const detail = getErrorMessage(error, '获取系统信息失败');
      setSystemError(detail);
      message.error(`${detail}（目标 ${label}）`);
    } finally {
      setSystemLoading(false);
    }
  };

  const handleGet = async () => {
    const target = getTarget();
    const oids = splitOidText(getOids);
    if (!target.host || oids.length === 0) {
      message.warning('请输入目标主机和 OID');
      return;
    }
    const invalidOid = oids.find((oid) => !isValidOid(oid));
    if (invalidOid) {
      message.warning(`OID 格式不正确：${invalidOid}，应为数字点分，例如 1.3.6.1.2.1.1.1.0`);
      return;
    }
    if (getLoading) {
      return;
    }

    const label = getTargetLabel(target);
    const requestId = targetRequestRef.current;
    setGetLoading(true);
    setGetError(null);
    try {
      const res = await snmpApi.get({ target, oids });
      if (targetRequestRef.current !== requestId) {
        return;
      }
      setGetResult(res.data?.data ?? {});
    } catch (error) {
      if (targetRequestRef.current !== requestId) {
        return;
      }
      const detail = getErrorMessage(error, 'SNMP GET 失败');
      setGetError(detail);
      message.error(`${detail}（目标 ${label}）`);
    } finally {
      setGetLoading(false);
    }
  };

  const handleWalk = async () => {
    const target = getTarget();
    const rootOid = walkOid.trim();
    if (!target.host || !rootOid) {
      message.warning('请输入目标主机和根 OID');
      return;
    }
    if (!isValidOid(rootOid)) {
      message.warning('根 OID 格式不正确，应为数字点分，例如 1.3.6.1.2.1.1');
      return;
    }
    if (walkLoading) {
      return;
    }

    const label = getTargetLabel(target);
    const requestId = targetRequestRef.current;
    setWalkLoading(true);
    setWalkError(null);
    try {
      const res = await snmpApi.walk({ target, rootOid });
      if (targetRequestRef.current !== requestId) {
        return;
      }
      setWalkResult(res.data?.data ?? {});
    } catch (error) {
      if (targetRequestRef.current !== requestId) {
        return;
      }
      const detail = getErrorMessage(error, 'SNMP WALK 失败');
      setWalkError(detail);
      message.error(`${detail}（目标 ${label}）`);
    } finally {
      setWalkLoading(false);
    }
  };

  const handleAddCollector = async () => {
    if (registering) {
      return;
    }

    let values: CollectorFormValues;
    try {
      values = await collectorForm.validateFields();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        return;
      }
      message.error(getErrorMessage(error, '采集任务校验失败'));
      return;
    }

    // OID 与别名在同一个 Form.List 中维护，提交时再汇总为后端需要的 oids + oidAliases。
    const rows = getOidRows(values.oids);
    const oids = rows.map((row) => row.oid?.trim() ?? '').filter(Boolean);
    const oidAliases = rows.reduce<Record<string, string>>((result, row) => {
      const oid = row.oid?.trim();
      const alias = row.alias?.trim();
      if (oid && alias) {
        result[oid] = alias;
      }
      return result;
    }, {});

    // 选中设备后名称是异步补查的；提交前兜底补一次，避免网络慢时 deviceName 为空。
    let deviceName = values.deviceId ? selectedDeviceName : undefined;
    if (values.deviceId && !deviceName) {
      try {
        const res = await deviceApi.get(values.deviceId);
        deviceName = (res.data.data as { deviceName?: string } | null)?.deviceName;
      } catch {
        // 名称仅用于归档展示，补查失败不影响任务注册。
      }
    }

    setRegistering(true);
    try {
      await snmpApi.registerCollector({
        taskId: values.taskId,
        target: {
          host: values.host,
          port: values.port || 161,
          version: values.version || 2,
          community: values.community || 'public',
        },
        oids,
        oidAliases: Object.keys(oidAliases).length > 0 ? oidAliases : null,
        intervalMs: values.intervalMs || 60000,
        productId: values.productId || null,
        deviceId: values.deviceId || null,
        deviceName: deviceName || null,
      });

      message.success(`采集任务 ${values.taskId} 注册成功`);
      setDrawerOpen(false);
      collectorForm.resetFields();
      setSelectedDeviceName(undefined);
      await refreshCollectors();
    } catch (error) {
      message.error(getErrorMessage(error, '采集任务注册失败'));
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveCollector = async (taskId: string) => {
    try {
      await snmpApi.unregisterCollector(taskId);
    } catch (error) {
      message.error(`${getErrorMessage(error, '移除采集任务失败')}（任务 ${taskId}）`);
      return;
    }
    message.success(`采集任务 ${taskId} 已移除`);
    await refreshCollectors();
  };

  const filteredCollectors = useMemo(() => {
    const keyword = collectorFilter.trim().toLowerCase();
    if (!keyword) {
      return collectors;
    }
    return collectors.filter((task) => {
      const product = task.productId ? productMap.get(task.productId) : undefined;
      const haystack = [
        task.taskId,
        task.target.host,
        String(task.target.port),
        product?.name,
        product?.productKey,
        task.deviceName,
      ]
        .filter((item): item is string => Boolean(item))
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [collectors, collectorFilter, productMap]);

  const renderResultTable = (data: Record<string, string> | null, loading: boolean) => {
    if (loading) {
      return <Spin style={{ marginTop: 16 }} />;
    }
    if (!data) {
      return null;
    }
    const rows = Object.entries(data);

    return (
      <Table
        size="small"
        style={{ marginTop: 12 }}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        rowKey="oid"
        dataSource={rows.map(([oid, value]) => ({ oid, value }))}
        locale={{
          emptyText: (
            <ListEmpty compact emptyText="设备未返回任何 OID 数据，请检查 OID 是否存在" />
          ),
        }}
        columns={[
          {
            title: 'OID',
            dataIndex: 'oid',
            width: 300,
            render: (value: string) => (
              <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />
            ),
          },
          {
            title: '值',
            dataIndex: 'value',
            render: (value: string) => <CopyText text={value} ellipsis />,
          },
        ]}
      />
    );
  };

  const collectorColumns: ColumnsType<CollectorTask> = [
    {
      title: '任务标识',
      dataIndex: 'taskId',
      width: 180,
      render: (value: string) => <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />,
    },
    {
      title: '目标主机',
      width: 200,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{record.target.host}:{record.target.port}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            SNMP {formatVersion(record.target.version)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '关联产品',
      width: 200,
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
        const deviceLabel = record.deviceName;
        return deviceLabel ? (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{deviceLabel}</Typography.Text>
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
          description="移除后该任务将停止采集，已上报的数据不受影响；需要重新创建任务才能恢复采集。"
          okText="移除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          disabled={removeAction.pending}
          onConfirm={() => removeAction.run(() => handleRemoveCollector(record.taskId))}
        >
          <Button type="link" danger size="small" icon={<DeleteOutlined />} disabled={removeAction.pending}>
            移除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const collectorsRefreshControls = (
    <Space size={8} wrap>
      <Space size={6}>
        <Typography.Text type="secondary">自动刷新</Typography.Text>
        <Switch
          size="small"
          checked={!collectorsPaused}
          onChange={toggleCollectorsPaused}
          checkedChildren="开"
          unCheckedChildren="关"
        />
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        上次刷新 {formatClock(collectorsUpdatedAt)}
      </Typography.Text>
      <Button icon={<ReloadOutlined />} onClick={handleCollectorsRefresh} loading={collectorsLoading}>
        刷新
      </Button>
    </Space>
  );

  return (
    <div>
      <PageHeader title="SNMP 接入" />

      <ProtocolAccessGuide endpoint="161 / UDP" />

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
                  <Form
                    form={targetForm}
                    layout="inline"
                    initialValues={defaultTarget}
                    onValuesChange={clearTargetResults}
                  >
                    <Form.Item label="主机地址" name="host" rules={[{ required: true, message: '请输入主机地址' }]}>
                      <Input placeholder="192.168.1.1" style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item label="端口" name="port">
                      <InputNumber min={1} max={65535} style={{ width: 100 }} />
                    </Form.Item>
                    <Form.Item
                      label={(
                        <Space size={4}>
                          版本
                          <Tooltip title="当前后端未开放 v3（缺少 USM 认证实现），请使用 v1/v2c">
                            <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                          </Tooltip>
                        </Space>
                      )}
                      name="version"
                    >
                      <Select style={{ width: 150 }} options={SNMP_VERSION_OPTIONS} />
                    </Form.Item>
                    <Form.Item label="Community" name="community" rules={[{ required: true, message: '请输入 Community' }]}>
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
                    <Space direction="vertical" size={4} style={{ marginTop: 12 }}>
                      <Space size={8} wrap>
                        {testResult ? (
                          <Tag color="success" icon={<CheckCircleOutlined />}>连接成功</Tag>
                        ) : (
                          <Tag color="error" icon={<CloseCircleOutlined />}>连接失败</Tag>
                        )}
                        {testTarget ? (
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            测试目标：{testTarget}
                          </Typography.Text>
                        ) : null}
                      </Space>
                      {testError ? (
                        <CopyText text={testError} style={{ color: '#cf1322', fontSize: 12 }} />
                      ) : null}
                    </Space>
                  ) : null}

                  {systemError ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginTop: 12 }}
                      message={systemInfo && Object.keys(systemInfo).length > 0 ? '获取系统信息失败，当前显示上次成功结果' : '获取系统信息失败'}
                      description={<CopyText text={systemError} style={{ color: '#cf1322' }} />}
                      action={<Button size="small" danger onClick={() => void handleLoadSystemInfo()}>重试</Button>}
                    />
                  ) : null}

                  {systemInfo ? (
                    <Descriptions bordered size="small" column={2} style={{ marginTop: 12 }}>
                      {Object.entries(systemInfo).map(([key, value]) => (
                        <Descriptions.Item key={key} label={key}>
                          <CopyText text={value} ellipsis />
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
                      {getError ? (
                        <Alert
                          type="error"
                          showIcon
                          style={{ marginTop: 12 }}
                          message={getResult && Object.keys(getResult).length > 0 ? 'SNMP GET 失败，当前显示上次成功结果' : 'SNMP GET 失败'}
                          description={<CopyText text={getError} style={{ color: '#cf1322' }} />}
                          action={<Button size="small" danger onClick={() => void handleGet()}>重试</Button>}
                        />
                      ) : null}
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
                      {walkError ? (
                        <Alert
                          type="error"
                          showIcon
                          style={{ marginTop: 12 }}
                          message={walkResult && Object.keys(walkResult).length > 0 ? 'SNMP WALK 失败，当前显示上次成功结果' : 'SNMP WALK 失败'}
                          description={<CopyText text={walkError} style={{ color: '#cf1322' }} />}
                          action={<Button size="small" danger onClick={() => void handleWalk()}>重试</Button>}
                        />
                      ) : null}
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
                  <Space wrap>
                    {collectorsRefreshControls}
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        collectorForm.resetFields();
                        setSelectedDeviceName(undefined);
                        setDrawerOpen(true);
                      }}
                    >
                      新建采集任务
                    </Button>
                  </Space>
                }
              >
                {collectorsError ? (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="采集任务加载失败，当前显示上次成功获取的数据"
                    description={<CopyText text={collectorsError} style={{ color: '#cf1322' }} />}
                    action={
                      <Button size="small" danger onClick={handleCollectorsRefresh}>
                        重试
                      </Button>
                    }
                  />
                ) : null}
                <Space size={12} wrap style={{ marginBottom: 12 }}>
                  <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="按任务标识 / 主机 / 设备筛选"
                    value={collectorFilter}
                    onChange={(event) => setCollectorFilter(event.target.value)}
                    style={{ width: 320 }}
                  />
                  <Typography.Text type="secondary">
                    共 {filteredCollectors.length} / {collectors.length} 个任务
                  </Typography.Text>
                </Space>
                <Table<CollectorTask>
                  rowKey="taskId"
                  columns={collectorColumns}
                  dataSource={filteredCollectors}
                  loading={collectorsLoading}
                  scroll={{ x: 1180 }}
                  pagination={false}
                  locale={{
                    emptyText: collectorsError && collectors.length === 0 ? (
                      <ListEmpty compact emptyText="采集任务加载失败，请点击上方“重试”" />
                    ) : (
                      <ListEmpty
                        hasFilters={Boolean(collectorFilter.trim())}
                        emptyText="暂无采集任务，点击右上角新建采集任务"
                        filteredText="没有符合筛选条件的采集任务"
                        onClearFilters={() => setCollectorFilter('')}
                        compact
                      />
                    ),
                  }}
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
            <Button onClick={() => setDrawerOpen(false)} disabled={registering}>取消</Button>
            <Button
              type="primary"
              loading={registering}
              disabled={registering}
              onClick={() => void handleAddCollector()}
            >
              保存任务
            </Button>
          </Space>
        }
      >
        <Form
          form={collectorForm}
          layout="vertical"
          initialValues={{
            port: 161,
            version: 2,
            community: 'public',
            intervalMs: 60000,
            oids: [{ oid: '' }],
          }}
        >
          <Form.Item
            name="taskId"
            label="任务标识"
            rules={[{ required: true, message: '请输入任务标识' }]}
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
              <Form.Item
                name="version"
                label={(
                  <Space size={4}>
                    SNMP 版本
                    <Tooltip title="当前后端未开放 v3（缺少 USM 认证实现），请使用 v1/v2c">
                      <InfoCircleOutlined style={{ color: '#94a3b8' }} />
                    </Tooltip>
                  </Space>
                )}
              >
                <Select options={SNMP_VERSION_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="community" label="Community" rules={[{ required: true, message: '请输入 Community' }]}>
                <Input placeholder="public" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="intervalMs" label="采集周期 (ms)">
                <InputNumber min={5000} step={5000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.List
            name="oids"
            rules={[{
              validator: async (_rule: unknown, value: unknown) => {
                const rows = getOidRows(value as OidRow[] | undefined);
                const filled = rows.filter((row) => row.oid?.trim());
                if (filled.length === 0) {
                  throw new Error('请至少添加一个 OID');
                }
                const seen = new Set<string>();
                const aliases = new Set<string>();
                filled.forEach((row) => {
                  const oid = row.oid?.trim() ?? '';
                  if (seen.has(oid)) {
                    throw new Error(`OID 重复：${oid}`);
                  }
                  seen.add(oid);
                  const alias = row.alias?.trim();
                  if (alias) {
                    if (aliases.has(alias)) {
                      throw new Error(`别名重复：${alias}`);
                    }
                    aliases.add(alias);
                  }
                });
              },
            }]}
          >
            {(fields, { add, remove }, { errors }) => (
              <Form.Item label="OID 列表" required>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {fields.map((field) => (
                    <Row gutter={8} key={field.key} align="top">
                      <Col span={11}>
                        <Form.Item
                          name={[field.name, 'oid']}
                          rules={[
                            { required: true, message: '请输入 OID' },
                            { validator: validateOidValue },
                          ]}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="1.3.6.1.2.1.1.3.0" style={{ fontFamily: 'monospace' }} />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item
                          name={[field.name, 'alias']}
                          rules={[{ max: 64, message: '别名最多 64 个字符' }]}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="别名（可选），例如 uptime" />
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Button
                          type="text"
                          danger
                          aria-label="删除该 OID"
                          icon={<DeleteOutlined />}
                          disabled={fields.length <= 1}
                          onClick={() => remove(field.name)}
                        />
                      </Col>
                    </Row>
                  ))}
                  <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() => add({ oid: '' })}
                  >
                    添加 OID
                  </Button>
                  <Form.ErrorList errors={errors} />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    OID 与别名一一对应，别名会作为采集数据的字段名；相同 OID 不能重复。
                  </Typography.Text>
                </Space>
              </Form.Item>
            )}
          </Form.List>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="productId" label="关联产品">
                <ProductSelect
                  placeholder="搜索并选择产品（名称或 productKey）"
                  onChange={handleProductChange}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deviceId" label="关联设备">
                <DeviceSelect
                  key={watchedProductId ?? 'all'}
                  productId={watchedProductId}
                  placeholder={watchedProductId ? '搜索并选择设备（名称或别名）' : '可先选择产品后再选设备'}
                  onChange={(value) => void handleDeviceChange(value)}
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
