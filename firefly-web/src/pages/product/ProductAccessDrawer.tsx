import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  Space,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { KeyOutlined, ReloadOutlined, UsbOutlined } from '@ant-design/icons';
import { deviceAccessApi, productApi } from '../../services/api';

type AccessMode = 'secret' | 'register' | null;

interface ProductTarget {
  id: number;
  name: string;
  productKey: string;
  status: string;
  protocol: string;
  nodeType: string;
  deviceAuthType: string;
  deviceCount: number;
}

interface DynamicRegisterResult {
  deviceId: number;
  productId: number;
  deviceName: string;
  deviceSecret: string;
}

interface Props {
  product: ProductTarget | null;
  mode: AccessMode;
  open: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  DEVELOPMENT: '开发中',
  PUBLISHED: '已发布',
  DEPRECATED: '已废弃',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  DEVICE: '直连设备',
  GATEWAY: '网关设备',
};

const DEVICE_AUTH_LABELS: Record<string, string> = {
  DEVICE_SECRET: '一机一密',
  PRODUCT_SECRET: '一型一密',
};

const DEVICE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{1,63}$/;
const DEVICE_NAME_RULE_MESSAGE =
  '设备名称支持 2-64 位字母、数字、冒号、下划线、中划线、小数点，且需以字母或数字开头';

const ERROR_MESSAGE_MAP: Record<string, string> = {
  PRODUCT_DYNAMIC_REGISTER_DISABLED: '当前产品未启用一型一密认证，不能进行动态注册',
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return ERROR_MESSAGE_MAP[response.data.message] || response.data.message;
    }
  }
  return fallback;
};

