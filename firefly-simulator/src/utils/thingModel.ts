export interface ThingModelParameter extends Record<string, unknown> {
  identifier?: string;
  name?: string;
  description?: string;
  required?: boolean;
  dataType?: Record<string, unknown>;
}

export interface ThingModelItem extends Record<string, unknown> {
  identifier?: string;
  name?: string;
  description?: string;
  dataType?: Record<string, unknown>;
  accessMode?: string;
  required?: boolean;
  type?: string;
  callType?: string;
  system?: boolean;
  readonly?: boolean;
  lifecycle?: boolean;
  inputData?: ThingModelParameter[];
  outputData?: ThingModelParameter[];
}

export interface ThingModelRoot extends Record<string, unknown> {
  properties: ThingModelItem[];
  events: ThingModelItem[];
  services: ThingModelItem[];
}

const BUILTIN_PROPERTIES: ThingModelItem[] = [
  {
    identifier: 'ip',
    name: 'IP Address',
    description: 'Current device network address',
    accessMode: 'r',
    system: true,
    readonly: true,
    dataType: { type: 'string' },
  },
];

const BUILTIN_EVENTS: ThingModelItem[] = [
  { identifier: 'online', name: 'Online', type: 'info', system: true, readonly: true, lifecycle: true, outputData: [] },
  { identifier: 'offline', name: 'Offline', type: 'info', system: true, readonly: true, lifecycle: true, outputData: [] },
  { identifier: 'heartbeat', name: 'Heartbeat', type: 'info', system: true, readonly: true, lifecycle: true, outputData: [] },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceParameter(value: unknown): ThingModelParameter {
  return isRecord(value) ? { ...value } : {};
}

function coerceItem(value: unknown): ThingModelItem {
  const source = isRecord(value) ? { ...value } : {};
  return {
    ...source,
    dataType: isRecord(source.dataType) ? { ...source.dataType } : undefined,
    inputData: Array.isArray(source.inputData) ? source.inputData.map(coerceParameter) : [],
    outputData: Array.isArray(source.outputData) ? source.outputData.map(coerceParameter) : [],
  };
}

function ensureBuiltinItems(items: ThingModelItem[], builtins: ThingModelItem[]): ThingModelItem[] {
  const builtinIds = new Set(builtins.map((item) => item.identifier).filter(Boolean));
  const customs = items.filter((item) => {
    const identifier = typeof item.identifier === 'string' ? item.identifier.trim() : '';
    return identifier && !builtinIds.has(identifier);
  });
  return [...builtins.map((item) => ({ ...item })), ...customs];
}

export function parseThingModelText(rawText: string): ThingModelRoot {
  try {
    const parsed = JSON.parse(rawText);
    const root = isRecord(parsed) ? parsed : {};
    return {
      ...root,
      properties: ensureBuiltinItems(
        Array.isArray(root.properties) ? root.properties.map(coerceItem) : [],
        BUILTIN_PROPERTIES,
      ),
      events: ensureBuiltinItems(
        Array.isArray(root.events) ? root.events.map(coerceItem) : [],
        BUILTIN_EVENTS,
      ),
      services: Array.isArray(root.services) ? root.services.map(coerceItem) : [],
    };
  } catch {
    return {
      properties: BUILTIN_PROPERTIES.map((item) => ({ ...item })),
      events: BUILTIN_EVENTS.map((item) => ({ ...item })),
      services: [],
    };
  }
}

function normalizeNumber(value: unknown, fallback: number): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizeInteger(value: unknown, fallback: number): number {
  return Math.trunc(normalizeNumber(value, fallback));
}

function randomInt(min: number, max: number): number {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function randomFloat(min: number, max: number, precision: number): number {
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const value = Math.random() * (safeMax - safeMin) + safeMin;
  return Number(value.toFixed(Math.max(0, precision)));
}

function randomString(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = '';
  const safeLength = Math.max(4, Math.min(64, length));
  for (let index = 0; index < safeLength; index += 1) {
    result += alphabet.charAt(randomInt(0, alphabet.length - 1));
  }
  return result;
}

function randomIpAddress(): string {
  return `192.168.${randomInt(0, 255)}.${randomInt(2, 254)}`;
}

function normalizeEnumValue(value: unknown): string | number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) && `${numericValue}` === trimmed ? numericValue : trimmed;
}

