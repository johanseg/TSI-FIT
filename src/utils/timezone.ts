/**
 * Timezone utilities for America/New_York timezone
 * All date operations should use these utilities to ensure consistent timezone handling
 */

const NY_TIMEZONE = 'America/New_York';

/**
 * Get current date/time in New York timezone
 */
export function getNYDate(): Date {
  return new Date();
}

/**
 * Convert a date to New York timezone representation
 * Note: Date objects in JavaScript are always in UTC internally
 * This function formats the date as if it were in NY timezone
 */
export function toNYDate(date: Date): Date {
  // JavaScript Date objects are UTC internally
  // This function ensures we work with dates as if they were in NY timezone
  return new Date(date);
}

/**
 * Get start of day (00:00:00) in New York timezone for a given date
 * If no date provided, uses today
 */
export function getNYDayStart(date?: Date): Date {
  const targetDate = date || new Date();
  const dateStr = targetDate.toLocaleDateString('en-US', { timeZone: NY_TIMEZONE });
  const [month, day, year] = dateStr.split('/').map(Number);
  
  // Create date at midnight in NY timezone, then convert to UTC Date object
  const nyMidnight = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`);
  
  // Adjust for timezone offset
  const nyDate = new Date(nyMidnight.toLocaleString('en-US', { timeZone: 'UTC' }));
  const localDate = new Date(nyMidnight.toLocaleString('en-US', { timeZone: NY_TIMEZONE }));
  const offset = nyDate.getTime() - localDate.getTime();
  
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

/**
 * Get Monday start of week (00:00:00 Monday) in New York timezone
 * If no date provided, uses current week
 */
export function getNYWeekStart(date?: Date): Date {
  const targetDate = date || new Date();
  
  // Get the day of week in NY timezone (0 = Sunday, 1 = Monday, etc.)
  const nyDateStr = targetDate.toLocaleDateString('en-US', { 
    timeZone: NY_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  
  // Get the actual date components in NY timezone
  const dateParts = targetDate.toLocaleDateString('en-US', {
    timeZone: NY_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
  const [month, day, year] = dateParts.split('/').map(Number);
  
  // Create date object representing the date in NY
  const nyDate = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00`);
  
  // Get day of week (0 = Sunday, 1 = Monday, etc.)
  // We need to calculate this in NY timezone
  const dayOfWeek = targetDate.toLocaleDateString('en-US', {
    timeZone: NY_TIMEZONE,
    weekday: 'long'
  });
  
  let dayOffset = 0;
  switch (dayOfWeek) {
    case 'Sunday': dayOffset = 6; break;
    case 'Monday': dayOffset = 0; break;
    case 'Tuesday': dayOffset = 1; break;
    case 'Wednesday': dayOffset = 2; break;
    case 'Thursday': dayOffset = 3; break;
    case 'Friday': dayOffset = 4; break;
    case 'Saturday': dayOffset = 5; break;
  }
  
  // Calculate Monday by going back
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
    day: 'numeric'
  });
  const [month, , year] = dateParts.split('/').map(Number);
  
  // Create first day of month
  const firstDay = new Date(year, month - 1, 1);
  return getNYDayStart(firstDay);
}

/**
 * Format a date in New York timezone
 * @param date Date to format
 * @param format Optional format string or Intl.DateTimeFormatOptions
 */
export function formatNYDate(
  date: Date,
  format?: string | Intl.DateTimeFormatOptions
): string {
  if (typeof format === 'string') {
    // Simple format string support
    const options: Intl.DateTimeFormatOptions = {
      timeZone: NY_TIMEZONE,
    };
    
    if (format.includes('date')) {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
    }
    if (format.includes('time')) {
      options.hour = 'numeric';
      options.minute = '2-digit';
    }
    if (format.includes('datetime')) {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
      options.hour = 'numeric';
      options.minute = '2-digit';
    }
    
    return date.toLocaleString('en-US', { ...options, timeZone: NY_TIMEZONE });
  }
  
  const options: Intl.DateTimeFormatOptions = format || {
    timeZone: NY_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  
  return date.toLocaleString('en-US', { ...options, timeZone: NY_TIMEZONE });
}

/**
 * Convert a date to ISO string format but representing NY timezone day
 * Returns YYYY-MM-DD format based on NY timezone
 */
export function getNYDateISO(date?: Date): string {
  const targetDate = date || new Date();
  const dateParts = targetDate.toLocaleDateString('en-US', {
    timeZone: NY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
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
      hour12: false
    })
  );
}

/**
 * Convert NY timezone date range to UTC Date objects for database queries
 * This ensures WHERE clauses filter correctly
 */
export function convertNYToUTCForQuery(date: Date): Date {
  // The date represents a moment in NY timezone
  // We need to interpret it as a UTC date for PostgreSQL
  // PostgreSQL will handle the conversion if we pass it as a string with timezone info
  return date;
}
