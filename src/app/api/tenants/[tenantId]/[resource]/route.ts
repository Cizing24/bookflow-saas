import { respond, sameOrigin } from "@/lib/http";
import { AppError } from "@/modules/shared/errors";
import { saveService, saveStaff, saveHours } from "@/modules/tenant/service";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ tenantId: string; resource: string }> },
) {
  return respond(async () => {
    sameOrigin(r);
    const { tenantId, resource } = await params;
    const data = await r.json();
    if (resource === "services") return saveService(tenantId, data);
    if (resource === "staff") return saveStaff(tenantId, data);
    if (resource === "hours") {
      await saveHours(tenantId, data);
      return { ok: true };
    }
    throw new AppError(404, "找不到此功能");
  });
}
export async function PATCH(
  r: Request,
  { params }: { params: Promise<{ tenantId: string; resource: string }> },
) {
  return respond(async () => {
    sameOrigin(r);
    const { tenantId, resource } = await params;
    const { id, ...data } = await r.json();
    if (typeof id !== "string" || !id) throw new AppError(400, "缺少資料 ID");
    if (resource === "services") return saveService(tenantId, data, id);
    if (resource === "staff") return saveStaff(tenantId, data, id);
    throw new AppError(404, "找不到此功能");
  });
}
