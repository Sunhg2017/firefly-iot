import type { Protocol, SimDevice } from '../store';
import { useSimStore } from '../store';
import {
  buildDefaultMqttSubscriptions,
  dynamicRegisterDevice,
  resolveMqttIdentity,
  shouldDynamicRegister,
  shouldRetryDynamicRegisterAfterFailure,
  validateMqttDevice,
} from './mqtt';
import { getDeviceAccessValidationError } from './deviceAccess';
import { buildLifecycleEventPayload, invokeHttpLifecycle } from './httpLifecycle';
import { buildTransportBindingPayload, buildWebSocketConnectParams } from './transportBinding';
import {
  buildVideoCreatePayload,
  buildVideoUpdatePayload,
  getActiveVideoApiContext,
  getVideoIdentityKeyword,
  matchesVideoIdentity,
} from './video';

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

function clearDeviceHeartbeatTimer(device: SimDevice) {
  if (device.heartbeatTimerId) {
    window.clearInterval(device.heartbeatTimerId);
  }
}

function isSuccessfulResponse(result: any) {
  return Boolean(result?.success) && (typeof result?.code !== 'number' || result.code === 0);
}

function extractVideoResultMessage(result: any, fallback: string) {
  return result?.data?.message
    || result?.data?.msg
    || result?.message
    || fallback;
}

function isVideoBizSuccess(result: any) {
  return Boolean(result?.success) && Number(result?.data?.code ?? 0) === 0;
}

async function findExistingVideoDevice(device: SimDevice) {
  const videoApiContext = getActiveVideoApiContext();
  if (!videoApiContext) {
    throw new Error('请先登录当前环境后再连接视频设备');
  }

  const keyword = getVideoIdentityKeyword(device);
  if (!keyword) {
    return null;
  }

  const result = await window.electronAPI.deviceVideoList(
    videoApiContext.baseUrl,
    {
      pageNum: 1,
      pageSize: 100,
      keyword,
      streamMode: device.streamMode,
    },
    videoApiContext.accessToken,
  );
  if (!isVideoBizSuccess(result)) {
    throw new Error(extractVideoResultMessage(result, '查询平台设备资产失败'));
  }

  const records = Array.isArray(result.data?.data?.records) ? result.data.data.records : [];
  return records.find((item: any) => matchesVideoIdentity(device, item)) || null;
}

async function syncVideoDevice(device: SimDevice) {
  const videoApiContext = getActiveVideoApiContext();
  if (!videoApiContext) {
    throw new Error('请先登录当前环境后再连接视频设备');
  }

  const createPayload = buildVideoCreatePayload(device);
  const updatePayload = buildVideoUpdatePayload(device);

  if (device.platformDeviceId) {
    const detail = await window.electronAPI.deviceVideoGet(
      videoApiContext.baseUrl,
      device.platformDeviceId,
      videoApiContext.accessToken,
    );
    if (isVideoBizSuccess(detail)) {
      const updateResult = await window.electronAPI.deviceVideoUpdate(
        videoApiContext.baseUrl,
        device.platformDeviceId,
        updatePayload,
        videoApiContext.accessToken,
      );
      if (!isVideoBizSuccess(updateResult)) {
        throw new Error(extractVideoResultMessage(updateResult, '更新平台设备资产失败'));
      }
      return { id: device.platformDeviceId, reused: true };
    }
  }

  const createResult = await window.electronAPI.deviceVideoCreate(
    videoApiContext.baseUrl,
    createPayload,
    videoApiContext.accessToken,
  );
  if (isVideoBizSuccess(createResult) && createResult.data?.data?.id) {
    return { id: Number(createResult.data.data.id), reused: false };
  }

  const createMessage = extractVideoResultMessage(createResult, '创建设备资产失败');
  if (!createMessage.includes('已存在')) {
    throw new Error(createMessage);
  }

  const existing = await findExistingVideoDevice(device);
  if (!existing?.id) {
    throw new Error(createMessage);
  }

  const updateResult = await window.electronAPI.deviceVideoUpdate(
    videoApiContext.baseUrl,
    Number(existing.id),
    updatePayload,
    videoApiContext.accessToken,
  );
  if (!isVideoBizSuccess(updateResult)) {
        throw new Error(extractVideoResultMessage(updateResult, '更新已存在设备资产失败'));
  }
  return { id: Number(existing.id), reused: true };
}

