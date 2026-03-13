export type AlarmRuleLevel = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlarmConditionType = 'THRESHOLD' | 'COMPARE' | 'CONTINUOUS' | 'ACCUMULATE' | 'CUSTOM';
export type AlarmAggregateType = 'LATEST' | 'AVG' | 'MAX' | 'MIN' | 'SUM' | 'COUNT';
export type AlarmOperator = 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'NEQ';
export type AlarmWindowUnit = 'MINUTES' | 'HOURS' | 'DAYS';
export type AlarmCompareTarget = 'SAME_PERIOD' | 'PREVIOUS_PERIOD';
export type AlarmChangeMode = 'PERCENT' | 'ABSOLUTE';
export type AlarmChangeDirection = 'UP' | 'DOWN' | 'EITHER';

export interface AlarmConditionItemFormValues {
  level?: AlarmRuleLevel;
  conditionType?: AlarmConditionType;
  metricKey?: string;
  aggregateType?: AlarmAggregateType;
  operator?: AlarmOperator;
  threshold?: number;
  windowSize?: number;
  windowUnit?: AlarmWindowUnit;
  compareTarget?: AlarmCompareTarget;
  changeMode?: AlarmChangeMode;
  changeDirection?: AlarmChangeDirection;
  consecutiveCount?: number;
  customExpr?: string;
}

export interface AlarmConditionFormValues {
  ruleConditions?: AlarmConditionItemFormValues[];
}

interface StructuredAlarmConditionItem {
  level: AlarmRuleLevel;
  type: AlarmConditionType;
  metricKey?: string;
  aggregateType?: AlarmAggregateType;
  operator?: AlarmOperator;
  threshold?: number;
  windowSize?: number;
  windowUnit?: AlarmWindowUnit;
  compareTarget?: AlarmCompareTarget;
  changeMode?: AlarmChangeMode;
  changeDirection?: AlarmChangeDirection;
  consecutiveCount?: number;
  customExpr?: string;
}

interface StructuredAlarmConditionGroup {
  mode: 'STRUCTURED';
  version: 2;
  conditions: StructuredAlarmConditionItem[];
}

export interface AlarmConditionOption {
  value: string;
  label: string;
}

const CONDITION_TYPE_LABELS: Record<AlarmConditionType, string> = {
  THRESHOLD: '阈值触发',
  COMPARE: '同比/环比',
  CONTINUOUS: '连续触发',
  ACCUMULATE: '累计聚合',
  CUSTOM: '自定义表达式',
};

const AGGREGATE_LABELS: Record<AlarmAggregateType, string> = {
  LATEST: '最新值',
  AVG: '平均值',
  MAX: '最大值',
  MIN: '最小值',
  SUM: '累计值',
  COUNT: '计数',
};

const OPERATOR_LABELS: Record<AlarmOperator, string> = {
  GT: '>',
  GTE: '>=',
  LT: '<',
  LTE: '<=',
  EQ: '=',
  NEQ: '!=',
};

const WINDOW_UNIT_LABELS: Record<AlarmWindowUnit, string> = {
  MINUTES: '分钟',
  HOURS: '小时',
  DAYS: '天',
};

const COMPARE_TARGET_LABELS: Record<AlarmCompareTarget, string> = {
  SAME_PERIOD: '同比',
  PREVIOUS_PERIOD: '环比',
};

const CHANGE_MODE_LABELS: Record<AlarmChangeMode, string> = {
  PERCENT: '变化比例',
  ABSOLUTE: '变化值',
};

const CHANGE_DIRECTION_LABELS: Record<AlarmChangeDirection, string> = {
  UP: '上涨',
  DOWN: '下降',
  EITHER: '双向',
};

const CONDITION_TYPE_COLORS: Record<AlarmConditionType, string> = {
  THRESHOLD: 'blue',
  COMPARE: 'purple',
  CONTINUOUS: 'orange',
  ACCUMULATE: 'cyan',
  CUSTOM: 'default',
};

const LEVEL_ORDER: AlarmRuleLevel[] = ['CRITICAL', 'WARNING', 'INFO'];

export const CONDITION_TYPE_OPTIONS: AlarmConditionOption[] = (
  Object.entries(CONDITION_TYPE_LABELS) as Array<[AlarmConditionType, string]>
).map(([value, label]) => ({ value, label }));

