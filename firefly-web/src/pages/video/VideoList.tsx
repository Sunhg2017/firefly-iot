import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import {
  CameraOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  EditOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  UnorderedListOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { productApi, videoApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import VideoPlayer from '../../components/video/VideoPlayer';
import PtzControlPanel from '../../components/video/PtzControlPanel';

type EditorMode = 'create' | 'edit';

interface VideoDeviceRecord {
  id: number;
  name: string;
  gbDeviceId?: string;
  gbDomain?: string;
  transport?: string;
  streamMode: string;
  sipAuthEnabled?: boolean;
  ip?: string;
  port?: number;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  status: string;
  createdAt: string;
}

interface StreamInfo {
  flvUrl: string;
  hlsUrl: string;
  webrtcUrl: string;
}

interface VideoProductContext {
  productId?: number;
  productKey: string;
  productName?: string;
  protocol: string;
  autoCreate: boolean;
}

interface VideoProductOption {
  id: number;
  name: string;
  productKey: string;
  protocol: string;
}

interface VideoEditorFormValues {
  productKey?: string;
  name?: string;
  streamMode?: string;
  gbDeviceId?: string;
  gbDomain?: string;
  transport?: string;
  sipAuthEnabled?: boolean;
  sipPassword?: string;
  ip?: string;
  port?: number | string;
  manufacturer?: string;
  model?: string;
}

const statusLabels: Record<string, string> = { ONLINE: '在线', OFFLINE: '离线' };
const statusColors: Record<string, string> = { ONLINE: 'success', OFFLINE: 'default' };
const modeLabels: Record<string, string> = { GB28181: 'GB/T 28181', RTSP: 'RTSP', RTMP: 'RTMP' };
const VIDEO_MODE_OPTIONS = [
  { value: 'GB28181', label: 'GB/T 28181' },
  { value: 'RTSP', label: 'RTSP' },
  { value: 'RTMP', label: 'RTMP' },
];
const VIDEO_CONTEXT_PARAM_KEYS = ['source', 'autoCreate', 'productId', 'productKey', 'productName', 'protocol'] as const;
const VIDEO_PROTOCOL_VALUES = new Set(VIDEO_MODE_OPTIONS.map((item) => item.value));
const ptzCmdMap: Record<number, string> = {
  0: 'STOP',
  1: 'UP',
  2: 'DOWN',
  3: 'LEFT',
  4: 'RIGHT',
  5: 'ZOOM_IN',
  6: 'ZOOM_OUT',
};

const trimOptionalValue = (value?: string) => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeOptionalPort = (value?: number | string) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
};

const parseVideoProductContext = (searchParams: URLSearchParams): VideoProductContext | null => {
  const protocol = trimOptionalValue(searchParams.get('protocol') || undefined);
  const productKey = trimOptionalValue(searchParams.get('productKey') || undefined);
  if (!protocol || !productKey || !VIDEO_PROTOCOL_VALUES.has(protocol)) {
    return null;
  }

  const rawProductId = searchParams.get('productId');
  const parsedProductId = rawProductId ? Number(rawProductId) : NaN;
  return {
    productId: Number.isInteger(parsedProductId) && parsedProductId > 0 ? parsedProductId : undefined,
    productKey,
    productName: trimOptionalValue(searchParams.get('productName') || undefined),
    protocol,
    autoCreate: searchParams.get('autoCreate') === '1',
  };
};

const buildEditorInitialValues = (
  productContext?: VideoProductContext | null,
  device?: VideoDeviceRecord | null,
): VideoEditorFormValues => {
  if (device) {
    return {
      name: device.name,
      streamMode: device.streamMode,
      gbDeviceId: device.gbDeviceId,
      gbDomain: device.gbDomain,
      transport: device.streamMode === 'GB28181' ? device.transport || 'UDP' : undefined,
      sipAuthEnabled: Boolean(device.sipAuthEnabled),
      sipPassword: undefined,
      ip: device.ip,
      port: device.port,
      manufacturer: device.manufacturer,
      model: device.model,
    };
  }

  const streamMode = productContext?.protocol || 'GB28181';
  return {
    productKey: productContext?.productKey,
    streamMode,
    transport: streamMode === 'GB28181' ? 'UDP' : undefined,
    sipAuthEnabled: false,
  };
};

const buildEditorPayload = (values: VideoEditorFormValues) => {
  const streamMode = values.streamMode || 'GB28181';
  const sipAuthEnabled = streamMode === 'GB28181' ? Boolean(values.sipAuthEnabled) : false;
  return {
    productKey: trimOptionalValue(values.productKey),
    name: values.name?.trim(),
    streamMode,
    gbDeviceId: trimOptionalValue(values.gbDeviceId),
    gbDomain: trimOptionalValue(values.gbDomain),
    transport: streamMode === 'GB28181' ? trimOptionalValue(values.transport) || 'UDP' : undefined,
    sipAuthEnabled,
    sipPassword: sipAuthEnabled ? trimOptionalValue(values.sipPassword) : undefined,
    ip: trimOptionalValue(values.ip),
    port: normalizeOptionalPort(values.port),
    manufacturer: trimOptionalValue(values.manufacturer),
    model: trimOptionalValue(values.model),
  };
};

const VideoList: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const productContext = useMemo(() => parseVideoProductContext(searchParams), [searchParams]);
  const [data, setData] = useState<VideoDeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingDevice, setEditingDevice] = useState<VideoDeviceRecord | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorForm] = Form.useForm<VideoEditorFormValues>();
  const [pendingEditorValues, setPendingEditorValues] = useState<VideoEditorFormValues>(buildEditorInitialValues());
  const [productOptions, setProductOptions] = useState<VideoProductOption[]>([]);
  const currentEditorProductKey = Form.useWatch('productKey', editorForm);
  const currentEditorStreamMode = Form.useWatch('streamMode', editorForm) || productContext?.protocol || 'GB28181';
  const currentSipAuthEnabled = Boolean(Form.useWatch('sipAuthEnabled', editorForm));
  const [keyword, setKeyword] = useState('');
  const [filterMode, setFilterMode] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerDevice, setPlayerDevice] = useState<VideoDeviceRecord | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const selectedEditorProduct = useMemo(
    () => productOptions.find((item) => item.productKey === currentEditorProductKey),
    [currentEditorProductKey, productOptions],
  );
  const currentCreateProtocol =
    editorMode === 'create' ? productContext?.protocol || selectedEditorProduct?.protocol : undefined;
  const isCreateProductLocked = editorMode === 'create' && Boolean(productContext);
  const isCreateProtocolLocked = editorMode === 'create' && Boolean(currentCreateProtocol);

  const fetchProductOptions = async () => {
    try {
      const res = await productApi.list({ pageNum: 1, pageSize: 500, category: 'CAMERA' });
      const records = (res.data.data.records || []) as Array<Record<string, unknown>>;
      setProductOptions(
        records
          .map((item) => ({
            id: Number(item.id),
            name: String(item.name || ''),
            productKey: String(item.productKey || ''),
            protocol: String(item.protocol || ''),
          }))
          .filter((item) => item.id > 0 && item.productKey && VIDEO_PROTOCOL_VALUES.has(item.protocol)),
      );
    } catch {
      setProductOptions([]);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await videoApi.list({
        ...params,
        keyword: keyword || undefined,
        streamMode: filterMode,
        status: filterStatus,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载视频设备列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProductOptions();
  }, []);

  useEffect(() => {
    void fetchData();
  }, [keyword, params.pageNum, params.pageSize, filterMode, filterStatus]);

  useEffect(() => {
    if (!productContext?.autoCreate) {
      return;
    }

    setEditorMode('create');
    setEditingDevice(null);
    setPendingEditorValues(buildEditorInitialValues(productContext));
    setEditorOpen(true);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('autoCreate');
    setSearchParams(nextSearchParams, { replace: true });
  }, [productContext, searchParams, setSearchParams]);

  useEffect(() => {
    if (!editorOpen || editorMode !== 'create' || !currentCreateProtocol) {
      return;
    }
    if (editorForm.getFieldValue('streamMode') !== currentCreateProtocol) {
      editorForm.setFieldValue('streamMode', currentCreateProtocol);
    }
  }, [currentCreateProtocol, editorForm, editorMode, editorOpen]);

  useEffect(() => {
    if (currentEditorStreamMode === 'GB28181' && !editorForm.getFieldValue('transport')) {
      editorForm.setFieldValue('transport', 'UDP');
    }
    if (currentEditorStreamMode !== 'GB28181') {
      editorForm.setFieldValue('sipAuthEnabled', false);
      editorForm.setFieldValue('sipPassword', undefined);
    }
  }, [currentEditorStreamMode, editorForm]);

  const stats = useMemo(
    () => ({
      online: data.filter((item) => item.status === 'ONLINE').length,
      offline: data.filter((item) => item.status === 'OFFLINE').length,
      gb: data.filter((item) => item.streamMode === 'GB28181').length,
    }),
    [data],
  );

  const openCreateDrawer = () => {
    setEditorMode('create');
    setEditingDevice(null);
    setEditorLoading(false);
    setPendingEditorValues(buildEditorInitialValues(productContext));
    setEditorOpen(true);
  };

  const openEditDrawer = async (record: VideoDeviceRecord) => {
    setEditorLoading(true);
    try {
      const res = await videoApi.get(record.id);
      const detail = res.data.data as VideoDeviceRecord;
      setEditorMode('edit');
      setEditingDevice(detail);
      setPendingEditorValues(buildEditorInitialValues(productContext, detail));
      setEditorOpen(true);
    } catch {
      message.error('加载视频设备详情失败');
    } finally {
      setEditorLoading(false);
    }
  };

  const closeEditorDrawer = () => {
    setEditorOpen(false);
    setEditingDevice(null);
    setEditorMode('create');
    setEditorLoading(false);
    editorForm.resetFields();
  };

  const clearProductContext = () => {
    const nextSearchParams = new URLSearchParams(searchParams);
    VIDEO_CONTEXT_PARAM_KEYS.forEach((key) => nextSearchParams.delete(key));
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleSubmitEditor = async (values: VideoEditorFormValues) => {
    setEditorLoading(true);
    try {
      if (editorMode === 'edit' && editingDevice) {
        await videoApi.update(editingDevice.id, buildEditorPayload(values));
        message.success('视频设备更新成功');
      } else {
        await videoApi.create(buildEditorPayload(values));
        setParams((current) => ({ ...current, pageNum: 1 }));
        message.success('视频设备创建成功');
      }
      closeEditorDrawer();
      void fetchData();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = (error as { response?: { data?: { message?: string } } }).response;
        if (response?.data?.message) {
          message.error(response.data.message);
          return;
        }
      }
      message.error(editorMode === 'edit' ? '更新失败' : '创建失败');
    } finally {
      setEditorLoading(false);
    }
  };

  const handleDelete = (record: VideoDeviceRecord) => {
    Modal.confirm({
      title: '确认删除视频设备？',
      content: `删除「${record.name}」？关联的通道和流会话将一并删除。`,
      onOk: async () => {
        await videoApi.delete(record.id);
        message.success('删除成功');
        void fetchData();
      },
    });
  };

  const handlePlay = async (record: VideoDeviceRecord) => {
    setPlayerDevice(record);
    setPlayerOpen(true);
    setPlayerLoading(true);
    setStreamInfo(null);
    try {
      const res = await videoApi.startStream(record.id);
      const session = res.data.data;
      setStreamInfo({ flvUrl: session.flvUrl, hlsUrl: session.hlsUrl, webrtcUrl: session.webrtcUrl });
    } catch {
      message.error('启动视频流失败');
    } finally {
      setPlayerLoading(false);
    }
  };

  const handleStop = async () => {
    if (!playerDevice) {
      return;
    }
    try {
      await videoApi.stopStream(playerDevice.id);
      message.success('视频流已停止');
      setStreamInfo(null);
    } catch {
      message.error('停止视频流失败');
    }
  };

  const handleClosePlayer = async () => {
    if (playerDevice && streamInfo) {
      try {
        await videoApi.stopStream(playerDevice.id);
      } catch {
        // ignore close cleanup failure
      }
    }
    setPlayerOpen(false);
    setStreamInfo(null);
    setPlayerDevice(null);
  };

  const handleSnapshot = async () => {
    if (!playerDevice) {
      return;
    }
    try {
      const res = await videoApi.snapshot(playerDevice.id);
      const url = res.data.data?.imageUrl;
      if (url && url !== 'snapshot_failed' && url !== 'no_active_stream') {
        message.success('截图成功');
        Modal.info({
          title: '截图',
          content: <img src={url} alt="snapshot" style={{ width: '100%' }} />,
          width: 560,
        });
      } else {
        message.warning('截图失败，请确保有活跃的视频流');
      }
    } catch {
      message.error('截图失败');
    }
  };

  const handlePtzControl = async (command: number, speed: number) => {
    if (!playerDevice) {
      return;
    }
    try {
      await videoApi.ptz(playerDevice.id, { command: ptzCmdMap[command] || 'STOP', speed });
    } catch {
      message.error('PTZ 控制失败');
    }
  };

  const handleQueryCatalog = async (record: VideoDeviceRecord) => {
    try {
      await videoApi.queryCatalog(record.id);
      message.success('目录查询指令已发送，通道列表将自动更新');
    } catch {
      message.error('目录查询失败');
    }
  };

  const handleQueryDeviceInfo = async (record: VideoDeviceRecord) => {
    try {
      await videoApi.queryDeviceInfo(record.id);
      message.success('设备信息查询指令已发送');
    } catch {
      message.error('设备信息查询失败');
    }
  };

  const columns: ColumnsType<VideoDeviceRecord> = [
    { title: '设备名称', dataIndex: 'name', width: 180, ellipsis: true },
    {
      title: '接入方式',
      dataIndex: 'streamMode',
      width: 100,
      render: (value: string) => <Tag>{modeLabels[value] || value}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (value: string) => <Tag color={statusColors[value]}>{statusLabels[value] || value}</Tag>,
    },
    { title: 'GB 设备编号', dataIndex: 'gbDeviceId', width: 160, ellipsis: true, render: (value: string) => value || '-' },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (value: string) => value || '-' },
    { title: '厂商', dataIndex: 'manufacturer', width: 110, ellipsis: true, render: (value: string) => value || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作',
      width: 420,
      fixed: 'right',
      render: (_: unknown, record: VideoDeviceRecord) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openEditDrawer(record)}>
            编辑
          </Button>
          {record.status === 'ONLINE' ? (
            <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handlePlay(record)}>
              播放
            </Button>
          ) : null}
          {record.streamMode === 'GB28181' && record.status === 'ONLINE' ? (
            <>
              <Button type="link" size="small" icon={<UnorderedListOutlined />} onClick={() => handleQueryCatalog(record)}>
                目录
              </Button>
              <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => handleQueryDeviceInfo(record)}>
                信息
              </Button>
            </>
          ) : null}
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="视频监控"
        description={`共 ${total} 台视频设备，${stats.online} 台在线`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            添加设备
          </Button>
        }
      />

      {productContext ? (
        <Card size="small" style={{ marginBottom: 16, borderRadius: 12 }}>
          <Space
            align="start"
            style={{ width: '100%', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="产品名称">
                {productContext.productName || productContext.productKey}
              </Descriptions.Item>
              <Descriptions.Item label="ProductKey">{productContext.productKey}</Descriptions.Item>
              <Descriptions.Item label="接入方式">
                {modeLabels[productContext.protocol] || productContext.protocol}
              </Descriptions.Item>
            </Descriptions>
            <Space>
              <Button type="primary" onClick={openCreateDrawer}>
                新增设备
              </Button>
              <Button onClick={clearProductContext}>清空联动</Button>
            </Space>
          </Space>
        </Card>
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '设备总数', value: total, icon: <VideoCameraOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '在线', value: stats.online, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '离线', value: stats.offline, icon: <DisconnectOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
          { title: 'GB28181', value: stats.gb, icon: <CameraOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
        ].map((item) => (
          <Col xs={12} sm={6} key={item.title}>
            <Card
              bodyStyle={{ padding: '14px 16px' }}
              style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: item.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    color: item.color,
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{item.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{item.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        bodyStyle={{ padding: '12px 16px' }}
        style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
      >
        <Space wrap>
          <Input.Search
            placeholder="搜索名称/设备编号/IP"
            allowClear
            enterButton="查询"
            style={{ width: 260 }}
            onSearch={(value: string) => {
              setKeyword(value);
              setParams({ ...params, pageNum: 1 });
            }}
          />
          <Select
            placeholder="接入方式"
            allowClear
            style={{ width: 130 }}
            options={VIDEO_MODE_OPTIONS}
            onChange={(value: string) => {
              setFilterMode(value);
              setParams({ ...params, pageNum: 1 });
            }}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 100 }}
            options={[
              { value: 'ONLINE', label: '在线' },
              { value: 'OFFLINE', label: '离线' },
            ]}
            onChange={(value: string) => {
              setFilterStatus(value);
              setParams({ ...params, pageNum: 1 });
            }}
          />
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1460 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, pageSize: number) => setParams({ pageNum: page, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={
          editorMode === 'edit'
            ? `编辑视频设备 - ${editingDevice?.name || ''}`
            : productContext
              ? `添加视频设备 - ${productContext.productName || productContext.productKey}`
              : '添加视频设备'
        }
        placement="right"
        width={640}
        open={editorOpen}
        afterOpenChange={(open) => {
          if (!open) {
            return;
          }
          editorForm.resetFields();
          editorForm.setFieldsValue(pendingEditorValues);
        }}
        onClose={closeEditorDrawer}
        destroyOnClose
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeEditorDrawer}>取消</Button>
            <Button type="primary" loading={editorLoading} onClick={() => editorForm.submit()}>
              {editorMode === 'edit' ? '保存修改' : '创建设备'}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {editorMode === 'create' && productContext ? (
            <Card size="small" title="当前产品上下文" style={{ borderRadius: 16 }}>
              <Descriptions column={1} size="small">
                <Descriptions.Item label="产品名称">
                  {productContext.productName || productContext.productKey}
                </Descriptions.Item>
                <Descriptions.Item label="ProductKey">{productContext.productKey}</Descriptions.Item>
                <Descriptions.Item label="接入方式">
                  {modeLabels[productContext.protocol] || productContext.protocol}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          ) : null}

          <Form form={editorForm} layout="vertical" onFinish={handleSubmitEditor} preserve={false}>
            {editorMode === 'create' ? (
              productContext ? (
                <Form.Item name="productKey" hidden>
                  <Input />
                </Form.Item>
              ) : (
                <Form.Item
                  name="productKey"
                  label="所属产品"
                  rules={[{ required: true, message: '请选择产品' }]}
                >
                  <Select
                    showSearch
                    placeholder="选择摄像头产品"
                    disabled={isCreateProductLocked}
                    optionFilterProp="label"
                    options={productOptions.map((item) => ({
                      value: item.productKey,
                      label: `${item.name} (${item.productKey})`,
                    }))}
                  />
                </Form.Item>
              )
            ) : null}

            <Form.Item
              name="name"
              label="设备名称"
              rules={[{ required: true, message: '请输入设备名称' }]}
            >
              <Input placeholder="如：门口摄像头" maxLength={128} />
            </Form.Item>

            <Form.Item
              name="streamMode"
              label="接入方式"
              rules={[{ required: true, message: '请选择接入方式' }]}
            >
              <Select disabled={isCreateProtocolLocked} options={VIDEO_MODE_OPTIONS} />
            </Form.Item>

            {currentEditorStreamMode === 'GB28181' ? (
              <>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="gbDeviceId" label="GB 设备编号">
                      <Input placeholder="20 位国标编号" maxLength={64} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="gbDomain" label="GB 域">
                      <Input placeholder="SIP 域" maxLength={64} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item name="transport" label="传输协议">
                      <Select
                        options={[
                          { value: 'UDP', label: 'UDP' },
                          { value: 'TCP', label: 'TCP' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="sipAuthEnabled" label="SIP 鉴权" valuePropName="checked">
                      <Switch checkedChildren="启用" unCheckedChildren="关闭" />
                    </Form.Item>
                  </Col>
                </Row>

                {currentSipAuthEnabled ? (
                  <Form.Item
                    name="sipPassword"
                    label="SIP 密码"
                    rules={[
                      {
                        validator: async (_, value) => {
                          const trimmed = typeof value === 'string' ? value.trim() : '';
                          if (trimmed) {
                            return;
                          }
                          if (editorMode === 'edit' && editingDevice?.sipAuthEnabled) {
                            return;
                          }
                          throw new Error('请输入SIP密码');
                        },
                      },
                    ]}
                  >
                    <Input.Password
                      placeholder={editorMode === 'edit' && editingDevice?.sipAuthEnabled ? '留空则保持原密码' : '请输入SIP密码'}
                      maxLength={128}
                    />
                  </Form.Item>
                ) : null}
              </>
            ) : null}

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="ip" label="IP 地址">
                  <Input placeholder="设备 IP" maxLength={64} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="port" label="端口">
                  <InputNumber style={{ width: '100%' }} placeholder="SIP / RTSP / RTMP 端口" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col xs={24} md={12}>
                <Form.Item name="manufacturer" label="厂商">
                  <Input placeholder="如：海康威视" maxLength={128} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="model" label="型号">
                  <Input maxLength={128} />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        </Space>
      </Drawer>

      <Drawer
        title={playerDevice ? `实时播放 - ${playerDevice.name}` : '实时播放'}
        placement="right"
        width={720}
        open={playerOpen}
        onClose={handleClosePlayer}
        destroyOnClose
        extra={
          <Space>
            <Button icon={<CameraOutlined />} onClick={handleSnapshot} disabled={!streamInfo}>
              截图
            </Button>
            <Button icon={<PauseCircleOutlined />} danger onClick={handleStop} disabled={!streamInfo}>
              停止
            </Button>
          </Space>
        }
      >
        {playerLoading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>正在连接视频流...</div>
        ) : null}

        {streamInfo ? (
          <div>
            <VideoPlayer url={streamInfo.flvUrl} height={380} />

            <Tabs
              defaultActiveKey="ptz"
              style={{ marginTop: 16 }}
              items={[
                {
                  key: 'ptz',
                  label: '云台控制',
                  children: (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                      <PtzControlPanel onControl={handlePtzControl} disabled={playerDevice?.streamMode !== 'GB28181'} />
                      {playerDevice?.streamMode !== 'GB28181' ? (
                        <div style={{ marginLeft: 16, color: '#999', fontSize: 13, alignSelf: 'center' }}>
                          PTZ 云台控制仅支持 GB/T 28181 设备。<br />
                          RTSP/RTMP 设备需通过 ONVIF 协议控制。
                        </div>
                      ) : null}
                    </div>
                  ),
                },
                {
                  key: 'urls',
                  label: '播放地址',
                  children: (
                    <div style={{ fontSize: 13 }}>
                      <p>
                        <strong>FLV：</strong>
                        <code style={{ wordBreak: 'break-all' }}>{streamInfo.flvUrl}</code>
                      </p>
                      <p>
                        <strong>HLS：</strong>
                        <code style={{ wordBreak: 'break-all' }}>{streamInfo.hlsUrl}</code>
                      </p>
                      <p>
                        <strong>WebRTC：</strong>
                        <code style={{ wordBreak: 'break-all' }}>{streamInfo.webrtcUrl}</code>
                      </p>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        ) : null}

        {!playerLoading && !streamInfo ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            暂无视频流。请确保设备在线并重新播放。
          </div>
        ) : null}
      </Drawer>
    </div>
  );
};

export default VideoList;
