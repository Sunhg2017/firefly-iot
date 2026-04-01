import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  DisconnectOutlined,
  HddOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { dashboardApi } from '../../services/api';

const { Text, Title } = Typography;

const alarmLevelColors: Record<string, string> = {
  CRITICAL: '#dc2626',
  MAJOR: '#ea580c',
  MINOR: '#d97706',
  WARNING: '#2563eb',
  INFO: '#16a34a',
};
const alarmLevelLabels: Record<string, string> = {
  CRITICAL: '紧急',
  MAJOR: '重要',
  MINOR: '次要',
  WARNING: '警告',
  INFO: '信息',
};
const alarmStatusLabels: Record<string, string> = {
  TRIGGERED: '待处理',
  ACKNOWLEDGED: '已确认',
  RESOLVED: '已恢复',
};

type DashboardRecord = Record<string, unknown>;

interface MetricTileProps {
  title: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  accent: string;
  tint: string;
  border: string;
  suffix?: string;
}

const MetricTile: React.FC<MetricTileProps> = ({
  title,
  value,
  description,
  icon,
  accent,
  tint,
  border,
  suffix,
}) => (
  <Card
    bordered={false}
    styles={{ body: { padding: 18 } }}
    style={{
      borderRadius: 22,
      border: `1px solid ${border}`,
      background: '#ffffff',
      boxShadow: '0 10px 24px rgba(15,23,42,0.05)',
      height: '100%',
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {title}
        </Text>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{value}</span>
          {suffix ? <span style={{ color: accent, fontWeight: 600 }}>{suffix}</span> : null}
        </div>
        <div style={{ marginTop: 10 }}>
          <Text style={{ color: '#64748b', lineHeight: 1.7 }}>{description}</Text>
        </div>
      </div>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: tint,
          border: `1px solid ${border}`,
          color: accent,
          fontSize: 22,
          flex: '0 0 auto',
        }}
      >
        {icon}
      </div>
    </div>
  </Card>
);

