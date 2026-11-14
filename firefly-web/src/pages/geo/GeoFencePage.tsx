import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { AimOutlined, DeleteOutlined, EditOutlined, MinusCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { usePageActivation } from '../../hooks/usePageActivation';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';
import { geoApi } from '../../services/api';

interface FenceItem {
  id: number;
  name: string;
  description: string;
  fenceType: string;
  coordinates: string;
  centerLng: number | null;
  centerLat: number | null;
  radius: number | null;
  triggerType: string;
  enabled: boolean;
  createdAt: string;
}

interface VertexFormValue {
  lng?: number;
  lat?: number;
}

interface FenceFormValues {
  name?: string;
  description?: string;
  fenceType: 'CIRCLE' | 'POLYGON';
  centerLng?: number;
  centerLat?: number;
  radius?: number;
  triggerType?: string;
  vertices?: VertexFormValue[];
}

interface CheckFormValues {
  lng: number;
  lat: number;
}

interface CheckResult {
  fenceId?: number;
  inside?: boolean;
  lng?: number;
  lat?: number;
}

const fenceTypeLabels: Record<string, string> = { CIRCLE: '圆形', POLYGON: '多边形' };
const triggerLabels: Record<string, string> = { ENTER: '进入触发', LEAVE: '离开触发', BOTH: '进出均触发' };

const parsePolygonVertices = (raw?: string): VertexFormValue[] => {
  if (!raw?.trim()) {
    return [];
  }
  return raw.split(';').map((pair) => {
    const [lngText, latText] = pair.split(',');
    const lng = Number(lngText);
    const lat = Number(latText);
    return {
      lng: Number.isFinite(lng) ? lng : undefined,
      lat: Number.isFinite(lat) ? lat : undefined,
    };
  });
};

const buildFencePayload = (values: FenceFormValues) => {
  const payload: Record<string, unknown> = {
    name: values.name?.trim(),
    description: values.description?.trim() || '',
    fenceType: values.fenceType,
    triggerType: values.triggerType,
  };
  if (values.fenceType === 'POLYGON') {
    payload.coordinates = (values.vertices || []).map((vertex) => `${vertex.lng},${vertex.lat}`).join(';');
  } else {
    payload.centerLng = values.centerLng;
    payload.centerLat = values.centerLat;
    payload.radius = values.radius;
  }
  return payload;
};

const GeoFencePage: React.FC = () => {
  const [data, setData] = useState<FenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20, keyword: '' });
  const [keywordInput, setKeywordInput] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<FenceItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [form] = Form.useForm<FenceFormValues>();

  const [checkOpen, setCheckOpen] = useState(false);
  const [checkFence, setCheckFence] = useState<FenceItem | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checkLoading, setCheckLoading] = useState(false);
  const [checkForm] = Form.useForm<CheckFormValues>();

  const fenceTypeVal = Form.useWatch('fenceType', form);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await geoApi.listFences({ ...params, keyword: params.keyword || undefined });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      const errorMessage = getErrorMessage(error, '加载地理围栏失败');
      setLoadError(errorMessage);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleActivate = useCallback(() => {
    void fetchData();
  }, [fetchData]);
  usePageActivation(handleActivate);

  const applyKeyword = (value: string) => {
    setParams((prev) => ({ ...prev, pageNum: 1, keyword: value.trim() }));
  };

  const clearKeyword = () => {
    setKeywordInput('');
    setParams((prev) => ({ ...prev, pageNum: 1, keyword: '' }));
  };

  const handleEdit = (record: FenceItem | null) => {
    setEditRecord(record);
    form.resetFields();
    if (record) {
      const vertices = record.fenceType === 'POLYGON' ? parsePolygonVertices(record.coordinates) : [];
      while (vertices.length < 3) {
        vertices.push({});
      }
      form.setFieldsValue({
        name: record.name,
        description: record.description,
        fenceType: record.fenceType === 'POLYGON' ? 'POLYGON' : 'CIRCLE',
        centerLng: record.centerLng ?? undefined,
        centerLat: record.centerLat ?? undefined,
        radius: record.radius ?? undefined,
        triggerType: record.triggerType,
        vertices,
      });
    } else {
      form.setFieldsValue({ fenceType: 'CIRCLE', triggerType: 'BOTH', vertices: [] });
    }
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditRecord(null);
    form.resetFields();
  };

  const handleFormValuesChange = (changedValues: Partial<FenceFormValues>) => {
    if (changedValues.fenceType !== 'POLYGON') {
      return;
    }
    const vertices = form.getFieldValue('vertices') as VertexFormValue[] | undefined;
    if (!Array.isArray(vertices) || vertices.length < 3) {
      form.setFieldValue('vertices', Array.from({ length: 3 }, () => ({})));
    }
  };

  const handleSave = async (values: FenceFormValues) => {
    setSaving(true);
    try {
      const payload = buildFencePayload(values);
      if (editRecord) {
        await geoApi.updateFence(editRecord.id, payload);
        message.success('围栏更新成功');
      } else {
        await geoApi.createFence(payload);
        message.success('围栏创建成功');
      }
      closeEdit();
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, editRecord ? '更新围栏失败' : '创建围栏失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: FenceItem) => {
    try {
      await geoApi.deleteFence(record.id);
      message.success('围栏已删除');
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除围栏失败'));
    }
  };

  const handleToggle = async (record: FenceItem, enabled: boolean) => {
    const previousEnabled = record.enabled;
    setTogglingId(record.id);
    // Optimistic update keeps the switch responsive; failures roll the row back to the server value.
    setData((previous) => previous.map((item) => (item.id === record.id ? { ...item, enabled } : item)));
    try {
      await geoApi.toggleFence(record.id, enabled);
      message.success(enabled ? '围栏已启用' : '围栏已停用');
    } catch (error) {
      setData((previous) => previous.map((item) => (item.id === record.id ? { ...item, enabled: previousEnabled } : item)));
      message.error(getErrorMessage(error, enabled ? '启用围栏失败' : '停用围栏失败'));
    } finally {
      setTogglingId((current) => (current === record.id ? null : current));
    }
  };

  const openCheck = (record: FenceItem) => {
    setCheckFence(record);
    setCheckResult(null);
    checkForm.resetFields();
    setCheckOpen(true);
  };

  const handleCheck = async (values: CheckFormValues) => {
    if (!checkFence) {
      return;
    }
    setCheckLoading(true);
    try {
      const res = await geoApi.checkPosition(checkFence.id, values.lng, values.lat);
      setCheckResult((res.data.data || {}) as CheckResult);
    } catch (error) {
      message.error(getErrorMessage(error, '围栏检测失败'));
    } finally {
      setCheckLoading(false);
    }
  };

  const columns: ColumnsType<FenceItem> = [
    { title: '围栏名称', dataIndex: 'name', width: 160, ellipsis: true },
    { title: '类型', dataIndex: 'fenceType', width: 90, render: (value: string) => <Tag color="blue">{fenceTypeLabels[value] || value}</Tag> },
    { title: '触发', dataIndex: 'triggerType', width: 110, render: (value: string) => triggerLabels[value] || value },
    {
      title: '中心/半径',
      width: 220,
      render: (_: unknown, record: FenceItem) => (
        record.fenceType === 'CIRCLE' && record.centerLng != null && record.centerLat != null
          ? `(${record.centerLng.toFixed(4)}, ${record.centerLat.toFixed(4)}) 半径 ${record.radius ?? '-'} 米`
          : record.coordinates
            ? `${parsePolygonVertices(record.coordinates).length} 个顶点`
            : '-'
      ),
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      width: 90,
      render: (value: boolean, record: FenceItem) => (
        <Switch
          size="small"
          checked={value}
          loading={togglingId === record.id}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) => void handleToggle(record, checked)}
        />
      ),
    },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value?: string) => formatDateTime(value) },
    {
      title: '操作',
      width: 240,
      fixed: 'right',
      render: (_: unknown, record: FenceItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Button type="link" size="small" icon={<AimOutlined />} onClick={() => openCheck(record)}>检测</Button>
          <Popconfirm
            title={`删除围栏“${record.name}”？`}
            description="删除后该围栏不再参与位置判定，设备进出将不再触发该围栏事件，且无法恢复。"
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => handleDelete(record)}
          >
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
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新建围栏</Button>
          </Space>
        }
      />

      <Card className="ff-query-card" styles={{ body: { padding: '12px 16px' } }}>
        <div className="ff-query-bar">
          <Input.Search
            className="ff-query-field ff-query-field--grow"
            placeholder="搜索围栏名称"
            allowClear
            enterButton="查询"
            value={keywordInput}
            onChange={(event) => {
              setKeywordInput(event.target.value);
              if (!event.target.value) {
                applyKeyword('');
              }
            }}
            onSearch={(value) => applyKeyword(value)}
          />
        </div>
      </Card>

      <Alert
        style={{ marginBottom: 16, display: loadError ? 'flex' : 'none' }}
        type="error"
        showIcon
        message={loadError}
        action={<Button size="small" onClick={() => void fetchData()}>重试</Button>}
      />

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          locale={{ emptyText: <ListEmpty hasFilters={Boolean(params.keyword)} emptyText="暂无围栏，点击右上角“新建围栏”开始创建" onClearFilters={clearKeyword} /> }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count: number) => `共 ${count} 条`,
            onChange: (page: number, size: number) => setParams((prev) => ({ ...prev, pageNum: page, pageSize: size })),
          }}
        />
      </Card>

      <Drawer
        title={editRecord ? `编辑围栏 · ${editRecord.name}` : '新建围栏'}
        open={editOpen}
        onClose={closeEdit}
        width={720}
        destroyOnClose
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeEdit} disabled={saving}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => form.submit()}>保存围栏</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave} onValuesChange={handleFormValuesChange}>
          <Form.Item name="name" label="围栏名称" rules={[{ required: true, message: '请输入围栏名称' }]}>
            <Input maxLength={64} placeholder="例如：仓库A区" />
          </Form.Item>
          <Form.Item
            name="fenceType"
            label="围栏类型"
            rules={[{ required: true, message: '请选择围栏类型' }]}
            extra={editRecord ? '编辑时不能切换围栏类型；如需更换类型，请新建一个围栏。' : undefined}
          >
            <Select
              disabled={Boolean(editRecord)}
              options={[{ value: 'CIRCLE', label: '圆形围栏' }, { value: 'POLYGON', label: '多边形围栏' }]}
            />
          </Form.Item>
          {fenceTypeVal === 'CIRCLE' ? (
            <Space wrap align="start">
              <Form.Item
                name="centerLng"
                label="中心经度"
                rules={[
                  { required: true, message: '请输入中心经度' },
                  { type: 'number', min: -180, max: 180, message: '经度范围为 -180 ~ 180' },
                ]}
              >
                <InputNumber style={{ width: 180 }} step={0.0001} placeholder="116.397128" />
              </Form.Item>
              <Form.Item
                name="centerLat"
                label="中心纬度"
                rules={[
                  { required: true, message: '请输入中心纬度' },
                  { type: 'number', min: -90, max: 90, message: '纬度范围为 -90 ~ 90' },
                ]}
              >
                <InputNumber style={{ width: 180 }} step={0.0001} placeholder="39.916527" />
              </Form.Item>
              <Form.Item name="radius" label="半径(米)" rules={[{ required: true, message: '请输入半径' }, { type: 'number', min: 1, message: '半径需大于 0 米' }]}>
                <InputNumber style={{ width: 160 }} min={1} step={10} placeholder="500" />
              </Form.Item>
            </Space>
          ) : null}
          {fenceTypeVal === 'POLYGON' ? (
            <Form.List
              name="vertices"
              rules={[
                {
                  validator: async (_rule: unknown, value: VertexFormValue[] | undefined) => {
                    if (!value || value.length < 3) {
                      throw new Error('多边形至少需要 3 个顶点');
                    }
                  },
                },
              ]}
            >
              {(fields, { add, remove }, { errors }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap align="start">
                    {fields.map((field, index) => (
                      <Card key={field.key} size="small" title={`顶点 ${index + 1}`} style={{ width: '100%' }} extra={<Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>删除</Button>}>
                        <Space wrap align="start">
                          <Form.Item
                            name={[field.name, 'lng']}
                            label="经度"
                            rules={[
                              { required: true, message: '请输入经度' },
                              { type: 'number', min: -180, max: 180, message: '经度范围为 -180 ~ 180' },
                            ]}
                          >
                            <InputNumber style={{ width: 220 }} step={0.0001} placeholder="116.397128" />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'lat']}
                            label="纬度"
                            rules={[
                              { required: true, message: '请输入纬度' },
                              { type: 'number', min: -90, max: 90, message: '纬度范围为 -90 ~ 90' },
                            ]}
                          >
                            <InputNumber style={{ width: 220 }} step={0.0001} placeholder="39.916527" />
                          </Form.Item>
                        </Space>
                      </Card>
                    ))}
                  </Space>
                  <Form.ErrorList errors={errors} />
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({})}>新增顶点</Button>
                </Space>
              )}
            </Form.List>
          ) : null}
          <Form.Item name="triggerType" label="触发类型" rules={[{ required: true, message: '请选择触发类型' }]}>
            <Select options={[{ value: 'ENTER', label: '进入触发' }, { value: 'LEAVE', label: '离开触发' }, { value: 'BOTH', label: '进出均触发' }]} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} maxLength={256} placeholder="选填，补充围栏覆盖范围" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={checkFence ? `围栏检测 · ${checkFence.name}` : '围栏检测'}
        open={checkOpen}
        onCancel={() => setCheckOpen(false)}
        footer={null}
        width={440}
        destroyOnClose
      >
        <Form form={checkForm} layout="inline" onFinish={handleCheck} style={{ marginBottom: 16 }}>
          <Form.Item name="lng" rules={[{ required: true, message: '请输入经度' }, { type: 'number', min: -180, max: 180, message: '经度范围为 -180 ~ 180' }]}>
            <InputNumber placeholder="经度" step={0.0001} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item name="lat" rules={[{ required: true, message: '请输入纬度' }, { type: 'number', min: -90, max: 90, message: '纬度范围为 -90 ~ 90' }]}>
            <InputNumber placeholder="纬度" step={0.0001} style={{ width: 150 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<AimOutlined />} loading={checkLoading}>检测</Button>
          </Form.Item>
        </Form>
        {checkResult ? (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="围栏">{checkFence?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label="经度">{checkResult.lng ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="纬度">{checkResult.lat ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="结果">
              {checkResult.inside ? <Tag color="success">在围栏内</Tag> : <Tag color="error">在围栏外</Tag>}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <ListEmpty compact emptyText="输入经纬度后点击“检测”查看判定结果" />
        )}
      </Modal>
    </div>
  );
};

export default GeoFencePage;