export const AGGREGATE_OPTIONS: AlarmConditionOption[] = (
  Object.entries(AGGREGATE_LABELS) as Array<[AlarmAggregateType, string]>
).map(([value, label]) => ({ value, label }));

export const OPERATOR_OPTIONS: AlarmConditionOption[] = (
  Object.entries(OPERATOR_LABELS) as Array<[AlarmOperator, string]>
).map(([value, label]) => ({ value, label }));

export const WINDOW_UNIT_OPTIONS: AlarmConditionOption[] = (
  Object.entries(WINDOW_UNIT_LABELS) as Array<[AlarmWindowUnit, string]>
).map(([value, label]) => ({ value, label }));

export const COMPARE_TARGET_OPTIONS: AlarmConditionOption[] = (
  Object.entries(COMPARE_TARGET_LABELS) as Array<[AlarmCompareTarget, string]>
).map(([value, label]) => ({ value, label }));

export const CHANGE_MODE_OPTIONS: AlarmConditionOption[] = (
  Object.entries(CHANGE_MODE_LABELS) as Array<[AlarmChangeMode, string]>
).map(([value, label]) => ({ value, label }));

export const CHANGE_DIRECTION_OPTIONS: AlarmConditionOption[] = (
  Object.entries(CHANGE_DIRECTION_LABELS) as Array<[AlarmChangeDirection, string]>
).map(([value, label]) => ({ value, label }));

export const LEVEL_OPTIONS: AlarmConditionOption[] = [
  { value: 'CRITICAL', label: '紧急' },
  { value: 'WARNING', label: '告警' },
  { value: 'INFO', label: '通知' },
];

export const DEFAULT_ALARM_CONDITION_ITEM: Required<AlarmConditionItemFormValues> = {
  level: 'WARNING',
  conditionType: 'THRESHOLD',
  metricKey: '',
  aggregateType: 'LATEST',
  operator: 'GT',
  threshold: 0,
  windowSize: 1,
  windowUnit: 'HOURS',
  compareTarget: 'PREVIOUS_PERIOD',
  changeMode: 'PERCENT',
  changeDirection: 'UP',
  consecutiveCount: 3,
  customExpr: '',
};

export const DEFAULT_ALARM_CONDITION_VALUES: Required<AlarmConditionFormValues> = {
  ruleConditions: [{ ...DEFAULT_ALARM_CONDITION_ITEM }],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
};

const asLevel = (value: unknown): AlarmRuleLevel | undefined => {
  const next = asString(value) as AlarmRuleLevel | undefined;
  return next && LEVEL_ORDER.includes(next) ? next : undefined;
};

const getMetricLabel = (metricKey: string | undefined, metricLabelMap?: Record<string, string>): string => {
  if (!metricKey) {
    return '未选指标';
  }
  return metricLabelMap?.[metricKey] || metricKey;
};

const normalizeConditionItem = (item: AlarmConditionItemFormValues): Required<AlarmConditionItemFormValues> => ({
  ...DEFAULT_ALARM_CONDITION_ITEM,
  ...item,
});

const parseStructuredConditionGroup = (conditionExpr?: string | null): StructuredAlarmConditionGroup | null => {
  const raw = typeof conditionExpr === 'string' ? conditionExpr.trim() : '';
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.mode !== 'STRUCTURED' || !Array.isArray(parsed.conditions)) {
      return null;
    }

    return parsed as unknown as StructuredAlarmConditionGroup;
  } catch {
    return null;
  }
};

export const getAlarmConditionTypeLabel = (type?: AlarmConditionType): string =>
  (type && CONDITION_TYPE_LABELS[type]) || CONDITION_TYPE_LABELS.CUSTOM;

export const getAlarmConditionTypeColor = (type?: AlarmConditionType): string =>
  (type && CONDITION_TYPE_COLORS[type]) || CONDITION_TYPE_COLORS.CUSTOM;

