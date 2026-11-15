import { generatePayload, useSimStore, type DataTemplate, type SimDevice } from '../store';

export type LoadProtocol = 'HTTP' | 'MQTT' | 'CoAP' | 'WebSocket' | 'TCP' | 'UDP' | 'LoRaWAN' | 'SNMP' | 'Modbus';

/** 视频/GB28181 是媒体流与 SIP 会话，不适合在桌面端做“大批量设备压测”，只保留单设备联调。 */
export const LOAD_PROTOCOLS: LoadProtocol[] = [
  'HTTP', 'MQTT', 'CoAP', 'WebSocket', 'TCP', 'UDP', 'LoRaWAN', 'SNMP', 'Modbus',
];

export const PROTOCOL_SUPPORT_NOTES: Record<LoadProtocol, string> = {
  HTTP: '属性/事件上报，需设备已认证',
  MQTT: '向属性上报 Topic 发布消息，需设备已连接',
  CoAP: 'CoAP Bridge 属性/事件上报',
  WebSocket: '复用设备 WebSocket 连接发送消息',
  TCP: '复用设备 TCP 连接发送按行消息',
  UDP: '复用设备 UDP 会话发送报文',
  LoRaWAN: '模拟网络服务器 Webhook 上行推送',
  SNMP: '通过 Connector 发起 GET 请求（对目标/连接器施压）',
  Modbus: '通过 Connector 发起寄存器读取（对目标/连接器施压）',
};

export interface LoadConfig {
  mode: 'count' | 'duration';
  totalRequests: number;
  durationSec: number;
  concurrency: number;
  intervalMs: number;
  rampUpSec: number;
  timeoutMs: number;
  reportType: 'property' | 'event';
  templateId: string;
  rawPayload: string;
  mqttTopic: string;
  wsMessage: string;
  tcpMessage: string;
  udpMessage: string;
  loraFPort: number;
  snmpOids: string;
  modbusFunction: 3 | 4;
  modbusAddress: number;
  modbusQuantity: number;
}

export const DEFAULT_LOAD_CONFIG: LoadConfig = {
  mode: 'count',
  totalRequests: 1000,
  durationSec: 60,
  concurrency: 20,
  intervalMs: 100,
  rampUpSec: 3,
  timeoutMs: 10000,
  reportType: 'property',
  templateId: 'tpl-temp-humidity',
  rawPayload: '',
  mqttTopic: '/sys/{productKey}/{deviceName}/thing/property/post',
  wsMessage: '{"type":"property","deviceName":"{deviceName}","seq":{seq},"ts":{timestamp}}',
  tcpMessage: '{"type":"property","deviceName":"{deviceName}","seq":{seq},"ts":{timestamp}}\n',
  udpMessage: '{"type":"property","deviceName":"{deviceName}","seq":{seq},"ts":{timestamp}}',
  loraFPort: 1,
  snmpOids: '1.3.6.1.2.1.1.1.0',
  modbusFunction: 3,
  modbusAddress: 0,
  modbusQuantity: 10,
};

export interface ProtocolMetrics {
  sent: number;
  success: number;
  failed: number;
  avgLatency: number;
  p95: number;
}

export interface LoadSnapshot {
  running: boolean;
  paused: boolean;
  done: boolean;
  total: number;
  sent: number;
  success: number;
  failed: number;
  inFlight: number;
  elapsedMs: number;
  tps: number;
  successRate: number;
  avgLatency: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  maxLatency: number;
  byProtocol: Record<string, ProtocolMetrics>;
  errors: Array<{ message: string; count: number }>;
  timeline: Array<{ t: number; tps: number; sent: number; failed: number }>;
}

export interface LoadHandlers {
  onSnapshot?: (snapshot: LoadSnapshot) => void;
  onFinish?: (snapshot: LoadSnapshot) => void;
  onEvent?: (level: 'info' | 'success' | 'warn' | 'error', message: string) => void;
}

const MAX_LATENCY_SAMPLES = 20000;
const MAX_PROTOCOL_SAMPLES = 5000;
const SNAPSHOT_INTERVAL_MS = 500;

