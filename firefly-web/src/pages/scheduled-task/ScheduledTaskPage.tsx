import React, { useEffect, useRef, useState } from 'react';
import {
  Table, Button, Space, message, Tag, Popconfirm, Card, Form, Input, Select,
  Switch, Drawer, Tooltip, Alert, Row, Col,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined,
  PlayCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, HistoryOutlined, ClearOutlined,
  PauseCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { scheduledTaskApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';

interface TaskItem {
  id: number;
  taskName: string;
  taskGroup: string;
  cronExpression: string;
  beanName: string;
  methodName: string;
  methodParams: string | null;
  status: number;
  description: string | null;
  misfirePolicy: number;
  lastExecTime: string | null;
  lastExecStatus: string | null;
  lastExecMessage: string | null;
  createdAt: string;
}

interface TaskFormValues {
  taskName: string;
  taskGroup?: string;
  cronExpression: string;
  beanName: string;
  methodName: string;
  methodParams?: string;
  status?: number;
  misfirePolicy?: number;
  description?: string;
}

interface LogItem {
  id: number;
  taskId: number;
  taskName: string;
  taskGroup: string;
  beanName: string;
  methodName: string;
  methodParams: string | null;
  status: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  errorMessage: string | null;
}

interface ScheduledTaskFilters {
  status?: number;
}

type RowAction = 'toggle' | 'execute' | 'delete';

/** 清理入口只有 30 天一档，确认文案和请求参数共用同一常量，避免口径漂移。 */
const LOG_RETENTION_DAYS = 30;

const cronPresets = [
  { label: '每分钟', value: '0 * * * * ?' },
  { label: '每 5 分钟', value: '0 */5 * * * ?' },
  { label: '每小时', value: '0 0 * * * ?' },
  { label: '每天 2 点', value: '0 0 2 * * ?' },
  { label: '每周一 9 点', value: '0 0 9 ? * MON' },
  { label: '每月 1 日 0 点', value: '0 0 0 1 * ?' },
];

const cronPresetOptions = cronPresets.map((preset) => ({ value: preset.value, label: `${preset.label}（${preset.value}）` }));

const ScheduledTaskPage: React.FC = () => {
  const [data, setData] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [draftFilters, setDraftFilters] = useState<ScheduledTaskFilters>({});
  const [filters, setFilters] = useState<ScheduledTaskFilters>({});

  // CRUD drawer
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<TaskFormValues>();
  const [saving, setSaving] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());
  const pendingRowsRef = useRef<Set<string>>(new Set());

  // Log drawer
  const [logOpen, setLogOpen] = useState(false);
  const [logTaskId, setLogTaskId] = useState<number | null>(null);
  const [logTaskName, setLogTaskName] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logTotal, setLogTotal] = useState(0);
  const [logParams, setLogParams] = useState({ pageNum: 1, pageSize: 15 });
  const [cleaningLogs, setCleaningLogs] = useState(false);

  const watchedCron = Form.useWatch('cronExpression', form);

  useDirtyGuard(modalOpen && formDirty);
  const confirmDiscard = useConfirmDiscard();

  const hasFilters = filters.status != null;

  // silent 用于轮询：不切换表格 loading，失败时也保留已经加载的数据，避免页面每 30 秒闪一次。
  const fetchData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const res = await scheduledTaskApi.list({ ...params, status: filters.status });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      if (!silent) {
        setData([]);
        setTotal(0);
      }
      setLoadError(getErrorMessage(error, '加载定时任务失败'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchData();
  }, [filters, params.pageNum, params.pageSize]);

  // 定时任务状态会随调度自行变化，提供可暂停的自动刷新；首屏由上方 effect 负责，避免重复请求。
  const { paused, togglePaused, lastUpdatedAt } = useAutoRefresh(() => fetchData(true), {
    intervalMs: 30000,
    immediate: false,
  });

  usePageActivation(() => {
    void fetchData();
  });

  const runRowAction = async (id: number, action: RowAction, task: () => Promise<void>) => {
    const key = `${id}:${action}`;
    if (pendingRowsRef.current.has(key)) {
      return;
    }
    pendingRowsRef.current.add(key);
    setPendingRows(new Set(pendingRowsRef.current));
    try {
      await task();
    } finally {
      pendingRowsRef.current.delete(key);
      setPendingRows(new Set(pendingRowsRef.current));
    }
  };

  const isRowPending = (id: number, action: RowAction) => pendingRows.has(`${id}:${action}`);

  const applyFilters = () => {
    setFilters({ status: draftFilters.status });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({});
    setFilters({});
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const fetchLogs = async (taskId: number) => {
    setLogLoading(true);
    setLogError(null);
    try {
      const res = await scheduledTaskApi.listLogs({ ...logParams, taskId });
      const page = res.data.data;
      setLogs(page.records || []);
      setLogTotal(page.total || 0);
    } catch (error) {
      setLogs([]);
      setLogTotal(0);
      setLogError(getErrorMessage(error, '加载执行日志失败'));
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    if (logOpen && logTaskId) {
      void fetchLogs(logTaskId);
    }
  }, [logOpen, logTaskId, logParams.pageNum]);

  // ==================== Handlers ====================

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setFormDirty(false);
    form.setFieldsValue({ taskGroup: 'DEFAULT', status: 1, misfirePolicy: 0 });
    setModalOpen(true);
  };

  const openEdit = async (record: TaskItem) => {
    if (detailLoadingId != null) {
      return;
    }
    setDetailLoadingId(record.id);
    try {
      // 先取详情成功再打开抽屉，避免抽屉短暂展示上一条任务的数据。
      const res = await scheduledTaskApi.get(record.id);
      const detail = (res.data.data || record) as TaskItem;
      form.resetFields();
      form.setFieldsValue({
        taskName: detail.taskName,
        taskGroup: detail.taskGroup,
        cronExpression: detail.cronExpression,
        beanName: detail.beanName,
        methodName: detail.methodName,
        methodParams: detail.methodParams ?? undefined,
        status: detail.status,
        misfirePolicy: detail.misfirePolicy,
        description: detail.description ?? undefined,
      });
      setFormDirty(false);
      setEditingId(detail.id ?? record.id);
      setModalOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, '加载定时任务详情失败'));
    } finally {
      setDetailLoadingId(null);
    }
  };

  const closeDrawer = () => {
    confirmDiscard(formDirty, () => {
      setModalOpen(false);
      setEditingId(null);
      setFormDirty(false);
      form.resetFields();
    });
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }
    let values: TaskFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await scheduledTaskApi.update(editingId, { ...values });
        message.success('任务已更新');
      } else {
        await scheduledTaskApi.create({ ...values });
        message.success('任务已创建');
      }
      setModalOpen(false);
      setEditingId(null);
      setFormDirty(false);
      form.resetFields();
      await fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, editingId ? '更新定时任务失败' : '创建定时任务失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    await runRowAction(id, 'delete', async () => {
      try {
        await scheduledTaskApi.delete(id);
        message.success('已删除');
        await fetchData();
      } catch (error) {
        message.error(getErrorMessage(error, '删除定时任务失败'));
      }
    });
  };

  const handleToggle = async (record: TaskItem, checked: boolean) => {
    await runRowAction(record.id, 'toggle', async () => {
      try {
        if (checked) {
          await scheduledTaskApi.enable(record.id);
          message.success('已启用');
        } else {
          await scheduledTaskApi.disable(record.id);
          message.success('已停用');
        }
        await fetchData();
      } catch (error) {
        message.error(getErrorMessage(error, checked ? '启用定时任务失败' : '停用定时任务失败'));
      }
    });
  };

  const handleExecute = async (id: number) => {
    await runRowAction(id, 'execute', async () => {
      try {
        await scheduledTaskApi.executeOnce(id);
        message.success('已触发执行');
        // executeOnce 是异步调度，列表里的执行结果以服务端返回为准，触发后立即重新拉取。
        await fetchData();
      } catch (error) {
        message.error(getErrorMessage(error, '触发执行失败'));
      }
    });
  };

  const openLog = (record: TaskItem) => {
    setLogTaskId(record.id);
    setLogTaskName(record.taskName);
    setLogParams({ pageNum: 1, pageSize: 15 });
    setLogError(null);
    setLogOpen(true);
  };

  const handleCleanLogs = async () => {
    if (cleaningLogs) {
      return;
    }
    setCleaningLogs(true);
    try {
      const res = await scheduledTaskApi.cleanLogs(LOG_RETENTION_DAYS);
      message.success(`已清理 ${res.data.data ?? 0} 条日志`);
      if (logTaskId) {
        await fetchLogs(logTaskId);
      }
    } catch (error) {
      message.error(getErrorMessage(error, '清理执行日志失败'));
    } finally {
      setCleaningLogs(false);
    }
  };

  // ==================== Columns ====================

  const columns: ColumnsType<TaskItem> = [
    { title: '任务名称', dataIndex: 'taskName', width: 180 },
    { title: '分组', dataIndex: 'taskGroup', width: 100,
      render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Cron 表达式', dataIndex: 'cronExpression', width: 150,
      render: (v: string) => <CopyText text={v} ellipsis /> },
    { title: 'Bean.Method', width: 200,
      render: (_: unknown, r: TaskItem) => (
        <Tooltip title={r.methodParams || '无参数'}>
          <code style={{ fontSize: 12 }}>{r.beanName}.{r.methodName}()</code>
        </Tooltip>
      ) },
    {
      title: '状态', dataIndex: 'status', width: 90, align: 'center',
      render: (v: number, record: TaskItem) => (
        <Switch
          size="small"
          checked={v === 1}
          loading={isRowPending(record.id, 'toggle')}
          onChange={(checked) => void handleToggle(record, checked)}
        />
      ),
    },
    {
      title: '上次执行', width: 190,
      render: (_: unknown, r: TaskItem) => r.lastExecTime ? (
        <Space size={4}>
          {r.lastExecStatus === 'SUCCESS'
            ? <CheckCircleOutlined style={{ color: '#10b981' }} />
            : (
              <Tooltip title={r.lastExecMessage || '执行失败'}>
                <CloseCircleOutlined style={{ color: '#ef4444' }} />
              </Tooltip>
            )}
          <span style={{ fontSize: 12, color: '#64748b' }}>{formatDateTime(r.lastExecTime)}</span>
        </Space>
      ) : <span style={{ color: '#bfbfbf' }}>-</span>,
    },
    { title: '描述', dataIndex: 'description', width: 180, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作', width: 250, fixed: 'right',
      render: (_: unknown, record: TaskItem) => (
        <Space size="small">
          <Popconfirm
            title="立即触发执行？"
            description="可能影响下游业务，确认立即执行一次？"
            okText="立即执行"
            cancelText="取消"
            onConfirm={() => handleExecute(record.id)}
          >
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              loading={isRowPending(record.id, 'execute')}
            >
              执行
            </Button>
          </Popconfirm>
          <Tooltip title="执行日志">
            <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => openLog(record)} />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              loading={detailLoadingId === record.id}
              onClick={() => void openEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除该定时任务？"
            description="删除后不可恢复，且不会再触发执行。"
            okText="删除"
            cancelText="取消"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={isRowPending(record.id, 'delete')}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const logColumns: ColumnsType<LogItem> = [
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => v === 'SUCCESS'
        ? <Tag color="success">成功</Tag>
        : <Tag color="error">失败</Tag>,
    },
    { title: '开始时间', dataIndex: 'startTime', width: 170, render: (v: string) => formatDateTime(v) },
    { title: '耗时', dataIndex: 'durationMs', width: 90,
      render: (v: number | null) => v != null ? `${v} ms` : '-' },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      render: (v: string) => (v ? <CopyText text={v} ellipsis /> : '-'),
    },
  ];

  // ==================== Stats ====================
  // total 是服务端全量条数，启停数量只能从当前页数据得出，统计口径分别标注。
  const enabledCount = data.filter((item) => item.status === 1).length;
  const disabledCount = data.filter((item) => item.status === 0).length;

  return (
    <div>
      <PageHeader
        title="定时任务管理"
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
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建任务</Button>
          </Space>
        }
      />

      {/* Stat cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { title: '任务总数', value: total, icon: <ThunderboltOutlined />, color: '#4f46e5', bg: 'rgba(79,70,229,0.08)' },
          { title: '本页运行中', value: enabledCount, icon: <CheckCircleOutlined />, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
          { title: '本页已停用', value: disabledCount, icon: <PauseCircleOutlined />, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
        ].map((stat) => (
          <Col xs={8} key={stat.title}>
            <Card bodyStyle={{ padding: '14px 16px' }} style={{ borderRadius: 10, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: stat.color }}>
                  {stat.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{stat.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{stat.value}</div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filter */}
      <Card className="ff-query-card">
        <div className="ff-query-bar">
          <Select
            className="ff-query-field"
            placeholder="任务状态"
            allowClear
            style={{ width: 130 }}
            value={draftFilters.status}
            onChange={(value) => setDraftFilters({ status: value })}
            options={[{ value: 1, label: '运行中' }, { value: 0, label: '已停用' }]}
          />
          <div className="ff-query-actions">
            <Button onClick={resetFilters}>重置</Button>
            <Button type="primary" onClick={applyFilters}>查询</Button>
          </div>
        </div>
      </Card>

      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载定时任务失败"
          description={loadError}
          action={<Button size="small" danger onClick={() => void fetchData()}>重试</Button>}
        />
      ) : null}

      {/* Table */}
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          size="small"
          scroll={{ x: 1400 }}
          locale={{ emptyText: <ListEmpty hasFilters={hasFilters} emptyText="暂无定时任务" onClearFilters={resetFilters} /> }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (value: number) => `共 ${value} 条`,
            onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }),
          }}
        />
      </Card>

      {/* CRUD Drawer */}
      <Drawer
        title={editingId ? '编辑定时任务' : '新建定时任务'}
        open={modalOpen}
        onClose={closeDrawer}
        width={760}
        destroyOnClose
        maskClosable={false}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              {editingId ? '保存修改' : '创建任务'}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} onValuesChange={() => setFormDirty(true)}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="任务名称" name="taskName" rules={[{ required: true, message: '请输入任务名称' }]}>
                <Input placeholder="例如：设备离线检测" maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="任务分组" name="taskGroup" rules={[{ required: true, message: '请输入任务分组' }]}>
                <Input placeholder="例如：DEFAULT" maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="常用表达式" extra="选择后自动填入下方 Cron 表达式，可按需修改。">
            <Select
              allowClear
              placeholder="选择常用 Cron 表达式"
              options={cronPresetOptions}
              value={cronPresetOptions.some((option) => option.value === watchedCron) ? watchedCron : undefined}
              onChange={(value?: string) => {
                if (value) {
                  form.setFieldsValue({ cronExpression: value });
                  setFormDirty(true);
                }
              }}
            />
          </Form.Item>
          <Form.Item
            label="Cron 表达式"
            name="cronExpression"
            rules={[{ required: true, message: '请输入 Cron 表达式' }]}
            extra={<span style={{ fontSize: 12, color: '#8c8c8c' }}>格式：秒 分 时 日 月 周。示例：0 0 2 * * ?（每天 02:00）、0 */5 * * * ?（每 5 分钟）。保存后按表达式执行。</span>}
          >
            <Input placeholder="0 0 2 * * ?" style={{ fontFamily: 'monospace' }} maxLength={100} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Bean 名称" name="beanName" rules={[{ required: true, message: '请输入 Bean 名称' }]}>
                <Input placeholder="例如：deviceOfflineCheckTask" style={{ fontFamily: 'monospace' }} maxLength={200} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="方法名" name="methodName" rules={[{ required: true, message: '请输入方法名' }]}>
                <Input placeholder="例如：execute" style={{ fontFamily: 'monospace' }} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="方法参数（JSON）" name="methodParams">
            <Input.TextArea rows={2} placeholder='可选，JSON 格式，例如：{"key":"value"}' style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="状态" name="status">
                <Select options={[{ value: 1, label: '运行中' }, { value: 0, label: '已停用' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="错过执行策略" name="misfirePolicy">
                <Select options={[{ value: 0, label: '忽略错过的执行' }, { value: 1, label: '立即补偿执行' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="说明任务用途，便于后续识别" maxLength={500} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Log Drawer */}
      <Drawer
        title={<Space><HistoryOutlined /> {logTaskName} - 执行日志</Space>}
        open={logOpen}
        onClose={() => setLogOpen(false)}
        width={720}
        extra={
          <Popconfirm
            title={`清理 ${LOG_RETENTION_DAYS} 天前的执行日志？`}
            description={`将清理全平台 ${LOG_RETENTION_DAYS} 天前的执行日志，清理后不可恢复。`}
            okText="清理"
            cancelText="取消"
            onConfirm={() => handleCleanLogs()}
          >
            <Button size="small" icon={<ClearOutlined />} danger loading={cleaningLogs}>清理</Button>
          </Popconfirm>
        }
      >
        {logError ? (
          <Alert
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
            message="加载执行日志失败"
            description={logError}
            action={logTaskId ? <Button size="small" danger onClick={() => void fetchLogs(logTaskId)}>重试</Button> : null}
          />
        ) : null}
        <Table
          rowKey="id"
          columns={logColumns}
          dataSource={logs}
          loading={logLoading}
          size="small"
          locale={{ emptyText: <ListEmpty emptyText="暂无执行日志" /> }}
          pagination={{
            current: logParams.pageNum,
            pageSize: logParams.pageSize,
            total: logTotal,
            showSizeChanger: false,
            showTotal: (value: number) => `共 ${value} 条`,
            onChange: (page: number) => setLogParams({ ...logParams, pageNum: page }),
          }}
        />
      </Drawer>
    </div>
  );
};

export default ScheduledTaskPage;
