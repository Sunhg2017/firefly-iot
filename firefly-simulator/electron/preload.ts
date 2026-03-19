import { contextBridge, ipcRenderer } from 'electron';

// ============================================================
// Preload — Expose safe IPC API to renderer
// ============================================================

contextBridge.exposeInMainWorld('electronAPI', {
  simulatorStoreGetItem: (name: string) => ipcRenderer.invoke('simulator-store:get', name),
  simulatorStoreSetItem: (name: string, value: string) => ipcRenderer.invoke('simulator-store:set', name, value),
  simulatorStoreRemoveItem: (name: string) => ipcRenderer.invoke('simulator-store:remove', name),

  // HTTP Protocol
  httpAuth: (baseUrl: string, productKey: string, deviceName: string, deviceSecret: string) =>
    ipcRenderer.invoke('http:auth', baseUrl, productKey, deviceName, deviceSecret),

  httpReportProperty: (baseUrl: string, token: string, properties: Record<string, any>) =>
    ipcRenderer.invoke('http:property', baseUrl, token, properties),

  httpReportEvent: (baseUrl: string, token: string, event: Record<string, any>) =>
    ipcRenderer.invoke('http:event', baseUrl, token, event),

  httpOnline: (baseUrl: string, token: string, event: Record<string, any>) =>
    ipcRenderer.invoke('http:online', baseUrl, token, event),

  httpOffline: (baseUrl: string, token: string, event: Record<string, any>) =>
    ipcRenderer.invoke('http:offline', baseUrl, token, event),

  httpHeartbeat: (baseUrl: string, token: string, event?: Record<string, any>) =>
    ipcRenderer.invoke('http:heartbeat', baseUrl, token, event),

  productGetThingModel: (baseUrl: string, productKey: string) =>
    ipcRenderer.invoke('product:thingModel', baseUrl, productKey),

  deviceDynamicRegister: (
    baseUrl: string,
    payload: {
      productKey: string;
      productSecret: string;
      deviceName: string;
      nickname?: string;
      description?: string;
      tags?: string;
      locators?: Array<{
        locatorType: string;
        locatorValue: string;
        primaryLocator?: boolean;
      }>;
    },
  ) => ipcRenderer.invoke('device:dynamicRegister', baseUrl, payload),

  deviceDynamicUnregister: (
    baseUrl: string,
    payload: {
      productKey: string;
      productSecret: string;
      deviceName: string;
    },
  ) => ipcRenderer.invoke('device:dynamicUnregister', baseUrl, payload),

  // File Import / Export
  fileImport: () => ipcRenderer.invoke('file:import'),
  fileExport: (content: string, defaultName: string) => ipcRenderer.invoke('file:export', content, defaultName),

  // CoAP Bridge Protocol
  coapAuth: (baseUrl: string, payload: Record<string, string>) =>
    ipcRenderer.invoke('coap:auth', baseUrl, payload),

  coapReportProperty: (baseUrl: string, token: string, payload: Record<string, any>) =>
    ipcRenderer.invoke('coap:property', baseUrl, token, payload),

  coapReportEvent: (baseUrl: string, token: string, payload: Record<string, any>) =>
    ipcRenderer.invoke('coap:event', baseUrl, token, payload),

  coapReportOtaProgress: (baseUrl: string, token: string, payload: Record<string, any>) =>
    ipcRenderer.invoke('coap:otaProgress', baseUrl, token, payload),

  coapGetShadow: (baseUrl: string, token: string) =>
    ipcRenderer.invoke('coap:shadow', baseUrl, token),

  // Video (firefly-media) API
  videoCreateDevice: (baseUrl: string, dto: any, token?: string) =>
    ipcRenderer.invoke('video:createDevice', baseUrl, dto, token),
  videoListDevices: (baseUrl: string, query: any, token?: string) =>
    ipcRenderer.invoke('video:listDevices', baseUrl, query, token),
  videoStartStream: (baseUrl: string, deviceId: number, dto?: any, token?: string) =>
    ipcRenderer.invoke('video:startStream', baseUrl, deviceId, dto, token),
  videoStopStream: (baseUrl: string, deviceId: number, token?: string) =>
    ipcRenderer.invoke('video:stopStream', baseUrl, deviceId, token),
  videoPtzControl: (baseUrl: string, deviceId: number, dto: any, token?: string) =>
    ipcRenderer.invoke('video:ptzControl', baseUrl, deviceId, dto, token),
  videoSnapshot: (baseUrl: string, deviceId: number, token?: string) =>
    ipcRenderer.invoke('video:snapshot', baseUrl, deviceId, token),
  videoListChannels: (baseUrl: string, deviceId: number, token?: string) =>
    ipcRenderer.invoke('video:listChannels', baseUrl, deviceId, token),
  videoQueryCatalog: (baseUrl: string, deviceId: number, token?: string) =>
    ipcRenderer.invoke('video:queryCatalog', baseUrl, deviceId, token),
  videoStartRecording: (baseUrl: string, deviceId: number, token?: string) =>
    ipcRenderer.invoke('video:startRecording', baseUrl, deviceId, token),
  videoStopRecording: (baseUrl: string, deviceId: number, token?: string) =>
    ipcRenderer.invoke('video:stopRecording', baseUrl, deviceId, token),

  // GB28181 SIP Simulation
  sipStart: (id: string, config: any) => ipcRenderer.invoke('sip:start', id, config),
  sipRegister: (id: string) => ipcRenderer.invoke('sip:register', id),
  sipUnregister: (id: string) => ipcRenderer.invoke('sip:unregister', id),
  sipStartKeepalive: (id: string) => ipcRenderer.invoke('sip:startKeepalive', id),
  sipStopKeepalive: (id: string) => ipcRenderer.invoke('sip:stopKeepalive', id),
  sipStop: (id: string) => ipcRenderer.invoke('sip:stop', id),
  sipUpdateChannels: (id: string, channels: any[]) => ipcRenderer.invoke('sip:updateChannels', id, channels),

  onSipEvent: (callback: (id: string, event: any) => void) => {
    const handler = (_e: any, id: string, event: any) => callback(id, event);
    ipcRenderer.on('sip:event', handler);
    return () => ipcRenderer.removeListener('sip:event', handler);
  },

  // SNMP Protocol (via Connector REST API)
  snmpTest: (connectorUrl: string, target: any) =>
    ipcRenderer.invoke('snmp:test', connectorUrl, target),

  snmpSystemInfo: (connectorUrl: string, target: any) =>
    ipcRenderer.invoke('snmp:systemInfo', connectorUrl, target),

  snmpGet: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('snmp:get', connectorUrl, payload),

  snmpWalk: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('snmp:walk', connectorUrl, payload),

  // Modbus Protocol (via Connector REST API)
  modbusTest: (connectorUrl: string, target: any) =>
    ipcRenderer.invoke('modbus:test', connectorUrl, target),

  modbusReadHoldingRegisters: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:readHoldingRegisters', connectorUrl, payload),

  modbusReadInputRegisters: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:readInputRegisters', connectorUrl, payload),

  modbusReadCoils: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:readCoils', connectorUrl, payload),

  modbusReadDiscreteInputs: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:readDiscreteInputs', connectorUrl, payload),

  modbusWriteSingleRegister: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:writeSingleRegister', connectorUrl, payload),

  modbusWriteSingleCoil: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:writeSingleCoil', connectorUrl, payload),

  modbusWriteMultipleRegisters: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:writeMultipleRegisters', connectorUrl, payload),

  modbusWriteMultipleCoils: (connectorUrl: string, payload: any) =>
    ipcRenderer.invoke('modbus:writeMultipleCoils', connectorUrl, payload),

  // WebSocket Protocol
  wsConnect: (id: string, endpoint: string, params?: { deviceId?: string; productId?: string; tenantId?: string; deviceName?: string }) =>
    ipcRenderer.invoke('ws:connect', id, endpoint, params),

  wsSend: (id: string, message: string) =>
    ipcRenderer.invoke('ws:send', id, message),

  wsDisconnect: (id: string) =>
    ipcRenderer.invoke('ws:disconnect', id),

  onWsMessage: (callback: (id: string, payload: string) => void) => {
    const handler = (_e: any, id: string, payload: string) => callback(id, payload);
    ipcRenderer.on('ws:message', handler);
    return () => ipcRenderer.removeListener('ws:message', handler);
  },

  onWsDisconnected: (callback: (id: string, code: number, reason: string) => void) => {
    const handler = (_e: any, id: string, code: number, reason: string) => callback(id, code, reason);
    ipcRenderer.on('ws:disconnected', handler);
    return () => ipcRenderer.removeListener('ws:disconnected', handler);
  },

  onWsError: (callback: (id: string, error: string) => void) => {
    const handler = (_e: any, id: string, error: string) => callback(id, error);
    ipcRenderer.on('ws:error', handler);
    return () => ipcRenderer.removeListener('ws:error', handler);
  },

  // TCP Protocol
  tcpConnect: (id: string, host: string, port: number) =>
    ipcRenderer.invoke('tcp:connect', id, host, port),

  tcpSend: (id: string, message: string) =>
    ipcRenderer.invoke('tcp:send', id, message),

  tcpDisconnect: (id: string) =>
    ipcRenderer.invoke('tcp:disconnect', id),

  onTcpMessage: (callback: (id: string, payload: string) => void) => {
    const handler = (_e: any, id: string, payload: string) => callback(id, payload);
    ipcRenderer.on('tcp:message', handler);
    return () => ipcRenderer.removeListener('tcp:message', handler);
  },

  onTcpDisconnected: (callback: (id: string) => void) => {
    const handler = (_e: any, id: string) => callback(id);
    ipcRenderer.on('tcp:disconnected', handler);
    return () => ipcRenderer.removeListener('tcp:disconnected', handler);
  },

  onTcpError: (callback: (id: string, error: string) => void) => {
    const handler = (_e: any, id: string, error: string) => callback(id, error);
    ipcRenderer.on('tcp:error', handler);
    return () => ipcRenderer.removeListener('tcp:error', handler);
  },

  // UDP Protocol
  udpSend: (host: string, port: number, message: string) =>
    ipcRenderer.invoke('udp:send', host, port, message),

  // LoRaWAN Protocol (simulate network server webhook POST)
  lorawanSend: (webhookUrl: string, devEui: string, appId: string, fPort: number, payload: string) =>
    ipcRenderer.invoke('lorawan:send', webhookUrl, devEui, appId, fPort, payload),

  // MQTT Protocol
  mqttConnect: (id: string, brokerUrl: string, clientId: string, username: string, password: string, opts?: {
    clean?: boolean; keepalive?: number; reconnectPeriod?: number;
    willTopic?: string; willPayload?: string; willQos?: number; willRetain?: boolean;
  }) =>
    ipcRenderer.invoke('mqtt:connect', id, brokerUrl, clientId, username, password, opts),

  mqttPublish: (id: string, topic: string, payload: string, qos?: number, retain?: boolean) =>
    ipcRenderer.invoke('mqtt:publish', id, topic, payload, qos ?? 1, retain),

  mqttSubscribe: (id: string, topic: string, qos?: number) =>
    ipcRenderer.invoke('mqtt:subscribe', id, topic, qos),

  mqttUnsubscribe: (id: string, topic: string) =>
    ipcRenderer.invoke('mqtt:unsubscribe', id, topic),

  mqttDisconnect: (id: string) =>
    ipcRenderer.invoke('mqtt:disconnect', id),

  // MQTT events from main process
  onMqttMessage: (callback: (id: string, topic: string, payload: string) => void) => {
    const handler = (_e: any, id: string, topic: string, payload: string) => callback(id, topic, payload);
    ipcRenderer.on('mqtt:message', handler);
    return () => ipcRenderer.removeListener('mqtt:message', handler);
  },

  onMqttDisconnected: (callback: (id: string) => void) => {
    const handler = (_e: any, id: string) => callback(id);
    ipcRenderer.on('mqtt:disconnected', handler);
    return () => ipcRenderer.removeListener('mqtt:disconnected', handler);
  },

  onMqttError: (callback: (id: string, error: string) => void) => {
    const handler = (_e: any, id: string, error: string) => callback(id, error);
    ipcRenderer.on('mqtt:error', handler);
    return () => ipcRenderer.removeListener('mqtt:error', handler);
  },
});
