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
  Row,
  Select,
  Space,
  Spin,
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
  DownloadOutlined,
  EditOutlined,
  HistoryOutlined,
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
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import VideoPlayer from '../../components/video/VideoPlayer';
import PtzControlPanel from '../../components/video/PtzControlPanel';
import { usePageActivation } from '../../hooks/usePageActivation';
import { getErrorMessage } from '../../utils/errors';

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
  authEnabled?: boolean;
  authUsername?: string;
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

interface VideoRecordingRecord {
  fileName: string;
  fileSize?: number;
  startTime?: number;
  durationSeconds?: number;
  channelId?: string;
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
  authEnabled?: boolean;
  authUsername?: string;
  authPassword?: string;
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

const formatFileSize = (bytes?: number) => {
  if (bytes === undefined || bytes === null) {
    return '-';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const normalizeOptionalPort = (value?: number | string) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(normalized) ? normalized : undefined;
};

const validateVideoSourceUrl = (streamMode: string | undefined, sourceUrl?: string) => {
  const trimmed = trimOptionalValue(sourceUrl);
  if (!trimmed) {
    return;
  }
  try {
    const parsed = new URL(trimmed);
    const expectedProtocol = (streamMode || 'RTSP') === 'RTMP' ? 'rtmp:' : 'rtsp:';
    if (parsed.protocol !== expectedProtocol) {
      throw new Error(`视频源地址必须使用 ${expectedProtocol.replace(':', '')}://`);
    }
    if ((parsed.username || '').trim() || (parsed.password || '').trim()) {
      throw new Error('视频源地址不能内嵌用户名密码，请改填独立认证字段');
    }
    if (!trimOptionalValue(parsed.hostname)) {
      throw new Error('视频源地址缺少主机地址');
    }
    const port = parsed.port
      ? Number(parsed.port)
      : (expectedProtocol === 'rtmp:' ? 1935 : 554);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error('视频源地址端口不正确');
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('视频源地址格式不正确');
  }
};

const isManagedLocalSourceUrl = (streamMode: string | undefined, sourceUrl?: string) => {
  const trimmed = trimOptionalValue(sourceUrl);
  if (!trimmed || streamMode === 'GB28181') {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return (parsed.pathname || '').startsWith('/live/simcam-');
  } catch {
    return false;
  }
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
      authEnabled: device.authEnabled ?? (device.streamMode === 'GB28181'),
      authUsername: device.authUsername,
      authPassword: undefined,
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
    authEnabled: streamMode === 'GB28181',
  };
};

const buildEditorPayload = (values: VideoEditorFormValues) => {
  const streamMode = values.streamMode || 'GB28181';
  const authEnabled = values.authEnabled ?? (streamMode === 'GB28181');
  return {
    productKey: trimOptionalValue(values.productKey),
    name: values.name?.trim(),
    streamMode,
    gbDeviceId: trimOptionalValue(values.gbDeviceId),
    gbDomain: trimOptionalValue(values.gbDomain),
    transport: streamMode === 'GB28181' ? trimOptionalValue(values.transport) || 'UDP' : undefined,
    authEnabled,
    authUsername: authEnabled ? trimOptionalValue(values.authUsername) : undefined,
    authPassword: authEnabled ? trimOptionalValue(values.authPassword) : undefined,
    ip: trimOptionalValue(values.ip),
    port: normalizeOptionalPort(values.port),
    sourceUrl: trimOptionalValue(values.sourceUrl),
    manufacturer: trimOptionalValue(values.manufacturer),
    model: trimOptionalValue(values.model),
    firmware: trimOptionalValue(values.firmware),
  };
};

const VideoList: React.FC<VideoListProps> = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const productContext = useMemo(() => parseVideoProductContext(searchParams), [searchParams]);
  const [data, setData] = useState<VideoDeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingDevice, setEditingDevice] = useState<VideoDeviceRecord | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorForm] = Form.useForm<VideoEditorFormValues>();
  const [pendingEditorValues, setPendingEditorValues] = useState<VideoEditorFormValues>(buildEditorInitialValues());
  const [productOptions, setProductOptions] = useState<VideoProductOption[]>([]);
  const [productCache, setProductCache] = useState<Record<string, VideoProductOption>>({});
  const [productSearching, setProductSearching] = useState(false);
  const productSearchTimerRef = useRef<number | null>(null);
  const productSearchRequestRef = useRef(0);
  const currentEditorProductKey = Form.useWatch('productKey', editorForm);
  const currentEditorStreamMode = Form.useWatch('streamMode', editorForm) || productContext?.protocol || 'GB28181';
  const currentEditorGbDeviceId = Form.useWatch('gbDeviceId', editorForm);
  const currentEditorAuthEnabled = Form.useWatch('authEnabled', editorForm);
  const currentEditorAuthUsername = Form.useWatch('authUsername', editorForm);
  const currentEditorSourceUrl = Form.useWatch('sourceUrl', editorForm);
  const [draftFilters, setDraftFilters] = useState<VideoListFilters>(EMPTY_VIDEO_FILTERS);
  const [filters, setFilters] = useState<VideoListFilters>(EMPTY_VIDEO_FILTERS);

  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerDevice, setPlayerDevice] = useState<VideoDeviceRecord | null>(null);
  const [playerChannel, setPlayerChannel] = useState<VideoChannelRecord | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [recordingDrawerOpen, setRecordingDrawerOpen] = useState(false);
  const [recordingDevice, setRecordingDevice] = useState<VideoDeviceRecord | null>(null);
  const [recordings, setRecordings] = useState<VideoRecordingRecord[]>([]);
  const [recordingsLoading, setRecordingsLoading] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playbackTitle, setPlaybackTitle] = useState('');
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const [channelDrawerOpen, setChannelDrawerOpen] = useState(false);
  const [channelDevice, setChannelDevice] = useState<VideoDeviceRecord | null>(null);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channels, setChannels] = useState<VideoChannelRecord[]>([]);
  const selectedEditorProduct = useMemo(
    () => (currentEditorProductKey ? productCache[currentEditorProductKey] : undefined),
    [currentEditorProductKey, productCache],
  );
  const productSelectOptions = useMemo(() => {
    if (selectedEditorProduct && !productOptions.some((item) => item.productKey === selectedEditorProduct.productKey)) {
      return [selectedEditorProduct, ...productOptions];
    }
    return productOptions;
  }, [productOptions, selectedEditorProduct]);
  const currentCreateProtocol =
    editorMode === 'create' ? productContext?.protocol || selectedEditorProduct?.protocol : undefined;
  const isCreateProductLocked = editorMode === 'create' && Boolean(productContext);
  const isCreateProtocolLocked = editorMode === 'create' && Boolean(currentCreateProtocol);

  const searchProductOptions = useCallback(async (keyword: string) => {
    const requestId = productSearchRequestRef.current + 1;
    productSearchRequestRef.current = requestId;
    setProductSearching(true);
    try {
      const res = await productApi.list({
        pageNum: 1,
        pageSize: 20,
        category: 'CAMERA',
        keyword: keyword.trim() || undefined,
      });
      const page = unwrapBusinessResponse<{ records?: Array<Record<string, unknown>> }>(res, '加载产品列表失败');
      const records = (page.records || []) as Array<Record<string, unknown>>;
      const mapped = records
        .map((item) => ({
          id: Number(item.id),
          name: String(item.name || ''),
          productKey: String(item.productKey || ''),
          protocol: String(item.protocol || ''),
        }))
        .filter((item) => item.id > 0 && item.productKey && VIDEO_PROTOCOL_VALUES.has(item.protocol));
      if (requestId !== productSearchRequestRef.current) {
        return;
      }
      setProductOptions(mapped);
      setProductCache((current) => {
        const next = { ...current };
        mapped.forEach((item) => {
          next[item.productKey] = item;
        });
        return next;
      });
    } catch (error) {
      if (requestId === productSearchRequestRef.current) {
        setProductOptions([]);
        message.error(getErrorMessage(error, '加载摄像头产品选项失败'));
      }
    } finally {
      if (requestId === productSearchRequestRef.current) {
        setProductSearching(false);
      }
    }
  }, []);

  const handleProductSearch = useCallback((keyword: string) => {
    if (productSearchTimerRef.current) {
      window.clearTimeout(productSearchTimerRef.current);
    }
    productSearchTimerRef.current = window.setTimeout(() => {
      void searchProductOptions(keyword);
    }, 300);
  }, [searchProductOptions]);

  const fetchData = useCallback(async () => {
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
      setLoadError(null);
    } catch (error) {
      // 失败时保留上一次列表，由顶部 Alert 说明原因并提供重试。
      setLoadError(getErrorMessage(error, '加载视频设备列表失败'));
    } finally {
      setLoading(false);
    }
  }, [filters, params]);

  useEffect(() => {
    // 首屏只取最近 20 个摄像头产品，其余结果由关键字远程搜索补全。
    void searchProductOptions('');
    return () => {
      if (productSearchTimerRef.current) {
        window.clearTimeout(productSearchTimerRef.current);
      }
    };
  }, [searchProductOptions]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // 页面被 keep-alive 保留，切回标签时重新拉取，避免展示过期的在线状态。
  usePageActivation(useCallback(() => {
    void fetchData();
  }, [fetchData]));

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
    if (editorForm.getFieldValue('authEnabled') === undefined) {
      editorForm.setFieldValue('authEnabled', currentEditorStreamMode === 'GB28181');
    }
  }, [currentEditorStreamMode, editorForm]);

  useEffect(() => {
    if (currentEditorStreamMode !== 'GB28181' || !trimOptionalValue(currentEditorGbDeviceId)) {
      return;
    }
    if (!trimOptionalValue(currentEditorAuthUsername) || currentEditorAuthUsername === editingDevice?.gbDeviceId) {
      editorForm.setFieldValue('authUsername', trimOptionalValue(currentEditorGbDeviceId));
    }
  }, [currentEditorAuthUsername, currentEditorGbDeviceId, currentEditorStreamMode, editingDevice?.gbDeviceId, editorForm]);

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
      content: `删除「${record.name}」后不可恢复，关联通道与正在运行的流会话会一并删除，相关播放地址立即失效。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await deviceVideoApi.delete(record.id);
          unwrapBusinessResponse(response, '删除视频设备失败');
          message.success('视频设备已删除');
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '删除视频设备失败'));
          throw error;
        }
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
      } catch (error) {
        // 关闭抽屉不能因为清理失败被阻断，但需要提示用户服务端流会话可能仍在运行。
        message.warning(getErrorMessage(error, '关闭播放器时停止视频流失败，服务端会话可能仍在运行'));
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

  const openRecordingDrawer = async (record: VideoDeviceRecord) => {
    setRecordingDevice(record);
    setRecordingDrawerOpen(true);
    setRecordingsLoading(true);
    setRecordings([]);
    try {
      const response = await videoControlApi.listRecordings(record.id);
      const data = unwrapBusinessResponse<VideoRecordingRecord[]>(response, '加载录像列表失败');
      setRecordings(data || []);
    } catch (error) {
      message.error(getErrorMessage(error, '加载录像列表失败'));
    } finally {
      setRecordingsLoading(false);
    }
  };

  const handlePlayRecording = async (record: VideoRecordingRecord) => {
    if (!recordingDevice) return;
    const startEpoch = record.startTime ?? 0;
    try {
      const response = await videoControlApi.playRecording(recordingDevice.id, record.fileName, startEpoch);
      if (playbackUrl) {
        window.URL.revokeObjectURL(playbackUrl);
      }
      const url = window.URL.createObjectURL(response.data);
      setPlaybackUrl(url);
      setPlaybackTitle(`${recordingDevice.name} - ${record.fileName}`);
      setPlaybackOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载录像失败'));
    }
  };

  const handleDownloadRecording = async (record: VideoRecordingRecord) => {
    if (!recordingDevice) return;
    const startEpoch = record.startTime ?? 0;
    try {
      const response = await videoControlApi.downloadRecording(recordingDevice.id, record.fileName, startEpoch);
      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = record.fileName || 'recording.mp4';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      message.error(getErrorMessage(error, '下载录像失败'));
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
    {
      title: 'GB 设备编号',
      dataIndex: 'gbDeviceId',
      width: 180,
      render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
    },
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
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => void openRecordingDrawer(record)}>
            录像
          </Button>
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
        description={`共 ${total} 台视频设备（全部），当前页 ${data.length} 台，其中在线 ${stats.online} 台`}
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

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="视频设备列表加载失败，当前展示的是上一次成功获取的数据"
          description={loadError}
          action={(
            <Button size="small" onClick={() => void fetchData()} loading={loading}>
              重试
            </Button>
          )}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '设备总数（全部）', value: total, icon: <VideoCameraOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '在线（当前页）', value: stats.online, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '离线（当前页）', value: stats.offline, icon: <DisconnectOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
          { title: 'GB28181（当前页）', value: stats.gb, icon: <CameraOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
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
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={Boolean(filters.keyword || filters.streamMode || filters.status)}
                onClearFilters={resetFilters}
                emptyText="暂无视频设备，点击右上角「添加设备」创建"
                filteredText="没有符合当前筛选条件的视频设备"
              />
            ),
          }}
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
                    filterOption={false}
                    onSearch={handleProductSearch}
                    loading={productSearching}
                    placeholder="搜索并选择摄像头产品（名称或 productKey）"
                    disabled={isCreateProductLocked}
                    notFoundContent={productSearching ? <Spin size="small" /> : '未找到匹配产品，换个关键字试试'}
                    options={productSelectOptions.map((item) => ({
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

              </>
            ) : null}

            <Row gutter={16}>
              <Col xs={24} md={8}>
                <Form.Item name="authEnabled" label="启用认证" valuePropName="checked">
                  <Switch />
                </Form.Item>
              </Col>
              <Col xs={24} md={16}>
                <Form.Item
                  name="authUsername"
                  label="认证用户名"
                  rules={[
                    {
                      validator: async (_, value) => {
                        if (!currentEditorAuthEnabled) {
                          return;
                        }
                        if (trimOptionalValue(value)) {
                          return;
                        }
                        throw new Error('请输入认证用户名');
                      },
                    },
                  ]}
                >
                  <Input
                    disabled={!currentEditorAuthEnabled}
                    placeholder={currentEditorStreamMode === 'GB28181' ? '默认使用 GB 设备编号' : '请输入认证用户名'}
                    maxLength={128}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="authPassword"
              label="认证密码"
              rules={[
                {
                  validator: async (_, value) => {
                    const managedLocalSource = isManagedLocalSourceUrl(currentEditorStreamMode, currentEditorSourceUrl);
                    if (!currentEditorAuthEnabled && !managedLocalSource) {
                      return;
                    }
                    const trimmed = typeof value === 'string' ? value.trim() : '';
                    if (trimmed) {
                      return;
                    }
                    if (editorMode === 'edit' && editingDevice?.authEnabled) {
                      return;
                    }
                    throw new Error('请输入认证密码');
                  },
                },
              ]}
            >
              <Input.Password
                disabled={!currentEditorAuthEnabled}
                placeholder={editorMode === 'edit' && editingDevice?.authEnabled ? '留空则保持原密码' : '请输入认证密码'}
                maxLength={128}
              />
            </Form.Item>

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
              <Form.Item
                name="sourceUrl"
                label="视频源地址"
                rules={[
                  {
                    validator: async (_, value) => {
                      if (!trimOptionalValue(value)) {
                        return;
                      }
                      validateVideoSourceUrl(currentEditorStreamMode, value);
                      if (isManagedLocalSourceUrl(currentEditorStreamMode, value) && !currentEditorAuthEnabled) {
                        throw new Error('本地摄像头推流地址必须启用认证');
                      }
                    },
                  },
                ]}
              >
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
          locale={{ emptyText: <ListEmpty compact emptyText="暂无通道数据，GB28181 设备可先执行目录同步" /> }}
          columns={[
            {
              title: '通道编号',
              dataIndex: 'channelId',
              width: 180,
              render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
            },
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
                        <CopyText text={streamInfo.flvUrl}>
                          <code style={{ wordBreak: 'break-all' }}>{streamInfo.flvUrl}</code>
                        </CopyText>
                      </p>
                      <p>
                        <strong>HLS：</strong>
                        <CopyText text={streamInfo.hlsUrl}>
                          <code style={{ wordBreak: 'break-all' }}>{streamInfo.hlsUrl}</code>
                        </CopyText>
                      </p>
                      <p>
                        <strong>WebRTC：</strong>
                        <CopyText text={streamInfo.webrtcUrl}>
                          <code style={{ wordBreak: 'break-all' }}>{streamInfo.webrtcUrl}</code>
                        </CopyText>
                        <span style={{ display: 'block', marginTop: 4, color: '#8c8c8c', fontSize: 12 }}>
                          WebRTC 播放需要浏览器支持 WebRTC（Chrome、Edge、Safari 新版），不支持时请使用 FLV 或 HLS 地址。
                        </span>
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

      <Drawer
        title={recordingDevice ? `录像回放 - ${recordingDevice.name}` : '录像回放'}
        placement="right"
        width={760}
        open={recordingDrawerOpen}
        destroyOnClose
        onClose={() => {
          setRecordingDrawerOpen(false);
          setRecordingDevice(null);
          setRecordings([]);
        }}
        extra={
          recordingDevice ? (
            <Button icon={<ReloadOutlined />} onClick={() => void openRecordingDrawer(recordingDevice)}>
              刷新
            </Button>
          ) : undefined
        }
      >
        <Table<VideoRecordingRecord>
          rowKey={(record) => `${record.fileName}-${record.startTime ?? 0}`}
          loading={recordingsLoading}
          dataSource={recordings}
          pagination={false}
          locale={{ emptyText: <ListEmpty compact emptyText="暂无录像记录，可先在实时播放中点击「开始录像」" /> }}
          columns={[
            {
              title: '文件名',
              dataIndex: 'fileName',
              width: 180,
              ellipsis: true,
              render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
            },
            {
              title: '开始时间',
              dataIndex: 'startTime',
              width: 170,
              render: (value: number) => (value ? new Date(value).toLocaleString() : '-'),
            },
            {
              title: '时长',
              dataIndex: 'durationSeconds',
              width: 90,
              render: (value: number) => (value != null ? `${Math.round(value)}s` : '-'),
            },
            {
              title: '大小',
              dataIndex: 'fileSize',
              width: 110,
              render: (value: number) => (value != null ? formatFileSize(value) : '-'),
            },
            { title: '通道', dataIndex: 'channelId', width: 150, ellipsis: true, render: (value: string) => value || '-' },
            {
              title: '操作',
              width: 140,
              fixed: 'right',
              render: (_: unknown, record: VideoRecordingRecord) => (
                <Space>
                  <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => void handlePlayRecording(record)}>
                    回放
                  </Button>
                  <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => void handleDownloadRecording(record)}>
                    下载
                  </Button>
                </Space>
              ),
            },
          ]}
          scroll={{ x: 840 }}
        />
      </Drawer>

      <Modal
        title={playbackTitle || '录像回放'}
        open={playbackOpen}
        footer={null}
        width={760}
        destroyOnClose
        onCancel={() => {
          setPlaybackOpen(false);
          if (playbackUrl) {
            window.URL.revokeObjectURL(playbackUrl);
            setPlaybackUrl(null);
          }
        }}
      >
        {playbackUrl ? (
          <video controls autoPlay src={playbackUrl} style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        ) : null}
      </Modal>
    </div>
  );
};

export default VideoList;
