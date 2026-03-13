export type AlarmConditionType = 'THRESHOLD' | 'COMPARE' | 'CONTINUOUS' | 'ACCUMULATE' | 'CUSTOM';
export type AlarmAggregateType = 'LATEST' | 'AVG' | 'MAX' | 'MIN' | 'SUM' | 'COUNT';
export type AlarmOperator = 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ' | 'NEQ';
export type AlarmWindowUnit = 'MINUTES' | 'HOURS' | 'DAYS';
export type AlarmCompareTarget = 'SAME_PERIOD' | 'PREVIOUS_PERIOD';
export type AlarmChangeMode = 'PERCENT' | 'ABSOLUTE';
export type AlarmChangeDirection = 'UP' | 'DOWN' | 'EITHER';

export interface AlarmConditionFormValues {
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

interface StructuredAlarmCondition {
  mode: 'STRUCTURED';
  version: 1;
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

export interface AlarmConditionOption {
  value: string;
  label: string;
}

interface ParsedStructuredAlarmCondition extends StructuredAlarmCondition {
  mode: 'STRUCTURED';
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

export const DEFAULT_ALARM_CONDITION_VALUES: Required<AlarmConditionFormValues> = {
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

const getMetricLabel = (metricKey: string | undefined, metricLabelMap?: Record<string, string>): string => {
  if (!metricKey) {
    return '未选指标';
  }
  return metricLabelMap?.[metricKey] || metricKey;
};

export const getAlarmConditionTypeLabel = (type?: AlarmConditionType): string =>
  (type && CONDITION_TYPE_LABELS[type]) || CONDITION_TYPE_LABELS.CUSTOM;

export const getAlarmConditionTypeColor = (type?: AlarmConditionType): string =>
  (type && CONDITION_TYPE_COLORS[type]) || CONDITION_TYPE_COLORS.CUSTOM;

const parseStructuredCondition = (conditionExpr?: string | null): ParsedStructuredAlarmCondition | null => {
  const raw = typeof conditionExpr === 'string' ? conditionExpr.trim() : '';
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.mode !== 'STRUCTURED') {
      return null;
    }

    const type = asString(parsed.type) as AlarmConditionType | undefined;
    if (!type || !(type in CONDITION_TYPE_LABELS)) {
      return null;
    }

    return parsed as unknown as ParsedStructuredAlarmCondition;
  } catch {
    return null;
  }
};

export const parseAlarmConditionExpr = (conditionExpr?: string | null): AlarmConditionFormValues => {
  const parsed = parseStructuredCondition(conditionExpr);
  if (!parsed) {
    return { ...DEFAULT_ALARM_CONDITION_VALUES };
  }

  return {
    ...DEFAULT_ALARM_CONDITION_VALUES,
    conditionType: parsed.type,
    metricKey: asString(parsed.metricKey) || '',
    aggregateType:
      (asString(parsed.aggregateType) as AlarmAggregateType | undefined) || DEFAULT_ALARM_CONDITION_VALUES.aggregateType,
    operator: (asString(parsed.operator) as AlarmOperator | undefined) || DEFAULT_ALARM_CONDITION_VALUES.operator,
    threshold: asNumber(parsed.threshold) ?? DEFAULT_ALARM_CONDITION_VALUES.threshold,
    windowSize: asNumber(parsed.windowSize) ?? DEFAULT_ALARM_CONDITION_VALUES.windowSize,
    windowUnit:
      (asString(parsed.windowUnit) as AlarmWindowUnit | undefined) || DEFAULT_ALARM_CONDITION_VALUES.windowUnit,
    compareTarget:
      (asString(parsed.compareTarget) as AlarmCompareTarget | undefined) || DEFAULT_ALARM_CONDITION_VALUES.compareTarget,
    changeMode:
      (asString(parsed.changeMode) as AlarmChangeMode | undefined) || DEFAULT_ALARM_CONDITION_VALUES.changeMode,
    changeDirection:
      (asString(parsed.changeDirection) as AlarmChangeDirection | undefined) ||
      DEFAULT_ALARM_CONDITION_VALUES.changeDirection,
    consecutiveCount: asNumber(parsed.consecutiveCount) ?? DEFAULT_ALARM_CONDITION_VALUES.consecutiveCount,
    customExpr: asString(parsed.customExpr) || '',
  };
};

export const buildAlarmConditionExpr = (values: AlarmConditionFormValues): string => {
  const next = { ...DEFAULT_ALARM_CONDITION_VALUES, ...values };
  const type = next.conditionType;
  if (!type) {
    throw new Error('请选择触发条件类型');
  }

  const payload: StructuredAlarmCondition = {
    mode: 'STRUCTURED',
    version: 1,
    type,
  };

  if (type === 'CUSTOM') {
    const customExpr = next.customExpr.trim();
    if (!customExpr) {
      throw new Error('请输入自定义表达式');
    }
    payload.customExpr = customExpr;
    return JSON.stringify(payload);
  }

  const metricKey = next.metricKey.trim();
  if (!metricKey) {
    throw new Error('请选择或输入指标标识');
  }

  const threshold = next.threshold;
  if (threshold === undefined || threshold === null || !Number.isFinite(threshold)) {
    throw new Error('请填写合法的触发阈值');
  }

  payload.metricKey = metricKey;

  if (type === 'THRESHOLD') {
    payload.aggregateType = next.aggregateType;
    payload.operator = next.operator;
    payload.threshold = threshold;
    return JSON.stringify(payload);
  }

  if (type === 'CONTINUOUS') {
    if (!next.consecutiveCount || next.consecutiveCount <= 0) {
      throw new Error('请填写连续次数');
    }
    payload.operator = next.operator;
    payload.threshold = threshold;
    payload.consecutiveCount = next.consecutiveCount;
    return JSON.stringify(payload);
  }

  if (!next.windowSize || next.windowSize <= 0) {
    throw new Error('请填写统计窗口');
  }

  payload.aggregateType = next.aggregateType;
  payload.operator = next.operator;
  payload.threshold = threshold;
  payload.windowSize = next.windowSize;
  payload.windowUnit = next.windowUnit;

  if (type === 'ACCUMULATE') {
    return JSON.stringify(payload);
  }

  payload.compareTarget = next.compareTarget;
  payload.changeMode = next.changeMode;
  payload.changeDirection = next.changeDirection;
  return JSON.stringify(payload);
};

export const describeAlarmConditionValues = (
  values: AlarmConditionFormValues,
  metricLabelMap?: Record<string, string>,
): string => {
  const next = { ...DEFAULT_ALARM_CONDITION_VALUES, ...values };
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

export const describeAlarmConditionExpr = (
  conditionExpr?: string | null,
  metricLabelMap?: Record<string, string>,
): string => {
  const parsed = parseStructuredCondition(conditionExpr);
  if (!parsed) {
    return '无效规则配置';
  }
  return describeAlarmConditionValues(parseAlarmConditionExpr(conditionExpr), metricLabelMap);
};

export const getAlarmConditionTypeFromExpr = (conditionExpr?: string | null): AlarmConditionType =>
  parseStructuredCondition(conditionExpr)?.type || 'CUSTOM';
