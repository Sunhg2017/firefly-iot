export type VisualFlowDirection = 'UPLINK' | 'DOWNLINK';

type BaseVisualConfig = {
  topic?: string;
  payloadField?: string;
  deviceNameField?: string;
  timestampField?: string;
  messageType?: string;
};

export type UplinkVisualConfig = BaseVisualConfig & {
  template?: 'JSON_PROPERTY';
};

export type DownlinkVisualConfig = BaseVisualConfig & {
  template?: 'JSON_ENCODE';
  payloadEncoding?: 'JSON' | 'TEXT' | 'HEX' | 'BASE64';
};

const DEFAULT_UPLINK_CONFIG: UplinkVisualConfig = {
  template: 'JSON_PROPERTY',
  topic: '/up/property',
  payloadField: 'properties',
  deviceNameField: 'deviceName',
  timestampField: 'timestamp',
  messageType: 'PROPERTY_REPORT',
};

const DEFAULT_DOWNLINK_CONFIG: DownlinkVisualConfig = {
  template: 'JSON_ENCODE',
  topic: '/down/property',
  payloadField: 'payload',
  payloadEncoding: 'JSON',
  messageType: 'PROPERTY_SET',
};

const asPrettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const parseObject = (raw: string) => {
  const source = raw.trim() || '{}';
  const parsed = JSON.parse(source) as unknown;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('可视化配置必须是 JSON 对象');
  }
  return parsed as Record<string, unknown>;
};

export const defaultVisualConfigForDirection = (direction: VisualFlowDirection) =>
  asPrettyJson(direction === 'DOWNLINK' ? DEFAULT_DOWNLINK_CONFIG : DEFAULT_UPLINK_CONFIG);

export const normalizeVisualConfigText = (raw: string, direction: VisualFlowDirection) => {
  const parsed = parseObject(raw || defaultVisualConfigForDirection(direction));
  return asPrettyJson(parsed);
};

export const buildScriptFromVisualConfig = (raw: string, direction: VisualFlowDirection) => {
  const parsed = parseObject(raw);
  if (direction === 'DOWNLINK') {
    const config = { ...DEFAULT_DOWNLINK_CONFIG, ...parsed } as DownlinkVisualConfig;
    return [
      'function encode(ctx) {',
      '  const config = ctx.config || {};',
      `  const topic = ctx.topic || config.topic || '${config.topic}';`,
      `  const payloadField = config.payloadField || '${config.payloadField}';`,
      `  const payloadEncoding = config.payloadEncoding || '${config.payloadEncoding}';`,
      '  const source = ctx.payload && typeof ctx.payload === "object" ? ctx.payload : {};',
      '  const payload = payloadField && source[payloadField] !== undefined ? source[payloadField] : source;',
      '  if (payloadEncoding === "TEXT") {',
      '    return { topic, payloadText: typeof payload === "string" ? payload : JSON.stringify(payload) };',
      '  }',
      '  if (payloadEncoding === "HEX") {',
      '    const text = typeof payload === "string" ? payload : JSON.stringify(payload);',
      '    return { topic, payloadHex: text };',
      '  }',
      '  if (payloadEncoding === "BASE64") {',
      '    const text = typeof payload === "string" ? payload : JSON.stringify(payload);',
      '    return { topic, payloadText: text, payloadEncoding };',
      '  }',
      '  return {',
      '    topic,',
      '    payloadText: JSON.stringify(payload),',
      '    payloadEncoding: "JSON",',
      '  };',
      '}',
    ].join('\n');
  }

  const config = { ...DEFAULT_UPLINK_CONFIG, ...parsed } as UplinkVisualConfig;
  return [
    'function parse(ctx) {',
    '  const config = ctx.config || {};',
    `  const payloadField = config.payloadField || '${config.payloadField}';`,
    `  const deviceNameField = config.deviceNameField || '${config.deviceNameField}';`,
    `  const timestampField = config.timestampField || '${config.timestampField}';`,
    `  const topic = ctx.topic || config.topic || '${config.topic}';`,
    `  const messageType = config.messageType || '${config.messageType}';`,
    "  const rawBody = json.parse(ctx.payloadText || '{}');",
    "  const body = rawBody && typeof rawBody === 'object' ? rawBody : { value: rawBody };",
    '  const payload = body[payloadField] && typeof body[payloadField] === "object"',
    '    ? body[payloadField]',
    '    : body;',
    '  return {',
    '    messages: [',
    '      {',
    '        type: messageType,',
    '        topic,',
    '        payload,',
    '        deviceName: body[deviceNameField] || undefined,',
    '        timestamp: body[timestampField] || Date.now(),',
    '      },',
    '    ],',
    '  };',
    '}',
  ].join('\n');
};
