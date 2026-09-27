const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function shortTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

export function relativeShort(ms: number, now: number): string {
  const diff = Math.round((now - ms) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff} min ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ${diff % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * The single countdown formatter used everywhere, so the whole app counts
 * down in the same voice.
 */
export function countdown(hoursRemaining: number): string {
  if (hoursRemaining <= 0) return 'EXPIRED';
  const totalMinutes = hoursRemaining * 60;
  if (totalMinutes < 10) {
    const mins = Math.floor(totalMinutes);
    const secs = Math.floor((totalMinutes - mins) * 60);
    return `${mins}m ${pad(secs)}s`;
  }
  if (totalMinutes < 60) return `${Math.floor(totalMinutes)} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  if (h < 48) return `${h}h ${pad(m)}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function durationLabel(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

export function kg(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)} t`;
  return `${Math.round(value)} kg`;
}

export function kgPrecise(value: number): string {
  return `${value.toFixed(1)} kg`;
}

export function meals(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function hourLabel(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${pad(h)}:${pad(m)}`;
}

export function hourFloat(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}
