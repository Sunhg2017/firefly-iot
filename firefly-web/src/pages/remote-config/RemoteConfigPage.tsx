import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, RocketOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { deviceApi, deviceGroupApi, productApi, remoteConfigApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

const { TextArea } = Input;

type TargetType = 'PRODUCT' | 'GROUP' | 'DEVICE';
type ConfigStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED';

interface RemoteConfigRecord {
  id: number;
  projectId?: number;
  name: string;
  description?: string;
  targetType: TargetType;
  targetId?: number;
  configJson: string;
  version: number;
  status: ConfigStatus;
  createdAt: string;
  updatedAt: string;
}

interface RemoteConfigFormValues {
  name: string;
  description?: string;
  targetType: TargetType;
  targetId?: number;
  configJson: string;
}

interface TargetOption {
  value: number;
  label: string;
}

interface VersionRecord {
  version: number;
  configJson: string;
  createdBy?: number;
  createdAt: string;
}

interface AssignmentRecord {
  id: number;
  configVersion: number;
  deviceId: number;
  deviceName?: string;
  status: string;
  errorMessage?: string;
  updatedAt: string;
}

const statusMeta: Record<ConfigStatus, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PUBLISHED: { label: '已发布', color: 'success' },
  DISABLED: { label: '已停用', color: 'default' },
};

const targetTypeMeta: Record<TargetType, { label: string; color: string }> = {
  PRODUCT: { label: '产品', color: 'blue' },
  GROUP: { label: '分组', color: 'purple' },
  DEVICE: { label: '设备', color: 'cyan' },
};

const targetTypeOptions = (Object.keys(targetTypeMeta) as TargetType[]).map((value) => ({
  value,
  label: targetTypeMeta[value].label,
}));

const defaultConfigTemplate = JSON.stringify(
  {
    sampleInterval: 30,
    reportEnabled: true,
  },
  null,
  2,
);

const assignmentStatusMeta: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待投递', color: 'default' },
  DELIVERED: { label: '已投递', color: 'processing' },
  ACKED: { label: '已确认', color: 'success' },
  FAILED: { label: '失败', color: 'error' },
};

