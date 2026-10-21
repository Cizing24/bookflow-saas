import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/modules/shared/errors";
export async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError(401, "請先登入");
  return session.user;
}
export async function authorize(
  tenantId: string,
  write = false,
  tx: Prisma.TransactionClient = db,
) {
  const user = await currentUser();
  const membership = await tx.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId: user.id } },
    include: { tenant: true },
  });
  if (!membership) throw new AppError(403, "無此店家的存取權限");
  if (!membership.tenant.active)
    throw new AppError(403, "店家已停用，請聯絡平台管理者");
  if (write && membership.role === "STAFF")
    throw new AppError(403, "需要管理者權限");
  return membership;
}
