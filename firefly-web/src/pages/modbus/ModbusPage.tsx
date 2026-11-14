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
  Modal,
  Popconfirm,
  Radio,
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
  EditOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReadOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ProtocolAccessGuide from '../../components/ProtocolAccessGuide';
import CopyText from '../../components/CopyText';
import JsonEditorField from '../../components/JsonEditorField';
import ListEmpty from '../../components/ListEmpty';
import { DeviceSelect, ProductSelect } from '../../components/EntitySelect';
import { deviceApi, modbusApi, productApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { usePendingAction } from '../../hooks/usePendingAction';

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

interface CollectorTask {
  taskId: string;
  target: ModbusTarget;
  registers: RegisterDef[];
  intervalMs: number;
  productId: number | null;
  deviceId: number | null;
  deviceName: string | null;
}

interface TargetFormValues {
  host?: string;
  port?: number;
  slaveId?: number;
  mode?: string;
}

interface CollectorFormValues {
  taskId: string;
  host: string;
  port?: number;
  slaveId?: number;
  mode?: string;
  intervalMs?: number;
  registers: string;
  productId?: number;
  deviceId?: number;
  deviceName?: string;
}

interface CollectorRuntimeStatus {
  running: boolean;
  checkedAt: number;
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

const inputRegisterTemplate = JSON.stringify(
  [
    { alias: 'inputVoltage', functionCode: 4, address: 0, quantity: 2 },
  ],
  null,
  2,
);

const REGISTER_FUNCTION_CODES = new Set([3, 4]);

const formatClock = (value: Date | null) => (value ? dayjs(value).format('HH:mm:ss') : '--:--:--');

const getTargetLabel = (target: ModbusTarget): string =>
  `${target.host}:${target.port}（Slave ${target.slaveId} / ${target.mode}）`;

/**
 * 寄存器定义在提交前做结构与类型校验，避免 JSON 合法但内容不可执行（后端会按 FC03/FC04 采集）。
 */
const validateRegisterJson = async (_rule: unknown, value: unknown): Promise<void> => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('请填写寄存器定义 JSON');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`JSON 格式错误：${getErrorMessage(error, '无法解析')}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('寄存器定义必须是至少包含一项的 JSON 数组');
  }

  const rows: unknown[] = parsed;
  const problems: string[] = [];
  const aliases = new Set<string>();

  rows.forEach((item, index) => {
    const position = `第 ${index + 1} 项`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      problems.push(`${position}必须是对象`);
      return;
    }
    const record = item as Record<string, unknown>;
    const alias = record.alias;
    const functionCode = record.functionCode;
    const address = record.address;
    const quantity = record.quantity;

    if (typeof alias !== 'string' || !alias.trim()) {
      problems.push(`${position}缺少 alias`);
    } else if (aliases.has(alias.trim())) {
      problems.push(`${position}的 alias「${alias.trim()}」重复`);
    } else {
      aliases.add(alias.trim());
    }
    if (typeof functionCode !== 'number' || !REGISTER_FUNCTION_CODES.has(functionCode)) {
      problems.push(`${position}的 functionCode 只能是 3 或 4`);
    }
    if (
      typeof address !== 'number'
      || !Number.isInteger(address)
      || address < 0
      || address > 65535
    ) {
      problems.push(`${position}的 address 必须是 0-65535 的整数`);
    }
    if (
      typeof quantity !== 'number'
      || !Number.isInteger(quantity)
      || quantity < 1
      || quantity > 125
    ) {
      problems.push(`${position}的 quantity 必须是 1-125 的整数`);
    }
  });

  if (problems.length > 0) {
    throw new Error(problems.join('；'));
  }
};

const ModbusPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('tools');
  const [targetForm] = Form.useForm<TargetFormValues>();
  const [collectorForm] = Form.useForm<CollectorFormValues>();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [testTarget, setTestTarget] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const testRequestRef = useRef(0);
  const readRequestRef = useRef(0);

  const [readFc, setReadFc] = useState(3);
  const [readAddr, setReadAddr] = useState(0);
  const [readQty, setReadQty] = useState(10);
  const [readResult, setReadResult] = useState<number[] | boolean[] | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const [writeFc, setWriteFc] = useState(6);
  const [writeAddr, setWriteAddr] = useState(0);
  const [writeSingleValue, setWriteSingleValue] = useState(0);
  const [writeMultiValues, setWriteMultiValues] = useState('');
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const [collectors, setCollectors] = useState<CollectorTask[]>([]);
  const [collectorsLoading, setCollectorsLoading] = useState(false);
  const [collectorsError, setCollectorsError] = useState<string | null>(null);
  const [collectorFilter, setCollectorFilter] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<Record<string, CollectorRuntimeStatus>>({});
  const [statusTaskId, setStatusTaskId] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<{
    task: CollectorTask;
    running: boolean;
    checkedAt: number;
  } | null>(null);

  // 产品选择改为远程搜索后，仍缓存已展示过的产品信息，供采集任务列表展示名称与 productKey。
  const [products, setProducts] = useState<ProductOption[]>([]);

  const removeAction = usePendingAction();

  const productMap = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);
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

  const watchedProductId = Form.useWatch('productId', collectorForm);

  const fetchCollectors = useCallback(async () => {
    try {
      const res = await modbusApi.listCollectors();
      setCollectors(res.data?.data ?? []);
      setCollectorsError(null);
    } catch (error) {
      // 保留上一次的采集任务列表，错误由 Alert 明确暴露。
      setCollectorsError(getErrorMessage(error, '加载采集任务失败'));
    }
  }, []);

  // 采集任务状态由后端调度器自行变化，提供可暂停的轮询。
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

  const getTarget = (): ModbusTarget => {
    const values = targetForm.getFieldsValue();
    return {
      host: values.host?.trim() || '',
      port: values.port || 502,
      slaveId: values.slaveId || 1,
      mode: values.mode || 'TCP',
    };
  };

  const clearTestResult = () => {
    // 目标字段一变化就作废上一次测试（包括仍在途的请求），避免旧目标的结果回填。
    testRequestRef.current += 1;
    setTestResult(null);
    setTestTarget(null);
    setTestError(null);
  };

  const handleTargetChange = () => {
    clearTestResult();
    // 读取结果同样属于上一个目标，目标变化后不再展示，避免误读为当前目标的数据。
    readRequestRef.current += 1;
    setReadResult(null);
    setReadError(null);
    setWriteError(null);
  };

  const deviceDetailRequestRef = useRef(0);

  const handleProductChange = () => {
    collectorForm.setFieldValue('deviceId', undefined);
    collectorForm.setFieldValue('deviceName', undefined);
  };

  const handleDeviceChange = async (deviceId?: number) => {
    const requestId = deviceDetailRequestRef.current + 1;
    deviceDetailRequestRef.current = requestId;
    if (!deviceId) {
      collectorForm.setFieldValue('deviceName', undefined);
      return;
    }
    try {
      const res = await deviceApi.get(deviceId);
      const record = res.data.data as { deviceName?: string } | null;
      if (requestId === deviceDetailRequestRef.current) {
        collectorForm.setFieldValue('deviceName', record?.deviceName);
      }
    } catch {
      if (requestId === deviceDetailRequestRef.current) {
        // 设备名称仅用于归档展示，补查失败时仍可保存 deviceId。
        collectorForm.setFieldValue('deviceName', undefined);
      }
    }
  };

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
    const requestId = testRequestRef.current;
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    setTestTarget(label);
    try {
      const res = await modbusApi.test(target);
      if (testRequestRef.current !== requestId) {
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
      if (testRequestRef.current !== requestId) {
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

  const handleRead = async () => {
    const target = getTarget();
    if (!target.host) {
      message.warning('请输入目标主机地址');
      return;
    }
    if (readLoading) {
      return;
    }

    const label = getTargetLabel(target);
    const requestId = readRequestRef.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const payload = { ...target, address: readAddr, quantity: readQty };
      let res: { data?: { data?: number[] | boolean[] } };

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

      if (readRequestRef.current !== requestId) {
        return;
      }
      setReadResult(res.data?.data ?? []);
    } catch (error) {
      if (readRequestRef.current !== requestId) {
        return;
      }
      const detail = getErrorMessage(error, '读取寄存器失败');
      setReadError(detail);
      message.error(`${detail}（目标 ${label}，FC${readFc} 地址 ${readAddr}）`);
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
    if (writeLoading) {
      return;
    }

    const label = getTargetLabel(target);
    setWriteLoading(true);
    setWriteError(null);
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
      message.success(`写入成功：${label}，FC${writeFc} 地址 ${writeAddr}`);
    } catch (error) {
      const detail = getErrorMessage(error, '写入失败');
      setWriteError(detail);
      message.error(`${detail}（目标 ${label}，FC${writeFc} 地址 ${writeAddr}）`);
    } finally {
      setWriteLoading(false);
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

    // 表单校验已保证结构合法，这里再做一次防御性解析，避免并发修改导致未捕获异常。
    let registers: RegisterDef[];
    try {
      registers = JSON.parse(values.registers) as RegisterDef[];
    } catch (error) {
      message.error(getErrorMessage(error, '寄存器定义 JSON 解析失败'));
      return;
    }

    // 选中设备后名称是异步补查的；提交前兜底补一次，避免网络慢时 deviceName 为空。
    let deviceName = values.deviceName;
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
        deviceName: deviceName || null,
      });

      message.success(`采集任务 ${values.taskId} 注册成功`);
      setDrawerOpen(false);
      collectorForm.resetFields();
      await refreshCollectors();
    } catch (error) {
      message.error(getErrorMessage(error, '采集任务注册失败'));
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveCollector = async (taskId: string) => {
    try {
      await modbusApi.unregisterCollector(taskId);
    } catch (error) {
      message.error(`${getErrorMessage(error, '移除采集任务失败')}（任务 ${taskId}）`);
      return;
    }
    message.success(`采集任务 ${taskId} 已移除`);
    await refreshCollectors();
  };

  const handleCheckCollectorStatus = async (task: CollectorTask) => {
    if (statusTaskId) {
      return;
    }

    setStatusTaskId(task.taskId);
    try {
      const res = await modbusApi.collectorStatus(task.taskId);
      const running = Boolean(res.data?.data);
      const checkedAt = Date.now();
      setRuntimeStatus((previous) => ({
        ...previous,
        [task.taskId]: { running, checkedAt },
      }));
      setStatusInfo({ task, running, checkedAt });
    } catch (error) {
      message.error(`${getErrorMessage(error, '查询采集任务状态失败')}（任务 ${task.taskId}）`);
    } finally {
      setStatusTaskId(null);
    }
  };

  const renderReadResult = () => {
    if (readLoading) {
      return <Spin style={{ marginTop: 16 }} />;
    }
    if (!readResult) {
      return null;
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
        locale={{
          emptyText: (
            <ListEmpty
              compact
              emptyText="设备返回空数据，请检查起始地址与数量是否在设备映射范围内"
            />
          ),
        }}
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
                <CopyText text={String(value)} />
              )
            ),
          },
        ]}
      />
    );
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

  const collectorColumns: ColumnsType<CollectorTask> = [
    {
      title: '任务标识',
      dataIndex: 'taskId',
      width: 180,
      render: (value: string) => <CopyText text={value} ellipsis style={{ fontFamily: 'monospace' }} />,
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
        const label = record.deviceName;
        return label ? (
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{label}</Typography.Text>
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
      title: '运行状态',
      width: 130,
      render: (_value, record) => {
        const status = runtimeStatus[record.taskId];
        if (!status) {
          return <Typography.Text type="secondary">未查询</Typography.Text>;
        }
        return (
          <Tooltip title={`查询于 ${formatDateTime(status.checkedAt)}`}>
            {status.running
              ? <Tag color="success">运行中</Tag>
              : <Tag color="default">未运行</Tag>}
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      width: 190,
      render: (_value, record) => (
        <Space size={4} wrap>
          <Tooltip title="后端仅返回任务是否在运行，不包含最近采集时间">
            <Button
              type="link"
              size="small"
              icon={<InfoCircleOutlined />}
              loading={statusTaskId === record.taskId}
              disabled={Boolean(statusTaskId) && statusTaskId !== record.taskId}
              onClick={() => void handleCheckCollectorStatus(record)}
            >
              查看状态
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认移除该采集任务？"
            description="移除后该任务将停止采集，已上报的数据不受影响；需要重新创建任务才能恢复采集。"
            okText="移除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            disabled={removeAction.pending}
            onConfirm={() => removeAction.run(() => handleRemoveCollector(record.taskId))}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={removeAction.pending}>
              移除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const isSingleWrite = writeFc === 5 || writeFc === 6;

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
      <PageHeader title="Modbus 接入" />

      <ProtocolAccessGuide endpoint="502 / TCP" />

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
                    onValuesChange={handleTargetChange}
                  >
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
                        {readError ? (
                          <Alert
                            type="error"
                            showIcon
                            message={readResult && readResult.length > 0 ? '读取寄存器失败，当前显示上次成功读取的结果' : '读取寄存器失败'}
                            description={<CopyText text={readError} style={{ color: '#cf1322' }} />}
                            action={<Button size="small" danger onClick={() => void handleRead()}>重试</Button>}
                          />
                        ) : null}
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

                        {writeError ? (
                          <Alert
                            type="error"
                            showIcon
                            message="写入寄存器失败"
                            description={<CopyText text={writeError} style={{ color: '#cf1322' }} />}
                          />
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
                  <Space wrap>
                    {collectorsRefreshControls}
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        collectorForm.resetFields();
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
                  scroll={{ x: 1320 }}
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
        title="新建 Modbus 采集任务"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={860}
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
          initialValues={{ port: 502, slaveId: 1, mode: 'TCP', intervalMs: 60000 }}
        >
          <Form.Item
            name="taskId"
            label="任务标识"
            rules={[{ required: true, message: '请输入任务标识' }]}
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
            required
            rules={[{ validator: validateRegisterJson }]}
          >
            <JsonEditorField
              height={260}
              path="modbus-registers.json"
              hint="数组；每项必填 alias、functionCode(3/4)、address、quantity"
              templates={[
                { key: 'holding', label: '保持寄存器模板（FC03）', value: registerTemplate },
                { key: 'input', label: '输入寄存器模板（FC04）', value: inputRegisterTemplate },
              ]}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="productId" label="关联产品">
                <ProductSelect
                  placeholder="搜索并选择产品（名称或 productKey）"
                  onChange={handleProductChange}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="deviceId" label="关联设备">
                <DeviceSelect
                  key={watchedProductId ?? 'all'}
                  productId={watchedProductId}
                  placeholder={watchedProductId ? '搜索并选择设备（名称或别名）' : '可先选择产品后再选设备'}
                  onChange={(value) => void handleDeviceChange(value)}
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

      <Modal
        open={Boolean(statusInfo)}
        title="采集任务运行状态"
        onCancel={() => setStatusInfo(null)}
        footer={<Button onClick={() => setStatusInfo(null)}>关闭</Button>}
      >
        {statusInfo ? (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="任务标识">
              <CopyText text={statusInfo.task.taskId} style={{ fontFamily: 'monospace' }} />
            </Descriptions.Item>
            <Descriptions.Item label="目标连接">
              {statusInfo.task.target.host}:{statusInfo.task.target.port}（Slave {statusInfo.task.target.slaveId} / {statusInfo.task.target.mode}）
            </Descriptions.Item>
            <Descriptions.Item label="运行状态">
              {statusInfo.running
                ? <Tag color="success">运行中</Tag>
                : <Tag color="default">未运行</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="查询时间">
              {formatDateTime(statusInfo.checkedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="说明">
              后端状态接口只返回任务是否在调度器中运行，不包含最近采集时间。
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  );
};

export default ModbusPage;
