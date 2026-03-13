import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { MqttClient, connect as mqttConnect } from 'mqtt';
import http from 'http';
import https from 'https';
import WebSocket from 'ws';
import net from 'net';
import dgram from 'dgram';
import { Gb28181Client, Gb28181Config, Gb28181Channel, SipClientEvent } from './gb28181-client';

// ============================================================
// Electron Main Process
// ============================================================

let mainWindow: BrowserWindow | null = null;
const mqttClients = new Map<string, MqttClient>();
const sipClients = new Map<string, Gb28181Client>();
const wsClients = new Map<string, WebSocket>();
const tcpClients = new Map<string, net.Socket>();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'Firefly IoT 设备模拟器',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Log renderer console messages to stdout for debugging
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const lvl = ['V', 'I', 'W', 'E'][level] || '?';
    console.log(`[Renderer/${lvl}] ${message} (${sourceId}:${line})`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  mqttClients.forEach((client) => client.end(true));
  mqttClients.clear();
  wsClients.forEach((ws) => ws.close());
  wsClients.clear();
  tcpClients.forEach((sock) => sock.destroy());
  tcpClients.clear();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ============================================================
// HTTP Protocol IPC Handlers
// ============================================================

function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; data: string; headers: Record<string, string>; elapsed: number }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const startTime = Date.now();
    const normalizedHeaders: Record<string, string | number> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (body) {
      normalizedHeaders['Content-Length'] = Buffer.byteLength(body);
    }
    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers: normalizedHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const resHeaders: Record<string, string> = {};
          Object.entries(res.headers).forEach(([k, v]) => { resHeaders[k] = Array.isArray(v) ? v.join(', ') : v || ''; });
          resolve({ status: res.statusCode || 0, data, headers: resHeaders, elapsed: Date.now() - startTime });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

