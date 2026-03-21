import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Empty,
  Input,
  List,
  Popconfirm,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApiOutlined,
  CopyOutlined,
  DeleteOutlined,
  DisconnectOutlined,
  ExportOutlined,
  ImportOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Protocol, SimDevice, useSimStore } from '../store';
import AddDeviceModal from './AddDeviceModal';
import {
  shouldCleanupDynamicRegistration,
  unregisterDynamicDevice,
} from '../utils/mqtt';
import { getDeviceAccessMissingFields } from '../utils/deviceAccess';
import { connectSimDevice, disconnectSimDevice } from '../utils/runtime';

const { Search } = Input;
const { Paragraph, Text, Title } = Typography;

const STATUS_COLOR: Record<string, 'default' | 'processing' | 'success' | 'error'> = {
  offline: 'default',
  connecting: 'processing',
  online: 'success',
  error: 'error',
};

const STATUS_META: Record<string, { label: string; accent: string; background: string }> = {
  offline: { label: '离线', accent: '#64748b', background: '#f8fafc' },
  connecting: { label: '连接中', accent: '#0ea5e9', background: '#f0f9ff' },
  online: { label: '在线', accent: '#16a34a', background: '#f0fdf4' },
  error: { label: '异常', accent: '#ef4444', background: '#fef2f2' },
};

const PROTOCOL_COLORS: Record<string, string> = {
  HTTP: 'blue',
  MQTT: 'green',
  CoAP: 'orange',
  Video: 'purple',
  SNMP: 'cyan',
  Modbus: 'geekblue',
  WebSocket: 'volcano',
  TCP: 'magenta',
  UDP: 'lime',
  LoRaWAN: 'gold',
};

const PROTOCOL_OPTIONS = [
  { label: '全部协议', value: 'all' },
  { label: 'HTTP', value: 'HTTP' },
  { label: 'MQTT', value: 'MQTT' },
  { label: 'CoAP', value: 'CoAP' },
  { label: 'Video', value: 'Video' },
  { label: 'SNMP', value: 'SNMP' },
  { label: 'Modbus', value: 'Modbus' },
  { label: 'WebSocket', value: 'WebSocket' },
  { label: 'TCP', value: 'TCP' },
  { label: 'UDP', value: 'UDP' },
  { label: 'LoRaWAN', value: 'LoRaWAN' },
];

const STATUS_OPTIONS = [
  { label: '全部状态', value: 'all' },
  { label: '在线', value: 'online' },
  { label: '离线', value: 'offline' },
  { label: '异常', value: 'error' },
];

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((item) => item.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] || '';
    });
    return row;
  });
}

function getDeviceSubtitle(device: SimDevice) {
  if (device.protocol === 'HTTP' || device.protocol === 'CoAP' || device.protocol === 'MQTT') {
    const missing = getDeviceAccessMissingFields(device);
    if (missing.length > 0) {
      return `待补齐 ${missing.join(' / ')}`;
    }
    return `${device.productKey || '-'} / ${device.deviceName || '-'}`;
  }
  if (device.protocol === 'Video') {
    return device.streamMode === 'GB28181'
      ? device.gbDeviceId || '未配置国标设备 ID'
      : device.rtspUrl || '未配置 RTSP 地址';
  }
  if (device.protocol === 'SNMP') {
    return `${device.snmpHost || '-'}:${device.snmpPort || '-'}`;
  }
  if (device.protocol === 'Modbus') {
    return `${device.modbusHost || '-'}:${device.modbusPort || '-'}`;
  }
  if (device.protocol === 'WebSocket') {
    return device.wsEndpoint || '未配置 WebSocket 地址';
  }
  if (device.protocol === 'TCP') {
    return `${device.tcpHost || '-'}:${device.tcpPort || '-'}`;
  }
  if (device.protocol === 'UDP') {
    return `${device.udpHost || '-'}:${device.udpPort || '-'}`;
  }
  if (device.protocol === 'LoRaWAN') {
    return device.loraDevEui || '未配置 DevEUI';
  }
  return '等待配置接入参数';
}

