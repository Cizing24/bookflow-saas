import { DateTime } from "luxon";
type Item = { id: string; staffId: string; startAt: string; endAt: string };
// Display geometry only: overlaps include terminal bookings and repeated DST wall times.
export function calendarLayout(items: Item[], zone: string) {
  const result = new Map<
    string,
    { top: number; height: number; lane: number; lanes: number }
  >();
  const days = new Map<string, { id: string; top: number; end: number }[]>();
  for (const b of items) {
    const start = DateTime.fromISO(b.startAt).setZone(zone);
    const top = start.hour * 60 + start.minute;
    const key = b.staffId + ":" + start.toISODate();
    const rows = days.get(key) ?? [];
    rows.push({
      id: b.id,
      top,
      end:
        top +
        Math.max(30, (Date.parse(b.endAt) - Date.parse(b.startAt)) / 60000),
    });
    days.set(key, rows);
  }
  for (const rows of days.values()) {
    rows.sort((a, b) => a.top - b.top || a.id.localeCompare(b.id));
    let group: typeof rows = [],
      groupEnd = -1;
    function flush() {
      const ends: number[] = [];
      for (const b of group) {
        let lane = ends.findIndex((end) => end <= b.top);
        if (lane === -1) lane = ends.length;
        ends[lane] = b.end;
        result.set(b.id, { top: b.top, height: b.end - b.top, lane, lanes: 0 });
      }
      for (const b of group) result.get(b.id)!.lanes = ends.length;
      group = [];
    }
    for (const b of rows) {
      if (b.top >= groupEnd) {
        flush();
        groupEnd = -1;
      }
      group.push(b);
      groupEnd = Math.max(groupEnd, b.end);
    }
    flush();
  }
  return result;
}