export const parseAlarmConditionExpr = (conditionExpr?: string | null): AlarmConditionFormValues => {
  const group = parseStructuredConditionGroup(conditionExpr);
  if (!group || group.conditions.length === 0) {
    return { ...DEFAULT_ALARM_CONDITION_VALUES };
  }

  return {
    ruleConditions: group.conditions.map((condition) => ({
      ...DEFAULT_ALARM_CONDITION_ITEM,
      level: asLevel(condition.level) || DEFAULT_ALARM_CONDITION_ITEM.level,
      conditionType: (asString(condition.type) as AlarmConditionType | undefined) || DEFAULT_ALARM_CONDITION_ITEM.conditionType,
      metricKey: asString(condition.metricKey) || '',
      aggregateType:
        (asString(condition.aggregateType) as AlarmAggregateType | undefined) || DEFAULT_ALARM_CONDITION_ITEM.aggregateType,
      operator: (asString(condition.operator) as AlarmOperator | undefined) || DEFAULT_ALARM_CONDITION_ITEM.operator,
      threshold: asNumber(condition.threshold) ?? DEFAULT_ALARM_CONDITION_ITEM.threshold,
      windowSize: asNumber(condition.windowSize) ?? DEFAULT_ALARM_CONDITION_ITEM.windowSize,
      windowUnit:
        (asString(condition.windowUnit) as AlarmWindowUnit | undefined) || DEFAULT_ALARM_CONDITION_ITEM.windowUnit,
      compareTarget:
        (asString(condition.compareTarget) as AlarmCompareTarget | undefined) || DEFAULT_ALARM_CONDITION_ITEM.compareTarget,
      changeMode:
        (asString(condition.changeMode) as AlarmChangeMode | undefined) || DEFAULT_ALARM_CONDITION_ITEM.changeMode,
      changeDirection:
        (asString(condition.changeDirection) as AlarmChangeDirection | undefined) || DEFAULT_ALARM_CONDITION_ITEM.changeDirection,
      consecutiveCount: asNumber(condition.consecutiveCount) ?? DEFAULT_ALARM_CONDITION_ITEM.consecutiveCount,
      customExpr: asString(condition.customExpr) || '',
    })),
  };
};

const buildStructuredConditionItem = (
  item: AlarmConditionItemFormValues,
  index: number,
): StructuredAlarmConditionItem => {
  const next = normalizeConditionItem(item);
  const type = next.conditionType;
  const level = next.level;

  if (!level) {
    throw new Error(`请为第 ${index + 1} 条条件选择告警级别`);
  }

  if (!type) {
    throw new Error(`请为第 ${index + 1} 条条件选择触发方式`);
  }

  if (type === 'CUSTOM') {
    const customExpr = next.customExpr.trim();
    if (!customExpr) {
      throw new Error(`请填写第 ${index + 1} 条条件的自定义表达式`);
    }
    return {
      level,
      type,
      customExpr,
    };
  }

  const metricKey = next.metricKey.trim();
  if (!metricKey) {
    throw new Error(`请为第 ${index + 1} 条条件选择指标标识`);
  }

  const threshold = next.threshold;
  if (threshold === undefined || threshold === null || !Number.isFinite(threshold)) {
    throw new Error(`请填写第 ${index + 1} 条条件的触发阈值`);
  }

  const payload: StructuredAlarmConditionItem = {
    level,
    type,
    metricKey,
  };

  if (type === 'THRESHOLD') {
    payload.aggregateType = next.aggregateType;
    payload.operator = next.operator;
    payload.threshold = threshold;
    return payload;
  }

  if (type === 'CONTINUOUS') {
    if (!next.consecutiveCount || next.consecutiveCount <= 0) {
      throw new Error(`请填写第 ${index + 1} 条条件的连续次数`);
    }
    payload.operator = next.operator;
    payload.threshold = threshold;
    payload.consecutiveCount = next.consecutiveCount;
    return payload;
  }

  if (!next.windowSize || next.windowSize <= 0) {
    throw new Error(`请填写第 ${index + 1} 条条件的统计窗口`);
  }

  payload.aggregateType = next.aggregateType;
  payload.operator = next.operator;
  payload.threshold = threshold;
  payload.windowSize = next.windowSize;
  payload.windowUnit = next.windowUnit;

  if (type === 'ACCUMULATE') {
    return payload;
  }

  payload.compareTarget = next.compareTarget;
  payload.changeMode = next.changeMode;
  payload.changeDirection = next.changeDirection;
  return payload;
};

