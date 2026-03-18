import type { SimDevice } from '../store';

export type HttpLifecycleIdentifier = 'online' | 'offline' | 'heartbeat';

const HTTP_LIFECYCLE_PATHS: Record<HttpLifecycleIdentifier, string> = {
  online: 'online',
  offline: 'offline',
  heartbeat: 'heartbeat',
};

const LIFECYCLE_EVENT_LABELS: Record<HttpLifecycleIdentifier, string> = {
  online: 'Online',
  offline: 'Offline',
  heartbeat: 'Heartbeat',
};

type HttpLifecycleContext = Pick<SimDevice, 'httpBaseUrl' | 'token' | 'protocol' | 'productKey' | 'deviceName'>;

export function buildLifecycleEventPayload(
  device: Pick<SimDevice, 'protocol' | 'productKey' | 'deviceName'>,
  identifier: HttpLifecycleIdentifier,
): Record<string, unknown> {
  return {
    identifier,
    eventType: identifier,
    eventName: LIFECYCLE_EVENT_LABELS[identifier],
    timestamp: Date.now(),
    occurredAt: new Date().toISOString(),
    protocol: device.protocol,
    productKey: device.productKey,
    deviceName: device.deviceName,
    ip: `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 253) + 2}`,
  };
}

export function resolveHttpLifecycleUrl(device: Pick<SimDevice, 'httpBaseUrl'>, identifier: HttpLifecycleIdentifier): string {
  return `${device.httpBaseUrl}/api/v1/protocol/http/${HTTP_LIFECYCLE_PATHS[identifier]}`;
}

export async function invokeHttpLifecycle(
  device: HttpLifecycleContext,
  identifier: HttpLifecycleIdentifier,
  payload: Record<string, unknown> = buildLifecycleEventPayload(device, identifier),
) {
  const url = resolveHttpLifecycleUrl(device, identifier);
  let result;
  if (identifier === 'online') {
    result = await window.electronAPI.httpOnline(device.httpBaseUrl, device.token, payload);
  } else if (identifier === 'offline') {
    result = await window.electronAPI.httpOffline(device.httpBaseUrl, device.token, payload);
  } else {
    result = await window.electronAPI.httpHeartbeat(device.httpBaseUrl, device.token, payload);
  }
  return { url, payload, result };
}