function getDynamicRegisterBaseUrl(device: SimDevice): string | undefined {
  if (device.protocol === 'HTTP') {
    return device.httpRegisterBaseUrl;
  }
  if (device.protocol === 'MQTT') {
    return device.mqttRegisterBaseUrl;
  }
  return undefined;
}

export default function DeviceListPanel() {
  const { devices, selectedDeviceId, selectDevice, removeDevice, addLog } = useSimStore();
  const [addOpen, setAddOpen] = useState(false);
  const [filterProto, setFilterProto] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchKey, setSearchKey] = useState('');
  const [batchConnecting, setBatchConnecting] = useState(false);

  const filteredDevices = useMemo(() => {
    let list = devices;
    if (filterProto !== 'all') list = list.filter((item) => item.protocol === filterProto);
    if (filterStatus !== 'all') list = list.filter((item) => item.status === filterStatus);
    if (searchKey.trim()) {
      const keyword = searchKey.trim().toLowerCase();
      list = list.filter((item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.productKey.toLowerCase().includes(keyword) ||
        item.deviceName.toLowerCase().includes(keyword),
      );
    }
    return list;
  }, [devices, filterProto, filterStatus, searchKey]);

  const stats = useMemo(
    () => ({
      total: devices.length,
      online: devices.filter((item) => item.status === 'online').length,
      offline: devices.filter((item) => item.status === 'offline').length,
      error: devices.filter((item) => item.status === 'error').length,
    }),
    [devices],
  );

  const handleExport = async () => {
    if (devices.length === 0) {
      message.warning('当前没有可导出的模拟设备');
      return;
    }

    const exportData = devices.map((device) => ({
      name: device.name,
      nickname: device.nickname,
      protocol: device.protocol,
      productKey: device.productKey,
      productSecret: device.productSecret,
      httpAuthMode: device.httpAuthMode,
      httpRegisterBaseUrl: device.httpRegisterBaseUrl,
      deviceName: device.deviceName,
      deviceSecret: device.deviceSecret,
      openApiBaseUrl: device.openApiBaseUrl,
      openApiAccessKey: device.openApiAccessKey,
      openApiSecretKey: device.openApiSecretKey,
      httpBaseUrl: device.httpBaseUrl,
      coapBaseUrl: device.coapBaseUrl,
      mqttAuthMode: device.mqttAuthMode,
      mqttRegisterBaseUrl: device.mqttRegisterBaseUrl,
      mqttBrokerUrl: device.mqttBrokerUrl,
      mqttClientId: device.mqttClientId,
      mqttUsername: device.mqttUsername,
      mqttPassword: device.mqttPassword,
      mqttClean: device.mqttClean,
      mqttKeepalive: device.mqttKeepalive,
      mqttWillTopic: device.mqttWillTopic,
      mqttWillPayload: device.mqttWillPayload,
      mqttWillQos: device.mqttWillQos,
      mqttWillRetain: device.mqttWillRetain,
      thingModelSimulationRules: device.thingModelSimulationRules,
      ...(device.protocol === 'Video'
        ? {
            mediaBaseUrl: device.mediaBaseUrl,
            streamMode: device.streamMode,
            gbDeviceId: device.gbDeviceId,
            gbDomain: device.gbDomain,
            rtspUrl: device.rtspUrl,
            streamUrl: device.streamUrl,
            sipServerIp: device.sipServerIp,
            sipServerPort: device.sipServerPort,
            sipServerId: device.sipServerId,
            sipLocalPort: device.sipLocalPort,
            sipKeepaliveInterval: device.sipKeepaliveInterval,
            sipPassword: device.sipPassword,
            sipTransport: device.sipTransport,
            sipChannels: device.sipChannels,
          }
        : {}),
      ...(device.protocol === 'SNMP'
        ? {
            snmpConnectorUrl: device.snmpConnectorUrl,
            snmpHost: device.snmpHost,
            snmpPort: device.snmpPort,
            snmpVersion: device.snmpVersion,
            snmpCommunity: device.snmpCommunity,
          }
        : {}),
      ...(device.protocol === 'Modbus'
        ? {
            modbusConnectorUrl: device.modbusConnectorUrl,
            modbusHost: device.modbusHost,
            modbusPort: device.modbusPort,
            modbusSlaveId: device.modbusSlaveId,
            modbusMode: device.modbusMode,
          }
        : {}),
      ...(device.protocol === 'WebSocket'
        ? {
            wsConnectorUrl: device.wsConnectorUrl,
            wsEndpoint: device.wsEndpoint,
            wsDeviceId: device.wsDeviceId,
            wsProductId: device.wsProductId,
            wsTenantId: device.wsTenantId,
          }
        : {}),
      ...(device.protocol === 'TCP' ? { tcpHost: device.tcpHost, tcpPort: device.tcpPort } : {}),
      ...(device.protocol === 'UDP' ? { udpHost: device.udpHost, udpPort: device.udpPort } : {}),
      ...(device.protocol === 'LoRaWAN'
        ? {
            loraWebhookUrl: device.loraWebhookUrl,
            loraDevEui: device.loraDevEui,
            loraAppId: device.loraAppId,
            loraFPort: device.loraFPort,
          }
        : {}),
    }));

    const result = await window.electronAPI.fileExport(JSON.stringify(exportData, null, 2), 'devices.json');
    if (result.success) {
      addLog('system', 'System', 'success', `已导出 ${devices.length} 台模拟设备到 ${result.filePath}`);
      message.success(`已导出 ${devices.length} 台模拟设备`);
    } else if (result.message !== 'canceled') {
      message.error(`导出失败：${result.message}`);
    }
  };

  const handleBatchImport = async () => {
    const result = await window.electronAPI.fileImport();
    if (!result.success) {
      if (result.message !== 'canceled') {
        message.error(`导入失败：${result.message}`);
      }
      return;
    }

    try {
      let rows: Record<string, string>[] = [];
      if (result.ext === '.json') {
        const parsed = JSON.parse(result.content || '[]');
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        rows = parseCSV(result.content || '');
      }

      if (rows.length === 0) {
        message.warning('导入文件中没有可识别的设备记录');
        return;
      }

      let count = 0;
      for (const row of rows) {
        const protocol = (row.protocol || 'HTTP').toUpperCase() as Protocol;
        useSimStore.getState().addDevice({
          nickname: row.nickname || row.name || row.deviceName || '',
          name: row.name || row.deviceName || `导入设备 ${count + 1}`,
          protocol,
          httpBaseUrl: row.httpBaseUrl || row.baseUrl || 'http://localhost:9070',
          httpAuthMode: (row.httpAuthMode as never) || 'DEVICE_SECRET',
          httpRegisterBaseUrl: row.httpRegisterBaseUrl || row.httpBaseUrl || row.baseUrl || 'http://localhost:9070',
          productKey: row.productKey || '',
          productSecret: row.productSecret || '',
          deviceName: row.deviceName || '',
          deviceSecret: row.deviceSecret || '',
          openApiBaseUrl: row.openApiBaseUrl || 'http://localhost:8080',
          openApiAccessKey: row.openApiAccessKey || '',
          openApiSecretKey: row.openApiSecretKey || '',
          mqttAuthMode: (row.mqttAuthMode as never) || 'DEVICE_SECRET',
          mqttRegisterBaseUrl: row.mqttRegisterBaseUrl || 'http://localhost:9070',
          mqttBrokerUrl: row.mqttBrokerUrl || 'mqtt://localhost:1883',
          mqttClientId: row.mqttClientId || row.clientId || '',
          mqttUsername: row.mqttUsername || row.username || '',
          mqttPassword: row.mqttPassword || row.password || '',
          coapBaseUrl: row.coapBaseUrl || row.baseUrl || 'http://localhost:9070',
          snmpConnectorUrl: row.snmpConnectorUrl || 'http://localhost:9070',
          snmpHost: row.snmpHost || '',
          snmpPort: Number(row.snmpPort) || 161,
          snmpVersion: Number(row.snmpVersion) || 2,
          snmpCommunity: row.snmpCommunity || 'public',
          modbusConnectorUrl: row.modbusConnectorUrl || 'http://localhost:9070',
          modbusHost: row.modbusHost || '',
          modbusPort: Number(row.modbusPort) || 502,
          modbusSlaveId: Number(row.modbusSlaveId) || 1,
          modbusMode: (row.modbusMode as never) || 'TCP',
          wsConnectorUrl: row.wsConnectorUrl || 'http://localhost:9070',
          wsEndpoint: row.wsEndpoint || 'ws://localhost:9070/ws/device',
          wsDeviceId: row.wsDeviceId || '',
          wsProductId: row.wsProductId || '',
          wsTenantId: row.wsTenantId || '',
          tcpHost: row.tcpHost || 'localhost',
          tcpPort: Number(row.tcpPort) || 8900,
          udpHost: row.udpHost || 'localhost',
          udpPort: Number(row.udpPort) || 8901,
          loraWebhookUrl: row.loraWebhookUrl || 'http://localhost:9070/api/v1/lorawan/webhook/up',
          loraDevEui: row.loraDevEui || '',
          loraAppId: row.loraAppId || '',
          loraFPort: Number(row.loraFPort) || 1,
          thingModelSimulationRules: (row as unknown as { thingModelSimulationRules?: SimDevice['thingModelSimulationRules'] }).thingModelSimulationRules || {},
        });
        count += 1;
      }

      addLog('system', 'System', 'success', `已从 ${result.filePath} 导入 ${count} 台模拟设备`);
      message.success(`已导入 ${count} 台模拟设备`);
    } catch (error: any) {
      addLog('system', 'System', 'error', `导入解析失败：${error.message}`);
      message.error(`导入解析失败：${error.message}`);
    }
  };

  const handleRemove = async (device: SimDevice) => {
    try {
      if (device.status === 'online') {
        await disconnectSimDevice(device.id, { silent: true });
      }
      if (device.autoTimerId) clearInterval(device.autoTimerId);
      if (shouldCleanupDynamicRegistration(device)) {
        await unregisterDynamicDevice(device, getDynamicRegisterBaseUrl(device));
        addLog(device.id, device.name, 'success', `已同步删除平台设备：${device.deviceName}`);
      }
      removeDevice(device.id);
      addLog('system', 'System', 'info', `已移除模拟设备：${device.name}`);
    } catch (error: any) {
      const messageText = error?.message || 'unknown error';
      addLog(device.id, device.name, 'error', `删除设备失败：${messageText}`);
      message.error(`删除失败：${messageText}`);
    }
  };

  const handleBatchConnect = async () => {
    const connectable = devices.filter(
      (device) =>
        device.status === 'offline' &&
        device.protocol !== 'Video' &&
        device.protocol !== 'SNMP' &&
        device.protocol !== 'Modbus' &&
        device.protocol !== 'WebSocket' &&
        device.protocol !== 'TCP' &&
        device.protocol !== 'UDP' &&
        device.protocol !== 'LoRaWAN',
    );
    if (connectable.length === 0) {
      message.info('当前没有可批量连接的离线 HTTP / CoAP / MQTT 设备');
      return;
    }

    setBatchConnecting(true);
    addLog('system', 'System', 'info', `开始批量连接 ${connectable.length} 台模拟设备`);
    let ok = 0;
    let fail = 0;
    for (const target of connectable) {
      const result = await connectSimDevice(target.id, { silent: true });
      if (result.success) {
        addLog(target.id, target.name, 'success', `${target.protocol} 批量连接成功`);
        ok += 1;
      } else {
        fail += 1;
      }
    }
    setBatchConnecting(false);
    addLog('system', 'System', 'success', `批量连接完成：成功 ${ok}，失败 ${fail}`);
    message.success(`批量连接完成：成功 ${ok}，失败 ${fail}`);
  };

  const handleBatchDisconnect = async () => {
    const onlineDevices = devices.filter((item) => item.status === 'online');
    if (onlineDevices.length === 0) {
      message.info('当前没有在线设备');
      return;
    }

    for (const target of onlineDevices) {
      await disconnectSimDevice(target.id, { silent: true });
    }
    addLog('system', 'System', 'info', `已断开 ${onlineDevices.length} 台模拟设备`);
    message.success(`已断开 ${onlineDevices.length} 台模拟设备`);
  };

  const handleClone = (device: SimDevice) => {
    useSimStore.getState().addDevice({
      ...device,
      nickname: device.nickname || device.name,
      name: `${device.name}（副本）`,
      deviceSecret: device.mqttAuthMode === 'PRODUCT_SECRET' ? '' : device.deviceSecret,
      mqttClientId: '',
      mqttUsername: '',
      mqttPassword: '',
      dynamicRegistered: false,
      restoreOnLaunch: false,
    } as never);
    addLog('system', 'System', 'info', `已复制模拟设备：${device.name}`);
    message.success(`已复制 ${device.name}`);
  };

  useEffect(() => {
    const onAdd = () => setAddOpen(true);
    const onBatchConnect = () => {
      void handleBatchConnect();
    };
    const onBatchDisconnect = () => {
      void handleBatchDisconnect();
    };
    window.addEventListener('sim:add-device', onAdd);
    window.addEventListener('sim:batch-connect', onBatchConnect);
    window.addEventListener('sim:batch-disconnect', onBatchDisconnect);
    return () => {
      window.removeEventListener('sim:add-device', onAdd);
      window.removeEventListener('sim:batch-connect', onBatchConnect);
      window.removeEventListener('sim:batch-disconnect', onBatchDisconnect);
    };
  }, [devices]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 20, borderBottom: '1px solid rgba(226,232,240,0.9)' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <Title
                level={4}
                style={{
                  margin: 0,
                  color: '#0f172a',
                  fontFamily: '"Noto Serif SC", "Source Han Serif SC", Georgia, serif',
                }}
              >
                设备列表
              </Title>
              <Paragraph style={{ margin: '6px 0 0', color: '#64748b', fontSize: 12 }}>
                搜索或筛选后，点击设备卡片进入主工作区。
              </Paragraph>
            </div>
            <Space size={8} wrap>
              <Tooltip title="导入 JSON / CSV 模拟设备配置">
                <Button size="small" icon={<ImportOutlined />} onClick={handleBatchImport}>
                  导入
                </Button>
              </Tooltip>
              <Tooltip title="导出当前模拟设备配置">
                <Button size="small" icon={<ExportOutlined />} onClick={handleExport} disabled={devices.length === 0}>
                  导出
                </Button>
              </Tooltip>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
                新建
              </Button>
            </Space>
          </div>

          <Space size={[8, 8]} wrap>
            <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 12, background: '#eff6ff', borderColor: '#dbeafe', color: '#1d4ed8' }}>
              共 {stats.total} 台
            </Tag>
            <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 12, background: '#f0fdf4', borderColor: '#dcfce7', color: '#15803d' }}>
              在线 {stats.online}
            </Tag>
            <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 12, background: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' }}>
              离线 {stats.offline}
            </Tag>
            <Tag style={{ margin: 0, borderRadius: 999, paddingInline: 12, background: '#fef2f2', borderColor: '#fee2e2', color: '#dc2626' }}>
              异常 {stats.error}
            </Tag>
          </Space>

          <div
            style={{
              padding: 14,
              borderRadius: 22,
              border: '1px solid rgba(226,232,240,0.92)',
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
            }}
          >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Search
                placeholder="按名称 / ProductKey / DeviceName 搜索"
                value={searchKey}
                onChange={(event) => setSearchKey(event.target.value)}
                allowClear
              />
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <Select size="small" value={filterProto} onChange={setFilterProto} options={PROTOCOL_OPTIONS} />
                <Select size="small" value={filterStatus} onChange={setFilterStatus} options={STATUS_OPTIONS} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  icon={<ApiOutlined />}
                  onClick={handleBatchConnect}
                  loading={batchConnecting}
                  disabled={stats.offline === 0 || batchConnecting}
                >
                  批量连接
                </Button>
                <Button
                  size="small"
                  icon={<DisconnectOutlined />}
                  onClick={handleBatchDisconnect}
                  disabled={stats.online === 0}
                >
                  批量断开
                </Button>
                {(filterProto !== 'all' || filterStatus !== 'all' || searchKey) ? (
                  <Button
                    size="small"
                    type="link"
                    style={{ paddingInline: 4 }}
                    onClick={() => {
                      setFilterProto('all');
                      setFilterStatus('all');
                      setSearchKey('');
                    }}
                  >
                    重置筛选
                  </Button>
                ) : null}
                <div style={{ flex: 1 }} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当前可见 {filteredDevices.length} 台
                </Text>
              </div>
            </Space>
          </div>
        </Space>
      </div>

      <List
        dataSource={filteredDevices}
        locale={{
          emptyText: (
            <div style={{ padding: '48px 12px 28px' }}>
              <Empty
                description={searchKey || filterProto !== 'all' || filterStatus !== 'all' ? '没有匹配的模拟设备' : '先创建一台模拟设备开始联调'}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ),
        }}
        style={{ padding: '14px 14px 0', overflow: 'auto', flex: 1, minHeight: 0 }}
        renderItem={(device) => {
          const selected = selectedDeviceId === device.id;
          const statusMeta = STATUS_META[device.status];
          return (
            <List.Item
              key={device.id}
              onClick={() => selectDevice(device.id)}
              style={{
                cursor: 'pointer',
                padding: 0,
                border: 'none',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  width: '100%',
                  padding: '16px 16px 14px',
                  borderRadius: 24,
                  border: selected ? '1px solid rgba(96,165,250,0.50)' : '1px solid rgba(226,232,240,0.92)',
                  background: selected
                    ? 'linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(248,251,255,1) 100%)'
                    : 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
                  boxShadow: selected ? '0 18px 40px rgba(59,130,246,0.12)' : '0 10px 26px rgba(15,23,42,0.05)',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 16,
                      background: `linear-gradient(135deg, ${statusMeta.accent}18 0%, #ffffff 100%)`,
                      border: `1px solid ${statusMeta.accent}33`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: statusMeta.accent,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {device.protocol.slice(0, 2)}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Space size={8} wrap>
                        <Space size={6}>
                          <Badge status={STATUS_COLOR[device.status]} />
                          <Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                            {device.name}
                          </Text>
                        </Space>
                        <Tag color={PROTOCOL_COLORS[device.protocol] || 'default'} style={{ margin: 0 }}>
                          {device.protocol}
                        </Tag>
                        <Tag
                          style={{
                            margin: 0,
                            borderColor: `${statusMeta.accent}33`,
                            color: statusMeta.accent,
                            background: statusMeta.background,
                          }}
                        >
                          {statusMeta.label}
                        </Tag>
                      </Space>

                      <Space size={2}>
                        <Tooltip title="复制设备">
                          <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleClone(device);
                            }}
                          />
                        </Tooltip>
                        <Popconfirm title="确认删除当前模拟设备吗？" onConfirm={() => handleRemove(device)}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(event) => event.stopPropagation()} />
                        </Popconfirm>
                      </Space>
                    </div>

                    <Paragraph
                      ellipsis={{ rows: 1 }}
                      style={{ margin: '8px 0 12px', color: '#64748b', fontSize: 12 }}
                    >
                      {getDeviceSubtitle(device)}
                    </Paragraph>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <Space size={12} wrap>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          已发送 {device.sentCount}
                        </Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          错误 {device.errorCount}
                        </Text>
                        {device.autoReport ? (
                          <Tag color="processing" style={{ margin: 0 }}>
                            自动上报中
                          </Tag>
                        ) : null}
                      </Space>
                      {selected ? <Text style={{ fontSize: 11, color: '#2563eb' }}>当前选中</Text> : null}
                    </div>
                  </div>
                </div>
              </div>
            </List.Item>
          );
        }}
      />

      <AddDeviceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