const ProductAccessDrawer: React.FC<Props> = ({ product, mode, open, onClose }) => {
  const [activeTab, setActiveTab] = useState<'secret' | 'register'>('secret');
  const [secretLoading, setSecretLoading] = useState(false);
  const [productSecret, setProductSecret] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerResult, setRegisterResult] = useState<DynamicRegisterResult | null>(null);
  const [form] = Form.useForm();

  const supportsProductSecret = product?.deviceAuthType === 'PRODUCT_SECRET';
  const canRegister = product?.status === 'PUBLISHED' && supportsProductSecret;

  const drawerTitle = useMemo(() => {
    if (!product) {
      return '产品接入工具';
    }
    return `产品接入工具 - ${product.name}`;
  }, [product]);

  const syncFormValues = (secret: string) => {
    if (!product) {
      return;
    }

    form.setFieldsValue({
      productKey: product.productKey,
      productSecret: secret,
      deviceName: undefined,
      nickname: undefined,
      description: undefined,
      tags: undefined,
    });
  };

  const loadSecret = async () => {
    if (!product) {
      return '';
    }
    if (!supportsProductSecret) {
      setProductSecret('');
      syncFormValues('');
      return '';
    }

    setSecretLoading(true);
    try {
      const res = await productApi.getSecret(product.id);
      const secret = res.data.data || '';
      setProductSecret(secret);
      syncFormValues(secret);
      return secret;
    } catch (error) {
      message.error(getErrorMessage(error, '获取 ProductSecret 失败'));
      setProductSecret('');
      syncFormValues('');
      return '';
    } finally {
      setSecretLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !product) {
      return;
    }

    const nextSupportsProductSecret = product.deviceAuthType === 'PRODUCT_SECRET';
    setActiveTab(mode === 'register' && nextSupportsProductSecret ? 'register' : 'secret');
    setRegisterResult(null);
    form.resetFields();

    if (nextSupportsProductSecret) {
      void loadSecret();
    } else {
      setProductSecret('');
      syncFormValues('');
    }
  }, [open, product, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmitRegister = async (values: Record<string, string>) => {
    if (!product) {
      return;
    }

    if (!supportsProductSecret) {
      message.warning('当前产品未启用一型一密认证');
      return;
    }

    if (!canRegister) {
      message.warning('只有已发布且启用一型一密的产品才支持动态注册');
      return;
    }

    setRegisterSubmitting(true);
    try {
      const res = await deviceAccessApi.dynamicRegister({
        productKey: product.productKey,
        productSecret,
        deviceName: values.deviceName,
        nickname: values.nickname,
        description: values.description,
        tags: values.tags,
      });
      const payload = res.data.data as DynamicRegisterResult;
      setRegisterResult(payload);
      message.success('动态注册成功，已生成设备密钥');
      form.setFieldValue('deviceName', undefined);
      form.setFieldValue('nickname', undefined);
      form.setFieldValue('description', undefined);
      form.setFieldValue('tags', undefined);
    } catch (error) {
      message.error(getErrorMessage(error, '动态注册失败'));
    } finally {
      setRegisterSubmitting(false);
    }
  };

  const tabItems = supportsProductSecret
    ? [
        {
          key: 'secret',
          label: (
            <span>
              <KeyOutlined /> 查看 ProductSecret
            </span>
          ),
          children: (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                type="warning"
                showIcon
                message="ProductSecret 用于一型一密动态注册，请妥善保管，避免泄露到公开环境。"
              />
              <Card size="small">
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>ProductSecret</div>
                <Typography.Text copyable={!!productSecret ? { text: productSecret } : false} code>
                  {secretLoading ? '加载中...' : productSecret || '未获取到密钥'}
                </Typography.Text>
              </Card>
              <Button type="primary" onClick={() => setActiveTab('register')} disabled={!canRegister}>
                去调试动态注册
              </Button>
              {!canRegister ? (
                <Typography.Text type="secondary">
                  当前产品尚未发布，动态注册调试入口已禁用。
                </Typography.Text>
              ) : null}
            </Space>
          ),
        },
        {
          key: 'register',
          label: (
            <span>
              <UsbOutlined /> 动态注册调试
            </span>
          ),
          children: (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                type={canRegister ? 'info' : 'error'}
                showIcon
                message={
                  canRegister
                    ? '调试注册会真实创建一台设备，并返回新的 DeviceSecret。'
                    : '当前产品未发布，不能执行动态注册。'
                }
              />

              <Form form={form} layout="vertical" onFinish={handleSubmitRegister} disabled={!canRegister}>
                <Form.Item label="ProductKey" name="productKey">
                  <Input readOnly />
                </Form.Item>
                <Form.Item label="ProductSecret" name="productSecret">
                  <Input.Password readOnly visibilityToggle={false} />
                </Form.Item>
                <Form.Item
                  label="设备名称"
                  name="deviceName"
                  rules={[
                    { required: true, message: '请输入设备名称' },
                    { pattern: DEVICE_NAME_PATTERN, message: DEVICE_NAME_RULE_MESSAGE },
                  ]}
                >
                  <Input placeholder="如：AA:BB:CC:DD:EE:FF / SN20240301001" maxLength={64} />
                </Form.Item>
                <Form.Item label="设备昵称" name="nickname">
                  <Input placeholder="选填，用于后台展示" maxLength={64} />
                </Form.Item>
                <Form.Item label="设备描述" name="description">
                  <Input.TextArea rows={3} placeholder="选填，记录设备安装位置或用途" maxLength={255} />
                </Form.Item>
                <Form.Item label="标签" name="tags">
                  <Input placeholder="选填，例如 area=room1,type=test" maxLength={255} />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={registerSubmitting} disabled={!canRegister}>
                  执行动态注册
                </Button>
              </Form>

              {registerResult ? (
                <Card size="small" title="注册结果">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Device ID">{registerResult.deviceId}</Descriptions.Item>
                    <Descriptions.Item label="设备名称">{registerResult.deviceName}</Descriptions.Item>
                    <Descriptions.Item label="DeviceSecret">
                      <Typography.Text copyable={{ text: registerResult.deviceSecret }} code>
                        {registerResult.deviceSecret}
                      </Typography.Text>
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              ) : null}
            </Space>
          ),
        },
      ]
    : [
        {
          key: 'secret',
          label: (
            <span>
              <KeyOutlined /> 认证说明
            </span>
          ),
          children: (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Alert
                type="info"
                showIcon
                message="当前产品使用一机一密认证，设备需先在平台创建设备，再使用各自 DeviceSecret 连接。"
              />
              <Card size="small">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="认证方式">一机一密</Descriptions.Item>
                  <Descriptions.Item label="接入凭证">每台设备独立 DeviceSecret</Descriptions.Item>
                  <Descriptions.Item label="产品密钥">该模式下不开放 ProductSecret 查看与动态注册</Descriptions.Item>
                </Descriptions>
              </Card>
              <Typography.Text type="secondary">
                可在设备管理页执行单个创建设备、Excel 批量导入或批量三元组导出。
              </Typography.Text>
            </Space>
          ),
        },
      ];

  return (
    <Drawer
      title={drawerTitle}
      open={open}
      onClose={onClose}
      width={680}
      destroyOnHidden
      extra={
        supportsProductSecret ? (
          <Button icon={<ReloadOutlined />} loading={secretLoading} onClick={() => void loadSecret()}>
            刷新密钥
          </Button>
        ) : null
      }
    >
      {product ? (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="ProductKey" span={2}>
              <Typography.Text copyable code>
                {product.productKey}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={product.status === 'PUBLISHED' ? 'success' : 'processing'}>
                {STATUS_LABELS[product.status] || product.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="协议">{product.protocol}</Descriptions.Item>
            <Descriptions.Item label="节点类型">
              {NODE_TYPE_LABELS[product.nodeType] || product.nodeType}
            </Descriptions.Item>
            <Descriptions.Item label="认证方式">
              <Tag color={supportsProductSecret ? 'gold' : 'blue'}>
                {DEVICE_AUTH_LABELS[product.deviceAuthType] || product.deviceAuthType}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="关联设备">{product.deviceCount}</Descriptions.Item>
          </Descriptions>

          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'secret' | 'register')}
            items={tabItems}
          />
        </Space>
      ) : null}
    </Drawer>
  );
};

export default ProductAccessDrawer;
