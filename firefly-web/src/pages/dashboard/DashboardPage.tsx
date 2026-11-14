import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import {
  AlertOutlined,
  AppstoreOutlined,
  DisconnectOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { dashboardApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

const { Text } = Typography;

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
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [recentAlarms, setRecentAlarms] = useState<DashboardRecord[]>([]);
  const [alarmDist, setAlarmDist] = useState<DashboardRecord[]>([]);
  const [deviceByProduct, setDeviceByProduct] = useState<DashboardRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, alarmRes, distRes, prodRes] = await Promise.all([
        dashboardApi.overview(),
        dashboardApi.recentAlarms(8),
        dashboardApi.alarmDistribution(),
        dashboardApi.deviceByProduct(),
      ]);
      setOverview((ovRes.data.data ?? {}) as Record<string, number>);
      setRecentAlarms((alarmRes.data.data ?? []) as DashboardRecord[]);
      setAlarmDist((distRes.data.data ?? []) as DashboardRecord[]);
      setDeviceByProduct((prodRes.data.data ?? []) as DashboardRecord[]);
      setLoadError(null);
      setLastSuccessAt(new Date());
    } catch (error) {
      // 指标失败时不能退化成 0：保留上一次成功数据并展示错误原因，首次失败则渲染错误态。
      setLoadError(getErrorMessage(error, '加载工作台数据失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const retryButton = (
    <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchAll()}>
      重试
    </Button>
  );

  const header = (
    <PageHeader
      title="工作台"
      extra={(
        <Space wrap>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {lastSuccessAt ? `最后更新 ${formatDateTime(lastSuccessAt)}` : '尚未获取到数据'}
          </span>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchAll()}>
            刷新
          </Button>
        </Space>
      )}
    />
  );

  const alarmColumns: ColumnsType<DashboardRecord> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      ellipsis: true,
      render: (value: unknown) => formatDateTime(value as string | undefined),
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
      title: '告警标题',
      dataIndex: 'rule_name',
      width: 200,
      ellipsis: true,
      render: (value: unknown) => (value ? String(value) : '-'),
    },
    {
      title: '内容',
      dataIndex: 'message',
      ellipsis: true,
      render: (value: unknown) => (value ? String(value) : '-'),
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
  ];

  const onlineRate = useMemo(() => (
    overview?.deviceTotal ? Math.round(((overview.deviceOnline || 0) / overview.deviceTotal) * 100) : 0
  ), [overview?.deviceOnline, overview?.deviceTotal]);

  const heroMetrics = useMemo(() => ([
    { label: '设备总数', value: overview?.deviceTotal || 0, unit: '台', accent: '#2563eb', tint: '#eff6ff' },
    { label: '在线设备', value: overview?.deviceOnline || 0, unit: '台', accent: '#16a34a', tint: '#f0fdf4' },
    { label: '待处理告警', value: overview?.alarmPending || 0, unit: '条', accent: '#ea580c', tint: '#fff7ed' },
    { label: '启用规则链', value: overview?.ruleEnabled || 0, unit: '条', accent: '#7c3aed', tint: '#f5f3ff' },
  ]), [overview?.alarmPending, overview?.deviceOnline, overview?.deviceTotal, overview?.ruleEnabled]);

  const secondaryMetrics = useMemo(() => ([
    {
      title: '在线率',
      value: onlineRate,
      suffix: '%',
      description: '在线设备数 / 设备总数。',
      icon: <WifiOutlined />,
      accent: '#16a34a',
      tint: '#f0fdf4',
      border: '#bbf7d0',
    },
    {
      title: '离线设备',
      value: overview?.deviceOffline || 0,
      suffix: '台',
      description: '设备总数减去在线设备数，包含尚未激活的设备。',
      icon: <DisconnectOutlined />,
      accent: '#dc2626',
      tint: '#fef2f2',
      border: '#fecaca',
    },
    {
      title: '产品数',
      value: overview?.productTotal || 0,
      suffix: '个',
      description: '当前租户下的产品总数。',
      icon: <AppstoreOutlined />,
      accent: '#2563eb',
      tint: '#eff6ff',
      border: '#bfdbfe',
    },
    {
      title: '今日告警',
      value: overview?.alarmToday || 0,
      suffix: '条',
      description: '今日 0 点以来新增的告警数。',
      icon: <AlertOutlined />,
      accent: '#d97706',
      tint: '#fffbeb',
      border: '#fde68a',
    },
    {
      title: '规则链',
      value: overview?.ruleTotal || 0,
      suffix: '条',
      description: '当前租户已创建的规则链总数。',
      icon: <ThunderboltOutlined />,
      accent: '#7c3aed',
      tint: '#f5f3ff',
      border: '#ddd6fe',
    },
  ]), [onlineRate, overview?.alarmToday, overview?.deviceOffline, overview?.productTotal, overview?.ruleTotal]);

  const maxAlarmCount = useMemo(() => (
    Math.max(...alarmDist.map((item) => Number(item.count || 0)), 0)
  ), [alarmDist]);
  const maxProductCount = useMemo(() => (
    Math.max(...deviceByProduct.map((item) => Number(item.device_count || 0)), 0)
  ), [deviceByProduct]);

  if (!overview) {
    return (
      <div className="animate-fade-in">
        {header}
        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="工作台数据加载失败"
            description={loadError}
            action={retryButton}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card style={{ borderRadius: 24 }}>
            <ListEmpty emptyText={loadError ? '暂无可用指标，请重试' : '暂无可展示的指标数据'} />
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {header}

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="工作台数据刷新失败，当前展示的是上一次成功获取的数据"
          description={loadError}
          action={retryButton}
          style={{ marginBottom: 16 }}
        />
      ) : null}

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
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
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
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: metric.accent }}>{metric.value}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{metric.unit}</span>
              </div>
            </div>
          ))}
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
            extra={<Text type="secondary">最近 8 条记录</Text>}
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
              locale={{ emptyText: <ListEmpty compact emptyText="最近暂无告警记录" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card
              title={<span style={{ fontWeight: 700, color: '#0f172a' }}>告警级别分布</span>}
              extra={<Text type="secondary">近 30 天 · 单位：条</Text>}
              style={{ borderRadius: 24 }}
            >
              {alarmDist.length === 0 ? (
                <ListEmpty compact emptyText="近 30 天暂无告警记录" />
              ) : (
                <div style={{ padding: '4px 0' }}>
                  {alarmDist.map((item, index) => {
                    const level = String(item.level || '');
                    const count = Number(item.count || 0);
                    return (
                      <div key={`${level}-${index}`} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center', gap: 10 }}>
                          <Tag color={alarmLevelColors[level]} style={{ margin: 0 }}>
                            {alarmLevelLabels[level] || level || '-'}
                          </Tag>
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>{count} 条</span>
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
              extra={<Text type="secondary">TOP 10 · 单位：台</Text>}
              style={{ borderRadius: 24 }}
            >
              {deviceByProduct.length === 0 ? (
                <ListEmpty compact emptyText="暂无设备产品统计数据" />
              ) : (
                <div style={{ padding: '4px 0' }}>
                  {deviceByProduct.map((item, index) => {
                    const name = String(item.product_name || '-');
                    const count = Number(item.device_count || 0);
                    return (
                      <div key={`${name}-${index}`} style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 13, color: '#475569' }}>{name}</span>
                          <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>{count} 台</span>
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
