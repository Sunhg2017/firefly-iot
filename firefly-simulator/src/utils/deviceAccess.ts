import type { SimDevice } from '../store';
import { validateMqttDevice } from './mqtt';
import { getVideoSourceFieldLabel, isProxyVideoMode, normalizeVideoStreamMode, parseVideoSourceUrl } from './video';

export interface AccessOverviewItem {
  label: string;
  value: string;
  highlight?: boolean;
}

function trim(value?: string | null): string {
  return (value ?? '').trim();
}

function maskSecret(value?: string | null): string {
  const text = trim(value);
  if (!text) return '未配置';
  if (text.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
}

function translateMqttValidation(error: string): string {
  switch (error) {
    case 'MQTT broker URL is required':
      return 'MQTT 缺少 Broker 地址';
    case 'Product Key is required':
      return 'MQTT 缺少 ProductKey';
    case 'Device Name is required':
      return 'MQTT 缺少 DeviceName';
    case 'Product Secret is required for dynamic registration':
      return 'MQTT 一型一密缺少 ProductSecret';
    case 'Device Secret is required for MQTT auth':
      return 'MQTT 一机一密缺少 DeviceSecret';
    default:
      return error;
  }
}

export function getDeviceAccessMissingFields(device: SimDevice): string[] {
  switch (device.protocol) {
    case 'HTTP': {
      const missing: string[] = [];
      if (!trim(device.httpBaseUrl)) missing.push('服务地址');
      if (!trim(device.productKey)) missing.push('ProductKey');
      if (!trim(device.deviceName)) missing.push('DeviceName');
      if ((device.httpAuthMode || 'DEVICE_SECRET') === 'PRODUCT_SECRET') {
        if (!trim(device.httpRegisterBaseUrl)) missing.push('动态注册地址');
        if (!trim(device.productSecret)) missing.push('ProductSecret');
      } else if (!trim(device.deviceSecret)) {
        missing.push('DeviceSecret');
      }
      return missing;
    }
    case 'CoAP': {
      const missing: string[] = [];
      if (!trim(device.coapBaseUrl)) missing.push('Bridge 地址');
      if (!trim(device.productKey)) missing.push('ProductKey');
      if (!trim(device.deviceName)) missing.push('DeviceName');
      if (!trim(device.deviceSecret)) missing.push('DeviceSecret');
      return missing;
    }
    case 'MQTT': {
      const missing: string[] = [];
      if (!trim(device.mqttBrokerUrl)) missing.push('Broker 地址');
      if (!trim(device.productKey)) missing.push('ProductKey');
      if (!trim(device.deviceName)) missing.push('DeviceName');
      if (device.mqttAuthMode === 'PRODUCT_SECRET') {
        if (!trim(device.productSecret)) missing.push('ProductSecret');
      } else if (!trim(device.mqttPassword) && !trim(device.deviceSecret)) {
        missing.push('DeviceSecret');
      }
      return missing;
    }
    case 'SNMP': {
      const missing: string[] = [];
      if (!trim(device.snmpConnectorUrl)) missing.push('Connector 地址');
      if (!trim(device.snmpHost)) missing.push('目标主机');
      return missing;
    }
    case 'Modbus': {
      const missing: string[] = [];
      if (!trim(device.modbusConnectorUrl)) missing.push('Connector 地址');
      if (!trim(device.modbusHost)) missing.push('目标主机');
      return missing;
    }
    case 'WebSocket':
      return trim(device.wsEndpoint) ? [] : ['WebSocket 地址'];
    case 'TCP':
      return trim(device.tcpHost) ? [] : ['TCP 主机'];
    case 'UDP':
      return trim(device.udpHost) ? [] : ['UDP 主机'];
    case 'LoRaWAN': {
      const missing: string[] = [];
      if (!trim(device.loraWebhookUrl)) missing.push('Webhook 地址');
      if (!trim(device.loraDevEui)) missing.push('DevEUI');
      return missing;
    }
    case 'Video': {
      const missing: string[] = [];
      if (!trim(device.productKey)) missing.push('ProductKey');
      if (!trim(device.mediaBaseUrl)) missing.push('媒体服务地址');
      if (!trim(device.deviceName)) missing.push('DeviceName');
      if (normalizeVideoStreamMode(device.streamMode) === 'GB28181') {
        if (!trim(device.gbDeviceId)) missing.push('国标设备 ID');
        if (!trim(device.gbDomain)) missing.push('国标域');
      } else if (!trim(device.sourceUrl)) {
        missing.push(getVideoSourceFieldLabel(device.streamMode));
      }
      return missing;
    }
    default:
      return [];
  }
}

export function getDeviceAccessValidationError(device: SimDevice): string | null {
  if (device.protocol === 'MQTT') {
    const mqttError = validateMqttDevice(device);
    if (mqttError) {
      return translateMqttValidation(mqttError);
    }
    return null;
  }

  if (device.protocol === 'Video' && isProxyVideoMode(device.streamMode) && trim(device.sourceUrl)) {
    try {
      parseVideoSourceUrl(device.streamMode, device.sourceUrl);
    } catch (error) {
      return error instanceof Error ? error.message : '视频源地址不正确';
    }
  }

  const missing = getDeviceAccessMissingFields(device);
  return missing.length > 0 ? `${device.protocol} 接入缺少：${missing.join(' / ')}` : null;
}

export function getDeviceAccessOverviewItems(device: SimDevice): AccessOverviewItem[] {
  switch (device.protocol) {
    case 'HTTP':
      return [
        { label: '服务地址', value: trim(device.httpBaseUrl) || '未配置' },
        { label: '认证方式', value: (device.httpAuthMode || 'DEVICE_SECRET') === 'PRODUCT_SECRET' ? '一型一密' : '一机一密', highlight: true },
        { label: 'ProductKey', value: trim(device.productKey) || '未配置' },
        { label: 'DeviceName', value: trim(device.deviceName) || '未配置' },
        ...(device.httpAuthMode === 'PRODUCT_SECRET'
          ? [
              { label: '动态注册服务', value: trim(device.httpRegisterBaseUrl) || '未配置' },
              { label: 'ProductSecret', value: maskSecret(device.productSecret) },
            ]
          : [{ label: 'DeviceSecret', value: maskSecret(device.deviceSecret) }]),
      ];
    case 'CoAP':
      return [
        { label: 'Bridge 地址', value: trim(device.coapBaseUrl) || '未配置' },
        { label: 'ProductKey', value: trim(device.productKey) || '未配置' },
        { label: 'DeviceName', value: trim(device.deviceName) || '未配置' },
        { label: 'DeviceSecret', value: maskSecret(device.deviceSecret) },
      ];
    case 'MQTT':
      return [
        { label: 'Broker', value: trim(device.mqttBrokerUrl) || '未配置' },
        { label: '认证方式', value: device.mqttAuthMode === 'PRODUCT_SECRET' ? '一型一密' : '一机一密', highlight: true },
        { label: 'ProductKey', value: trim(device.productKey) || '未配置' },
        { label: 'DeviceName', value: trim(device.deviceName) || '未配置' },
        { label: device.mqttAuthMode === 'PRODUCT_SECRET' ? 'ProductSecret' : 'DeviceSecret', value: device.mqttAuthMode === 'PRODUCT_SECRET' ? maskSecret(device.productSecret) : maskSecret(device.mqttPassword || device.deviceSecret) },
      ];
    case 'SNMP':
      return [
        { label: 'Connector', value: trim(device.snmpConnectorUrl) || '未配置' },
        { label: '目标主机', value: trim(device.snmpHost) || '未配置' },
        { label: '端口', value: String(device.snmpPort || 161) },
        { label: '版本', value: `v${device.snmpVersion || 2}` },
      ];
    case 'Modbus':
      return [
        { label: 'Connector', value: trim(device.modbusConnectorUrl) || '未配置' },
        { label: '目标主机', value: trim(device.modbusHost) || '未配置' },
        { label: '端口', value: String(device.modbusPort || 502) },
        { label: '模式', value: device.modbusMode || 'TCP' },
      ];
    case 'WebSocket':
      return [
        { label: 'Endpoint', value: trim(device.wsEndpoint) || '未配置' },
        { label: 'Device ID', value: trim(device.wsDeviceId) || '未设置' },
        { label: 'Product ID', value: trim(device.wsProductId) || '未设置' },
        { label: 'Tenant ID', value: trim(device.wsTenantId) || '未设置' },
      ];
    case 'TCP':
      return [
        { label: 'TCP 主机', value: trim(device.tcpHost) || '未配置' },
        { label: '端口', value: String(device.tcpPort || 8900) },
      ];
    case 'UDP':
      return [
        { label: 'UDP 主机', value: trim(device.udpHost) || '未配置' },
        { label: '端口', value: String(device.udpPort || 8901) },
      ];
    case 'LoRaWAN':
      return [
        { label: 'Webhook', value: trim(device.loraWebhookUrl) || '未配置' },
        { label: 'DevEUI', value: trim(device.loraDevEui) || '未配置' },
        { label: '应用 ID', value: trim(device.loraAppId) || '未设置' },
        { label: 'fPort', value: String(device.loraFPort || 1) },
      ];
    case 'Video':
      return [
        { label: 'ProductKey', value: trim(device.productKey) || '未配置' },
        { label: 'DeviceName', value: trim(device.deviceName) || '未配置' },
        { label: '媒体服务', value: trim(device.mediaBaseUrl) || '未配置' },
        { label: '模式', value: normalizeVideoStreamMode(device.streamMode), highlight: true },
        {
          label: normalizeVideoStreamMode(device.streamMode) === 'GB28181' ? '国标设备 ID' : getVideoSourceFieldLabel(device.streamMode),
          value: trim(normalizeVideoStreamMode(device.streamMode) === 'GB28181' ? device.gbDeviceId : device.sourceUrl) || '未配置',
        },
        {
          label: normalizeVideoStreamMode(device.streamMode) === 'GB28181' ? '国标域' : '平台接入地址',
          value: normalizeVideoStreamMode(device.streamMode) === 'GB28181'
            ? trim(device.gbDomain) || '未配置'
            : (() => {
              try {
                const parsed = parseVideoSourceUrl(device.streamMode, device.sourceUrl);
                return parsed ? `${parsed.host}:${parsed.port}` : '未设置';
              } catch {
                return '未设置';
              }
            })(),
        },
        {
          label: '平台视频设备',
          value: trim(String(device.videoDeviceId ?? '')) || '未设置',
        },
      ];
    default:
      return [];
  }
}
