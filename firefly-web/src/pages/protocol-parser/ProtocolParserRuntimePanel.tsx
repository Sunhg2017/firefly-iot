import React from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import ListEmpty from '../../components/ListEmpty';
import { formatDateTime } from '../../utils/datetime';

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
  /** Last runtime fetch failure; rendered with an inline retry instead of a transient toast only. */
  error?: string | null;
  /** Requires protocol-parser:publish: reloading swaps every plugin class for running traffic. */
  canReload: boolean;
  lastUpdatedAt?: Date | null;
  autoRefreshPaused?: boolean;
  onToggleAutoRefresh?: () => void;
  onRefresh: () => void;
  onReload: () => void;
}

const ProtocolParserRuntimePanel: React.FC<ProtocolParserRuntimePanelProps> = ({
  loading,
  reloading,
  metrics,
  plugins,
  catalog,
  error,
  canReload,
  lastUpdatedAt,
  autoRefreshPaused,
  onToggleAutoRefresh,
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
        <Space wrap>
          <Typography.Text type="secondary">
            上次更新 {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '-'}
          </Typography.Text>
          <Button
            icon={autoRefreshPaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            onClick={onToggleAutoRefresh}
            disabled={!onToggleAutoRefresh}
          >
            {autoRefreshPaused ? '恢复自动刷新' : '暂停自动刷新'}
          </Button>
          <Button icon={<SyncOutlined />} onClick={onRefresh} loading={loading}>
            刷新
          </Button>
          <Tooltip title={canReload ? undefined : '没有 protocol-parser:publish 权限，无法重载插件'}>
            <span>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={onReload}
                loading={reloading}
                disabled={!canReload}
              >
                重载插件
              </Button>
            </span>
          </Tooltip>
        </Space>
      }
      style={{ marginBottom: 16, borderRadius: 16 }}
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="运行时状态加载失败"
          description={error}
          action={
            <Button size="small" loading={loading} onClick={onRefresh}>
              重试
            </Button>
          }
        />
      ) : null}
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
              locale={{ emptyText: <ListEmpty compact emptyText="暂无运行时插件" /> }}
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
              locale={{ emptyText: <ListEmpty compact emptyText="暂无目录项" /> }}
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
              <ListEmpty compact emptyText="暂无解析计数" />
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
              <ListEmpty compact emptyText="暂无编码计数" />
            )}
          </Card>
        </Col>
      </Row>
    </Card>
  );
};

export default ProtocolParserRuntimePanel;
