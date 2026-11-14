import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ApiOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { apiKeyApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

interface OpenApiDocAuthHeader {
  name: string;
  required: boolean;
  description?: string;
  example?: string;
}

interface OpenApiDocField {
  name: string;
  location: string;
  type: string;
  required: boolean;
  description?: string;
  example?: string;
}

interface OpenApiDocItem {
  code: string;
  name: string;
  summary?: string;
  description?: string;
  serviceCode: string;
  serviceName: string;
  httpMethod: string;
  gatewayPath: string;
  requestContentTypes: string[];
  responseContentType?: string;
  successStatus?: string;
  bodyRequired?: boolean;
  parameterFields: OpenApiDocField[];
  requestFields: OpenApiDocField[];
  responseFields: OpenApiDocField[];
  requestExample?: string;
  responseExample?: string;
  curlExample?: string;
}

interface OpenApiDocServiceGroup {
  serviceCode: string;
  serviceName: string;
  apiCount: number;
  docAvailable: boolean;
  errorMessage?: string;
  docSyncedAt?: string;
  items: OpenApiDocItem[];
}

interface OpenApiDocResponse {
  generatedAt?: string;
  signatureAlgorithm?: string;
  canonicalRequestTemplate?: string;
  gatewayBasePathTemplate?: string;
  authHeaders: OpenApiDocAuthHeader[];
  services: OpenApiDocServiceGroup[];
}

const methodColorMap: Record<string, string> = {
  GET: 'blue',
  POST: 'green',
  PUT: 'orange',
  DELETE: 'red',
  PATCH: 'purple',
};

const locationLabelMap: Record<string, string> = {
  PATH: '路径参数',
  QUERY: '查询参数',
  HEADER: '业务请求头',
  BODY: '请求体',
  RESPONSE: '响应体',
};

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: '#0f172a',
  color: '#e2e8f0',
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const OpenApiDocsTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [serviceCode, setServiceCode] = useState<string>();
  const [docData, setDocData] = useState<OpenApiDocResponse>({
    authHeaders: [],
    services: [],
  });

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const response = await apiKeyApi.getOpenApiDocs();
      setDocData((response.data?.data ?? { authHeaders: [], services: [] }) as OpenApiDocResponse);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, '加载 Open API 文档失败'));
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDocs();
  }, []);

  const filteredServices = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return (docData.services ?? [])
      .map((service) => {
        const items = (service.items ?? []).filter((item) => {
          if (!normalizedKeyword) {
            return true;
          }
          const searchText = [
            item.code,
            item.name,
            item.summary,
            item.description,
            item.gatewayPath,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return searchText.includes(normalizedKeyword);
        });
        return {
          ...service,
          items,
        };
      })
      .filter((service) => {
        if (serviceCode && service.serviceCode !== serviceCode) {
          return false;
        }
        return service.items.length > 0;
      });
  }, [docData.services, keyword, serviceCode]);

  const totalVisibleApis = useMemo(
    () => filteredServices.reduce((sum, service) => sum + service.items.length, 0),
    [filteredServices],
  );

  const fieldColumns: ColumnsType<OpenApiDocField> = [
    { title: '字段', dataIndex: 'name', width: 220 },
    {
      title: '位置',
      dataIndex: 'location',
      width: 120,
      render: (value: string) => locationLabelMap[value] || value,
    },
    { title: '类型', dataIndex: 'type', width: 160 },
    {
      title: '必填',
      dataIndex: 'required',
      width: 90,
      render: (value: boolean) => <Tag color={value ? 'error' : 'default'}>{value ? '是' : '否'}</Tag>,
    },
    { title: '说明', dataIndex: 'description', render: (value?: string) => value || '-' },
    {
      title: '示例',
      dataIndex: 'example',
      width: 220,
      render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
    },
  ];

  const itemColumns: ColumnsType<OpenApiDocItem> = [
    {
      title: '接口',
      dataIndex: 'name',
      width: 220,
      render: (_value: string, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.name}</Typography.Text>
          <Typography.Text type="secondary">{record.code}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '方法',
      dataIndex: 'httpMethod',
      width: 100,
      render: (value: string) => <Tag color={methodColorMap[value] ?? 'default'}>{value}</Tag>,
    },
    {
      title: '调用地址',
      dataIndex: 'gatewayPath',
      render: (value: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
    },
    {
      title: '说明',
      render: (_value: unknown, record) => record.summary || record.description || '-',
    },
  ];

  const renderFieldSection = (title: string, fields: OpenApiDocField[]) => (
    <Card size="small" title={title}>
      {fields.length ? (
        <Table<OpenApiDocField>
          rowKey={(record) => `${title}-${record.location}-${record.name}`}
          size="small"
          pagination={false}
          columns={fieldColumns}
          dataSource={fields}
          scroll={{ x: 980 }}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无字段说明" />
      )}
    </Card>
  );

  const renderCodeBlock = (title: string, value?: string) => (
    <Card
      size="small"
      title={title}
      extra={value ? <CopyText text={value}>复制</CopyText> : null}
    >
      {value ? (
        <pre style={codeBlockStyle}>{value}</pre>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无示例" />
      )}
    </Card>
  );

  const renderExpandedRow = (record: OpenApiDocItem) => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Descriptions bordered size="small" column={2}>
        <Descriptions.Item label="接口编码">{record.code}</Descriptions.Item>
        <Descriptions.Item label="HTTP 方法">
          <Tag color={methodColorMap[record.httpMethod] ?? 'default'}>{record.httpMethod}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="所属服务">{record.serviceName}</Descriptions.Item>
        <Descriptions.Item label="成功状态码">{record.successStatus || '-'}</Descriptions.Item>
        <Descriptions.Item label="调用地址" span={2}>
          {record.gatewayPath ? <CopyText text={record.gatewayPath} /> : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="请求体必填">{record.bodyRequired ? '是' : '否'}</Descriptions.Item>
        <Descriptions.Item label="请求类型">
          {record.requestContentTypes?.length ? record.requestContentTypes.join(' / ') : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="响应类型">{record.responseContentType || '-'}</Descriptions.Item>
        <Descriptions.Item label="接口摘要" span={2}>{record.summary || '-'}</Descriptions.Item>
        <Descriptions.Item label="接口说明" span={2}>{record.description || '-'}</Descriptions.Item>
      </Descriptions>

      {renderFieldSection('路径/查询/业务请求头参数', record.parameterFields ?? [])}
      {renderFieldSection('请求体字段', (record.requestFields ?? []).map((item) => ({ ...item, location: 'BODY' })))}
      {renderFieldSection('响应字段', (record.responseFields ?? []).map((item) => ({ ...item, location: 'RESPONSE' })))}
      {renderCodeBlock('请求示例', record.requestExample)}
      {renderCodeBlock('响应示例', record.responseExample)}
      {renderCodeBlock('curl 调用示例', record.curlExample)}
    </Space>
  );

  return (
    <div>
      <PageHeader
        title="Open API 文档"
        extra={(
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchDocs()}>
            刷新文档
          </Button>
        )}
      />

      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="Open API 文档加载失败"
          description={loadError}
          action={(
            <Button size="small" onClick={() => void fetchDocs()} loading={loading}>
              重试
            </Button>
          )}
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {docData.generatedAt ? (
            <Typography.Text type="secondary">{`文档快照时间：${formatDateTime(docData.generatedAt)}`}</Typography.Text>
          ) : null}
          <Card size="small" title="鉴权请求头">
            <Table<OpenApiDocAuthHeader>
              rowKey="name"
              size="small"
              pagination={false}
              dataSource={docData.authHeaders ?? []}
              columns={[
                { title: '请求头', dataIndex: 'name', width: 160 },
                {
                  title: '必填',
                  dataIndex: 'required',
                  width: 90,
                  render: (value: boolean) => <Tag color={value ? 'error' : 'default'}>{value ? '是' : '否'}</Tag>,
                },
                { title: '说明', dataIndex: 'description' },
                {
                  title: '示例',
                  dataIndex: 'example',
                  width: 220,
                  render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-'),
                },
              ]}
            />
          </Card>

          <Card size="small" title="签名原文模板">
            <pre style={codeBlockStyle}>{docData.canonicalRequestTemplate || '暂无模板'}</pre>
          </Card>
        </Space>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap size={16} style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Input
              allowClear
              placeholder="搜索编码、名称、调用地址或说明"
              style={{ width: 320 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              allowClear
              placeholder="按服务筛选"
              style={{ width: 220 }}
              value={serviceCode}
              onChange={setServiceCode}
              options={(docData.services ?? []).map((item) => ({
                value: item.serviceCode,
                label: `${item.serviceName} (${item.apiCount})`,
              }))}
            />
          </Space>

          <Space>
            <Tag color="blue" icon={<ApiOutlined />}>
              服务数 {filteredServices.length}
            </Tag>
            <Tag color="green">
              接口数 {totalVisibleApis}
            </Tag>
          </Space>
        </Space>
      </Card>

      {loading && !loaded ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : null}

      {filteredServices.length ? filteredServices.map((service) => (
        <Card
          key={service.serviceCode}
          title={`${service.serviceName}（${service.items.length}）`}
          style={{ marginBottom: 16 }}
          extra={service.docSyncedAt ? <Typography.Text type="secondary">最近同步：{formatDateTime(service.docSyncedAt)}</Typography.Text> : null}
        >
          {!service.docAvailable ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="接口详情同步中"
              description={service.errorMessage}
            />
          ) : null}

          <Table<OpenApiDocItem>
            rowKey="code"
            size="middle"
            loading={loading}
            columns={itemColumns}
            dataSource={service.items}
            pagination={false}
            expandable={{
              expandedRowRender: renderExpandedRow,
            }}
            scroll={{ x: 1320 }}
          />
        </Card>
      )) : loading && !loaded ? null : (
        <Card>
          <ListEmpty
            hasFilters={Boolean(keyword.trim() || serviceCode)}
            onClearFilters={() => {
              setKeyword('');
              setServiceCode(undefined);
            }}
            emptyText="暂无可查看的 Open API 文档"
            filteredText="没有符合当前筛选条件的 Open API 文档"
          />
        </Card>
      )}
    </div>
  );
};

export default OpenApiDocsTab;
