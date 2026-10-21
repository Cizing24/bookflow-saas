import { redirect } from "next/navigation";
import { currentUser } from "@/modules/identity/authorization";
import { listTenants } from "@/modules/tenant/service";
import { Dashboard } from "@/components/dashboard";
import { AppError } from "@/modules/shared/errors";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser().catch((e) => {
    if (e instanceof AppError && e.status === 401) redirect("/login");
    throw e;
  });
  const memberships = await listTenants();
  return (
    <Dashboard
      userName={user.name}
      isPlatformAdmin={
        !!(await db.platformAdmin.findUnique({ where: { userId: user.id } }))
      }
      memberships={memberships.map((m) => ({
        id: m.tenantId,
        name: m.tenant.name,
        role: m.role,
      }))}
    />
  );
}
