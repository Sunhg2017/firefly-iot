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

/**
 * Converts a picker value (string/Date/number) to the ISO-8601 instant the backend expects.
 * Range pickers must not submit locale-formatted strings: the server would interpret them in
 * an unknown timezone and return the wrong window.
 */
export function toIsoDateTime(value: string | number | Date | null | undefined): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toISOString() : undefined;
}

/**
 * Formats a local picker value for backend `LocalDateTime` fields (no timezone offset).
 * Spring's default Jackson setup parses LocalDateTime from `YYYY-MM-DDTHH:mm:ss`; an ISO
 * string with `Z` would be rejected (or silently shifted), so audit/log queries must use this.
 */
export function toLocalDateTimeString(value: string | number | Date | null | undefined): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm:ss') : undefined;
}
