import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Table, Button, Space, message, Modal, Form, Input, Select, Tag, Drawer, Progress } from 'antd';
import { LinkOutlined, UsbOutlined } from '@ant-design/icons';
import { firmwareApi, deviceFirmwareApi, deviceApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';

// 设备选项类型
interface DeviceOption {
  id: number;
  deviceName: string;
  productId: number;
}

interface FirmwareItem {
  id: number; productId: number; version: string; displayName: string; description: string;
  fileUrl: string; fileSize: number; md5Checksum: string; status: string; createdAt: string;
}
interface DeviceFwItem {
  id: number; deviceId: number; deviceName?: string; firmwareId: number; currentVersion: string; targetVersion: string;
  upgradeStatus: string; upgradeProgress: number; lastUpgradeAt: string; updatedAt: string;
}

const statusLabels: Record<string, string> = { DRAFT: '草稿', PUBLISHED: '已发布', DEPRECATED: '已废弃' };
const statusColors: Record<string, string> = { DRAFT: 'default', PUBLISHED: 'success', DEPRECATED: 'warning' };
const upgradeColors: Record<string, string> = { IDLE: 'default', DOWNLOADING: 'processing', UPGRADING: 'processing', SUCCESS: 'success', FAILED: 'error' };

const FirmwarePage: React.FC = () => {
  const [data, setData] = useState<FirmwareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');

  const [deviceDrawerOpen, setDeviceDrawerOpen] = useState(false);
  const [currentFirmwareId, setCurrentFirmwareId] = useState<number>(0);
  const [deviceFwData, setDeviceFwData] = useState<DeviceFwItem[]>([]);
  const [deviceFwTotal, setDeviceFwTotal] = useState(0);

  const [bindOpen, setBindOpen] = useState(false);
  const [bindForm] = Form.useForm();

  // 设备列表用于选择和显示
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);

  // 构建设备ID到名称的映射
  const deviceMap = useMemo(() => {
    const map: Record<number, DeviceOption> = {};
    deviceOptions.forEach(d => { map[d.id] = d; });
    return map;
  }, [deviceOptions]);

  // 根据设备ID获取显示名称
  const getDeviceDisplay = (id: number, deviceName?: string) => {
    if (deviceName) return deviceName;
    const device = deviceMap[id];
    return device ? device.deviceName : `#${id}`;
  };

  // 加载设备列表
  const fetchDevices = useCallback(async () => {
    try {
      const res = await deviceApi.list({ pageSize: 500 });
      const records = res.data.data?.records || [];
      setDeviceOptions(records.map((d: DeviceOption) => ({ id: d.id, deviceName: d.deviceName, productId: d.productId })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await firmwareApi.list({ ...params, keyword: keyword || undefined });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch { message.error('加载失败'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [params.pageNum, params.pageSize]);

  const openDevices = async (firmwareId: number) => {
    setCurrentFirmwareId(firmwareId);
    setDeviceDrawerOpen(true);
    try {
      const res = await deviceFirmwareApi.listByFirmware(firmwareId, { pageNum: 1, pageSize: 50 });
      const page = res.data.data;
      setDeviceFwData(page.records || []);
      setDeviceFwTotal(page.total || 0);
    } catch { message.error('加载设备固件失败'); }
  };

  const handleBind = async (values: Record<string, unknown>) => {
    try {
      await deviceFirmwareApi.bind({ ...values, firmwareId: currentFirmwareId });
      message.success('绑定成功');
      setBindOpen(false);
      bindForm.resetFields();
      openDevices(currentFirmwareId);
    } catch { message.error('绑定失败'); }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const columns: ColumnsType<FirmwareItem> = [
    { title: '版本号', dataIndex: 'version', width: 120 },
    { title: '名称', dataIndex: 'displayName', width: 180 },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusColors[v]}>{statusLabels[v] || v}</Tag> },
    { title: '文件大小', dataIndex: 'fileSize', width: 100, render: (v: number) => formatSize(v) },
    { title: 'MD5', dataIndex: 'md5Checksum', width: 160, ellipsis: true },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    {
      title: '操作', width: 150, fixed: 'right',
      render: (_: unknown, record: FirmwareItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<UsbOutlined />} onClick={() => openDevices(record.id)}>设备</Button>
        </Space>
      ),
    },
  ];

  const deviceFwColumns: ColumnsType<DeviceFwItem> = [
    { title: '设备名称', width: 140, render: (_: unknown, record: DeviceFwItem) => getDeviceDisplay(record.deviceId, record.deviceName) },
    { title: '当前版本', dataIndex: 'currentVersion', width: 120 },
    { title: '目标版本', dataIndex: 'targetVersion', width: 120, render: (v: string) => v || '-' },
    { title: '升级状态', dataIndex: 'upgradeStatus', width: 100, render: (v: string) => <Tag color={upgradeColors[v]}>{v}</Tag> },
    { title: '进度', dataIndex: 'upgradeProgress', width: 120, render: (v: number, r: DeviceFwItem) => r.upgradeStatus !== 'IDLE' ? <Progress percent={v} size="small" /> : '-' },
    { title: '上次升级', dataIndex: 'lastUpgradeAt', width: 170, render: (v: string) => v || '-' },
  ];

  return (
    <div>
      <PageHeader title="固件管理" extra={<Input.Search placeholder="搜索版本号/名称" allowClear style={{ width: 220 }} onSearch={(v) => { setKeyword(v); setParams({ ...params, pageNum: 1 }); fetchData(); }} />} />

      <Table rowKey="id" columns={columns} dataSource={data} loading={loading} size="small" scroll={{ x: 1100 }} style={{ marginTop: 16 }}
        pagination={{ current: params.pageNum, pageSize: params.pageSize, total, showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (page: number, size: number) => setParams({ pageNum: page, pageSize: size }) }} />

      <Drawer title="固件关联设备" open={deviceDrawerOpen} onClose={() => setDeviceDrawerOpen(false)} width={720}
        extra={<Button type="primary" icon={<LinkOutlined />} size="small" onClick={() => { bindForm.resetFields(); setBindOpen(true); }}>绑定设备</Button>}>
        <Table rowKey="id" columns={deviceFwColumns} dataSource={deviceFwData} size="small"
          pagination={{ total: deviceFwTotal, pageSize: 50 }} />
      </Drawer>

      <Modal title="绑定设备固件" open={bindOpen} onCancel={() => setBindOpen(false)} onOk={() => bindForm.submit()} destroyOnClose width={400}>
        <Form form={bindForm} layout="vertical" onFinish={handleBind}>
          <Form.Item name="deviceId" label="选择设备" rules={[{ required: true, message: '请选择设备' }]}>
            <Select
              placeholder="请选择设备"
              showSearch
              optionFilterProp="label"
              options={deviceOptions.map(d => ({ value: d.id, label: d.deviceName }))}
            />
          </Form.Item>
          <Form.Item name="version" label="当前版本" rules={[{ required: true }]}><Input placeholder="如: 1.0.0" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FirmwarePage;
