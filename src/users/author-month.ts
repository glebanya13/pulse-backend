/** Calendar month key used for «Автор месяца», e.g. 2026-08. */
export function authorMonthPeriod(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatAuthorMonthPeriodRu(period: string): string {
  const [ys, ms] = period.split('-');
  const y = Number(ys);
  const m = Number(ms);
  const months = [
    'январь',
    'февраль',
    'март',
    'апрель',
    'май',
    'июнь',
    'июль',
    'август',
    'сентябрь',
    'октябрь',
    'ноябрь',
    'декабрь',
  ];
  if (!y || !m || m < 1 || m > 12) return period;
  return `${months[m - 1]} ${y}`;
}
