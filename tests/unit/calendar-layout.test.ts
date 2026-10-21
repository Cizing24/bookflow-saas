import { expect, it } from "vitest";
import { calendarLayout } from "@/lib/calendar-layout";
it("keeps a cancelled booking and its replacement individually clickable, with adjacent bookings full width", () => {
  const b = (id: string, startAt: string, endAt: string) => ({
    id,
    staffId: "one",
    startAt,
    endAt,
  });
  const positions = calendarLayout(
    [
      b("cancelled", "2030-01-01T01:00Z", "2030-01-01T02:00Z"),
      b("replacement", "2030-01-01T01:00Z", "2030-01-01T02:00Z"),
      b("adjacent", "2030-01-01T02:00Z", "2030-01-01T03:00Z"),
    ],
    "Asia/Taipei",
  );
  expect(positions.get("cancelled")!.lane).not.toBe(
    positions.get("replacement")!.lane,
  );
  expect(positions.get("cancelled")!.lanes).toBe(2);
  expect(positions.get("adjacent")!.lanes).toBe(1);
});
it("separates repeated DST wall times and isolates employee columns", () => {
  const positions = calendarLayout(
    [
      {
        id: "first",
        staffId: "one",
        startAt: "2026-11-01T05:00Z",
        endAt: "2026-11-01T05:30Z",
      },
      {
        id: "second",
        staffId: "one",
        startAt: "2026-11-01T06:00Z",
        endAt: "2026-11-01T06:30Z",
      },
      {
        id: "other",
        staffId: "two",
        startAt: "2026-11-01T05:00Z",
        endAt: "2026-11-01T05:30Z",
      },
    ],
    "America/New_York",
  );
  expect(positions.get("first")!.top).toBe(positions.get("second")!.top);
  expect(positions.get("first")!.lanes).toBe(2);
  expect(positions.get("other")!.lanes).toBe(1);
});
