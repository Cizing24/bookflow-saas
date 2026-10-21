import "dotenv/config";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { assertLocalDatabase } from "../database-safety";
const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/modules/identity/authorization", () => ({
  currentUser: async () => ({ id: identity.id }),
}));
import { db } from "@/lib/db";
import { createBooking } from "@/modules/booking/service";
import {
  changeBooking,
  publicDetail,
  publicChange,
  calendar,
  customers,
  statistics,
  bookingDetail,
  saveMember,
  saveSettings,
  members,
  notificationPreview,
} from "@/modules/operations/service";
import {
  dispatchNotifications,
  emailProvider,
} from "@/modules/operations/notifications";
import { rateLimit } from "@/modules/operations/rate-limit";
assertLocalDatabase();
const key = "ops-" + randomUUID();
let tenantId: string,
  foreignId: string,
  staffId: string,
  secondStaff: string,
  serviceId: string;
const users: string[] = [];
const date = DateTime.now()
  .setZone("Asia/Taipei")
  .plus({ days: 4 })
  .toISODate()!;
const at = (hour: number) =>
  DateTime.fromISO(date, { zone: "Asia/Taipei" })
    .set({ hour })
    .toUTC()
    .toISO()!;
const payload = (hour: number, staff = staffId) => ({
  serviceId,
  staffId: staff,
  startAt: at(hour),
  name: "Synthetic",
  email: "fixture@example.com",
  phone: "0912345678",
});
async function book(hour: number, staff = staffId) {
  return createBooking(key, payload(hour, staff));
}
beforeAll(async () => {
  for (const role of ["OWNER", "ADMIN", "STAFF", "STAFF"] as const) {
    const u = await db.user.create({
      data: {
        id: randomUUID(),
        name: role,
        email: `${key}-${users.length}@example.com`,
      },
    });
    users.push(u.id);
  }
  const t = await db.tenant.create({
    data: {
      name: "Operations fixture",
      slug: key,
      cancelCutoffMinutes: 60,
      rescheduleCutoffMinutes: 60,
      hours: {
        create: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          openMinute: 0,
          closeMinute: 1440,
        })),
      },
      staff: { create: [{ name: "One" }, { name: "Two" }] },
      services: {
        create: { name: "Service", price: 100, durationMinutes: 60 },
      },
      memberships: {
        create: users.map((userId, i) => ({
          userId,
          role: (["OWNER", "ADMIN", "STAFF", "STAFF"] as const)[i],
        })),
      },
    },
    include: { staff: true, services: true },
  });
  tenantId = t.id;
  staffId = t.staff[0].id;
  secondStaff = t.staff[1].id;
  serviceId = t.services[0].id;
  await db.membership.update({
    where: { tenantId_userId: { tenantId, userId: users[2] } },
    data: { staffId },
  });
  await db.staffService.createMany({
    data: t.staff.map((s) => ({ tenantId, staffId: s.id, serviceId })),
  });
  foreignId = (
    await db.tenant.create({
      data: { name: "Foreign", slug: key + "-foreign" },
    })
  ).id;
  identity.id = users[0];
});
afterAll(async () => {
  await db.tenant.deleteMany({
    where: { id: { in: [tenantId, foreignId].filter(Boolean) } },
  });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.rateLimit.deleteMany({ where: { key: { in: rateKeys } } });
  await db.$disconnect();
});
const rateKeys: string[] = [];
describe("Business operations with real PostgreSQL; only session identity is injected", () => {
  it("atomically creates audit, hashed credential and two outbox records; idempotency never exposes credential again", async () => {
    const data = { ...payload(1), idempotencyKey: randomUUID() };
    const b = await createBooking(key, data);
    expect("managementToken" in b).toBe(true);
    const token = (b as typeof b & { managementToken: string }).managementToken;
    const stored = await db.booking.findUniqueOrThrow({ where: { id: b.id } });
    expect(stored.managementTokenHash).not.toBe(token);
    expect(await db.bookingEvent.count({ where: { bookingId: b.id } })).toBe(1);
    expect(await db.notification.count({ where: { bookingId: b.id } })).toBe(2);
    expect(await createBooking(key, data)).not.toHaveProperty(
      "managementToken",
    );
    expect(await publicDetail(token)).toHaveProperty("id", b.id);
    await expect(
      publicDetail(randomUUID().replaceAll("-", "") + "xxxxxxxxxxx"),
    ).rejects.toThrow();
    await expect(
      publicChange(token, { action: "COMPLETED" }),
    ).rejects.toThrow();
  });
  it("scope restricts staff calendar, booking details, customer PII, dashboard and every management operation", async () => {
    const own = await book(3);
    const other = await book(3, secondStaff);
    identity.id = users[2];
    const c = await calendar(tenantId, { from: date, days: 1 });
    expect(c.bookings.every((b) => b.staffId === staffId)).toBe(true);
    expect(c.staff).toHaveLength(1);
    await expect(bookingDetail(tenantId, other.id)).rejects.toThrow();
    await expect(bookingDetail(foreignId, own.id)).rejects.toThrow();
    await expect(customers(tenantId, {})).rejects.toThrow();
    await expect(members(tenantId)).rejects.toThrow();
    await expect(notificationPreview(tenantId)).rejects.toThrow();
    await expect(
      saveSettings(tenantId, {
        cancelCutoffMinutes: 0,
        rescheduleCutoffMinutes: 0,
      }),
    ).rejects.toThrow();
    await expect(
      changeBooking(tenantId, { id: other.id, action: "CANCELLED" }),
    ).rejects.toThrow();
    await expect(
      changeBooking(tenantId, {
        id: own.id,
        action: "RESCHEDULE",
        revision: 0,
        staffId: secondStaff,
        serviceId,
        startAt: at(5),
      }),
    ).rejects.toThrow();
    expect((await statistics(tenantId, { from: date, days: 1 })).total).toBe(
      c.bookings.length,
    );
    await changeBooking(tenantId, { id: own.id, action: "CANCELLED" });
    identity.id = users[3];
    expect(
      (await calendar(tenantId, { from: date, days: 1 })).bookings,
    ).toHaveLength(0);
    identity.id = users[1];
    await expect(
      saveMember(tenantId, { email: `${key}-3@example.com`, role: "ADMIN" }),
    ).rejects.toThrow();
    identity.id = users[0];
  });
  it("revalidates rescheduling, excludes itself, rejects stale edits and retains one active booking during a race", async () => {
    const a = await book(5),
      b = await book(7);
    await changeBooking(tenantId, {
      id: a.id,
      action: "RESCHEDULE",
      revision: 0,
      staffId,
      serviceId,
      startAt: at(5),
    });
    await expect(
      changeBooking(tenantId, {
        id: a.id,
        action: "RESCHEDULE",
        revision: 0,
        staffId,
        serviceId,
        startAt: at(6),
      }),
    ).rejects.toThrow();
    await expect(
      changeBooking(tenantId, {
        id: a.id,
        action: "RESCHEDULE",
        revision: 1,
        staffId,
        serviceId,
        startAt: at(7),
      }),
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      changeBooking(tenantId, {
        id: a.id,
        action: "RESCHEDULE",
        revision: 1,
        staffId,
        serviceId,
        startAt: at(9),
      }),
      changeBooking(tenantId, {
        id: b.id,
        action: "RESCHEDULE",
        revision: 0,
        staffId,
        serviceId,
        startAt: at(9),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.booking.count({
        where: {
          tenantId,
          staffId,
          startAt: new Date(at(9)),
          status: "CONFIRMED",
        },
      }),
    ).toBe(1);
    expect(
      await db.bookingEvent.count({
        where: { bookingId: a.id, action: "RESCHEDULE" },
      }),
    ).toBeGreaterThanOrEqual(1);
  });
  it("customer can cancel and reschedule only its token's booking and cutoff is enforced", async () => {
    const a = await book(11);
    const token = (a as typeof a & { managementToken: string }).managementToken;
    await publicChange(token, {
      action: "RESCHEDULE",
      revision: 0,
      serviceId,
      staffId,
      startAt: at(12),
      id: "foreign-ignored",
    });
    await saveSettings(tenantId, {
      cancelCutoffMinutes: 525600,
      rescheduleCutoffMinutes: 525600,
    });
    await expect(
      publicChange(token, { action: "CANCELLED" }),
    ).rejects.toThrow();
    await saveSettings(tenantId, {
      cancelCutoffMinutes: 60,
      rescheduleCutoffMinutes: 60,
    });
    await publicChange(token, { action: "CANCELLED" });
    expect((await publicDetail(token)).status).toBe("CANCELLED");
    await expect(
      publicChange(token, {
        action: "RESCHEDULE",
        revision: 2,
        serviceId,
        staffId,
        startAt: at(13),
      }),
    ).rejects.toThrow();
  });
  it("prevents terminal status resurrection at database and service boundaries", async () => {
    const b = await book(14);
    await changeBooking(tenantId, { id: b.id, action: "CANCELLED" });
    await expect(
      db.booking.update({ where: { id: b.id }, data: { status: "CONFIRMED" } }),
    ).rejects.toThrow();
    const past = await db.booking.create({
      data: {
        tenantId,
        serviceId,
        staffId,
        customerId: (
          await db.customer.findFirstOrThrow({ where: { tenantId } })
        ).id,
        startAt: new Date("2020-01-01T00:00Z"),
        endAt: new Date("2020-01-01T01:00Z"),
        serviceName: "Past",
        price: 100,
      },
    });
    await changeBooking(tenantId, { id: past.id, action: "COMPLETED" });
    const missed = await db.booking.create({
      data: {
        tenantId,
        serviceId,
        staffId,
        customerId: past.customerId,
        startAt: new Date("2020-01-02T00:00Z"),
        endAt: new Date("2020-01-02T01:00Z"),
        serviceName: "Missed",
        price: 100,
      },
    });
    await changeBooking(tenantId, { id: missed.id, action: "NO_SHOW" });
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: missed.id } })).status,
    ).toBe("NO_SHOW");

    await expect(
      changeBooking(tenantId, { id: past.id, action: "NO_SHOW" }),
    ).rejects.toThrow();
  });
  it("protects foreign binding and owner; customer history and counts stay in tenant", async () => {
    await expect(
      saveMember(tenantId, { email: `${key}-0@example.com`, role: "STAFF" }),
    ).rejects.toThrow();
    const foreignStaff = await db.staff.create({
      data: { tenantId: foreignId, name: "Foreign" },
    });
    await expect(
      saveMember(tenantId, {
        email: `${key}-3@example.com`,
        role: "STAFF",
        staffId: foreignStaff.id,
      }),
    ).rejects.toThrow();
    await expect(
      db.membership.update({
        where: { tenantId_userId: { tenantId, userId: users[3] } },
        data: { staffId: foreignStaff.id },
      }),
    ).rejects.toThrow();
    const list = await customers(tenantId, { search: "fixture" });
    expect("customers" in list && list.customers?.length).toBe(1);
    const c = await db.customer.findFirstOrThrow({ where: { tenantId } });
    const detail = await customers(tenantId, { id: c.id });
    expect("count" in detail && detail.count).toBe(
      await db.booking.count({ where: { tenantId } }),
    );
    identity.id = users[1];
    await expect(customers(foreignId, { id: c.id })).rejects.toThrow();
    identity.id = users[0];
  });
  it("outbox failure persists retry; concurrent workers deliver once, stale reminders skipped and preview never sent", async () => {
    await db.notification.updateMany({
      where: { tenantId },
      data: { availableAt: new Date("2100-01-01T00:00Z") },
    });
    const b = await book(16);
    await db.notification.updateMany({
      where: { bookingId: b.id, kind: "REMINDER" },
      data: { availableAt: new Date("2100-01-01T00:00Z") },
    });
    await dispatchNotifications(
      {
        send: async () => {
          throw new Error("synthetic provider failure");
        },
      },
      1,
      tenantId,
    );
    const n = await db.notification.findFirstOrThrow({
      where: { bookingId: b.id, kind: "CONFIRMED" },
    });
    expect(n.status).toBe("PENDING");
    expect(n.attempts).toBe(1);
    expect(n.sentAt).toBeNull();
    await db.notification.update({
      where: { id: n.id },
      data: { availableAt: new Date(0) },
    });
    const sent: string[] = [];
    const provider = {
      send: async (m: { id: string }) => {
        sent.push(m.id);
        return "SENT" as const;
      },
    };
    await Promise.all([
      dispatchNotifications(provider, 1, tenantId),
      dispatchNotifications(provider, 1, tenantId),
    ]);
    expect(sent.filter((id) => id === n.id)).toHaveLength(1);
    await db.notification.update({
      where: { id: n.id },
      data: {
        status: "PROCESSING",
        leaseUntil: new Date(0),
        leaseToken: "expired-fixture",
      },
    });
    await dispatchNotifications(provider, 1, tenantId);
    expect(sent.filter((id) => id === n.id)).toHaveLength(2);
    expect(
      (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).status,
    ).toBe("SENT");

    await changeBooking(tenantId, { id: b.id, action: "CANCELLED" });
    await db.notification.updateMany({
      where: { bookingId: b.id, kind: "REMINDER" },
      data: { availableAt: new Date(0) },
    });
    await dispatchNotifications({ send: async () => "PREVIEWED" }, 5, tenantId);
    expect(
      (
        await db.notification.findFirstOrThrow({
          where: { bookingId: b.id, kind: "REMINDER" },
        })
      ).status,
    ).toBe("SKIPPED");
    const cancelled = await db.notification.findFirstOrThrow({
      where: { bookingId: b.id, kind: "CANCELLED" },
    });
    expect(cancelled.status).toBe("PREVIEWED");
    expect(cancelled.sentAt).toBeNull();
    const old = process.env.EMAIL_PROVIDER;
    delete process.env.EMAIL_PROVIDER;
    await expect(
      emailProvider().send({
        id: "x",
        recipient: "fixture@example.com",
        subject: "test",
        body: "test",
      }),
    ).rejects.toThrow("EMAIL_CONFIGURATION_REQUIRED");
    process.env.EMAIL_PROVIDER = old;
  });
  it("owner can update membership binding and revoke access on the next request", async () => {
    const email = `${key}-3@example.com`;
    await saveMember(tenantId, { email, role: "ADMIN" });
    identity.id = users[3];
    await expect(customers(tenantId, {})).resolves.toHaveProperty("customers");
    await expect(
      saveSettings(tenantId, {
        cancelCutoffMinutes: 0,
        rescheduleCutoffMinutes: 0,
      }),
    ).rejects.toThrow();
    identity.id = users[0];
    await saveMember(tenantId, { email, role: "STAFF", staffId: secondStaff });
    identity.id = users[3];
    const scoped = await calendar(tenantId, { from: date, days: 1 });
    expect(scoped.bookings.length).toBeGreaterThan(0);
    expect(scoped.bookings.every((b) => b.staffId === secondStaff)).toBe(true);
    identity.id = users[0];
    await saveMember(tenantId, { email, role: "STAFF", remove: true });
    identity.id = users[3];
    await expect(calendar(tenantId, { from: date, days: 1 })).rejects.toThrow();
    identity.id = users[0];
  });
  it("shared rate limiter atomically rejects abuse and honors expiry", async () => {
    const scope = key + "-rate";
    const { createHash } = await import("node:crypto");
    const rateKey = createHash("sha256")
      .update(scope + ":shared")
      .digest("hex");
    rateKeys.push(rateKey);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        rateLimit(new Request("http://localhost"), scope, 5),
      ),
    );
    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(5);
    await db.rateLimit.update({
      where: { key: rateKey },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      rateLimit(new Request("http://localhost"), scope, 5),
    ).resolves.toBeUndefined();
  });
});
