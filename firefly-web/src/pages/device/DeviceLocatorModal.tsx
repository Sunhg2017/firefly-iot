import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { deviceApi } from '../../services/api';

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

const DEFAULT_VALUES: LocatorFormValues = {
  locatorType: 'IMEI',
  locatorValue: '',
  primaryLocator: false,
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const DeviceLocatorModal: React.FC<DeviceLocatorModalProps> = ({ deviceId, deviceName, open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [records, setRecords] = useState<DeviceLocatorRecord[]>([]);
  const [editingRecord, setEditingRecord] = useState<DeviceLocatorRecord | null>(null);
  const [form] = Form.useForm<LocatorFormValues>();

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
    form.setFieldsValue(DEFAULT_VALUES);
    setEditingRecord(null);
    void fetchData();
  }, [deviceId, form, open]);

  const resetEditor = () => {
    setEditingRecord(null);
    form.setFieldsValue(DEFAULT_VALUES);
  };

  const handleSubmit = async (values: LocatorFormValues) => {
    if (!deviceId) {
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
    if (!deviceId) {
      return;
    }
    try {
      await deviceApi.deleteLocator(deviceId, locatorId);
      message.success('设备标识已删除');
      if (editingRecord?.id === locatorId) {
        resetEditor();
      }
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '删除设备标识失败'));
    }
  };

  const columns: ColumnsType<DeviceLocatorRecord> = [
    {
      title: '类型',
      dataIndex: 'locatorType',
      width: 140,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '标识值',
      dataIndex: 'locatorValue',
      render: (value: string) => <Typography.Text copyable={{ text: value }}>{value}</Typography.Text>,
    },
    {
      title: '主标识',
      dataIndex: 'primaryLocator',
      width: 100,
      render: (value?: boolean) => (value ? <Tag color="success">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
    {
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRecord(record);
              form.setFieldsValue({
                locatorType: record.locatorType,
                locatorValue: record.locatorValue,
                primaryLocator: Boolean(record.primaryLocator),
              });
            }}
          >
            编辑
          </Button>
          <Popconfirm title="确认删除该标识吗？" onConfirm={() => void handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={`设备标识${deviceName ? ` · ${deviceName}` : ''}`}
      open={open}
      width={900}
      destroyOnHidden
      footer={null}
      onCancel={() => {
        resetEditor();
        onClose();
      }}
    >
      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES} onFinish={handleSubmit}>
        <Space align="start" style={{ display: 'flex', marginBottom: 16 }}>
          <Form.Item
            name="locatorType"
            label="标识类型"
            rules={[{ required: true, message: '请输入标识类型' }]}
            style={{ minWidth: 180, marginBottom: 0 }}
          >
            <Input placeholder="IMEI / ICCID / MAC / SERIAL" />
          </Form.Item>
          <Form.Item
            name="locatorValue"
            label="标识值"
            rules={[{ required: true, message: '请输入标识值' }]}
            style={{ flex: 1, marginBottom: 0 }}
          >
            <Input placeholder="设备实际上报的标识内容" />
          </Form.Item>
          <Form.Item name="primaryLocator" label="主标识" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item label=" " style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={submitting}>
                {editingRecord ? '更新' : '新增'}
              </Button>
              {editingRecord ? <Button onClick={resetEditor}>取消</Button> : null}
            </Space>
          </Form.Item>
        </Space>
      </Form>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={records}
        pagination={false}
        scroll={{ x: 760 }}
      />
    </Modal>
  );
};

export default DeviceLocatorModal;
