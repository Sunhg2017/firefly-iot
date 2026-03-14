import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Tabs, Tag, message } from 'antd';
import { SendOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { deviceApi, deviceMessageApi, productApi } from '../../services/api';

interface DeviceOption {
  id: number;
  deviceName: string;
  productId: number;
}

interface ServiceOption {
  value: string;
  label: string;
  description?: string;
}

interface TabProps {
  deviceOptions: DeviceOption[];
}

interface ThingModelServiceItem {
  identifier?: unknown;
  name?: unknown;
  description?: unknown;
}

const BUILTIN_SERVICE_OPTIONS: ServiceOption[] = [
  { value: 'online', label: '上线', description: '设备连接建立后上报在线状态' },
  { value: 'offline', label: '离线', description: '设备断开或超时后上报离线状态' },
  { value: 'heartbeat', label: '心跳', description: '设备周期性保活，维持在线状态' },
];

const parseThingModelServices = (rawThingModel: unknown): ServiceOption[] => {
  if (typeof rawThingModel !== 'string' || !rawThingModel.trim()) {
    return BUILTIN_SERVICE_OPTIONS;
  }

  try {
    const parsed = JSON.parse(rawThingModel) as { services?: ThingModelServiceItem[] };
    const services = Array.isArray(parsed.services) ? parsed.services : [];
    const resolved = services
      .map((item) => {
        const value = typeof item?.identifier === 'string' ? item.identifier.trim() : '';
        if (!value) {
          return null;
        }
        const label = typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : value;
        const description =
          typeof item?.description === 'string' && item.description.trim() ? item.description.trim() : undefined;
        return { value, label, description };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (resolved.length === 0) {
      return BUILTIN_SERVICE_OPTIONS;
    }

    const deduplicated = new Map<string, ServiceOption>();
    resolved.forEach((item) => {
      if (!deduplicated.has(item.value)) {
        deduplicated.set(item.value, item);
      }
    });
    return Array.from(deduplicated.values());
  } catch {
    return BUILTIN_SERVICE_OPTIONS;
  }
};

const PropertySetTab: React.FC<TabProps> = ({ deviceOptions }) => {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSend = async (values: Record<string, unknown>) => {
    setSending(true);
    setResult(null);
    try {
      const properties = JSON.parse(values.properties as string);
      await deviceMessageApi.setProperty(values.deviceId as number, properties);
      setResult('属性设置命令已发送');
      message.success('发送成功');
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error('属性 JSON 格式错误');
        setResult('属性 JSON 解析失败');
      } else {
        message.error('发送失败');
        setResult('属性设置发送失败');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <Form form={form} layout="vertical" onFinish={handleSend} initialValues={{ properties: '{\n  \n}' }}>
        <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
          <Select
            placeholder="请选择设备"
            showSearch
            optionFilterProp="label"
            style={{ width: 320 }}
            options={deviceOptions.map((device) => ({
              value: device.id,
              label: device.deviceName,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="properties"
          label="属性 JSON"
          rules={[{ required: true, message: '请输入属性 JSON' }]}
          extra='示例：{"brightness":80,"switch":true}'
        >
          <Input.TextArea rows={8} placeholder='{"brightness":80,"switch":true}' style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SettingOutlined />} loading={sending}>
          设置属性
        </Button>
      </Form>
      {result ? (
        <Tag color={result.includes('成功') || result.includes('已发送') ? 'success' : 'error'} style={{ marginTop: 12 }}>
          {result}
        </Tag>
      ) : null}
    </Card>
  );
};

const ServiceInvokeTab: React.FC<TabProps> = ({ deviceOptions }) => {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>(BUILTIN_SERVICE_OPTIONS);
  const [serviceLoading, setServiceLoading] = useState(false);
  const serviceCacheRef = useRef<Map<number, ServiceOption[]>>(new Map());
  const selectedDeviceId = Form.useWatch('deviceId', form) as number | undefined;

  const selectedDevice = useMemo(
    () => deviceOptions.find((device) => device.id === selectedDeviceId) ?? null,
    [deviceOptions, selectedDeviceId],
  );

  useEffect(() => {
    const loadProductServices = async () => {
      if (!selectedDevice?.productId) {
        setServiceOptions(BUILTIN_SERVICE_OPTIONS);
        form.setFieldValue('serviceName', undefined);
        return;
      }

      const cached = serviceCacheRef.current.get(selectedDevice.productId);
      if (cached) {
        setServiceOptions(cached);
        form.setFieldValue('serviceName', cached[0]?.value);
        return;
      }

      setServiceLoading(true);
      try {
        const response = await productApi.getThingModel(selectedDevice.productId);
        const options = parseThingModelServices(response.data.data);
        serviceCacheRef.current.set(selectedDevice.productId, options);
        setServiceOptions(options);
        form.setFieldValue('serviceName', options[0]?.value);
      } catch {
        setServiceOptions(BUILTIN_SERVICE_OPTIONS);
        form.setFieldValue('serviceName', BUILTIN_SERVICE_OPTIONS[0].value);
        message.warning('加载产品物模型服务失败，已回退到固有服务列表');
      } finally {
        setServiceLoading(false);
      }
    };

    void loadProductServices();
  }, [form, selectedDevice]);

  const handleSend = async (values: Record<string, unknown>) => {
    setSending(true);
    setResult(null);
    try {
      const params = JSON.parse(values.params as string);
      await deviceMessageApi.invokeService(
        values.deviceId as number,
        values.serviceName as string,
        params,
      );
      setResult('服务调用命令已发送');
      message.success('发送成功');
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error('参数 JSON 格式错误');
        setResult('参数 JSON 解析失败');
      } else {
        message.error('发送失败');
        setResult('服务调用发送失败');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSend}
        initialValues={{
          params: '{\n  \n}',
          serviceName: BUILTIN_SERVICE_OPTIONS[0].value,
        }}
      >
        <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
          <Select
            placeholder="请选择设备"
            showSearch
            optionFilterProp="label"
            style={{ width: 320 }}
            options={deviceOptions.map((device) => ({
              value: device.id,
              label: device.deviceName,
            }))}
          />
        </Form.Item>
        <Form.Item name="serviceName" label="服务名称" rules={[{ required: true, message: '请选择服务' }]}>
          <Select
            placeholder={selectedDevice ? '请选择产品物模型服务' : '请先选择设备'}
            showSearch
            optionFilterProp="label"
            loading={serviceLoading}
            disabled={!selectedDevice}
            style={{ width: 360 }}
            options={serviceOptions.map((service) => ({
              value: service.value,
              label: service.label,
              title: service.description,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="params"
          label="参数 JSON"
          rules={[{ required: true, message: '请输入参数 JSON' }]}
          extra={selectedDevice ? '参数结构应与产品物模型服务定义保持一致' : '先选择设备后，系统会自动加载所属产品的服务列表'}
        >
          <Input.TextArea rows={8} placeholder='{"timeout":30}' style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<ThunderboltOutlined />} loading={sending}>
          调用服务
        </Button>
      </Form>
      {result ? (
        <Tag color={result.includes('成功') || result.includes('已发送') ? 'success' : 'error'} style={{ marginTop: 12 }}>
          {result}
        </Tag>
      ) : null}
    </Card>
  );
};

const RawMessageTab: React.FC<TabProps> = ({ deviceOptions }) => {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSend = async (values: Record<string, unknown>) => {
    setSending(true);
    setResult(null);
    try {
      const payload = JSON.parse(values.payload as string);
      await deviceMessageApi.publishDownstream({
        deviceId: values.deviceId as number,
        type: values.type as string,
        payload,
      });
      setResult('原始消息已发送');
      message.success('发送成功');
    } catch (error) {
      if (error instanceof SyntaxError) {
        message.error('Payload JSON 格式错误');
        setResult('Payload JSON 解析失败');
      } else {
        message.error('发送失败');
        setResult('原始消息发送失败');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSend}
        initialValues={{
          type: 'SERVICE_INVOKE',
          payload: '{\n  \n}',
        }}
      >
        <Space wrap align="start">
          <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select
              placeholder="请选择设备"
              showSearch
              optionFilterProp="label"
              style={{ width: 320 }}
              options={deviceOptions.map((device) => ({
                value: device.id,
                label: device.deviceName,
              }))}
            />
          </Form.Item>
          <Form.Item name="type" label="消息类型" rules={[{ required: true, message: '请选择消息类型' }]}>
            <Select
              placeholder="请选择消息类型"
              style={{ width: 220 }}
              options={[
                { value: 'PROPERTY_SET', label: 'PROPERTY_SET' },
                { value: 'SERVICE_INVOKE', label: 'SERVICE_INVOKE' },
                { value: 'CONFIG_PUSH', label: 'CONFIG_PUSH' },
                { value: 'OTA_UPGRADE', label: 'OTA_UPGRADE' },
                { value: 'CUSTOM', label: 'CUSTOM' },
              ]}
            />
          </Form.Item>
        </Space>
        <Form.Item name="payload" label="Payload JSON" rules={[{ required: true, message: '请输入 Payload JSON' }]}>
          <Input.TextArea rows={8} placeholder='{"key":"value"}' style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending}>
          发送下行消息
        </Button>
      </Form>
      {result ? (
        <Tag color={result.includes('成功') || result.includes('已发送') ? 'success' : 'error'} style={{ marginTop: 12 }}>
          {result}
        </Tag>
      ) : null}
    </Card>
  );
};

const DeviceMessagePage: React.FC = () => {
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);

  const fetchDevices = useCallback(async () => {
    try {
      const response = await deviceApi.list({ pageSize: 500 });
      const records = response.data.data?.records || [];
      setDeviceOptions(
        records.map((device: DeviceOption) => ({
          id: device.id,
          deviceName: device.deviceName,
          productId: device.productId,
        })),
      );
    } catch {
      message.error('加载设备列表失败');
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  return (
    <div>
      <PageHeader
        title="设备消息"
        description="向设备下发属性设置、调用物模型服务或直接发送原始下行消息。服务调用会根据设备所属产品自动加载物模型服务列表。"
      />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)' }}>
        <Tabs
          defaultActiveKey="property-set"
          items={[
            {
              key: 'property-set',
              label: (
                <span>
                  <SettingOutlined style={{ marginRight: 6 }} />
                  设置属性
                </span>
              ),
              children: <PropertySetTab deviceOptions={deviceOptions} />,
            },
            {
              key: 'service-invoke',
              label: (
                <span>
                  <ThunderboltOutlined style={{ marginRight: 6 }} />
                  调用服务
                </span>
              ),
              children: <ServiceInvokeTab deviceOptions={deviceOptions} />,
            },
            {
              key: 'raw-message',
              label: (
                <span>
                  <SendOutlined style={{ marginRight: 6 }} />
                  原始消息
                </span>
              ),
              children: <RawMessageTab deviceOptions={deviceOptions} />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default DeviceMessagePage;
