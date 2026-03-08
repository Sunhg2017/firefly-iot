import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Progress, Descriptions, Table, Button, Spin, message } from 'antd';
import { ReloadOutlined, DashboardOutlined, HddOutlined, CodeOutlined, ApartmentOutlined } from '@ant-design/icons';
import { monitorApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';

const cardStyle = { borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' } as const;


const SystemMonitorPage: React.FC = () => {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await monitorApi.getAll();
      setData(res.data.data);
    } catch { message.error('加载监控数据失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading || !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const jvm = data.jvm as Record<string, unknown>;
  const memory = data.memory as Record<string, unknown>;
  const heap = memory.heap as Record<string, unknown>;
  const nonHeap = memory.nonHeap as Record<string, unknown>;
  const cpu = data.cpu as Record<string, unknown>;
  const thread = data.thread as Record<string, unknown>;
  const server = data.server as Record<string, unknown>;
  const disks = data.disk as Record<string, unknown>[];
  const gcs = data.gc as Record<string, unknown>[];

  const heapPercent = parseFloat(String(heap.usagePercent));

  return (
    <div>
      <PageHeader title="系统监控" description="服务器资源与 JVM 运行状态" extra={<Button icon={<ReloadOutlined />} onClick={fetchData} loading={loading}>刷新</Button>} />

      {/* Top stat cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '堆内存', value: `${String(heap.usedMB)}MB`, icon: <DashboardOutlined />, color: heapPercent > 80 ? '#ef4444' : '#4f46e5', bg: heapPercent > 80 ? 'rgba(239,68,68,0.08)' : 'rgba(79,70,229,0.08)' },
          { title: 'CPU 核心', value: String(cpu.availableProcessors), icon: <HddOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '活动线程', value: String(thread.threadCount), icon: <ApartmentOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '运行时长', value: `${String(jvm.uptimeHours)}h`, icon: <CodeOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
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

      <Row gutter={[16, 16]}>
        {/* 堆内存 */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="堆内存" style={cardStyle}>
            <Progress type="dashboard" percent={heapPercent} size={120}
              strokeColor={heapPercent > 80 ? '#ff4d4f' : heapPercent > 60 ? '#faad14' : '#52c41a'} />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <div>{String(heap.usedMB)} / {String(heap.maxMB)} MB</div>
            </div>
          </Card>
        </Col>

        {/* CPU */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="CPU" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="核心数">{String(cpu.availableProcessors)}</Descriptions.Item>
              <Descriptions.Item label="负载">{String(cpu.systemLoadAverage)}</Descriptions.Item>
              <Descriptions.Item label="架构">{String(cpu.arch)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 线程 */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="线程" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="活动线程">{String(thread.threadCount)}</Descriptions.Item>
              <Descriptions.Item label="峰值">{String(thread.peakThreadCount)}</Descriptions.Item>
              <Descriptions.Item label="守护线程">{String(thread.daemonThreadCount)}</Descriptions.Item>
              <Descriptions.Item label="累计启动">{String(thread.totalStartedThreadCount)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* JVM */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="JVM" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="名称">{String(jvm.name)}</Descriptions.Item>
              <Descriptions.Item label="版本">{String(jvm.specVersion)}</Descriptions.Item>
              <Descriptions.Item label="运行时长">{String(jvm.uptimeHours)} h</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 非堆内存 */}
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" title="非堆内存" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="已用">{String(nonHeap.usedMB)} MB</Descriptions.Item>
              <Descriptions.Item label="已提交">{String(nonHeap.committedMB)} MB</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 服务器信息 */}
        <Col xs={24} sm={12} lg={16}>
          <Card size="small" title="服务器信息" style={cardStyle}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="主机名">{String(server.hostName)}</Descriptions.Item>
              <Descriptions.Item label="IP">{String(server.hostAddress)}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{String(server.osName)} {String(server.osVersion)}</Descriptions.Item>
              <Descriptions.Item label="Java">{String(server.javaVersion)}</Descriptions.Item>
              <Descriptions.Item label="时区">{String(server.userTimezone)}</Descriptions.Item>
              <Descriptions.Item label="工作目录" span={2}>{String(server.userDir)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 磁盘 */}
        <Col xs={24}>
          <Card size="small" title="磁盘" style={cardStyle}>
            <Table rowKey="path" dataSource={disks} size="small" pagination={false}
              columns={[
                { title: '路径', dataIndex: 'path', width: 100 },
                { title: '总空间', dataIndex: 'totalGB', width: 100, render: (v: string) => `${v} GB` },
                { title: '已用', dataIndex: 'usedGB', width: 100, render: (v: string) => `${v} GB` },
                { title: '可用', dataIndex: 'usableGB', width: 100, render: (v: string) => `${v} GB` },
                { title: '使用率', dataIndex: 'usagePercent', width: 200,
                  render: (v: string) => {
                    const p = parseFloat(v);
                    return <Progress percent={p} size="small" strokeColor={p > 80 ? '#ff4d4f' : p > 60 ? '#faad14' : '#52c41a'} />;
                  }
                },
              ]} />
          </Card>
        </Col>

        {/* GC */}
        <Col xs={24}>
          <Card size="small" title="GC 垃圾回收" style={cardStyle}>
            <Table rowKey="name" dataSource={gcs} size="small" pagination={false}
              columns={[
                { title: '收集器', dataIndex: 'name' },
                { title: '回收次数', dataIndex: 'collectionCount' },
                { title: '耗时(ms)', dataIndex: 'collectionTimeMs' },
              ]} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SystemMonitorPage;
