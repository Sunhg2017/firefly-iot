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
      title: 'Plugin',
      dataIndex: 'displayName',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.displayName || record.pluginId}</Typography.Text>
          <Typography.Text type="secondary">{record.pluginId}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Version',
      dataIndex: 'version',
      width: 120,
      render: (value?: string) => value || '-',
    },
    {
      title: 'Capability',
      width: 180,
      render: (_, record) => (
        <Space wrap>
          {record.supportsParse ? <Tag color="blue">Parse</Tag> : null}
          {record.supportsEncode ? <Tag color="green">Encode</Tag> : null}
          {!record.supportsParse && !record.supportsEncode ? <Tag>Unknown</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Source',
      dataIndex: 'sourceType',
      width: 140,
      render: (value?: string) => <Tag>{value || 'UNKNOWN'}</Tag>,
    },
    {
      title: 'Location',
      dataIndex: 'sourceLocation',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
  ];

  const catalogColumns: ColumnsType<RuntimePluginCatalogItem> = [
    {
      title: 'Catalog Item',
      dataIndex: 'displayName',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.displayName || record.pluginId}</Typography.Text>
          <Typography.Text type="secondary">{record.pluginId}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Vendor',
      dataIndex: 'vendor',
      width: 140,
      render: (value?: string) => value || '-',
    },
    {
      title: 'Latest',
      dataIndex: 'latestVersion',
      width: 120,
      render: (value?: string) => value || '-',
    },
    {
      title: 'Installed',
      width: 180,
      render: (_, record) =>
        record.installed ? (
          <Space wrap>
            <Tag color="success">Installed</Tag>
            {record.installedVersion ? <Typography.Text>{record.installedVersion}</Typography.Text> : null}
          </Space>
        ) : (
          <Tag>Not Installed</Tag>
        ),
    },
    {
      title: 'Install Hint',
      dataIndex: 'installHint',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
  ];

  const parseCounters = Object.entries(metrics?.parseTransportCounters || {});
  const encodeCounters = Object.entries(metrics?.encodeTransportCounters || {});

  return (
    <Card
      title="Runtime"
      extra={
        <Space>
          <Button icon={<SyncOutlined />} onClick={onRefresh} loading={loading}>
            Refresh
          </Button>
          <Button type="primary" icon={<ReloadOutlined />} onClick={onReload} loading={reloading}>
            Reload Plugins
          </Button>
        </Space>
      }
      style={{ marginBottom: 16, borderRadius: 16 }}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Parse" value={metrics?.parseHandledCount || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Encode" value={metrics?.encodeHandledCount || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Debug Success" value={metrics?.debugSuccessCount || 0} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="Parse Avg (ms)" value={metrics?.avgParseCostMs || 0} precision={2} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="Installed Plugins"
            extra={<Typography.Text type="secondary">{plugins.length} loaded</Typography.Text>}
          >
            <Table
              rowKey={(record) => `${record.pluginId}:${record.version || 'latest'}`}
              size="small"
              loading={loading || reloading}
              columns={pluginColumns}
              dataSource={plugins}
              pagination={false}
              locale={{ emptyText: <Empty description="No runtime plugins" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              scroll={{ x: 720 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title="Plugin Catalog"
            extra={<Typography.Text type="secondary">{catalog.length} items</Typography.Text>}
          >
            <Table
              rowKey={(record) => record.pluginId}
              size="small"
              loading={loading || reloading}
              columns={catalogColumns}
              dataSource={catalog}
              pagination={false}
              locale={{ emptyText: <Empty description="No catalog items" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              scroll={{ x: 720 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={12}>
          <Card size="small" title="Parse Counters">
            {parseCounters.length > 0 ? (
              <Space wrap>
                {parseCounters.map(([transport, count]) => (
                  <Tag key={transport} color="blue">
                    {transport}: {count}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Empty description="No parse counters" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title="Encode Counters">
            {encodeCounters.length > 0 ? (
              <Space wrap>
                {encodeCounters.map(([transport, count]) => (
                  <Tag key={transport} color="green">
                    {transport}: {count}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Empty description="No encode counters" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default ProtocolParserRuntimePanel;
