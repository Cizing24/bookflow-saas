import "dotenv/config";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { assertLocalDatabase } from "../database-safety";
const identity = vi.hoisted(() => ({ id: "" }));
vi.mock("@/modules/identity/authorization", () => ({
  currentUser: async () => ({ id: identity.id }),
}));
import { db } from "@/lib/db";
import { platformOverview, setTenantActive } from "@/modules/platform/service";
import { access } from "@/modules/operations/access";
import { publicTenant } from "@/modules/booking/repository";
import { createBooking } from "@/modules/booking/service";
import { publicChange, publicDetail } from "@/modules/operations/service";
import { tenantRepository } from "@/modules/tenant/repository";
assertLocalDatabase();
const key = "platform-" + randomUUID();
const adminId = randomUUID(),
  ownerId = randomUUID();
let tenantId: string, serviceId: string, staffId: string;
const reason = "Synthetic suspension test";
const data = () => ({ tenantId, active: false, expectedActive: true, reason });
beforeAll(async () => {
  await db.user.createMany({
    data: [adminId, ownerId].map((id) => ({
      id,
      name: "Synthetic",
      email: `${id}@example.com`,
    })),
  });
  await db.platformAdmin.create({ data: { userId: adminId } });
  const t = await db.tenant.create({
    data: {
      name: "Platform fixture",
      slug: key,
      cancelCutoffMinutes: 0,
      memberships: { create: { userId: ownerId, role: "OWNER" } },
      services: {
        create: { name: "Synthetic", durationMinutes: 60, price: 100 },
      },
      staff: { create: { name: "Synthetic" } },
      hours: {
        create: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          openMinute: 0,
          closeMinute: 1440,
        })),
      },
    },
    include: { services: true, staff: true },
  });
  tenantId = t.id;
  serviceId = t.services[0].id;
  staffId = t.staff[0].id;
  await db.staffService.create({ data: { tenantId, staffId, serviceId } });
});
afterAll(async () => {
  await db.platformEvent.deleteMany({ where: { actorId: adminId } });
  await db.tenant.delete({ where: { id: tenantId } });
  await db.user.deleteMany({ where: { id: { in: [adminId, ownerId] } } });
  await db.$disconnect();
});
it("owner cannot acquire platform privileges; platform admin has no tenant membership", async () => {
  identity.id = ownerId;
  await expect(platformOverview({})).rejects.toThrow("平台管理權限");
  await expect(setTenantActive(data())).rejects.toThrow("平台管理權限");
  identity.id = adminId;
  await expect(access(tenantId)).rejects.toThrow("存取權限");
  expect((await platformOverview({})).total).toBeGreaterThan(0);
});
it("suspension is audited atomically; public bookings and tenant access stop, existing cancellation remains usable", async () => {
  const startAt = DateTime.now()
    .setZone("Asia/Taipei")
    .plus({ days: 5 })
    .startOf("day")
    .plus({ hours: 10 })
    .toUTC()
    .toISO()!;
  const payload = {
    serviceId,
    staffId,
    startAt,
    name: "Synthetic",
    email: "fixture@example.com",
    phone: "0912345678",
  };
  const booking = await createBooking(key, payload);
  if (!("managementToken" in booking)) throw new Error("Missing token");
  identity.id = adminId;
  await setTenantActive(data());
  expect(await publicTenant(key)).toBeNull();
  await expect(createBooking(key, payload)).rejects.toThrow("找不到店家");
  identity.id = ownerId;
  await expect(access(tenantId)).rejects.toThrow("停用");
  await expect(
    tenantRepository.savePolicy(
      tenantId,
      { minNoticeMinutes: 0, maxAdvanceDays: 30, slotIntervalMinutes: 30 },
      ownerId,
    ),
  ).rejects.toThrow("停用");
  expect((await publicDetail(booking.managementToken)).status).toBe(
    "CONFIRMED",
  );
  await publicChange(booking.managementToken, { action: "CANCELLED" });
  expect((await publicDetail(booking.managementToken)).status).toBe(
    "CANCELLED",
  );
  expect(
    await db.platformEvent.count({
      where: { tenantId, actorId: adminId, action: "TENANT_DISABLED" },
    }),
  ).toBe(1);
  identity.id = adminId;
  await expect(setTenantActive(data())).rejects.toThrow("已異動");
  await setTenantActive({ ...data(), active: true, expectedActive: false });
  expect(await publicTenant(key)).not.toBeNull();
});
it("validates platform input and immediately revokes platform access", async () => {
  identity.id = adminId;
  await expect(setTenantActive({ ...data(), reason: "" })).rejects.toThrow();
  await expect(
    setTenantActive({ ...data(), tenantId: "missing" }),
  ).rejects.toThrow("找不到店家");
  await db.platformAdmin.delete({ where: { userId: adminId } });
  await expect(platformOverview({})).rejects.toThrow("平台管理權限");
});
it("revalidates revoked tenant writer inside lock", async () => {
  await db.membership.update({
    where: { tenantId_userId: { tenantId, userId: ownerId } },
    data: { role: "STAFF" },
  });
  await expect(
    tenantRepository.savePolicy(
      tenantId,
      { minNoticeMinutes: 0, maxAdvanceDays: 30, slotIntervalMinutes: 30 },
      ownerId,
    ),
  ).rejects.toThrow("管理者權限");
});
