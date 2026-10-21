import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/modules/shared/errors";
export const bookingResult = {
  id: true,
  startAt: true,
  endAt: true,
  serviceName: true,
  price: true,
  status: true,
} as const;
export async function publicTenant(slug: string) {
  return db.tenant.findUnique({
    where: { slug, active: true },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      maxAdvanceDays: true,
      services: {
        where: { active: true },
        select: { id: true, name: true, price: true, durationMinutes: true },
      },
      staff: {
        where: { active: true },
        select: {
          id: true,
          name: true,
          services: { select: { serviceId: true } },
        },
      },
    },
  });
}
export async function schedulingContext(
  tenantId: string,
  tx: Prisma.TransactionClient = db,
) {
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: {
      hours: true,
      services: { where: { active: true } },
      staff: {
        where: { active: true },
        include: { services: true, schedule: true, absences: true },
      },
    },
  });
  if (!tenant.active) throw new AppError(403, "店家已停用");
  return tenant;
}
export function listBusy(
  tenantId: string,
  staffId: string,
  from: Date,
  to: Date,
  tx: Prisma.TransactionClient = db,
  excludeId?: string,
) {
  return tx.booking
    .findMany({
      where: {
        tenantId,
        staffId,
        status: "CONFIRMED",
        ...(excludeId ? { id: { not: excludeId } } : {}),
        occupiedStartAt: { lt: to },
        occupiedEndAt: { gt: from },
      },
      select: { occupiedStartAt: true, occupiedEndAt: true },
    })
    .then((rows) =>
      rows.map((b) => ({
        startAt: b.occupiedStartAt!,
        endAt: b.occupiedEndAt!,
      })),
    );
}
// Settings writers take the same lock. Reads after the lock see the latest commit.
export async function withLockedTenant<T>(
  tenantId: string,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;
      return run(tx);
    },
    { maxWait: 60000, timeout: 60000 },
  );
}