function resolveEnumCandidates(dataType?: Record<string, unknown>): Array<string | number> {
  if (!dataType) {
    return [];
  }
  const values = dataType.values;
  if (Array.isArray(values)) {
    return values.map(normalizeEnumValue).filter((value) => value !== '');
  }
  if (isRecord(values)) {
    return Object.keys(values).map(normalizeEnumValue).filter((value) => value !== '');
  }
  return [];
}

function resolveNestedDataType(dataType?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!dataType) {
    return undefined;
  }
  if (isRecord(dataType.itemType)) {
    return dataType.itemType;
  }
  if (typeof dataType.itemType === 'string') {
    return { type: dataType.itemType };
  }
  if (isRecord(dataType.items)) {
    return dataType.items;
  }
  if (isRecord(dataType.elementType)) {
    return dataType.elementType;
  }
  return undefined;
}

function resolveStructFields(dataType?: Record<string, unknown>): ThingModelParameter[] {
  if (!dataType) {
    return [];
  }
  if (Array.isArray(dataType.fields)) {
    return dataType.fields.map(coerceParameter);
  }
  if (isRecord(dataType.specs) && Array.isArray(dataType.specs.fields)) {
    return dataType.specs.fields.map(coerceParameter);
  }
  return [];
}

export function buildRandomValue(
  identifier: string,
  dataType?: Record<string, unknown>,
): string | number | boolean | Record<string, unknown> | Array<unknown> {
  const type = typeof dataType?.type === 'string' ? dataType.type.toLowerCase() : 'string';
  switch (type) {
    case 'int':
      return randomInt(normalizeInteger(dataType?.min, 0), normalizeInteger(dataType?.max, 100));
    case 'float':
    case 'double':
      return randomFloat(
        normalizeNumber(dataType?.min, 0),
        normalizeNumber(dataType?.max, 100),
        normalizeInteger(dataType?.precision, 2),
      );
    case 'bool':
    case 'boolean':
      return Math.random() >= 0.5;
    case 'enum': {
      const candidates = resolveEnumCandidates(dataType);
      if (candidates.length > 0) {
        return candidates[randomInt(0, candidates.length - 1)];
      }
      return 0;
    }
    case 'date':
      return Date.now();
    case 'array': {
      const itemDataType = resolveNestedDataType(dataType) || { type: 'string' };
      const itemCount = randomInt(1, 3);
      return Array.from({ length: itemCount }, () => buildRandomValue(identifier, itemDataType));
    }
    case 'struct': {
      const result: Record<string, unknown> = {};
      const fields = resolveStructFields(dataType);
      if (fields.length === 0) {
        result.value = randomInt(0, 100);
        return result;
      }
      fields.forEach((field) => {
        const fieldIdentifier = typeof field.identifier === 'string' && field.identifier.trim()
          ? field.identifier.trim()
          : `field_${Object.keys(result).length + 1}`;
        result[fieldIdentifier] = buildRandomValue(fieldIdentifier, isRecord(field.dataType) ? field.dataType : undefined);
      });
      return result;
    }
    case 'string':
    default: {
      if (identifier === 'ip') {
        return randomIpAddress();
      }
      const length = normalizeInteger(dataType?.length, 12);
      return randomString(length);
    }
  }
}

export function buildRandomPropertyPayload(item: ThingModelItem): Record<string, unknown> {
  const identifier = typeof item.identifier === 'string' ? item.identifier.trim() : '';
  if (!identifier) {
    return {};
  }
  return {
    [identifier]: buildRandomValue(identifier, isRecord(item.dataType) ? item.dataType : undefined),
  };
}

export function buildRandomPropertyBatchPayload(items: ThingModelItem[]): Record<string, unknown> {
  return items.reduce<Record<string, unknown>>((result, item) => {
    Object.assign(result, buildRandomPropertyPayload(item));
    return result;
  }, {});
}

export function buildRandomEventPayload(item: ThingModelItem): Record<string, unknown> {
  const identifier = typeof item.identifier === 'string' && item.identifier.trim()
    ? item.identifier.trim()
    : 'event';
  const payload: Record<string, unknown> = {
    identifier,
    eventType: identifier,
    eventName: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : identifier,
    timestamp: Date.now(),
  };
  const outputData = Array.isArray(item.outputData) ? item.outputData : [];
  outputData.forEach((field) => {
    const fieldIdentifier = typeof field.identifier === 'string' && field.identifier.trim()
      ? field.identifier.trim()
      : `field_${Object.keys(payload).length + 1}`;
    payload[fieldIdentifier] = buildRandomValue(fieldIdentifier, isRecord(field.dataType) ? field.dataType : undefined);
  });
  return payload;
}
