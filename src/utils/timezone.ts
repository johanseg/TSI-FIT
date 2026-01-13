/**
 * Timezone utilities for America/New_York timezone
 * All date operations should use these utilities to ensure consistent timezone handling
 */

const NY_TIMEZONE = 'America/New_York';

/**
 * Get current date/time
 */
export function getNYDate(): Date {
  return new Date();
}

/**
 * Get start of day (00:00:00) in New York timezone for a given date
 * If no date provided, uses today
 */
export function getNYDayStart(date?: Date): Date {
  const targetDate = date || new Date();
  const dateStr = targetDate.toLocaleDateString('en-US', { timeZone: NY_TIMEZONE });
  const [month, day, year] = dateStr.split('/').map(Number);

  // Create date at midnight in NY timezone
  const nyMidnight = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);

  // Calculate timezone offset and adjust
  const utcDate = new Date(nyMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
  const localDate = new Date(nyMidnight.toLocaleString('en-US', { timeZone: NY_TIMEZONE }));
  const offset = utcDate.getTime() - localDate.getTime();

  return new Date(nyMidnight.getTime() - offset);
}

/**
 * Get end of day (23:59:59.999) in New York timezone for a given date
 * If no date provided, uses today
 */
export function getNYDayEnd(date?: Date): Date {
  const dayStart = getNYDayStart(date);
  return new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Day of week offsets to get back to Monday (Monday = 0)
const DAY_OFFSETS: Record<string, number> = {
  Sunday: 6,
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
};

/**
 * Get Monday start of week (00:00:00 Monday) in New York timezone
 * If no date provided, uses current week
 */
export function getNYWeekStart(date?: Date): Date {
  const targetDate = date || new Date();

  // Get date components in NY timezone
  const dateParts = targetDate.toLocaleDateString('en-US', {
    timeZone: NY_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const [month, day, year] = dateParts.split('/').map(Number);

  // Get day of week in NY timezone
  const dayOfWeek = targetDate.toLocaleDateString('en-US', {
    timeZone: NY_TIMEZONE,
    weekday: 'long',
  });

  const dayOffset = DAY_OFFSETS[dayOfWeek] ?? 0;
  const mondayDate = new Date(year, month - 1, day - dayOffset);

  return getNYDayStart(mondayDate);
}

/**
 * Get first day of month (00:00:00 on 1st) in New York timezone
 * If no date provided, uses current month
 */
export function getNYMonthStart(date?: Date): Date {
  const targetDate = date || new Date();

  // Get month and year in NY timezone
  const dateParts = targetDate.toLocaleDateString('en-US', {
    timeZone: NY_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const [month, , year] = dateParts.split('/').map(Number);

  return getNYDayStart(new Date(year, month - 1, 1));
}

// Format presets for common date formats
const FORMAT_PRESETS: Record<string, Intl.DateTimeFormatOptions> = {
  date: { year: 'numeric', month: 'short', day: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  datetime: { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
};

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

/**
 * Format a date in New York timezone
 */
export function formatNYDate(
  date: Date,
  format?: string | Intl.DateTimeFormatOptions
): string {
  let options: Intl.DateTimeFormatOptions;

  if (typeof format === 'string') {
    options = FORMAT_PRESETS[format] || DEFAULT_FORMAT;
  } else {
    options = format || DEFAULT_FORMAT;
  }

  return date.toLocaleString('en-US', { ...options, timeZone: NY_TIMEZONE });
}

/**
 * Convert a date to ISO string format (YYYY-MM-DD) in NY timezone
 */
export function getNYDateISO(date?: Date): string {
  const targetDate = date || new Date();
  const dateParts = targetDate.toLocaleDateString('en-US', {
    timeZone: NY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [month, day, year] = dateParts.split('/');
  return `${year}-${month}-${day}`;
}

/**
 * Get hour (0-23) in New York timezone for a given date
 */
export function getNYHour(date: Date): number {
  return parseInt(
    date.toLocaleString('en-US', {
      timeZone: NY_TIMEZONE,
      hour: 'numeric',
      hour12: false,
    }),
    10
  );
}
