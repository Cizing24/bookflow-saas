import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { availability, type AvailabilityInput } from "@/modules/booking/domain";
import { scheduleSchema } from "@/modules/shared/schemas";
const base: AvailabilityInput = {
  date: "2026-11-02",
  zone: "Asia/Taipei",
  duration: 60,
  hours: [{ weekday: 1, openMinute: 540, closeMinute: 1080 }],
  busy: [],
  now: new Date("2026-11-01T00:00Z"),
  maxAdvanceDays: 90,
};
const wall = (input: AvailabilityInput) =>
  availability(input).map((s) =>
    DateTime.fromISO(s).setZone(input.zone).toFormat("HH:mm"),
  );
describe("Scheduling domain", () => {
  it("intersects business hours and multiple employee work intervals", () => {
    expect(
      wall({
        ...base,
        customSchedule: true,
        schedule: [
          { weekday: 1, openMinute: 480, closeMinute: 660, kind: "WORK" },
          { weekday: 1, openMinute: 900, closeMinute: 1200, kind: "WORK" },
        ],
      }),
    ).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
      "17:00",
    ]);
    expect(
      availability({ ...base, customSchedule: true, schedule: [] }),
    ).toEqual([]);
  });
  it("rejects services crossing lunch, including pre/post buffers", () => {
    const input = {
      ...base,
      schedule: [
        { weekday: 1, openMinute: 720, closeMinute: 780, kind: "BREAK" },
      ],
    };
    expect(wall(input)).not.toContain("11:30");
    expect(wall(input)).toContain("11:00");
    expect(wall({ ...input, bufferAfter: 15 })).not.toContain("11:00");
    expect(wall({ ...input, bufferBefore: 15 })).not.toContain("13:00");
  });
  it("subtracts partial leave and full date holidays", () => {
    expect(
      wall({
        ...base,
        absences: [{ date: base.date, openMinute: 600, closeMinute: 660 }],
      }),
    ).not.toContain("09:30");
    expect(
      availability({
        ...base,
        absences: [{ date: base.date, openMinute: 0, closeMinute: 1440 }],
      }),
    ).toEqual([]);
  });
  it("requires buffers inside work and outside existing occupied ranges", () => {
    const slots = wall({
      ...base,
      bufferBefore: 15,
      bufferAfter: 15,
      busy: [
        {
          startAt: new Date("2026-11-02T02:00Z"),
          endAt: new Date("2026-11-02T03:15Z"),
        },
      ],
    });
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).not.toContain("11:00");
    expect(slots).toContain("11:30");
    expect(slots).not.toContain("17:00");
  });
  it("enforces notice, configurable interval, and local calendar horizon", () => {
    const slots = wall({
      ...base,
      now: new Date("2026-11-02T01:00Z"),
      minNoticeMinutes: 60,
      slotIntervalMinutes: 20,
    });
    expect(slots[0]).toBe("10:00");
    expect(slots[1]).toBe("10:20");
    expect(
      availability({ ...base, date: "2026-11-03", maxAdvanceDays: 1 }),
    ).toEqual([]);
    const tuesday = {
      ...base,
      date: "2026-11-03",
      hours: [{ weekday: 2, openMinute: 540, closeMinute: 1080 }],
    };
    expect(availability({ ...tuesday, maxAdvanceDays: 1 })).toEqual([]);
    expect(
      availability({ ...tuesday, maxAdvanceDays: 2 }).length,
    ).toBeGreaterThan(0);
    expect(availability({ ...base, maxAdvanceDays: 1 })).not.toEqual([]);
  });
  it("uses tenant date even when UTC is the previous date", () => {
    const input = {
      ...base,
      hours: [{ weekday: 1, openMinute: 0, closeMinute: 120 }],
      now: new Date("2026-11-01T15:00Z"),
    };
    expect(availability(input)[0]).toBe("2026-11-01T16:00:00.000Z");
  });
  it("offers both fall-back offsets, ordered by UTC instant", () => {
    const slots = availability({
      ...base,
      date: "2026-11-01",
      zone: "America/New_York",
      duration: 30,
      now: new Date("2026-10-31Z"),
      hours: [{ weekday: 0, openMinute: 60, closeMinute: 120 }],
    });
    expect(slots).toEqual([
      "2026-11-01T05:00:00.000Z",
      "2026-11-01T05:30:00.000Z",
      "2026-11-01T06:00:00.000Z",
      "2026-11-01T06:30:00.000Z",
    ]);
  });
  it("blocks both offsets of a repeated wall-clock break", () => {
    const slots = availability({
      ...base,
      date: "2026-11-01",
      zone: "America/New_York",
      duration: 30,
      now: new Date("2026-10-31Z"),
      hours: [{ weekday: 0, openMinute: 0, closeMinute: 180 }],
      schedule: [
        { weekday: 0, openMinute: 60, closeMinute: 120, kind: "BREAK" },
      ],
    });
    expect(slots).not.toContain("2026-11-01T05:00:00.000Z");
    expect(slots).not.toContain("2026-11-01T06:00:00.000Z");
  });
  it("skips spring gaps while using elapsed service duration", () => {
    const input = {
      ...base,
      date: "2026-03-08",
      zone: "America/New_York",
      duration: 60,
      now: new Date("2026-03-07Z"),
      hours: [{ weekday: 0, openMinute: 60, closeMinute: 240 }],
    };
    expect(wall(input)).toEqual(["01:00", "01:30", "03:00"]);
  });
  it("rejects overlapping schedule input and invalid leave dates", () => {
    const data = {
      staffId: "test",
      customSchedule: true,
      serviceIds: [],
      absences: [],
      schedule: [
        { weekday: 1, kind: "WORK", openMinute: 540, closeMinute: 720 },
      ],
    };
    expect(scheduleSchema.safeParse(data).success).toBe(true);
    expect(
      scheduleSchema.safeParse({
        ...data,
        schedule: [...data.schedule, ...data.schedule],
      }).success,
    ).toBe(false);
    expect(
      scheduleSchema.safeParse({
        ...data,
        absences: [{ date: "2026-02-30", openMinute: 0, closeMinute: 1440 }],
      }).success,
    ).toBe(false);
  });
});
