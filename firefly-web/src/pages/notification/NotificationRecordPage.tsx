import React, { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Modal, Select, Space, Table, Tag, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { notificationRecordApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
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

const NotificationRecordPage: React.FC = () => {
  const [data, setData] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20, channelType: undefined as string | undefined, status: undefined as string | undefined });
  const [detail, setDetail] = useState<RecordItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await notificationRecordApi.list(params);
      setData(res.data?.data?.records || []);
      setTotal(res.data?.data?.total || 0);
    } catch {
      message.error('加载通知记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params]);

  const columns: ColumnsType<RecordItem> = [
    { title: '发送时间', dataIndex: 'createdAt', width: 180 },
    { title: '渠道', dataIndex: 'channelType', width: 120, render: (value: string) => <Tag color={notificationChannelColors[value] || 'default'}>{notificationChannelLabels[value] || value}</Tag> },
    { title: '模板编码', dataIndex: 'templateCode', width: 160, ellipsis: true },
    { title: '主题', dataIndex: 'subject', width: 220, ellipsis: true, render: (value: string) => value || '-' },
    { title: '接收方', dataIndex: 'recipient', width: 220, ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => <Tag color={notificationStatusColors[value] || 'default'}>{notificationStatusLabels[value] || value}</Tag> },
    { title: '重试次数', dataIndex: 'retryCount', width: 90 },
    { title: '操作', width: 90, render: (_value, item) => <Button type="link" size="small" icon={<EyeOutlined />} onClick={async () => { const res = await notificationRecordApi.get(item.id); setDetail(res.data?.data || null); }}>详情</Button> },
  ];

  return (
    <div>
      <PageHeader title="通知记录" />
      <Card bordered={false} style={{ borderRadius: 12 }} title="发送记录">
        <Space wrap style={{ marginBottom: 16 }}>
          <Select allowClear placeholder="按渠道筛选" style={{ width: 160 }} options={notificationChannelOptions as unknown as { value: string; label: string }[]} onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, channelType: value }))} />
          <Select allowClear placeholder="按状态筛选" style={{ width: 140 }} options={[{ value: 'SUCCESS', label: '发送成功' }, { value: 'FAILED', label: '发送失败' }, { value: 'PENDING', label: '待发送' }]} onChange={(value) => setParams((prev) => ({ ...prev, pageNum: 1, status: value }))} />
        </Space>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1180 }} pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true, showTotal: (value) => `共 ${value} 条记录`, onChange: (page, pageSize) => setParams((prev) => ({ ...prev, pageNum: page, pageSize })) }} />
        <Modal title="通知记录详情" open={!!detail} onCancel={() => setDetail(null)} footer={null} width={720}>
          {detail && (
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="记录 ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="发送时间">{detail.createdAt}</Descriptions.Item>
              <Descriptions.Item label="渠道"><Tag color={notificationChannelColors[detail.channelType] || 'default'}>{notificationChannelLabels[detail.channelType] || detail.channelType}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={notificationStatusColors[detail.status] || 'default'}>{notificationStatusLabels[detail.status] || detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="模板编码">{detail.templateCode || '-'}</Descriptions.Item>
              <Descriptions.Item label="发送完成时间">{detail.sentAt || '-'}</Descriptions.Item>
              <Descriptions.Item label="接收方" span={2}>{detail.recipient || '-'}</Descriptions.Item>
              <Descriptions.Item label="主题" span={2}>{detail.subject || '-'}</Descriptions.Item>
              <Descriptions.Item label="内容" span={2}><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{detail.content || '-'}</pre></Descriptions.Item>
              {detail.errorMessage ? <Descriptions.Item label="失败原因" span={2}><span style={{ color: '#ff4d4f' }}>{detail.errorMessage}</span></Descriptions.Item> : null}
            </Descriptions>
          )}
        </Modal>
      </Card>
    </div>
  );
};

export default NotificationRecordPage;
