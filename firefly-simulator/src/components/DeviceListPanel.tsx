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
import { buildMqttServiceTopic, dynamicRegisterDevice, resolveMqttIdentity, validateMqttDevice } from '../utils/mqtt';

const { Text, Title } = Typography;

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((item) => item.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => { row[header] = cols[index] || ''; });
    return row;
  });
}

const STATUS_COLOR: Record<string, 'default' | 'processing' | 'success' | 'error'> = {
  offline: 'default',
  connecting: 'processing',
  online: 'success',
  error: 'error',
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

  const handleExport = async () => {
    if (devices.length === 0) {
      message.warning('当前没有可导出的模拟设备');
      return;
    }

    const exportData = devices.map((device) => ({
      name: device.name,
      protocol: device.protocol,
      productKey: device.productKey,
      productSecret: device.productSecret,
      deviceName: device.deviceName,
      deviceSecret: device.deviceSecret,
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
      ...(device.protocol === 'Video' ? {
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
      } : {}),
      ...(device.protocol === 'SNMP' ? {
        snmpConnectorUrl: device.snmpConnectorUrl,
        snmpHost: device.snmpHost,
        snmpPort: device.snmpPort,
        snmpVersion: device.snmpVersion,
        snmpCommunity: device.snmpCommunity,
      } : {}),
      ...(device.protocol === 'Modbus' ? {
        modbusConnectorUrl: device.modbusConnectorUrl,
        modbusHost: device.modbusHost,
        modbusPort: device.modbusPort,
        modbusSlaveId: device.modbusSlaveId,
        modbusMode: device.modbusMode,
      } : {}),
      ...(device.protocol === 'WebSocket' ? {
        wsConnectorUrl: device.wsConnectorUrl,
        wsEndpoint: device.wsEndpoint,
        wsDeviceId: device.wsDeviceId,
        wsProductId: device.wsProductId,
        wsTenantId: device.wsTenantId,
      } : {}),
      ...(device.protocol === 'TCP' ? { tcpHost: device.tcpHost, tcpPort: device.tcpPort } : {}),
      ...(device.protocol === 'UDP' ? { udpHost: device.udpHost, udpPort: device.udpPort } : {}),
      ...(device.protocol === 'LoRaWAN' ? {
        loraWebhookUrl: device.loraWebhookUrl,
        loraDevEui: device.loraDevEui,
        loraAppId: device.loraAppId,
        loraFPort: device.loraFPort,
      } : {}),
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
      if (result.message !== 'canceled') message.error(`导入失败：${result.message}`);
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
        message.warning('导入文件里没有可识别的设备记录');
        return;
      }

      let count = 0;
      for (const row of rows) {
        const protocol = (row.protocol || 'HTTP').toUpperCase() as Protocol;
        useSimStore.getState().addDevice({
          name: row.name || row.deviceName || `导入设备 ${count + 1}`,
          protocol,
          httpBaseUrl: row.httpBaseUrl || row.baseUrl || 'http://localhost:9070',
          productKey: row.productKey || '',
          productSecret: row.productSecret || '',
          deviceName: row.deviceName || '',
          deviceSecret: row.deviceSecret || '',
          mqttAuthMode: (row.mqttAuthMode as any) || 'DEVICE_SECRET',
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
          modbusMode: (row.modbusMode as any) || 'TCP',
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
        });
        count++;
      }

      addLog('system', 'System', 'success', `已从 ${result.filePath} 导入 ${count} 台模拟设备`);
      message.success(`已导入 ${count} 台模拟设备`);
    } catch (error: any) {
      addLog('system', 'System', 'error', `导入解析失败：${error.message}`);
      message.error(`导入解析失败：${error.message}`);
    }
  };

  const handleRemove = async (device: SimDevice) => {
    if (device.status === 'online') {
      if (device.protocol === 'MQTT') await window.electronAPI.mqttDisconnect(device.id);
      if (device.protocol === 'WebSocket') await window.electronAPI.wsDisconnect(device.id);
      if (device.protocol === 'TCP') await window.electronAPI.tcpDisconnect(device.id);
      if (device.protocol === 'Video' && device.streamMode === 'GB28181') await window.electronAPI.sipStop(device.id);
    }
    if (device.autoTimerId) clearInterval(device.autoTimerId);
    removeDevice(device.id);
    addLog('system', 'System', 'info', `已移除模拟设备：${device.name}`);
  };

  const handleBatchConnect = async () => {
    const connectable = devices.filter((device) =>
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
    const { updateDevice } = useSimStore.getState();
    let ok = 0;
    let fail = 0;

    for (const device of connectable) {
      try {
        updateDevice(device.id, { status: 'connecting' });

        if (device.protocol === 'HTTP') {
          const result = await window.electronAPI.httpAuth(device.httpBaseUrl, device.productKey, device.deviceName, device.deviceSecret);
          if (result.success && result.data?.token) {
            updateDevice(device.id, { status: 'online', token: result.data.token });
            addLog(device.id, device.name, 'success', 'HTTP 批量连接成功');
            ok++;
          } else {
            updateDevice(device.id, { status: 'error' });
            addLog(device.id, device.name, 'error', `HTTP 批量连接失败：${result.message || result.msg || JSON.stringify(result)}`);
            fail++;
          }
          continue;
        }

        if (device.protocol === 'CoAP') {
          const result = await window.electronAPI.coapAuth(device.coapBaseUrl, {
            productKey: device.productKey,
            deviceName: device.deviceName,
            deviceSecret: device.deviceSecret,
          });
          if (result.success && result.data?.token) {
            updateDevice(device.id, { status: 'online', token: result.data.token });
            addLog(device.id, device.name, 'success', 'CoAP 批量连接成功');
            ok++;
          } else {
            updateDevice(device.id, { status: 'error' });
            addLog(device.id, device.name, 'error', `CoAP 批量连接失败：${result.message || result.msg || JSON.stringify(result)}`);
            fail++;
          }
          continue;
        }

        const validationError = validateMqttDevice(device);
        if (validationError) throw new Error(validationError);

        let target = device;
        if (device.mqttAuthMode === 'PRODUCT_SECRET') {
          const registerResult = await dynamicRegisterDevice(device);
          target = { ...device, deviceSecret: registerResult.deviceSecret };
          updateDevice(device.id, { deviceSecret: registerResult.deviceSecret });
          addLog(device.id, device.name, 'success', `动态注册成功：${registerResult.deviceName}`);
        }

        const identity = resolveMqttIdentity(target);
        const mqttOpts: any = { clean: target.mqttClean, keepalive: target.mqttKeepalive || 60 };
        if (target.mqttWillTopic) {
          mqttOpts.willTopic = target.mqttWillTopic;
          mqttOpts.willPayload = target.mqttWillPayload || '';
          mqttOpts.willQos = target.mqttWillQos ?? 1;
          mqttOpts.willRetain = target.mqttWillRetain ?? false;
        }

        const result = await window.electronAPI.mqttConnect(
          target.id,
          target.mqttBrokerUrl,
          identity.clientId,
          identity.username,
          identity.password,
          mqttOpts,
        );
        if (result.success) {
          updateDevice(target.id, { status: 'online' });
          const serviceTopic = buildMqttServiceTopic(target);
          if (serviceTopic) await window.electronAPI.mqttSubscribe(target.id, serviceTopic, 1);
          addLog(target.id, target.name, 'success', 'MQTT 批量连接成功');
          ok++;
        } else {
          updateDevice(target.id, { status: 'error' });
          addLog(target.id, target.name, 'error', `MQTT 批量连接失败：${result.message}`);
          fail++;
        }
      } catch (error: any) {
        updateDevice(device.id, { status: 'error' });
        addLog(device.id, device.name, 'error', `批量连接异常：${error?.message || 'unknown error'}`);
        fail++;
      }
    }

    setBatchConnecting(false);
    addLog('system', 'System', 'success', `批量连接完成：成功 ${ok}，失败 ${fail}`);
    message.success(`批量连接完成：成功 ${ok}，失败 ${fail}`);
  };

  const handleBatchDisconnect = async () => {
    const onlineDevices = devices.filter((device) => device.status === 'online');
    if (onlineDevices.length === 0) {
      message.info('当前没有在线设备');
      return;
    }

    const { updateDevice } = useSimStore.getState();
    for (const device of onlineDevices) {
      if (device.autoTimerId) clearInterval(device.autoTimerId);
      if (device.protocol === 'MQTT') await window.electronAPI.mqttDisconnect(device.id);
      if (device.protocol === 'WebSocket') await window.electronAPI.wsDisconnect(device.id);
      if (device.protocol === 'TCP') await window.electronAPI.tcpDisconnect(device.id);
      if (device.protocol === 'Video' && device.streamMode === 'GB28181') await window.electronAPI.sipStop(device.id);
      updateDevice(device.id, { status: 'offline', autoReport: false, autoTimerId: null, token: '' });
    }
    addLog('system', 'System', 'info', `已断开 ${onlineDevices.length} 台模拟设备`);
    message.success(`已断开 ${onlineDevices.length} 台模拟设备`);
  };

  const handleClone = (device: SimDevice) => {
    useSimStore.getState().addDevice({
      ...device,
      name: `${device.name}（副本）`,
      deviceSecret: device.mqttAuthMode === 'PRODUCT_SECRET' ? '' : device.deviceSecret,
      mqttClientId: '',
      mqttUsername: '',
      mqttPassword: '',
    } as any);
    addLog('system', 'System', 'info', `已复制模拟设备：${device.name}`);
    message.success(`已复制 ${device.name}`);
  };

  useEffect(() => {
    const onAdd = () => setAddOpen(true);
    const onBatchConnect = () => { void handleBatchConnect(); };
    const onBatchDisconnect = () => { void handleBatchDisconnect(); };
    window.addEventListener('sim:add-device', onAdd);
    window.addEventListener('sim:batch-connect', onBatchConnect);
    window.addEventListener('sim:batch-disconnect', onBatchDisconnect);
    return () => {
      window.removeEventListener('sim:add-device', onAdd);
      window.removeEventListener('sim:batch-connect', onBatchConnect);
      window.removeEventListener('sim:batch-disconnect', onBatchDisconnect);
    };
  }, [devices]);

  const onlineCount = devices.filter((device) => device.status === 'online').length;
  const offlineCount = devices.filter((device) => device.status === 'offline').length;

  return (
    <>
      <div style={{ padding: '16px 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={5} style={{ margin: 0, color: '#e0e0e0' }}>
          模拟设备 <Text type="secondary" style={{ fontSize: 11 }}>({devices.length})</Text>
        </Title>
        <Space size={4}>
          <Tooltip title="导入 JSON / CSV 模拟设备配置">
            <Button size="small" icon={<ImportOutlined />} onClick={handleBatchImport} />
          </Tooltip>
          <Tooltip title="导出当前模拟设备配置">
            <Button size="small" icon={<ExportOutlined />} onClick={handleExport} disabled={devices.length === 0} />
          </Tooltip>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>新建</Button>
        </Space>
      </div>

      {devices.length > 0 && (
        <div style={{ padding: '0 12px 6px', display: 'flex', gap: 4, alignItems: 'center' }}>
          <Tooltip title={`连接离线 HTTP / CoAP / MQTT 设备（${offlineCount} 台）`}>
            <Button size="small" type="text" icon={<ApiOutlined />} onClick={handleBatchConnect} loading={batchConnecting} disabled={offlineCount === 0 || batchConnecting} style={{ color: '#52c41a' }}>
              全部连接
            </Button>
          </Tooltip>
          <Tooltip title={`断开全部在线设备（${onlineCount} 台）`}>
            <Button size="small" type="text" icon={<DisconnectOutlined />} onClick={handleBatchDisconnect} disabled={onlineCount === 0} style={{ color: '#ff4d4f' }}>
              全部断开
            </Button>
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 10 }}>{onlineCount} 在线 / {offlineCount} 离线</Text>
        </div>
      )}

      {devices.length > 0 && (
        <div style={{ padding: '0 12px 6px' }}>
          <Input size="small" placeholder="按名称 / ProductKey / DeviceName 搜索" value={searchKey} onChange={(event) => setSearchKey(event.target.value)} allowClear style={{ marginBottom: 4 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Select
              size="small"
              value={filterProto}
              onChange={setFilterProto}
              style={{ width: 110 }}
              options={[
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
              ]}
            />
            <Select
              size="small"
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: 110 }}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '在线', value: 'online' },
                { label: '离线', value: 'offline' },
                { label: '异常', value: 'error' },
              ]}
            />
            {(filterProto !== 'all' || filterStatus !== 'all' || searchKey) && (
              <Button size="small" type="link" style={{ padding: 0 }} onClick={() => { setFilterProto('all'); setFilterStatus('all'); setSearchKey(''); }}>
                重置
              </Button>
            )}
          </div>
        </div>
      )}

      <List
        dataSource={filteredDevices}
        locale={{ emptyText: <Empty description={searchKey || filterProto !== 'all' || filterStatus !== 'all' ? '没有匹配的模拟设备' : '暂无模拟设备'} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        style={{ padding: '0 8px', overflow: 'auto', flex: 1 }}
        renderItem={(device) => (
          <List.Item
            onClick={() => selectDevice(device.id)}
            style={{
              cursor: 'pointer',
              padding: '8px 12px',
              borderRadius: 6,
              marginBottom: 4,
              background: selectedDeviceId === device.id ? 'rgba(79,70,229,0.15)' : 'transparent',
              border: selectedDeviceId === device.id ? '1px solid rgba(79,70,229,0.3)' : '1px solid transparent',
            }}
            actions={[
              <Tooltip key="clone" title="复制设备">
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={(event) => { event.stopPropagation(); handleClone(device); }} />
              </Tooltip>,
              <Popconfirm key="delete" title="确认删除当前模拟设备吗？" onConfirm={() => handleRemove(device)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(event) => event.stopPropagation()} />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={(
                <Space size={6}>
                  <Badge status={STATUS_COLOR[device.status]} />
                  <Text style={{ fontSize: 13 }}>{device.name}</Text>
                </Space>
              )}
              description={(
                <Space size={4} wrap>
                  <Tag color={PROTOCOL_COLORS[device.protocol] || 'default'} style={{ fontSize: 11 }}>{device.protocol}</Tag>
                  {(device.productKey || device.deviceName) && (
                    <Text type="secondary" style={{ fontSize: 11 }}>{device.productKey || '-'} / {device.deviceName || '-'}</Text>
                  )}
                  <Text type="secondary" style={{ fontSize: 11 }}>已发送 {device.sentCount}</Text>
                </Space>
              )}
            />
          </List.Item>
        )}
      />

      <AddDeviceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
