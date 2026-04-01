import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIMULATOR_ROOT = path.resolve(__dirname, '..');
const DEFAULT_PROTOCOL_BASE_URL = 'http://localhost:9070';
const DEFAULT_GATEWAY_BASE_URL = 'http://localhost:8080';
const DEFAULT_TCP_PORT = 8900;
const DEFAULT_UDP_PORT = 8901;
const DEFAULT_USER_AGENT = 'Firefly-Simulator-SampleBootstrap/1.0';
const SAMPLE_PRODUCT_NAME = 'Simulator Custom Protocol Baseline';
const SAMPLE_MARKER = 'SIMULATOR_CUSTOM_PROTOCOL_BASELINE_V1';
const DEFAULT_OUTPUT_PATH = path.join(SIMULATOR_ROOT, 'samples', 'custom-protocol-devices.local.json');

const WS_UPLINK_SCRIPT = `function parse(ctx) {
  const config = ctx.config || {};
  const body = JSON.parse(String(ctx.payloadText || '{}'));
  const payloadField = config.payloadField || 'payload';
  const deviceNameField = config.deviceNameField || 'deviceName';
  const timestampField = config.timestampField || 'timestamp';
  const payload = body && typeof body === 'object' && body[payloadField] && typeof body[payloadField] === 'object'
    ? body[payloadField]
    : body;

  return {
    messages: [
      {
        type: config.messageType || 'PROPERTY_REPORT',
        topic: ctx.topic || config.defaultTopic || '/ws/data',
        payload,
        deviceName: body[deviceNameField] || config.defaultDeviceName || undefined,
        timestamp: body[timestampField] || Date.now()
      }
    ]
  };
}`;

const WS_DOWNLINK_SCRIPT = `function encode(ctx) {
  const config = ctx.config || {};
  const root = ctx.payload && typeof ctx.payload === 'object' ? ctx.payload : {};
  const payload = root.payload && typeof root.payload === 'object' ? root.payload : root;

  return {
    topic: ctx.topic || config.defaultTopic || '/downstream',
    payloadText: JSON.stringify(payload),
    payloadEncoding: config.payloadEncoding || 'JSON',
    headers: config.headers || {}
  };
}`;

const TCP_UDP_UPLINK_SCRIPT = `function parseScalar(raw) {
  const text = String(raw || '').trim();
  if (text === '') {
    return '';
  }
  if (text === 'true') {
    return true;
  }
  if (text === 'false') {
    return false;
  }
  const numeric = Number(text);
  return Number.isNaN(numeric) ? text : numeric;
}

function parseKv(text, pairSeparator, kvSeparator) {
  const payload = {};
  for (const segment of String(text || '').split(pairSeparator)) {
    const index = segment.indexOf(kvSeparator);
    if (index < 0) {
      continue;
    }
    const key = segment.slice(0, index).trim();
    const value = segment.slice(index + kvSeparator.length).trim();
    if (!key) {
      continue;
    }
    payload[key] = parseScalar(value);
  }
  return payload;
}

function parse(ctx) {
  const config = ctx.config || {};
  const text = String(ctx.payloadText || '').trim();
  if (!text) {
    return { drop: true };
  }

  let payload;
  let deviceName = config.defaultDeviceName || undefined;
  let timestamp = Date.now();
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
      deviceName = body.deviceName || deviceName;
      timestamp = body.timestamp || timestamp;
    } else {
      payload = { value: body };
    }
  } catch (error) {
    payload = parseKv(text, config.pairSeparator || ',', config.kvSeparator || '=');
  }

  return {
    messages: [
      {
        type: config.messageType || 'PROPERTY_REPORT',
        topic: ctx.topic || config.defaultTopic || '/tcp/data',
        payload,
        deviceName,
        timestamp
      }
    ]
  };
}`;

const TCP_UDP_DOWNLINK_SCRIPT = `function stringifyScalar(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function encode(ctx) {
  const config = ctx.config || {};
  const root = ctx.payload && typeof ctx.payload === 'object' ? ctx.payload : {};
  const payload = root.payload && typeof root.payload === 'object' ? root.payload : root;
  const pairSeparator = config.pairSeparator || ',';
  const kvSeparator = config.kvSeparator || '=';
  const payloadText = Object.entries(payload)
    .map(([key, value]) => key + kvSeparator + stringifyScalar(value))
    .join(pairSeparator);

  return {
    topic: ctx.topic || config.defaultTopic || '/downstream',
    payloadText,
    payloadEncoding: config.payloadEncoding || 'TEXT',
    headers: config.headers || {}
  };
}`;

