import React, { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { deviceApi } from '../../services/api';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { useConfirmDiscard } from '../../hooks/useDirtyGuard';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';

interface DeviceLocatorModalProps {
  deviceId: number | null;
  deviceName?: string;
  open: boolean;
  onClose: () => void;
}

interface DeviceLocatorRecord {
  id: number;
  deviceId: number;
  productId: number;
  locatorType: string;
  locatorValue: string;
  primaryLocator?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface LocatorFormValues {
  locatorType: string;
  locatorValue: string;
  primaryLocator: boolean;
}

const LOCATOR_TYPE_LABELS: Record<string, string> = {
  IMEI: 'IMEI（国际移动设备识别码）',
  ICCID: 'ICCID（SIM 卡标识）',
  MAC: 'MAC（网络物理地址）',
  SERIAL: 'SERIAL（设备序列号）',
};
const LOCATOR_TYPE_OPTIONS = Object.entries(LOCATOR_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const DEFAULT_VALUES: LocatorFormValues = {
  locatorType: 'IMEI',
  locatorValue: '',
  primaryLocator: false,
};

const DeviceLocatorModal: React.FC<DeviceLocatorModalProps> = ({ deviceId, deviceName, open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [records, setRecords] = useState<DeviceLocatorRecord[]>([]);
  const [editingRecord, setEditingRecord] = useState<DeviceLocatorRecord | null>(null);
  const [form] = Form.useForm<LocatorFormValues>();
  const confirmDiscard = useConfirmDiscard();

  const fetchData = async () => {
    if (!deviceId) {
      return;
    }
    setLoading(true);
    try {
      const response = await deviceApi.listLocators(deviceId);
      setRecords((response.data.data || []) as DeviceLocatorRecord[]);
    } catch (error) {
      message.error(getErrorMessage(error, '加载设备标识失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !deviceId) {
      return;
    }
    // 切换到另一台设备时先清空旧标识，避免加载期间误读上一台设备的数据。
    setRecords([]);
    form.resetFields();
    setEditingRecord(null);
    void fetchData();
  }, [deviceId, form, open]);

  const resetEditor = () => {
    setEditingRecord(null);
    form.resetFields();
  };

  const handleClose = () => {
    confirmDiscard(
      form.isFieldsTouched(),
      () => {
        resetEditor();
        onClose();
      },
      { title: '放弃未保存的设备标识？', content: '关闭后本次填写或编辑的标识内容将丢失。' },
    );
  };

  const handleSubmit = async (values: LocatorFormValues) => {
    if (!deviceId || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        locatorType: values.locatorType.trim().toUpperCase(),
        locatorValue: values.locatorValue.trim(),
        primaryLocator: values.primaryLocator,
      };
      if (editingRecord) {
        await deviceApi.updateLocator(deviceId, editingRecord.id, payload);
        message.success('设备标识已更新');
      } else {
        await deviceApi.createLocator(deviceId, payload);
        message.success('设备标识已新增');
      }
      resetEditor();
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '保存设备标识失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (locatorId: number) => {
    if (!deviceId || deletingId !== null) {
      return;
    }
    setDeletingId(locatorId);
    try {
      await deviceApi.deleteLocator(deviceId, locatorId);
      message.success('设备标识已删除');
      if (editingRecord?.id === locatorId) {
        resetEditor();
      }
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除设备标识失败'));
    } finally {
      setDeletingId(null);
    }
  };

  const columns: ColumnsType<DeviceLocatorRecord> = [
    {
      title: '类型',
      dataIndex: 'locatorType',
      width: 190,
      render: (value: string) => {
        const label = LOCATOR_TYPE_LABELS[value?.toUpperCase()] || value;
        return <Tag color="blue">{label}</Tag>;
      },
    },
    {
      title: '标识值',
      dataIndex: 'locatorValue',
      render: (value: string) => <CopyText text={value} ellipsis />,
    },
    {
      title: '主标识',
      dataIndex: 'primaryLocator',
      width: 90,
      render: (value?: boolean) => (value ? <Tag color="success">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '操作',
      width: 130,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRecord(record);
              form.setFieldsValue({
                locatorType: record.locatorType?.toUpperCase(),
                locatorValue: record.locatorValue,
                primaryLocator: Boolean(record.primaryLocator),
              });
            }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除该设备标识？"
            description="删除后设备上报的该标识将无法再被识别，需要重新绑定才能恢复。"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deletingId === record.id}
              disabled={deletingId !== null && deletingId !== record.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Drawer
      title={`设备标识${deviceName ? ` · ${deviceName}` : ''}`}
      open={open}
      width={720}
      destroyOnHidden
      onClose={handleClose}
    >
      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES} onFinish={handleSubmit}>
        <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <Form.Item
            name="locatorType"
            label="标识类型"
            rules={[{ required: true, message: '请选择标识类型' }]}
            style={{ width: 170, marginBottom: 0 }}
          >
            <Select showSearch optionFilterProp="label" options={LOCATOR_TYPE_OPTIONS} placeholder="选择标识类型" />
          </Form.Item>
          <Form.Item
            name="locatorValue"
            label="标识值"
            rules={[{ required: true, whitespace: true, message: '请输入标识值' }]}
            style={{ flex: '1 1 260px', minWidth: 240, marginBottom: 0 }}
          >
            <Input maxLength={128} placeholder="填写设备实际上报的标识内容" />
          </Form.Item>
          <Form.Item name="primaryLocator" label="主标识" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item label=" " style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={submitting}>
                {editingRecord ? '保存修改' : '新增标识'}
              </Button>
              {editingRecord ? <Button onClick={resetEditor}>取消编辑</Button> : null}
            </Space>
          </Form.Item>
        </div>
      </Form>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={records}
        pagination={false}
        scroll={{ x: 680 }}
        locale={{
          emptyText: (
            <ListEmpty
              compact
              emptyText="暂无设备标识；新增后协议解析与设备识别会复用这些标识"
            />
          ),
        }}
      />
    </Drawer>
  );
};

export default DeviceLocatorModal;
