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
      message.warning('No devices to export');
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
      addLog('system', 'System', 'success', `Exported ${devices.length} devices to ${result.filePath}`);
      message.success(`Exported ${devices.length} devices`);
    } else if (result.message !== 'canceled') {
      message.error(`Export failed: ${result.message}`);
    }
  };

  const handleBatchImport = async () => {
    const result = await window.electronAPI.fileImport();
    if (!result.success) {
      if (result.message !== 'canceled') message.error(`Import failed: ${result.message}`);
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
        message.warning('No device rows found');
        return;
      }

      let count = 0;
      for (const row of rows) {
        const protocol = (row.protocol || 'HTTP').toUpperCase() as Protocol;
        useSimStore.getState().addDevice({
          name: row.name || row.deviceName || `Imported Device ${count + 1}`,
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

      addLog('system', 'System', 'success', `Imported ${count} devices from ${result.filePath}`);
      message.success(`Imported ${count} devices`);
    } catch (error: any) {
      addLog('system', 'System', 'error', `Import parse failed: ${error.message}`);
      message.error(`Import parse failed: ${error.message}`);
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
    addLog('system', 'System', 'info', `Removed device: ${device.name}`);
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
      message.info('No offline HTTP/CoAP/MQTT devices to connect');
      return;
    }

    setBatchConnecting(true);
    addLog('system', 'System', 'info', `Batch connect started: ${connectable.length} devices`);
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
            addLog(device.id, device.name, 'success', 'HTTP connected in batch');
            ok++;
          } else {
            updateDevice(device.id, { status: 'error' });
            addLog(device.id, device.name, 'error', `HTTP batch connect failed: ${result.message || result.msg || JSON.stringify(result)}`);
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
            addLog(device.id, device.name, 'success', 'CoAP connected in batch');
            ok++;
          } else {
            updateDevice(device.id, { status: 'error' });
            addLog(device.id, device.name, 'error', `CoAP batch connect failed: ${result.message || result.msg || JSON.stringify(result)}`);
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
          addLog(device.id, device.name, 'success', `Dynamic registration succeeded: ${registerResult.deviceName}`);
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
          addLog(target.id, target.name, 'success', 'MQTT connected in batch');
          ok++;
        } else {
          updateDevice(target.id, { status: 'error' });
          addLog(target.id, target.name, 'error', `MQTT batch connect failed: ${result.message}`);
          fail++;
        }
      } catch (error: any) {
        updateDevice(device.id, { status: 'error' });
        addLog(device.id, device.name, 'error', `Batch connect error: ${error?.message || 'unknown error'}`);
        fail++;
      }
    }

    setBatchConnecting(false);
    addLog('system', 'System', 'success', `Batch connect finished: success=${ok}, failed=${fail}`);
    message.success(`Batch connect finished: success ${ok}, failed ${fail}`);
  };

  const handleBatchDisconnect = async () => {
    const onlineDevices = devices.filter((device) => device.status === 'online');
    if (onlineDevices.length === 0) {
      message.info('No online devices');
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
    addLog('system', 'System', 'info', `Disconnected ${onlineDevices.length} devices`);
    message.success(`Disconnected ${onlineDevices.length} devices`);
  };

  const handleClone = (device: SimDevice) => {
    useSimStore.getState().addDevice({
      ...device,
      name: `${device.name} (Copy)`,
      deviceSecret: device.mqttAuthMode === 'PRODUCT_SECRET' ? '' : device.deviceSecret,
      mqttClientId: '',
      mqttUsername: '',
      mqttPassword: '',
    } as any);
    addLog('system', 'System', 'info', `Cloned device: ${device.name}`);
    message.success(`Cloned ${device.name}`);
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
          Devices <Text type="secondary" style={{ fontSize: 11 }}>({devices.length})</Text>
        </Title>
        <Space size={4}>
          <Tooltip title="Batch import JSON/CSV">
            <Button size="small" icon={<ImportOutlined />} onClick={handleBatchImport} />
          </Tooltip>
          <Tooltip title="Export device configuration">
            <Button size="small" icon={<ExportOutlined />} onClick={handleExport} disabled={devices.length === 0} />
          </Tooltip>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add</Button>
        </Space>
      </div>

      {devices.length > 0 && (
        <div style={{ padding: '0 12px 6px', display: 'flex', gap: 4, alignItems: 'center' }}>
          <Tooltip title={`Connect offline HTTP/CoAP/MQTT devices (${offlineCount})`}>
            <Button size="small" type="text" icon={<ApiOutlined />} onClick={handleBatchConnect} loading={batchConnecting} disabled={offlineCount === 0 || batchConnecting} style={{ color: '#52c41a' }}>
              Connect all
            </Button>
          </Tooltip>
          <Tooltip title={`Disconnect all online devices (${onlineCount})`}>
            <Button size="small" type="text" icon={<DisconnectOutlined />} onClick={handleBatchDisconnect} disabled={onlineCount === 0} style={{ color: '#ff4d4f' }}>
              Disconnect all
            </Button>
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 10 }}>{onlineCount} online / {offlineCount} offline</Text>
        </div>
      )}

      {devices.length > 0 && (
        <div style={{ padding: '0 12px 6px' }}>
          <Input size="small" placeholder="Search by name / product / device" value={searchKey} onChange={(event) => setSearchKey(event.target.value)} allowClear style={{ marginBottom: 4 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Select
              size="small"
              value={filterProto}
              onChange={setFilterProto}
              style={{ width: 110 }}
              options={[
                { label: 'All protocols', value: 'all' },
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
                { label: 'All status', value: 'all' },
                { label: 'Online', value: 'online' },
                { label: 'Offline', value: 'offline' },
                { label: 'Error', value: 'error' },
              ]}
            />
            {(filterProto !== 'all' || filterStatus !== 'all' || searchKey) && (
              <Button size="small" type="link" style={{ padding: 0 }} onClick={() => { setFilterProto('all'); setFilterStatus('all'); setSearchKey(''); }}>
                Reset
              </Button>
            )}
          </div>
        </div>
      )}

      <List
        dataSource={filteredDevices}
        locale={{ emptyText: <Empty description={searchKey || filterProto !== 'all' || filterStatus !== 'all' ? 'No matching devices' : 'No devices'} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
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
              <Tooltip key="clone" title="Clone device">
                <Button type="text" size="small" icon={<CopyOutlined />} onClick={(event) => { event.stopPropagation(); handleClone(device); }} />
              </Tooltip>,
              <Popconfirm key="delete" title="Delete this device?" onConfirm={() => handleRemove(device)}>
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
                  <Text type="secondary" style={{ fontSize: 11 }}>sent {device.sentCount}</Text>
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
