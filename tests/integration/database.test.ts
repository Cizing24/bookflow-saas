import { assertLocalDatabase } from "../database-safety";
import "dotenv/config";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { db } from "@/lib/db";
assertLocalDatabase();
const key = "integration-" + Date.now();
let tenantId: string,
  otherTenantId: string,
  serviceId: string,
  staffId: string,
  customerId: string;
beforeAll(async () => {
  const tenant = await db.tenant.create({
    data: {
      name: "Integration",
      slug: key,
      services: { create: { name: "Test", price: 100, durationMinutes: 60 } },
      staff: { create: { name: "Test" } },
      customers: {
        create: {
          name: "Test",
          email: "test@example.com",
          phone: "0912345678",
        },
      },
    },
    include: { services: true, staff: true, customers: true },
  });
  tenantId = tenant.id;
  serviceId = tenant.services[0].id;
  staffId = tenant.staff[0].id;
  customerId = tenant.customers[0].id;
  otherTenantId = (
    await db.tenant.create({ data: { name: "Other", slug: key + "-other" } })
  ).id;
});
afterAll(async () => {
  for (const id of [tenantId, otherTenantId].filter(Boolean)) {
    await db.booking.deleteMany({ where: { tenantId: id } });
    await db.tenant.delete({ where: { id } });
  }
  await db.$disconnect();
});
const booking = (startAt: string, endAt: string) => ({
  tenantId,
  serviceId,
  staffId,
  customerId,
  startAt: new Date(startAt),
  endAt: new Date(endAt),
  price: 100,
  serviceName: "Test",
});
describe("PostgreSQL invariants (real database, no mocks)", () => {
  it("rejects simultaneous overlapping inserts even when bypassing application checks", async () => {
    const results = await Promise.allSettled([
      db.booking.create({
        data: booking("2030-01-01T01:00Z", "2030-01-01T02:00Z"),
      }),
      db.booking.create({
        data: booking("2030-01-01T01:30Z", "2030-01-01T02:30Z"),
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    await db.booking.deleteMany({ where: { tenantId } });
  });
  it("allows adjacent bookings and ignores cancelled bookings", async () => {
    const a = await db.booking.create({
      data: booking("2030-01-02T01:00Z", "2030-01-02T02:00Z"),
    });
    await db.booking.create({
      data: booking("2030-01-02T02:00Z", "2030-01-02T03:00Z"),
    });
    await db.booking.update({
      where: { id: a.id },
      data: { status: "CANCELLED" },
    });
    await expect(
      db.booking.create({
        data: booking("2030-01-02T01:00Z", "2030-01-02T02:00Z"),
      }),
    ).resolves.toHaveProperty("id");
  });
  it("rejects foreign keys from another tenant", async () => {
    await expect(
      db.booking.create({
        data: {
          ...booking("2030-01-03T01:00Z", "2030-01-03T02:00Z"),
          tenantId: otherTenantId,
        },
      }),
    ).rejects.toThrow();
  });
  it("rejects zero-length bookings and invalid service durations", async () => {
    await expect(
      db.booking.create({
        data: booking("2030-01-04T01:00Z", "2030-01-04T01:00Z"),
      }),
    ).rejects.toThrow();
    await expect(
      db.service.create({
        data: { tenantId, name: "Invalid", price: 0, durationMinutes: 0 },
      }),
    ).rejects.toThrow();
  });
});
