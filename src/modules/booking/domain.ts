import { DateTime } from "luxon";
export type Hours = {
  weekday: number;
  openMinute: number;
  closeMinute: number;
};
type Interval = { openMinute: number; closeMinute: number };
export type AvailabilityInput = {
  date: string;
  zone: string;
  duration: number;
  hours: Hours[];
  schedule?: (Hours & { kind: string })[];
  customSchedule?: boolean;
  absences?: (Interval & { date: string })[];
  busy: { startAt: Date; endAt: Date }[];
  bufferBefore?: number;
  bufferAfter?: number;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  slotIntervalMinutes?: number;
  now?: Date;
};
// Every wall-clock rule uses the tenant zone. Durations and buffers use elapsed minutes.
// Enumerating real minutes naturally preserves both fall-back offsets and skips spring gaps.
export function availability(input: AvailabilityInput): string[] {
  const { date, zone, duration, hours, busy } = input;
  const day = DateTime.fromISO(date, { zone });
  const now = input.now ?? new Date();
  const today = DateTime.fromJSDate(now, { zone }).startOf("day");
  if (
    !day.isValid ||
    day.toISODate() !== date ||
    day < today ||
    (input.maxAdvanceDays !== undefined &&
      day > today.plus({ days: input.maxAdvanceDays }))
  )
    return [];
  const weekday = day.weekday % 7;
  const business = hours.filter((h) => h.weekday === weekday);
  const rules = (input.schedule ?? []).filter((h) => h.weekday === weekday);
  const work = input.customSchedule
    ? rules.filter((h) => h.kind === "WORK")
    : business;
  if (!business.length || !work.length) return [];
  const blocked = [
    ...rules.filter((h) => h.kind === "BREAK"),
    ...(input.absences ?? []).filter((h) => h.date === date),
  ];
  const contains = (ranges: Interval[], minute: number) =>
    ranges.some((h) => minute >= h.openMinute && minute < h.closeMinute);
  const ranges: { start: number; end: number }[] = [];
  const starts: number[] = [];
  const step = input.slotIntervalMinutes ?? 30;
  if (!Number.isInteger(step) || step < 1 || duration <= 0) return [];
  const finish = day.plus({ days: 1 }).startOf("day").toMillis();
  for (
    let instant = day.startOf("day").toMillis();
    instant < finish;
    instant += 60000
  ) {
    const wall = DateTime.fromMillis(instant, { zone });
    const minute = wall.hour * 60 + wall.minute;
    if (
      contains(business, minute) &&
      contains(work, minute) &&
      !contains(blocked, minute)
    ) {
      const previous = ranges.at(-1);
      if (previous?.end === instant) previous.end += 60000;
      else ranges.push({ start: instant, end: instant + 60000 });
      if (
        work.some(
          (h) => minute >= h.openMinute && (minute - h.openMinute) % step === 0,
        )
      )
        starts.push(instant);
    }
  }
  const before = (input.bufferBefore ?? 0) * 60000;
  const after = (input.bufferAfter ?? 0) * 60000;
  return starts
    .filter((start) => {
      const from = start - before,
        to = start + duration * 60000 + after;
      return (
        start > now.getTime() &&
        start >= now.getTime() + (input.minNoticeMinutes ?? 0) * 60000 &&
        ranges.some((r) => from >= r.start && to <= r.end) &&
        !busy.some((b) => from < b.endAt.getTime() && to > b.startAt.getTime())
      );
    })
    .map((start) => new Date(start).toISOString());
}
// Phase 1 public domain contract remains available.
export function computeSlots(
  date: string,
  zone: string,
  duration: number,
  hours: Hours[],
  busy: AvailabilityInput["busy"],
  now = new Date(),
) {
  return availability({ date, zone, duration, hours, busy, now });
}
