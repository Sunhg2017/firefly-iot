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
  EditOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  UnorderedListOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { deviceVideoApi, productApi, videoControlApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import VideoPlayer from '../../components/video/VideoPlayer';
import PtzControlPanel from '../../components/video/PtzControlPanel';

type EditorMode = 'create' | 'edit';
interface VideoListProps { embedded?: boolean; }

interface VideoDeviceRecord {
  id: number;
  productKey?: string;
  productName?: string;
  name: string;
  deviceName?: string;
  gbDeviceId?: string;
  gbDomain?: string;
  transport?: string;
  streamMode: string;
  sipAuthEnabled?: boolean;
  ip?: string;
  port?: number;
  sourceUrl?: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
  status: string;
  lastRegisteredAt?: string;
  createdAt: string;
}

interface StreamInfo {
  flvUrl: string;
  hlsUrl: string;
  webrtcUrl: string;
}

interface VideoChannelRecord {
  id: number;
  deviceId: number;
  channelId: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  status?: string;
  ptzType?: number;
  subCount?: number;
  longitude?: number;
  latitude?: number;
  createdAt?: string;
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
  sipPassword?: string;
  ip?: string;
  port?: number | string;
  sourceUrl?: string;
  manufacturer?: string;
  model?: string;
  firmware?: string;
}

interface VideoListFilters {
  keyword: string;
  streamMode?: string;
  status?: string;
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
const EMPTY_VIDEO_FILTERS: VideoListFilters = { keyword: '' };

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

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const unwrapBusinessResponse = <T,>(
  response: { data?: { code?: number; message?: string; data?: T } },
  fallback: string,
): T => {
  if (response.data?.code !== 0) {
    throw new Error(response.data?.message || fallback);
  }
  return response.data?.data as T;
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
      sipPassword: undefined,
      ip: device.ip,
      port: device.port,
      sourceUrl: device.sourceUrl,
      manufacturer: device.manufacturer,
      model: device.model,
      firmware: device.firmware,
    };
  }

  const streamMode = productContext?.protocol || 'GB28181';
  return {
    productKey: productContext?.productKey,
    streamMode,
    transport: streamMode === 'GB28181' ? 'UDP' : undefined,
  };
};

const buildEditorPayload = (values: VideoEditorFormValues) => {
  const streamMode = values.streamMode || 'GB28181';
  return {
    productKey: trimOptionalValue(values.productKey),
    name: values.name?.trim(),
    streamMode,
    gbDeviceId: trimOptionalValue(values.gbDeviceId),
    gbDomain: trimOptionalValue(values.gbDomain),
    transport: streamMode === 'GB28181' ? trimOptionalValue(values.transport) || 'UDP' : undefined,
    sipPassword: streamMode === 'GB28181' ? trimOptionalValue(values.sipPassword) : undefined,
    ip: trimOptionalValue(values.ip),
    port: normalizeOptionalPort(values.port),
    sourceUrl: trimOptionalValue(values.sourceUrl),
    manufacturer: trimOptionalValue(values.manufacturer),
    model: trimOptionalValue(values.model),
    firmware: trimOptionalValue(values.firmware),
  };
};