const SAMPLE_TRANSPORTS = [
  {
    name: 'WebSocket',
    parserProtocol: 'WEBSOCKET',
    transport: 'WEBSOCKET',
    simulatorProtocol: 'WebSocket',
    deviceName: 'sim_custom_ws_01',
    nickname: 'Simulator WebSocket Sample',
    locator: {
      locatorType: 'SERIAL',
      locatorValue: 'SIM-CUSTOM-WS-01',
      primaryLocator: true,
    },
    uplinkTopic: '/ws/data',
    downlinkTopic: '/downstream',
    uplinkPayloadEncoding: 'JSON',
    uplinkPayload: JSON.stringify({
      deviceName: 'sim_custom_ws_01',
      timestamp: 1710000000000,
      payload: {
        temperature: 23.6,
        humidity: 48,
      },
    }),
    downlinkPayload: {
      payload: {
        power: true,
        brightness: 60,
      },
    },
    buildSimulatorConfig(options, productKey) {
      return {
        name: 'Custom Protocol WebSocket Sample',
        protocol: 'WebSocket',
        productKey,
        deviceName: this.deviceName,
        locators: [this.locator],
        wsEndpoint: buildWsEndpoint(options.protocolBaseUrl),
      };
    },
    buildUplinkDefinition(productId) {
      return {
        productId,
        scopeType: 'PRODUCT',
        scopeId: productId,
        protocol: this.parserProtocol,
        transport: this.transport,
        direction: 'UPLINK',
        parserMode: 'SCRIPT',
        frameMode: 'NONE',
        matchRuleJson: {},
        frameConfigJson: {},
        parserConfigJson: {
          sampleKey: SAMPLE_MARKER,
          sampleTransport: this.transport,
          sampleDirection: 'UPLINK',
          defaultTopic: this.uplinkTopic,
          payloadField: 'payload',
          deviceNameField: 'deviceName',
          timestampField: 'timestamp',
          defaultDeviceName: this.deviceName,
          messageType: 'PROPERTY_REPORT',
        },
        visualConfigJson: {
          template: 'JSON_PROPERTY',
          topic: this.uplinkTopic,
          payloadField: 'payload',
          deviceNameField: 'deviceName',
          timestampField: 'timestamp',
          messageType: 'PROPERTY_REPORT',
        },
        scriptLanguage: 'JS',
        scriptContent: WS_UPLINK_SCRIPT,
        timeoutMs: 200,
        errorPolicy: 'ERROR',
        releaseMode: 'DEVICE_LIST',
        releaseConfigJson: {
          deviceNames: [this.deviceName],
        },
      };
    },
    buildDownlinkDefinition(productId) {
      return {
        productId,
        scopeType: 'PRODUCT',
        scopeId: productId,
        protocol: this.parserProtocol,
        transport: this.transport,
        direction: 'DOWNLINK',
        parserMode: 'SCRIPT',
        frameMode: 'NONE',
        matchRuleJson: {},
        frameConfigJson: {},
        parserConfigJson: {
          sampleKey: SAMPLE_MARKER,
          sampleTransport: this.transport,
          sampleDirection: 'DOWNLINK',
          defaultTopic: this.downlinkTopic,
          payloadEncoding: 'JSON',
          headers: {},
        },
        visualConfigJson: {
          template: 'DOWNLINK_JSON',
          topic: this.downlinkTopic,
          payloadEncoding: 'JSON',
        },
        scriptLanguage: 'JS',
        scriptContent: WS_DOWNLINK_SCRIPT,
        timeoutMs: 200,
        errorPolicy: 'ERROR',
        releaseMode: 'DEVICE_LIST',
        releaseConfigJson: {
          deviceNames: [this.deviceName],
        },
      };
    },
  },
  {
    name: 'TCP',
    parserProtocol: 'TCP_UDP',
    transport: 'TCP',
    simulatorProtocol: 'TCP',
    deviceName: 'sim_custom_tcp_01',
    nickname: 'Simulator TCP Sample',
    locator: {
      locatorType: 'IMEI',
      locatorValue: '860000000000001',
      primaryLocator: true,
    },
    uplinkTopic: '/tcp/data',
    downlinkTopic: '/downstream',
    uplinkPayloadEncoding: 'TEXT',
    uplinkPayload: 'temperature=23.6,humidity=48',
    downlinkPayload: {
      payload: {
        power: true,
        brightness: 60,
      },
    },
    buildSimulatorConfig(options, productKey) {
      return {
        name: 'Custom Protocol TCP Sample',
        protocol: 'TCP',
        productKey,
        deviceName: this.deviceName,
        locators: [this.locator],
        tcpHost: options.tcpHost,
        tcpPort: options.tcpPort,
      };
    },
    buildUplinkDefinition(productId) {
      return {
        productId,
        scopeType: 'PRODUCT',
        scopeId: productId,
        protocol: this.parserProtocol,
        transport: this.transport,
        direction: 'UPLINK',
        parserMode: 'SCRIPT',
        frameMode: 'NONE',
        matchRuleJson: {},
        frameConfigJson: {},
        parserConfigJson: {
          sampleKey: SAMPLE_MARKER,
          sampleTransport: this.transport,
          sampleDirection: 'UPLINK',
          defaultTopic: this.uplinkTopic,
          defaultDeviceName: this.deviceName,
          messageType: 'PROPERTY_REPORT',
          pairSeparator: ',',
          kvSeparator: '=',
        },
        visualConfigJson: {
          template: 'TEXT_KV',
          topic: this.uplinkTopic,
          pairSeparator: ',',
          kvSeparator: '=',
          messageType: 'PROPERTY_REPORT',
        },
        scriptLanguage: 'JS',
        scriptContent: TCP_UDP_UPLINK_SCRIPT,
        timeoutMs: 200,
        errorPolicy: 'ERROR',
        releaseMode: 'DEVICE_LIST',
        releaseConfigJson: {
          deviceNames: [this.deviceName],
        },
      };
    },
    buildDownlinkDefinition(productId) {
      return {
        productId,
        scopeType: 'PRODUCT',
        scopeId: productId,
        protocol: this.parserProtocol,
        transport: this.transport,
        direction: 'DOWNLINK',
        parserMode: 'SCRIPT',
        frameMode: 'NONE',
        matchRuleJson: {},
        frameConfigJson: {},
        parserConfigJson: {
          sampleKey: SAMPLE_MARKER,
          sampleTransport: this.transport,
          sampleDirection: 'DOWNLINK',
          defaultTopic: this.downlinkTopic,
          payloadEncoding: 'TEXT',
          pairSeparator: ',',
          kvSeparator: '=',
          headers: {},
        },
        visualConfigJson: {
          template: 'TEXT_KV',
          topic: this.downlinkTopic,
          pairSeparator: ',',
          kvSeparator: '=',
        },
        scriptLanguage: 'JS',
        scriptContent: TCP_UDP_DOWNLINK_SCRIPT,
        timeoutMs: 200,
        errorPolicy: 'ERROR',
        releaseMode: 'DEVICE_LIST',
        releaseConfigJson: {
          deviceNames: [this.deviceName],
        },
      };
    },
  },
  {
    name: 'UDP',
    parserProtocol: 'TCP_UDP',
    transport: 'UDP',
    simulatorProtocol: 'UDP',
    deviceName: 'sim_custom_udp_01',
    nickname: 'Simulator UDP Sample',
    locator: {
      locatorType: 'ICCID',
      locatorValue: '8986000000000000001',
      primaryLocator: true,
    },
    uplinkTopic: '/udp/data',
    downlinkTopic: '/downstream',
    uplinkPayloadEncoding: 'TEXT',
    uplinkPayload: 'temperature=23.6,humidity=48',
    downlinkPayload: {
      payload: {
        power: true,
        brightness: 60,
      },
    },
    buildSimulatorConfig(options, productKey) {
      return {
        name: 'Custom Protocol UDP Sample',
        protocol: 'UDP',
        productKey,
        deviceName: this.deviceName,
        locators: [this.locator],
        udpHost: options.udpHost,
        udpPort: options.udpPort,
      };
    },
    buildUplinkDefinition(productId) {
      return {
        productId,
        scopeType: 'PRODUCT',
        scopeId: productId,
        protocol: this.parserProtocol,
        transport: this.transport,
        direction: 'UPLINK',
        parserMode: 'SCRIPT',
        frameMode: 'NONE',
        matchRuleJson: {},
        frameConfigJson: {},
        parserConfigJson: {
          sampleKey: SAMPLE_MARKER,
          sampleTransport: this.transport,
          sampleDirection: 'UPLINK',
          defaultTopic: this.uplinkTopic,
          defaultDeviceName: this.deviceName,
          messageType: 'PROPERTY_REPORT',
          pairSeparator: ',',
          kvSeparator: '=',
        },
        visualConfigJson: {
          template: 'TEXT_KV',
          topic: this.uplinkTopic,
          pairSeparator: ',',
          kvSeparator: '=',
          messageType: 'PROPERTY_REPORT',
        },
        scriptLanguage: 'JS',
        scriptContent: TCP_UDP_UPLINK_SCRIPT,
        timeoutMs: 200,
        errorPolicy: 'ERROR',
        releaseMode: 'DEVICE_LIST',
        releaseConfigJson: {
          deviceNames: [this.deviceName],
        },
      };
    },
    buildDownlinkDefinition(productId) {
      return {
        productId,
        scopeType: 'PRODUCT',
        scopeId: productId,
        protocol: this.parserProtocol,
        transport: this.transport,
        direction: 'DOWNLINK',
        parserMode: 'SCRIPT',
        frameMode: 'NONE',
        matchRuleJson: {},
        frameConfigJson: {},
        parserConfigJson: {
          sampleKey: SAMPLE_MARKER,
          sampleTransport: this.transport,
          sampleDirection: 'DOWNLINK',
          defaultTopic: this.downlinkTopic,
          payloadEncoding: 'TEXT',
          pairSeparator: ',',
          kvSeparator: '=',
          headers: {},
        },
        visualConfigJson: {
          template: 'TEXT_KV',
          topic: this.downlinkTopic,
          pairSeparator: ',',
          kvSeparator: '=',
        },
        scriptLanguage: 'JS',
        scriptContent: TCP_UDP_DOWNLINK_SCRIPT,
        timeoutMs: 200,
        errorPolicy: 'ERROR',
        releaseMode: 'DEVICE_LIST',
        releaseConfigJson: {
          deviceNames: [this.deviceName],
        },
      };
    },
  },
];

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const flag = token.slice(2);
    if (!flag) {
      continue;
    }
    if (flag.startsWith('no-')) {
      parsed[toCamelCase(flag.slice(3))] = false;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[toCamelCase(flag)] = next;
      index += 1;
      continue;
    }
    parsed[toCamelCase(flag)] = true;
  }
  return parsed;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  return fallback;
}

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
}

