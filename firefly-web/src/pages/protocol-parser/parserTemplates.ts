export interface ProtocolParserTemplate {
  key: string;
  label: string;
  description: string;
  tip: string;
  tags: string[];
  protocol: string;
  transport: string;
  direction: string;
  parserMode: string;
  frameMode: string;
  timeoutMs: number;
  errorPolicy: string;
  matchRuleJson: string;
  frameConfigJson: string;
  parserConfigJson: string;
  scriptLanguage: string;
  scriptContent: string;
}

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const joinScript = (lines: string[]) => lines.join('\n');

const JSON_PROPERTY_SCRIPT = joinScript([
  'function parse(ctx) {',
  '  const config = ctx.config || {};',
  "  const rawBody = json.parse(ctx.payloadText || '{}');",
  "  const body = rawBody && typeof rawBody === 'object' ? rawBody : { value: rawBody };",
  "  const payloadField = config.payloadField || 'properties';",
  "  const timestampField = config.timestampField || 'timestamp';",
  "  const deviceNameField = config.deviceNameField || 'deviceName';",
  '  const nestedPayload = body[payloadField];',
  "  const payload = nestedPayload && !Array.isArray(nestedPayload) && typeof nestedPayload === 'object'",
  '    ? nestedPayload',
  '    : body;',
  '  return {',
  '    messages: [',
  '      {',
  "        type: config.messageType || 'PROPERTY_REPORT',",
  "        topic: ctx.topic || config.defaultTopic || '/up/property',",
  '        payload,',
  '        deviceName: body[deviceNameField] || undefined,',
  '        timestamp: body[timestampField] || Date.now(),',
  '      },',
  '    ],',
  '  };',
  '}',
]);

