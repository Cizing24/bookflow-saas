import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { computeSlots } from "@/modules/booking/domain";
import {
  bookingSchema,
  tenantSchema,
  hoursSchema,
} from "@/modules/shared/schemas";
const now = new Date("2026-01-01Z");
const hours = [{ weekday: 1, openMinute: 540, closeMinute: 720 }];
describe("Backend slot calculation", () => {
  it("converts Taipei wall clock to UTC", () => {
    const slots = computeSlots("2026-11-02", "Asia/Taipei", 60, hours, [], now);
    expect(slots).toHaveLength(5);
    expect(slots[0]).toBe("2026-11-02T01:00:00.000Z");
  });
  it("rejects overlaps while permitting adjacent bookings", () => {
    const slots = computeSlots(
      "2026-11-02",
      "Asia/Taipei",
      60,
      hours,
      [
        {
          startAt: new Date("2026-11-02T01:00Z"),
          endAt: new Date("2026-11-02T02:00Z"),
        },
      ],
      now,
    );
    expect(slots[0]).toBe("2026-11-02T02:00:00.000Z");
  });
  it("rejects closed days, invalid dates and past times", () => {
    expect(
      computeSlots("2026-11-01", "Asia/Taipei", 60, hours, [], now),
    ).toEqual([]);
    expect(computeSlots("bad", "Asia/Taipei", 60, hours, [], now)).toEqual([]);
    expect(
      computeSlots(
        "2026-11-02",
        "Asia/Taipei",
        60,
        hours,
        [],
        new Date("2027-01-01Z"),
      ),
    ).toEqual([]);
  });
  it("keeps service within closing time", () => {
    expect(
      computeSlots("2026-11-02", "Asia/Taipei", 240, hours, [], now),
    ).toEqual([]);
  });
  it("skips nonexistent DST times", () => {
    const slots = computeSlots(
      "2026-03-08",
      "America/New_York",
      30,
      [{ weekday: 0, openMinute: 60, closeMinute: 240 }],
      [],
      now,
    );
    expect(slots).toHaveLength(4);
    expect(
      slots.map((s) => DateTime.fromISO(s).setZone("America/New_York").hour),
    ).not.toContain(2);
  });
  it("rejects invalid IANA timezone and duplicate weekdays", () => {
    expect(
      tenantSchema.safeParse({
        name: "Test",
        slug: "test",
        timezone: "Moon/Test",
      }).success,
    ).toBe(false);
    expect(hoursSchema.safeParse([...hours, ...hours]).success).toBe(false);
  });
  it("strips client-provided end time", () => {
    const result = bookingSchema.parse({
      serviceId: "a",
      staffId: "b",
      startAt: "2026-11-02T01:00:00Z",
      endAt: "2099-01-01",
      name: "顧客",
      email: "USER@example.com",
      phone: "0912345678",
    });
    expect(result).not.toHaveProperty("endAt");
    expect(result.email).toBe("user@example.com");
  });
});

it("allows a service ending exactly at local midnight", () => {
  const result = computeSlots(
    "2026-11-02",
    "Asia/Taipei",
    60,
    [{ weekday: 1, openMinute: 1380, closeMinute: 1440 }],
    [],
    now,
  );
  expect(result).toEqual(["2026-11-02T15:00:00.000Z"]);
});
