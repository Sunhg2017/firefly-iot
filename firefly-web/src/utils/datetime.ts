import dayjs from 'dayjs';

export const DISPLAY_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
const DISPLAY_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value == null || value === '') return '-';

  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return String(value);
  }
  return parsed.format(DISPLAY_DATETIME_FORMAT);
}

function shouldFormatDateTimeString(value: string): boolean {
  return ISO_DATETIME_REGEX.test(value) || DISPLAY_DATETIME_REGEX.test(value);
}

export function normalizeDateTimeStrings<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDateTimeStrings(item)) as T;
  }

  if (value instanceof Date) {
    return formatDateTime(value) as T;
  }

  if (typeof value === 'string') {
    return (shouldFormatDateTimeString(value) ? formatDateTime(value) : value) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, normalizeDateTimeStrings(nestedValue)]),
    ) as T;
  }

  return value;
}
