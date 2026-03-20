import type { SimDevice, SimDeviceLocator } from '../store';

function trim(value?: string | null): string {
  return (value ?? '').trim();
}

export function normalizeTransportLocators(locators?: SimDeviceLocator[]) {
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

  return normalized;
}

export function resolveTransportDeviceName(device: Pick<SimDevice, 'deviceName' | 'name'>) {
  return trim(device.deviceName) || trim(device.name);
}

export function buildTransportBindingPayload(device: Pick<SimDevice, 'productKey' | 'deviceName' | 'name' | 'locators'>) {
  return JSON.stringify({
    _fireflyBinding: {
      productKey: trim(device.productKey),
      deviceName: resolveTransportDeviceName(device),
      locators: normalizeTransportLocators(device.locators),
    },
  });
}

export function buildWebSocketConnectParams(
  device: Pick<
    SimDevice,
    'wsDeviceId' | 'wsProductId' | 'wsTenantId' | 'productKey' | 'deviceName' | 'name' | 'locators'
  >,
) {
  const locators = normalizeTransportLocators(device.locators);
  return {
    deviceId: trim(device.wsDeviceId) || undefined,
    productId: trim(device.wsProductId) || undefined,
    tenantId: trim(device.wsTenantId) || undefined,
    productKey: trim(device.productKey) || undefined,
    deviceName: resolveTransportDeviceName(device) || undefined,
    locators: locators.length > 0 ? JSON.stringify(locators) : undefined,
  };
}

export function resolveLoRaApiBaseUrl(webhookUrl: string) {
  const parsed = new URL(webhookUrl);
  const matched = parsed.pathname.match(/^(.*\/api\/v1\/lorawan)(?:\/.*)?$/);
  const basePath = matched?.[1] || '/api/v1/lorawan';
  return `${parsed.origin}${basePath}`;
}