const DashboardPage: React.FC = () => {
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [recentAlarms, setRecentAlarms] = useState<DashboardRecord[]>([]);
  const [alarmDist, setAlarmDist] = useState<DashboardRecord[]>([]);
  const [deviceByProduct, setDeviceByProduct] = useState<DashboardRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [ovRes, alarmRes, distRes, prodRes] = await Promise.all([
          dashboardApi.overview(),
          dashboardApi.recentAlarms(8),
          dashboardApi.alarmDistribution(),
          dashboardApi.deviceByProduct(),
        ]);
        setOverview(ovRes.data.data || {});
        setRecentAlarms(alarmRes.data.data || []);
        setAlarmDist(distRes.data.data || []);
        setDeviceByProduct(prodRes.data.data || []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    void fetchAll();
  }, []);

  const alarmColumns: ColumnsType<DashboardRecord> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      ellipsis: true,
    },
    {
      title: '级别',
      dataIndex: 'level',
      width: 90,
      render: (value: string) => (
        <Tag color={alarmLevelColors[value]}>{alarmLevelLabels[value] || value}</Tag>
      ),
    },
    {
      title: '规则',
      dataIndex: 'rule_name',
      width: 150,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 96,
      render: (value: string) => (
        <Tag color={value === 'TRIGGERED' ? 'error' : value === 'RESOLVED' ? 'success' : 'processing'}>
          {alarmStatusLabels[value] || value}
        </Tag>
      ),
    },
    {
      title: '消息',
      dataIndex: 'message',
      ellipsis: true,
    },
  ];

  const onlineRate = useMemo(() => (
    overview.deviceTotal ? Math.round(((overview.deviceOnline || 0) / overview.deviceTotal) * 100) : 0
  ), [overview.deviceOnline, overview.deviceTotal]);

  const heroMetrics = useMemo(() => ([
    { label: '设备总数', value: overview.deviceTotal || 0, accent: '#2563eb', tint: '#eff6ff' },
    { label: '在线设备', value: overview.deviceOnline || 0, accent: '#16a34a', tint: '#f0fdf4' },
    { label: '待处理告警', value: overview.alarmPending || 0, accent: '#ea580c', tint: '#fff7ed' },
    { label: '启用规则', value: overview.ruleEnabled || 0, accent: '#7c3aed', tint: '#f5f3ff' },
  ]), [overview.alarmPending, overview.deviceOnline, overview.deviceTotal, overview.ruleEnabled]);

  const secondaryMetrics = useMemo(() => ([
    {
      title: '在线率',
      value: onlineRate,
      suffix: '%',
      description: '当前接入设备的在线占比。',
      icon: <WifiOutlined />,
      accent: '#16a34a',
      tint: '#f0fdf4',
      border: '#bbf7d0',
    },
    {
      title: '离线设备',
      value: overview.deviceOffline || 0,
      description: '当前仍需排查或重连的设备数。',
      icon: <DisconnectOutlined />,
      accent: '#dc2626',
      tint: '#fef2f2',
      border: '#fecaca',
    },
    {
      title: '产品数',
      value: overview.productTotal || 0,
      description: '当前已接入并启用的产品模型。',
      icon: <AppstoreOutlined />,
      accent: '#2563eb',
      tint: '#eff6ff',
      border: '#bfdbfe',
    },
    {
      title: '今日告警',
      value: overview.alarmToday || 0,
      description: '过去 24 小时新增的告警总数。',
      icon: <AlertOutlined />,
      accent: '#d97706',
      tint: '#fffbeb',
      border: '#fde68a',
    },
    {
      title: '规则引擎',
      value: overview.ruleTotal || 0,
      description: '规则链、动作和联动能力总量。',
      icon: <ThunderboltOutlined />,
      accent: '#7c3aed',
      tint: '#f5f3ff',
      border: '#ddd6fe',
    },
    {
      title: '正常设备',
      value: Math.max((overview.deviceTotal || 0) - (overview.deviceOffline || 0), 0),
      description: '当前未处于离线状态的设备数。',
      icon: <CheckCircleOutlined />,
      accent: '#0f766e',
      tint: '#ecfeff',
      border: '#a5f3fc',
    },
  ]), [onlineRate, overview.alarmToday, overview.deviceOffline, overview.deviceTotal, overview.productTotal, overview.ruleTotal]);

  const maxAlarmCount = useMemo(() => (
    Math.max(...alarmDist.map((item) => Number(item.count || 0)), 0)
  ), [alarmDist]);
  const maxProductCount = useMemo(() => (
    Math.max(...deviceByProduct.map((item) => Number(item.device_count || 0)), 0)
  ), [deviceByProduct]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="工作台"
      />

      <Card
        bordered={false}
        style={{
          borderRadius: 26,
          border: '1px solid #dbe4ee',
          background: 'linear-gradient(180deg, #ffffff 0%, #f7fbff 100%)',
          boxShadow: '0 14px 34px rgba(15,23,42,0.06)',
        }}
        styles={{ body: { padding: 24 } }}
      >
        <div
          style={{
            display: 'grid',
            gap: 20,
            gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(0, 1fr)',
            alignItems: 'stretch',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <Tag style={{ margin: 0, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                当前平台概览
              </Tag>
              <Title level={3} style={{ margin: '14px 0 8px', color: '#0f172a' }}>
                平台概览
              </Title>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {heroMetrics.map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    padding: '16px 18px',
                    borderRadius: 20,
                    border: '1px solid #dbe4ee',
                    background: '#ffffff',
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {metric.label}
                  </Text>
                  <div style={{ marginTop: 10, fontSize: 28, fontWeight: 700, color: metric.accent }}>
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: 24,
              border: '1px solid #dbe4ee',
              background: '#f8fbff',
              padding: 20,
            }}
          >
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Text strong style={{ color: '#0f172a', fontSize: 16 }}>
                当前接入态势
              </Text>
              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '14px 16px',
                    borderRadius: 18,
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                  }}
                >
                  <Space size={10}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#ffffff',
                        color: '#2563eb',
                        fontSize: 18,
                      }}
                    >
                      <HddOutlined />
                    </div>
                    <div>
                      <Text strong style={{ color: '#0f172a' }}>设备在线率</Text>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary">在线设备在总设备中的占比。</Text>
                      </div>
                    </div>
                  </Space>
                  <span style={{ color: '#2563eb', fontSize: 30, fontWeight: 700 }}>{onlineRate}%</span>
                </div>

                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 18,
                    border: '1px solid #dbe4ee',
                    background: '#ffffff',
                  }}
                >
                  <Text strong style={{ color: '#0f172a' }}>待处理告警与规则执行</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ lineHeight: 1.8 }}>
                      当前待处理告警 {overview.alarmPending || 0} 条，已启用规则 {overview.ruleEnabled || 0} 条，可继续从右侧告警表和分布面板查看明细。
                    </Text>
                  </div>
                </div>
              </div>
            </Space>
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {secondaryMetrics.map((metric) => (
          <Col xs={24} sm={12} xl={8} key={metric.title}>
            <MetricTile {...metric} />
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 18 }}>
        <Col xs={24} lg={16}>
          <Card
            title={<span style={{ fontWeight: 700, color: '#0f172a' }}>最近告警</span>}
            extra={<Text type="secondary">最近 8 条告警记录</Text>}
            style={{ borderRadius: 24 }}
            styles={{ body: { padding: '8px 0 0' } }}
          >
            <Table
              rowKey="id"
              columns={alarmColumns}
              dataSource={recentAlarms}
              pagination={false}
              size="small"
              scroll={{ x: 720 }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              title={<span style={{ fontWeight: 700, color: '#0f172a' }}>告警级别分布</span>}
              extra={<Text type="secondary">近 30 天</Text>}
              style={{ borderRadius: 24 }}
            >
              {alarmDist.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>暂无数据</div>
              ) : (
                <div style={{ padding: '4px 0' }}>
                  {alarmDist.map((item, index) => {
                    const level = String(item.level || '');
                    const count = Number(item.count || 0);
                    return (
                      <div key={`${level}-${index}`} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center', gap: 10 }}>
                          <Tag color={alarmLevelColors[level]} style={{ margin: 0 }}>
                            {alarmLevelLabels[level] || level}
                          </Tag>
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>{count}</span>
                        </div>
                        <div style={{ height: 8, background: '#eef3f8', borderRadius: 999, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${maxAlarmCount > 0 ? (count / maxAlarmCount) * 100 : 0}%`,
                              background: alarmLevelColors[level] || '#2563eb',
                              borderRadius: 999,
                              transition: 'width 0.6s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card
              title={<span style={{ fontWeight: 700, color: '#0f172a' }}>设备产品分布</span>}
              extra={<Text type="secondary">TOP 10</Text>}
              style={{ borderRadius: 24 }}
            >
              {deviceByProduct.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>暂无数据</div>
              ) : (
                <div style={{ padding: '4px 0' }}>
                  {deviceByProduct.map((item, index) => {
                    const name = String(item.product_name || '');
                    const count = Number(item.device_count || 0);
                    return (
                      <div key={`${name}-${index}`} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 13, color: '#475569' }}>{name}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>{count}</span>
                        </div>
                        <div style={{ height: 8, background: '#eef3f8', borderRadius: 999, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${maxProductCount > 0 ? (count / maxProductCount) * 100 : 0}%`,
                              background: 'linear-gradient(90deg, #60a5fa 0%, #2563eb 100%)',
                              borderRadius: 999,
                              transition: 'width 0.6s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </Space>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
