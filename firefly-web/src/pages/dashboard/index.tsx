import React, { useEffect, useState, useCallback } from 'react';
import { Card, Col, Row, Statistic, Typography, Tag, Table, Spin, Empty, Tooltip, Progress } from 'antd';
import {
  CloudServerOutlined, TeamOutlined, AlertOutlined, ApiOutlined,
  ReloadOutlined, RiseOutlined, FallOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { Line, Pie, Column } from '@ant-design/charts';
import { dashboardApi } from '../../services/api';

/* ---------- Types ---------- */
interface OverviewData {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  totalUsers: number;
  todayAlarms: number;
  totalProducts: number;
  onlineRate?: number;
}

interface TrendPoint {
  time: string;
  count: number;
  type?: string;
}

interface AlarmDistItem {
  level: string;
  count: number;
}

interface RecentAlarm {
  id: number;
  deviceName: string;
  alarmName: string;
  level: string;
  status: string;
  createdAt: string;
}

interface DeviceByProduct {
  productName: string;
  count: number;
}

/* ---------- Constants ---------- */
const alarmLevelColor: Record<string, string> = {
  CRITICAL: '#f5222d', HIGH: '#fa541c', MEDIUM: '#faad14', LOW: '#1890ff', INFO: '#52c41a',
};
const alarmLevelLabel: Record<string, string> = {
  CRITICAL: '紧急', HIGH: '高', MEDIUM: '中', LOW: '低', INFO: '信息',
};
const alarmStatusLabel: Record<string, { color: string; text: string }> = {
  ACTIVE: { color: 'error', text: '活跃' },
  ACKNOWLEDGED: { color: 'warning', text: '已确认' },
  RESOLVED: { color: 'success', text: '已解决' },
};

/* ---------- Stat Card ---------- */
const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  suffix?: React.ReactNode;
  loading?: boolean;
}> = ({ title, value, icon, color, bgColor, suffix, loading }) => (
  <Card bodyStyle={{ padding: '20px 24px' }} style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: bgColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, color,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>{title}</div>
        <Statistic value={value} loading={loading} valueStyle={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e' }} suffix={suffix} />
      </div>
    </div>
  </Card>
);

/* ---------- Dashboard Component ---------- */
const Dashboard: React.FC = () => {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [alarmDist, setAlarmDist] = useState<AlarmDistItem[]>([]);
  const [recentAlarms, setRecentAlarms] = useState<RecentAlarm[]>([]);
  const [deviceByProduct, setDeviceByProduct] = useState<DeviceByProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, trendRes, distRes, alarmRes, prodRes] = await Promise.allSettled([
        dashboardApi.overview(),
        dashboardApi.deviceOnlineTrend('1h'),
        dashboardApi.alarmDistribution(),
        dashboardApi.recentAlarms(10),
        dashboardApi.deviceByProduct(),
      ]);
      if (ovRes.status === 'fulfilled') setOverview(ovRes.value?.data?.data ?? ovRes.value?.data ?? null);
      if (trendRes.status === 'fulfilled') setTrendData(trendRes.value?.data?.data ?? trendRes.value?.data ?? []);
      if (distRes.status === 'fulfilled') setAlarmDist(distRes.value?.data?.data ?? distRes.value?.data ?? []);
      if (alarmRes.status === 'fulfilled') setRecentAlarms(alarmRes.value?.data?.data ?? alarmRes.value?.data ?? []);
      if (prodRes.status === 'fulfilled') setDeviceByProduct(prodRes.value?.data?.data ?? prodRes.value?.data ?? []);
    } catch {
      // silently ignore — individual charts show empty states
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onlineRate = overview
    ? overview.onlineRate ?? (overview.totalDevices > 0 ? Math.round((overview.onlineDevices / overview.totalDevices) * 100) : 0)
    : 0;

  const alarmColumns = [
    {
      title: '设备', dataIndex: 'deviceName', key: 'deviceName', width: 140, ellipsis: true,
    },
    {
      title: '告警名称', dataIndex: 'alarmName', key: 'alarmName', ellipsis: true,
    },
    {
      title: '级别', dataIndex: 'level', key: 'level', width: 80,
      render: (v: string) => <Tag color={alarmLevelColor[v] || '#999'}>{alarmLevelLabel[v] || v}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => {
        const s = alarmStatusLabel[v];
        return s ? <Tag color={s.color}>{s.text}</Tag> : <Tag>{v}</Tag>;
      },
    },
    {
      title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: (v: string) => <span style={{ color: '#8c8c8c', fontSize: 12 }}>{v}</span>,
    },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>数据概览</Typography.Title>
          <Typography.Text style={{ color: '#8c8c8c', fontSize: 13 }}>实时监控平台运行状态</Typography.Text>
        </div>
        <Tooltip title="刷新数据">
          <ReloadOutlined
            spin={loading}
            style={{ fontSize: 18, color: '#4f46e5', cursor: 'pointer' }}
            onClick={fetchData}
          />
        </Tooltip>
      </div>

      {/* Stat Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="设备总数" value={overview?.totalDevices ?? 0}
            icon={<CloudServerOutlined />} color="#4f46e5" bgColor="rgba(79,70,229,0.08)"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="在线设备" value={overview?.onlineDevices ?? 0}
            icon={<ApiOutlined />} color="#10b981" bgColor="rgba(16,185,129,0.08)"
            loading={loading}
            suffix={
              onlineRate > 0 ? (
                <span style={{ fontSize: 13, color: '#10b981', marginLeft: 4 }}>
                  <RiseOutlined /> {onlineRate}%
                </span>
              ) : undefined
            }
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="用户数" value={overview?.totalUsers ?? 0}
            icon={<TeamOutlined />} color="#3b82f6" bgColor="rgba(59,130,246,0.08)"
            loading={loading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="今日告警" value={overview?.todayAlarms ?? 0}
            icon={<AlertOutlined />} color="#ef4444" bgColor="rgba(239,68,68,0.08)"
            loading={loading}
            suffix={
              (overview?.todayAlarms ?? 0) > 0 ? (
                <span style={{ fontSize: 13, color: '#ef4444', marginLeft: 4 }}>
                  <FallOutlined />
                </span>
              ) : (
                <span style={{ fontSize: 13, color: '#10b981', marginLeft: 4 }}>
                  <CheckCircleOutlined />
                </span>
              )
            }
          />
        </Col>
      </Row>

      {/* Online Rate + Trend Chart */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={6}>
          <Card
            title="在线率" style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', height: '100%' }}
            bodyStyle={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 24px' }}
          >
            {loading ? <Spin /> : (
              <>
                <Progress
                  type="dashboard"
                  percent={onlineRate}
                  strokeColor={{ '0%': '#4f46e5', '100%': '#10b981' }}
                  strokeWidth={10}
                  width={140}
                  format={(p) => <span style={{ fontSize: 28, fontWeight: 700, color: '#1a1a2e' }}>{p}%</span>}
                />
                <div style={{ marginTop: 16, display: 'flex', gap: 24, fontSize: 13, color: '#8c8c8c' }}>
                  <span><span style={{ color: '#10b981', fontWeight: 600 }}>{overview?.onlineDevices ?? 0}</span> 在线</span>
                  <span><span style={{ color: '#8c8c8c', fontWeight: 600 }}>{overview?.offlineDevices ?? 0}</span> 离线</span>
                </div>
              </>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={18}>
          <Card
            title="设备在线趋势"
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            bodyStyle={{ padding: '16px 24px 8px' }}
          >
            {loading ? (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
            ) : trendData.length > 0 ? (
              <Line
                data={trendData}
                xField="time"
                yField="count"
                seriesField="type"
                height={260}
                smooth
                color={['#4f46e5', '#10b981']}
                lineStyle={{ lineWidth: 2.5 }}
                area={{ smooth: true, style: { fillOpacity: 0.08 } }}
                point={{ size: 3, shape: 'circle', style: { lineWidth: 1.5 } }}
                xAxis={{ label: { style: { fontSize: 11, fill: '#8c8c8c' } } }}
                yAxis={{ label: { style: { fontSize: 11, fill: '#8c8c8c' } }, grid: { line: { style: { stroke: '#f0f0f0', lineDash: [4, 4] } } } }}
                legend={{ position: 'top-right' }}
                tooltip={{ showCrosshairs: true }}
                animation={{ appear: { animation: 'wave-in', duration: 800 } }}
              />
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无趋势数据" /></div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Alarm Distribution + Device by Product */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={8}>
          <Card
            title="告警分布"
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            bodyStyle={{ padding: '16px 24px 8px' }}
          >
            {loading ? (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
            ) : alarmDist.length > 0 ? (
              <Pie
                data={alarmDist.map(d => ({ ...d, level: alarmLevelLabel[d.level] || d.level }))}
                angleField="count"
                colorField="level"
                height={260}
                radius={0.85}
                innerRadius={0.55}
                color={Object.values(alarmLevelColor)}
                pieStyle={{ lineWidth: 2, stroke: '#fff' }}
                label={{ type: 'spider', content: '{name}\n{value}', style: { fontSize: 11 } }}
                legend={{ position: 'bottom', itemName: { style: { fontSize: 12 } } }}
                statistic={{
                  title: { content: '总告警', style: { fontSize: 13, color: '#8c8c8c' } },
                  content: { style: { fontSize: 22, fontWeight: 700 } },
                }}
                animation={{ appear: { animation: 'fade-in', duration: 600 } }}
              />
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="暂无告警" image={<CheckCircleOutlined style={{ fontSize: 48, color: '#10b981' }} />} />
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card
            title="产品设备分布"
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            bodyStyle={{ padding: '16px 24px 8px' }}
          >
            {loading ? (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
            ) : deviceByProduct.length > 0 ? (
              <Column
                data={deviceByProduct}
                xField="productName"
                yField="count"
                height={260}
                color="#4f46e5"
                columnWidthRatio={0.45}
                columnStyle={{ radius: [6, 6, 0, 0] }}
                xAxis={{ label: { autoRotate: true, style: { fontSize: 11, fill: '#8c8c8c' } } }}
                yAxis={{ label: { style: { fontSize: 11, fill: '#8c8c8c' } }, grid: { line: { style: { stroke: '#f0f0f0', lineDash: [4, 4] } } } }}
                label={{ position: 'top', style: { fill: '#4f46e5', fontSize: 11, fontWeight: 600 } }}
                tooltip={{ showMarkers: false }}
                animation={{ appear: { animation: 'fade-in', duration: 600 } }}
              />
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Empty description="暂无产品数据" /></div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Recent Alarms Table */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card
            title="最近告警"
            extra={<Typography.Link style={{ fontSize: 13 }} href="/alarm">查看全部</Typography.Link>}
            style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            bodyStyle={{ padding: '0 16px 8px' }}
          >
            <Table
              dataSource={recentAlarms}
              columns={alarmColumns}
              rowKey="id"
              pagination={false}
              size="small"
              loading={loading}
              locale={{ emptyText: <Empty description="暂无告警记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              style={{ marginTop: 4 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