async function refreshDynamicRegistrationSecret(device: SimDevice) {
  const store = useSimStore.getState();
  const registerBaseUrl = device.protocol === 'HTTP' ? device.httpRegisterBaseUrl : device.mqttRegisterBaseUrl;
  const registerResult = await dynamicRegisterDevice(device, registerBaseUrl);
  const refreshedDevice = {
    ...device,
    deviceSecret: registerResult.deviceSecret,
    dynamicRegistered: true,
  };
  store.updateDevice(device.id, {
    deviceSecret: registerResult.deviceSecret,
    dynamicRegistered: true,
  });
  store.addLog(device.id, device.name, 'info', 'Cached DeviceSecret was refreshed by dynamic registration');
  return refreshedDevice;
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
      let result = await window.electronAPI.httpAuth(
        target.httpBaseUrl,
        target.productKey,
        target.deviceName,
        target.deviceSecret,
      );
      if ((!result.success || !result.data?.token) && shouldRetryDynamicRegisterAfterFailure(target, result)) {
        store.addLog(device.id, device.name, 'warn', 'HTTP auth failed with cached DeviceSecret, retrying dynamic registration');
        try {
          target = await refreshDynamicRegistrationSecret(target);
          result = await window.electronAPI.httpAuth(
            target.httpBaseUrl,
            target.productKey,
            target.deviceName,
            target.deviceSecret,
          );
        } catch (retryError) {
          const retryMessage = retryError instanceof Error ? retryError.message : 'unknown error';
          store.addLog(device.id, device.name, 'warn', `Dynamic registration retry failed: ${retryMessage}`);
        }
      }
      if (result.success && result.data?.token) {
        const targetOnline = { ...target, token: result.data.token };
        store.updateDevice(device.id, {
          status: 'online',
          token: result.data.token,
          restoreOnLaunch: true,
        });
        try {
          const lifecycle = await invokeHttpLifecycle(
            targetOnline,
            'online',
            buildLifecycleEventPayload(targetOnline, 'online'),
          );
          if (!isSuccessfulResponse(lifecycle.result)) {
            store.addLog(device.id, device.name, 'warn', `HTTP online event failed: ${lifecycle.result?.message || lifecycle.result?.msg || 'unknown error'}`);
          }
        } catch (lifecycleError) {
          const lifecycleMessage = lifecycleError instanceof Error ? lifecycleError.message : 'unknown error';
          store.addLog(device.id, device.name, 'warn', `HTTP online event failed: ${lifecycleMessage}`);
        }
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
      const result = await window.electronAPI.wsConnect(device.id, device.wsEndpoint, buildWebSocketConnectParams(device));
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
        const bindingResult = await window.electronAPI.tcpSend(device.id, buildTransportBindingPayload(device));
        if (!bindingResult.success) {
          await window.electronAPI.tcpDisconnect(device.id);
          throw new Error(bindingResult.message || 'TCP binding bootstrap failed');
        }
        store.updateDevice(device.id, { status: 'online', restoreOnLaunch: true });
        if (!options?.silent) {
          store.addLog(device.id, device.name, 'success', `TCP connected: ${device.tcpHost}:${device.tcpPort}`);
        }
        return { success: true };
      }
      throw new Error(result.message || 'TCP connect failed');
    }

    if (device.protocol === 'UDP') {
      const result = await window.electronAPI.udpConnect(device.id, device.udpHost, device.udpPort);
      if (!result.success) {
        throw new Error(result.message || 'UDP connect failed');
      }
      const bindingResult = await window.electronAPI.udpSend(device.id, buildTransportBindingPayload(device));
      if (!bindingResult.success) {
        await window.electronAPI.udpDisconnect(device.id);
        throw new Error(bindingResult.message || 'UDP binding bootstrap failed');
      }
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
      const synced = await syncVideoDevice(device);
      store.updateDevice(device.id, {
        status: 'online',
        platformDeviceId: synced.id,
        restoreOnLaunch: false,
      });
      if (!options?.silent) {
        store.addLog(
          device.id,
          device.name,
          'success',
          synced.reused ? `视频设备资产已同步: ${synced.id}` : `视频设备资产已创建: ${synced.id}`,
        );
      }
      return { success: true };
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

    let result = await window.electronAPI.mqttConnect(
      target.id,
      target.mqttBrokerUrl,
      identity.clientId,
      identity.username,
      identity.password,
      mqttOpts,
    );
    if (!result.success && shouldRetryDynamicRegisterAfterFailure(target, result)) {
      store.addLog(target.id, target.name, 'warn', 'MQTT connect failed with cached DeviceSecret, retrying dynamic registration');
      try {
        target = await refreshDynamicRegistrationSecret(target);
        const refreshedIdentity = resolveMqttIdentity(target);
        result = await window.electronAPI.mqttConnect(
          target.id,
          target.mqttBrokerUrl,
          refreshedIdentity.clientId,
          refreshedIdentity.username,
          refreshedIdentity.password,
          mqttOpts,
        );
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : 'unknown error';
        store.addLog(target.id, target.name, 'warn', `Dynamic registration retry failed: ${retryMessage}`);
      }
    }
    if (!result.success) {
      throw new Error(result.message || 'MQTT connect failed');
    }

    for (const subscription of buildDefaultMqttSubscriptions(target)) {
      const subResult = await window.electronAPI.mqttSubscribe(target.id, subscription.topic, subscription.qos);
      if (!subResult.success) {
        store.addLog(target.id, target.name, 'warn', `自动订阅${subscription.label}主题失败：${subResult.message}`);
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
    clearDeviceHeartbeatTimer(device);
    if (device.protocol === 'HTTP' && device.token) {
      try {
        const lifecycle = await invokeHttpLifecycle(
          device,
          'offline',
          buildLifecycleEventPayload(device, 'offline'),
        );
        if (!isSuccessfulResponse(lifecycle.result)) {
          store.addLog(device.id, device.name, 'warn', `HTTP offline event failed: ${lifecycle.result?.message || lifecycle.result?.msg || 'unknown error'}`);
        }
      } catch (lifecycleError) {
        const lifecycleMessage = lifecycleError instanceof Error ? lifecycleError.message : 'unknown error';
        store.addLog(device.id, device.name, 'warn', `HTTP offline event failed: ${lifecycleMessage}`);
      }
    }
    if (device.protocol === 'MQTT') {
      await window.electronAPI.mqttDisconnect(device.id);
    }
    if (device.protocol === 'WebSocket') {
      await window.electronAPI.wsDisconnect(device.id);
    }
    if (device.protocol === 'TCP') {
      await window.electronAPI.tcpDisconnect(device.id);
    }
    if (device.protocol === 'UDP') {
      await window.electronAPI.udpDisconnect(device.id);
    }
    if (device.protocol === 'Video' && device.platformDeviceId) {
      const videoApiContext = getActiveVideoApiContext();
      if (videoApiContext) {
        await window.electronAPI.videoControlStopStream(
          videoApiContext.baseUrl,
          device.platformDeviceId,
          videoApiContext.accessToken,
        );
      }
    }
    if (device.protocol === 'Video' && device.streamMode === 'GB28181') {
      await window.electronAPI.sipStop(device.id);
    }
    store.updateDevice(device.id, {
      status: 'offline',
      token: '',
      streamUrl: '',
      sipRegistered: false,
      sipKeepaliveEnabled: false,
      autoReport: false,
      autoTimerId: null,
      heartbeatTimerId: null,
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
      sipKeepaliveEnabled: false,
      autoReport: false,
      autoTimerId: null,
      heartbeatTimerId: null,
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
