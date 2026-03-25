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
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  UnorderedListOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { videoApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import VideoPlayer from '../../components/video/VideoPlayer';
import PtzControlPanel from '../../components/video/PtzControlPanel';

interface VideoDeviceRecord {
  id: number;
  name: string;
  gbDeviceId: string;
  streamMode: string;
  ip: string;
  port: number;
  manufacturer: string;
  model: string;
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

interface VideoCreateFormValues {
  name?: string;
  streamMode?: string;
  gbDeviceId?: string;
  gbDomain?: string;
  transport?: string;
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

const buildCreateInitialValues = (productContext?: VideoProductContext | null): VideoCreateFormValues => {
  const streamMode = productContext?.protocol || 'GB28181';
  return {
    streamMode,
    transport: streamMode === 'GB28181' ? 'UDP' : undefined,
  };
};

const buildCreatePayload = (values: VideoCreateFormValues) => {
  const streamMode = values.streamMode || 'GB28181';
  return {
    name: values.name?.trim(),
    streamMode,
    gbDeviceId: trimOptionalValue(values.gbDeviceId),
    gbDomain: trimOptionalValue(values.gbDomain),
    transport: streamMode === 'GB28181' ? trimOptionalValue(values.transport) || 'UDP' : undefined,
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
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<VideoCreateFormValues>();
  const [pendingCreateValues, setPendingCreateValues] = useState<VideoCreateFormValues>(buildCreateInitialValues());
  const currentCreateMode = Form.useWatch('streamMode', createForm) || productContext?.protocol || 'GB28181';
  const [keyword, setKeyword] = useState('');
  const [filterMode, setFilterMode] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerDevice, setPlayerDevice] = useState<VideoDeviceRecord | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);

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
    void fetchData();
  }, [keyword, params.pageNum, params.pageSize, filterMode, filterStatus]);

  useEffect(() => {
    if (!productContext?.autoCreate) {
      return;
    }

    setPendingCreateValues(buildCreateInitialValues(productContext));
    setCreateOpen(true);

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('autoCreate');
    setSearchParams(nextSearchParams, { replace: true });
  }, [createForm, productContext, searchParams, setSearchParams]);

  useEffect(() => {
    if (!createOpen || !productContext?.protocol) {
      return;
    }
    if (createForm.getFieldValue('streamMode') !== productContext.protocol) {
      createForm.setFieldValue('streamMode', productContext.protocol);
    }
  }, [createForm, createOpen, productContext]);

  useEffect(() => {
    if (currentCreateMode === 'GB28181' && !createForm.getFieldValue('transport')) {
      createForm.setFieldValue('transport', 'UDP');
    }
  }, [createForm, currentCreateMode]);

  const stats = useMemo(
    () => ({
      online: data.filter((item) => item.status === 'ONLINE').length,
      offline: data.filter((item) => item.status === 'OFFLINE').length,
      gb: data.filter((item) => item.streamMode === 'GB28181').length,
    }),
    [data],
  );

  const openCreateDrawer = () => {
    setPendingCreateValues(buildCreateInitialValues(productContext));
    setCreateOpen(true);
  };

  const closeCreateDrawer = () => {
    setCreateOpen(false);
    createForm.resetFields();
  };

  const clearProductContext = () => {
    const nextSearchParams = new URLSearchParams(searchParams);
    VIDEO_CONTEXT_PARAM_KEYS.forEach((key) => nextSearchParams.delete(key));
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleCreate = async (values: VideoCreateFormValues) => {
    try {
      await videoApi.create(buildCreatePayload(values));
      message.success('视频设备创建成功');
      closeCreateDrawer();
      void fetchData();
    } catch {
      message.error('创建失败');
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
      width: 340,
      fixed: 'right',
      render: (_: unknown, record: VideoDeviceRecord) => (
        <Space>
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
          scroll={{ x: 1400 }}
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
        title={productContext ? `添加视频设备 - ${productContext.productName || productContext.productKey}` : '添加视频设备'}
        placement="right"
        width={640}
        open={createOpen}
        afterOpenChange={(open) => {
          if (!open) {
            return;
          }
          createForm.resetFields();
          createForm.setFieldsValue(pendingCreateValues);
        }}
        onClose={closeCreateDrawer}
        destroyOnClose
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeCreateDrawer}>取消</Button>
            <Button type="primary" onClick={() => createForm.submit()}>
              创建设备
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {productContext ? (
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

          <Form form={createForm} layout="vertical" onFinish={handleCreate} preserve={false}>
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
              <Select disabled={Boolean(productContext)} options={VIDEO_MODE_OPTIONS} />
            </Form.Item>

            {currentCreateMode === 'GB28181' ? (
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

                <Form.Item name="transport" label="传输协议">
                  <Select
                    options={[
                      { value: 'UDP', label: 'UDP' },
                      { value: 'TCP', label: 'TCP' },
                    ]}
                  />
                </Form.Item>
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
