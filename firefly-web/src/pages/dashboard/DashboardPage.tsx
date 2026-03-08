import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Spin } from 'antd';
import {
  HddOutlined, AlertOutlined, AppstoreOutlined,
  ThunderboltOutlined, CheckCircleOutlined,
  WifiOutlined, DisconnectOutlined,
} from '@ant-design/icons';
import { dashboardApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';

const alarmLevelColors: Record<string, string> = {
  CRITICAL: '#ef4444', MAJOR: '#f97316', MINOR: '#f59e0b', WARNING: '#3b82f6', INFO: '#10b981',
};
const alarmLevelLabels: Record<string, string> = {
  CRITICAL: '紧急', MAJOR: '重要', MINOR: '次要', WARNING: '警告', INFO: '信息',
};
const alarmStatusLabels: Record<string, string> = {
  TRIGGERED: '待处理', ACKNOWLEDGED: '已确认', RESOLVED: '已恢复',
};

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  suffix?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, gradient, suffix }) => (
  <div
    style={{
      background: gradient,
      borderRadius: 14,
      padding: '20px 20px 16px',
      color: '#fff',
      position: 'relative',
      overflow: 'hidden',
      minHeight: 110,
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: -12,
        right: -12,
        fontSize: 64,
        opacity: 0.12,
        lineHeight: 1,
      }}
    >
      {icon}
    </div>
    <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8, fontWeight: 500 }}>{title}</div>
    <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
      {value}
      {suffix && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 6, opacity: 0.8 }}>{suffix}</span>}
    </div>
  </div>
);

const DashboardPage: React.FC = () => {
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [recentAlarms, setRecentAlarms] = useState<Record<string, unknown>[]>([]);
  const [alarmDist, setAlarmDist] = useState<Record<string, unknown>[]>([]);
  const [deviceByProduct, setDeviceByProduct] = useState<Record<string, unknown>[]>([]);
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
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const alarmColumns: ColumnsType<Record<string, unknown>> = [
    { title: '时间', dataIndex: 'created_at', width: 170, ellipsis: true },
    { title: '级别', dataIndex: 'level', width: 80,
      render: (v: string) => <Tag color={alarmLevelColors[v]}>{alarmLevelLabels[v] || v}</Tag> },
    { title: '规则', dataIndex: 'rule_name', width: 150, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'TRIGGERED' ? 'error' : v === 'RESOLVED' ? 'success' : 'warning'}>{alarmStatusLabels[v] || v}</Tag> },
    { title: '消息', dataIndex: 'message', ellipsis: true },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  const onlineRate = overview.deviceTotal ? Math.round((overview.deviceOnline / overview.deviceTotal) * 100) : 0;

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>工作台</h2>
        <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>设备运行概览与告警监控</p>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="设备总数"
            value={overview.deviceTotal || 0}
            icon={<HddOutlined />}
            gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="在线设备"
            value={overview.deviceOnline || 0}
            icon={<WifiOutlined />}
            gradient="linear-gradient(135deg, #11998e 0%, #38ef7d 100%)"
            suffix={`${onlineRate}%`}
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="离线设备"
            value={overview.deviceOffline || 0}
            icon={<DisconnectOutlined />}
            gradient="linear-gradient(135deg, #eb3349 0%, #f45c43 100%)"
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="产品数"
            value={overview.productTotal || 0}
            icon={<AppstoreOutlined />}
            gradient="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="今日告警"
            value={overview.alarmToday || 0}
            icon={<AlertOutlined />}
            gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="待处理告警"
            value={overview.alarmPending || 0}
            icon={<AlertOutlined />}
            gradient="linear-gradient(135deg, #fa709a 0%, #fee140 100%)"
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="规则引擎"
            value={overview.ruleTotal || 0}
            icon={<ThunderboltOutlined />}
            gradient="linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)"
          />
        </Col>
        <Col xs={12} sm={8} md={6}>
          <StatCard
            title="启用规则"
            value={overview.ruleEnabled || 0}
            icon={<CheckCircleOutlined />}
            gradient="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
        {/* 最近告警 */}
        <Col xs={24} lg={16}>
          <Card
            title={<span style={{ fontWeight: 600, color: '#1e293b' }}>最近告警</span>}
            size="small"
            styles={{ body: { padding: '8px 0 0' } }}
          >
            <Table
              rowKey="id"
              columns={alarmColumns}
              dataSource={recentAlarms}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
            />
          </Card>
        </Col>

        {/* 右侧面板 */}
        <Col xs={24} lg={8}>
          {/* 告警级别分布 */}
          <Card
            title={<span style={{ fontWeight: 600, color: '#1e293b' }}>告警级别分布（30天）</span>}
            size="small"
            style={{ marginBottom: 16 }}
          >
            {alarmDist.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>暂无数据</div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {alarmDist.map((item, idx) => {
                  const level = String(item.level || '');
                  const count = Number(item.count || 0);
                  const maxCount = Math.max(...alarmDist.map(d => Number(d.count || 0)));
                  return (
                    <div key={idx} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                        <Tag color={alarmLevelColors[level]} style={{ margin: 0 }}>{alarmLevelLabels[level] || level}</Tag>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>{count}</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%`,
                            background: alarmLevelColors[level] || '#4f46e5',
                            borderRadius: 3,
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

          {/* 设备产品分布 */}
          <Card
            title={<span style={{ fontWeight: 600, color: '#1e293b' }}>设备产品分布 (TOP 10)</span>}
            size="small"
          >
            {deviceByProduct.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>暂无数据</div>
            ) : (
              <div style={{ padding: '4px 0' }}>
                {deviceByProduct.map((item, idx) => {
                  const name = String(item.product_name || '');
                  const count = Number(item.device_count || 0);
                  const maxCount = Math.max(...deviceByProduct.map(d => Number(d.device_count || 0)));
                  return (
                    <div key={idx} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#475569' }}>{name}</span>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#334155' }}>{count}</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%`,
                            background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                            borderRadius: 3,
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
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
