import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Progress, Row, Skeleton, Space, Switch, Table } from 'antd';
import { CodeOutlined, DashboardOutlined, HddOutlined, ApartmentOutlined, ReloadOutlined } from '@ant-design/icons';
import { monitorApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

const cardStyle = { borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' } as const;

/** 监控接口返回的是嵌套自由结构，任何一层缺失都不能让整页渲染直接抛错。 */
type MonitorRecord = Record<string, unknown>;

const asRecord = (value: unknown): MonitorRecord => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as MonitorRecord) : {}
);

const asRecords = (value: unknown): MonitorRecord[] => (
  Array.isArray(value) ? value.map((item) => asRecord(item)) : []
);

const readText = (record: MonitorRecord, key: string, suffix = ''): string => {
  const value = record[key];
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return `${String(value)}${suffix}`;
};

const readPercent = (record: MonitorRecord, key: string): number => {
  const parsed = Number.parseFloat(String(record[key]));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.min(Math.max(parsed, 0), 100);
};

const SystemMonitorPage: React.FC = () => {
  const [data, setData] = useState<MonitorRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await monitorApi.getAll();
      setData(asRecord(res.data.data));
      setLoadError(null);
      setLastSuccessAt(new Date());
    } catch (error) {
      // 失败时保留上一次成功的数据，由页面顶部 Alert 说明失败原因；首次失败则渲染错误态而不是无限加载。
      setLoadError(getErrorMessage(error, '加载监控数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  // 监控数据每 15 秒自动刷新，用户可随时暂停；fetcher 自身吞掉请求错误，避免轮询产生未处理的 Promise 拒绝。
  const { paused, togglePaused, refresh } = useAutoRefresh(fetchData, {
    intervalMs: 15000,
    immediate: false,
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const retryButton = (
    <Button size="small" onClick={() => void refresh()} loading={loading}>
      重试
    </Button>
  );

  const header = (
    <PageHeader
      title="系统监控"
      extra={(
        <Space wrap>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {lastSuccessAt ? `最后更新 ${formatDateTime(lastSuccessAt)}` : '尚未获取到监控数据'}
          </span>
          <Space size={6}>
            <Switch size="small" checked={!paused} onChange={togglePaused} aria-label="自动刷新" />
            <span style={{ fontSize: 12, color: '#64748b' }}>自动刷新（15 秒）</span>
          </Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()}>
            刷新
          </Button>
        </Space>
      )}
    />
  );

  if (!data) {
    return (
      <div>
        {header}
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="监控数据加载失败"
            description={loadError}
            action={retryButton}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {loading ? (
          <Card style={cardStyle}>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : (
          <Card style={cardStyle}>
            <ListEmpty emptyText={loadError ? '暂无可用监控数据，请重试' : '暂无监控数据'} />
          </Card>
        )}
      </div>
    );
  }

  const jvm = asRecord(data.jvm);
  const memory = asRecord(data.memory);
  const heap = asRecord(memory.heap);
  const nonHeap = asRecord(memory.nonHeap);
  const cpu = asRecord(data.cpu);
  const thread = asRecord(data.thread);
  const server = asRecord(data.server);
  const disks = asRecords(data.disk);
  const gcs = asRecords(data.gc);

  const heapPercent = readPercent(heap, 'usagePercent');

  return (
    <div>
      {header}

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="监控数据刷新失败，当前展示的是上一次成功获取的数据"
          description={loadError}
          action={retryButton}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {/* Top stat cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '堆内存', value: readText(heap, 'usedMB', ' MB'), icon: <DashboardOutlined />, color: heapPercent > 80 ? '#ef4444' : '#4f46e5', bg: heapPercent > 80 ? 'rgba(239,68,68,0.08)' : 'rgba(79,70,229,0.08)' },
          { title: 'CPU 核心', value: readText(cpu, 'availableProcessors'), icon: <HddOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '活动线程', value: readText(thread, 'threadCount'), icon: <ApartmentOutlined />, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
          { title: '运行时长', value: readText(jvm, 'uptimeHours', ' 小时'), icon: <CodeOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
        ].map((stat) => (
          <Col xs={12} sm={6} key={stat.title}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: stat.color }}>
                  {stat.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{stat.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{stat.value}</div>
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
            <Progress
              type="dashboard"
              percent={heapPercent}
              size={120}
              format={(percent) => `${percent ?? 0}%`}
              strokeColor={heapPercent > 80 ? '#ff4d4f' : heapPercent > 60 ? '#faad14' : '#52c41a'}
            />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <div>{readText(heap, 'usedMB')} / {readText(heap, 'maxMB')} MB</div>
            </div>
          </Card>
        </Col>

        {/* CPU */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="CPU" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="核心数">{readText(cpu, 'availableProcessors')}</Descriptions.Item>
              <Descriptions.Item label="系统负载（1 分钟）">{readText(cpu, 'systemLoadAverage')}</Descriptions.Item>
              <Descriptions.Item label="架构">{readText(cpu, 'arch')}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 线程 */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="线程" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="活动线程">{readText(thread, 'threadCount')}</Descriptions.Item>
              <Descriptions.Item label="峰值">{readText(thread, 'peakThreadCount')}</Descriptions.Item>
              <Descriptions.Item label="守护线程">{readText(thread, 'daemonThreadCount')}</Descriptions.Item>
              <Descriptions.Item label="累计启动">{readText(thread, 'totalStartedThreadCount')}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* JVM */}
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" title="JVM" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="名称">{readText(jvm, 'name')}</Descriptions.Item>
              <Descriptions.Item label="版本">{readText(jvm, 'specVersion')}</Descriptions.Item>
              <Descriptions.Item label="运行时长">{readText(jvm, 'uptimeHours', ' 小时')}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 非堆内存 */}
        <Col xs={24} sm={12} lg={8}>
          <Card size="small" title="非堆内存" style={cardStyle}>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="已用">{readText(nonHeap, 'usedMB', ' MB')}</Descriptions.Item>
              <Descriptions.Item label="已提交">{readText(nonHeap, 'committedMB', ' MB')}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 服务器信息 */}
        <Col xs={24} sm={12} lg={16}>
          <Card size="small" title="服务器信息" style={cardStyle}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="主机名">{readText(server, 'hostName')}</Descriptions.Item>
              <Descriptions.Item label="IP">{readText(server, 'hostAddress')}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{readText(server, 'osName')} {readText(server, 'osVersion')}</Descriptions.Item>
              <Descriptions.Item label="Java">{readText(server, 'javaVersion')}</Descriptions.Item>
              <Descriptions.Item label="时区">{readText(server, 'userTimezone')}</Descriptions.Item>
              <Descriptions.Item label="工作目录" span={2}>{readText(server, 'userDir')}</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>

        {/* 磁盘 */}
        <Col xs={24}>
          <Card size="small" title="磁盘" style={cardStyle}>
            <Table
              rowKey="path"
              dataSource={disks}
              size="small"
              pagination={false}
              locale={{ emptyText: <ListEmpty compact emptyText="暂无磁盘数据" /> }}
              columns={[
                { title: '路径', dataIndex: 'path', width: 180, render: (value: unknown) => value == null ? '-' : String(value) },
                { title: '总空间', dataIndex: 'totalGB', width: 120, render: (value: unknown) => value == null ? '-' : `${String(value)} GB` },
                { title: '已用', dataIndex: 'usedGB', width: 120, render: (value: unknown) => value == null ? '-' : `${String(value)} GB` },
                { title: '可用', dataIndex: 'usableGB', width: 120, render: (value: unknown) => value == null ? '-' : `${String(value)} GB` },
                {
                  title: '使用率',
                  dataIndex: 'usagePercent',
                  width: 200,
                  render: (value: unknown) => {
                    const percent = Number.parseFloat(String(value));
                    if (!Number.isFinite(percent)) {
                      return '-';
                    }
                    return <Progress percent={Math.min(Math.max(percent, 0), 100)} size="small" strokeColor={percent > 80 ? '#ff4d4f' : percent > 60 ? '#faad14' : '#52c41a'} />;
                  },
                },
              ]}
            />
          </Card>
        </Col>

        {/* GC */}
        <Col xs={24}>
          <Card size="small" title="GC 垃圾回收" style={cardStyle}>
            <Table
              rowKey="name"
              dataSource={gcs}
              size="small"
              pagination={false}
              locale={{ emptyText: <ListEmpty compact emptyText="暂无 GC 数据" /> }}
              columns={[
                { title: '收集器', dataIndex: 'name', render: (value: unknown) => value == null ? '-' : String(value) },
                { title: '回收次数', dataIndex: 'collectionCount', render: (value: unknown) => value == null ? '-' : String(value) },
                { title: '累计耗时(ms)', dataIndex: 'collectionTimeMs', render: (value: unknown) => value == null ? '-' : String(value) },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SystemMonitorPage;
