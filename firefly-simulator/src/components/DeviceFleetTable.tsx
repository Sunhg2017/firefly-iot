import { useMemo, useState } from 'react';
import {
  Badge, Button, Dropdown, Empty, Modal, Progress, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CopyOutlined, DeleteOutlined, DisconnectOutlined, EditOutlined,
  EyeOutlined, LinkOutlined, MoreOutlined, PlusOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useSimStore, type SimDevice } from '../store';
import { connectDevices, disconnectDevices, removeDevices } from '../utils/fleetOps';
import BulkCreateDevicesDrawer from './BulkCreateDevicesDrawer';

const { Text } = Typography;

interface DeviceFleetTableProps {
  devices: SimDevice[];
  loading?: boolean;
  onOpenDevice: (deviceId: string) => void;
  onEdit: (deviceId: string) => void;
  onClone: (device: SimDevice) => void;
  onRemove: (device: SimDevice) => Promise<void> | void;
}

const STATUS_META: Record<string, { label: string; color: 'default' | 'processing' | 'success' | 'error'; badge: 'default' | 'processing' | 'success' | 'error' }> = {
  offline: { label: '离线', color: 'default', badge: 'default' },
  connecting: { label: '连接中', color: 'processing', badge: 'processing' },
  online: { label: '在线', color: 'success', badge: 'success' },
  error: { label: '异常', color: 'error', badge: 'error' },
};

const PROTOCOL_COLORS: Record<string, string> = {
  HTTP: 'blue', MQTT: 'green', CoAP: 'orange', Video: 'purple', SNMP: 'cyan',
  Modbus: 'geekblue', WebSocket: 'volcano', TCP: 'magenta', UDP: 'lime', LoRaWAN: 'gold',
};

function describeIdentity(device: SimDevice): string {
  if (device.protocol === 'SNMP') {
    return `SNMP ${device.snmpHost || '-'}:${device.snmpPort || '-'} (${device.snmpVersion === 3 ? 'v3' : device.snmpVersion === 1 ? 'v1' : 'v2c'})`;
  }
  if (device.protocol === 'Modbus') {
    return `Modbus ${device.modbusHost || '-'}:${device.modbusPort || '-'} / Slave ${device.modbusSlaveId || '-'}`;
  }
  if (device.protocol === 'WebSocket') {
    return device.productKey && device.deviceName ? `${device.productKey} / ${device.deviceName}` : (device.wsEndpoint || '未配置地址');
  }
  if (device.protocol === 'TCP') {
    return device.productKey && device.deviceName ? `${device.productKey} / ${device.deviceName}` : `${device.tcpHost || '-'}:${device.tcpPort || '-'}`;
  }
  if (device.protocol === 'UDP') {
    return device.productKey && device.deviceName ? `${device.productKey} / ${device.deviceName}` : `${device.udpHost || '-'}:${device.udpPort || '-'}`;
  }
  if (device.protocol === 'LoRaWAN') {
    return device.loraDevEui || '未配置 DevEUI';
  }
  return `${device.productKey || '-'} / ${device.deviceName || '-'}`;
}

