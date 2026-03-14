import type { Protocol, SimDevice } from '../store';
import { useSimStore } from '../store';
import {
  buildMqttServiceTopic,
  dynamicRegisterDevice,
  resolveMqttIdentity,
  shouldDynamicRegister,
  validateMqttDevice,
} from './mqtt';
import { getDeviceAccessValidationError } from './deviceAccess';

const RESTORABLE_PROTOCOLS: Protocol[] = [
  'HTTP',
  'MQTT',
  'CoAP',
  'SNMP',
  'Modbus',
  'WebSocket',
  'TCP',
  'UDP',
  'LoRaWAN',
];

let restoreCompleted = false;
let restoreInFlight: Promise<void> | null = null;

export function isRestorableProtocol(protocol: Protocol) {
  return RESTORABLE_PROTOCOLS.includes(protocol);
}

function getDevice(deviceId: string) {
  return useSimStore.getState().devices.find((item) => item.id === deviceId);
}

function clearDeviceAutoTimer(device: SimDevice) {
  if (device.autoTimerId) {
    window.clearInterval(device.autoTimerId);
  }
}

export async function connectSimDevice(
  deviceId: string,
  options?: { silent?: boolean; restoring?: boolean },
) {
  const store = useSimStore.getState();
  const device = getDevice(deviceId);
  if (!device) {
    return { success: false, message: 'Device not found' };
  }

  const accessError = getDeviceAccessValidationError(device);
  if (accessError) {
    store.updateDevice(device.id, {
      status: 'error',
      restoreOnLaunch: options?.restoring ? device.restoreOnLaunch : false,
    });
    store.addLog(device.id, device.name, 'warn', accessError);
    return { success: false, message: accessError };
  }

  store.updateDevice(device.id, { status: 'connecting' });
  if (!options?.silent) {
    store.addLog(device.id, device.name, 'info', options?.restoring ? 'Restoring connection...' : 'Connecting...');
  }

  try {
    if (device.protocol === 'HTTP') {
      let target = device;
      if (shouldDynamicRegister(device)) {
        const registerResult = await dynamicRegisterDevice(device, device.httpRegisterBaseUrl);
        target = { ...device, deviceSecret: registerResult.deviceSecret };
        store.updateDevice(device.id, {
          deviceSecret: registerResult.deviceSecret,
          dynamicRegistered: true,
        });
        store.addLog(device.id, device.name, 'success', `Dynamic registration succeeded: ${registerResult.deviceName}`);
      }
      const result = await window.electronAPI.httpAuth(
        target.httpBaseUrl,
        target.productKey,
        target.deviceName,
        target.deviceSecret,
      );
      if (result.success && result.data?.token) {
        store.updateDevice(device.id, {
          status: 'online',
          token: result.data.token,
          restoreOnLaunch: true,
        });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `HTTP auth succeeded: ${result.data.token.slice(0, 20)}...`);
        }
        return { success: true };
      }
      throw new Error(result.message || result.msg || 'HTTP auth failed');
    }

    if (device.protocol === 'CoAP') {
      const result = await window.electronAPI.coapAuth(device.coapBaseUrl, {
        productKey: device.productKey,
        deviceName: device.deviceName,
        deviceSecret: device.deviceSecret,
      });
      if (result.success && result.data?.token) {
        store.updateDevice(device.id, {
          status: 'online',
          token: result.data.token,
          restoreOnLaunch: true,
        });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `CoAP auth succeeded: ${result.data.token.slice(0, 20)}...`);
        }
        return { success: true };
      }
      throw new Error(result.message || result.msg || 'CoAP auth failed');
    }

    if (device.protocol === 'SNMP') {
      const result = await window.electronAPI.snmpTest(device.snmpConnectorUrl, {
        host: device.snmpHost,
        port: device.snmpPort,
        version: device.snmpVersion,
        community: device.snmpCommunity,
      });
      if (result.success && result.data?.data === true) {
        store.updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `SNMP ready: ${device.snmpHost}:${device.snmpPort}`);
        }
        return { success: true };
      }
      throw new Error(result.data?.message || result.message || 'SNMP target unavailable');
    }

    if (device.protocol === 'Modbus') {
      const result = await window.electronAPI.modbusTest(device.modbusConnectorUrl, {
        host: device.modbusHost,
        port: device.modbusPort,
        slaveId: device.modbusSlaveId,
        mode: device.modbusMode,
      });
      if (result.success && result.data?.data === true) {
        store.updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `Modbus ready: ${device.modbusHost}:${device.modbusPort}`);
        }
        return { success: true };
      }
      throw new Error(result.data?.message || result.message || 'Modbus target unavailable');
    }

    if (device.protocol === 'WebSocket') {
      const result = await window.electronAPI.wsConnect(device.id, device.wsEndpoint, {
        deviceId: device.wsDeviceId,
        productId: device.wsProductId,
        tenantId: device.wsTenantId,
        deviceName: device.name,
      });
      if (result.success) {
        store.updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `WebSocket connected: ${device.wsEndpoint}`);
        }
        return { success: true };
      }
      throw new Error(result.message || 'WebSocket connect failed');
    }

    if (device.protocol === 'TCP') {
      const result = await window.electronAPI.tcpConnect(device.id, device.tcpHost, device.tcpPort);
      if (result.success) {
        store.updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `TCP connected: ${device.tcpHost}:${device.tcpPort}`);
        }
        return { success: true };
      }
      throw new Error(result.message || 'TCP connect failed');
    }

    if (device.protocol === 'UDP') {
      store.updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
      if (!options?.silent) {
        store.addLog(device.id, device.name, 'success', `UDP ready: ${device.udpHost}:${device.udpPort}`);
      }
      return { success: true };
    }

    if (device.protocol === 'LoRaWAN') {
      store.updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
      if (!options?.silent) {
        store.addLog(device.id, device.name, 'success', `LoRaWAN ready: ${device.loraDevEui}`);
      }
      return { success: true };
    }

    if (device.protocol === 'Video') {
      const dto: Record<string, unknown> = {
        name: device.name,
        streamMode: device.streamMode,
      };
      if (device.streamMode === 'GB28181') {
        dto.gbDeviceId = device.gbDeviceId;
        dto.gbDomain = device.gbDomain;
        dto.transport = 'UDP';
      } else {
        dto.ip = '127.0.0.1';
      }
      const result = await window.electronAPI.videoCreateDevice(device.mediaBaseUrl, dto);
      if (result.success && result.data?.data?.id) {
        store.updateDevice(device.id, {
          status: 'online',
          videoDeviceId: result.data.data.id,
          restoreOnLaunch: false,
        });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `Video device created: ${result.data.data.id}`);
        }
        return { success: true };
      }
      throw new Error(result.data?.msg || result.message || 'Video device create failed');
    }

    const validationError = validateMqttDevice(device);
    if (validationError) {
      throw new Error(validationError);
    }

    let target = device;
    if (shouldDynamicRegister(device)) {
      const registerResult = await dynamicRegisterDevice(device, device.mqttRegisterBaseUrl);
      target = { ...device, deviceSecret: registerResult.deviceSecret };
      store.updateDevice(device.id, {
        deviceSecret: registerResult.deviceSecret,
        dynamicRegistered: true,
      });
      store.addLog(device.id, device.name, 'success', `Dynamic registration succeeded: ${registerResult.deviceName}`);
    }

    const identity = resolveMqttIdentity(target);
    const mqttOpts: {
      clean: boolean;
      keepalive: number;
      willTopic?: string;
      willPayload?: string;
      willQos?: number;
      willRetain?: boolean;
    } = {
      clean: target.mqttClean,
      keepalive: target.mqttKeepalive || 60,
    };
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
    if (!result.success) {
      throw new Error(result.message || 'MQTT connect failed');
    }

    const serviceTopic = buildMqttServiceTopic(target);
    if (serviceTopic) {
      const subResult = await window.electronAPI.mqttSubscribe(target.id, serviceTopic, 1);
      if (!subResult.success) {
        store.addLog(target.id, target.name, 'warn', `Subscribe failed: ${subResult.message}`);
      }
    }

    store.updateDevice(target.id, { status: 'online', restoreOnLaunch: true });
    if (!options?.silent) {
      store.addLog(target.id, target.name, 'success', `MQTT connected: ${target.mqttBrokerUrl}`);
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const latest = getDevice(deviceId) || device;
    store.updateDevice(deviceId, {
      status: 'error',
      restoreOnLaunch: options?.restoring ? latest.restoreOnLaunch : false,
    });
    store.addLog(deviceId, latest.name, 'error', `Connect error: ${message}`);
    return { success: false, message };
  }
}