function isSuccessfulResponse(result: any): boolean {
  if (!result) {
    return false;
  }
  if (result.success === false) {
    return false;
  }
  if (typeof result.code === 'number' && result.code !== 0) {
    return false;
  }
  if (result.data && typeof result.data === 'object' && typeof result.data.code === 'number' && result.data.code !== 0) {
    return false;
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`请求超时（${timeoutMs}ms）`)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function renderTemplate(text: string, device: SimDevice, seq: number): string {
  return text
    .replace(/\{deviceName\}/g, device.deviceName || device.name)
    .replace(/\{productKey\}/g, device.productKey || '')
    .replace(/\{name\}/g, device.name)
    .replace(/\{seq\}/g, String(seq))
    .replace(/\{timestamp\}/g, String(Date.now()));
}

function buildPayload(device: SimDevice, config: LoadConfig, template: DataTemplate | undefined, seq: number): Record<string, unknown> {
  if (config.rawPayload.trim()) {
    try {
      const parsed: unknown = JSON.parse(renderTemplate(config.rawPayload, device, seq));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 非法 JSON 时退回模板/默认载荷，避免压测整体无法启动。
    }
  }
  if (template) {
    return generatePayload(template.fields);
  }
  return {
    temperature: Number((20 + Math.random() * 10).toFixed(1)),
    humidity: Number((40 + Math.random() * 20).toFixed(1)),
    timestamp: Date.now(),
  };
}

async function sendForDevice(
  device: SimDevice,
  config: LoadConfig,
  payload: Record<string, unknown>,
  seq: number,
): Promise<{ success: boolean; message?: string }> {
  const api = window.electronAPI;
  if (device.protocol === 'HTTP') {
    return config.reportType === 'event'
      ? api.httpReportEvent(device.httpBaseUrl, device.token, payload)
      : api.httpReportProperty(device.httpBaseUrl, device.token, payload);
  }
  if (device.protocol === 'MQTT') {
    const topic = renderTemplate(config.mqttTopic, device, seq);
    return api.mqttPublish(device.id, topic, JSON.stringify(payload), 1);
  }
  if (device.protocol === 'CoAP') {
    return config.reportType === 'event'
      ? api.coapReportEvent(device.coapBaseUrl, device.token, payload)
      : api.coapReportProperty(device.coapBaseUrl, device.token, payload);
  }
  if (device.protocol === 'WebSocket') {
    const message = config.wsMessage.trim()
      ? renderTemplate(config.wsMessage, device, seq)
      : JSON.stringify({ ...payload, deviceName: device.deviceName, seq, ts: Date.now() });
    return api.wsSend(device.id, message);
  }
  if (device.protocol === 'TCP') {
    const message = config.tcpMessage.trim()
      ? renderTemplate(config.tcpMessage, device, seq)
      : `${JSON.stringify({ ...payload, deviceName: device.deviceName, seq, ts: Date.now() })}\n`;
    return api.tcpSend(device.id, message);
  }
  if (device.protocol === 'UDP') {
    const message = config.udpMessage.trim()
      ? renderTemplate(config.udpMessage, device, seq)
      : JSON.stringify({ ...payload, deviceName: device.deviceName, seq, ts: Date.now() });
    return api.udpSend(device.id, message);
  }
  if (device.protocol === 'LoRaWAN') {
    return api.lorawanSend(
      device.loraWebhookUrl,
      device.loraDevEui,
      device.loraAppId,
      config.loraFPort,
      JSON.stringify(payload),
    );
  }
  if (device.protocol === 'SNMP') {
    const result = await api.snmpGet(device.snmpConnectorUrl, {
      target: {
        host: device.snmpHost,
        port: device.snmpPort,
        version: device.snmpVersion,
        community: device.snmpCommunity,
      },
      oids: config.snmpOids.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean),
    });
    return { success: isSuccessfulResponse(result) && Boolean(result?.data?.data), message: result?.message || result?.data?.message };
  }
  if (device.protocol === 'Modbus') {
    const payloadForRead = {
      host: device.modbusHost,
      port: device.modbusPort,
      slaveId: device.modbusSlaveId,
      mode: device.modbusMode,
      address: config.modbusAddress,
      quantity: config.modbusQuantity,
    };
    const result = config.modbusFunction === 4
      ? await api.modbusReadInputRegisters(device.modbusConnectorUrl, payloadForRead)
      : await api.modbusReadHoldingRegisters(device.modbusConnectorUrl, payloadForRead);
    return { success: isSuccessfulResponse(result), message: result?.message || result?.data?.message };
  }
  return { success: false, message: `协议 ${device.protocol} 不支持批量压测` };
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export class LoadRunner {
  private devices: SimDevice[] = [];
  private config: LoadConfig = DEFAULT_LOAD_CONFIG;
  private handlers: LoadHandlers = {};
  private template: DataTemplate | undefined;
  private running = false;
  private paused = false;
  private done = false;
  private startedAt = 0;
  private finishedAt = 0;
  private nextRequest = 0;
  private sent = 0;
  private success = 0;
  private failed = 0;
  private inFlight = 0;
  private nextSeq = 0;
  private latencies: number[] = [];
  private maxLatency = 0;
  private byProtocol: Record<string, { sent: number; success: number; failed: number; latencies: number[] }> = {};
  private errors = new Map<string, number>();
  private byDevice = new Map<string, { sent: number; failed: number }>();
  private timeline: Array<{ t: number; tps: number; sent: number; failed: number }> = [];
  private lastSnapshotSent = 0;
  private lastSnapshotAt = 0;
  private lastTimelineAt = 0;
  private snapshotTimer: number | null = null;
  private workers: Promise<void>[] = [];

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  start(devices: SimDevice[], config: LoadConfig, handlers: LoadHandlers = {}): void {
    if (this.running) {
      return;
    }
    this.devices = devices;
    this.config = config;
    this.handlers = handlers;
    this.template = useSimStore.getState().templates.find((item) => item.id === config.templateId);
    this.running = true;
    this.paused = false;
    this.done = false;
    this.startedAt = Date.now();
    this.finishedAt = 0;
    this.nextRequest = 0;
    this.nextSeq = 0;
    this.sent = 0;
    this.success = 0;
    this.failed = 0;
    this.inFlight = 0;
    this.latencies = [];
    this.maxLatency = 0;
    this.byProtocol = {};
    this.errors.clear();
    this.byDevice.clear();
    this.timeline = [];
    this.lastSnapshotSent = 0;
    this.lastSnapshotAt = this.startedAt;
    this.lastTimelineAt = this.startedAt;

    const concurrency = Math.max(1, Math.min(config.concurrency, 500));
    this.workers = Array.from({ length: concurrency }, (_, index) => this.runWorker(index, concurrency));
    this.snapshotTimer = window.setInterval(() => this.emitSnapshot(), SNAPSHOT_INTERVAL_MS);
    this.handlers.onEvent?.('info', `压测开始：${devices.length} 台设备，并发 ${concurrency}，${
      config.mode === 'count' ? `${config.totalRequests} 次请求` : `持续 ${config.durationSec} 秒`
    }`);
    void Promise.all(this.workers).then(() => this.finish());
  }

  pause(): void {
    if (this.running && !this.paused) {
      this.paused = true;
      this.handlers.onEvent?.('warn', '压测已暂停');
      this.emitSnapshot();
    }
  }

  resume(): void {
    if (this.running && this.paused) {
      this.paused = false;
      this.handlers.onEvent?.('info', '压测已继续');
      this.emitSnapshot();
    }
  }

  stop(): void {
    if (this.running) {
      this.running = false;
      this.handlers.onEvent?.('warn', '压测已停止');
    }
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && this.running) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }

  /** 可被停止打断的等待，避免停止后还要等完整的发送间隔/爬坡时间。 */
  private async sleepInterruptible(ms: number): Promise<void> {
    const endAt = Date.now() + ms;
    while (this.running && Date.now() < endAt) {
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(100, Math.max(1, endAt - Date.now()))));
    }
  }

  private async runWorker(workerIndex: number, workerCount: number): Promise<void> {
    const rampUpMs = Math.max(0, this.config.rampUpSec) * 1000;
    if (rampUpMs > 0) {
      const delay = (rampUpMs / workerCount) * workerIndex;
      await this.sleepInterruptible(delay);
    }
    const endAt = this.config.mode === 'duration'
      ? this.startedAt + Math.max(1, this.config.durationSec) * 1000
      : Number.POSITIVE_INFINITY;
    while (this.running) {
      await this.waitWhilePaused();
      if (!this.running) {
        break;
      }
      if (this.config.mode === 'count' && this.nextRequest >= this.config.totalRequests) {
        break;
      }
      if (this.config.mode === 'duration' && Date.now() >= endAt) {
        break;
      }
      const seq = this.nextRequest;
      this.nextRequest += 1;
      this.nextSeq += 1;
      const device = this.devices[seq % this.devices.length];
      const payload = buildPayload(device, this.config, this.template, this.nextSeq);
      this.inFlight += 1;
      const startedAt = performance.now();
      try {
        const result = await withTimeout(
          sendForDevice(device, this.config, payload, this.nextSeq),
          Math.max(1000, this.config.timeoutMs),
        );
        const latency = performance.now() - startedAt;
        if (isSuccessfulResponse(result) && result.success !== false) {
          this.record(device, true, latency);
        } else {
          this.record(device, false, latency, result?.message || '失败');
        }
      } catch (error) {
        const latency = performance.now() - startedAt;
        this.record(device, false, latency, error instanceof Error ? error.message : '发送异常');
      } finally {
        this.inFlight -= 1;
      }
      if (this.config.intervalMs > 0) {
        await this.sleepInterruptible(this.config.intervalMs);
      }
    }
  }

  private record(device: SimDevice, ok: boolean, latency: number, message?: string): void {
    const protocol = device.protocol;
    this.sent += 1;
    if (ok) {
      this.success += 1;
    } else {
      this.failed += 1;
      const text = message || '失败';
      this.errors.set(text, (this.errors.get(text) || 0) + 1);
    }
    if (this.latencies.length < MAX_LATENCY_SAMPLES) {
      this.latencies.push(latency);
    } else if (Math.random() < MAX_LATENCY_SAMPLES / this.sent) {
      this.latencies[Math.floor(Math.random() * MAX_LATENCY_SAMPLES)] = latency;
    }
    this.maxLatency = Math.max(this.maxLatency, latency);
    const entry = this.byProtocol[protocol] || { sent: 0, success: 0, failed: 0, latencies: [] };
    entry.sent += 1;
    if (ok) entry.success += 1; else entry.failed += 1;
    if (entry.latencies.length < MAX_PROTOCOL_SAMPLES) {
      entry.latencies.push(latency);
    }
    this.byProtocol[protocol] = entry;
    const deviceStats = this.byDevice.get(device.id) || { sent: 0, failed: 0 };
    deviceStats.sent += 1;
    if (!ok) {
      deviceStats.failed += 1;
    }
    this.byDevice.set(device.id, deviceStats);
  }

  private buildSnapshot(): LoadSnapshot {
    const now = this.finishedAt || Date.now();
    const elapsedMs = Math.max(0, now - this.startedAt);
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avgLatency = sorted.length > 0 ? sorted.reduce((sum, item) => sum + item, 0) / sorted.length : 0;
    const byProtocol: Record<string, ProtocolMetrics> = {};
    Object.entries(this.byProtocol).forEach(([protocol, metrics]) => {
      const protocolSorted = [...metrics.latencies].sort((a, b) => a - b);
      byProtocol[protocol] = {
        sent: metrics.sent,
        success: metrics.success,
        failed: metrics.failed,
        avgLatency: protocolSorted.length > 0
          ? Math.round(protocolSorted.reduce((sum, item) => sum + item, 0) / protocolSorted.length)
          : 0,
        p95: Math.round(percentile(protocolSorted, 0.95)),
      };
    });
    return {
      running: this.running,
      paused: this.paused,
      done: this.done,
      total: this.config.mode === 'count' ? this.config.totalRequests : 0,
      sent: this.sent,
      success: this.success,
      failed: this.failed,
      inFlight: this.inFlight,
      elapsedMs,
      tps: 0,
      successRate: this.sent > 0 ? (this.success / this.sent) * 100 : 0,
      avgLatency: Math.round(avgLatency),
      p50: Math.round(percentile(sorted, 0.5)),
      p90: Math.round(percentile(sorted, 0.9)),
      p95: Math.round(percentile(sorted, 0.95)),
      p99: Math.round(percentile(sorted, 0.99)),
      maxLatency: Math.round(this.maxLatency),
      byProtocol,
      errors: [...this.errors.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([text, count]) => ({ message: text, count })),
      timeline: [...this.timeline],
    };
  }

  private emitSnapshot(): void {
    if (!this.handlers.onSnapshot) {
      return;
    }
    const now = Date.now();
    const snapshot = this.buildSnapshot();
    const deltaSeconds = Math.max(0.001, (now - this.lastSnapshotAt) / 1000);
    snapshot.tps = Number(((this.sent - this.lastSnapshotSent) / deltaSeconds).toFixed(1));
    this.lastSnapshotSent = this.sent;
    this.lastSnapshotAt = now;
    if (now - this.lastTimelineAt >= 1000) {
      this.timeline.push({ t: now, tps: snapshot.tps, sent: this.sent, failed: this.failed });
      if (this.timeline.length > 60) {
        this.timeline = this.timeline.slice(-60);
      }
      this.lastTimelineAt = now;
    }
    this.handlers.onSnapshot(snapshot);
  }

  private finish(): void {
    if (this.done) {
      return;
    }
    this.done = true;
    this.running = false;
    this.finishedAt = Date.now();
    if (this.snapshotTimer) {
      window.clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    const snapshot = this.buildSnapshot();
    snapshot.tps = snapshot.elapsedMs > 0 ? Number(((snapshot.sent / snapshot.elapsedMs) * 1000).toFixed(1)) : 0;
    // 压测结束后一次性回写设备计数，避免每请求触发一次 store 更新。
    const statsUpdates: Record<string, { sentCount: number; errorCount: number }> = {};
    this.byDevice.forEach((stats, deviceId) => {
      statsUpdates[deviceId] = { sentCount: stats.sent, errorCount: stats.failed };
    });
    if (Object.keys(statsUpdates).length > 0) {
      useSimStore.getState().adjustDeviceStatsBatch(statsUpdates);
    }
    this.handlers.onSnapshot?.(snapshot);
    this.handlers.onFinish?.(snapshot);
    this.handlers.onEvent?.('success', `压测完成：${snapshot.sent} 次请求，成功 ${snapshot.success}，失败 ${snapshot.failed}`);
  }
}
