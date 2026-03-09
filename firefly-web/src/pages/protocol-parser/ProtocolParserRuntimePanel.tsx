import React from 'react';
import { Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined, SyncOutlined } from '@ant-design/icons';

export interface RuntimeMetrics {
  parseHandledCount?: number;
  parseFallbackCount?: number;
  parseErrorCount?: number;
  encodeHandledCount?: number;
  encodeFallbackCount?: number;
  encodeErrorCount?: number;
  debugSuccessCount?: number;
  debugErrorCount?: number;
  avgParseCostMs?: number;
  avgEncodeCostMs?: number;
  avgDebugCostMs?: number;
  parseTransportCounters?: Record<string, number>;
  encodeTransportCounters?: Record<string, number>;
}

export interface RuntimePlugin {
  pluginId: string;
  version?: string;
  displayName?: string;
  description?: string;
  supportsParse?: boolean;
  supportsEncode?: boolean;
  sourceType?: string;
  sourceLocation?: string;
  loadedAt?: string;
}

export interface RuntimePluginCatalogItem {
  pluginId: string;
  latestVersion?: string;
  displayName?: string;
  description?: string;
  vendor?: string;
  installed?: boolean;
  installedVersion?: string;
  installHint?: string;
}

interface ProtocolParserRuntimePanelProps {
  loading: boolean;
  reloading: boolean;
  metrics: RuntimeMetrics | null;
  plugins: RuntimePlugin[];
  catalog: RuntimePluginCatalogItem[];
  onRefresh: () => void;
  onReload: () => void;
}

const ProtocolParserRuntimePanel: React.FC<ProtocolParserRuntimePanelProps> = ({
  loading,
  reloading,
  metrics,
  plugins,
  catalog,
  onRefresh,
  onReload,
}) => {
  const pluginColumns: ColumnsType<RuntimePlugin> = [
    {
      title: '插件',
      dataIndex: 'displayName',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.displayName || record.pluginId}</Typography.Text>
          <Typography.Text type="secondary">{record.pluginId}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 120,
      render: (value?: string) => value || '-',
    },
    {
      title: '能力',
      width: 180,
      render: (_, record) => (
        <Space wrap>
          {record.supportsParse ? <Tag color="blue">解析</Tag> : null}
          {record.supportsEncode ? <Tag color="green">编码</Tag> : null}
          {!record.supportsParse && !record.supportsEncode ? <Tag>未知</Tag> : null}
        </Space>
      ),
    },
    {
      title: '来源',
      dataIndex: 'sourceType',
      width: 140,
      render: (value?: string) => <Tag>{value || '未知'}</Tag>,
    },
    {
      title: '位置',
      dataIndex: 'sourceLocation',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
  ];

  const catalogColumns: ColumnsType<RuntimePluginCatalogItem> = [
    {
      title: '目录项',
      dataIndex: 'displayName',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.displayName || record.pluginId}</Typography.Text>
          <Typography.Text type="secondary">{record.pluginId}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '厂商',
      dataIndex: 'vendor',
      width: 140,
      render: (value?: string) => value || '-',
    },
    {
      title: '最新版本',
      dataIndex: 'latestVersion',
      width: 120,
      render: (value?: string) => value || '-',
    },
    {
      title: '安装状态',
      width: 180,
      render: (_, record) =>
        record.installed ? (
          <Space wrap>
            <Tag color="success">已安装</Tag>
            {record.installedVersion ? <Typography.Text>{record.installedVersion}</Typography.Text> : null}
          </Space>
        ) : (
          <Tag>未安装</Tag>
        ),
    },
    {
      title: '安装提示',
      dataIndex: 'installHint',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
  ];

  const parseCounters = Object.entries(metrics?.parseTransportCounters || {});
  const encodeCounters = Object.entries(metrics?.encodeTransportCounters || {});

  return (
    <Card
      title="运行时"
      extra={
        <Space>
          <Button icon={<SyncOutlined />} onClick={onRefresh} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<ReloadOutlined />} onClick={onReload} loading={reloading}>
            重载插件
          </Button>
        </Space>
      }
      style={{ marginBottom: 16, borderRadius: 16 }}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="解析次数" value={metrics?.parseHandledCount || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="编码次数" value={metrics?.encodeHandledCount || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="调试成功" value={metrics?.debugSuccessCount || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="平均解析耗时(ms)" value={metrics?.avgParseCostMs || 0} precision={2} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="已安装插件"
            extra={<Typography.Text type="secondary">已加载 {plugins.length} 个</Typography.Text>}
          >
            <Table
              rowKey={(record) => `${record.pluginId}:${record.version || 'latest'}`}
              size="small"
              loading={loading || reloading}
              columns={pluginColumns}
              dataSource={plugins}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无运行时插件" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              scroll={{ x: 720 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="插件目录"
            extra={<Typography.Text type="secondary">共 {catalog.length} 项</Typography.Text>}
          >
            <Table
              rowKey={(record) => record.pluginId}
              size="small"
              loading={loading || reloading}
              columns={catalogColumns}
              dataSource={catalog}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无目录项" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              scroll={{ x: 720 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card size="small" title="解析计数">
            {parseCounters.length > 0 ? (
              <Space wrap>
                {parseCounters.map(([transport, count]) => (
                  <Tag key={transport} color="blue">
                    {transport}: {count}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Empty description="暂无解析计数" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="编码计数">
            {encodeCounters.length > 0 ? (
              <Space wrap>
                {encodeCounters.map(([transport, count]) => (
                  <Tag key={transport} color="green">
                    {transport}: {count}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Empty description="暂无编码计数" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default ProtocolParserRuntimePanel;
