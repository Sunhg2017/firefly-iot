import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Input, Modal, Select, Space, Switch, Table, Tag, Tooltip, message } from 'antd';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { notificationRecordApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { usePageActivation } from '../../hooks/usePageActivation';
import {
  notificationChannelColors,
  notificationChannelLabels,
  notificationChannelOptions,
  notificationStatusColors,
  notificationStatusLabels,
} from '../../constants/notification';

interface RecordItem {
  id: number;
  channelType: string;
  templateCode: string;
  subject: string;
  content: string;
  recipient: string;
  status: string;
  errorMessage: string;
  retryCount: number;
  sentAt: string;
  createdAt: string;
}

interface RecordQuery {
  pageNum: number;
  pageSize: number;
  channelType?: string;
  status?: string;
  keyword?: string;
}

const DEFAULT_QUERY: RecordQuery = { pageNum: 1, pageSize: 20 };

const NotificationRecordPage: React.FC = () => {
  const [data, setData] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState<RecordQuery>(DEFAULT_QUERY);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [detail, setDetail] = useState<RecordItem | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const hasFilters = Boolean(params.channelType || params.status || params.keyword);

  // silent 用于轮询：不切换表格 loading，失败时保留已有记录，避免页面每分钟闪一次。
  const fetchData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const res = await notificationRecordApi.list({
        pageNum: params.pageNum,
        pageSize: params.pageSize,
        channelType: params.channelType,
        status: params.status,
        keyword: params.keyword?.trim() || undefined,
      });
      setData(res.data?.data?.records || []);
      setTotal(res.data?.data?.total || 0);
    } catch (error) {
      if (!silent) {
        setData([]);
        setTotal(0);
      }
      setLoadError(getErrorMessage(error, '加载通知记录失败'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params]);

  // 记录页用于观察新产生的发送结果，轮询可暂停；首屏由 effect 负责，避免重复请求。
  const { paused, togglePaused, lastUpdatedAt } = useAutoRefresh(() => fetchData(true), {
    intervalMs: 60000,
    immediate: false,
  });

  usePageActivation(() => {
    void fetchData();
  });

  const resetFilters = () => {
    setKeywordDraft('');
    setParams({ ...DEFAULT_QUERY, pageSize: params.pageSize });
  };

  const openDetail = async (item: RecordItem) => {
    if (detailLoadingId != null) {
      return;
    }
    setDetailLoadingId(item.id);
    try {
      const res = await notificationRecordApi.get(item.id);
      const record = (res.data?.data || item) as RecordItem;
      setDetail(record);
    } catch (error) {
      message.error(getErrorMessage(error, '加载通知记录详情失败'));
    } finally {
      setDetailLoadingId(null);
    }
  };

  const columns: ColumnsType<RecordItem> = [
    { title: '发送时间', dataIndex: 'createdAt', width: 180, render: (value: string) => formatDateTime(value) },
    { title: '渠道', dataIndex: 'channelType', width: 120, render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag> },
    { title: '模板编码', dataIndex: 'templateCode', width: 160, ellipsis: true },
    { title: '主题', dataIndex: 'subject', width: 220, ellipsis: true, render: (value: string) => value || '-' },
    { title: '接收方', dataIndex: 'recipient', width: 220, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag color={notificationStatusColors[value] || 'default'}>{notificationStatusLabels[value] || value}</Tag> },
    { title: '重试次数', dataIndex: 'retryCount', width: 90 },
    {
      title: '操作',
      width: 110,
      render: (_value, item) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          loading={detailLoadingId === item.id}
          onClick={() => void openDetail(item)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="通知记录"
        extra={
          <Space>
            <Tooltip title={lastUpdatedAt ? `最近自动刷新：${formatDateTime(lastUpdatedAt)}` : '尚未自动刷新'}>
              <Switch
                size="small"
                checked={!paused}
                onChange={togglePaused}
                checkedChildren="自动刷新"
                unCheckedChildren="已暂停"
              />
            </Tooltip>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>刷新</Button>
          </Space>
        }
      />
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载通知记录失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void fetchData()}>重试</Button>}
        />
      ) : null}
      <Card bordered={false} style={{ borderRadius: 12 }} title="发送记录">
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="搜索接收方或主题"
            style={{ width: 260 }}
            value={keywordDraft}
            onChange={(event) => {
              const value = event.target.value;
              setKeywordDraft(value);
              if (!value && params.keyword) {
                setParams((prev) => ({ ...prev, pageNum: 1, keyword: undefined }));
              }
            }}
            onSearch={(value) => setParams((prev) => ({ ...prev, pageNum: 1, keyword: value.trim() || undefined }))}
          />
          <Select
            allowClear
            placeholder="按渠道筛选"
            style={{ width: 160 }}
            value={params.channelType}
            options={notificationChannelOptions as unknown as { value: string; label: string }[]}
            onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, channelType: value }))}
          />
          <Select
            allowClear
            placeholder="按状态筛选"
            style={{ width: 140 }}
            value={params.status}
            options={[{ value: 'SUCCESS', label: '发送成功' }, { value: 'FAILED', label: '发送失败' }, { value: 'PENDING', label: '待发送' }]}
            onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, status: value }))}
          />
          {hasFilters ? <Button onClick={resetFilters}>清空筛选</Button> : null}
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1180 }}
          locale={{ emptyText: <ListEmpty hasFilters={hasFilters} emptyText="暂无通知记录" onClearFilters={resetFilters} /> }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value) => `共 ${value} 条记录`,
            onChange: (page, pageSize) => setParams((prev) => ({ ...prev, pageNum: page, pageSize })),
          }}
        />
        <Modal title="通知记录详情" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={720}>
          {detail && (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="渠道">
                <Tag color={notificationChannelColors[detail.channelType] || 'default'}>
                  {notificationChannelLabels[detail.channelType] || detail.channelType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="接收方"><CopyText text={detail.recipient} /></Descriptions.Item>
              <Descriptions.Item label="发送时间">{formatDateTime(detail.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="发送完成时间">{formatDateTime(detail.sentAt)}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={notificationStatusColors[detail.status] || 'default'}>
                  {notificationStatusLabels[detail.status] || detail.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="重试次数">{detail.retryCount ?? 0}</Descriptions.Item>
              <Descriptions.Item label="模板编码" span={2}>{detail.templateCode || '-'}</Descriptions.Item>
              <Descriptions.Item label="主题" span={2}>{detail.subject || '-'}</Descriptions.Item>
              <Descriptions.Item label="内容" span={2}>
                <CopyText text={detail.content}>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detail.content || '-'}</pre>
                </CopyText>
              </Descriptions.Item>
              {detail.errorMessage ? (
                <Descriptions.Item label="失败原因" span={2}>
                  <CopyText text={detail.errorMessage} style={{ color: '#ff4d4f' }} />
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          )}
        </Modal>
      </Card>
    </div>
  );
};

export default NotificationRecordPage;
