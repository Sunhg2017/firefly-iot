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

export type ThingModelValueType =
  | 'int'
  | 'float'
  | 'double'
  | 'bool'
  | 'enum'
  | 'date'
  | 'array'
  | 'struct'
  | 'string';

export type ThingModelSimulationRuleMode = 'random' | 'fixed' | 'range';
export type ThingModelStringGenerator = 'random' | 'ip';

export interface ThingModelSimulationRule extends Record<string, unknown> {
  mode?: ThingModelSimulationRuleMode;
  fixedValue?: unknown;
  min?: number;
  max?: number;
  precision?: number;
  stringLength?: number;
  stringGenerator?: ThingModelStringGenerator;
  arrayMinLength?: number;
  arrayMaxLength?: number;
}

export type ThingModelSimulationRuleMap = Record<string, ThingModelSimulationRule>;

export interface ThingModelFieldDescriptor extends Record<string, unknown> {
  ruleKey: string;
  itemIdentifier: string;
  itemName: string;
  fieldPath: string;
  label: string;
  identifier: string;
  category: 'property' | 'event';
  depth: number;
  dataType?: Record<string, unknown>;
  valueType: ThingModelValueType;
}

interface BuildRandomValueOptions {
  rules?: ThingModelSimulationRuleMap;
  ruleKey?: string;
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

export function resolveThingModelEnumCandidates(dataType?: Record<string, unknown>): Array<string | number> {
  return resolveEnumCandidates(dataType);
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

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

function appendRuleKey(baseRuleKey: string | undefined, segment: string): string | undefined {
  if (!baseRuleKey) {
    return undefined;
  }
  if (segment === '[]') {
    return `${baseRuleKey}[]`;
  }
  return `${baseRuleKey}.${segment}`;
}

function appendFieldPath(basePath: string, segment: string): string {
  if (!basePath) {
    return segment;
  }
  if (segment === '[]') {
    return `${basePath}[]`;
  }
  return `${basePath}.${segment}`;
}

function resolveSimulationRule(
  rules: ThingModelSimulationRuleMap | undefined,
  ruleKey: string | undefined,
): ThingModelSimulationRule | undefined {
  if (!rules || !ruleKey) {
    return undefined;
  }
  return rules[ruleKey];
}

export function resolveThingModelValueType(dataType?: Record<string, unknown>): ThingModelValueType {
  const type = typeof dataType?.type === 'string' ? dataType.type.toLowerCase() : 'string';
  switch (type) {
    case 'int':
      return 'int';
    case 'float':
      return 'float';
    case 'double':
      return 'double';
    case 'bool':
    case 'boolean':
      return 'bool';
    case 'enum':
      return 'enum';
    case 'date':
      return 'date';
    case 'array':
      return 'array';
    case 'struct':
      return 'struct';
    case 'string':
    default:
      return 'string';
  }
}

export function resolveThingModelValueTypeLabel(dataType?: Record<string, unknown>): string {
  const valueType = resolveThingModelValueType(dataType);
  switch (valueType) {
    case 'int':
      return 'Integer';
    case 'float':
      return 'Float';
    case 'double':
      return 'Double';
    case 'bool':
      return 'Boolean';
    case 'enum':
      return 'Enum';
    case 'date':
      return 'Timestamp';
    case 'array':
      return 'Array';
    case 'struct':
      return 'Struct';
    case 'string':
    default:
      return 'String';
  }
}

export function buildPropertyRuleKey(identifier: string): string {
  return `property:${identifier}`;
}

export function buildEventFieldRuleKey(eventIdentifier: string, fieldPath: string): string {
  return `event:${eventIdentifier}.${fieldPath}`;
}

function pushFieldDescriptor(
  descriptors: ThingModelFieldDescriptor[],
  item: ThingModelItem,
  category: 'property' | 'event',
  ruleKey: string,
  fieldPath: string,
  label: string,
  identifier: string,
  depth: number,
  dataType?: Record<string, unknown>,
) {
  descriptors.push({
    ruleKey,
    itemIdentifier: typeof item.identifier === 'string' ? item.identifier.trim() : '',
    itemName: typeof item.name === 'string' && item.name.trim()
      ? item.name.trim()
      : (typeof item.identifier === 'string' ? item.identifier.trim() : ''),
    fieldPath,
    label,
    identifier,
    category,
    depth,
    dataType,
    valueType: resolveThingModelValueType(dataType),
  });
}

function collectNestedFieldDescriptors(
  descriptors: ThingModelFieldDescriptor[],
  item: ThingModelItem,
  category: 'property' | 'event',
  ruleKey: string,
  fieldPath: string,
  label: string,
  identifier: string,
  depth: number,
  dataType?: Record<string, unknown>,
) {
  const normalizedDataType = isRecord(dataType) ? dataType : undefined;
  pushFieldDescriptor(
    descriptors,
    item,
    category,
    ruleKey,
    fieldPath,
    label,
    identifier,
    depth,
    normalizedDataType,
  );

  const valueType = resolveThingModelValueType(normalizedDataType);
  if (valueType === 'struct') {
    resolveStructFields(normalizedDataType).forEach((field) => {
      const childIdentifier = typeof field.identifier === 'string' && field.identifier.trim()
        ? field.identifier.trim()
        : `field_${descriptors.length + 1}`;
      collectNestedFieldDescriptors(
        descriptors,
        item,
        category,
        appendRuleKey(ruleKey, childIdentifier) as string,
        appendFieldPath(fieldPath, childIdentifier),
        `${label}.${childIdentifier}`,
        childIdentifier,
        depth + 1,
        isRecord(field.dataType) ? field.dataType : undefined,
      );
    });
  }

  if (valueType === 'array') {
    const itemDataType = resolveNestedDataType(normalizedDataType) || { type: 'string' };
    collectNestedFieldDescriptors(
      descriptors,
      item,
      category,
      appendRuleKey(ruleKey, '[]') as string,
      appendFieldPath(fieldPath, '[]'),
      `${label}[]`,
      '[]',
      depth + 1,
      itemDataType,
    );
  }
}

export function describeThingModelItemFields(
  item: ThingModelItem,
  category: 'property' | 'event',
): ThingModelFieldDescriptor[] {
  const itemIdentifier = typeof item.identifier === 'string' ? item.identifier.trim() : '';
  if (!itemIdentifier) {
    return [];
  }

  const itemLabel = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : itemIdentifier;
  const descriptors: ThingModelFieldDescriptor[] = [];

  if (category === 'property') {
    collectNestedFieldDescriptors(
      descriptors,
      item,
      'property',
      buildPropertyRuleKey(itemIdentifier),
      itemIdentifier,
      itemLabel,
      itemIdentifier,
      0,
      isRecord(item.dataType) ? item.dataType : undefined,
    );
    return descriptors;
  }

  const outputData = Array.isArray(item.outputData) ? item.outputData : [];
  outputData.forEach((field) => {
    const fieldIdentifier = typeof field.identifier === 'string' && field.identifier.trim()
      ? field.identifier.trim()
      : `field_${descriptors.length + 1}`;
    collectNestedFieldDescriptors(
      descriptors,
      item,
      'event',
      buildEventFieldRuleKey(itemIdentifier, fieldIdentifier),
      fieldIdentifier,
      fieldIdentifier,
      fieldIdentifier,
      0,
      isRecord(field.dataType) ? field.dataType : undefined,
    );
  });
  return descriptors;
}

export function buildDefaultFixedValue(
  identifier: string,
  dataType?: Record<string, unknown>,
): string | number | boolean | Record<string, unknown> | Array<unknown> {
  const valueType = resolveThingModelValueType(dataType);
  switch (valueType) {
    case 'int':
      return normalizeInteger(dataType?.min, 0);
    case 'float':
    case 'double':
      return Number(normalizeNumber(dataType?.min, 0).toFixed(normalizeInteger(dataType?.precision, 2)));
    case 'bool':
      return false;
    case 'enum': {
      const candidates = resolveEnumCandidates(dataType);
      return candidates[0] ?? '';
    }
    case 'date':
      return Date.now();
    case 'array':
      return [];
    case 'struct': {
      const fields = resolveStructFields(dataType);
      return fields.reduce<Record<string, unknown>>((result, field) => {
        const fieldIdentifier = typeof field.identifier === 'string' && field.identifier.trim()
          ? field.identifier.trim()
          : `field_${Object.keys(result).length + 1}`;
        result[fieldIdentifier] = buildDefaultFixedValue(
          fieldIdentifier,
          isRecord(field.dataType) ? field.dataType : undefined,
        );
        return result;
      }, {});
    }
    case 'string':
    default:
      return identifier === 'ip' ? '192.168.0.10' : '';
  }
}

export function buildRandomValue(
  identifier: string,
  dataType?: Record<string, unknown>,
  options: BuildRandomValueOptions = {},
): string | number | boolean | Record<string, unknown> | Array<unknown> {
  const rule = resolveSimulationRule(options.rules, options.ruleKey);
  const valueType = resolveThingModelValueType(dataType);

  switch (valueType) {
    case 'int': {
      const defaultMin = normalizeInteger(dataType?.min, 0);
      const defaultMax = normalizeInteger(dataType?.max, 100);
      if (rule?.mode === 'fixed') {
        return normalizeInteger(rule.fixedValue, defaultMin);
      }
      const min = rule?.mode === 'range' ? normalizeInteger(rule.min, defaultMin) : defaultMin;
      const max = rule?.mode === 'range' ? normalizeInteger(rule.max, defaultMax) : defaultMax;
      return randomInt(min, max);
    }
    case 'float':
    case 'double': {
      const defaultMin = normalizeNumber(dataType?.min, 0);
      const defaultMax = normalizeNumber(dataType?.max, 100);
      const precision = normalizeInteger(rule?.precision, normalizeInteger(dataType?.precision, 2));
      if (rule?.mode === 'fixed') {
        return Number(normalizeNumber(rule.fixedValue, defaultMin).toFixed(Math.max(0, precision)));
      }
      const min = rule?.mode === 'range' ? normalizeNumber(rule.min, defaultMin) : defaultMin;
      const max = rule?.mode === 'range' ? normalizeNumber(rule.max, defaultMax) : defaultMax;
      return randomFloat(min, max, precision);
    }
    case 'bool':
      return rule?.mode === 'fixed' ? coerceBoolean(rule.fixedValue) : Math.random() >= 0.5;
    case 'enum': {
      const candidates = resolveEnumCandidates(dataType);
      if (rule?.mode === 'fixed') {
        const fixedValue = normalizeEnumValue(rule.fixedValue);
        if (fixedValue !== '') {
          return fixedValue;
        }
      }
      if (candidates.length > 0) {
        return candidates[randomInt(0, candidates.length - 1)];
      }
      return 0;
    }
    case 'date': {
      if (rule?.mode === 'fixed') {
        return normalizeInteger(rule.fixedValue, Date.now());
      }
      if (rule?.mode === 'range') {
        const now = Date.now();
        return randomInt(
          normalizeInteger(rule.min, now - 60_000),
          normalizeInteger(rule.max, now),
        );
      }
      return Date.now();
    }
    case 'array': {
      if (rule?.mode === 'fixed' && Array.isArray(rule.fixedValue)) {
        return rule.fixedValue;
      }
      const itemDataType = resolveNestedDataType(dataType) || { type: 'string' };
      const minLength = Math.max(0, normalizeInteger(rule?.arrayMinLength, 1));
      const maxLength = Math.max(minLength, normalizeInteger(rule?.arrayMaxLength, 3));
      const itemCount = randomInt(minLength, maxLength);
      const itemRuleKey = appendRuleKey(options.ruleKey, '[]');
      return Array.from({ length: itemCount }, () =>
        buildRandomValue(identifier, itemDataType, { rules: options.rules, ruleKey: itemRuleKey })
      );
    }
    case 'struct': {
      if (rule?.mode === 'fixed' && isRecord(rule.fixedValue)) {
        return rule.fixedValue;
      }
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
        result[fieldIdentifier] = buildRandomValue(
          fieldIdentifier,
          isRecord(field.dataType) ? field.dataType : undefined,
          {
            rules: options.rules,
            ruleKey: appendRuleKey(options.ruleKey, fieldIdentifier),
          },
        );
      });
      return result;
    }
    case 'string':
    default: {
      if (rule?.mode === 'fixed') {
        return rule.fixedValue == null ? '' : String(rule.fixedValue);
      }
      const generator = rule?.stringGenerator || (identifier === 'ip' ? 'ip' : 'random');
      if (generator === 'ip') {
        return randomIpAddress();
      }
      const length = normalizeInteger(rule?.stringLength, normalizeInteger(dataType?.length, 12));
      return randomString(length);
    }
  }
}

export function buildRandomPropertyPayload(
  item: ThingModelItem,
  rules?: ThingModelSimulationRuleMap,
): Record<string, unknown> {
  const identifier = typeof item.identifier === 'string' ? item.identifier.trim() : '';
  if (!identifier) {
    return {};
  }
  return {
    [identifier]: buildRandomValue(
      identifier,
      isRecord(item.dataType) ? item.dataType : undefined,
      { rules, ruleKey: buildPropertyRuleKey(identifier) },
    ),
  };
}

export function buildRandomPropertyBatchPayload(
  items: ThingModelItem[],
  rules?: ThingModelSimulationRuleMap,
): Record<string, unknown> {
  return items.reduce<Record<string, unknown>>((result, item) => {
    Object.assign(result, buildRandomPropertyPayload(item, rules));
    return result;
  }, {});
}

export function buildRandomEventPayload(
  item: ThingModelItem,
  rules?: ThingModelSimulationRuleMap,
): Record<string, unknown> {
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
    payload[fieldIdentifier] = buildRandomValue(
      fieldIdentifier,
      isRecord(field.dataType) ? field.dataType : undefined,
      { rules, ruleKey: buildEventFieldRuleKey(identifier, fieldIdentifier) },
    );
  });
  return payload;
}
