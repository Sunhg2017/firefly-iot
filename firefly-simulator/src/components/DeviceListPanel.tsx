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
  buildMqttServiceTopic,
  dynamicRegisterDevice,
  resolveMqttIdentity,
  shouldCleanupDynamicRegistration,
  shouldDynamicRegister,
  shouldRetryDynamicRegisterAfterFailure,
  unregisterDynamicDevice,
  validateMqttDevice,
} from '../utils/mqtt';
import { getDeviceAccessMissingFields, getDeviceAccessValidationError } from '../utils/deviceAccess';

const { Search } = Input;
const { Paragraph, Text, Title } = Typography;

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

const STATUS_COLOR: Record<string, 'default' | 'processing' | 'success' | 'error'> = {
  offline: 'default',
  connecting: 'processing',
  online: 'success',
  error: 'error',
};

const STATUS_META: Record<string, { label: string; accent: string }> = {
  offline: { label: '离线', accent: '#64748b' },
  connecting: { label: '连接中', accent: '#38bdf8' },
  online: { label: '在线', accent: '#22c55e' },
  error: { label: '异常', accent: '#f87171' },
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

const OVERVIEW_META = [
  { key: 'total', title: '设备总数', color: '#f59e0b', background: 'linear-gradient(135deg, rgba(245,158,11,0.20), rgba(251,191,36,0.05))' },
  { key: 'online', title: '在线设备', color: '#22c55e', background: 'linear-gradient(135deg, rgba(34,197,94,0.20), rgba(74,222,128,0.05))' },
  { key: 'offline', title: '离线设备', color: '#64748b', background: 'linear-gradient(135deg, rgba(100,116,139,0.22), rgba(148,163,184,0.06))' },
  { key: 'error', title: '异常设备', color: '#ef4444', background: 'linear-gradient(135deg, rgba(239,68,68,0.20), rgba(248,113,113,0.05))' },
] as const;

function getDeviceSubtitle(device: SimDevice) {
  if (device.protocol === 'HTTP' || device.protocol === 'CoAP' || device.protocol === 'MQTT') {
    const missing = getDeviceAccessMissingFields(device);
    if (missing.length > 0) {
      return `待补充 ${missing.join(' / ')}`;
    }
    return `${device.productKey || '-'} / ${device.deviceName || '-'}`;
  }
  if (device.protocol === 'Video') {
    return device.streamMode === 'GB28181' ? device.gbDeviceId || '未设置国标设备 ID' : device.rtspUrl || '未设置 RTSP 地址';
  }
  if (device.protocol === 'SNMP') {
    return `${device.snmpHost || '-'}:${device.snmpPort || '-'}`;
  }
  if (device.protocol === 'Modbus') {
    return `${device.modbusHost || '-'}:${device.modbusPort || '-'}`;
  }
  if (device.protocol === 'WebSocket') {
    return device.wsEndpoint || '未设置 WebSocket 地址';
  }
  if (device.protocol === 'TCP') {
    return `${device.tcpHost || '-'}:${device.tcpPort || '-'}`;
  }
  if (device.protocol === 'UDP') {
    return `${device.udpHost || '-'}:${device.udpPort || '-'}`;
  }
  if (device.protocol === 'LoRaWAN') {
    return device.loraDevEui || '未设置 DevEUI';
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

async function refreshDynamicRegistrationSecret(device: SimDevice) {
  const registerResult = await dynamicRegisterDevice(device, getDynamicRegisterBaseUrl(device));
  useSimStore.getState().updateDevice(device.id, {
    deviceSecret: registerResult.deviceSecret,
    dynamicRegistered: true,
  });
  return {
    ...device,
    deviceSecret: registerResult.deviceSecret,
    dynamicRegistered: true,
  };
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
        message.warning('导入文件里没有可识别的设备记录');
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
        if (device.protocol === 'MQTT') await window.electronAPI.mqttDisconnect(device.id);
        if (device.protocol === 'WebSocket') await window.electronAPI.wsDisconnect(device.id);
        if (device.protocol === 'TCP') await window.electronAPI.tcpDisconnect(device.id);
        if (device.protocol === 'Video' && device.streamMode === 'GB28181') await window.electronAPI.sipStop(device.id);
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
    const { updateDevice } = useSimStore.getState();
    let ok = 0;
    let fail = 0;

    for (const device of connectable) {
      try {
        updateDevice(device.id, { status: 'connecting' });

        const accessError = getDeviceAccessValidationError(device);
        if (accessError) {
          updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
          addLog(device.id, device.name, 'warn', accessError);
          fail += 1;
          continue;
        }

        if (device.protocol === 'HTTP') {
          let target = device;
          if (shouldDynamicRegister(device)) {
            const registerResult = await dynamicRegisterDevice(device, device.httpRegisterBaseUrl);
            target = { ...device, deviceSecret: registerResult.deviceSecret };
            updateDevice(device.id, { deviceSecret: registerResult.deviceSecret, dynamicRegistered: true });
            addLog(device.id, device.name, 'success', `HTTP 动态注册成功：${registerResult.deviceName}`);
          }
          let result = await window.electronAPI.httpAuth(target.httpBaseUrl, target.productKey, target.deviceName, target.deviceSecret);
          if ((!result.success || !result.data?.token) && shouldRetryDynamicRegisterAfterFailure(target, result)) {
            addLog(device.id, device.name, 'warn', 'HTTP auth failed with cached DeviceSecret, retrying dynamic registration');
            try {
              target = await refreshDynamicRegistrationSecret(target);
              result = await window.electronAPI.httpAuth(target.httpBaseUrl, target.productKey, target.deviceName, target.deviceSecret);
            } catch (retryError: any) {
              addLog(device.id, device.name, 'warn', `Dynamic registration retry failed: ${retryError?.message || 'unknown error'}`);
            }
          }
          if (result.success && result.data?.token) {
            updateDevice(device.id, { status: 'online', token: result.data.token, restoreOnLaunch: true });
            addLog(device.id, device.name, 'success', 'HTTP 批量连接成功');
            ok += 1;
          } else {
            updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
            addLog(device.id, device.name, 'error', `HTTP 批量连接失败：${result.message || result.msg || JSON.stringify(result)}`);
            fail += 1;
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
            updateDevice(device.id, { status: 'online', token: result.data.token, restoreOnLaunch: true });
            addLog(device.id, device.name, 'success', 'CoAP 批量连接成功');
            ok += 1;
          } else {
            updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
            addLog(device.id, device.name, 'error', `CoAP 批量连接失败：${result.message || result.msg || JSON.stringify(result)}`);
            fail += 1;
          }
          continue;
        }

        const validationError = validateMqttDevice(device);
        if (validationError) throw new Error(validationError);

        let target = device;
        if (shouldDynamicRegister(device)) {
          const registerResult = await dynamicRegisterDevice(device, device.mqttRegisterBaseUrl);
          target = { ...device, deviceSecret: registerResult.deviceSecret };
          updateDevice(device.id, { deviceSecret: registerResult.deviceSecret, dynamicRegistered: true });
          addLog(device.id, device.name, 'success', `动态注册成功：${registerResult.deviceName}`);
        }

        let identity = resolveMqttIdentity(target);
        const mqttOpts: any = { clean: target.mqttClean, keepalive: target.mqttKeepalive || 60 };
        if (target.mqttWillTopic) {
          mqttOpts.willTopic = target.mqttWillTopic;
          mqttOpts.willPayload = target.mqttWillPayload || '';
          mqttOpts.willQos = target.mqttWillQos ?? 1;
          mqttOpts.willRetain = target.mqttWillRetain ?? false;
        }

        let result = await window.electronAPI.mqttConnect(
          target.id,
          target.mqttBrokerUrl,
          identity.clientId,
          identity.username,
          identity.password,
          mqttOpts,
        );
        if (!result.success && shouldRetryDynamicRegisterAfterFailure(target, result)) {
          addLog(target.id, target.name, 'warn', 'MQTT connect failed with cached DeviceSecret, retrying dynamic registration');
          try {
            target = await refreshDynamicRegistrationSecret(target);
            identity = resolveMqttIdentity(target);
            result = await window.electronAPI.mqttConnect(
              target.id,
              target.mqttBrokerUrl,
              identity.clientId,
              identity.username,
              identity.password,
              mqttOpts,
            );
          } catch (retryError: any) {
            addLog(target.id, target.name, 'warn', `Dynamic registration retry failed: ${retryError?.message || 'unknown error'}`);
          }
        }
        if (result.success) {
          updateDevice(target.id, { status: 'online', restoreOnLaunch: true });
          const serviceTopic = buildMqttServiceTopic(target);
          if (serviceTopic) {
            await window.electronAPI.mqttSubscribe(target.id, serviceTopic, 1);
          }
          addLog(target.id, target.name, 'success', 'MQTT 批量连接成功');
          ok += 1;
        } else {
          updateDevice(target.id, { status: 'error', restoreOnLaunch: false });
          addLog(target.id, target.name, 'error', `MQTT 批量连接失败：${result.message}`);
          fail += 1;
        }
      } catch (error: any) {
        updateDevice(device.id, { status: 'error', restoreOnLaunch: false });
        addLog(device.id, device.name, 'error', `批量连接异常：${error?.message || 'unknown error'}`);
        fail += 1;
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
      updateDevice(device.id, { status: 'offline', autoReport: false, autoTimerId: null, token: '', restoreOnLaunch: false });
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

  const quickStats = OVERVIEW_META.map((item) => ({
    ...item,
    value: stats[item.key],
  }));

  return (
    <>
      <div style={{ padding: 18, borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <Title level={4} style={{ margin: 0, color: '#f8fafc', fontFamily: 'Georgia, Times New Roman, serif' }}>
                设备管理器
              </Title>
              <Paragraph style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 12 }}>
                用更清晰的目录视图管理模拟设备、连接状态和协议分布。
              </Paragraph>
            </div>
            <Space size={6}>
              <Tooltip title="导入 JSON / CSV 模拟设备配置">
                <Button size="small" icon={<ImportOutlined />} onClick={handleBatchImport} />
              </Tooltip>
              <Tooltip title="导出当前模拟设备配置">
                <Button size="small" icon={<ExportOutlined />} onClick={handleExport} disabled={devices.length === 0} />
              </Tooltip>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
                新建
              </Button>
            </Space>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {quickStats.map((item) => (
              <div
                key={item.key}
                style={{
                  padding: '12px 12px 10px',
                  borderRadius: 18,
                  border: '1px solid rgba(148,163,184,0.12)',
                  background: item.background,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
              >
                <Text style={{ color: '#94a3b8', fontSize: 11 }}>{item.title}</Text>
                <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 18,
              border: '1px solid rgba(148,163,184,0.12)',
              background: 'linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(7,13,24,0.92) 100%)',
            }}
          >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              <Search
                placeholder="按名称 / ProductKey / DeviceName 搜索"
                value={searchKey}
                onChange={(event) => setSearchKey(event.target.value)}
                allowClear
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Select
                  size="small"
                  value={filterProto}
                  onChange={setFilterProto}
                  style={{ flex: 1 }}
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
                  style={{ flex: 1 }}
                  options={[
                    { label: '全部状态', value: 'all' },
                    { label: '在线', value: 'online' },
                    { label: '离线', value: 'offline' },
                    { label: '异常', value: 'error' },
                  ]}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  type="text"
                  icon={<ApiOutlined />}
                  onClick={handleBatchConnect}
                  loading={batchConnecting}
                  disabled={stats.offline === 0 || batchConnecting}
                  style={{ color: '#4ade80', paddingInline: 4 }}
                >
                  全部连接
                </Button>
                <Button
                  size="small"
                  type="text"
                  icon={<DisconnectOutlined />}
                  onClick={handleBatchDisconnect}
                  disabled={stats.online === 0}
                  style={{ color: '#f87171', paddingInline: 4 }}
                >
                  全部断开
                </Button>
                {(filterProto !== 'all' || filterStatus !== 'all' || searchKey) ? (
                  <Button
                    size="small"
                    type="link"
                    style={{ padding: 0, color: '#cbd5e1' }}
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
                <Text type="secondary" style={{ fontSize: 11 }}>
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
            <div style={{ padding: '40px 12px 24px' }}>
              <Empty
                description={searchKey || filterProto !== 'all' || filterStatus !== 'all' ? '没有匹配的模拟设备' : '先创建一个模拟设备开始联调'}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </div>
          ),
        }}
        style={{ padding: '12px 12px 0', overflow: 'auto', flex: 1 }}
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
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: '100%',
                  padding: '14px 14px 12px',
                  borderRadius: 20,
                  border: selected ? '1px solid rgba(96,165,250,0.45)' : '1px solid rgba(148,163,184,0.10)',
                  background: selected
                    ? 'linear-gradient(135deg, rgba(30,64,175,0.28), rgba(14,23,38,0.96))'
                    : 'linear-gradient(180deg, rgba(15,23,42,0.74) 0%, rgba(8,15,29,0.92) 100%)',
                  boxShadow: selected ? '0 12px 30px rgba(30,64,175,0.18)' : '0 8px 24px rgba(0,0,0,0.16)',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      background: `linear-gradient(135deg, ${statusMeta.accent}22 0%, rgba(255,255,255,0.04) 100%)`,
                      border: `1px solid ${statusMeta.accent}33`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: statusMeta.accent,
                      fontWeight: 700,
                    }}
                  >
                    {device.protocol.slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Space size={8} wrap>
                        <Space size={6}>
                          <Badge status={STATUS_COLOR[device.status]} />
                          <Text strong style={{ fontSize: 14, color: '#f8fafc' }}>
                            {device.name}
                          </Text>
                        </Space>
                        <Tag color={PROTOCOL_COLORS[device.protocol] || 'default'} style={{ margin: 0 }}>
                          {device.protocol}
                        </Tag>
                        <Tag style={{ margin: 0, borderColor: `${statusMeta.accent}55`, color: statusMeta.accent, background: `${statusMeta.accent}12` }}>
                          {statusMeta.label}
                        </Tag>
                      </Space>
                      <Space size={2}>
                        <Tooltip title="复制设备">
                          <Button type="text" size="small" icon={<CopyOutlined />} onClick={(event) => { event.stopPropagation(); handleClone(device); }} />
                        </Tooltip>
                        <Popconfirm title="确认删除当前模拟设备吗？" onConfirm={() => handleRemove(device)}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(event) => event.stopPropagation()} />
                        </Popconfirm>
                      </Space>
                    </div>
                    <Paragraph
                      ellipsis={{ rows: 1 }}
                      style={{ margin: '8px 0 10px', color: '#94a3b8', fontSize: 12 }}
                    >
                      {getDeviceSubtitle(device)}
                    </Paragraph>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <Space size={12} wrap>
                        <Text type="secondary" style={{ fontSize: 11 }}>已发送 {device.sentCount}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>错误 {device.errorCount}</Text>
                        {device.autoReport ? <Tag color="processing" style={{ margin: 0 }}>自动上报中</Tag> : null}
                      </Space>
                      {selected ? <Text style={{ fontSize: 11, color: '#93c5fd' }}>当前选中</Text> : null}
                    </div>
                  </div>
                </div>
              </div>
            </List.Item>
          );
        }}
      />

      <AddDeviceModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
