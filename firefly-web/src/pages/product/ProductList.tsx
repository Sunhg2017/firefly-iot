import React, { useEffect, useMemo, useState } from 'react';
import { Suspense } from 'react';
import {
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Drawer,
  Modal,
  Pagination,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { FormInstance, UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApiOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  ControlOutlined,
  DeleteOutlined,
  EditOutlined,
  GatewayOutlined,
  KeyOutlined,
  PictureOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SendOutlined,
  UnorderedListOutlined,
  UploadOutlined,
  UsbOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

const { Search, TextArea } = Input;
const ProductThingModelDrawer = React.lazy(() => import('./ProductThingModelDrawer'));
const ProductAccessDrawer = React.lazy(() => import('./ProductAccessDrawer'));

type ViewMode = 'card' | 'table';

interface ProductRecord {
  id: number;
  productKey: string;
  name: string;
  model?: string;
  imageUrl?: string;
  description?: string;
  category: string;
  protocol: string;
  nodeType: string;
  dataFormat: string;
  deviceAuthType: string;
  status: string;
  deviceCount: number;
  createdAt: string;
}

interface ProductFormValues {
  name: string;
  model?: string;
  imageUrl?: string;
  description?: string;
  category: string;
  protocol: string;
  nodeType: string;
  dataFormat: string;
  deviceAuthType: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  SENSOR: '传感器',
  GATEWAY: '网关',
  CONTROLLER: '控制器',
  CAMERA: '摄像头',
  OTHER: '其他',
};

const CATEGORY_COLORS: Record<string, string> = {
  SENSOR: 'blue',
  GATEWAY: 'purple',
  CONTROLLER: 'orange',
  CAMERA: 'cyan',
  OTHER: 'default',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  SENSOR: <CloudServerOutlined />,
  GATEWAY: <GatewayOutlined />,
  CONTROLLER: <ControlOutlined />,
  CAMERA: <VideoCameraOutlined />,
  OTHER: <QuestionCircleOutlined />,
};

const CATEGORY_BACKGROUNDS: Record<string, string> = {
  SENSOR: 'linear-gradient(135deg, #e0f2fe 0%, #f8fbff 100%)',
  GATEWAY: 'linear-gradient(135deg, #f3e8ff 0%, #faf5ff 100%)',
  CONTROLLER: 'linear-gradient(135deg, #ffedd5 0%, #fff7ed 100%)',
  CAMERA: 'linear-gradient(135deg, #cffafe 0%, #f0fdff 100%)',
  OTHER: 'linear-gradient(135deg, #f3f4f6 0%, #fafafa 100%)',
};

const CATEGORY_ICON_COLORS: Record<string, string> = {
  SENSOR: '#2563eb',
  GATEWAY: '#7c3aed',
  CONTROLLER: '#ea580c',
  CAMERA: '#0891b2',
  OTHER: '#6b7280',
};

const PROTOCOL_COLORS: Record<string, string> = {
  MQTT: 'green',
  COAP: 'geekblue',
  HTTP: 'volcano',
  LWM2M: 'magenta',
  CUSTOM: 'default',
};

const STATUS_LABELS: Record<string, string> = {
  DEVELOPMENT: '开发中',
  PUBLISHED: '已发布',
  DEPRECATED: '已废弃',
};

const STATUS_COLORS: Record<string, string> = {
  DEVELOPMENT: 'processing',
  PUBLISHED: 'success',
  DEPRECATED: 'default',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  DEVICE: '直连设备',
  GATEWAY: '网关设备',
};

const DEVICE_AUTH_LABELS: Record<string, string> = {
  DEVICE_SECRET: '一机一密',
  PRODUCT_SECRET: '一型一密',
};

const DEVICE_AUTH_COLORS: Record<string, string> = {
  DEVICE_SECRET: 'blue',
  PRODUCT_SECRET: 'gold',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));

const PROTOCOL_OPTIONS = [
  { value: 'MQTT', label: 'MQTT' },
  { value: 'COAP', label: 'CoAP' },
  { value: 'HTTP', label: 'HTTP' },
  { value: 'LWM2M', label: 'LwM2M' },
  { value: 'CUSTOM', label: '自定义' },
];

const NODE_TYPE_OPTIONS = [
  { value: 'DEVICE', label: '直连设备' },
  { value: 'GATEWAY', label: '网关设备' },
];

const DATA_FORMAT_OPTIONS = [
  { value: 'JSON', label: 'JSON' },
  { value: 'CUSTOM', label: '自定义透传' },
];

const DEVICE_AUTH_OPTIONS = [
  { value: 'DEVICE_SECRET', label: '一机一密' },
  { value: 'PRODUCT_SECRET', label: '一型一密' },
];

const STATUS_OPTIONS = [
  { value: 'DEVELOPMENT', label: '开发中' },
  { value: 'PUBLISHED', label: '已发布' },
  { value: 'DEPRECATED', label: '已废弃' },
];

const DEFAULT_FORM_VALUES: ProductFormValues = {
  name: '',
  model: '',
  imageUrl: '',
  description: '',
  category: 'SENSOR',
  protocol: 'MQTT',
  nodeType: 'DEVICE',
  dataFormat: 'JSON',
  deviceAuthType: 'PRODUCT_SECRET',
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }
  return fallback;
};

