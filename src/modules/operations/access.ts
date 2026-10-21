import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { currentUser } from "@/modules/identity/authorization";
import { AppError } from "@/modules/shared/errors";
export async function access(
  tenantId: string,
  tx: Prisma.TransactionClient = db,
) {
  const user = await currentUser();
  const member = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    include: { tenant: true },
  });
  if (!member) throw new AppError(403, "無此店家的存取權限");
  if (!member.tenant.active)
    throw new AppError(403, "店家已停用，請聯絡平台管理者");
  return member;
}
export type Access = Awaited<ReturnType<typeof access>>;
export function bookingScope(member: Access) {
  return {
    tenantId: member.tenantId,
    ...(member.role === "STAFF"
      ? { staffId: member.staffId ?? "__unassigned__" }
      : {}),
  };
}
export function owner(member: Access) {
  if (member.role !== "OWNER") throw new AppError(403, "需要店家擁有者權限");
}
