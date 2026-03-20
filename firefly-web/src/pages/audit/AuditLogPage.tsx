import React, { useEffect, useState } from 'react';
import { Table, Tag, Space, Card, message, Input, Select, Modal, Descriptions } from 'antd';
import { EyeOutlined, FileSearchOutlined } from '@ant-design/icons';
import { auditLogApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface AuditLogRecord {
  id: number;
  tenantId: number;
  userId: number;
  username: string;
  module: string;
  action: string;
  description: string;
  targetType: string;
  targetId: string;
  requestMethod: string;
  requestUrl: string;
  responseStatus: string;
  clientIp: string;
  duration: number;
  errorMessage: string;
  createdAt: string;
}

const moduleLabels: Record<string, string> = {
  TENANT: '租户管理', USER: '用户管理', ROLE: '角色权限', PROJECT: '项目管理',
  PRODUCT: '产品管理', DEVICE: '设备管理', RULE_ENGINE: '规则引擎', ALARM: '告警管理',
  OTA: 'OTA 升级', VIDEO: '视频监控', FILE: '文件管理', API_KEY: 'API 密钥',
  SYSTEM: '系统设置', AUTH: '认证授权',
};

const actionLabels: Record<string, string> = {
  CREATE: '创建', UPDATE: '更新', DELETE: '删除', QUERY: '查询',
  IMPORT: '导入', EXPORT: '导出', ENABLE: '启用', DISABLE: '禁用',
  LOGIN: '登录', LOGOUT: '登出', UPLOAD: '上传', DOWNLOAD: '下载',
  EXECUTE: '执行', APPROVE: '审批', REJECT: '驳回',
};

const actionColors: Record<string, string> = {
  CREATE: 'green', UPDATE: 'blue', DELETE: 'red', QUERY: 'default',
  ENABLE: 'cyan', DISABLE: 'orange', LOGIN: 'purple', LOGOUT: 'default',
  UPLOAD: 'geekblue', EXECUTE: 'volcano',
};

const methodColors: Record<string, string> = {
  GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red', PATCH: 'cyan',
};

const AuditLogPage: React.FC = () => {
  const [data, setData] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [filterModule, setFilterModule] = useState<string | undefined>();
  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<AuditLogRecord | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await auditLogApi.list({
        ...params,
        keyword: keyword || undefined,
        module: filterModule,
        action: filterAction,
        responseStatus: filterStatus,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载审计日志失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize, filterModule, filterAction, filterStatus]);

  const handleViewDetail = async (record: AuditLogRecord) => {
    try {
      const res = await auditLogApi.get(record.id);
      setDetailRecord(res.data.data);
      setDetailOpen(true);
    } catch { message.error('加载详情失败'); }
  };

  const columns: ColumnsType<AuditLogRecord> = [
    { title: '时间', dataIndex: 'createdAt', width: 170 },
    { title: '用户', dataIndex: 'username', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '模块', dataIndex: 'module', width: 100, render: (v: string) => <Tag>{moduleLabels[v] || v}</Tag> },
    { title: '操作', dataIndex: 'action', width: 80, render: (v: string) => <Tag color={actionColors[v]}>{actionLabels[v] || v}</Tag> },
    { title: '描述', dataIndex: 'description', width: 200, ellipsis: true, render: (v: string) => v || '-' },
    { title: '方法', dataIndex: 'requestMethod', width: 70, render: (v: string) => v ? <Tag color={methodColors[v]}>{v}</Tag> : '-' },
    { title: '请求路径', dataIndex: 'requestUrl', width: 220, ellipsis: true, render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'responseStatus', width: 80,
      render: (v: string) => <Tag color={v === 'SUCCESS' ? 'success' : 'error'}>{v === 'SUCCESS' ? '成功' : '失败'}</Tag> },
    { title: '耗时', dataIndex: 'duration', width: 80, render: (v: number) => v != null ? `${v}ms` : '-' },
    { title: 'IP', dataIndex: 'clientIp', width: 130, render: (v: string) => v || '-' },
    {
      title: '操作', width: 70, fixed: 'right',
      render: (_: unknown, record: AuditLogRecord) => (
        <a onClick={() => handleViewDetail(record)}><EyeOutlined /> 详情</a>
      ),
    },
  ];

  const moduleOptions = Object.entries(moduleLabels).map(([k, v]) => ({ value: k, label: v }));
  const actionOptions = Object.entries(actionLabels).map(([k, v]) => ({ value: k, label: v }));

  return (
    <div>
      <PageHeader title="审计日志" description={`共 ${total} 条审计记录`} extra={<FileSearchOutlined style={{ fontSize: 20, color: '#8c8c8c' }} />} />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input.Search placeholder="搜索用户/描述/路径" allowClear enterButton="查询" style={{ width: 260 }}
            onSearch={(v: string) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
          <Select placeholder="模块" allowClear style={{ width: 130 }} options={moduleOptions}
            onChange={(v: string) => { setFilterModule(v); setParams({ ...params, pageNum: 1 }); }} />
          <Select placeholder="操作" allowClear style={{ width: 110 }} options={actionOptions}
            onChange={(v: string) => { setFilterAction(v); setParams({ ...params, pageNum: 1 }); }} />
          <Select placeholder="状态" allowClear style={{ width: 100 }}
            options={[{ value: 'SUCCESS', label: '成功' }, { value: 'FAILED', label: '失败' }]}
            onChange={(v: string) => { setFilterStatus(v); setParams({ ...params, pageNum: 1 }); }} />
        </Space>
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} scroll={{ x: 1500 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title="审计日志详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={700}>
        {detailRecord && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="ID">{detailRecord.id}</Descriptions.Item>
            <Descriptions.Item label="时间">{detailRecord.createdAt}</Descriptions.Item>
            <Descriptions.Item label="用户">{detailRecord.username || '-'}</Descriptions.Item>
            <Descriptions.Item label="用户ID">{detailRecord.userId || '-'}</Descriptions.Item>
            <Descriptions.Item label="模块">{moduleLabels[detailRecord.module] || detailRecord.module}</Descriptions.Item>
            <Descriptions.Item label="操作">{actionLabels[detailRecord.action] || detailRecord.action}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{detailRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="请求方法">{detailRecord.requestMethod || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={detailRecord.responseStatus === 'SUCCESS' ? 'success' : 'error'}>
                {detailRecord.responseStatus === 'SUCCESS' ? '成功' : '失败'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="请求路径" span={2}>{detailRecord.requestUrl || '-'}</Descriptions.Item>
            <Descriptions.Item label="操作对象类型">{detailRecord.targetType || '-'}</Descriptions.Item>
            <Descriptions.Item label="操作对象ID">{detailRecord.targetId || '-'}</Descriptions.Item>
            <Descriptions.Item label="客户端IP">{detailRecord.clientIp || '-'}</Descriptions.Item>
            <Descriptions.Item label="耗时">{detailRecord.duration != null ? `${detailRecord.duration}ms` : '-'}</Descriptions.Item>
            {detailRecord.errorMessage && (
              <Descriptions.Item label="错误信息" span={2}>
                <span style={{ color: '#ff4d4f' }}>{detailRecord.errorMessage}</span>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default AuditLogPage;
