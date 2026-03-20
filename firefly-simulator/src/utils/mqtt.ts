import type { SimDevice, SimDeviceLocator } from '../store';

export interface MqttIdentity {
  productKey: string;
  deviceName: string;
  clientId: string;
  username: string;
  password: string;
}

export interface DynamicRegisterResult {
  productKey?: string;
  deviceName: string;
  deviceSecret: string;
}

export interface MqttSubscriptionPlan {
  topic: string;
  qos: 0 | 1 | 2;
  label: string;
}

const MQTT_TOPIC_PATTERN = /^\/sys\/[^/]+\/[^/]+\/(.+)$/;

type DeviceIdentitySource = Partial<Pick<
  SimDevice,
  'productKey' | 'deviceName' | 'deviceSecret' | 'mqttClientId' | 'mqttUsername' | 'mqttPassword'
>>;

type DynamicRegisterSource = Pick<
  SimDevice,
  'name' | 'nickname' | 'productKey' | 'productSecret' | 'deviceName' | 'locators'
>;

type DynamicCleanupSource = Pick<
  SimDevice,
  'protocol' | 'httpAuthMode' | 'mqttAuthMode' | 'dynamicRegistered' | 'productKey' | 'productSecret' | 'deviceName'
>;

type DynamicRetrySource = Pick<
  SimDevice,
  'protocol' | 'httpAuthMode' | 'mqttAuthMode' | 'dynamicRegistered' | 'deviceSecret'
>;

type DynamicRetryFailure =
  | string
  | {
      code?: number;
      status?: number;
      _status?: number;
      message?: string;
      msg?: string;
      errorCode?: string;
    }
  | null
  | undefined;

function trim(value?: string | null): string {
  return (value ?? '').trim();
}

function normalizeLocators(locators?: SimDeviceLocator[]) {
  const normalized = (locators || [])
    .map((item) => ({
      locatorType: trim(item.locatorType).toUpperCase(),
      locatorValue: trim(item.locatorValue),
      primaryLocator: Boolean(item.primaryLocator),
    }))
    .filter((item) => item.locatorType && item.locatorValue);
  if (normalized.length > 0 && !normalized.some((item) => item.primaryLocator)) {
    normalized[0].primaryLocator = true;
  }
  return normalized.length > 0 ? normalized : undefined;
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

export function buildMqttPropertySetTopic(device: DeviceIdentitySource): string {
  const { productKey, deviceName } = resolveMqttIdentity(device);
  return productKey && deviceName ? `/sys/${productKey}/${deviceName}/thing/property/set` : '';
}

export function buildMqttServiceTopic(device: DeviceIdentitySource): string {
  const { productKey, deviceName } = resolveMqttIdentity(device);
  return productKey && deviceName ? `/sys/${productKey}/${deviceName}/thing/service/+` : '';
}

export function buildMqttDownstreamTopic(device: DeviceIdentitySource): string {
  const { productKey, deviceName } = resolveMqttIdentity(device);
  return productKey && deviceName ? `/sys/${productKey}/${deviceName}/thing/downstream` : '';
}

export function buildDefaultMqttSubscriptions(device: DeviceIdentitySource): MqttSubscriptionPlan[] {
  const subscriptions: MqttSubscriptionPlan[] = [
    { topic: buildMqttPropertySetTopic(device), qos: 1, label: '属性设置' },
    { topic: buildMqttServiceTopic(device), qos: 1, label: '服务调用' },
    { topic: buildMqttDownstreamTopic(device), qos: 1, label: '通用下行' },
  ];
  return subscriptions.filter((item) => Boolean(item.topic));
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
    locators: normalizeLocators(device.locators),
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
    productKey: trim(data.productKey) || productKey,
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

export function usesProductSecretAuth(
  device: Pick<SimDevice, 'protocol' | 'httpAuthMode' | 'mqttAuthMode'>,
): boolean {
  if (device.protocol === 'HTTP') {
    return (device.httpAuthMode || 'DEVICE_SECRET') === 'PRODUCT_SECRET';
  }
  if (device.protocol === 'MQTT') {
    return (device.mqttAuthMode || 'DEVICE_SECRET') === 'PRODUCT_SECRET';
  }
  return false;
}

function normalizeFailureText(failure: DynamicRetryFailure): string {
  if (!failure) {
    return '';
  }
  if (typeof failure === 'string') {
    return failure.trim().toLowerCase();
  }
  return [
    typeof failure.code === 'number' ? String(failure.code) : '',
    typeof failure.status === 'number' ? String(failure.status) : '',
    typeof failure._status === 'number' ? String(failure._status) : '',
    failure.message || '',
    failure.msg || '',
    failure.errorCode || '',
  ]
    .join(' ')
    .trim()
    .toLowerCase();
}

export function shouldRetryDynamicRegisterAfterFailure(
  device: DynamicRetrySource,
  failure: DynamicRetryFailure,
): boolean {
  if (!usesProductSecretAuth(device)) {
    return false;
  }
  if (!trim(device.deviceSecret)) {
    return false;
  }

  const normalizedFailure = normalizeFailureText(failure);
  if (!normalizedFailure) {
    return false;
  }

  const retryableKeywords = [
    '401',
    'unauthorized',
    'not authorized',
    'bad username or password',
    'invalid_credentials',
    'device_not_found',
    'invalid_secret',
    'device_secret_required',
    'auth failed',
  ];

  return retryableKeywords.some((keyword) => normalizedFailure.includes(keyword));
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

function extractAction(topic?: string | null): string {
  const matches = MQTT_TOPIC_PATTERN.exec((topic ?? '').trim());
  return matches?.[3] || '';
}

export function resolveMqttMessageLabel(topic: string): string {
  switch (extractAction(topic)) {
    case 'thing/property/set':
      return '属性设置下行';
    case 'thing/service/invoke':
      return '服务调用下行';
    case 'thing/downstream':
      return '通用下行';
    case 'thing/property/post':
      return '属性上报';
    case 'thing/event/post':
      return '事件上报';
    case 'thing/property/set/reply':
      return '属性设置应答';
    case 'thing/service/reply':
      return '服务调用应答';
    default:
      return 'MQTT 消息';
  }
}

export function buildMqttInboundLogMessage(topic: string, payload: string): string {
  return `[${resolveMqttMessageLabel(topic)}] ${topic}\n${payload}`;
}
