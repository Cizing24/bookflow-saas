import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { z } from "zod";
import type {
  tenantSchema,
  serviceSchema,
  staffSchema,
  hoursSchema,
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
      db.staff.findMany({ where: { tenantId }, orderBy: { name: "asc" } }),
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
    withTenantLock(tenantId, (tx) =>
      id
        ? tx.service.update({ where: { tenantId_id: { tenantId, id } }, data })
        : tx.service.create({ data: { ...data, tenantId } }),
    ),
  saveStaff: (
    tenantId: string,
    data: z.infer<typeof staffSchema>,
    id?: string,
  ) =>
    withTenantLock(tenantId, (tx) =>
      id
        ? tx.staff.update({ where: { tenantId_id: { tenantId, id } }, data })
        : tx.staff.create({ data: { ...data, tenantId } }),
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
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
    return fn(tx);
  });
}
