import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, Tag, Popconfirm, Switch, InputNumber, Descriptions, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, AimOutlined } from '@ant-design/icons';
import { geoApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';


interface FenceItem {
  id: number; name: string; description: string; fenceType: string; coordinates: string;
  centerLng: number; centerLat: number; radius: number; triggerType: string; enabled: boolean; createdAt: string;
}

const fenceTypeLabels: Record<string, string> = { CIRCLE: '圆形', POLYGON: '多边形' };
const triggerLabels: Record<string, string> = { ENTER: '进入触发', LEAVE: '离开触发', BOTH: '进出均触发' };

const GeoFencePage: React.FC = () => {
  const [data, setData] = useState<FenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FenceItem | null>(null);
  const [form] = Form.useForm();

  const [checkOpen, setCheckOpen] = useState(false);
  const [checkFenceId, setCheckFenceId] = useState<number>(0);
  const [checkResult, setCheckResult] = useState<Record<string, unknown> | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await geoApi.listFences({ ...params, keyword: keyword || undefined });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const handleEdit = (record: FenceItem | null) => {
    setEditRecord(record);
    if (record) { form.setFieldsValue(record); } else { form.resetFields(); form.setFieldsValue({ fenceType: 'CIRCLE', triggerType: 'BOTH', enabled: true }); }
    setEditOpen(true);
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      if (editRecord) { await geoApi.updateFence(editRecord.id, values); message.success('更新成功'); }
      else { await geoApi.createFence(values); message.success('创建成功'); }
      setEditOpen(false); fetchData();
    } catch { message.error('保存失败'); }
  };

  const handleDelete = async (id: number) => {
    await geoApi.deleteFence(id); message.success('已删除'); fetchData();
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    await geoApi.toggleFence(id, enabled); message.success(enabled ? '已启用' : '已禁用'); fetchData();
  };

  const handleCheck = async (lng: number, lat: number) => {
    try {
      const res = await geoApi.checkPosition(checkFenceId, lng, lat);
      setCheckResult(res.data.data);
    } catch { message.error('检测失败'); }
  };

  const fenceTypeVal = Form.useWatch('fenceType', form);

  const columns: ColumnsType<FenceItem> = [
    { title: '围栏名称', dataIndex: 'name', width: 160 },
    { title: '类型', dataIndex: 'fenceType', width: 90, render: (v: string) => <Tag color="blue">{fenceTypeLabels[v] || v}</Tag> },
    { title: '触发', dataIndex: 'triggerType', width: 110, render: (v: string) => triggerLabels[v] || v },
    {
      title: '中心/半径', width: 200,
      render: (_: unknown, r: FenceItem) => r.fenceType === 'CIRCLE'
        ? `(${r.centerLng?.toFixed(4)}, ${r.centerLat?.toFixed(4)}) R=${r.radius}m`
        : r.coordinates ? `${r.coordinates.split(';').length} 个顶点` : '-',
    },
    {
      title: '状态', dataIndex: 'enabled', width: 80,
      render: (v: boolean, r: FenceItem) => <Switch size="small" checked={v} onChange={(c) => handleToggle(r.id, c)} />,
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 220, fixed: 'right',
      render: (_: unknown, record: FenceItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" icon={<AimOutlined />} onClick={() => { setCheckFenceId(record.id); setCheckResult(null); setCheckOpen(true); }}>检测</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="地理围栏"
        description={`共 ${total} 个围栏`}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建围栏</Button>}
      />

      {/* Filters */}
      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Input.Search placeholder="搜索围栏名称" allowClear style={{ width: 220 }}
          onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />
      </Card>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1100 }}
          pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />
      </Card>

      <Modal title={editRecord ? '编辑围栏' : '新建围栏'} open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => form.submit()} destroyOnClose width={560}>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="围栏名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="fenceType" label="围栏类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'CIRCLE', label: '圆形围栏' }, { value: 'POLYGON', label: '多边形围栏' }]} />
          </Form.Item>
          {fenceTypeVal === 'CIRCLE' && (
            <>
              <Space>
                <Form.Item name="centerLng" label="中心经度" rules={[{ required: true }]}><InputNumber style={{ width: 160 }} step={0.0001} /></Form.Item>
                <Form.Item name="centerLat" label="中心纬度" rules={[{ required: true }]}><InputNumber style={{ width: 160 }} step={0.0001} /></Form.Item>
                <Form.Item name="radius" label="半径(米)" rules={[{ required: true }]}><InputNumber style={{ width: 130 }} min={1} /></Form.Item>
              </Space>
            </>
          )}
          {fenceTypeVal === 'POLYGON' && (
            <Form.Item name="coordinates" label="多边形坐标" rules={[{ required: true }]} tooltip="格式: lng1,lat1;lng2,lat2;lng3,lat3">
              <Input.TextArea rows={3} placeholder="116.3,39.9;116.4,39.9;116.4,40.0;116.3,40.0" />
            </Form.Item>
          )}
          <Form.Item name="triggerType" label="触发类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'ENTER', label: '进入触发' }, { value: 'LEAVE', label: '离开触发' }, { value: 'BOTH', label: '进出均触发' }]} />
          </Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="围栏检测" open={checkOpen} onCancel={() => setCheckOpen(false)} footer={null} width={400}>
        <Form layout="inline" onFinish={(v) => handleCheck(v.lng, v.lat)} style={{ marginBottom: 16 }}>
          <Form.Item name="lng" rules={[{ required: true }]}><InputNumber placeholder="经度" step={0.0001} style={{ width: 130 }} /></Form.Item>
          <Form.Item name="lat" rules={[{ required: true }]}><InputNumber placeholder="纬度" step={0.0001} style={{ width: 130 }} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" icon={<AimOutlined />}>检测</Button></Form.Item>
        </Form>
        {checkResult && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="围栏ID">{String(checkResult.fenceId)}</Descriptions.Item>
            <Descriptions.Item label="经度">{String(checkResult.lng)}</Descriptions.Item>
            <Descriptions.Item label="纬度">{String(checkResult.lat)}</Descriptions.Item>
            <Descriptions.Item label="结果">
              {checkResult.inside ? <Tag color="success">在围栏内</Tag> : <Tag color="error">在围栏外</Tag>}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default GeoFencePage;
