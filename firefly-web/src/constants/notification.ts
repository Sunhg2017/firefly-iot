export const notificationChannelOptions = [
  { value: 'EMAIL', label: '邮件' },
  { value: 'SMS', label: '短信' },
  { value: 'PHONE', label: '电话' },
  { value: 'WECHAT', label: '企业微信' },
  { value: 'DINGTALK', label: '钉钉' },
  { value: 'WEBHOOK', label: 'Webhook' },
  { value: 'IN_APP', label: '站内信' },
] as const;

export const notificationChannelLabels: Record<string, string> = Object.fromEntries(
  notificationChannelOptions.map((item) => [item.value, item.label]),
);

export const notificationChannelColors: Record<string, string> = {
  EMAIL: 'blue',
  SMS: 'green',
  PHONE: 'gold',
  WECHAT: 'cyan',
  DINGTALK: 'orange',
  WEBHOOK: 'purple',
  IN_APP: 'geekblue',
};

export const notificationStatusLabels: Record<string, string> = {
  PENDING: '待发送',
  SUCCESS: '发送成功',
  FAILED: '发送失败',
};

export const notificationStatusColors: Record<string, string> = {
  PENDING: 'processing',
  SUCCESS: 'success',
  FAILED: 'error',
};

export const templateTypeOptions = [
  { value: 'TEXT', label: '纯文本' },
  { value: 'HTML', label: 'HTML' },
  { value: 'MARKDOWN', label: 'Markdown' },
] as const;

export const templateTypeLabels: Record<string, string> = Object.fromEntries(
  templateTypeOptions.map((item) => [item.value, item.label]),
);
