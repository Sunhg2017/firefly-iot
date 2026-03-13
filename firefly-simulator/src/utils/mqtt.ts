import type { SimDevice } from '../store';

export interface MqttIdentity {
  productKey: string;
  deviceName: string;
  clientId: string;
  username: string;
  password: string;
}

export interface DynamicRegisterResult {
  deviceId?: number;
  productId?: number;
  deviceName: string;
  deviceSecret: string;
}

type DeviceIdentitySource = Partial<Pick<
  SimDevice,
  'productKey' | 'deviceName' | 'deviceSecret' | 'mqttClientId' | 'mqttUsername' | 'mqttPassword'
>>;

type DynamicRegisterSource = Pick<
  SimDevice,
  'name' | 'nickname' | 'productKey' | 'productSecret' | 'deviceName'
>;

type DynamicCleanupSource = Pick<
  SimDevice,
  'protocol' | 'httpAuthMode' | 'mqttAuthMode' | 'dynamicRegistered' | 'productKey' | 'productSecret' | 'deviceName'
>;

function trim(value?: string | null): string {
  return (value ?? '').trim();
}

export function buildMqttClientId(productKey: string, deviceName: string): string {
  return productKey && deviceName ? `${productKey}.${deviceName}` : '';
}

export function buildMqttUsername(productKey: string, deviceName: string): string {
  return productKey && deviceName ? `${deviceName}&${productKey}` : '';
}

export function resolveMqttIdentity(device: DeviceIdentitySource): MqttIdentity {
  const productKey = trim(device.productKey);
  const deviceName = trim(device.deviceName);

  return {
    productKey,
    deviceName,
    clientId: trim(device.mqttClientId) || buildMqttClientId(productKey, deviceName),
    username: trim(device.mqttUsername) || buildMqttUsername(productKey, deviceName),
    password: trim(device.mqttPassword) || trim(device.deviceSecret),
  };
}

export function buildMqttPublishTopic(device: DeviceIdentitySource, type: 'property' | 'event'): string {
  const { productKey, deviceName } = resolveMqttIdentity(device);
  return productKey && deviceName ? `/sys/${productKey}/${deviceName}/thing/${type}/post` : '';
}

export function buildMqttServiceTopic(device: DeviceIdentitySource): string {
  const { productKey, deviceName } = resolveMqttIdentity(device);
  return productKey && deviceName ? `/sys/${productKey}/${deviceName}/thing/service/+` : '';
}

export function validateMqttDevice(device: Pick<
  SimDevice,
  'protocol' | 'mqttBrokerUrl' | 'mqttAuthMode' | 'productKey' | 'productSecret' | 'deviceName' | 'deviceSecret' | 'mqttPassword'
>): string | null {
  if (device.protocol !== 'MQTT') {
    return null;
  }

  const brokerUrl = trim(device.mqttBrokerUrl);
  const { productKey, deviceName, password } = resolveMqttIdentity(device);

  if (!brokerUrl) {
    return 'MQTT broker URL is required';
  }
  if (!productKey) {
    return 'Product Key is required';
  }
  if (!deviceName) {
    return 'Device Name is required';
  }
  if (device.mqttAuthMode === 'PRODUCT_SECRET' && !trim(device.productSecret)) {
    return 'Product Secret is required for dynamic registration';
  }
  if (device.mqttAuthMode === 'DEVICE_SECRET' && !password) {
    return 'Device Secret is required for MQTT auth';
  }

  return null;
}

export async function dynamicRegisterDevice(device: DynamicRegisterSource, registerBaseUrl?: string): Promise<DynamicRegisterResult> {
  const baseUrl = trim(registerBaseUrl) || 'http://localhost:9070';
  const productKey = trim(device.productKey);
  const productSecret = trim(device.productSecret);
  const deviceName = trim(device.deviceName);

  const response = await window.electronAPI.deviceDynamicRegister(baseUrl, {
    productKey,
    productSecret,
    deviceName,
    nickname: trim(device.nickname) || trim(device.name) || undefined,
  });

  if (!response?.success) {
    throw new Error(response?.message || 'Dynamic registration request failed');
  }
  if (typeof response.code === 'number' && response.code !== 0) {
    throw new Error(response.message || 'Dynamic registration failed');
  }

  const data = response.data ?? {};
  const deviceSecret = trim(data.deviceSecret);
  if (!deviceSecret) {
    throw new Error('Dynamic registration response missing deviceSecret');
  }

  return {
    deviceId: typeof data.deviceId === 'number' ? data.deviceId : undefined,
    productId: typeof data.productId === 'number' ? data.productId : undefined,
    deviceName: trim(data.deviceName) || deviceName,
    deviceSecret,
  };
}

export function shouldDynamicRegister(
  device: Pick<SimDevice, 'protocol' | 'httpAuthMode' | 'mqttAuthMode' | 'deviceSecret'>,
): boolean {
  const deviceSecret = trim(device.deviceSecret);
  if (device.protocol === 'HTTP') {
    return (device.httpAuthMode || 'DEVICE_SECRET') === 'PRODUCT_SECRET' && !deviceSecret;
  }
  if (device.protocol === 'MQTT') {
    return (device.mqttAuthMode || 'DEVICE_SECRET') === 'PRODUCT_SECRET' && !deviceSecret;
  }
  return false;
}

export function shouldCleanupDynamicRegistration(device: DynamicCleanupSource): boolean {
  if (!device.dynamicRegistered) {
    return false;
  }
  if (device.protocol === 'HTTP') {
    return device.httpAuthMode === 'PRODUCT_SECRET';
  }
  if (device.protocol === 'MQTT') {
    return device.mqttAuthMode === 'PRODUCT_SECRET';
  }
  return false;
}

export async function unregisterDynamicDevice(device: DynamicCleanupSource, registerBaseUrl?: string): Promise<void> {
  const baseUrl = trim(registerBaseUrl) || 'http://localhost:9070';
  const productKey = trim(device.productKey);
  const productSecret = trim(device.productSecret);
  const deviceName = trim(device.deviceName);

  const response = await window.electronAPI.deviceDynamicUnregister(baseUrl, {
    productKey,
    productSecret,
    deviceName,
  });

  if (!response?.success) {
    throw new Error(response?.message || 'Dynamic unregister request failed');
  }
  if (typeof response.code === 'number' && response.code !== 0) {
    throw new Error(response.message || 'Dynamic unregister failed');
  }
}
