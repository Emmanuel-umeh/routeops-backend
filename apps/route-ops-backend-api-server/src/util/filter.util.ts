import { EnumProjectStatus } from "../project/base/EnumProjectStatus";

/**
 * Extracts a string value from various input types (handles arrays, strings, etc.)
 */
export function getString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return getString(value[0]);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

/**
 * Parses a number from various input types
 */
export function parseNumber(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    return parseNumber(value[0]);
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : value;
  }
  if (typeof value === "string") {
    if (value.trim().length === 0) return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Parses a date string in DD/MM/YYYY or DD-MM-YYYY format
 * @param value - Date string to parse
 * @param endOfDay - If true, sets time to end of day (23:59:59.999)
 */
export function parseDate(value?: string, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const parts = value.split(/[\/\-]/);
  if (parts.length !== 3) return undefined;
  const [dayStr, monthStr, yearStr] = parts;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  if (
    Number.isNaN(day) ||
    Number.isNaN(month) ||
    Number.isNaN(year) ||
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12
  ) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (endOfDay) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

/**
 * Extracts eIRI range from a string (e.g., "0-1.5" or "1.5-2.5")
 * @param range - Range string to parse
 * @returns Object with min and/or max values
 */
export function extractEiriRange(
  range?: string
): { min?: number; max?: number } {
  if (!range) {
    return {};
  }
  const matches = range.match(/-?\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) {
    return {};
  }
  const numbers = matches
    .map((m) => Number(m))
    .filter((n) => !Number.isNaN(n));
  if (numbers.length === 0) {
    return {};
  }
  if (numbers.length === 1) {
    return { min: numbers[0] };
  }
  return {
    min: Math.min(numbers[0], numbers[1]),
    max: Math.max(numbers[0], numbers[1]),
  };
}

/**
 * Parses and validates a project status enum value
 */
export function parseStatus(value?: string): EnumProjectStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return Object.values(EnumProjectStatus).find(
    (status) => status === normalized
  );
}