function trimText(value) {
  return value == null ? '' : String(value).trim();
}

function deriveHostFromBaseUrl(baseUrl) {
  try {
    return new URL(baseUrl).hostname || 'localhost';
  } catch {
    return 'localhost';
  }
}

function buildWsEndpoint(protocolBaseUrl) {
  try {
    const target = new URL(protocolBaseUrl || DEFAULT_PROTOCOL_BASE_URL);
    target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
    target.pathname = `${target.pathname.replace(/\/+$/, '')}/ws/device`;
    target.search = '';
    target.hash = '';
    return target.toString();
  } catch {
    return 'ws://localhost:9070/ws/device';
  }
}

function buildServiceUrl(baseUrl, serviceCode, pathname) {
  const normalizedBaseUrl = trimText(baseUrl).replace(/\/+$/, '');
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${normalizedBaseUrl}/${serviceCode}${normalizedPath}`;
}

function jsonStringify(value) {
  return JSON.stringify(value == null ? {} : value);
}

async function requestJson(baseUrl, serviceCode, pathname, options = {}) {
  const method = options.method || 'POST';
  const response = await fetch(buildServiceUrl(baseUrl, serviceCode, pathname), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Platform': 'WEB',
      'User-Agent': DEFAULT_USER_AGENT,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body === undefined || method === 'GET' ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Unexpected response from ${pathname}: ${text || response.status}`);
  }
  if (!response.ok || (typeof payload.code === 'number' && payload.code !== 0)) {
    throw new Error(payload.message || `Request failed: ${response.status}`);
  }
  return payload.data;
}

