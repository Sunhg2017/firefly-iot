export type GroupType = 'STATIC' | 'DYNAMIC';
export type MatchMode = 'ALL' | 'ANY';
export type ConditionField = 'productKey' | 'deviceName' | 'nickname' | 'status' | 'onlineStatus' | 'tag';

export interface ProductOptionRecord { id: number; name: string; productKey: string; }
export interface TagOptionRecord { id: number; tagKey: string; tagValue: string; }
export interface DynamicConditionFormValue { field?: ConditionField; operator?: string; value?: string; values?: string[]; tagSelector?: string; }
export interface GroupFormValues { name?: string; description?: string; type?: GroupType; parentId?: number | null; matchMode?: MatchMode; conditions?: DynamicConditionFormValue[]; }
export interface DynamicRulePayload { matchMode: MatchMode; conditions: Array<Record<string, unknown>>; }

export const STATUS_OPTIONS = [{ value: 'INACTIVE', label: '未激活' }, { value: 'ACTIVE', label: '已激活' }, { value: 'DISABLED', label: '已禁用' }];
export const ONLINE_STATUS_OPTIONS = [{ value: 'ONLINE', label: '在线' }, { value: 'OFFLINE', label: '离线' }, { value: 'UNKNOWN', label: '未知' }];
export const TEXT_OPERATOR_OPTIONS = [{ value: 'EQ', label: '等于' }, { value: 'CONTAINS', label: '包含' }, { value: 'PREFIX', label: '前缀匹配' }];
export const FIELD_OPTIONS = [{ value: 'productKey', label: '产品' }, { value: 'deviceName', label: '设备名称' }, { value: 'nickname', label: '设备别名' }, { value: 'status', label: '设备状态' }, { value: 'onlineStatus', label: '在线状态' }, { value: 'tag', label: '设备标签' }];
export const DRAWER_STEPS = [{ key: 'basic', title: '基础信息' }, { key: 'rule', title: '匹配规则' }, { key: 'preview', title: '预览确认' }];

export const createEmptyCondition = (): DynamicConditionFormValue => ({ field: 'productKey', operator: 'IN', values: [] });

export const getGroupTypeMeta = (type?: GroupType) => type === 'DYNAMIC' ? { color: 'green', label: '动态分组' } : { color: 'blue', label: '静态分组' };

export const normalizeTagSelector = (tag?: TagOptionRecord) => tag ? JSON.stringify({ tagKey: tag.tagKey, tagValue: tag.tagValue }) : '';

export const parseTagSelector = (tagSelector?: string) => {
  if (!tagSelector) return undefined;
  try { return JSON.parse(tagSelector) as { tagKey: string; tagValue?: string }; } catch { return undefined; }
};

export const parseDynamicRule = (dynamicRule?: string | null) => {
  if (!dynamicRule) return undefined;
  try { return JSON.parse(dynamicRule) as DynamicRulePayload; } catch { return undefined; }
};

export const buildDynamicRulePayload = (values: GroupFormValues): DynamicRulePayload => ({
  matchMode: values.matchMode || 'ALL',
  conditions: (values.conditions || []).map((condition) => {
    if (!condition.field) return null;
    if (condition.field === 'productKey') return { field: 'productKey', operator: 'IN', values: condition.values || [] };
    if (condition.field === 'deviceName' || condition.field === 'nickname') return { field: condition.field, operator: condition.operator || 'CONTAINS', value: condition.value?.trim() };
    if (condition.field === 'status' || condition.field === 'onlineStatus') return { field: condition.field, operator: 'EQ', value: condition.value };
    const tag = parseTagSelector(condition.tagSelector);
    return { field: 'tag', operator: 'HAS_TAG', tagKey: tag?.tagKey, tagValue: tag?.tagValue };
  }).filter(Boolean) as Array<Record<string, unknown>>,
});

export const describeCondition = (
  condition: DynamicConditionFormValue,
  productOptionMap: Map<string, ProductOptionRecord>,
  tagOptionMap: Map<string, TagOptionRecord>,
) => {
  if (condition.field === 'productKey') {
    const labels = (condition.values || []).map((productKey) => productOptionMap.get(productKey)?.name || productKey).join('、');
    return `产品属于 ${labels || '未选择'}`;
  }
  if (condition.field === 'deviceName' || condition.field === 'nickname') {
    const fieldLabel = condition.field === 'deviceName' ? '设备名称' : '设备别名';
    const operatorLabel = TEXT_OPERATOR_OPTIONS.find((item) => item.value === condition.operator)?.label || '包含';
    return `${fieldLabel}${operatorLabel}“${condition.value || ''}”`;
  }
  if (condition.field === 'status') return `设备状态等于 ${STATUS_OPTIONS.find((item) => item.value === condition.value)?.label || condition.value || ''}`;
  if (condition.field === 'onlineStatus') return `在线状态等于 ${ONLINE_STATUS_OPTIONS.find((item) => item.value === condition.value)?.label || condition.value || ''}`;
  const tag = tagOptionMap.get(condition.tagSelector || '');
  return `包含标签 ${tag ? `${tag.tagKey}: ${tag.tagValue}` : '未选择'}`;
};
