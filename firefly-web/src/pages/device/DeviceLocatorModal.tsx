import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Typography, message } from 'antd';
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
      message.error(getErrorMessage(error, 'Failed to load locators'));
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
        message.success('Locator updated');
      } else {
        await deviceApi.createLocator(deviceId, payload);
        message.success('Locator created');
      }
      resetEditor();
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to save locator'));
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
      message.success('Locator deleted');
      if (editingRecord?.id === locatorId) {
        resetEditor();
      }
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, 'Failed to delete locator'));
    }
  };

  const columns: ColumnsType<DeviceLocatorRecord> = [
    {
      title: 'Type',
      dataIndex: 'locatorType',
      width: 140,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: 'Value',
      dataIndex: 'locatorValue',
      render: (value: string) => <Typography.Text copyable={{ text: value }}>{value}</Typography.Text>,
    },
    {
      title: 'Primary',
      dataIndex: 'primaryLocator',
      width: 100,
      render: (value?: boolean) => (value ? <Tag color="success">Yes</Tag> : <Tag>No</Tag>),
    },
    {
      title: 'Updated At',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
    {
      title: 'Actions',
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
            Edit
          </Button>
          <Popconfirm title="Delete this locator?" onConfirm={() => void handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={`Device Locators${deviceName ? ` · ${deviceName}` : ''}`}
      open={open}
      width={900}
      destroyOnHidden
      footer={null}
      onCancel={() => {
        resetEditor();
        onClose();
      }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Locators are used for custom protocol identification."
        description="Typical examples are IMEI, ICCID, MAC, serial number, or any vendor-specific identifier carried by uplink packets."
      />

      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES} onFinish={handleSubmit}>
        <Space align="start" style={{ display: 'flex', marginBottom: 16 }}>
          <Form.Item
            name="locatorType"
            label="Locator Type"
            rules={[{ required: true, message: 'Please enter locator type' }]}
            style={{ minWidth: 180, marginBottom: 0 }}
          >
            <Input placeholder="IMEI / ICCID / MAC / SERIAL" />
          </Form.Item>
          <Form.Item
            name="locatorValue"
            label="Locator Value"
            rules={[{ required: true, message: 'Please enter locator value' }]}
            style={{ flex: 1, marginBottom: 0 }}
          >
            <Input placeholder="Actual identifier value reported by the device" />
          </Form.Item>
          <Form.Item name="primaryLocator" label="Primary" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch checkedChildren="Yes" unCheckedChildren="No" />
          </Form.Item>
          <Form.Item label=" " style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={submitting}>
                {editingRecord ? 'Update' : 'Add'}
              </Button>
              {editingRecord ? <Button onClick={resetEditor}>Cancel</Button> : null}
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
