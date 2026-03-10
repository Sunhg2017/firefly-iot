import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, message, Input, Card, Form, Select, Tabs, Tag } from 'antd';
import { SendOutlined, ThunderboltOutlined, SettingOutlined } from '@ant-design/icons';
import { deviceMessageApi, deviceApi } from '../../services/api';
import PageHeader from '../../components/PageHeader';

// 设备选项类型
interface DeviceOption {
  id: number;
  deviceName: string;
}

// 属性设置Tab
interface PropertySetTabProps {
  deviceOptions: DeviceOption[];
}

const PropertySetTab: React.FC<PropertySetTabProps> = ({ deviceOptions }) => {
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
    } catch (e: unknown) {
      if (e instanceof SyntaxError) { message.error('JSON 格式错误'); setResult('JSON 解析失败'); }
      else { message.error('发送失败'); setResult('发送失败'); }
    } finally { setSending(false); }
  };

  return (
    <Card>
      <Form form={form} layout="vertical" onFinish={handleSend}>
        <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
          <Select
            placeholder="请选择设备"
            showSearch
            optionFilterProp="label"
            style={{ width: 280 }}
            options={deviceOptions.map(d => ({ value: d.id, label: d.deviceName }))}
          />
        </Form.Item>
        <Form.Item name="properties" label="属性 JSON" rules={[{ required: true, message: '请输入属性 JSON' }]}
          extra="设置设备属性，如：{&quot;brightness&quot;: 80, &quot;switch&quot;: true}">
          <Input.TextArea rows={6} placeholder='{"brightness": 80, "switch": true}' style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SettingOutlined />} loading={sending}>设置属性</Button>
      </Form>
      {result && <Tag color={result.includes('成功') || result.includes('已发送') ? 'success' : 'error'} style={{ marginTop: 12 }}>{result}</Tag>}
    </Card>
  );
};

const ServiceInvokeTab: React.FC<PropertySetTabProps> = ({ deviceOptions }) => {
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

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
    } catch (e: unknown) {
      if (e instanceof SyntaxError) { message.error('JSON 格式错误'); setResult('JSON 解析失败'); }
      else { message.error('发送失败'); setResult('发送失败'); }
    } finally { setSending(false); }
  };

  return (
    <Card>
      <Form form={form} layout="vertical" onFinish={handleSend}>
        <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
          <Select
            placeholder="请选择设备"
            showSearch
            optionFilterProp="label"
            style={{ width: 280 }}
            options={deviceOptions.map(d => ({ value: d.id, label: d.deviceName }))}
          />
        </Form.Item>
        <Form.Item name="serviceName" label="服务名称" rules={[{ required: true, message: '请输入服务名称' }]}>
          <Input placeholder="如：reboot, setConfig" style={{ width: 300 }} />
        </Form.Item>
        <Form.Item name="params" label="参数 JSON" rules={[{ required: true, message: '请输入参数 JSON' }]}
          extra="服务调用参数，如：{&quot;timeout&quot;: 30}">
          <Input.TextArea rows={6} placeholder='{"timeout": 30}' style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<ThunderboltOutlined />} loading={sending}>调用服务</Button>
      </Form>
      {result && <Tag color={result.includes('成功') || result.includes('已发送') ? 'success' : 'error'} style={{ marginTop: 12 }}>{result}</Tag>}
    </Card>
  );
};

const RawMessageTab: React.FC<PropertySetTabProps> = ({ deviceOptions }) => {
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
    } catch (e: unknown) {
      if (e instanceof SyntaxError) { message.error('JSON 格式错误'); setResult('JSON 解析失败'); }
      else { message.error('发送失败'); setResult('发送失败'); }
    } finally { setSending(false); }
  };

  return (
    <Card>
      <Form form={form} layout="vertical" onFinish={handleSend}>
        <Space>
          <Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select
              placeholder="请选择设备"
              showSearch
              optionFilterProp="label"
              style={{ width: 280 }}
              options={deviceOptions.map(d => ({ value: d.id, label: d.deviceName }))}
            />
          </Form.Item>
          <Form.Item name="type" label="消息类型" rules={[{ required: true }]}>
            <Select placeholder="选择类型" style={{ width: 200 }}>
              <Select.Option value="PROPERTY_SET">PROPERTY_SET</Select.Option>
              <Select.Option value="SERVICE_INVOKE">SERVICE_INVOKE</Select.Option>
              <Select.Option value="CONFIG_PUSH">CONFIG_PUSH</Select.Option>
              <Select.Option value="OTA_UPGRADE">OTA_UPGRADE</Select.Option>
              <Select.Option value="CUSTOM">CUSTOM</Select.Option>
            </Select>
          </Form.Item>
        </Space>
        <Form.Item name="payload" label="Payload JSON" rules={[{ required: true }]}>
          <Input.TextArea rows={8} placeholder='{"key": "value"}' style={{ fontFamily: 'monospace', fontSize: 13 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending}>发送下行消息</Button>
      </Form>
      {result && <Tag color={result.includes('成功') || result.includes('已发送') ? 'success' : 'error'} style={{ marginTop: 12 }}>{result}</Tag>}
    </Card>
  );
};

const DeviceMessagePage: React.FC = () => {
  // 设备列表
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);

  // 加载设备列表
  const fetchDevices = useCallback(async () => {
    try {
      const res = await deviceApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setDeviceOptions(records.map((d: DeviceOption) => ({ id: d.id, deviceName: d.deviceName })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  return (
    <div>
      <PageHeader title="设备消息" description="向设备下发命令、设置属性或调用服务，消息通过 Kafka 推送到 MQTT Broker 后下发至设备" />
      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Tabs defaultActiveKey="property-set" items={[
          { key: 'property-set', label: <span><SettingOutlined style={{ marginRight: 6 }} />设置属性</span>, children: <PropertySetTab deviceOptions={deviceOptions} /> },
          { key: 'service-invoke', label: <span><ThunderboltOutlined style={{ marginRight: 6 }} />调用服务</span>, children: <ServiceInvokeTab deviceOptions={deviceOptions} /> },
          { key: 'raw-message', label: <span><SendOutlined style={{ marginRight: 6 }} />原始消息</span>, children: <RawMessageTab deviceOptions={deviceOptions} /> },
        ]} />
      </Card>
    </div>
  );
};

export default DeviceMessagePage;