async function login(baseUrl, username, password) {
  const payload = await requestJson(baseUrl, 'SYSTEM', '/api/v1/auth/login', {
    body: {
      loginMethod: 'PASSWORD',
      platform: 'WEB',
      username,
      password,
      fingerprint: 'simulator-custom-protocol-bootstrap',
    },
  });
  if (!payload?.accessToken) {
    throw new Error('Login succeeded but accessToken is missing');
  }
  return payload.accessToken;
}

async function listProducts(baseUrl, token, keyword) {
  return requestJson(baseUrl, 'DEVICE', '/api/v1/products/list', {
    token,
    body: {
      pageNum: 1,
      pageSize: 200,
      keyword,
      protocol: 'CUSTOM',
    },
  }).then((data) => Array.isArray(data?.records) ? data.records : []);
}

async function ensureProduct(baseUrl, token) {
  const products = await listProducts(baseUrl, token, SAMPLE_PRODUCT_NAME);
  const matched = products.filter((item) => item?.name === SAMPLE_PRODUCT_NAME && item?.protocol === 'CUSTOM');
  const product = matched[0] || await requestJson(baseUrl, 'DEVICE', '/api/v1/products', {
    token,
    body: {
      name: SAMPLE_PRODUCT_NAME,
      description: `${SAMPLE_PRODUCT_NAME} (${SAMPLE_MARKER})`,
      category: 'SENSOR',
      protocol: 'CUSTOM',
      nodeType: 'DEVICE',
      dataFormat: 'CUSTOM',
      deviceAuthType: 'DEVICE_SECRET',
    },
  });

  if (trimText(product.status) !== 'PUBLISHED') {
    await requestJson(baseUrl, 'DEVICE', `/api/v1/products/${product.id}/publish`, {
      method: 'PUT',
      token,
      body: {},
    });
    return {
      ...product,
      status: 'PUBLISHED',
    };
  }
  return product;
}