const RemoteConfigPage: React.FC = () => {
  const [data, setData] = useState<RemoteConfigRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [filters, setFilters] = useState<{ keyword: string; status?: ConfigStatus; targetType?: TargetType }>({ keyword: '' });
  const [draftFilters, setDraftFilters] = useState<{ keyword: string; status?: ConfigStatus; targetType?: TargetType }>({ keyword: '' });
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<RemoteConfigFormValues>();
  const watchedTargetType = Form.useWatch('targetType', form);

  const [productOptions, setProductOptions] = useState<TargetOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<TargetOption[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<TargetOption[]>([]);
  const [deviceSearching, setDeviceSearching] = useState(false);

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [assignmentsOpen, setAssignmentsOpen] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [activeConfig, setActiveConfig] = useState<RemoteConfigRecord | null>(null);

  const targetLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    productOptions.forEach((item) => map.set(`PRODUCT:${item.value}`, item.label));
    groupOptions.forEach((item) => map.set(`GROUP:${item.value}`, item.label));
    deviceOptions.forEach((item) => map.set(`DEVICE:${item.value}`, item.label));
    return map;
  }, [deviceOptions, groupOptions, productOptions]);

  const loadOptions = async () => {
    try {
      const productRes = await productApi.list({ pageNum: 1, pageSize: 500 });
      const products = (productRes.data.data?.records || []) as Array<{ id: number; productKey: string; name: string }>;
      setProductOptions(products.map((item) => ({ value: item.id, label: `${item.name} (${item.productKey})` })));
    } catch {
      setProductOptions([]);
    }
    try {
      const groupRes = await deviceGroupApi.listAll();
      const groups = (groupRes.data.data || []) as Array<{ id: number; name: string }>;
      setGroupOptions(groups.map((item) => ({ value: item.id, label: item.name })));
    } catch {
      setGroupOptions([]);
    }
  };

  const searchDevices = async (keyword?: string) => {
    setDeviceSearching(true);
    try {
      const res = await deviceApi.list({ pageNum: 1, pageSize: 50, keyword: keyword || undefined });
      const records = (res.data.data?.records || []) as Array<{ id: number; deviceName: string; nickname?: string }>;
      setDeviceOptions(records.map((item) => ({
        value: item.id,
        label: item.nickname ? `${item.nickname} (${item.deviceName})` : item.deviceName,
      })));
    } catch {
      setDeviceOptions([]);
    } finally {
      setDeviceSearching(false);
    }
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await remoteConfigApi.list({
        pageNum: params.pageNum,
        pageSize: params.pageSize,
        keyword: filters.keyword || undefined,
        status: filters.status,
        targetType: filters.targetType,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error('加载远程配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOptions();
    void searchDevices();
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [filters, params.pageNum, params.pageSize]);

  const applyFilters = () => {
    setFilters({ ...draftFilters, keyword: draftFilters.keyword.trim() });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const resetFilters = () => {
    setDraftFilters({ keyword: '' });
    setFilters({ keyword: '' });
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const openCreate = () => {
    setDrawerMode('create');
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ targetType: 'PRODUCT', configJson: defaultConfigTemplate });
  };

  const closeDrawer = () => {
    setDrawerMode(null);
    setEditingId(null);
    form.resetFields();
  };

  const openEdit = async (record: RemoteConfigRecord) => {
    setDrawerMode('edit');
    setEditingId(record.id);
    try {
      const res = await remoteConfigApi.get(record.id);
      const detail = res.data.data as RemoteConfigRecord;
      form.setFieldsValue({
        name: detail.name,
        description: detail.description,
        targetType: detail.targetType,
        targetId: detail.targetId,
        configJson: formatJson(detail.configJson),
      });
    } catch {
      message.error('加载配置详情失败');
      closeDrawer();
    }
  };

  const formatJson = (raw?: string) => {
    if (!raw) {
      return defaultConfigTemplate;
    }
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  const targetOptions = watchedTargetType === 'GROUP'
    ? groupOptions
    : watchedTargetType === 'DEVICE'
      ? deviceOptions
      : productOptions;

  const handleSubmit = async (values: RemoteConfigFormValues) => {
    let configJson: string;
    try {
      configJson = JSON.stringify(JSON.parse(values.configJson));
    } catch {
      message.error('配置内容不是合法 JSON');
      return;
    }
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      targetType: values.targetType,
      targetId: values.targetId,
      configJson,
    };
    setSubmitting(true);
    try {
      if (drawerMode === 'edit' && editingId) {
        await remoteConfigApi.update(editingId, payload);
        message.success('配置已更新');
      } else {
        await remoteConfigApi.create(payload);
        message.success('配置已创建');
      }
      closeDrawer();
      void loadConfigs();
    } catch {
      message.error(drawerMode === 'edit' ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (record: RemoteConfigRecord) => {
    try {
      await remoteConfigApi.publish(record.id);
      message.success('配置已发布');
      void loadConfigs();
    } catch {
      message.error('发布失败');
    }
  };

  const handleDisable = async (record: RemoteConfigRecord) => {
    try {
      await remoteConfigApi.disable(record.id);
      message.success('配置已停用');
      void loadConfigs();
    } catch {
      message.error('停用失败');
    }
  };

  const handleDelete = (record: RemoteConfigRecord) => {
    Modal.confirm({
      title: '确认删除配置',
      content: `删除后不可恢复，确认删除“${record.name}”？`,
      onOk: async () => {
        try {
          await remoteConfigApi.delete(record.id);
          message.success('配置已删除');
          void loadConfigs();
        } catch {
          message.error('删除失败');
        }
      },
    });
  };

  const handleDeploy = (record: RemoteConfigRecord) => {
    Modal.confirm({
      title: '确认下发配置',
      content: `将配置 v${record.version} 下发到目标设备，写入影子期望值并投递下行消息。`,
      onOk: async () => {
        try {
          const res = await remoteConfigApi.deploy(record.id);
          const result = res.data.data as { requested: number; success: number; failed: number };
          message.success(`下发完成：共 ${result.requested} 台，成功 ${result.success}，失败 ${result.failed}`);
          void loadConfigs();
        } catch {
          message.error('下发失败');
        }
      },
    });
  };

  const openVersions = async (record: RemoteConfigRecord) => {
    setActiveConfig(record);
    setVersionsOpen(true);
    try {
      const res = await remoteConfigApi.versions(record.id);
      setVersions((res.data.data || []) as VersionRecord[]);
    } catch {
      setVersions([]);
      message.error('加载版本失败');
    }
  };

  const handleRollback = async (record: RemoteConfigRecord, version: number) => {
    Modal.confirm({
      title: '确认回滚',
      content: `将以 v${version} 的内容发布为新版本并保留版本历史，是否继续？`,
      onOk: async () => {
        try {
          await remoteConfigApi.rollback(record.id, version);
          message.success('已回滚并发布新版本');
          void loadConfigs();
          void openVersions(record);
        } catch {
          message.error('回滚失败');
        }
      },
    });
  };

  const openAssignments = async (record: RemoteConfigRecord) => {
    setActiveConfig(record);
    setAssignmentsOpen(true);
    try {
      const res = await remoteConfigApi.assignments(record.id);
      setAssignments((res.data.data || []) as AssignmentRecord[]);
    } catch {
      setAssignments([]);
      message.error('加载下发记录失败');
    }
  };

  const columns: ColumnsType<RemoteConfigRecord> = [
    { title: '配置名称', dataIndex: 'name' },
    {
      title: '目标',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Tag color={targetTypeMeta[record.targetType]?.color}>{targetTypeMeta[record.targetType]?.label}</Tag>
          <Typography.Text>{targetLabelMap.get(`${record.targetType}:${record.targetId}`) || '-'}</Typography.Text>
        </Space>
      ),
    },
    { title: '版本', dataIndex: 'version', width: 80, render: (value: number) => `v${value ?? 0}` },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: ConfigStatus) => <Tag color={statusMeta[value].color}>{statusMeta[value].label}</Tag>,
    },
    { title: '更新时间', dataIndex: 'updatedAt', width: 170, render: (value: string) => formatDateTime(value) },
    {
      title: '操作',
      width: 320,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" wrap>
          <Button type="link" size="small" onClick={() => void openEdit(record)}>编辑</Button>
          <Button type="link" size="small" onClick={() => void handlePublish(record)}>发布</Button>
          <Button type="link" size="small" icon={<RocketOutlined />} disabled={record.status !== 'PUBLISHED'} onClick={() => handleDeploy(record)}>下发</Button>
          <Button type="link" size="small" onClick={() => void openVersions(record)}>版本</Button>
          <Button type="link" size="small" onClick={() => void openAssignments(record)}>下发记录</Button>
          <Button type="link" size="small" onClick={() => void handleDisable(record)}>停用</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="远程配置"
        description="配置模板、版本与按产品/分组/设备下发；下发写入影子期望值并投递属性设置下行。"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建配置</Button>}
      />

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="配置名称"
            allowClear
            value={draftFilters.keyword}
            onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={applyFilters}
            style={{ width: 220 }}
          />
          <Select
            placeholder="目标类型"
            allowClear
            value={draftFilters.targetType}
            options={targetTypeOptions}
            onChange={(value) => setDraftFilters((current) => ({ ...current, targetType: value }))}
            style={{ width: 130 }}
          />
          <Select
            placeholder="状态"
            allowClear
            value={draftFilters.status}
            options={[
              { value: 'DRAFT', label: '草稿' },
              { value: 'PUBLISHED', label: '已发布' },
              { value: 'DISABLED', label: '已停用' },
            ]}
            onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
            style={{ width: 120 }}
          />
          <Button type="primary" onClick={applyFilters}>查询</Button>
          <Button onClick={resetFilters}>重置</Button>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            current: params.pageNum,
            pageSize: params.pageSize,
            total,
            showSizeChanger: true,
            onChange: (pageNum, pageSize) => setParams({ pageNum, pageSize }),
          }}
        />
      </Card>

      <Drawer
        title={drawerMode === 'edit' ? '编辑远程配置' : '新建远程配置'}
        width={620}
        open={drawerMode !== null}
        onClose={closeDrawer}
        destroyOnClose
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={closeDrawer}>取消</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input maxLength={256} placeholder="例如：采集周期配置" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input maxLength={512} />
          </Form.Item>
          <Form.Item name="targetType" label="目标类型" rules={[{ required: true, message: '请选择目标类型' }]}>
            <Select options={targetTypeOptions} />
          </Form.Item>
          <Form.Item name="targetId" label="下发目标" rules={[{ required: true, message: '请选择下发目标' }]}>
            <Select
              showSearch
              allowClear
              optionFilterProp="label"
              options={targetOptions}
              loading={deviceSearching}
              onSearch={watchedTargetType === 'DEVICE' ? (keyword) => void searchDevices(keyword) : undefined}
              placeholder="选择产品/分组/设备"
            />
          </Form.Item>
          <Form.Item
            name="configJson"
            label="配置内容"
            rules={[{ required: true, message: '请输入配置内容' }]}
            extra="JSON 对象，下发时写入设备影子 desired 并作为 PROPERTY_SET 下行内容。"
          >
            <TextArea rows={12} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
        </Form>
      </Drawer>

      <Modal title="配置版本" open={versionsOpen} footer={null} width={720} onCancel={() => setVersionsOpen(false)}>
        <Table
          rowKey="version"
          dataSource={versions}
          pagination={false}
          size="small"
          columns={[
            { title: '版本', dataIndex: 'version', width: 80, render: (value: number) => `v${value}` },
            { title: '内容', render: (_, record: VersionRecord) => <Typography.Text code>{record.configJson}</Typography.Text> },
            { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (value: string) => formatDateTime(value) },
            {
              title: '操作',
              width: 100,
              render: (_, record: VersionRecord) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => activeConfig && void handleRollback(activeConfig, record.version)}
                >
                  回滚
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      <Modal title="下发记录" open={assignmentsOpen} footer={null} width={760} onCancel={() => setAssignmentsOpen(false)}>
        <Table
          rowKey="id"
          dataSource={assignments}
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '版本', dataIndex: 'configVersion', width: 80, render: (value: number) => `v${value}` },
            { title: '设备', dataIndex: 'deviceName', render: (value?: string) => value || '-' },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (value: string) => (
                <Tag color={assignmentStatusMeta[value]?.color}>{assignmentStatusMeta[value]?.label || value}</Tag>
              ),
            },
            { title: '错误', dataIndex: 'errorMessage', ellipsis: true },
            { title: '更新时间', dataIndex: 'updatedAt', width: 170, render: (value: string) => formatDateTime(value) },
          ]}
        />
      </Modal>
    </div>
  );
};

export default RemoteConfigPage;
