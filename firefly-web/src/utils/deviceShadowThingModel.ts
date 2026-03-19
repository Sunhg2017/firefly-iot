type ThingModelParameter = Record<string, unknown> & {
  identifier?: string;
  dataType?: Record<string, unknown>;
};

type ThingModelPropertyItem = Record<string, unknown> & {
  identifier?: string;
  accessMode?: string;
  readonly?: boolean;
  system?: boolean;
  dataType?: Record<string, unknown>;
};

type ThingModelRoot = Record<string, unknown> & {
  properties?: unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeThingModelDataType = (value: unknown): Record<string, unknown> | undefined => {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    return { type: value.trim() };
  }
  return undefined;
};

const resolveDataTypeOption = (dataType: Record<string, unknown> | undefined, key: string) => {
  if (!dataType) {
    return undefined;
  }
  if (dataType[key] !== undefined) {
    return dataType[key];
  }
  if (isRecord(dataType.specs) && dataType.specs[key] !== undefined) {
    return dataType.specs[key];
  }
  return undefined;
};

const normalizeInteger = (value: unknown, fallback: number) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
};

const normalizeNumber = (value: unknown, fallback: number) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeEnumValue = (value: unknown): string | number | boolean => {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) && `${numericValue}` === trimmed ? numericValue : trimmed;
};

const resolveEnumCandidates = (dataType?: Record<string, unknown>): Array<string | number | boolean> => {
  if (!dataType) {
    return [];
  }
  const values = resolveDataTypeOption(dataType, 'values');
  if (Array.isArray(values)) {
    return values.map(normalizeEnumValue).filter((value) => value !== '');
  }
  if (isRecord(values)) {
    return Object.keys(values).map(normalizeEnumValue).filter((value) => value !== '');
  }
  return [];
};

const coerceParameter = (value: unknown): ThingModelParameter => {
  if (isRecord(value)) {
    return value as ThingModelParameter;
  }
  if (typeof value === 'string' && value.trim()) {
    return { identifier: value.trim() };
  }
  return {};
};

const resolveStructFields = (dataType?: Record<string, unknown>): ThingModelParameter[] => {
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
};

const resolveThingModelValueType = (dataType?: Record<string, unknown>) => {
  const typeValue = resolveDataTypeOption(dataType, 'type');
  const type = typeof typeValue === 'string' ? typeValue.toLowerCase() : 'string';
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
};

const buildDefaultValue = (
  identifier: string,
  dataType?: Record<string, unknown>,
): string | number | boolean | Record<string, unknown> | Array<unknown> => {
  const valueType = resolveThingModelValueType(dataType);
  switch (valueType) {
    case 'int':
      return normalizeInteger(resolveDataTypeOption(dataType, 'min'), 0);
    case 'float':
    case 'double':
      return Number(
        normalizeNumber(resolveDataTypeOption(dataType, 'min'), 0).toFixed(
          Math.max(0, normalizeInteger(resolveDataTypeOption(dataType, 'precision'), 2)),
        ),
      );
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
        result[fieldIdentifier] = buildDefaultValue(
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
};

const parseThingModel = (rawThingModel: unknown): ThingModelRoot | null => {
  if (typeof rawThingModel === 'string') {
    if (!rawThingModel.trim()) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawThingModel);
      return isRecord(parsed) ? (parsed as ThingModelRoot) : null;
    } catch {
      return null;
    }
  }
  return isRecord(rawThingModel) ? (rawThingModel as ThingModelRoot) : null;
};

const shouldIncludeProperty = (item: ThingModelPropertyItem) => {
  if (item.system === true) {
    return false;
  }
  if (item.readonly === true) {
    return false;
  }
  return typeof item.identifier === 'string' && item.identifier.trim().length > 0;
};

const mergeDesiredRecord = (
  desiredTemplate: Record<string, unknown>,
  currentDesired?: Record<string, unknown> | null,
): Record<string, unknown> => {
  const merged = { ...desiredTemplate };
  Object.entries(currentDesired || {}).forEach(([key, value]) => {
    const templateValue = merged[key];
    if (isRecord(templateValue) && isRecord(value)) {
      merged[key] = mergeDesiredRecord(templateValue, value);
      return;
    }
    merged[key] = value;
  });
  return merged;
};

export const buildDesiredTemplateFromThingModel = (
  rawThingModel: unknown,
  currentDesired?: Record<string, unknown> | null,
) => {
  const thingModel = parseThingModel(rawThingModel);
  const desiredTemplate = ((thingModel?.properties || []) as unknown[])
    .map((item) => (isRecord(item) ? (item as ThingModelPropertyItem) : null))
    .filter((item): item is ThingModelPropertyItem => Boolean(item))
    .filter(shouldIncludeProperty)
    .reduce<Record<string, unknown>>((result, item) => {
      const identifier = item.identifier!.trim();
      result[identifier] = buildDefaultValue(identifier, normalizeThingModelDataType(item.dataType));
      return result;
    }, {});

  return {
    desired: mergeDesiredRecord(desiredTemplate, currentDesired),
    templateCount: Object.keys(desiredTemplate).length,
  };
};
