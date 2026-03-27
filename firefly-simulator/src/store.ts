import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import type { ThingModelSimulationRuleMap } from './utils/thingModel';
import { normalizeVideoStreamMode, resolveVideoDeviceName, type SimulatorVideoStreamMode } from './utils/video';
import { simulatorStateStorage } from './storage';

// ============================================================
// Types
// ============================================================

export type Protocol = 'HTTP' | 'MQTT' | 'CoAP' | 'Video' | 'SNMP' | 'Modbus' | 'WebSocket' | 'TCP' | 'UDP' | 'LoRaWAN';
export type HttpAuthMode = 'DEVICE_SECRET' | 'PRODUCT_SECRET';
export type MqttAuthMode = 'DEVICE_SECRET' | 'PRODUCT_SECRET';
export type VideoSourceType = 'LOCAL_CAMERA' | 'REMOTE_SOURCE';

export interface SimDeviceLocator {
  locatorType: string;
  locatorValue: string;
  primaryLocator?: boolean;
}

export interface SipChannel {
  channelId: string;
  name: string;
  manufacturer: string;
  model: string;
  status: 'ON' | 'OFF';
  ptzType: number;
  longitude: number;
  latitude: number;
}
export type DeviceStatus = 'offline' | 'connecting' | 'online' | 'error';

export interface SimDevice {
  id: string;
  name: string;
  nickname: string;
  protocol: Protocol;
  status: DeviceStatus;
  restoreOnLaunch: boolean;
  // HTTP config
  httpBaseUrl: string;
  httpAuthMode: HttpAuthMode;
  httpRegisterBaseUrl: string;
  productKey: string;
  productSecret: string;
  deviceName: string;
  deviceSecret: string;
  locators: SimDeviceLocator[];
  token: string;
  // MQTT config
  mqttAuthMode: MqttAuthMode;
  mqttRegisterBaseUrl: string;
  mqttBrokerUrl: string;
  mqttClientId: string;
  mqttUsername: string;
  mqttPassword: string;
  mqttClean: boolean;
  mqttKeepalive: number;
  mqttWillTopic: string;
  mqttWillPayload: string;
  mqttWillQos: number;
  mqttWillRetain: boolean;
  // CoAP config
  coapBaseUrl: string;
  // Video config
  streamMode: SimulatorVideoStreamMode;
  videoSourceType: VideoSourceType;
  gbDeviceId: string;
  gbDomain: string;
  sourceUrl: string;
  streamUrl: string;
  platformDeviceId: number | null;
  ip: string;
  manufacturer: string;
  model: string;
  firmware: string;
  // SIP (GB28181) config
  sipServerIp: string;
  sipServerPort: number;
  sipServerId: string;
  sipLocalPort: number;
  sipKeepaliveInterval: number;
  sipPassword: string;
  sipTransport: 'UDP' | 'TCP';
  cameraDevice: string;
  mediaFps: number;
  mediaWidth: number;
  mediaHeight: number;
  sipChannels: SipChannel[];
  sipRegistered: boolean;
  sipKeepaliveEnabled: boolean;
  // SNMP config
  snmpConnectorUrl: string;
  snmpHost: string;
  snmpPort: number;
  snmpVersion: number;
  snmpCommunity: string;
  // Modbus config
  modbusConnectorUrl: string;
  modbusHost: string;
  modbusPort: number;
  modbusSlaveId: number;
  modbusMode: 'TCP' | 'RTU_OVER_TCP';
  // WebSocket config
  wsConnectorUrl: string;
  wsEndpoint: string;
  wsDeviceId: string;
  wsProductId: string;
  wsTenantId: string;
  // TCP/UDP config
  tcpHost: string;
  tcpPort: number;
  udpHost: string;
  udpPort: number;
  // LoRaWAN config
  loraWebhookUrl: string;
  loraDevEui: string;
  loraAppId: string;
  loraFPort: number;
  // Auto report
  autoReport: boolean;
  autoIntervalSec: number;
  autoTimerId: number | null;
  heartbeatIntervalSec: number;
  heartbeatTimerId: number | null;
  // Stats
  sentCount: number;
  errorCount: number;
  dynamicRegistered: boolean;
  thingModelSimulationRules: ThingModelSimulationRuleMap;
}

type SimDeviceDraft = Partial<SimDevice> & {
  rtspUrl?: string;
};