const trimOptionalValue = (value?: string) => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const buildProductPayload = (values: ProductFormValues) => ({
  name: values.name.trim(),
  model: trimOptionalValue(values.model),
  imageUrl: trimOptionalValue(values.imageUrl),
  description: trimOptionalValue(values.description),
  category: values.category,
  protocol: values.protocol,
  nodeType: values.nodeType,
  dataFormat: values.dataFormat,
  deviceAuthType: values.deviceAuthType,
});

const mapRecordToFormValues = (record: ProductRecord): ProductFormValues => ({
  name: record.name,
  model: record.model || '',
  imageUrl: record.imageUrl || '',
  description: record.description || '',
  category: record.category,
  protocol: record.protocol,
  nodeType: record.nodeType,
  dataFormat: record.dataFormat,
  deviceAuthType: record.deviceAuthType || 'PRODUCT_SECRET',
});

const ProductImageUploader: React.FC<{
  imageUrl?: string;
  uploading: boolean;
  onUpload: (file: File) => Promise<void>;
  onClear: () => void;
}> = ({ imageUrl, uploading, onUpload, onClear }) => {
  const uploadProps: UploadProps = {
    accept: 'image/*',
    showUploadList: false,
    beforeUpload: (file) => {
      if (file.type && !file.type.startsWith('image/')) {
        message.error('请选择图片文件');
        return Upload.LIST_IGNORE;
      }

      if (file.size > 5 * 1024 * 1024) {
        message.error('图片大小不能超过 5MB');
        return Upload.LIST_IGNORE;
      }

      void onUpload(file as File);
      return Upload.LIST_IGNORE;
    },
  };

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
      <div
        style={{
          width: 180,
          height: 120,
          borderRadius: 16,
          overflow: 'hidden',
          border: '1px solid #f0f0f0',
          background: imageUrl ? '#f5f5f5' : 'linear-gradient(135deg, #fff7e6 0%, #fff1f0 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="产品图片"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ textAlign: 'center', color: '#8c8c8c' }}>
            <PictureOutlined style={{ fontSize: 24 }} />
            <div style={{ fontSize: 12, marginTop: 8 }}>建议上传 16:9 封面图</div>
          </div>
        )}
      </div>

      <Space direction="vertical" size={10} style={{ flex: 1, minWidth: 220 }}>
        <Typography.Text strong>产品图片</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          支持 JPG、PNG、WebP 等常见格式，单张图片大小不超过 5MB。
        </Typography.Text>
        <Space wrap>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} loading={uploading}>
              {imageUrl ? '更换图片' : '上传图片'}
            </Button>
          </Upload>
          {imageUrl ? <Button onClick={onClear}>清空图片</Button> : null}
        </Space>
      </Space>
    </div>
  );
};

