import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Tag, Space, Card, message, Modal, Form, Input, Select, Tabs, Drawer, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, CameraOutlined, PlayCircleOutlined, PauseCircleOutlined, UnorderedListOutlined, InfoCircleOutlined, VideoCameraOutlined, CheckCircleOutlined, DisconnectOutlined } from '@ant-design/icons';
import { videoApi } from '../../services/api';
import VideoPlayer from '../../components/video/VideoPlayer';
import PtzControlPanel from '../../components/video/PtzControlPanel';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


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

const statusLabels: Record<string, string> = { ONLINE: '在线', OFFLINE: '离线' };
const statusColors: Record<string, string> = { ONLINE: 'success', OFFLINE: 'default' };
const modeLabels: Record<string, string> = { GB28181: 'GB/T 28181', RTSP: 'RTSP', RTMP: 'RTMP' };

const ptzCmdMap: Record<number, string> = { 0: 'STOP', 1: 'UP', 2: 'DOWN', 3: 'LEFT', 4: 'RIGHT', 5: 'ZOOM_IN', 6: 'ZOOM_OUT' };

const VideoList: React.FC = () => {
  const [data, setData] = useState<VideoDeviceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [keyword, setKeyword] = useState('');
  const [filterMode, setFilterMode] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();

  // Player state
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerDevice, setPlayerDevice] = useState<VideoDeviceRecord | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await videoApi.list({ ...params, keyword: keyword || undefined, streamMode: filterMode, status: filterStatus });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载视频设备列表失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, filterMode, filterStatus]);

  const stats = useMemo(() => ({
    online: data.filter(d => d.status === 'ONLINE').length,
    offline: data.filter(d => d.status === 'OFFLINE').length,
    gb: data.filter(d => d.streamMode === 'GB28181').length,
  }), [data]);

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await videoApi.create(values);
      message.success('视频设备创建成功');
      setCreateOpen(false);
      createForm.resetFields();
      fetchData();
    } catch { message.error('创建失败'); }
  };

  const handleDelete = (record: VideoDeviceRecord) => {
    Modal.confirm({
      title: '确认删除视频设备？',
      content: `删除「${record.name}」？关联的通道和流会话将一并删除。`,
      onOk: async () => { await videoApi.delete(record.id); message.success('删除成功'); fetchData(); },
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
    } catch { message.error('启动视频流失败'); } finally { setPlayerLoading(false); }
  };

  const handleStop = async () => {
    if (!playerDevice) return;
    try {
      await videoApi.stopStream(playerDevice.id);
      message.success('视频流已停止');
      setStreamInfo(null);
    } catch { message.error('停止视频流失败'); }
  };

  const handleClosePlayer = async () => {
    if (playerDevice && streamInfo) {
      try { await videoApi.stopStream(playerDevice.id); } catch { /* ignore */ }
    }
    setPlayerOpen(false);
    setStreamInfo(null);
    setPlayerDevice(null);
  };

  const handleSnapshot = async () => {
    if (!playerDevice) return;
    try {
      const res = await videoApi.snapshot(playerDevice.id);
      const url = res.data.data?.imageUrl;
      if (url && url !== 'snapshot_failed' && url !== 'no_active_stream') {
        message.success('截图成功');
        Modal.info({ title: '截图', content: <img src={url} alt="snapshot" style={{ width: '100%' }} />, width: 560 });
      } else {
        message.warning('截图失败，请确保有活跃的视频流');
      }
    } catch { message.error('截图失败'); }
  };

  const handlePtzControl = async (command: number, speed: number) => {
    if (!playerDevice) return;
    try {
      await videoApi.ptz(playerDevice.id, { command: ptzCmdMap[command] || 'STOP', speed });
    } catch { message.error('PTZ 控制失败'); }
  };

  const handleQueryCatalog = async (record: VideoDeviceRecord) => {
    try {
      await videoApi.queryCatalog(record.id);
      message.success('目录查询指令已发送，通道列表将自动更新');
    } catch { message.error('目录查询失败'); }
  };

  const handleQueryDeviceInfo = async (record: VideoDeviceRecord) => {
    try {
      await videoApi.queryDeviceInfo(record.id);
      message.success('设备信息查询指令已发送');
    } catch { message.error('设备信息查询失败'); }
  };

  const columns: ColumnsType<VideoDeviceRecord> = [
    { title: '设备名称', dataIndex: 'name', width: 180, ellipsis: true },
    { title: '接入方式', dataIndex: 'streamMode', width: 100, render: (v: string) => <Tag>{modeLabels[v] || v}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag> },
    { title: 'GB 设备编号', dataIndex: 'gbDeviceId', width: 160, ellipsis: true, render: (v: string) => v || '-' },
    { title: 'IP', dataIndex: 'ip', width: 130, render: (v: string) => v || '-' },
    { title: '厂商', dataIndex: 'manufacturer', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 340, fixed: 'right',
      render: (_: unknown, record: VideoDeviceRecord) => (
        <Space>
          {record.status === 'ONLINE' && (
            <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={() => handlePlay(record)}>播放</Button>
          )}
          {record.streamMode === 'GB28181' && record.status === 'ONLINE' && (
            <>
              <Button type="link" size="small" icon={<UnorderedListOutlined />} onClick={() => handleQueryCatalog(record)}>目录</Button>
              <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => handleQueryDeviceInfo(record)}>信息</Button>
            </>
          )}
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="视频监控"
        description={`共 ${total} 台视频设备，${stats.online} 台在线`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>添加设备</Button>}
      />

      {/* Stat summary */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '设备总数', value: total, icon: <VideoCameraOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '在线', value: stats.online, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '离线', value: stats.offline, icon: <DisconnectOutlined />, color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)' },
          { title: 'GB28181', value: stats.gb, icon: <CameraOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
        ].map((s, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: s.color }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{s.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{s.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input.Search placeholder="搜索名称/设备编号/IP" allowClear enterButton="查询" style={{ width: 260 }}
            onSearch={(v: string) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
          <Select placeholder="接入方式" allowClear style={{ width: 130 }}
            options={[{ value: 'GB28181', label: 'GB/T 28181' }, { value: 'RTSP', label: 'RTSP' }, { value: 'RTMP', label: 'RTMP' }]}
            onChange={(v: string) => { setFilterMode(v); setParams({ ...params, pageNum: 1 }); }} />
          <Select placeholder="状态" allowClear style={{ width: 100 }}
            options={[{ value: 'ONLINE', label: '在线' }, { value: 'OFFLINE', label: '离线' }]}
            onChange={(v: string) => { setFilterStatus(v); setParams({ ...params, pageNum: 1 }); }} />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1400 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      {/* Create Device Modal */}
      <Modal title="添加视频设备" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => createForm.submit()} destroyOnClose width={560}>
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }]}>
            <Input placeholder="如：门口摄像头" />
          </Form.Item>
          <Form.Item name="streamMode" label="接入方式" rules={[{ required: true }]}>
            <Select options={[{ value: 'GB28181', label: 'GB/T 28181' }, { value: 'RTSP', label: 'RTSP' }, { value: 'RTMP', label: 'RTMP' }]} />
          </Form.Item>
          <Form.Item name="gbDeviceId" label="GB 设备编号"><Input placeholder="20位国标编号（GB28181 时填写）" /></Form.Item>
          <Form.Item name="gbDomain" label="GB 域"><Input placeholder="SIP 域" /></Form.Item>
          <Form.Item name="transport" label="传输协议" initialValue="UDP">
            <Select options={[{ value: 'UDP', label: 'UDP' }, { value: 'TCP', label: 'TCP' }]} />
          </Form.Item>
          <Form.Item name="ip" label="IP 地址"><Input placeholder="设备 IP" /></Form.Item>
          <Form.Item name="port" label="端口"><Input type="number" placeholder="SIP/RTSP 端口" /></Form.Item>
          <Form.Item name="manufacturer" label="厂商"><Input placeholder="如：海康威视" /></Form.Item>
          <Form.Item name="model" label="型号"><Input /></Form.Item>
        </Form>
      </Modal>

      {/* Video Player Drawer */}
      <Drawer
        title={playerDevice ? `实时播放 — ${playerDevice.name}` : '实时播放'}
        placement="right"
        width={720}
        open={playerOpen}
        onClose={handleClosePlayer}
        destroyOnClose
        extra={
          <Space>
            <Button icon={<CameraOutlined />} onClick={handleSnapshot} disabled={!streamInfo}>截图</Button>
            <Button icon={<PauseCircleOutlined />} danger onClick={handleStop} disabled={!streamInfo}>停止</Button>
          </Space>
        }
      >
        {playerLoading && <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>正在连接视频流...</div>}

        {streamInfo && (
          <div>
            {/* Video Player */}
            <VideoPlayer url={streamInfo.flvUrl} height={380} />

            {/* Tabs: PTZ / Stream URLs */}
            <Tabs defaultActiveKey="ptz" style={{ marginTop: 16 }} items={[
              {
                key: 'ptz',
                label: '云台控制',
                children: (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                    <PtzControlPanel onControl={handlePtzControl} disabled={playerDevice?.streamMode !== 'GB28181'} />
                    {playerDevice?.streamMode !== 'GB28181' && (
                      <div style={{ marginLeft: 16, color: '#999', fontSize: 13, alignSelf: 'center' }}>
                        PTZ 云台控制仅支持 GB/T 28181 设备。<br />
                        RTSP/RTMP 设备需通过 ONVIF 协议控制。
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'urls',
                label: '播放地址',
                children: (
                  <div style={{ fontSize: 13 }}>
                    <p><strong>FLV：</strong><code style={{ wordBreak: 'break-all' }}>{streamInfo.flvUrl}</code></p>
                    <p><strong>HLS：</strong><code style={{ wordBreak: 'break-all' }}>{streamInfo.hlsUrl}</code></p>
                    <p><strong>WebRTC：</strong><code style={{ wordBreak: 'break-all' }}>{streamInfo.webrtcUrl}</code></p>
                  </div>
                ),
              },
            ]} />
          </div>
        )}

        {!playerLoading && !streamInfo && (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            暂无视频流。请确保设备在线并重新播放。
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default VideoList;