export async function disconnectSimDevice(deviceId: string, options?: { silent?: boolean }) {
  const store = useSimStore.getState();
  const device = getDevice(deviceId);
  if (!device) {
    return { success: false, message: 'Device not found' };
  }

  try {
    clearDeviceAutoTimer(device);
    if (device.protocol === 'MQTT') {
      await window.electronAPI.mqttDisconnect(device.id);
    }
    if (device.protocol === 'WebSocket') {
      await window.electronAPI.wsDisconnect(device.id);
    }
    if (device.protocol === 'TCP') {
      await window.electronAPI.tcpDisconnect(device.id);
    }
    if (device.protocol === 'Video' && device.streamMode === 'GB28181') {
      await window.electronAPI.sipStop(device.id);
    }
    store.updateDevice(device.id, {
      status: 'offline',
      token: '',
      videoDeviceId: null,
      streamUrl: '',
      sipRegistered: false,
      autoReport: false,
      autoTimerId: null,
      restoreOnLaunch: false,
    });
    if (!options?.silent) {
      store.addLog(device.id, device.name, 'info', 'Disconnected');
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    store.updateDevice(device.id, {
      status: 'offline',
      autoReport: false,
      autoTimerId: null,
      restoreOnLaunch: false,
    });
    store.addLog(device.id, device.name, 'warn', `Disconnect warning: ${message}`);
    return { success: false, message };
  }
}

export async function restorePersistedConnections() {
  if (restoreCompleted) {
    return;
  }
  if (restoreInFlight) {
    return restoreInFlight;
  }

  restoreInFlight = (async () => {
    const store = useSimStore.getState();
    const targets = store.devices.filter(
      (device) => device.restoreOnLaunch && isRestorableProtocol(device.protocol),
    );
    if (targets.length === 0) {
      restoreCompleted = true;
      return;
    }

    // Restore sequentially so startup logs remain readable and reconnect traffic
    // does not stampede shared backends such as MQTT brokers or HTTP gateways.
    store.addLog('system', 'System', 'info', `Restoring ${targets.length} persisted device connection(s)`);
    for (const device of targets) {
      await connectSimDevice(device.id, { silent: true, restoring: true });
    }
    restoreCompleted = true;
  })();

  try {
    await restoreInFlight;
  } finally {
    restoreInFlight = null;
  }
}
