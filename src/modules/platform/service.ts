import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { currentUser } from "@/modules/identity/authorization";
import { AppError } from "@/modules/shared/errors";

export async function platformAccess(tx: Prisma.TransactionClient = db) {
  const user = await currentUser();
  if (!(await tx.platformAdmin.findUnique({ where: { userId: user.id } })))
    throw new AppError(403, "需要獨立的平台管理權限");
  return user;
}
export async function platformOverview(input: unknown) {
  await platformAccess();
  const { page } = z
    .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
    .parse(input);
  return db.$transaction(
    async (tx) => {
      const [total, active, bookings, tenants, events] = await Promise.all([
        tx.tenant.count(),
        tx.tenant.count({ where: { active: true } }),
        tx.booking.count(),
        tx.tenant.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * 25,
          take: 25,
          select: {
            id: true,
            name: true,
            slug: true,
            active: true,
            createdAt: true,
            _count: { select: { bookings: true } },
          },
        }),
        tx.platformEvent.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        }),
      ]);
      return { total, active, bookings, tenants, events, page };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function setTenantActive(input: unknown) {
  const data = z
    .object({
      tenantId: z.string().min(1).max(128),
      active: z.boolean(),
      expectedActive: z.boolean(),
      reason: z.string().trim().min(3).max(200),
    })
    .strict()
    .parse(input);
  await platformAccess();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${data.tenantId} FOR UPDATE`;
    const user = await platformAccess(tx);
    const before = await tx.tenant.findUnique({ where: { id: data.tenantId } });
    if (!before) throw new AppError(404, "找不到店家");
    if (before.active !== data.expectedActive)
      throw new AppError(409, "店家狀態已異動，請重新載入");
    if (before.active === data.active) return { ok: true };
    await tx.tenant.update({
      where: { id: before.id },
      data: { active: data.active },
    });
    await tx.platformEvent.create({
      data: {
        actorId: user.id,
        tenantId: before.id,
        action: data.active ? "TENANT_ENABLED" : "TENANT_DISABLED",
        reason: data.reason,
        before: before.active,
        after: data.active,
      },
    });
    return { ok: true };
  });
}