ipcMain.handle('http:auth', async (_e, baseUrl: string, productKey: string, deviceName: string, deviceSecret: string) => {
  try {
    const authUrl = new URL(`${baseUrl}/api/v1/protocol/http/auth`);
    authUrl.searchParams.set('productKey', productKey || '');
    authUrl.searchParams.set('deviceName', deviceName || '');
    authUrl.searchParams.set('deviceSecret', deviceSecret || '');
    const res = await httpRequest(authUrl.toString(), 'POST', {}, JSON.stringify({ productKey, deviceName, deviceSecret }));
    return { success: true, ...JSON.parse(res.data), _status: res.status, _headers: res.headers, _elapsed: res.elapsed };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('http:property', async (_e, baseUrl: string, token: string, properties: Record<string, any>) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/http/property/post`;
    const res = await httpRequest(url, 'POST', { 'X-Device-Token': token }, JSON.stringify(properties));
    return { success: true, ...JSON.parse(res.data), _status: res.status, _headers: res.headers, _elapsed: res.elapsed };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('http:event', async (_e, baseUrl: string, token: string, event: Record<string, any>) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/http/event/post`;
    const res = await httpRequest(url, 'POST', { 'X-Device-Token': token }, JSON.stringify(event));
    return { success: true, ...JSON.parse(res.data), _status: res.status, _headers: res.headers, _elapsed: res.elapsed };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('device:dynamicRegister', async (
  _e,
  baseUrl: string,
  payload: {
    productKey: string;
    productSecret: string;
    deviceName: string;
    nickname?: string;
    description?: string;
    tags?: string;
  },
) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/device/register`;
    const res = await httpRequest(url, 'POST', {}, JSON.stringify(payload));
    return { success: true, ...JSON.parse(res.data), _status: res.status, _headers: res.headers, _elapsed: res.elapsed };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('device:dynamicUnregister', async (
  _e,
  baseUrl: string,
  payload: {
    productKey: string;
    productSecret: string;
    deviceName: string;
  },
) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/device/unregister`;
    const res = await httpRequest(url, 'POST', {}, JSON.stringify(payload));
    return { success: true, ...JSON.parse(res.data), _status: res.status, _headers: res.headers, _elapsed: res.elapsed };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// CoAP Bridge Protocol IPC Handlers
// ============================================================

ipcMain.handle('coap:auth', async (_e, baseUrl: string, payload: Record<string, string>) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/coap/auth`;
    const res = await httpRequest(url, 'POST', {}, JSON.stringify(payload));
    return { success: true, ...JSON.parse(res.data) };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('coap:property', async (_e, baseUrl: string, token: string, payload: Record<string, any>) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/coap/property?token=${encodeURIComponent(token)}`;
    const res = await httpRequest(url, 'POST', {}, JSON.stringify(payload));
    return { success: true, ...JSON.parse(res.data) };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('coap:event', async (_e, baseUrl: string, token: string, payload: Record<string, any>) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/coap/event?token=${encodeURIComponent(token)}`;
    const res = await httpRequest(url, 'POST', {}, JSON.stringify(payload));
    return { success: true, ...JSON.parse(res.data) };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('coap:otaProgress', async (_e, baseUrl: string, token: string, payload: Record<string, any>) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/coap/ota/progress?token=${encodeURIComponent(token)}`;
    const res = await httpRequest(url, 'POST', {}, JSON.stringify(payload));
    return { success: true, ...JSON.parse(res.data) };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('coap:shadow', async (_e, baseUrl: string, token: string) => {
  try {
    const url = `${baseUrl}/api/v1/protocol/coap/shadow?token=${encodeURIComponent(token)}`;
    const res = await httpRequest(url, 'GET', {});
    return { success: true, ...JSON.parse(res.data) };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// MQTT Protocol IPC Handlers
// ============================================================

ipcMain.handle('mqtt:connect', async (_e, id: string, brokerUrl: string, clientId: string, username: string, password: string, opts?: {
  clean?: boolean; keepalive?: number; reconnectPeriod?: number;
  willTopic?: string; willPayload?: string; willQos?: number; willRetain?: boolean;
}) => {
  try {
    if (mqttClients.has(id)) {
      mqttClients.get(id)!.end(true);
      mqttClients.delete(id);
    }
    const connectOpts: any = {
      clientId,
      username,
      password,
      clean: opts?.clean ?? true,
      connectTimeout: 10000,
      reconnectPeriod: opts?.reconnectPeriod ?? 0,
      keepalive: opts?.keepalive ?? 60,
    };
    if (opts?.willTopic) {
      connectOpts.will = {
        topic: opts.willTopic,
        payload: Buffer.from(opts.willPayload || ''),
        qos: (opts.willQos ?? 1) as 0 | 1 | 2,
        retain: opts.willRetain ?? false,
      };
    }
    const client = mqttConnect(brokerUrl, connectOpts);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        client.end(true);
        resolve({ success: false, message: '连接超时 (10s)' });
      }, 10000);

      client.on('connect', () => {
        clearTimeout(timeout);
        mqttClients.set(id, client);

        // Forward messages to renderer
        client.on('message', (topic, payload) => {
          mainWindow?.webContents.send('mqtt:message', id, topic, payload.toString());
        });

        client.on('close', () => {
          mainWindow?.webContents.send('mqtt:disconnected', id);
          mqttClients.delete(id);
        });

        client.on('error', (err) => {
          mainWindow?.webContents.send('mqtt:error', id, err.message);
        });

        resolve({ success: true });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        client.end(true);
        resolve({ success: false, message: err.message });
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('mqtt:publish', async (_e, id: string, topic: string, payload: string, qos: number, retain?: boolean) => {
  try {
    const client = mqttClients.get(id);
    if (!client || !client.connected) {
      return { success: false, message: 'MQTT 未连接' };
    }
    return new Promise((resolve) => {
      client.publish(topic, payload, { qos: qos as 0 | 1 | 2, retain: retain ?? false }, (err) => {
        if (err) resolve({ success: false, message: err.message });
        else resolve({ success: true });
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('mqtt:subscribe', async (_e, id: string, topic: string, qos?: number) => {
  try {
    const client = mqttClients.get(id);
    if (!client || !client.connected) {
      return { success: false, message: 'MQTT 未连接' };
    }
    return new Promise((resolve) => {
      client.subscribe(topic, { qos: (qos ?? 1) as 0 | 1 | 2 }, (err) => {
        if (err) resolve({ success: false, message: err.message });
        else resolve({ success: true });
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('mqtt:unsubscribe', async (_e, id: string, topic: string) => {
  try {
    const client = mqttClients.get(id);
    if (!client || !client.connected) {
      return { success: false, message: 'MQTT 未连接' };
    }
    return new Promise((resolve) => {
      client.unsubscribe(topic, (err) => {
        if (err) resolve({ success: false, message: err.message });
        else resolve({ success: true });
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('mqtt:disconnect', async (_e, id: string) => {
  try {
    const client = mqttClients.get(id);
    if (client) {
      client.end(true);
      mqttClients.delete(id);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// Video (firefly-media) IPC Handlers
// ============================================================

// Helper: generic HTTP JSON request
function httpJsonRequest(method: string, url: string, body?: any, token?: string): Promise<any> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const isHttps = u.protocol === 'https:';
    const options: any = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const payload = body ? JSON.stringify(body) : undefined;
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try { resolve({ success: true, data: JSON.parse(data) }); }
        catch { resolve({ success: true, data }); }
      });
    });
    req.on('error', (err: any) => resolve({ success: false, message: err.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

ipcMain.handle('video:createDevice', async (_e, baseUrl: string, dto: any, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices`, dto, token);
});

ipcMain.handle('video:listDevices', async (_e, baseUrl: string, query: any, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/list`, query || {}, token);
});

ipcMain.handle('video:startStream', async (_e, baseUrl: string, deviceId: number, dto?: any, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/${deviceId}/start`, dto || {}, token);
});

ipcMain.handle('video:stopStream', async (_e, baseUrl: string, deviceId: number, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/${deviceId}/stop`, {}, token);
});

ipcMain.handle('video:ptzControl', async (_e, baseUrl: string, deviceId: number, dto: any, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/${deviceId}/ptz`, dto, token);
});

ipcMain.handle('video:snapshot', async (_e, baseUrl: string, deviceId: number, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/${deviceId}/snapshot`, {}, token);
});

ipcMain.handle('video:listChannels', async (_e, baseUrl: string, deviceId: number, token?: string) => {
  return httpJsonRequest('GET', `${baseUrl}/api/v1/video/devices/${deviceId}/channels`, undefined, token);
});

ipcMain.handle('video:queryCatalog', async (_e, baseUrl: string, deviceId: number, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/${deviceId}/catalog`, {}, token);
});

ipcMain.handle('video:startRecording', async (_e, baseUrl: string, deviceId: number, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/${deviceId}/record/start`, {}, token);
});

ipcMain.handle('video:stopRecording', async (_e, baseUrl: string, deviceId: number, token?: string) => {
  return httpJsonRequest('POST', `${baseUrl}/api/v1/video/devices/${deviceId}/record/stop`, {}, token);
});

// ============================================================
// GB28181 SIP Simulation IPC Handlers
// ============================================================

ipcMain.handle('sip:start', async (_e, id: string, config: Gb28181Config) => {
  try {
    // Stop existing client if any
    const existing = sipClients.get(id);
    if (existing) {
      await existing.stop();
      sipClients.delete(id);
    }

    const client = new Gb28181Client(config);

    // Forward SIP events to renderer
    client.on('event', (evt: SipClientEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sip:event', id, evt);
      }
    });

    await client.start();
    sipClients.set(id, client);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('sip:register', async (_e, id: string) => {
  try {
    const client = sipClients.get(id);
    if (!client) return { success: false, message: 'SIP client not started' };
    await client.register();
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('sip:unregister', async (_e, id: string) => {
  try {
    const client = sipClients.get(id);
    if (!client) return { success: false, message: 'SIP client not started' };
    await client.unregister();
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('sip:startKeepalive', async (_e, id: string) => {
  try {
    const client = sipClients.get(id);
    if (!client) return { success: false, message: 'SIP client not started' };
    client.startKeepalive();
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('sip:stopKeepalive', async (_e, id: string) => {
  try {
    const client = sipClients.get(id);
    if (!client) return { success: false, message: 'SIP client not started' };
    client.stopKeepalive();
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('sip:updateChannels', async (_e, id: string, channels: Gb28181Channel[]) => {
  try {
    const client = sipClients.get(id);
    if (!client) return { success: false, message: 'SIP client not started' };
    client.updateChannels(channels);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('sip:stop', async (_e, id: string) => {
  try {
    const client = sipClients.get(id);
    if (client) {
      await client.stop();
      sipClients.delete(id);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// SNMP Protocol IPC Handlers (via Connector REST API)
// ============================================================

ipcMain.handle('snmp:test', async (_e, connectorUrl: string, target: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/snmp/test`, target);
});

ipcMain.handle('snmp:systemInfo', async (_e, connectorUrl: string, target: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/snmp/system-info`, target);
});

ipcMain.handle('snmp:get', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/snmp/get`, payload);
});

ipcMain.handle('snmp:walk', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/snmp/walk`, payload);
});

// ============================================================
// Modbus Protocol IPC Handlers (via Connector REST API)
// ============================================================

ipcMain.handle('modbus:test', async (_e, connectorUrl: string, target: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/test`, target);
});

ipcMain.handle('modbus:readHoldingRegisters', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/read-holding-registers`, payload);
});

ipcMain.handle('modbus:readInputRegisters', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/read-input-registers`, payload);
});

ipcMain.handle('modbus:readCoils', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/read-coils`, payload);
});

ipcMain.handle('modbus:readDiscreteInputs', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/read-discrete-inputs`, payload);
});

ipcMain.handle('modbus:writeSingleRegister', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/write-single-register`, payload);
});

ipcMain.handle('modbus:writeSingleCoil', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/write-single-coil`, payload);
});

ipcMain.handle('modbus:writeMultipleRegisters', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/write-multiple-registers`, payload);
});

ipcMain.handle('modbus:writeMultipleCoils', async (_e, connectorUrl: string, payload: any) => {
  return httpJsonRequest('POST', `${connectorUrl}/api/v1/modbus/write-multiple-coils`, payload);
});

// ============================================================
// WebSocket Protocol IPC Handlers
// ============================================================

ipcMain.handle('ws:connect', async (_e, id: string, endpoint: string, params?: { deviceId?: string; productId?: string; tenantId?: string; deviceName?: string }) => {
  try {
    // Close existing connection
    const existing = wsClients.get(id);
    if (existing) {
      existing.close();
      wsClients.delete(id);
    }

    // Build URL with query params
    const url = new URL(endpoint);
    if (params?.deviceId) url.searchParams.set('deviceId', params.deviceId);
    if (params?.productId) url.searchParams.set('productId', params.productId);
    if (params?.tenantId) url.searchParams.set('tenantId', params.tenantId);
    if (params?.deviceName) url.searchParams.set('deviceName', params.deviceName);

    const ws = new WebSocket(url.toString());

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ success: false, message: '连接超时 (10s)' });
      }, 10000);

      ws.on('open', () => {
        clearTimeout(timeout);
        wsClients.set(id, ws);

        ws.on('message', (data: WebSocket.Data) => {
          const payload = data.toString();
          mainWindow?.webContents.send('ws:message', id, payload);
        });

        ws.on('close', (code: number, reason: Buffer) => {
          mainWindow?.webContents.send('ws:disconnected', id, code, reason.toString());
          wsClients.delete(id);
        });

        ws.on('error', (err: Error) => {
          mainWindow?.webContents.send('ws:error', id, err.message);
        });

        resolve({ success: true });
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        ws.close();
        resolve({ success: false, message: err.message });
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('ws:send', async (_e, id: string, message: string) => {
  try {
    const ws = wsClients.get(id);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return { success: false, message: 'WebSocket 未连接' };
    }
    ws.send(message);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('ws:disconnect', async (_e, id: string) => {
  try {
    const ws = wsClients.get(id);
    if (ws) {
      ws.close();
      wsClients.delete(id);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// TCP Protocol IPC Handlers
// ============================================================

ipcMain.handle('tcp:connect', async (_e, id: string, host: string, port: number) => {
  try {
    const existing = tcpClients.get(id);
    if (existing) {
      existing.destroy();
      tcpClients.delete(id);
    }

    const socket = new net.Socket();

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ success: false, message: '连接超时 (10s)' });
      }, 10000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        tcpClients.set(id, socket);

        let buffer = '';
        socket.on('data', (data: Buffer) => {
          buffer += data.toString();
          let idx: number;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.substring(0, idx).trim();
            buffer = buffer.substring(idx + 1);
            if (line) {
              mainWindow?.webContents.send('tcp:message', id, line);
            }
          }
        });

        socket.on('close', () => {
          mainWindow?.webContents.send('tcp:disconnected', id);
          tcpClients.delete(id);
        });

        socket.on('error', (err: Error) => {
          mainWindow?.webContents.send('tcp:error', id, err.message);
        });

        resolve({ success: true });
      });

      socket.on('error', (err: Error) => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ success: false, message: err.message });
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('tcp:send', async (_e, id: string, message: string) => {
  try {
    const socket = tcpClients.get(id);
    if (!socket || socket.destroyed) {
      return { success: false, message: 'TCP 未连接' };
    }
    socket.write(message + '\n');
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('tcp:disconnect', async (_e, id: string) => {
  try {
    const socket = tcpClients.get(id);
    if (socket) {
      socket.destroy();
      tcpClients.delete(id);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// UDP Protocol IPC Handlers
// ============================================================

ipcMain.handle('udp:send', async (_e, host: string, port: number, message: string) => {
  try {
    return new Promise((resolve) => {
      const client = dgram.createSocket('udp4');
      const buf = Buffer.from(message);
      client.send(buf, 0, buf.length, port, host, (err) => {
        client.close();
        if (err) {
          resolve({ success: false, message: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// LoRaWAN IPC Handler (simulate network server webhook POST)
// ============================================================

ipcMain.handle('lorawan:send', async (_e, webhookUrl: string, devEui: string, appId: string, fPort: number, payload: string) => {
  try {
    // Build ChirpStack v4 compatible uplink webhook body
    const body = {
      deduplicationId: `sim-${Date.now()}`,
      time: new Date().toISOString(),
      deviceInfo: {
        devEui,
        deviceName: `sim-${devEui}`,
        applicationId: appId || 'simulator',
        applicationName: 'Firefly Simulator',
      },
      fCnt: Math.floor(Math.random() * 65535),
      fPort,
      data: Buffer.from(payload).toString('base64'),
      object: (() => { try { return JSON.parse(payload); } catch { return { raw: payload }; } })(),
      rxInfo: [
        {
          gatewayId: 'sim-gateway-001',
          rssi: -60 - Math.floor(Math.random() * 40),
          snr: 5 + Math.random() * 10,
          channel: 0,
        },
      ],
      txInfo: {
        frequency: 868100000,
        modulation: 'LORA',
        dataRate: { modulation: 'LORA', bandwidth: 125, spreadFactor: 7, codeRate: '4/5' },
      },
    };

    const http = await import('http');
    const https = await import('https');
    const url = new URL(webhookUrl);
    const isHttps = url.protocol === 'https:';
    const postData = JSON.stringify(body);

    return new Promise((resolve) => {
      const req = (isHttps ? https : http).request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk; });
          res.on('end', () => {
            resolve({ success: true, statusCode: res.statusCode, body: data });
          });
        },
      );
      req.on('error', (err: any) => {
        resolve({ success: false, message: err.message });
      });
      req.write(postData);
      req.end();
    });
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

// ============================================================
// File Import IPC Handler
// ============================================================

ipcMain.handle('file:export', async (_e, content: string, defaultName: string) => {
  try {
    const ext = defaultName.endsWith('.csv') ? 'csv' : 'json';
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '导出设备配置',
      defaultPath: defaultName,
      filters: [
        { name: ext === 'csv' ? 'CSV' : 'JSON', extensions: [ext] },
      ],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, message: 'canceled' };
    }
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('file:import', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '导入设备配置',
      filters: [
        { name: 'JSON / CSV', extensions: ['json', 'csv'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'canceled' };
    }
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    return { success: true, content, ext, filePath };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});
