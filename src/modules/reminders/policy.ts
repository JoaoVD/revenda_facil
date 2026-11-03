export function businessDate(now: Date) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    time: `${get('hour')}:${get('minute')}`,
    period: `${get('year')}-${get('month')}`,
  };
}
export function reminderPeriod(
  preference: { enabled: boolean; dayMode: string; day: number; time: string },
  now = new Date(),
): string | null {
  if (!preference.enabled) return null;
  const local = businessDate(now),
    last = new Date(Date.UTC(local.year, local.month, 0)).getUTCDate();
  const day =
    preference.dayMode === 'FIRST'
      ? 1
      : preference.dayMode === 'LAST'
        ? last
        : Math.min(preference.day, last);
  return local.day > day || (local.day === day && local.time >= preference.time)
    ? local.period
    : null;
}