async function listDevices(baseUrl, token, productId) {
  return requestJson(baseUrl, 'DEVICE', '/api/v1/devices/list', {
    token,
    body: {
      pageNum: 1,
      pageSize: 200,
      productId,
    },
  }).then((data) => Array.isArray(data?.records) ? data.records : []);
}

async function listLocators(baseUrl, token, deviceId) {
  return requestJson(baseUrl, 'DEVICE', `/api/v1/devices/${deviceId}/locators`, {
    method: 'GET',
    token,
  }).then((data) => Array.isArray(data) ? data : []);
}

async function ensureDevice(baseUrl, token, productId, sample) {
  const devices = await listDevices(baseUrl, token, productId);
  let device = devices.find((item) => item?.deviceName === sample.deviceName);
  if (!device) {
    const created = await requestJson(baseUrl, 'DEVICE', '/api/v1/devices', {
      token,
      body: {
        productId,
        deviceName: sample.deviceName,
        nickname: sample.nickname,
        locators: [sample.locator],
      },
    });
    device = {
      id: created?.deviceId || created?.id,
      deviceName: sample.deviceName,
      nickname: sample.nickname,
    };
  }

  const locators = await listLocators(baseUrl, token, device.id);
  const existing = locators.find((item) => item.locatorType === sample.locator.locatorType && item.locatorValue === sample.locator.locatorValue);
  if (!existing) {
    await requestJson(baseUrl, 'DEVICE', `/api/v1/devices/${device.id}/locators`, {
      token,
      body: sample.locator,
    });
  } else if (Boolean(existing.primaryLocator) !== Boolean(sample.locator.primaryLocator)) {
    await requestJson(baseUrl, 'DEVICE', `/api/v1/devices/${device.id}/locators/${existing.id}`, {
      method: 'PUT',
      token,
      body: {
        primaryLocator: sample.locator.primaryLocator,
      },
    });
  }

  return {
    id: Number(device.id),
    deviceName: sample.deviceName,
  };
}

