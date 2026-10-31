import { LbEvent } from '../models/content';

/** upcoming: còn giữ chỗ được | full: hết chỗ | past: đã diễn ra */
export type EventState = 'upcoming' | 'full' | 'past';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
/** Sự kiện chưa có giờ kết thúc thì coi như kéo dài 2 tiếng (dùng cho file .ics) */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

const FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Ngày giờ theo múi giờ Việt Nam, tách từng phần */
function parts(iso: string): { year: string; month: string; day: string; hour: string; minute: string; weekday: number } {
  const map = Object.fromEntries(FORMAT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { year: map['year'], month: map['month'], day: map['day'], hour: map['hour'], minute: map['minute'], weekday: WEEKDAY_INDEX[map['weekday']] };
}

export function seatsLeft(event: LbEvent): number | null {
  if (event.capacity == null) return null;
  return Math.max(event.capacity - (event.registeredCount ?? 0), 0);
}

export function eventState(event: LbEvent, now = Date.now()): EventState {
  if (new Date(event.startAt).getTime() < now) return 'past';
  return seatsLeft(event) === 0 ? 'full' : 'upcoming';
}

/** Khối ngày: THG 11 / 15 / Thứ Bảy */
export function dateBlock(iso: string): { month: string; day: string; weekday: string } {
  const p = parts(iso);
  return { month: `THG ${Number(p.month)}`, day: p.day, weekday: WEEKDAYS[p.weekday] };
}

/** 09:30 – 11:30 (không có giờ kết thúc thì chỉ giờ bắt đầu) */
export function timeRange(event: LbEvent): string {
  const start = parts(event.startAt);
  const text = `${start.hour}:${start.minute}`;
  if (!event.endAt) return text;
  const end = parts(event.endAt);
  return `${text} – ${end.hour}:${end.minute}`;
}

/** Thứ Bảy, 15/11/2026 · 09:30 */
export function longDate(event: LbEvent): string {
  const p = parts(event.startAt);
  return `${WEEKDAYS[p.weekday]}, ${p.day}/${p.month}/${p.year} · ${p.hour}:${p.minute}`;
}

/** Khoá tháng "2026-11" để lọc theo tháng */
export function monthKey(iso: string): string {
  const p = parts(iso);
  return `${p.year}-${p.month}`;
}

export function placeLabel(event: LbEvent): string {
  return event.location?.trim() || (event.format === 'online' ? 'Online' : '');
}

/** Tải file .ics để thêm sự kiện vào lịch */
export function downloadIcs(event: LbEvent): void {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lightbook//Author Talk//VI',
    'BEGIN:VEVENT',
    `UID:${event._id}@lightbook`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    event.description ? `DESCRIPTION:${escape(event.description)}` : '',
    placeLabel(event) ? `LOCATION:${escape(placeLabel(event))}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.eventCode || 'lightbook-su-kien'}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}
