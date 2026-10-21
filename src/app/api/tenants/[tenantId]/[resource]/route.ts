import {
  calendar,
  bookingDetail,
  changeBooking,
  statistics,
  customers,
  members,
  saveMember,
  saveSettings,
  notificationPreview,
  rescheduleSlots,
} from "@/modules/operations/service";
import { respond, sameOrigin } from "@/lib/http";
import { AppError } from "@/modules/shared/errors";
import {
  saveService,
  saveStaff,
  saveHours,
  saveSchedule,
  savePolicy,
  cancelBooking,
} from "@/modules/tenant/service";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ tenantId: string; resource: string }> },
) {
  return respond(async () => {
    sameOrigin(r);
    const { tenantId, resource } = await params;
    const data = await r.json();
    if (resource === "booking") return changeBooking(tenantId, data);
    if (resource === "members") return saveMember(tenantId, data);
    if (resource === "settings") return saveSettings(tenantId, data);
    if (resource === "schedule") {
      await saveSchedule(tenantId, data);
      return { ok: true };
    }
    if (resource === "policy") return savePolicy(tenantId, data);
    if (resource === "cancel") return cancelBooking(tenantId, data);
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

export async function GET(
  r: Request,
  { params }: { params: Promise<{ tenantId: string; resource: string }> },
) {
  return respond(async () => {
    const { tenantId, resource } = await params;
    const q = Object.fromEntries(new URL(r.url).searchParams);
    if (resource === "calendar") return calendar(tenantId, q);
    if (resource === "booking") return bookingDetail(tenantId, q.id);
    if (resource === "booking-slots") return rescheduleSlots(tenantId, q.id, q);
    if (resource === "statistics") return statistics(tenantId, q);
    if (resource === "customers") return customers(tenantId, q);
    if (resource === "members") return members(tenantId);
    if (resource === "notifications") return notificationPreview(tenantId);
    throw new AppError(404, "找不到此功能");
  });
}
