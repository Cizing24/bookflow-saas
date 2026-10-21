import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type {
  tenantSchema,
  serviceSchema,
  staffSchema,
  hoursSchema,
  scheduleSchema,
  policySchema,
} from "@/modules/shared/schemas";
export const tenantRepository = {
  memberships: (userId: string) =>
    db.membership.findMany({ where: { userId }, include: { tenant: true } }),
  create: (userId: string, data: z.infer<typeof tenantSchema>) =>
    db.tenant.create({
      data: {
        ...data,
        memberships: { create: { userId, role: "OWNER" } },
        hours: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            openMinute: 540,
            closeMinute: 1080,
          })),
        },
      },
    }),
  async overview(tenantId: string) {
    const [services, staff, bookings, hours] = await Promise.all([
      db.service.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
      db.staff.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        include: { schedule: true, absences: true, services: true },
      }),
      db.booking.findMany({
        where: { tenantId },
        include: { customer: true, staff: true },
        orderBy: { startAt: "desc" },
        take: 200,
      }),
      db.businessHour.findMany({
        where: { tenantId },
        orderBy: { weekday: "asc" },
      }),
    ]);
    return { services, staff, bookings, hours };
  },
  saveService: (
    tenantId: string,
    data: z.infer<typeof serviceSchema>,
    id?: string,
  ) =>
    withTenantLock(tenantId, async (tx) =>
      id
        ? tx.service.update({ where: { tenantId_id: { tenantId, id } }, data })
        : tx.service.create({
            data: {
              ...data,
              tenantId,
              staffServices: {
                create: (
                  await tx.staff.findMany({
                    where: { tenantId },
                    select: { id: true },
                  })
                ).map((s) => ({ staffId: s.id })),
              },
            },
          }),
    ),
  saveStaff: (
    tenantId: string,
    data: z.infer<typeof staffSchema>,
    id?: string,
  ) =>
    withTenantLock(tenantId, async (tx) =>
      id
        ? tx.staff.update({ where: { tenantId_id: { tenantId, id } }, data })
        : tx.staff.create({
            data: {
              ...data,
              tenantId,
              services: {
                create: (
                  await tx.service.findMany({
                    where: { tenantId },
                    select: { id: true },
                  })
                ).map((s) => ({ serviceId: s.id })),
              },
            },
          }),
    ),
  savePolicy: (tenantId: string, data: z.infer<typeof policySchema>) =>
    withTenantLock(tenantId, (tx) =>
      tx.tenant.update({ where: { id: tenantId }, data }),
    ),
  saveSchedule: (tenantId: string, data: z.infer<typeof scheduleSchema>) =>
    withTenantLock(tenantId, async (tx) => {
      await tx.staff.findUniqueOrThrow({
        where: { tenantId_id: { tenantId, id: data.staffId } },
      });
      for (const id of data.serviceIds)
        await tx.service.findUniqueOrThrow({
          where: { tenantId_id: { tenantId, id } },
        });
      await tx.staff.update({
        where: { tenantId_id: { tenantId, id: data.staffId } },
        data: { customSchedule: data.customSchedule },
      });
      const scope = { tenantId, staffId: data.staffId };
      await tx.staffSchedule.deleteMany({ where: scope });
      await tx.staffAbsence.deleteMany({ where: scope });
      await tx.staffService.deleteMany({ where: scope });
      await tx.staffSchedule.createMany({
        data: data.schedule.map((h) => ({ ...scope, ...h })),
      });
      await tx.staffAbsence.createMany({
        data: data.absences.map((h) => ({ ...scope, ...h })),
      });
      await tx.staffService.createMany({
        data: data.serviceIds.map((serviceId) => ({ ...scope, serviceId })),
      });
    }),
  cancelBooking: (tenantId: string, id: string) =>
    withTenantLock(tenantId, (tx) =>
      tx.booking.update({
        where: { id, tenantId },
        data: { status: "CANCELLED" },
        select: { id: true, status: true },
      }),
    ),
  saveHours: (tenantId: string, data: z.infer<typeof hoursSchema>) =>
    withTenantLock(tenantId, async (tx) => {
      await tx.businessHour.deleteMany({ where: { tenantId } });
      await tx.businessHour.createMany({
        data: data.map((h) => ({ ...h, tenantId })),
      });
    }),
};
async function withTenantLock<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
      return fn(tx);
    },
    { maxWait: 60000, timeout: 60000 },
  );
}
