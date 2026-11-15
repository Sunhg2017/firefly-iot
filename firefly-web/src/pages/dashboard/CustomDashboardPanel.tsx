import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Col, Drawer, Empty, Form, Input, Modal, Popconfirm, Row, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ShareAltOutlined } from '@ant-design/icons';
import { customDashboardApi, dashboardApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';

const { Text, Title } = Typography;

type WidgetType = 'overview_metrics' | 'recent_alarms' | 'alarm_distribution' | 'device_product' | 'online_trend';

const WIDGET_OPTIONS: { value: WidgetType; label: string }[] = [
  { value: 'overview_metrics', label: '概览指标' },
  { value: 'recent_alarms', label: '最近告警' },
  { value: 'alarm_distribution', label: '告警分布' },
  { value: 'device_product', label: '设备产品分布' },
  { value: 'online_trend', label: '在线趋势' },
];

interface WidgetItem {
  type: WidgetType;
  title: string;
}

interface DashboardRecord {
  slug: string;
  name: string;
  description?: string;
  layout?: string;
  shareEnabled?: boolean;
  shareToken?: string;
  updatedAt?: string;
}

const parseWidgets = (layout?: string): WidgetItem[] => {
  if (!layout) return [];
  try {
    const parsed = JSON.parse(layout);
    return Array.isArray(parsed) ? parsed.filter((w) => w && w.type) : [];
  } catch {
    return [];
  }
};

const CustomDashboardPanel: React.FC = () => {
  const [dashboards, setDashboards] = useState<DashboardRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [screen, setScreen] = useState<DashboardRecord | null>(null);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customDashboardApi.list();
      setDashboards((res.data.data ?? []) as DashboardRecord[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载自定义看板失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ widgets: ['overview_metrics'] });
    setEditorOpen(true);
  };

  const openEdit = (record: DashboardRecord) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      widgets: parseWidgets(record.layout).map((w) => w.type),
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    const widgets: WidgetType[] = values.widgets || [];
    const layout = widgets.map((type) => ({
      type,
      title: WIDGET_OPTIONS.find((o) => o.value === type)?.label || type,
    }));
    setSaving(true);
    try {
      if (editing) {
        await customDashboardApi.update(editing.slug, { name: values.name, description: values.description, layout: JSON.stringify(layout) });
        message.success('看板已更新');
      } else {
        await customDashboardApi.create({ name: values.name, description: values.description, layout: JSON.stringify(layout) });
        message.success('看板已创建');
      }
      setEditorOpen(false);
      await fetchList();
    } catch (error) {
      message.error(getErrorMessage(error, '保存看板失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: DashboardRecord) => {
    try {
      await customDashboardApi.delete(record.slug);
      message.success('看板已删除');
      await fetchList();
    } catch (error) {
      message.error(getErrorMessage(error, '删除看板失败'));
    }
  };

  const handleShare = async (record: DashboardRecord) => {
    try {
      const res = await customDashboardApi.setShare(record.slug, !record.shareEnabled);
      const updated = res.data.data as DashboardRecord;
      message.success(updated?.shareEnabled ? '分享已开启' : '分享已关闭');
      await fetchList();
    } catch (error) {
      message.error(getErrorMessage(error, '切换分享失败'));
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary">保存多套看板布局，支持大屏展示与租户内分享。</Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建看板
        </Button>
      </Space>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : dashboards.length === 0 ? (
        <Card style={{ borderRadius: 24 }}>
          <Empty description="暂无自定义看板，点击「新建看板」开始创建" />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {dashboards.map((record) => (
            <Col xs={24} sm={12} lg={8} key={record.slug}>
              <Card
                title={record.name}
                extra={<Tag color={record.shareEnabled ? 'green' : 'default'}>{record.shareEnabled ? '已分享' : '未分享'}</Tag>}
                style={{ borderRadius: 16 }}
                actions={[
                  <EyeOutlined key="screen" onClick={() => setScreen(record)} />,
                  <EditOutlined key="edit" onClick={() => openEdit(record)} />,
                  <ShareAltOutlined key="share" onClick={() => void handleShare(record)} />,
                  <Popconfirm key="delete" title="删除该看板？" onConfirm={() => void handleDelete(record)}>
                    <DeleteOutlined />
                  </Popconfirm>,
                ]}
              >
                <Text type="secondary" style={{ display: 'block', minHeight: 40 }}>
                  {record.description || '暂无说明'}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  组件 {parseWidgets(record.layout).length} 个
                </Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Drawer
        title={editing ? '编辑看板' : '新建看板'}
        width={420}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        extra={<Button type="primary" loading={saving} onClick={() => void handleSave()}>保存</Button>}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="看板名称" rules={[{ required: true, message: '请输入看板名称' }]}>
            <Input maxLength={128} placeholder="如：设备运营大屏" />
          </Form.Item>
          <Form.Item name="description" label="看板说明">
            <Input.TextArea maxLength={512} rows={3} placeholder="可选" />
          </Form.Item>
          <Form.Item name="widgets" label="展示组件" rules={[{ required: true, message: '请至少选择一个组件' }]}>
            <Select mode="multiple" options={WIDGET_OPTIONS} placeholder="选择要展示的组件" />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        title={screen ? screen.name : ''}
        open={Boolean(screen)}
        footer={null}
        width="92vw"
        style={{ top: 12 }}
        bodyStyle={{ minHeight: '80vh', background: '#0b1220' }}
        onCancel={() => setScreen(null)}
      >
        {screen ? <BigScreen widgets={parseWidgets(screen.layout)} /> : null}
      </Modal>
    </div>
  );
};

const BigScreen: React.FC<{ widgets: WidgetItem[] }> = ({ widgets }) => {
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [alarms, setAlarms] = useState<Record<string, unknown>[]>([]);
  const [alarmDist, setAlarmDist] = useState<Record<string, unknown>[]>([]);
  const [productDist, setProductDist] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    void dashboardApi.overview().then((r) => setOverview((r.data.data ?? {}) as Record<string, number>)).catch(() => {});
    void dashboardApi.recentAlarms(8).then((r) => setAlarms((r.data.data ?? []) as Record<string, unknown>[])).catch(() => {});
    void dashboardApi.alarmDistribution().then((r) => setAlarmDist((r.data.data ?? []) as Record<string, unknown>[])).catch(() => {});
    void dashboardApi.deviceByProduct().then((r) => setProductDist((r.data.data ?? []) as Record<string, unknown>[])).catch(() => {});
  }, []);

  const metrics = [
    { label: '设备总数', value: overview?.deviceTotal, unit: '台' },
    { label: '在线设备', value: overview?.deviceOnline, unit: '台' },
    { label: '离线设备', value: overview?.deviceOffline, unit: '台' },
    { label: '待处理告警', value: overview?.alarmPending, unit: '条' },
  ];

  const renderWidget = (w: WidgetItem) => {
    switch (w.type) {
      case 'overview_metrics':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            {metrics.map((m) => (
              <div key={m.label} style={{ background: '#111c31', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ color: '#8ba3c7', fontSize: 13 }}>{m.label}</div>
                <div style={{ color: '#fff', fontSize: 30, fontWeight: 700, marginTop: 8 }}>
                  {m.value ?? '-'} <span style={{ fontSize: 13, fontWeight: 400, color: '#8ba3c7' }}>{m.unit}</span>
                </div>
              </div>
            ))}
          </div>
        );
      case 'recent_alarms':
        return (
          <Table
            size="small"
            rowKey={(r) => String(r.id ?? Math.random())}
            pagination={false}
            dataSource={alarms}
            columns={[
              { title: '时间', dataIndex: 'created_at', width: 170, render: (v: unknown) => String(v ?? '-') },
              { title: '级别', dataIndex: 'level', width: 90, render: (v: string) => <Tag>{v}</Tag> },
              { title: '标题', dataIndex: 'rule_name', ellipsis: true },
              { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag>{v}</Tag> },
            ]}
          />
        );
      case 'alarm_distribution':
        return <BarList title="告警分布" data={alarmDist.map((i) => ({ label: String(i.level ?? '-'), value: Number(i.count ?? 0) }))} />;
      case 'device_product':
        return <BarList title="设备产品分布" data={productDist.map((i) => ({ label: String(i.product_name ?? '-'), value: Number(i.device_count ?? 0) }))} />;
      default:
        return <div style={{ color: '#8ba3c7' }}>在线趋势组件需更多历史数据，此处暂略。</div>;
    }
  };

  return (
    <div>
      <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>运营大屏</Title>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {widgets.map((w) => (
          <div key={w.type} style={{ gridColumn: w.type === 'overview_metrics' || w.type === 'recent_alarms' ? '1 / -1' : undefined }}>
            <div style={{ color: '#cfe0ff', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{w.title}</div>
            {renderWidget(w)}
          </div>
        ))}
      </div>
    </div>
  );
};

const BarList: React.FC<{ title: string; data: { label: string; value: number }[] }> = ({ data }) => {
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <div style={{ background: '#111c31', borderRadius: 12, padding: 16 }}>
      {data.length === 0 ? (
        <div style={{ color: '#8ba3c7' }}>暂无数据</div>
      ) : (
        data.map((d) => (
          <div key={d.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cfe0ff', fontSize: 13 }}>
              <span>{d.label}</span>
              <span>{d.value}</span>
            </div>
            <div style={{ height: 8, background: '#1c2b4a', borderRadius: 999, marginTop: 4 }}>
              <div style={{ height: '100%', width: `${max ? (d.value / max) * 100 : 0}%`, background: '#3b82f6', borderRadius: 999 }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default CustomDashboardPanel;