export const PROTOCOL_PARSER_TEMPLATES: ProtocolParserTemplate[] = [
  {
    key: 'tcp-raw-pass-through',
    label: 'TCP 原始透传',
    description: '不拆包，直接把原始 Hex/Text 落成 RAW_DATA，适合先接入未知设备协议。',
    tip: '先把链路跑通，再逐步把 RAW_DATA 精细化成属性或事件上报。',
    tags: ['TCP', 'RAW_DATA', '快速接入'],
    protocol: 'TCP_UDP',
    transport: 'TCP',
    direction: 'UPLINK',
    parserMode: 'SCRIPT',
    frameMode: 'NONE',
    timeoutMs: 50,
    errorPolicy: 'ERROR',
    matchRuleJson: prettyJson({
      topicPrefix: '/tcp/',
    }),
    frameConfigJson: prettyJson({}),
    parserConfigJson: prettyJson({
      defaultTopic: '/tcp/raw',
      messageType: 'RAW_DATA',
    }),
    scriptLanguage: 'JS',
    scriptContent: joinScript([
      'function parse(ctx) {',
      '  const config = ctx.config || {};',
      '  return {',
      '    messages: [',
      '      {',
      "        type: config.messageType || 'RAW_DATA',",
      "        topic: ctx.topic || config.defaultTopic || '/tcp/raw',",
      '        payload: {',
      "          rawHex: ctx.payloadHex || '',",
      "          rawText: ctx.payloadText || '',",
      "          remoteAddress: ctx.remoteAddress || '',",
      "          sessionId: ctx.sessionId || '',",
      '        },',
      '        timestamp: Date.now(),',
      '      },',
      '    ],',
      '  };',
      '}',
    ]),
  },
  {
    key: 'tcp-delimiter-property-report',
    label: 'TCP 分隔符属性上报',
    description: '按换行拆包，解析 `key=value` 文本帧并输出 PROPERTY_REPORT。',
    tip: '调试时建议把 topic 设成 `/tcp/telemetry`，payload 示例：`temp=23.6,humidity=48`。',
    tags: ['TCP', 'DELIMITER', 'PROPERTY_REPORT'],
    protocol: 'TCP_UDP',
    transport: 'TCP',
    direction: 'UPLINK',
    parserMode: 'SCRIPT',
    frameMode: 'DELIMITER',
    timeoutMs: 50,
    errorPolicy: 'ERROR',
    matchRuleJson: prettyJson({
      topicPrefix: '/tcp/telemetry',
    }),
    frameConfigJson: prettyJson({
      delimiterHex: '0A',
      stripDelimiter: true,
    }),
    parserConfigJson: prettyJson({
      defaultTopic: '/tcp/telemetry',
      messageType: 'PROPERTY_REPORT',
      pairSeparator: ',',
      kvSeparator: '=',
    }),
    scriptLanguage: 'JS',
    scriptContent: joinScript([
      'function parseValue(raw) {',
      "  const text = String(raw || '').trim();",
      "  if (text === '') {",
      "    return '';",
      '  }',
      '  const numeric = Number(text);',
      '  return Number.isNaN(numeric) ? text : numeric;',
      '}',
      '',
      'function parse(ctx) {',
      '  const config = ctx.config || {};',
      "  const pairSeparator = config.pairSeparator || ',';",
      "  const kvSeparator = config.kvSeparator || '=';",
      "  const text = String(ctx.payloadText || '').trim();",
      '  if (!text) {',
      '    return { drop: true };',
      '  }',
      '  const payload = {};',
      '  for (const segment of text.split(pairSeparator)) {',
      '    const index = segment.indexOf(kvSeparator);',
      '    if (index < 0) {',
      '      continue;',
      '    }',
      '    const key = segment.slice(0, index).trim();',
      '    const value = segment.slice(index + kvSeparator.length).trim();',
      '    if (!key) {',
      '      continue;',
      '    }',
      '    payload[key] = parseValue(value);',
      '  }',
      '  return {',
      '    messages: [',
      '      {',
      "        type: config.messageType || 'PROPERTY_REPORT',",
      "        topic: ctx.topic || config.defaultTopic || '/tcp/telemetry',",
      '        payload,',
      '        timestamp: Date.now(),',
      '      },',
      '    ],',
      '  };',
      '}',
    ]),
  },
  {
    key: 'mqtt-json-property-report',
    label: 'MQTT JSON 属性上报',
    description: '解析 MQTT JSON 消息，优先提取 `properties` 字段并映射为属性上报。',
    tip: '适合设备上行主题固定、payload 为标准 JSON 的场景。',
    tags: ['MQTT', 'JSON', 'PROPERTY_REPORT'],
    protocol: 'MQTT',
    transport: 'MQTT',
    direction: 'UPLINK',
    parserMode: 'SCRIPT',
    frameMode: 'NONE',
    timeoutMs: 50,
    errorPolicy: 'ERROR',
    matchRuleJson: prettyJson({
      topicPrefix: '/up/property',
    }),
    frameConfigJson: prettyJson({}),
    parserConfigJson: prettyJson({
      defaultTopic: '/up/property',
      payloadField: 'properties',
      deviceNameField: 'deviceName',
      timestampField: 'timestamp',
      messageType: 'PROPERTY_REPORT',
    }),
    scriptLanguage: 'JS',
    scriptContent: JSON_PROPERTY_SCRIPT,
  },
  {
    key: 'http-json-property-report',
    label: 'HTTP JSON 属性上报',
    description: '解析 HTTP JSON 请求体，支持直接上报属性或从 `properties` 字段提取。',
    tip: '调试时将 topic 填成请求 path，例如 `/data/report`，再把 JSON 请求体贴进 payload。',
    tags: ['HTTP', 'JSON', 'PROPERTY_REPORT'],
    protocol: 'HTTP',
    transport: 'HTTP',
    direction: 'UPLINK',
    parserMode: 'SCRIPT',
    frameMode: 'NONE',
    timeoutMs: 50,
    errorPolicy: 'ERROR',
    matchRuleJson: prettyJson({
      topicPrefix: '/data/report',
    }),
    frameConfigJson: prettyJson({}),
    parserConfigJson: prettyJson({
      defaultTopic: '/data/report',
      payloadField: 'properties',
      deviceNameField: 'deviceName',
      timestampField: 'timestamp',
      messageType: 'PROPERTY_REPORT',
    }),
    scriptLanguage: 'JS',
    scriptContent: JSON_PROPERTY_SCRIPT,
  },
];
