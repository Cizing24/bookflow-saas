import { mkdirSync, writeFileSync } from "node:fs";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { DateTime } from "luxon";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { availableSlots, createBooking } from "@/modules/booking/service";
import { tenantRepository } from "@/modules/tenant/repository";
import { assertLocalDatabase } from "../database-safety";
assertLocalDatabase();
let tenantId: string,
  serviceId: string,
  staffId: string,
  secondStaffId: string,
  customerId: string;
let foreignTenantId: string, foreignServiceId: string;
const slug = "schedule-" + randomUUID();
const date = DateTime.now()
  .setZone("Asia/Taipei")
  .plus({ days: 3 })
  .toISODate()!;
const startAt = DateTime.fromISO(date + "T09:00", { zone: "Asia/Taipei" })
  .toUTC()
  .toISO()!;
const payload = () => ({
  serviceId,
  staffId,
  startAt,
  name: "Synthetic",
  email: "fixture@example.com",
  phone: "0912345678",
});
beforeAll(async () => {
  const t = await db.tenant.create({
    data: {
      name: "Scheduling fixture",
      slug,
      hours: {
        create: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          openMinute: 0,
          closeMinute: 1440,
        })),
      },
      services: {
        create: { name: "Synthetic", price: 100, durationMinutes: 60 },
      },
      staff: { create: [{ name: "One" }, { name: "Two" }] },
      customers: {
        create: {
          name: "Synthetic",
          email: "fixture@example.com",
          phone: "0912345678",
        },
      },
    },
    include: { services: true, staff: true, customers: true },
  });
  tenantId = t.id;
  serviceId = t.services[0].id;
  staffId = t.staff[0].id;
  secondStaffId = t.staff[1].id;
  customerId = t.customers[0].id;
  await db.staffService.createMany({
    data: t.staff.map((s) => ({ tenantId, staffId: s.id, serviceId })),
  });
  const foreign = await db.tenant.create({
    data: {
      name: "Other fixture",
      slug: slug + "-other",
      services: { create: { name: "Foreign", price: 0, durationMinutes: 30 } },
    },
    include: { services: true },
  });
  foreignTenantId = foreign.id;
  foreignServiceId = foreign.services[0].id;
});
beforeEach(async () => {
  await db.booking.deleteMany({ where: { tenantId } });
  await db.staffSchedule.deleteMany({ where: { tenantId } });
  await db.staffAbsence.deleteMany({ where: { tenantId } });
  await db.staff.updateMany({
    where: { tenantId },
    data: { customSchedule: false },
  });
  await db.tenant.update({
    where: { id: tenantId },
    data: {
      timezone: "Asia/Taipei",
      maxAdvanceDays: 365,
      minNoticeMinutes: 0,
      slotIntervalMinutes: 30,
    },
  });
  await db.service.update({
    where: { id: serviceId },
    data: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
  });
});
afterAll(async () => {
  for (const id of [tenantId, foreignTenantId].filter(Boolean)) {
    await db.booking.deleteMany({ where: { tenantId: id } });
    await db.tenant.delete({ where: { id } });
  }
  await db.$disconnect();
});
describe("Real PostgreSQL scheduling", () => {
  it("20 independent PostgreSQL connections: 1 success, 19 rolled-back conflicts", async () => {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
    });
    const clients = await Promise.all(
      Array.from({ length: 20 }, () => pool.connect()),
    );
    try {
      expect(
        new Set(
          (
            await Promise.all(
              clients.map((c) => c.query("SELECT pg_backend_pid() AS pid")),
            )
          ).map((r) => r.rows[0].pid),
        ).size,
      ).toBe(20);
      const outcomes = await Promise.allSettled(
        clients.map((c) =>
          c.query(
            `INSERT INTO "Booking" (id,"tenantId","serviceId","staffId","customerId","startAt","endAt","serviceName",price) VALUES ($1,$2,$3,$4,$5,$6,$7,'Synthetic',100) RETURNING id`,
            [
              randomUUID(),
              tenantId,
              serviceId,
              staffId,
              customerId,
              startAt,
              DateTime.fromISO(startAt).plus({ hours: 1 }).toISO(),
            ],
          ),
        ),
      );
      const success = outcomes.filter((r) => r.status === "fulfilled").length;
      const failures = outcomes.filter((r) => r.status === "rejected");
      expect(success).toBe(1);
      expect(failures).toHaveLength(19);
      const codes = failures.map((r) =>
        r.status === "rejected" ? r.reason.code : "unexpected",
      );
      console.info(
        "Direct PostgreSQL rejection codes:",
        JSON.stringify(
          codes.reduce(
            (counts: Record<string, number>, code: string) => ({
              ...counts,
              [code]: (counts[code] ?? 0) + 1,
            }),
            {},
          ),
        ),
      );
      mkdirSync(".local-db", { recursive: true });
      writeFileSync(
        ".local-db/phase2-concurrency.json",
        JSON.stringify(
          {
            requests: 20,
            connections: 20,
            success,
            failed: failures.length,
            codes: codes.reduce(
              (counts: Record<string, number>, code: string) => ({
                ...counts,
                [code]: (counts[code] ?? 0) + 1,
              }),
              {},
            ),
          },
          null,
          2,
        ),
      );
      // Simultaneous GiST exclusion checks can deadlock; PostgreSQL aborts those transactions too.
      expect(codes.every((code) => ["23P01", "40P01"].includes(code))).toBe(
        true,
      );
      expect(
        await db.booking.count({ where: { tenantId, status: "CONFIRMED" } }),
      ).toBe(1);
      console.info(
        `DB race: ${success} succeeded, ${failures.length} rejected (exclusion/deadlock rollback), 20 distinct connections`,
      );
    } finally {
      clients.forEach((c) => c.release());
      await pool.end();
    }
  }, 60000);
  it("20 concurrent application requests: 1 success and 19 safe conflicts", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => createBooking(slug, payload())),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.filter((r) => r.status === "rejected");
    expect(failed).toHaveLength(19);
    expect(
      failed.every(
        (r) =>
          r.status === "rejected" &&
          r.reason.status === 409 &&
          !/SQL|constraint|SELECT/i.test(r.reason.message),
      ),
    ).toBe(true);
    expect(await db.booking.count({ where: { tenantId } })).toBe(1);
    console.info("Application race: 1 succeeded, 19 rejected (409)");
  }, 60000);
  it("allows different staff concurrently and half-open adjacent bookings", async () => {
    const results = await Promise.all([
      createBooking(slug, payload()),
      createBooking(slug, { ...payload(), staffId: secondStaffId }),
      createBooking(slug, {
        ...payload(),
        startAt: DateTime.fromISO(startAt).plus({ hours: 1 }).toISO(),
      }),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(3);
  });
  it("returns one booking for 20 concurrent identical idempotency retries and rejects changed content", async () => {
    const request = { ...payload(), idempotencyKey: randomUUID() };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => createBooking(slug, request)),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await db.booking.count({ where: { tenantId } })).toBe(1);
    await expect(
      createBooking(slug, { ...request, name: "Changed" }),
    ).rejects.toMatchObject({ status: 409 });
    console.info(
      "Idempotency race: 20 successful responses, 1 booking, 0 duplicate writes",
    );
  }, 60000);
  it("revalidates breaks, multiple work periods, leave, service qualification and stale slots", async () => {
    const weekday = DateTime.fromISO(date).weekday % 7;
    await tenantRepository.saveSchedule(tenantId, {
      staffId,
      customSchedule: true,
      serviceIds: [serviceId],
      schedule: [
        { weekday, openMinute: 540, closeMinute: 720, kind: "WORK" },
        { weekday, openMinute: 780, closeMinute: 1080, kind: "WORK" },
        { weekday, openMinute: 900, closeMinute: 930, kind: "BREAK" },
      ],
      absences: [],
    });
    const slots = await availableSlots(slug, serviceId, staffId, date);
    expect(slots).toContain(startAt);
    await expect(
      createBooking(slug, {
        ...payload(),
        startAt: DateTime.fromISO(date + "T11:30", {
          zone: "Asia/Taipei",
        }).toISO(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await tenantRepository.saveSchedule(tenantId, {
      staffId,
      customSchedule: false,
      serviceIds: [serviceId],
      schedule: [],
      absences: [
        { date, openMinute: 0, closeMinute: 1440, reason: "Synthetic leave" },
      ],
    });
    await expect(createBooking(slug, payload())).rejects.toMatchObject({
      status: 409,
    });
    await tenantRepository.saveSchedule(tenantId, {
      staffId,
      customSchedule: false,
      serviceIds: [],
      schedule: [],
      absences: [],
    });
    await expect(createBooking(slug, payload())).rejects.toMatchObject({
      status: 400,
    });
    // Restore for the next test.
    await db.staffService.create({ data: { tenantId, staffId, serviceId } });
  });
  it("enforces buffers in the database, snapshots them, and releases cancelled ranges", async () => {
    await db.service.update({
      where: { id: serviceId },
      data: { bufferAfterMinutes: 30 },
    });
    const first = await createBooking(slug, {
      ...payload(),
      idempotencyKey: randomUUID(),
    });
    const stored = await db.booking.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(stored.occupiedEndAt!.getTime() - stored.endAt.getTime()).toBe(
      30 * 60000,
    );
    await expect(
      db.booking.create({
        data: {
          tenantId,
          staffId,
          serviceId,
          customerId,
          serviceName: "Synthetic",
          price: 0,
          startAt: stored.endAt,
          endAt: DateTime.fromJSDate(stored.endAt)
            .plus({ hours: 1 })
            .toJSDate(),
          occupiedStartAt: new Date("2099-01-01Z"),
        },
      }),
    ).rejects.toThrow();
    await db.service.update({
      where: { id: serviceId },
      data: { bufferAfterMinutes: 0 },
    });
    await expect(
      createBooking(slug, {
        ...payload(),
        startAt: stored.endAt.toISOString(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    await tenantRepository.cancelBooking(tenantId, first.id);
    await expect(createBooking(slug, payload())).resolves.toHaveProperty("id");
  });
  it("retains cancellation on idempotent replay", async () => {
    const request = { ...payload(), idempotencyKey: randomUUID() };
    const first = await createBooking(slug, request);
    await tenantRepository.cancelBooking(tenantId, first.id);
    expect(await createBooking(slug, request)).toMatchObject({
      id: first.id,
      status: "CANCELLED",
    });
    expect(await db.booking.count({ where: { tenantId } })).toBe(1);
  });
  it("rejects foreign tenant scheduling relations and scoped cancellation", async () => {
    await expect(
      tenantRepository.saveSchedule(tenantId, {
        staffId,
        customSchedule: false,
        serviceIds: [foreignServiceId],
        schedule: [],
        absences: [],
      }),
    ).rejects.toThrow();
    await expect(
      db.staffService.create({
        data: { tenantId, staffId, serviceId: foreignServiceId },
      }),
    ).rejects.toThrow();
    await expect(
      db.staffSchedule.create({
        data: {
          tenantId: foreignTenantId,
          staffId,
          weekday: 1,
          openMinute: 0,
          closeMinute: 60,
        },
      }),
    ).rejects.toThrow();
    const booking = await createBooking(slug, payload());
    await expect(
      tenantRepository.cancelBooking(foreignTenantId, booking.id),
    ).rejects.toThrow();
    await expect(
      createBooking(slug + "-other", payload()),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("scopes idempotency keys to the tenant", async () => {
    const key = randomUUID();
    const own = await createBooking(slug, {
      ...payload(),
      idempotencyKey: key,
    });
    await db.businessHour.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        tenantId: foreignTenantId,
        weekday,
        openMinute: 0,
        closeMinute: 1440,
      })),
      skipDuplicates: true,
    });
    const foreignStaff = await db.staff.create({
      data: { tenantId: foreignTenantId, name: "Synthetic other" },
    });
    await db.staffService.create({
      data: {
        tenantId: foreignTenantId,
        staffId: foreignStaff.id,
        serviceId: foreignServiceId,
      },
    });
    const other = await createBooking(slug + "-other", {
      ...payload(),
      staffId: foreignStaff.id,
      serviceId: foreignServiceId,
      idempotencyKey: key,
    });
    expect(other.id).not.toBe(own.id);
    expect(await db.booking.count({ where: { idempotencyKey: key } })).toBe(2);
  });
  it("revalidates notice and horizon after availability was fetched", async () => {
    expect(await availableSlots(slug, serviceId, staffId, date)).toContain(
      startAt,
    );
    await tenantRepository.savePolicy(tenantId, {
      minNoticeMinutes: 0,
      maxAdvanceDays: 1,
      slotIntervalMinutes: 30,
    });
    await expect(createBooking(slug, payload())).rejects.toMatchObject({
      status: 409,
    });
    await tenantRepository.savePolicy(tenantId, {
      minNoticeMinutes: 10080,
      maxAdvanceDays: 365,
      slotIntervalMinutes: 30,
    });
    await expect(createBooking(slug, payload())).rejects.toMatchObject({
      status: 409,
    });
  });
  it("persists both fall-back instants and rejects nonexistent spring wall times", async () => {
    const now = DateTime.now().setZone("America/New_York");
    let fall = DateTime.fromObject(
      { year: now.year, month: 11, day: 1 },
      { zone: "America/New_York" },
    );
    fall = fall.plus({ days: (7 - fall.weekday) % 7 });
    if (fall <= now) {
      fall = fall.plus({ years: 1 }).startOf("month");
      fall = fall.plus({ days: (7 - fall.weekday) % 7 });
    }
    await db.tenant.update({
      where: { id: tenantId },
      data: { timezone: "America/New_York" },
    });
    const repeated = (
      await availableSlots(slug, serviceId, staffId, fall.toISODate()!)
    ).filter(
      (s) =>
        DateTime.fromISO(s).setZone("America/New_York").toFormat("HH:mm") ===
        "01:00",
    );
    expect(repeated).toHaveLength(2);
    for (const instant of repeated)
      await createBooking(slug, { ...payload(), startAt: instant });
    expect(await db.booking.count({ where: { tenantId } })).toBe(2);
    let spring = DateTime.fromObject(
      { year: now.year, month: 3, day: 8 },
      { zone: "America/New_York" },
    );
    spring = spring.plus({ days: (7 - spring.weekday) % 7 });
    if (spring <= now) {
      spring = spring.plus({ years: 1 }).set({ day: 8 });
      spring = spring.plus({ days: (7 - spring.weekday) % 7 });
    }
    const slots = await availableSlots(
      slug,
      serviceId,
      staffId,
      spring.toISODate()!,
    );
    expect(slots.length).toBeGreaterThan(0);
    expect(
      slots.some(
        (s) => DateTime.fromISO(s).setZone("America/New_York").hour === 2,
      ),
    ).toBe(false);
    const midnight = (await availableSlots(slug, serviceId, staffId, date))[0];
    expect(DateTime.fromISO(midnight).setZone("America/New_York").hour).toBe(0);
  });
});