export default function DeviceFleetTable({
  devices, loading, onOpenDevice, onEdit, onClone, onRemove,
}: DeviceFleetTableProps) {
  const addLog = useSimStore((state) => state.addLog);
  const allDevices = useSimStore((state) => state.devices);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [progress, setProgress] = useState<{ title: string; current: number; total: number } | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  const selectedDevices = useMemo(
    () => allDevices.filter((device) => selectedKeys.includes(device.id)),
    [allDevices, selectedKeys],
  );
  const selectedOnline = selectedDevices.filter((device) => device.status === 'online');
  const selectedOffline = selectedDevices.filter((device) => device.status !== 'online');

  const runBulk = async (
    title: string,
    ids: string[],
    action: (ids: string[]) => Promise<{ succeeded: number; failed: number; errors: Array<{ deviceName: string; message: string }> }>,
  ) => {
    if (ids.length === 0) {
      message.warning('请先勾选设备');
      return;
    }
    setProgress({ title, current: 0, total: ids.length });
    try {
      const result = await action(ids);
      if (result.failed > 0) {
        Modal.warning({
          title: `${title}完成，部分失败`,
          content: (
            <Space direction="vertical" size={4}>
              <Text>成功 {result.succeeded} 台，失败 {result.failed} 台。</Text>
              {result.errors.slice(0, 8).map((item) => (
                <Text key={`${item.deviceName}-${item.message}`} type="secondary" style={{ fontSize: 12 }}>
                  {item.deviceName}：{item.message}
                </Text>
              ))}
            </Space>
          ),
        });
      } else {
        message.success(`${title}完成：${result.succeeded} 台`);
      }
      addLog('system', title, 'info', `${title}完成：成功 ${result.succeeded}，失败 ${result.failed}`);
      setSelectedKeys([]);
    } finally {
      setProgress(null);
    }
  };

  const handleBulkDelete = () => {
    if (selectedDevices.length === 0) {
      message.warning('请先勾选设备');
      return;
    }
    Modal.confirm({
      title: `删除 ${selectedDevices.length} 台模拟设备？`,
      content: '删除会先断开连接并清理动态注册；设备配置将从本地移除，不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      onOk: () => runBulk('批量删除', selectedKeys.map(String), (ids) => removeDevices(ids)),
    });
  };

  const columns: ColumnsType<SimDevice> = [
    {
      title: '设备',
      dataIndex: 'name',
      width: 220,
      fixed: 'left',
      render: (_value, record) => (
        <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
          <Button type="link" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={() => onOpenDevice(record.id)}>
            {record.name}
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.nickname || '-'}</Text>
        </Space>
      ),
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      width: 100,
      render: (value: string) => <Tag color={PROTOCOL_COLORS[value] || 'default'}>{value}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: keyof typeof STATUS_META) => {
        const meta = STATUS_META[value] || STATUS_META.offline;
        return <Badge status={meta.badge} text={meta.label} />;
      },
    },
    {
      title: '接入标识',
      width: 260,
      render: (_value, record) => (
        <Text type="secondary" ellipsis={{ tooltip: describeIdentity(record) }} style={{ maxWidth: 250 }}>
          {describeIdentity(record)}
        </Text>
      ),
    },
    {
      title: '发送 / 错误',
      width: 120,
      render: (_value, record) => (
        <Space size={6}>
          <Text>{record.sentCount}</Text>
          <Text type={record.errorCount > 0 ? 'danger' : 'secondary'}>/ {record.errorCount}</Text>
        </Space>
      ),
    },
    {
      title: '自动上报',
      dataIndex: 'autoReport',
      width: 110,
      render: (value: boolean, record) => (
        <Tag color={value ? 'processing' : 'default'}>
          {value ? `每 ${record.autoIntervalSec}s` : '关闭'}
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 220,
      fixed: 'right',
      render: (_value, record) => (
        <Space size={2}>
          <Tooltip title={record.status === 'online' ? '断开连接' : '连接设备'}>
            <Button
              type="link"
              size="small"
              icon={record.status === 'online' ? <DisconnectOutlined /> : <LinkOutlined />}
              loading={rowBusyId === record.id}
              onClick={() => {
                setRowBusyId(record.id);
                const action = record.status === 'online' ? disconnectDevices([record.id]) : connectDevices([record.id]);
                void action.then((result) => {
                  if (result.failed > 0) {
                    message.error(result.errors[0]?.message || '操作失败');
                  }
                }).finally(() => setRowBusyId(null));
              }}
            >
              {record.status === 'online' ? '断开' : '连接'}
            </Button>
          </Tooltip>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onOpenDevice(record.id)}>详情</Button>
          <Dropdown
            menu={{
              items: [
                { key: 'edit', label: '编辑配置', icon: <EditOutlined />, onClick: () => onEdit(record.id) },
                { key: 'clone', label: '复制设备', icon: <CopyOutlined />, onClick: () => onClone(record) },
                { type: 'divider' },
                {
                  key: 'delete',
                  label: '删除设备',
                  danger: true,
                  icon: <DeleteOutlined />,
                  onClick: () => Modal.confirm({
                    title: `删除模拟设备「${record.name}」？`,
                    content: '删除会先断开连接并清理动态注册；本地配置将移除，不可恢复。',
                    okText: '删除',
                    okButtonProps: { danger: true },
                    onOk: () => onRemove(record),
                  }),
                },
              ],
            }}
          >
            <Button type="link" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <Space wrap>
          <Text strong>已选 {selectedKeys.length} 台</Text>
          <Button
            size="small"
            icon={<LinkOutlined />}
            disabled={selectedOffline.length === 0}
            onClick={() => void runBulk('批量连接', selectedOffline.map((device) => device.id), (ids) => connectDevices(ids, { concurrency: 8 }))}
          >
            批量连接
          </Button>
          <Button
            size="small"
            icon={<DisconnectOutlined />}
            disabled={selectedOnline.length === 0}
            onClick={() => void runBulk('批量断开', selectedOnline.map((device) => device.id), (ids) => disconnectDevices(ids, { concurrency: 8 }))}
          >
            批量断开
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} disabled={selectedKeys.length === 0} onClick={handleBulkDelete}>
            批量删除
          </Button>
        </Space>
        <Space wrap>
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setBulkCreateOpen(true)}>
            批量创建
          </Button>
          <Tooltip title="压测中心可对选中设备直接发起压力测试">
            <Button size="small" icon={<ThunderboltOutlined />} disabled={selectedKeys.length === 0} onClick={() => {
              window.dispatchEvent(new CustomEvent('sim:open-stress', { detail: { deviceIds: selectedKeys.map(String) } }));
            }}>
              用所选设备压测
            </Button>
          </Tooltip>
        </Space>
      </div>

      <Table<SimDevice>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={devices}
        scroll={{ x: 1100 }}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys, preserveSelectedRowKeys: true }}
        pagination={{
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: [20, 50, 100, 200],
          showTotal: (total) => `共 ${total} 台`,
          onChange: (_page, size) => setPageSize(size),
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无模拟设备，先单台新建或批量创建设备"
            />
          ),
        }}
      />

      <BulkCreateDevicesDrawer
        open={bulkCreateOpen}
        onClose={() => setBulkCreateOpen(false)}
        onCreated={(ids) => setSelectedKeys(ids)}
      />

      <Modal open={Boolean(progress)} footer={null} closable={false} title={progress?.title || '处理中'}>
        <Progress
          percent={progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}
          status="active"
        />
        <Text type="secondary">
          {progress ? `${progress.current}/${progress.total}` : ''}
        </Text>
      </Modal>
    </>
  );
}
