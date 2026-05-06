import { Pipe, PipeTransform } from '@angular/core';

// Set to 'Asia/Kolkata' to force IST regardless of the user's machine clock.
// Leave undefined for "user's local time" — recommended for a global app.
const FORCED_TZ: string | undefined = undefined;

const TIME_FMT = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit', minute: '2-digit', hour12: true,
  ...(FORCED_TZ ? { timeZone: FORCED_TZ } : {})
});

const DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
  ...(FORCED_TZ ? { timeZone: FORCED_TZ } : {})
});

const FULL_FMT = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
  ...(FORCED_TZ ? { timeZone: FORCED_TZ } : {})
});

export type ChatTimeMode = 'time' | 'date' | 'full' | 'auto';

export function parseUtc(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;

  // Backend should always send UTC ('…Z'). If a stray timestamp comes through
  // without a tz designator, treat it as UTC explicitly so we never silently
  // shift it by the local offset.
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(input);
  const d = new Date(hasTz ? input : input + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

export function formatChatTime(input: string | Date | null | undefined, mode: ChatTimeMode = 'auto'): string {
  const d = parseUtc(input);
  if (!d) return '';

  if (mode === 'time') return TIME_FMT.format(d);
  if (mode === 'date') return DATE_FMT.format(d);
  if (mode === 'full') return FULL_FMT.format(d);

  // 'auto' — show time for today, date+time otherwise
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay ? TIME_FMT.format(d) : FULL_FMT.format(d);
}

@Pipe({ name: 'chatTime', standalone: true, pure: true })
export class ChatTimePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, mode: ChatTimeMode = 'auto'): string {
    return formatChatTime(value, mode);
  }
}