const VideoList: React.FC<VideoListProps> = ({ embedded: _embedded = false }) => {
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
  const [draftFilters, setDraftFilters] = useState<VideoListFilters>(EMPTY_VIDEO_FILTERS);
  const [filters, setFilters] = useState<VideoListFilters>(EMPTY_VIDEO_FILTERS);

  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerDevice, setPlayerDevice] = useState<VideoDeviceRecord | null>(null);
  const [playerChannel, setPlayerChannel] = useState<VideoChannelRecord | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [channelDrawerOpen, setChannelDrawerOpen] = useState(false);
  const [channelDevice, setChannelDevice] = useState<VideoDeviceRecord | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channels, setChannels] = useState<VideoChannelRecord[]>([]);
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
      const page = unwrapBusinessResponse<{ records?: Array<Record<string, unknown>> }>(res, '加载产品列表失败');
      const records = (page.records || []) as Array<Record<string, unknown>>;
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
      const res = await deviceVideoApi.list({
        ...params,
        keyword: filters.keyword || undefined,
        streamMode: filters.streamMode,
        status: filters.status,
      });
      const page = unwrapBusinessResponse<{ records?: VideoDeviceRecord[]; total?: number }>(res, '加载视频设备列表失败');
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载视频设备列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProductOptions();
  }, []);

  useEffect(() => {
    void fetchData();
  }, [filters, params.pageNum, params.pageSize]);

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

  const applyFilters = () => {
    setFilters({
      keyword: trimOptionalValue(draftFilters.keyword) || '',
      streamMode: draftFilters.streamMode,
      status: draftFilters.status,
    });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_VIDEO_FILTERS);
    setFilters({ ...EMPTY_VIDEO_FILTERS });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const openEditDrawer = async (record: VideoDeviceRecord) => {
    setEditorLoading(true);
    try {
      const res = await deviceVideoApi.get(record.id);
      const detail = unwrapBusinessResponse<VideoDeviceRecord>(res, '加载视频设备详情失败');
      setEditorMode('edit');
      setEditingDevice(detail);
      setPendingEditorValues(buildEditorInitialValues(productContext, detail));
      setEditorOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载视频设备详情失败'));
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
        const response = await deviceVideoApi.update(editingDevice.id, buildEditorPayload(values));
        unwrapBusinessResponse(response, '视频设备更新失败');
        message.success('视频设备更新成功');
      } else {
        const response = await deviceVideoApi.create(buildEditorPayload(values));
        unwrapBusinessResponse(response, '视频设备创建失败');
        setParams((current) => ({ ...current, pageNum: 1 }));
        message.success('视频设备创建成功');
      }
      closeEditorDrawer();
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, editorMode === 'edit' ? '更新失败' : '创建失败'));
    } finally {
      setEditorLoading(false);
    }
  };

  const handleDelete = (record: VideoDeviceRecord) => {
    Modal.confirm({
      title: '确认删除视频设备？',
      content: `删除「${record.name}」？关联的通道和流会话将一并删除。`,
      onOk: async () => {
        const response = await deviceVideoApi.delete(record.id);
        unwrapBusinessResponse(response, '删除视频设备失败');
        message.success('删除成功');
        void fetchData();
      },
    });
  };

  const loadChannels = async (record: VideoDeviceRecord) => {
    setChannelLoading(true);
    try {
      const response = await deviceVideoApi.channels(record.id);
      const records = unwrapBusinessResponse<VideoChannelRecord[]>(response, '加载视频通道失败');
      setChannels(records || []);
    } catch (error) {
      message.error(getErrorMessage(error, '加载视频通道失败'));
    } finally {
      setChannelLoading(false);
    }
  };

  const handleOpenChannels = async (record: VideoDeviceRecord) => {
    setChannelDevice(record);
    setChannels([]);
    setChannelDrawerOpen(true);
    await loadChannels(record);
  };

  const handlePlay = async (record: VideoDeviceRecord, channel?: VideoChannelRecord) => {
    setPlayerDevice(record);
    setPlayerChannel(channel || null);
    setPlayerOpen(true);
    setPlayerLoading(true);
    setRecording(false);
    setStreamInfo(null);
    try {
      const res = await videoControlApi.startStream(
        record.id,
        channel?.channelId ? { channelId: channel.channelId } : undefined,
      );
      const session = unwrapBusinessResponse<StreamInfo>(res, '启动视频流失败');
      setStreamInfo({ flvUrl: session.flvUrl, hlsUrl: session.hlsUrl, webrtcUrl: session.webrtcUrl });
    } catch (error) {
      message.error(getErrorMessage(error, '启动视频流失败'));
    } finally {
      setPlayerLoading(false);
    }
  };

  const handleStop = async () => {
    if (!playerDevice) {
      return;
    }
    try {
      const response = await videoControlApi.stopStream(playerDevice.id);
      unwrapBusinessResponse(response, '停止视频流失败');
      message.success('视频流已停止');
      setRecording(false);
      setStreamInfo(null);
    } catch (error) {
      message.error(getErrorMessage(error, '停止视频流失败'));
    }
  };

  const handleClosePlayer = async () => {
    if (playerDevice && streamInfo) {
      try {
        const response = await videoControlApi.stopStream(playerDevice.id);
        unwrapBusinessResponse(response, '停止视频流失败');
      } catch {
        // ignore close cleanup failure
      }
    }
    setPlayerOpen(false);
    setRecording(false);
    setStreamInfo(null);
    setPlayerDevice(null);
    setPlayerChannel(null);
  };

  const handleSnapshot = async () => {
    if (!playerDevice) {
      return;
    }
    try {
      const res = await videoControlApi.snapshot(playerDevice.id);
      const data = unwrapBusinessResponse<{ imageUrl?: string }>(res, '截图失败');
      const url = data?.imageUrl;
      if (url) {
        message.success('截图成功');
        Modal.info({
          title: '截图',
          content: <img src={url} alt="snapshot" style={{ width: '100%' }} />,
          width: 560,
        });
      } else {
        message.warning('截图失败，请确保有活跃的视频流');
      }
    } catch (error) {
      message.error(getErrorMessage(error, '截图失败'));
    }
  };

  const handlePtzControl = async (command: number, speed: number) => {
    if (!playerDevice) {
      return;
    }
    try {
      const response = await videoControlApi.ptz(playerDevice.id, {
        channelId: playerChannel?.channelId,
        command: Number.isFinite(command) ? command : 0,
        speed,
      });
      unwrapBusinessResponse(response, 'PTZ 控制失败');
    } catch (error) {
      message.error(getErrorMessage(error, 'PTZ 控制失败'));
    }
  };

  const handleStartRecording = async () => {
    if (!playerDevice) {
      return;
    }
    setRecordingLoading(true);
    try {
      const response = await videoControlApi.startRecording(playerDevice.id);
      unwrapBusinessResponse(response, '开始录像失败');
      setRecording(true);
      message.success('已开始录像');
    } catch (error) {
      message.error(getErrorMessage(error, '开始录像失败'));
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleStopRecording = async () => {
    if (!playerDevice) {
      return;
    }
    setRecordingLoading(true);
    try {
      const response = await videoControlApi.stopRecording(playerDevice.id);
      unwrapBusinessResponse(response, '停止录像失败');
      setRecording(false);
      message.success('已停止录像');
    } catch (error) {
      message.error(getErrorMessage(error, '停止录像失败'));
    } finally {
      setRecordingLoading(false);
    }
  };

  const handleQueryCatalog = async (record: VideoDeviceRecord) => {
    try {
      const response = await videoControlApi.queryCatalog(record.id);
      unwrapBusinessResponse(response, '目录查询失败');
      message.success('目录查询指令已发送');
      if (channelDevice?.id === record.id) {
        window.setTimeout(() => {
          void loadChannels(record);
        }, 1500);
      }
    } catch (error) {
      message.error(getErrorMessage(error, '目录查询失败'));
    }
  };

  const handleQueryDeviceInfo = async (record: VideoDeviceRecord) => {
    try {
      const response = await videoControlApi.queryDeviceInfo(record.id);
      unwrapBusinessResponse(response, '设备信息查询失败');
      message.success('设备信息查询指令已发送');
    } catch (error) {
      message.error(getErrorMessage(error, '设备信息查询失败'));
    }
  };

  const columns: ColumnsType<VideoDeviceRecord> = [
    {
      title: '产品',
      dataIndex: 'productName',
      width: 180,
      ellipsis: true,
      render: (_: string, record: VideoDeviceRecord) => record.productName || record.productKey || '-',
    },
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
      width: 500,
      fixed: 'right',
      render: (_: unknown, record: VideoDeviceRecord) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => void openEditDrawer(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<UnorderedListOutlined />} onClick={() => void handleOpenChannels(record)}>
            通道
          </Button>
          {record.status === 'ONLINE' ? (
            <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => void handlePlay(record)}>
              播放
            </Button>
          ) : null}
          {record.streamMode === 'GB28181' && record.status === 'ONLINE' ? (
            <>
              <Button type="link" size="small" icon={<ReloadOutlined />} onClick={() => void handleQueryCatalog(record)}>
                目录
              </Button>
              <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => void handleQueryDeviceInfo(record)}>
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
        title="视频设备"
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

      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Input
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索名称/设备编号/IP"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => {
              setDraftFilters((current) => ({ ...current, keyword: event.target.value }));
            }}
            onPressEnter={applyFilters}
          />
          <Select
            className="ff-query-field"
            placeholder="接入方式"
            allowClear
            style={{ width: 150 }}
            options={VIDEO_MODE_OPTIONS}
            value={draftFilters.streamMode}
            onChange={(value: string | undefined) => {
              setDraftFilters((current) => ({ ...current, streamMode: value }));
            }}
          />
          <Select
            className="ff-query-field"
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            options={[
              { value: 'ONLINE', label: '在线' },
              { value: 'OFFLINE', label: '离线' },
            ]}
            value={draftFilters.status}
            onChange={(value: string | undefined) => {
              setDraftFilters((current) => ({ ...current, status: value }));
            }}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>
              查询
            </Button>
          </div>
        </div>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1640 }}
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
                    <Form.Item
                      name="gbDeviceId"
                      label="GB 设备编号"
                      rules={[{ required: true, message: '请输入 GB 设备编号' }]}
                    >
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
                  <Col xs={24} md={12} />
                </Row>

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

            {currentEditorStreamMode !== 'GB28181' ? (
              <Form.Item name="sourceUrl" label="视频源地址">
                <Input placeholder="如：rtsp://host:554/live" maxLength={1024} />
              </Form.Item>
            ) : null}

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

            <Form.Item name="firmware" label="固件版本">
              <Input maxLength={64} />
            </Form.Item>
          </Form>
        </Space>
      </Drawer>

      <Drawer
        title={channelDevice ? `视频通道 - ${channelDevice.name}` : '视频通道'}
        placement="right"
        width={720}
        open={channelDrawerOpen}
        destroyOnClose
        onClose={() => {
          setChannelDrawerOpen(false);
          setChannelDevice(null);
          setChannels([]);
        }}
        extra={
          channelDevice ? (
            <Space>
              {channelDevice.streamMode === 'GB28181' && channelDevice.status === 'ONLINE' ? (
                <Button icon={<ReloadOutlined />} onClick={() => void handleQueryCatalog(channelDevice)}>
                  目录同步
                </Button>
              ) : null}
              <Button onClick={() => void loadChannels(channelDevice)}>刷新</Button>
            </Space>
          ) : undefined
        }
      >
        <Table<VideoChannelRecord>
          rowKey="id"
          loading={channelLoading}
          dataSource={channels}
          pagination={false}
          locale={{ emptyText: '暂无通道数据' }}
          columns={[
            { title: '通道编号', dataIndex: 'channelId', width: 180, ellipsis: true },
            { title: '通道名称', dataIndex: 'name', width: 180, ellipsis: true, render: (value: string) => value || '-' },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (value: string) => <Tag color={statusColors[value] || 'default'}>{statusLabels[value] || value || '-'}</Tag>,
            },
            { title: '厂商', dataIndex: 'manufacturer', width: 120, ellipsis: true, render: (value: string) => value || '-' },
            { title: '型号', dataIndex: 'model', width: 120, ellipsis: true, render: (value: string) => value || '-' },
            {
              title: '操作',
              width: 120,
              fixed: 'right',
              render: (_: unknown, record: VideoChannelRecord) => (
                <Button type="link" size="small" onClick={() => channelDevice && void handlePlay(channelDevice, record)}>
                  播放
                </Button>
              ),
            },
          ]}
          scroll={{ x: 900 }}
        />
      </Drawer>

      <Drawer
        title={
          playerDevice
            ? `实时播放 - ${playerDevice.name}${playerChannel ? ` / ${playerChannel.name || playerChannel.channelId}` : ''}`
            : '实时播放'
        }
        placement="right"
        width={720}
        open={playerOpen}
        onClose={handleClosePlayer}
        destroyOnClose
        extra={
          <Space>
            <Button
              type={recording ? 'default' : 'primary'}
              loading={recordingLoading}
              onClick={recording ? handleStopRecording : handleStartRecording}
              disabled={!streamInfo}
            >
              {recording ? '停止录像' : '开始录像'}
            </Button>
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
