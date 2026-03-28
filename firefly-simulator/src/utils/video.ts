import type { SimDevice } from '../store';
import type { SimulatorEnvironment } from '../workspaceStore';
import { getActiveEnvironment, useSimWorkspaceStore } from '../workspaceStore';

export type SimulatorVideoStreamMode = 'GB28181' | 'RTSP' | 'RTMP';

export interface ParsedVideoSourceUrl {
  normalizedUrl: string;
  host: string;
  port: number;
}

export interface LocalVideoModeOption {
  key: string;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export interface SimulatorMediaPublishConfig {
  gatewayBaseUrl?: string | null;
  mediaHost?: string | null;
  mediaRtspPort?: number | null;
  mediaRtmpPort?: number | null;
}

function resolveMediaPublishConfig(
  environmentOrConfig?: SimulatorEnvironment | SimulatorMediaPublishConfig | null,
): SimulatorMediaPublishConfig {
  if (!environmentOrConfig) {
    return {};
  }
  return {
    gatewayBaseUrl: environmentOrConfig.gatewayBaseUrl,
    mediaHost: environmentOrConfig.mediaHost,
    mediaRtspPort: environmentOrConfig.mediaRtspPort,
    mediaRtmpPort: environmentOrConfig.mediaRtmpPort,
  };
}

function resolveMediaPublishHost(config: SimulatorMediaPublishConfig): string {
  const explicitHost = trimText(config.mediaHost);
  if (explicitHost) {
    return explicitHost;
  }
  try {
    const parsed = new URL(trimText(config.gatewayBaseUrl));
    return trimText(parsed.hostname) || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

function resolveMediaPublishPort(config: SimulatorMediaPublishConfig, mode: SimulatorVideoStreamMode): number {
  const configuredPort = Number(mode === 'RTMP' ? config.mediaRtmpPort : config.mediaRtspPort);
  if (Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535) {
    return configuredPort;
  }
  return mode === 'RTMP' ? 1935 : 554;
}

export function buildLocalCameraSourceUrl(
  environmentOrConfig: SimulatorEnvironment | SimulatorMediaPublishConfig | null | undefined,
  streamMode: string | null | undefined,
  simulatorDeviceId: string,
): string {
  const normalizedMode = normalizeVideoStreamMode(streamMode);
  if (!isProxyVideoMode(normalizedMode)) {
    return '';
  }
  const config = resolveMediaPublishConfig(environmentOrConfig);
  const host = resolveMediaPublishHost(config);
  const port = resolveMediaPublishPort(config, normalizedMode);
  const key = `simcam-${simulatorDeviceId.replace(/[^a-zA-Z0-9]/g, '').slice(-16) || 'default'}`.toLowerCase();
  return normalizedMode === 'RTMP'
    ? `rtmp://${host}:${port}/live/${key}`
    : `rtsp://${host}:${port}/live/${key}`;
}

export function buildLocalCameraSourcePreview(
  environmentOrConfig: SimulatorEnvironment | SimulatorMediaPublishConfig | null | undefined,
  streamMode: string | null | undefined,
  seedName?: string | null,
): string {
  const normalizedMode = normalizeVideoStreamMode(streamMode);
  if (!isProxyVideoMode(normalizedMode)) {
    return '';
  }
  const config = resolveMediaPublishConfig(environmentOrConfig);
  const host = resolveMediaPublishHost(config);
  const port = resolveMediaPublishPort(config, normalizedMode);
  const sanitizedSeed = trimText(seedName)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'simulator-camera';
  return normalizedMode === 'RTMP'
    ? `rtmp://${host}:${port}/live/${sanitizedSeed}`
    : `rtsp://${host}:${port}/live/${sanitizedSeed}`;
}

export function formatLocalVideoFps(value: number): string {
  const normalized = Number(value) || 15;
  const rounded = Math.round(normalized);
  if (Math.abs(normalized - rounded) <= 0.01) {
    return String(rounded);
  }
  return normalized.toFixed(3).replace(/\.?0+$/, '');
}

export function buildLocalVideoModeKey(width: unknown, height: unknown, fps: unknown): string {
  const normalizedWidth = Number(width) || 1280;
  const normalizedHeight = Number(height) || 720;
  const normalizedFps = Number(fps) || 15;
  return `${Math.floor(normalizedWidth)}x${Math.floor(normalizedHeight)}@${formatLocalVideoFps(normalizedFps)}`;
}

export function buildLocalVideoModeLabel(width: number, height: number, fps: number): string {
  return `${Math.floor(width)} x ${Math.floor(height)} @ ${formatLocalVideoFps(fps)}fps`;
}

const LOCAL_VIDEO_MODE_PRESETS: Array<{ width: number; height: number; fps: number }> = [
  { width: 640, height: 480, fps: 15 },
  { width: 640, height: 480, fps: 30 },
  { width: 1280, height: 720, fps: 15 },
  { width: 1280, height: 720, fps: 30 },
  { width: 1920, height: 1080, fps: 15 },
  { width: 1920, height: 1080, fps: 30 },
];

export function buildFallbackLocalVideoModes(preferred?: {
  width?: unknown;
  height?: unknown;
  fps?: unknown;
}): LocalVideoModeOption[] {
  const merged = [
    {
      width: Number(preferred?.width) || 1280,
      height: Number(preferred?.height) || 720,
      fps: Number(preferred?.fps) || 15,
    },
    ...LOCAL_VIDEO_MODE_PRESETS,
  ];
  const uniqueKeys = new Set<string>();
  return merged
    .filter((item) => Number.isFinite(item.width) && Number.isFinite(item.height) && Number.isFinite(item.fps))
    .filter((item) => {
      const key = buildLocalVideoModeKey(item.width, item.height, item.fps);
      if (uniqueKeys.has(key)) {
        return false;
      }
      uniqueKeys.add(key);
      return true;
    })
    .map((item) => ({
      key: buildLocalVideoModeKey(item.width, item.height, item.fps),
      label: buildLocalVideoModeLabel(item.width, item.height, item.fps),
      width: item.width,
      height: item.height,
      fps: item.fps,
    }));
}

export function selectPreferredLocalVideoMode(
  modes: LocalVideoModeOption[],
  preferred: { width?: unknown; height?: unknown; fps?: unknown },
): LocalVideoModeOption | null {
  if (modes.length === 0) {
    return null;
  }
  const width = Number(preferred.width) || 1280;
  const height = Number(preferred.height) || 720;
  const fps = Number(preferred.fps) || 15;
  const sorted = [...modes].sort((a, b) => {
    const scoreA = Math.abs(a.width - width) + Math.abs(a.height - height) + Math.abs(a.fps - fps) * 1000;
    const scoreB = Math.abs(b.width - width) + Math.abs(b.height - height) + Math.abs(b.fps - fps) * 1000;
    return scoreA - scoreB;
  });
  return sorted[0] || null;
}

function trimText(value?: string | null): string {
  return (value ?? '').trim();
}

export function normalizeVideoStreamMode(value?: string | null): SimulatorVideoStreamMode {
  const normalized = trimText(value).toUpperCase();
  if (normalized === 'RTSP' || normalized === 'RTSP_PROXY') {
    return 'RTSP';
  }
  if (normalized === 'RTMP') {
    return 'RTMP';
  }
  return 'GB28181';
}

export function isProxyVideoMode(mode?: string | null): boolean {
  const normalized = normalizeVideoStreamMode(mode);
  return normalized === 'RTSP' || normalized === 'RTMP';
}

export function resolveVideoProductProtocol(streamMode?: string | null): SimulatorVideoStreamMode {
  return normalizeVideoStreamMode(streamMode);
}

export function resolveVideoDeviceName(values: {
  name?: string | null;
  gbDeviceId?: string | null;
  streamMode?: string | null;
}): string {
  return isProxyVideoMode(values.streamMode)
    ? trimText(values.name)
    : trimText(values.gbDeviceId);
}

export function getVideoSourceFieldLabel(streamMode?: string | null): string {
  return normalizeVideoStreamMode(streamMode) === 'RTMP' ? 'RTMP 源地址' : 'RTSP 源地址';
}

export function parseVideoSourceUrl(
  streamMode: string | null | undefined,
  sourceUrl: string | null | undefined,
): ParsedVideoSourceUrl | null {
  const trimmed = trimText(sourceUrl);
  if (!trimmed) {
    return null;
  }

  const normalizedMode = normalizeVideoStreamMode(streamMode);
  const protocol = normalizedMode === 'RTMP' ? 'rtmp:' : 'rtsp:';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${getVideoSourceFieldLabel(normalizedMode)}格式不正确`);
  }

  if (parsed.protocol !== protocol) {
    throw new Error(`${getVideoSourceFieldLabel(normalizedMode)}必须使用 ${protocol.replace(':', '')}://`);
  }

  const host = trimText(parsed.hostname);
  if (!host) {
    throw new Error(`${getVideoSourceFieldLabel(normalizedMode)}缺少主机地址`);
  }

  const port = parsed.port
    ? Number(parsed.port)
    : normalizedMode === 'RTMP'
      ? 1935
      : 554;

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${getVideoSourceFieldLabel(normalizedMode)}端口不正确`);
  }

  return {
    normalizedUrl: parsed.toString(),
    host,
    port,
  };
}

function normalizeOptionalText(value?: string | null): string | undefined {
  const trimmed = trimText(value);
  return trimmed || undefined;
}

function normalizeOptionalPort(value?: number | null): number | undefined {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return undefined;
  }
  return Number(value);
}

export function buildVideoCreatePayload(
  device: SimDevice,
  options?: {
    sourceUrlOverride?: string | null;
  },
): Record<string, unknown> {
  const streamMode = normalizeVideoStreamMode(device.streamMode);
  const payload: Record<string, unknown> = {
    productKey: normalizeOptionalText(device.productKey),
    name: normalizeOptionalText(device.name),
    streamMode,
    manufacturer: normalizeOptionalText(device.manufacturer),
    model: normalizeOptionalText(device.model),
    firmware: normalizeOptionalText(device.firmware),
  };

  if (streamMode === 'GB28181') {
    const sipPassword = normalizeOptionalText(device.sipPassword);
    payload.gbDeviceId = normalizeOptionalText(device.gbDeviceId);
    payload.gbDomain = normalizeOptionalText(device.gbDomain);
    payload.transport = normalizeOptionalText(device.sipTransport) || 'UDP';
    payload.sipPassword = sipPassword;
    payload.ip = normalizeOptionalText(device.ip) || '127.0.0.1';
    payload.port = normalizeOptionalPort(device.sipLocalPort) || 5060;
    return payload;
  }

  const parsedSource = parseVideoSourceUrl(streamMode, options?.sourceUrlOverride ?? device.sourceUrl);
  payload.ip = parsedSource?.host;
  payload.port = parsedSource?.port;
  payload.sourceUrl = parsedSource?.normalizedUrl;
  return payload;
}

export function buildVideoUpdatePayload(
  device: SimDevice,
  options?: {
    sourceUrlOverride?: string | null;
  },
): Record<string, unknown> {
  const { productKey: _productKey, ...payload } = buildVideoCreatePayload(device, options);
  return payload;
}

export function getVideoIdentityKeyword(device: Pick<SimDevice, 'streamMode' | 'gbDeviceId' | 'ip' | 'sourceUrl'>): string {
  const streamMode = normalizeVideoStreamMode(device.streamMode);
  if (streamMode === 'GB28181') {
    return trimText(device.gbDeviceId);
  }
  const parsedSource = parseVideoSourceUrl(streamMode, device.sourceUrl);
  return parsedSource?.normalizedUrl || trimText(device.ip);
}

export function matchesVideoIdentity(
  device: Pick<SimDevice, 'streamMode' | 'gbDeviceId' | 'sourceUrl'>,
  record: { streamMode?: string | null; gbDeviceId?: string | null; ip?: string | null; port?: number | null; sourceUrl?: string | null },
): boolean {
  const streamMode = normalizeVideoStreamMode(device.streamMode);
  if (streamMode !== normalizeVideoStreamMode(record.streamMode)) {
    return false;
  }
  if (streamMode === 'GB28181') {
    return trimText(device.gbDeviceId) !== '' && trimText(device.gbDeviceId) === trimText(record.gbDeviceId);
  }
  const parsedSource = parseVideoSourceUrl(streamMode, device.sourceUrl);
  if (!parsedSource) {
    return false;
  }
  const recordSourceUrl = trimText(record.sourceUrl);
  if (recordSourceUrl) {
    try {
      const parsedRecordSource = parseVideoSourceUrl(streamMode, recordSourceUrl);
      return parsedRecordSource?.normalizedUrl === parsedSource.normalizedUrl;
    } catch {
      return false;
    }
  }
  return parsedSource.host === trimText(record.ip) && parsedSource.port === Number(record.port || 0);
}

export function getActiveVideoApiContext() {
  const workspaceState = useSimWorkspaceStore.getState();
  const activeEnvironment = getActiveEnvironment(workspaceState.environments, workspaceState.activeEnvironmentId);
  const activeSession = workspaceState.sessions[activeEnvironment.id];
  if (!activeSession?.accessToken) {
    return null;
  }
  return {
    baseUrl: activeEnvironment.gatewayBaseUrl,
    accessToken: activeSession.accessToken,
    environmentName: activeEnvironment.name,
  };
}