const ProductList: React.FC = () => {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [data, setData] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [createUploading, setCreateUploading] = useState(false);
  const [editUploading, setEditUploading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [filterProtocol, setFilterProtocol] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [thingModelProduct, setThingModelProduct] = useState<ProductRecord | null>(null);
  const [accessProduct, setAccessProduct] = useState<ProductRecord | null>(null);
  const [accessMode, setAccessMode] = useState<'secret' | 'register' | null>(null);
  const [createForm] = Form.useForm<ProductFormValues>();
  const [editForm] = Form.useForm<ProductFormValues>();
  const createImageUrl = Form.useWatch('imageUrl', createForm);
  const editImageUrl = Form.useWatch('imageUrl', editForm);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await productApi.list({
        ...params,
        keyword: keyword || undefined,
        category: filterCategory,
        protocol: filterProtocol,
        status: filterStatus,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      message.error(getErrorMessage(error, '加载产品列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize, keyword, filterCategory, filterProtocol, filterStatus]);

  const stats = useMemo(
    () => ({
      currentPageCount: data.length,
      publishedCount: data.filter((item) => item.status === 'PUBLISHED').length,
      developmentCount: data.filter((item) => item.status === 'DEVELOPMENT').length,
      totalDevices: data.reduce((sum, item) => sum + (item.deviceCount || 0), 0),
    }),
    [data],
  );

  const overviewItems = useMemo(
    () => [
      {
        title: '筛选结果',
        value: stats.currentPageCount,
        hint: '当前页产品数',
        color: '#2563eb',
        background: 'linear-gradient(135deg, #eff6ff 0%, #f8fbff 100%)',
      },
      {
        title: '已发布',
        value: stats.publishedCount,
        hint: '可正式接入',
        color: '#16a34a',
        background: 'linear-gradient(135deg, #ecfdf5 0%, #f7fee7 100%)',
      },
      {
        title: '开发中',
        value: stats.developmentCount,
        hint: '待完善或待发布',
        color: '#ea580c',
        background: 'linear-gradient(135deg, #fff7ed 0%, #fffaf0 100%)',
      },
      {
        title: '关联设备',
        value: stats.totalDevices,
        hint: '当前页设备总量',
        color: '#7c3aed',
        background: 'linear-gradient(135deg, #f5f3ff 0%, #faf5ff 100%)',
      },
    ],
    [stats.currentPageCount, stats.publishedCount, stats.developmentCount, stats.totalDevices],
  );

  const activeFilterTags = useMemo(() => {
    const tags: Array<{ key: string; label: string }> = [];

    if (keyword) {
      tags.push({ key: 'keyword', label: `关键词: ${keyword}` });
    }
    if (filterCategory) {
      tags.push({ key: 'category', label: `分类: ${CATEGORY_LABELS[filterCategory] || filterCategory}` });
    }
    if (filterProtocol) {
      tags.push({ key: 'protocol', label: `协议: ${filterProtocol}` });
    }
    if (filterStatus) {
      tags.push({ key: 'status', label: `状态: ${STATUS_LABELS[filterStatus] || filterStatus}` });
    }

    return tags;
  }, [filterCategory, filterProtocol, filterStatus, keyword]);

  const resetCreateForm = () => {
    createForm.resetFields();
    createForm.setFieldsValue(DEFAULT_FORM_VALUES);
    setCreateUploading(false);
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    resetCreateForm();
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditingId(null);
    setEditingProduct(null);
    editForm.resetFields();
    setEditUploading(false);
  };

  const populateEditForm = (record: ProductRecord) => {
    editForm.resetFields();
    editForm.setFieldsValue(mapRecordToFormValues(record));
    setEditUploading(false);
  };

  const uploadProductImage = async (
    file: File,
    form: FormInstance<ProductFormValues>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setUploading(true);
    try {
      const res = await productApi.uploadImage(file);
      const payload = res.data.data as { url?: string };
      form.setFieldValue('imageUrl', payload.url || '');
      message.success('产品图片上传成功');
    } catch (error) {
      message.error(getErrorMessage(error, '产品图片上传失败'));
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async (values: ProductFormValues) => {
    try {
      await productApi.create(buildProductPayload(values));
      message.success('产品创建成功');
      closeCreateModal();
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '产品创建失败'));
    }
  };

  const handleEdit = (record: ProductRecord) => {
    setEditingProduct(record);
    setEditingId(record.id);
    setEditOpen(true);
  };

  useEffect(() => {
    if (!editOpen || !editingProduct) {
      return;
    }

    populateEditForm(editingProduct);
  }, [editForm, editOpen, editingProduct]);

  const handleUpdate = async (values: ProductFormValues) => {
    if (!editingId) {
      return;
    }

    try {
      await productApi.update(editingId, buildProductPayload(values));
      message.success('产品更新成功');
      closeEditModal();
      void fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '产品更新失败'));
    }
  };

  const handlePublish = (record: ProductRecord) => {
    Modal.confirm({
      title: '确认发布产品？',
      content: `发布后产品将进入正式可用状态，确认发布“${record.name}”吗？`,
      okText: '确认发布',
      cancelText: '取消',
      onOk: async () => {
        try {
          await productApi.publish(record.id);
          message.success('产品已发布');
          void fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '产品发布失败'));
        }
      },
    });
  };

  const handleDelete = (record: ProductRecord) => {
    Modal.confirm({
      title: '确认删除产品？',
      content: `删除后无法恢复，确认删除“${record.name}”吗？`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await productApi.delete(record.id);
          message.success('产品已删除');
          void fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '产品删除失败'));
        }
      },
    });
  };

  const openAccessDrawer = (record: ProductRecord, mode: 'secret' | 'register') => {
    setAccessProduct(record);
    setAccessMode(mode);
  };

  const renderProductImage = (record: ProductRecord, compact = false) => {
    const width = compact ? 84 : '100%';
    const height = compact ? 60 : 188;

    if (record.imageUrl) {
      return (
        <img
          src={record.imageUrl}
          alt={record.name}
          style={{
            width,
            height,
            objectFit: 'cover',
            borderRadius: compact ? 10 : 0,
            display: 'block',
          }}
        />
      );
    }

    return (
      <div
        style={{
          width,
          height,
          borderRadius: compact ? 10 : 0,
          background: CATEGORY_BACKGROUNDS[record.category] || CATEGORY_BACKGROUNDS.OTHER,
          color: CATEGORY_ICON_COLORS[record.category] || CATEGORY_ICON_COLORS.OTHER,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: compact ? 24 : 34,
        }}
      >
        {CATEGORY_ICONS[record.category] || CATEGORY_ICONS.OTHER}
      </div>
    );
  };

  const renderCompactMetric = (label: string, value: React.ReactNode) => (
    <div
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, color: '#94a3b8' }}>{label}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#0f172a',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </span>
    </div>
  );

  const renderDeviceAuthTag = (deviceAuthType?: string) => (
    <Tag color={DEVICE_AUTH_COLORS[deviceAuthType || ''] || 'default'} style={{ margin: 0 }}>
      {DEVICE_AUTH_LABELS[deviceAuthType || ''] || deviceAuthType || '未配置'}
    </Tag>
  );

  const renderActionGroup = (record: ProductRecord, variant: 'card' | 'table') => {
    const isCard = variant === 'card';
    const supportsProductSecret = record.deviceAuthType === 'PRODUCT_SECRET';
    const canViewProtocolParser = hasPermission('protocol-parser:read');

    return (
      <Space size={isCard ? 4 : 4} wrap>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          onClick={() => handleEdit(record)}
        >
          编辑
        </Button>
        <Button
          type="link"
          size="small"
          icon={<ControlOutlined />}
          onClick={() => setThingModelProduct(record)}
        >
          物模型
        </Button>
        <Button
          type="link"
          size="small"
          icon={<KeyOutlined />}
          onClick={() => openAccessDrawer(record, 'secret')}
        >
          {supportsProductSecret ? '查看密钥' : '认证说明'}
        </Button>
        {canViewProtocolParser ? (
          <Button
            type="link"
            size="small"
            icon={<ApiOutlined />}
            onClick={() => navigate(`/protocol-parser?productId=${record.id}`)}
          >
            协议解析
          </Button>
        ) : null}
        {record.status === 'PUBLISHED' && supportsProductSecret ? (
          <Button
            type="link"
            size="small"
            icon={<UsbOutlined />}
            onClick={() => openAccessDrawer(record, 'register')}
          >
            动态注册
          </Button>
        ) : null}
        {record.status === 'DEVELOPMENT' ? (
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            onClick={() => handlePublish(record)}
          >
            发布
          </Button>
        ) : null}
        {record.status !== 'PUBLISHED' ? (
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={record.deviceCount > 0}
            onClick={() => handleDelete(record)}
          >
            删除
          </Button>
        ) : null}
      </Space>
    );
  };

  const columns: ColumnsType<ProductRecord> = [
    {
      title: '封面',
      width: 110,
      render: (_, record) => renderProductImage(record, true),
    },
    {
      title: '产品 / 型号',
      width: 280,
      render: (_, record) => (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text strong style={{ fontSize: 15 }}>
            {record.name}
          </Typography.Text>
          <Space wrap size={8}>
            {renderDeviceAuthTag(record.deviceAuthType)}
            {record.model ? <Tag style={{ margin: 0 }}>型号 {record.model}</Tag> : null}
          </Space>
          {record.description ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'ProductKey',
      dataIndex: 'productKey',
      width: 220,
      render: (value: string) => (
        <Typography.Text copyable={{ text: value }} code>
          {value}
        </Typography.Text>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
      render: (value: string) => <Tag color={CATEGORY_COLORS[value]}>{CATEGORY_LABELS[value] || value}</Tag>,
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      width: 100,
      render: (value: string) => <Tag color={PROTOCOL_COLORS[value]}>{value}</Tag>,
    },
    {
      title: '节点类型',
      dataIndex: 'nodeType',
      width: 120,
      render: (value: string) => NODE_TYPE_LABELS[value] || value,
    },
    {
      title: '认证方式',
      dataIndex: 'deviceAuthType',
      width: 120,
      render: (value: string) => renderDeviceAuthTag(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <Tag color={STATUS_COLORS[value]}>{STATUS_LABELS[value] || value}</Tag>,
    },
    {
      title: '设备数',
      dataIndex: 'deviceCount',
      width: 90,
      align: 'center',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
    },
    {
      title: '操作',
      width: 500,
      fixed: 'right',
      render: (_, record) => renderActionGroup(record, 'table'),
    },
  ];

  const renderProductFormFields = (
    form: FormInstance<ProductFormValues>,
    imageUrl: string | undefined,
    uploading: boolean,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
  ) => (
    <>
      <Form.Item
        name="name"
        label="产品名称"
        rules={[
          { required: true, message: '请输入产品名称' },
          { max: 256, message: '产品名称不能超过 256 个字符' },
        ]}
      >
        <Input placeholder="例如：智能温湿度传感器" maxLength={256} />
      </Form.Item>

      <Form.Item
        name="model"
        label="产品型号"
        rules={[{ max: 128, message: '产品型号不能超过 128 个字符' }]}
      >
        <Input placeholder="例如：TH-2000 Pro" maxLength={128} />
      </Form.Item>

      <Form.Item name="imageUrl" hidden>
        <Input />
      </Form.Item>

      <Form.Item label="产品图片">
        <ProductImageUploader
          imageUrl={imageUrl}
          uploading={uploading}
          onUpload={(file) => uploadProductImage(file, form, setUploading)}
          onClear={() => form.setFieldValue('imageUrl', '')}
        />
      </Form.Item>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="category" label="产品分类" rules={[{ required: true, message: '请选择产品分类' }]}>
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="protocol" label="接入协议" rules={[{ required: true, message: '请选择接入协议' }]}>
            <Select options={PROTOCOL_OPTIONS} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="nodeType" label="节点类型" rules={[{ required: true, message: '请选择节点类型' }]}>
            <Select options={NODE_TYPE_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="dataFormat" label="数据格式" rules={[{ required: true, message: '请选择数据格式' }]}>
            <Select options={DATA_FORMAT_OPTIONS} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="deviceAuthType"
        label="设备认证方式"
        rules={[{ required: true, message: '请选择设备认证方式' }]}
        extra="一机一密由平台预先创建设备并分配 DeviceSecret；一型一密可通过 ProductSecret 动态注册设备。"
      >
        <Select options={DEVICE_AUTH_OPTIONS} />
      </Form.Item>

      <Form.Item name="description" label="产品说明">
        <TextArea
          rows={4}
          maxLength={500}
          showCount
          placeholder="补充说明产品用途、适用场景、安装方式等信息"
        />
      </Form.Item>
    </>
  );

  return (
    <div>
      <PageHeader
        title="产品管理"
        description="按产品目录维护接入模型、认证方式与协议能力，卡片视图更适合快速浏览，列表视图适合批量管理。"
        extra={
          <Space>
            <Segmented
              value={viewMode}
              onChange={(value) => setViewMode(value as ViewMode)}
              options={[
                { value: 'card', icon: <AppstoreOutlined /> },
                { value: 'table', icon: <UnorderedListOutlined /> },
              ]}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                resetCreateForm();
                setCreateOpen(true);
              }}
            >
              新建产品
            </Button>
          </Space>
        }
      />

      <Card
        title="页面总览"
        size="small"
        style={{
          borderRadius: 18,
          marginBottom: 16,
          border: 'none',
          boxShadow: '0 8px 28px rgba(15,23,42,0.05)',
        }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Row gutter={[12, 12]}>
            {overviewItems.map((item) => (
              <Col xs={12} md={6} key={item.title}>
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 16,
                    background: item.background,
                    border: '1px solid rgba(148,163,184,0.14)',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{item.title}</div>
                  <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#475569' }}>{item.hint}</div>
                </div>
              </Col>
            ))}
          </Row>
          <Space wrap>
            <Tag color="blue">总产品 {total}</Tag>
            {activeFilterTags.length > 0 ? (
              activeFilterTags.map((item) => (
                <Tag key={item.key} color="default">
                  {item.label}
                </Tag>
              ))
            ) : (
              <Tag>当前未启用筛选条件</Tag>
            )}
          </Space>
        </Space>
      </Card>

      <Card
        title="筛选条件"
        size="small"
        styles={{ body: { padding: 14 } }}
        style={{
          borderRadius: 18,
          marginBottom: 16,
          border: 'none',
          boxShadow: '0 6px 24px rgba(15,23,42,0.04)',
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={10} lg={9}>
              <Search
                value={searchText}
                placeholder="搜索产品名称 / 型号 / ProductKey"
                allowClear
                style={{ width: '100%' }}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSearchText(nextValue);
                  if (!nextValue) {
                    setKeyword('');
                    setParams((prev) => ({ ...prev, pageNum: 1 }));
                  }
                }}
                onSearch={(value) => {
                  setSearchText(value);
                  setKeyword(value.trim());
                  setParams((prev) => ({ ...prev, pageNum: 1 }));
                }}
              />
            </Col>
            <Col xs={24} sm={8} md={5}>
              <Select
                value={filterCategory}
                allowClear
                placeholder="产品分类"
                style={{ width: '100%' }}
                options={CATEGORY_OPTIONS}
                onChange={(value) => {
                  setFilterCategory(value);
                  setParams((prev) => ({ ...prev, pageNum: 1 }));
                }}
              />
            </Col>
            <Col xs={24} sm={8} md={5}>
              <Select
                value={filterProtocol}
                allowClear
                placeholder="接入协议"
                style={{ width: '100%' }}
                options={PROTOCOL_OPTIONS}
                onChange={(value) => {
                  setFilterProtocol(value);
                  setParams((prev) => ({ ...prev, pageNum: 1 }));
                }}
              />
            </Col>
            <Col xs={24} sm={8} md={4}>
              <Select
                value={filterStatus}
                allowClear
                placeholder="状态"
                style={{ width: '100%' }}
                options={STATUS_OPTIONS}
                onChange={(value) => {
                  setFilterStatus(value);
                  setParams((prev) => ({ ...prev, pageNum: 1 }));
                }}
              />
            </Col>
            <Col xs={24} md={1} />
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            优先用分类、协议和状态筛选，再按关键词缩小范围，避免在卡片里反复扫重复字段。
          </Typography.Text>
        </Space>
      </Card>

      {viewMode === 'card' ? (
        <Spin spinning={loading}>
          {data.length > 0 ? (
            <>
              <Row gutter={[16, 16]}>
                {data.map((record) => (
                  <Col xs={24} sm={12} lg={8} xl={6} key={record.id}>
                    <Card
                      hoverable
                      styles={{ body: { padding: 0 } }}
                      style={{
                        borderRadius: 22,
                        overflow: 'hidden',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 14px 34px rgba(15,23,42,0.06)',
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        {renderProductImage(record)}
                        <div
                          style={{
                            position: 'absolute',
                            top: 14,
                            right: 14,
                          }}
                        >
                          <Tag color={STATUS_COLORS[record.status]} style={{ margin: 0, borderRadius: 999, paddingInline: 10 }}>
                            {STATUS_LABELS[record.status] || record.status}
                          </Tag>
                        </div>
                        <div
                          style={{
                            position: 'absolute',
                            left: 14,
                            bottom: 14,
                            width: 46,
                            height: 46,
                            borderRadius: 16,
                            background: 'rgba(255,255,255,0.88)',
                            backdropFilter: 'blur(10px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: CATEGORY_ICON_COLORS[record.category] || CATEGORY_ICON_COLORS.OTHER,
                            fontSize: 20,
                            boxShadow: '0 10px 24px rgba(15,23,42,0.16)',
                          }}
                        >
                          {CATEGORY_ICONS[record.category] || CATEGORY_ICONS.OTHER}
                        </div>
                      </div>

                      <div style={{ padding: 18 }}>
                        <div style={{ minWidth: 0 }}>
                          <Space wrap size={[8, 8]} style={{ marginBottom: 10 }}>
                            <Tag color={CATEGORY_COLORS[record.category]} style={{ margin: 0, borderRadius: 999 }}>
                              {CATEGORY_LABELS[record.category] || record.category}
                            </Tag>
                            <Tag color={PROTOCOL_COLORS[record.protocol]} style={{ margin: 0, borderRadius: 999 }}>
                              {record.protocol}
                            </Tag>
                            {renderDeviceAuthTag(record.deviceAuthType)}
                          </Space>
                          <Typography.Title level={5} style={{ margin: 0, fontSize: 18, lineHeight: 1.35 }}>
                            {record.name}
                          </Typography.Title>
                          <Typography.Text
                            copyable={{ text: record.productKey }}
                            style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#64748b' }}
                          >
                            {record.productKey}
                          </Typography.Text>
                          {record.model ? (
                            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                              型号 {record.model}
                            </Typography.Text>
                          ) : null}
                        </div>

                        <div
                          style={{
                            marginTop: 16,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                            gap: 12,
                            padding: '14px 16px',
                            borderRadius: 16,
                            background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 100%)',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          {renderCompactMetric('节点类型', NODE_TYPE_LABELS[record.nodeType] || record.nodeType)}
                          {renderCompactMetric('数据格式', record.dataFormat)}
                          {renderCompactMetric('设备数量', `${record.deviceCount || 0} 台`)}
                        </div>

                        <div
                          style={{
                            marginTop: 14,
                            padding: '12px 14px',
                            borderRadius: 16,
                            background: '#fcfcfd',
                            border: '1px solid #eef2f7',
                            minHeight: 84,
                          }}
                        >
                          <div
                            style={{
                              marginBottom: 8,
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 12,
                              alignItems: 'center',
                            }}
                          >
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>产品说明</span>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>创建于 {record.createdAt}</span>
                          </div>
                          <Typography.Paragraph
                            ellipsis={{ rows: 2 }}
                            style={{ margin: 0, fontSize: 12, color: '#475569' }}
                          >
                            {record.description || '暂未补充产品说明，可在编辑页完善产品用途、场景与安装信息。'}
                          </Typography.Paragraph>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '0 14px 14px',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 4,
                          borderTop: '1px solid #f1f5f9',
                        }}
                      >
                        {renderActionGroup(record, 'card')}
                      </div>
                    </Card>
                  </Col>
                ))}
              </Row>

              <div style={{ textAlign: 'right', marginTop: 20 }}>
                <Pagination
                  current={params.pageNum}
                  pageSize={params.pageSize}
                  total={total}
                  showSizeChanger
                  showTotal={(count) => `共 ${count} 条`}
                  onChange={(page, pageSize) => setParams({ pageNum: page, pageSize })}
                />
              </div>
            </>
          ) : (
            <Card
              style={{
                borderRadius: 16,
                border: 'none',
                boxShadow: '0 6px 24px rgba(15,23,42,0.04)',
              }}
            >
              <Empty description="暂无产品数据" />
            </Card>
          )}
        </Spin>
      ) : (
        <Card
          style={{
            borderRadius: 16,
            border: 'none',
            boxShadow: '0 6px 24px rgba(15,23,42,0.04)',
          }}
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={data}
            loading={loading}
            scroll={{ x: 1820 }}
            pagination={{
              current: params.pageNum,
              pageSize: params.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (count) => `共 ${count} 条`,
              onChange: (page, pageSize) => setParams({ pageNum: page, pageSize }),
            }}
          />
        </Card>
      )}

      <Drawer
        title="新建产品"
        open={createOpen}
        width={760}
        forceRender
        destroyOnClose
        afterOpenChange={(visible) => {
          if (visible && editingProduct) {
            populateEditForm(editingProduct);
          }
        }}
        onClose={closeCreateModal}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeCreateModal}>取消</Button>
            <Button type="primary" onClick={() => createForm.submit()}>创建产品</Button>
          </Space>
        }
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={DEFAULT_FORM_VALUES}
          onFinish={handleCreate}
          preserve={false}
        >
          {renderProductFormFields(createForm, createImageUrl, createUploading, setCreateUploading)}
        </Form>
      </Drawer>

      <Drawer
        title="编辑产品"
        open={editOpen}
        width={760}
        destroyOnClose
        onClose={closeEditModal}
        styles={{ body: { paddingBottom: 24 } }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeEditModal}>取消</Button>
            <Button type="primary" onClick={() => editForm.submit()}>保存修改</Button>
          </Space>
        }
      >
        <Form
          key={editingId ?? 'edit-empty'}
          form={editForm}
          layout="vertical"
          initialValues={editingProduct ? mapRecordToFormValues(editingProduct) : DEFAULT_FORM_VALUES}
          onFinish={handleUpdate}
          preserve={false}
        >
          {renderProductFormFields(editForm, editImageUrl, editUploading, setEditUploading)}
        </Form>
      </Drawer>

      {thingModelProduct ? (
        <Suspense fallback={<Spin size="large" fullscreen />}>
          <ProductThingModelDrawer
            product={thingModelProduct}
            open
            onClose={() => setThingModelProduct(null)}
          />
        </Suspense>
      ) : null}

      {accessProduct && accessMode ? (
        <Suspense fallback={<Spin size="large" fullscreen />}>
          <ProductAccessDrawer
            product={accessProduct}
            mode={accessMode}
            open
            onClose={() => {
              setAccessProduct(null);
              setAccessMode(null);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default ProductList;