export interface LogEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  time: string;
  level: 'info' | 'success' | 'error' | 'warn';
  message: string;
}

// ============================================================
// Data Templates
// ============================================================

export interface DataTemplate {
  id: string;
  name: string;
  type: 'property' | 'event' | 'ota';
  fields: TemplateField[];
}

export interface TemplateField {
  key: string;
  valueType: 'random_int' | 'random_float' | 'fixed' | 'timestamp' | 'enum';
  min?: number;
  max?: number;
  fixed?: string;
  decimals?: number;
  enumValues?: string[];
}

export function generatePayload(fields: TemplateField[]): Record<string, any> {
  const data: Record<string, any> = {};
  for (const f of fields) {
    switch (f.valueType) {
      case 'random_int':
        data[f.key] = Math.floor(Math.random() * ((f.max ?? 100) - (f.min ?? 0) + 1)) + (f.min ?? 0);
        break;
      case 'random_float': {
        const val = Math.random() * ((f.max ?? 100) - (f.min ?? 0)) + (f.min ?? 0);
        data[f.key] = Number(val.toFixed(f.decimals ?? 2));
        break;
      }
      case 'fixed':
        data[f.key] = isNaN(Number(f.fixed)) ? (f.fixed ?? '') : Number(f.fixed);
        break;
      case 'timestamp':
        data[f.key] = Date.now();
        break;
      case 'enum':
        if (f.enumValues && f.enumValues.length > 0) {
          data[f.key] = f.enumValues[Math.floor(Math.random() * f.enumValues.length)];
        }
        break;
    }
  }
  return data;
}

function trimText(value?: string | null): string {
  return (value ?? '').trim();
}

function resolveStoredDeviceName(partial: SimDeviceDraft): string {
  if (partial.protocol === 'Video') {
    const currentValue = trimText(partial.deviceName);
    if (currentValue) {
      return currentValue;
    }
    return resolveVideoDeviceName({
      name: partial.name,
      gbDeviceId: partial.gbDeviceId,
      streamMode: partial.streamMode,
    });
  }
  return trimText(partial.deviceName);
}

function normalizePersistedDevice(device: SimDevice | (SimDevice & { mediaBaseUrl?: string })) {
  const { mediaBaseUrl: _mediaBaseUrl, ...normalized } = device as SimDevice & { mediaBaseUrl?: string };
  const streamMode = normalizeVideoStreamMode(normalized.streamMode);
  return {
    ...normalized,
    streamMode,
    videoSourceType: normalized.videoSourceType
      || (streamMode === 'GB28181' ? 'LOCAL_CAMERA' : 'REMOTE_SOURCE'),
    platformDeviceId: normalized.platformDeviceId ?? null,
    cameraDevice: normalized.cameraDevice || '',
    mediaFps: Number(normalized.mediaFps) || 15,
    mediaWidth: Number(normalized.mediaWidth) || 1280,
    mediaHeight: Number(normalized.mediaHeight) || 720,
    status: normalized.restoreOnLaunch ? 'connecting' as DeviceStatus : 'offline' as DeviceStatus,
    token: '',
    autoReport: false,
    autoTimerId: null,
    heartbeatTimerId: null,
    sentCount: 0,
    errorCount: 0,
    streamUrl: '',
    sipRegistered: false,
    sipKeepaliveEnabled: false,
  };
}

// ============================================================
// Default templates
// ============================================================

