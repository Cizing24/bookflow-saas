import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
export async function publicTenant(slug: string) {
  return db.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      services: {
        where: { active: true },
        select: { id: true, name: true, price: true, durationMinutes: true },
      },
      staff: { where: { active: true }, select: { id: true, name: true } },
      hours: true,
    },
  });
}

export function listBusy(
  tenantId: string,
  staffId: string,
  from: Date,
  to: Date,
) {
  return db.booking.findMany({
    where: {
      tenantId,
      staffId,
      status: "CONFIRMED",
      startAt: { lt: to },
      endAt: { gt: from },
    },
    select: { startAt: true, endAt: true },
  });
}
function scopedBookingRepository(
  tx: Prisma.TransactionClient,
  tenantId: string,
) {
  return {
    service: (id: string) =>
      tx.service.findFirst({ where: { id, tenantId, active: true } }),
    staff: (id: string) =>
      tx.staff.findFirst({ where: { id, tenantId, active: true } }),
    hours: () => tx.businessHour.findMany({ where: { tenantId } }),
    async insert(data: {
      serviceId: string;
      staffId: string;
      name: string;
      email: string;
      phone: string;
      startAt: Date;
      endAt: Date;
      serviceName: string;
      price: number;
    }) {
      const customer = await tx.customer.create({
        data: {
          tenantId,
          name: data.name,
          email: data.email,
          phone: data.phone,
        },
      });
      return tx.booking.create({
        data: {
          tenantId,
          customerId: customer.id,
          serviceId: data.serviceId,
          staffId: data.staffId,
          startAt: data.startAt,
          endAt: data.endAt,
          serviceName: data.serviceName,
          price: data.price,
        },
        select: {
          id: true,
          startAt: true,
          endAt: true,
          serviceName: true,
          price: true,
        },
      });
    },
  };
}
export async function withLockedTenant<T>(
  tenantId: string,
  run: (repository: ReturnType<typeof scopedBookingRepository>) => Promise<T>,
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
    return run(scopedBookingRepository(tx, tenantId));
  });
}
