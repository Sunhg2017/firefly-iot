export type AlarmNotificationMethod = 'EMAIL' | 'SMS' | 'PHONE' | 'WECHAT' | 'DINGTALK' | 'WEBHOOK' | 'IN_APP';

export interface AlarmNotifyConfigFormValues {
  notifyChannels?: AlarmNotificationMethod[];
  recipientGroupCodes?: string[];
  recipientUsernames?: string[];
}

interface StructuredAlarmNotifyConfig {
  version: 1;
  channels: AlarmNotificationMethod[];
  recipientGroupCodes: string[];
  recipientUsernames: string[];
}

const METHOD_LABELS: Record<AlarmNotificationMethod, string> = {
  EMAIL: '邮件',
  SMS: '短信',
  PHONE: '电话',
  WECHAT: '企业微信',
  DINGTALK: '钉钉',
  WEBHOOK: 'Webhook',
  IN_APP: '站内信',
};

const METHOD_ORDER: AlarmNotificationMethod[] = ['IN_APP', 'EMAIL', 'SMS', 'PHONE', 'WECHAT', 'DINGTALK', 'WEBHOOK'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item.length > 0),
    ),
  );
};

const normalizeMethods = (value: unknown): AlarmNotificationMethod[] => {
  const values = normalizeStringArray(value) as AlarmNotificationMethod[];
  return METHOD_ORDER.filter((item) => values.includes(item));
};

export const getAlarmNotificationMethodLabel = (method?: string): string => {
  if (!method) {
    return '未知方式';
  }
  return METHOD_LABELS[method as AlarmNotificationMethod] || method;
};

export const parseAlarmNotifyConfig = (rawConfig?: string | null): AlarmNotifyConfigFormValues => {
  const trimmed = typeof rawConfig === 'string' ? rawConfig.trim() : '';
  if (!trimmed) {
    return {
      notifyChannels: [],
      recipientGroupCodes: [],
      recipientUsernames: [],
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      return {
        notifyChannels: [],
        recipientGroupCodes: [],
        recipientUsernames: [],
      };
    }
    return {
      notifyChannels: normalizeMethods(parsed.channels),
      recipientGroupCodes: normalizeStringArray(parsed.recipientGroupCodes),
      recipientUsernames: normalizeStringArray(parsed.recipientUsernames),
    };
  } catch {
    return {
      notifyChannels: [],
      recipientGroupCodes: [],
      recipientUsernames: [],
    };
  }
};

export const buildAlarmNotifyConfig = (values: AlarmNotifyConfigFormValues): string => {
  const channels = normalizeMethods(values.notifyChannels);
  const recipientGroupCodes = normalizeStringArray(values.recipientGroupCodes);
  const recipientUsernames = normalizeStringArray(values.recipientUsernames);

  if (channels.length === 0 && recipientGroupCodes.length === 0 && recipientUsernames.length === 0) {
    return '';
  }

  if (channels.length === 0) {
    throw new Error('请至少选择一种通知方式');
  }
  if (recipientGroupCodes.length === 0 && recipientUsernames.length === 0) {
    throw new Error('请至少选择一个告警接收组或指定接收人');
  }

  const payload: StructuredAlarmNotifyConfig = {
    version: 1,
    channels,
    recipientGroupCodes,
    recipientUsernames,
  };
  return JSON.stringify(payload);
};

export const describeAlarmNotifyConfig = (
  rawConfig: AlarmNotifyConfigFormValues | string | null | undefined,
  groupLabelMap?: Record<string, string>,
  userLabelMap?: Record<string, string>,
): string => {
  const parsed =
    typeof rawConfig === 'string' || rawConfig == null
      ? parseAlarmNotifyConfig(rawConfig)
      : {
          notifyChannels: normalizeMethods(rawConfig.notifyChannels),
          recipientGroupCodes: normalizeStringArray(rawConfig.recipientGroupCodes),
          recipientUsernames: normalizeStringArray(rawConfig.recipientUsernames),
        };

  if ((parsed.notifyChannels?.length || 0) === 0) {
    return '未配置通知推送';
  }

  const methods = (parsed.notifyChannels || []).map((item) => getAlarmNotificationMethodLabel(item)).join('、');
  const groups = (parsed.recipientGroupCodes || []).map((item) => groupLabelMap?.[item] || item);
  const users = (parsed.recipientUsernames || []).map((item) => userLabelMap?.[item] || item);
  const receivers = [...groups, ...users];

  return receivers.length > 0 ? `${methods} -> ${receivers.join('、')}` : methods;
};
