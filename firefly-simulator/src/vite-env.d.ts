/// <reference types="vite/client" />

interface ElectronAPI {
  simulatorStoreGetItem: (name: string) => Promise<string | null>;
  simulatorStoreSetItem: (name: string, value: string) => Promise<void>;
  simulatorStoreRemoveItem: (name: string) => Promise<void>;
  simulatorAuthLogin: (
    baseUrl: string,
    payload: {
      username?: string;
      password?: string;
      loginMethod?: string;
      fingerprint?: string;
      userAgent?: string;
    },
  ) => Promise<any>;
  simulatorAuthLogout: (baseUrl: string, token: string, userAgent?: string) => Promise<any>;
  simulatorProductList: (
    baseUrl: string,
    token: string,
    query?: {
      pageNum?: number;
      pageSize?: number;
      keyword?: string;
      protocol?: string;
      status?: string;
    },
    userAgent?: string,
  ) => Promise<any>;
  simulatorProductSecret: (baseUrl: string, token: string, productId: number, userAgent?: string) => Promise<any>;

  httpAuth: (baseUrl: string, productKey: string, deviceName: string, deviceSecret: string) => Promise<any>;
  httpReportProperty: (baseUrl: string, token: string, properties: Record<string, any>) => Promise<any>;
  httpReportEvent: (baseUrl: string, token: string, event: Record<string, any>) => Promise<any>;
  httpOnline: (baseUrl: string, token: string, event: Record<string, any>) => Promise<any>;
  httpOffline: (baseUrl: string, token: string, event: Record<string, any>) => Promise<any>;
  httpHeartbeat: (baseUrl: string, token: string, event?: Record<string, any>) => Promise<any>;
  productGetThingModel: (payload: {
    baseUrl: string;
    productKey: string;
    accessKey: string;
    secretKey: string;
  }) => Promise<any>;
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
  ) => Promise<any>;
  deviceDynamicUnregister: (
    baseUrl: string,
    payload: {
      productKey: string;
      productSecret: string;
      deviceName: string;
    },
  ) => Promise<any>;

  fileImport: () => Promise<{ success: boolean; content?: string; ext?: string; filePath?: string; message?: string }>;
  fileExport: (content: string, defaultName: string) => Promise<{ success: boolean; filePath?: string; message?: string }>;

  coapAuth: (baseUrl: string, payload: Record<string, string>) => Promise<any>;
  coapReportProperty: (baseUrl: string, token: string, payload: Record<string, any>) => Promise<any>;
  coapReportEvent: (baseUrl: string, token: string, payload: Record<string, any>) => Promise<any>;
  coapReportOtaProgress: (baseUrl: string, token: string, payload: Record<string, any>) => Promise<any>;
  coapGetShadow: (baseUrl: string, token: string) => Promise<any>;

  videoCreateDevice: (baseUrl: string, dto: any, token?: string) => Promise<any>;
  videoListDevices: (baseUrl: string, query: any, token?: string) => Promise<any>;
  videoStartStream: (baseUrl: string, deviceId: number, dto?: any, token?: string) => Promise<any>;
  videoStopStream: (baseUrl: string, deviceId: number, token?: string) => Promise<any>;
  videoPtzControl: (baseUrl: string, deviceId: number, dto: any, token?: string) => Promise<any>;
  videoSnapshot: (baseUrl: string, deviceId: number, token?: string) => Promise<any>;
  videoListChannels: (baseUrl: string, deviceId: number, token?: string) => Promise<any>;
  videoQueryCatalog: (baseUrl: string, deviceId: number, token?: string) => Promise<any>;
  videoStartRecording: (baseUrl: string, deviceId: number, token?: string) => Promise<any>;
  videoStopRecording: (baseUrl: string, deviceId: number, token?: string) => Promise<any>;

  sipStart: (id: string, config: any) => Promise<any>;
  sipRegister: (id: string) => Promise<any>;
  sipUnregister: (id: string) => Promise<any>;
  sipStartKeepalive: (id: string) => Promise<any>;
  sipStopKeepalive: (id: string) => Promise<any>;
  sipStop: (id: string) => Promise<any>;
  sipUpdateChannels: (id: string, channels: any[]) => Promise<any>;
  onSipEvent: (callback: (id: string, event: any) => void) => () => void;

  snmpTest: (connectorUrl: string, target: any) => Promise<any>;
  snmpSystemInfo: (connectorUrl: string, target: any) => Promise<any>;
  snmpGet: (connectorUrl: string, payload: any) => Promise<any>;
  snmpWalk: (connectorUrl: string, payload: any) => Promise<any>;

  modbusTest: (connectorUrl: string, target: any) => Promise<any>;
  modbusReadHoldingRegisters: (connectorUrl: string, payload: any) => Promise<any>;
  modbusReadInputRegisters: (connectorUrl: string, payload: any) => Promise<any>;
  modbusReadCoils: (connectorUrl: string, payload: any) => Promise<any>;
  modbusReadDiscreteInputs: (connectorUrl: string, payload: any) => Promise<any>;
  modbusWriteSingleRegister: (connectorUrl: string, payload: any) => Promise<any>;
  modbusWriteSingleCoil: (connectorUrl: string, payload: any) => Promise<any>;
  modbusWriteMultipleRegisters: (connectorUrl: string, payload: any) => Promise<any>;
  modbusWriteMultipleCoils: (connectorUrl: string, payload: any) => Promise<any>;

  wsConnect: (
    id: string,
    endpoint: string,
    params?: { deviceId?: string; productId?: string; tenantId?: string; deviceName?: string; productKey?: string; locators?: string }
  ) => Promise<any>;
  wsSend: (id: string, message: string) => Promise<any>;
  wsDisconnect: (id: string) => Promise<any>;
  onWsMessage: (callback: (id: string, payload: string) => void) => () => void;
  onWsDisconnected: (callback: (id: string, code: number, reason: string) => void) => () => void;
  onWsError: (callback: (id: string, error: string) => void) => () => void;

  tcpConnect: (id: string, host: string, port: number) => Promise<any>;
  tcpSend: (id: string, message: string) => Promise<any>;
  tcpDisconnect: (id: string) => Promise<any>;
  onTcpMessage: (callback: (id: string, payload: string) => void) => () => void;
  onTcpDisconnected: (callback: (id: string) => void) => () => void;
  onTcpError: (callback: (id: string, error: string) => void) => () => void;

  udpConnect: (id: string, host: string, port: number) => Promise<any>;
  udpSend: (id: string, message: string) => Promise<any>;
  udpDisconnect: (id: string) => Promise<any>;
  onUdpMessage: (callback: (id: string, payload: string) => void) => () => void;
  onUdpDisconnected: (callback: (id: string) => void) => () => void;
  onUdpError: (callback: (id: string, error: string) => void) => () => void;

  lorawanSend: (webhookUrl: string, devEui: string, appId: string, fPort: number, payload: string) => Promise<any>;
  lorawanListDownlinks: (webhookUrl: string, devEui: string, sinceTs?: number) => Promise<any>;

  mqttConnect: (id: string, brokerUrl: string, clientId: string, username: string, password: string, opts?: {
    clean?: boolean; keepalive?: number; reconnectPeriod?: number;
    willTopic?: string; willPayload?: string; willQos?: number; willRetain?: boolean;
  }) => Promise<any>;
  mqttPublish: (id: string, topic: string, payload: string, qos?: number, retain?: boolean) => Promise<any>;
  mqttSubscribe: (id: string, topic: string, qos?: number) => Promise<any>;
  mqttUnsubscribe: (id: string, topic: string) => Promise<any>;
  mqttDisconnect: (id: string) => Promise<any>;

  onMqttMessage: (callback: (id: string, topic: string, payload: string) => void) => () => void;
  onMqttDisconnected: (callback: (id: string) => void) => () => void;
  onMqttError: (callback: (id: string, error: string) => void) => () => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
