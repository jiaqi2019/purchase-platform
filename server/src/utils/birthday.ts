const TZ = process.env.TZ || 'Asia/Shanghai';

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function datePartsInTz(date: Date): DateParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-').map(Number);
  return { year: y, month: m, day: d };
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(from: DateParts, to: DateParts): number {
  const ms = utcDate(to.year, to.month, to.day).getTime() - utcDate(from.year, from.month, from.day).getTime();
  return Math.round(ms / 86400000);
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Next occurrence of birthday (month/day) on or after today in TZ. Feb 29 -> Feb 28 in non-leap years. */
export function nextBirthdayOccurrence(birthdayDate: Date, today: Date = new Date()): Date {
  const b = datePartsInTz(birthdayDate);
  const t = datePartsInTz(today);
  let year = t.year;
  let day = b.day;
  if (b.month === 2 && b.day === 29) {
    day = isLeapYear(year) ? 29 : 28;
  }
  let candidate = utcDate(year, b.month, day);
  const candParts = datePartsInTz(candidate);
  if (daysBetween(t, candParts) < 0) {
    year += 1;
    if (b.month === 2 && b.day === 29) {
      day = isLeapYear(year) ? 29 : 28;
    }
    candidate = utcDate(year, b.month, day);
  }
  return candidate;
}

export function daysUntilNextBirthday(birthdayDate: Date, today: Date = new Date()): number {
  const t = datePartsInTz(today);
  const next = nextBirthdayOccurrence(birthdayDate, today);
  const n = datePartsInTz(next);
  return daysBetween(t, n);
}