export const buildAlarmConditionExpr = (values: AlarmConditionFormValues): string => {
  const ruleConditions = values.ruleConditions || [];
  if (ruleConditions.length === 0) {
    throw new Error('请至少维护一条告警条件');
  }

  const conditions = ruleConditions.map((item, index) => buildStructuredConditionItem(item, index));
  const payload: StructuredAlarmConditionGroup = {
    mode: 'STRUCTURED',
    version: 2,
    conditions,
  };
  return JSON.stringify(payload);
};

export const describeAlarmConditionItem = (
  item: AlarmConditionItemFormValues,
  metricLabelMap?: Record<string, string>,
): string => {
  const next = normalizeConditionItem(item);
  const metric = getMetricLabel(next.metricKey, metricLabelMap);

  switch (next.conditionType) {
    case 'THRESHOLD':
      return `${AGGREGATE_LABELS[next.aggregateType]} ${metric} ${OPERATOR_LABELS[next.operator]} ${next.threshold}`;
    case 'COMPARE':
      return `${metric}${COMPARE_TARGET_LABELS[next.compareTarget]}${CHANGE_DIRECTION_LABELS[next.changeDirection]}${next.threshold}${CHANGE_MODE_LABELS[next.changeMode]}，统计口径 ${AGGREGATE_LABELS[next.aggregateType]}，窗口 ${next.windowSize}${WINDOW_UNIT_LABELS[next.windowUnit]}`;
    case 'CONTINUOUS':
      return `${metric}连续${next.consecutiveCount}次 ${OPERATOR_LABELS[next.operator]} ${next.threshold}`;
    case 'ACCUMULATE':
      return `${next.windowSize}${WINDOW_UNIT_LABELS[next.windowUnit]}${AGGREGATE_LABELS[next.aggregateType]} ${metric} ${OPERATOR_LABELS[next.operator]} ${next.threshold}`;
    case 'CUSTOM':
      return next.customExpr?.trim() || '自定义表达式';
    default:
      return '自定义表达式';
  }
};

export const describeAlarmConditionValues = (
  values: AlarmConditionFormValues,
  metricLabelMap?: Record<string, string>,
): string => {
  const conditions = values.ruleConditions || [];
  if (conditions.length === 0) {
    return '请至少维护一条告警条件';
  }

  return conditions
    .map((item) => `${LEVEL_OPTIONS.find((option) => option.value === normalizeConditionItem(item).level)?.label || '告警'}: ${describeAlarmConditionItem(item, metricLabelMap)}`)
    .join('；');
};

export const describeAlarmConditionExpr = (
  conditionExpr?: string | null,
  metricLabelMap?: Record<string, string>,
): string => {
  const group = parseStructuredConditionGroup(conditionExpr);
  if (!group || group.conditions.length === 0) {
    return '无效规则配置';
  }

  return describeAlarmConditionValues(parseAlarmConditionExpr(conditionExpr), metricLabelMap);
};

export const getAlarmConditionTypeFromExpr = (conditionExpr?: string | null): AlarmConditionType =>
  getAlarmConditionTypes(conditionExpr)[0] || 'CUSTOM';

export const getAlarmConditionTypes = (conditionExpr?: string | null): AlarmConditionType[] => {
  const group = parseStructuredConditionGroup(conditionExpr);
  if (!group) {
    return [];
  }

  return Array.from(new Set(group.conditions.map((item) => item.type).filter(Boolean))) as AlarmConditionType[];
};

export const getAlarmConditionLevels = (conditionExpr?: string | null): AlarmRuleLevel[] => {
  const group = parseStructuredConditionGroup(conditionExpr);
  if (!group) {
    return [];
  }

  const uniqueLevels = Array.from(new Set(group.conditions.map((item) => asLevel(item.level)).filter(Boolean))) as AlarmRuleLevel[];
  return LEVEL_ORDER.filter((level) => uniqueLevels.includes(level));
};

export const deriveAlarmRuleLevel = (values: AlarmConditionFormValues): AlarmRuleLevel => {
  const ruleConditions = values.ruleConditions || [];
  const levels = ruleConditions
    .map((item) => normalizeConditionItem(item).level)
    .filter((level): level is AlarmRuleLevel => Boolean(level));

  return LEVEL_ORDER.find((level) => levels.includes(level)) || 'WARNING';
};
