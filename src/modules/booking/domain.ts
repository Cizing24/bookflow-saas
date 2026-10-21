import { DateTime } from "luxon";
export type Hours = {
  weekday: number;
  openMinute: number;
  closeMinute: number;
};
export function computeSlots(
  date: string,
  zone: string,
  duration: number,
  hours: Hours[],
  busy: { startAt: Date; endAt: Date }[],
  now = new Date(),
) {
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid || day.toISODate() !== date) return [];
  const h = hours.find((h) => h.weekday === day.weekday % 7);
  if (!h) return [];
  const slots: string[] = [];
  for (
    let minute = h.openMinute;
    minute + duration <= h.closeMinute;
    minute += 30
  ) {
    const start = day
      .startOf("day")
      .set({ hour: Math.floor(minute / 60), minute: minute % 60 });
    const end = start.plus({ minutes: duration });
    // Reject skipped wall times at DST boundaries.
    if (start.hour !== Math.floor(minute / 60) || start.minute !== minute % 60)
      continue;
    const closing =
      h.closeMinute === 1440
        ? day.plus({ days: 1 }).startOf("day")
        : day.startOf("day").set({
            hour: Math.floor(h.closeMinute / 60),
            minute: h.closeMinute % 60,
          });
    if (end.toMillis() > closing.toMillis()) continue;
    if (
      start.toMillis() <= now.getTime() ||
      busy.some(
        (b) =>
          start.toMillis() < b.endAt.getTime() &&
          end.toMillis() > b.startAt.getTime(),
      )
    )
      continue;
    slots.push(start.toUTC().toISO()!);
  }
  return slots;
}