const defaultTemplates: DataTemplate[] = [
  {
    id: 'tpl-temp-humidity',
    name: '温湿度传感器',
    type: 'property',
    fields: [
      { key: 'temperature', valueType: 'random_float', min: -10, max: 50, decimals: 1 },
      { key: 'humidity', valueType: 'random_float', min: 0, max: 100, decimals: 1 },
    ],
  },
  {
    id: 'tpl-gps',
    name: 'GPS 定位',
    type: 'property',
    fields: [
      { key: 'latitude', valueType: 'random_float', min: 30, max: 40, decimals: 6 },
      { key: 'longitude', valueType: 'random_float', min: 110, max: 120, decimals: 6 },
      { key: 'speed', valueType: 'random_float', min: 0, max: 120, decimals: 1 },
    ],
  },
  {
    id: 'tpl-alarm',
    name: '告警事件',
    type: 'event',
    fields: [
      { key: 'eventType', valueType: 'enum', enumValues: ['OVER_TEMP', 'LOW_BATTERY', 'FENCE_OUT', 'OFFLINE'] },
      { key: 'value', valueType: 'random_float', min: 0, max: 100, decimals: 1 },
      { key: 'timestamp', valueType: 'timestamp' },
    ],
  },
  {
    id: 'tpl-power',
    name: '电力监测',
    type: 'property',
    fields: [
      { key: 'voltage', valueType: 'random_float', min: 210, max: 240, decimals: 1 },
      { key: 'current', valueType: 'random_float', min: 0, max: 30, decimals: 2 },
      { key: 'power', valueType: 'random_float', min: 0, max: 7200, decimals: 0 },
    ],
  },
  {
    id: 'tpl-ota-progress',
    name: 'OTA 升级进度',
    type: 'ota',
    fields: [
      { key: 'version', valueType: 'fixed', fixed: '1.2.0' },
      { key: 'progress', valueType: 'random_int', min: 0, max: 100 },
      { key: 'status', valueType: 'enum', enumValues: ['downloading', 'installing', 'success', 'failed'] },
      { key: 'timestamp', valueType: 'timestamp' },
    ],
  },
  {
    id: 'tpl-light',
    name: '光照传感器',
    type: 'property',
    fields: [
      { key: 'illuminance', valueType: 'random_int', min: 0, max: 100000 },
      { key: 'uv_index', valueType: 'random_float', min: 0, max: 11, decimals: 1 },
    ],
  },
  {
    id: 'tpl-gas',
    name: '气体检测',
    type: 'property',
    fields: [
      { key: 'co2', valueType: 'random_int', min: 300, max: 5000 },
      { key: 'co', valueType: 'random_float', min: 0, max: 50, decimals: 1 },
      { key: 'ch4', valueType: 'random_float', min: 0, max: 100, decimals: 2 },
      { key: 'o2', valueType: 'random_float', min: 18, max: 23, decimals: 1 },
    ],
  },
  {
    id: 'tpl-water',
    name: '水质监测',
    type: 'property',
    fields: [
      { key: 'ph', valueType: 'random_float', min: 5, max: 9, decimals: 2 },
      { key: 'dissolved_oxygen', valueType: 'random_float', min: 0, max: 20, decimals: 1 },
      { key: 'turbidity', valueType: 'random_float', min: 0, max: 1000, decimals: 1 },
      { key: 'conductivity', valueType: 'random_int', min: 50, max: 2000 },
    ],
  },
  {
    id: 'tpl-soil',
    name: '土壤传感器',
    type: 'property',
    fields: [
      { key: 'soil_moisture', valueType: 'random_float', min: 0, max: 100, decimals: 1 },
      { key: 'soil_temperature', valueType: 'random_float', min: -5, max: 45, decimals: 1 },
      { key: 'soil_ph', valueType: 'random_float', min: 4, max: 9, decimals: 1 },
      { key: 'soil_ec', valueType: 'random_int', min: 0, max: 3000 },
    ],
  },
  {
    id: 'tpl-air-quality',
    name: '空气质量',
    type: 'property',
    fields: [
      { key: 'pm25', valueType: 'random_int', min: 0, max: 500 },
      { key: 'pm10', valueType: 'random_int', min: 0, max: 600 },
      { key: 'aqi', valueType: 'random_int', min: 0, max: 500 },
      { key: 'tvoc', valueType: 'random_float', min: 0, max: 10, decimals: 2 },
    ],
  },
  {
    id: 'tpl-energy-meter',
    name: '智能电表',
    type: 'property',
    fields: [
      { key: 'total_energy', valueType: 'random_float', min: 1000, max: 99999, decimals: 2 },
      { key: 'voltage_a', valueType: 'random_float', min: 210, max: 240, decimals: 1 },
      { key: 'voltage_b', valueType: 'random_float', min: 210, max: 240, decimals: 1 },
      { key: 'voltage_c', valueType: 'random_float', min: 210, max: 240, decimals: 1 },
      { key: 'current_a', valueType: 'random_float', min: 0, max: 100, decimals: 2 },
      { key: 'power_factor', valueType: 'random_float', min: 0.8, max: 1.0, decimals: 3 },
    ],
  },
  {
    id: 'tpl-vibration',
    name: '振动传感器',
    type: 'property',
    fields: [
      { key: 'velocity', valueType: 'random_float', min: 0, max: 50, decimals: 2 },
      { key: 'acceleration', valueType: 'random_float', min: 0, max: 20, decimals: 3 },
      { key: 'displacement', valueType: 'random_float', min: 0, max: 500, decimals: 1 },
      { key: 'frequency', valueType: 'random_float', min: 10, max: 1000, decimals: 1 },
    ],
  },
  {
    id: 'tpl-smoke',
    name: '烟雾报警',
    type: 'event',
    fields: [
      { key: 'smoke_level', valueType: 'random_float', min: 0, max: 100, decimals: 1 },
      { key: 'alarm', valueType: 'enum', enumValues: ['NORMAL', 'PRE_ALARM', 'FIRE_ALARM'] },
      { key: 'battery', valueType: 'random_int', min: 0, max: 100 },
      { key: 'timestamp', valueType: 'timestamp' },
    ],
  },
];

