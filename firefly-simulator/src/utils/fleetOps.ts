import { useSimStore, type SimDevice } from '../store';
import { connectSimDevice, disconnectSimDevice } from './runtime';
import { shouldCleanupDynamicRegistration, unregisterDynamicDevice } from './mqtt';

export interface FleetProgress {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
}

export interface FleetResult {
  succeeded: number;
  failed: number;
  errors: Array<{ deviceName: string; message: string }>;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  onProgress?: (progress: FleetProgress) => void,
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;
  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await worker(items[index], index);
        succeeded += 1;
      } catch {
        failed += 1;
      } finally {
        completed += 1;
        onProgress?.({ current: completed, total: items.length, succeeded, failed });
      }
    }
  });
  await Promise.all(runners);
}

/** 批量连接：限并发，避免一次拉起上千个 IPC 连接把主进程压满。 */
export async function connectDevices(
  deviceIds: string[],
  options: { concurrency?: number; onProgress?: (progress: FleetProgress) => void } = {},
): Promise<FleetResult> {
  const store = useSimStore.getState();
  const devices = deviceIds
    .map((id) => store.devices.find((item) => item.id === id))
    .filter((item): item is SimDevice => Boolean(item));
  const errors: Array<{ deviceName: string; message: string }> = [];
  let succeeded = 0;
  await runPool(devices, options.concurrency ?? 8, async (device) => {
    const result = await connectSimDevice(device.id, { silent: true });
    if (result.success) {
      succeeded += 1;
    } else {
      errors.push({ deviceName: device.name, message: result.message || '连接失败' });
      throw new Error(result.message || '连接失败');
    }
  }, options.onProgress);
  return { succeeded, failed: errors.length, errors };
}

/** 批量断开：忽略单个设备失败，最终汇总。 */
export async function disconnectDevices(
  deviceIds: string[],
  options: { concurrency?: number; onProgress?: (progress: FleetProgress) => void } = {},
): Promise<FleetResult> {
  const store = useSimStore.getState();
  const devices = deviceIds
    .map((id) => store.devices.find((item) => item.id === id))
    .filter((item): item is SimDevice => Boolean(item));
  const errors: Array<{ deviceName: string; message: string }> = [];
  let succeeded = 0;
  await runPool(devices, options.concurrency ?? 8, async (device) => {
    const result = await disconnectSimDevice(device.id, { silent: true });
    if (result.success) {
      succeeded += 1;
    } else {
      errors.push({ deviceName: device.name, message: result.message || '断开失败' });
      throw new Error(result.message || '断开失败');
    }
  }, options.onProgress);
  return { succeeded, failed: errors.length, errors };
}

/** 批量删除：先断开连接并清理动态注册，再从本地移除。 */
export async function removeDevices(
  deviceIds: string[],
  options: { concurrency?: number; onProgress?: (progress: FleetProgress) => void } = {},
): Promise<FleetResult> {
  const store = useSimStore.getState();
  const devices = deviceIds
    .map((id) => store.devices.find((item) => item.id === id))
    .filter((item): item is SimDevice => Boolean(item));
  const errors: Array<{ deviceName: string; message: string }> = [];
  const removedIds: string[] = [];
  let succeeded = 0;
  await runPool(devices, options.concurrency ?? 6, async (device) => {
    try {
      if (device.status === 'online') {
        await disconnectSimDevice(device.id, { silent: true });
      }
      if (shouldCleanupDynamicRegistration(device)) {
        const registerBaseUrl = device.protocol === 'HTTP'
          ? device.httpRegisterBaseUrl
          : device.protocol === 'MQTT'
            ? device.mqttRegisterBaseUrl
            : undefined;
        await unregisterDynamicDevice(device, registerBaseUrl);
      }
      removedIds.push(device.id);
      succeeded += 1;
    } catch (error) {
      errors.push({ deviceName: device.name, message: error instanceof Error ? error.message : '删除失败' });
      throw error;
    }
  }, options.onProgress);
  useSimStore.getState().removeDevices(removedIds);
  return { succeeded, failed: errors.length, errors };
}

/** 自动上报使用与压测一致的负载发送器（按协议分流），供批量开启使用。 */
export async function stopAllAutoReportTimers(): Promise<void> {
  const devices = useSimStore.getState().devices;
  for (const device of devices) {
    if (device.autoTimerId) {
      window.clearInterval(device.autoTimerId);
      useSimStore.getState().updateDevice(device.id, { autoReport: false, autoTimerId: null });
    }
    if (device.heartbeatTimerId) {
      window.clearInterval(device.heartbeatTimerId);
      useSimStore.getState().updateDevice(device.id, { heartbeatTimerId: null });
    }
  }
}