function encodeDefinitionPayload(definition) {
  return {
    productId: definition.productId,
    scopeType: definition.scopeType,
    scopeId: definition.scopeId,
    protocol: definition.protocol,
    transport: definition.transport,
    direction: definition.direction,
    parserMode: definition.parserMode,
    frameMode: definition.frameMode,
    matchRuleJson: jsonStringify(definition.matchRuleJson),
    frameConfigJson: jsonStringify(definition.frameConfigJson),
    parserConfigJson: jsonStringify(definition.parserConfigJson),
    visualConfigJson: jsonStringify(definition.visualConfigJson),
    scriptLanguage: definition.scriptLanguage,
    scriptContent: definition.scriptContent,
    timeoutMs: definition.timeoutMs,
    errorPolicy: definition.errorPolicy,
    releaseMode: definition.releaseMode,
    releaseConfigJson: jsonStringify(definition.releaseConfigJson),
  };
}

function parseJsonObject(value) {
  if (!value || typeof value !== 'string') {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function listParserDefinitions(baseUrl, token, productId, sample) {
  return requestJson(baseUrl, 'DEVICE', '/api/v1/protocol-parsers/list', {
    token,
    body: {
      pageNum: 1,
      pageSize: 100,
      productId,
      protocol: sample.parserProtocol,
      transport: sample.transport,
    },
  }).then((data) => Array.isArray(data?.records) ? data.records : []);
}

async function ensureParserDefinition(baseUrl, token, productId, sample, direction, builder) {
  const definitions = await listParserDefinitions(baseUrl, token, productId, sample);
  const current = definitions.find((item) => {
    if (item?.direction !== direction || Number(item?.productId) !== Number(productId) || item?.scopeType !== 'PRODUCT') {
      return false;
    }
    const parserConfig = parseJsonObject(item?.parserConfigJson);
    return parserConfig.sampleKey === SAMPLE_MARKER
      && parserConfig.sampleTransport === sample.transport
      && parserConfig.sampleDirection === direction;
  });

  // The bootstrap script owns only definitions marked with SAMPLE_MARKER,
  // so reruns stay idempotent without rewriting unrelated user rules.
  const payload = encodeDefinitionPayload(builder.call(sample, productId));
  const definition = current
    ? await requestJson(baseUrl, 'DEVICE', `/api/v1/protocol-parsers/${current.id}`, {
        method: 'PUT',
        token,
        body: payload,
      })
    : await requestJson(baseUrl, 'DEVICE', '/api/v1/protocol-parsers', {
        token,
        body: payload,
      });

  const published = await requestJson(baseUrl, 'DEVICE', `/api/v1/protocol-parsers/${definition.id}/publish`, {
    token,
    body: {
      changeLog: `Bootstrap ${SAMPLE_MARKER}`,
    },
  });
  return published;
}

async function verifyDefinitions(baseUrl, token, product, samples, definitionMap) {
  const results = [];
  for (const sample of samples) {
    const uplink = definitionMap[`${sample.transport}:UPLINK`];
    const downlink = definitionMap[`${sample.transport}:DOWNLINK`];

    const uplinkResult = await requestJson(baseUrl, 'DEVICE', `/api/v1/protocol-parsers/${uplink.id}/test`, {
      token,
      body: {
        productId: product.id,
        protocol: sample.parserProtocol,
        transport: sample.transport,
        topic: sample.uplinkTopic,
        payloadEncoding: sample.uplinkPayloadEncoding,
        payload: sample.uplinkPayload,
      },
    });
    if (!uplinkResult?.success || !Array.isArray(uplinkResult?.messages) || uplinkResult.messages.length === 0) {
      throw new Error(`${sample.name} uplink verification failed`);
    }

    const downlinkResult = await requestJson(baseUrl, 'DEVICE', `/api/v1/protocol-parsers/${downlink.id}/encode-test`, {
      token,
      body: {
        productId: product.id,
        deviceName: sample.deviceName,
        topic: sample.downlinkTopic,
        messageType: 'PROPERTY_SET',
        payload: sample.downlinkPayload,
      },
    });
    if (!downlinkResult?.success || !trimText(downlinkResult?.payloadText)) {
      throw new Error(`${sample.name} downlink verification failed`);
    }

    results.push({
      transport: sample.transport,
      uplinkMessages: uplinkResult.messages.length,
      downlinkPayloadText: downlinkResult.payloadText,
    });
  }
  return results;
}

function writeSimulatorImportFile(outputPath, options, productKey) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  // Keep the generated simulator import aligned with the platform baseline so
  // ProductKey / DeviceName / locators always stay in sync for runtime checks.
  const payload = SAMPLE_TRANSPORTS.map((sample) => sample.buildSimulatorConfig(options, productKey));
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function loadOptions() {
  const args = parseArgs(process.argv.slice(2));
  const protocolBaseUrl = trimText(args.protocolBaseUrl || process.env.FIREFLY_PROTOCOL_BASE_URL || DEFAULT_PROTOCOL_BASE_URL);
  const derivedHost = deriveHostFromBaseUrl(protocolBaseUrl);
  return {
    baseUrl: trimText(args.baseUrl || process.env.FIREFLY_GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE_URL),
    protocolBaseUrl,
    tcpHost: trimText(args.tcpHost || process.env.FIREFLY_TCP_HOST || derivedHost || 'localhost'),
    tcpPort: toPositiveInteger(args.tcpPort || process.env.FIREFLY_TCP_PORT, DEFAULT_TCP_PORT),
    udpHost: trimText(args.udpHost || process.env.FIREFLY_UDP_HOST || derivedHost || 'localhost'),
    udpPort: toPositiveInteger(args.udpPort || process.env.FIREFLY_UDP_PORT, DEFAULT_UDP_PORT),
    username: trimText(args.username || process.env.FIREFLY_USERNAME),
    password: trimText(args.password || process.env.FIREFLY_PASSWORD),
    accessToken: trimText(args.accessToken || process.env.FIREFLY_ACCESS_TOKEN),
    output: path.resolve(trimText(args.output || process.env.FIREFLY_SIMULATOR_OUTPUT || DEFAULT_OUTPUT_PATH)),
    verify: toBoolean(args.verify ?? process.env.FIREFLY_VERIFY, true),
  };
}

async function main() {
  const options = loadOptions();
  if (!options.baseUrl) {
    throw new Error('Gateway base URL is required');
  }

  let accessToken = options.accessToken;
  if (!accessToken) {
    if (!options.username || !options.password) {
      throw new Error('Provide --access-token or --username/--password');
    }
    accessToken = await login(options.baseUrl, options.username, options.password);
  }

  console.log(`[bootstrap] Using gateway: ${options.baseUrl}`);
  const product = await ensureProduct(options.baseUrl, accessToken);
  console.log(`[bootstrap] Product ready: ${product.name} (${product.productKey})`);

  const platformDevices = {};
  for (const sample of SAMPLE_TRANSPORTS) {
    platformDevices[sample.transport] = await ensureDevice(options.baseUrl, accessToken, product.id, sample);
    console.log(`[bootstrap] Device ready: ${sample.transport} -> ${sample.deviceName}`);
  }

  const definitionMap = {};
  for (const sample of SAMPLE_TRANSPORTS) {
    const uplink = await ensureParserDefinition(options.baseUrl, accessToken, product.id, sample, 'UPLINK', sample.buildUplinkDefinition);
    const downlink = await ensureParserDefinition(options.baseUrl, accessToken, product.id, sample, 'DOWNLINK', sample.buildDownlinkDefinition);
    definitionMap[`${sample.transport}:UPLINK`] = uplink;
    definitionMap[`${sample.transport}:DOWNLINK`] = downlink;
    console.log(`[bootstrap] Parser ready: ${sample.transport} uplink=${uplink.id} downlink=${downlink.id}`);
  }

  const simulatorConfigs = writeSimulatorImportFile(options.output, options, product.productKey);
  console.log(`[bootstrap] Simulator import file written: ${options.output}`);

  let verification = [];
  if (options.verify) {
    verification = await verifyDefinitions(options.baseUrl, accessToken, product, SAMPLE_TRANSPORTS, definitionMap);
    for (const item of verification) {
      console.log(`[verify] ${item.transport}: uplinkMessages=${item.uplinkMessages}, downlinkPayload=${item.downlinkPayloadText}`);
    }
  }

  const summary = {
    product: {
      id: product.id,
      productKey: product.productKey,
      name: product.name,
      status: product.status,
    },
    platformDevices,
    parserDefinitions: Object.fromEntries(Object.entries(definitionMap).map(([key, value]) => [key, value.id])),
    simulatorConfigs,
    verification,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`[bootstrap] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