// ============================================================
// Store
// ============================================================

interface SimulatorState {
  devices: SimDevice[];
  logs: LogEntry[];
  templates: DataTemplate[];
  selectedDeviceId: string | null;

  addDevice: (device: Partial<SimDevice>) => void;
  removeDevice: (id: string) => void;
  updateDevice: (id: string, patch: Partial<SimDevice>) => void;
  selectDevice: (id: string | null) => void;

  addLog: (deviceId: string, deviceName: string, level: LogEntry['level'], message: string) => void;
  clearLogs: () => void;

  addTemplate: (tpl: DataTemplate) => void;
  removeTemplate: (id: string) => void;
}

export const useSimStore = create<SimulatorState>()(
  persist(
    (set, get) => ({
  devices: [],
  logs: [],
  templates: defaultTemplates,
  selectedDeviceId: null,

  addDevice: (partial) => {
    const draft = partial as SimDeviceDraft;
    const id = uuidv4();
    const normalizedVideoMode = normalizeVideoStreamMode(draft.streamMode);
    const defaultVideoSourceType: VideoSourceType = normalizedVideoMode === 'GB28181' ? 'LOCAL_CAMERA' : 'REMOTE_SOURCE';
    const device: SimDevice = {
      id,
      nickname: draft.nickname || draft.name || `device-${get().devices.length + 1}`,
      name: draft.name || `设备-${get().devices.length + 1}`,
      protocol: draft.protocol || 'HTTP',
      status: 'offline',
      restoreOnLaunch: draft.restoreOnLaunch ?? false,
      httpBaseUrl: draft.httpBaseUrl || 'http://localhost:9070',
      httpAuthMode: draft.httpAuthMode || 'DEVICE_SECRET',
      httpRegisterBaseUrl: draft.httpRegisterBaseUrl || 'http://localhost:9070',
      productKey: draft.productKey || '',
      productSecret: draft.productSecret || '',
      deviceName: resolveStoredDeviceName(draft),
      deviceSecret: draft.deviceSecret || '',
      locators: draft.locators || [],
      token: '',
      mqttAuthMode: draft.mqttAuthMode || 'DEVICE_SECRET',
      mqttRegisterBaseUrl: draft.mqttRegisterBaseUrl || 'http://localhost:9070',
      mqttBrokerUrl: draft.mqttBrokerUrl || 'mqtt://localhost:1883',
      mqttClientId: draft.mqttClientId || '',
      mqttUsername: draft.mqttUsername || '',
      mqttPassword: draft.mqttPassword || '',
      mqttClean: draft.mqttClean ?? true,
      mqttKeepalive: draft.mqttKeepalive || 60,
      mqttWillTopic: draft.mqttWillTopic || '',
      mqttWillPayload: draft.mqttWillPayload || '',
      mqttWillQos: draft.mqttWillQos ?? 1,
      mqttWillRetain: draft.mqttWillRetain ?? false,
      coapBaseUrl: draft.coapBaseUrl || 'http://localhost:9070',
      streamMode: normalizedVideoMode,
      videoSourceType: draft.videoSourceType || defaultVideoSourceType,
      gbDeviceId: draft.gbDeviceId || '',
      gbDomain: draft.gbDomain || '3402000000',
      sourceUrl: draft.sourceUrl || draft.rtspUrl || '',
      streamUrl: draft.streamUrl || '',
      platformDeviceId: draft.platformDeviceId || null,
      ip: draft.ip || '',
      manufacturer: draft.manufacturer || '',
      model: draft.model || '',
      firmware: draft.firmware || '',
      sipServerIp: draft.sipServerIp || '127.0.0.1',
      sipServerPort: draft.sipServerPort || 5060,
      sipServerId: draft.sipServerId || '34020000002000000001',
      sipLocalPort: draft.sipLocalPort || 5080,
      sipKeepaliveInterval: draft.sipKeepaliveInterval || 60,
      sipPassword: draft.sipPassword || '',
      sipTransport: draft.sipTransport || 'UDP',
      cameraDevice: draft.cameraDevice || '',
      mediaFps: Number(draft.mediaFps) || 15,
      mediaWidth: Number(draft.mediaWidth) || 1280,
      mediaHeight: Number(draft.mediaHeight) || 720,
      sipChannels: draft.sipChannels || [],
      sipRegistered: false,
      sipKeepaliveEnabled: false,
      snmpConnectorUrl: draft.snmpConnectorUrl || 'http://localhost:9070',
      snmpHost: draft.snmpHost || '',
      snmpPort: draft.snmpPort || 161,
      snmpVersion: draft.snmpVersion || 2,
      snmpCommunity: draft.snmpCommunity || 'public',
      modbusConnectorUrl: draft.modbusConnectorUrl || 'http://localhost:9070',
      modbusHost: draft.modbusHost || '',
      modbusPort: draft.modbusPort || 502,
      modbusSlaveId: draft.modbusSlaveId || 1,
      modbusMode: draft.modbusMode || 'TCP',
      wsConnectorUrl: draft.wsConnectorUrl || 'http://localhost:9070',
      wsEndpoint: draft.wsEndpoint || 'ws://localhost:9070/ws/device',
      wsDeviceId: draft.wsDeviceId || '',
      wsProductId: draft.wsProductId || '',
      wsTenantId: draft.wsTenantId || '',
      tcpHost: draft.tcpHost || 'localhost',
      tcpPort: draft.tcpPort || 8900,
      udpHost: draft.udpHost || 'localhost',
      udpPort: draft.udpPort || 8901,
      loraWebhookUrl: draft.loraWebhookUrl || 'http://localhost:9070/api/v1/lorawan/webhook/up',
      loraDevEui: draft.loraDevEui || '',
      loraAppId: draft.loraAppId || '',
      loraFPort: draft.loraFPort || 1,
      autoReport: false,
      autoIntervalSec: 5,
      autoTimerId: null,
      heartbeatIntervalSec: draft.heartbeatIntervalSec || 30,
      heartbeatTimerId: null,
      sentCount: 0,
      errorCount: 0,
      dynamicRegistered: draft.dynamicRegistered ?? false,
      thingModelSimulationRules: draft.thingModelSimulationRules || {},
    };
    set((s) => ({ devices: [...s.devices, device], selectedDeviceId: id }));
  },

  removeDevice: (id) =>
    set((s) => ({
      devices: s.devices.filter((d) => d.id !== id),
      selectedDeviceId: s.selectedDeviceId === id ? null : s.selectedDeviceId,
    })),

  updateDevice: (id, patch) =>
    set((s) => ({
      devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),

  selectDevice: (id) => set({ selectedDeviceId: id }),

  addLog: (deviceId, deviceName, level, message) =>
    set((s) => ({
      logs: [
        {
          id: uuidv4(),
          deviceId,
          deviceName,
          time: dayjs().format('HH:mm:ss.SSS'),
          level,
          message,
        },
        ...s.logs.slice(0, 499),
      ],
    })),

  clearLogs: () => set({ logs: [] }),

  addTemplate: (tpl) => set((s) => ({ templates: [...s.templates, tpl] })),
  removeTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
}),
    {
      name: 'firefly-sim-store',
      storage: createJSONStorage(() => simulatorStateStorage),
      partialize: (state) => ({
        devices: state.devices.map((device) => normalizePersistedDevice(device)),
        templates: state.templates,
        selectedDeviceId: state.selectedDeviceId,
      }),
      merge: (persistedState, currentState) => {
        const incoming = (persistedState || {}) as Partial<{
          devices: Array<SimDevice & { mediaBaseUrl?: string }>;
          templates: DataTemplate[];
          selectedDeviceId: string | null;
        }>;
        return {
          ...currentState,
          ...incoming,
          devices: Array.isArray(incoming.devices)
            ? incoming.devices.map((device) => normalizePersistedDevice(device))
            : currentState.devices,
        };
      },
    },
  ),
);
