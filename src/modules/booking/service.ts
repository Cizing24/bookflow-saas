import { DateTime } from "luxon";
import { computeSlots } from "./domain";
import { publicTenant, listBusy, withLockedTenant } from "./repository";
import { AppError } from "@/modules/shared/errors";
import { bookingSchema } from "@/modules/shared/schemas";
export async function availableSlots(
  slug: string,
  serviceId: string,
  staffId: string,
  date: string,
) {
  const tenant = await publicTenant(slug);
  if (!tenant) throw new AppError(404, "找不到店家");
  const service = tenant.services.find((s) => s.id === serviceId);
  if (!service || !tenant.staff.some((s) => s.id === staffId))
    throw new AppError(400, "請選擇有效的服務與人員");
  const day = DateTime.fromISO(date, { zone: tenant.timezone });
  const today = DateTime.now().setZone(tenant.timezone).startOf("day");
  if (
    !day.isValid ||
    day.toISODate() !== date ||
    day < today ||
    day > today.plus({ days: 90 })
  )
    return [];
  const busy = await listBusy(
    tenant.id,
    staffId,
    day.toJSDate(),
    day.plus({ days: 1 }).toJSDate(),
  );
  return computeSlots(
    date,
    tenant.timezone,
    service.durationMinutes,
    tenant.hours,
    busy,
  );
}
export async function createBooking(slug: string, input: unknown) {
  const data = bookingSchema.parse(input);
  const tenant = await publicTenant(slug);
  if (!tenant) throw new AppError(404, "找不到店家");
  const service = tenant.services.find((s) => s.id === data.serviceId);
  if (!service) throw new AppError(400, "服務已停用");
  const start = DateTime.fromISO(data.startAt).setZone(tenant.timezone);
  const slots = await availableSlots(
    slug,
    data.serviceId,
    data.staffId,
    start.toISODate()!,
  );
  if (!slots.some((s) => Date.parse(s) === start.toMillis()))
    throw new AppError(409, "此時段已無法預約，請重新選擇");
  try {
    return await withLockedTenant(tenant.id, async (repository) => {
      const currentService = await repository.service(data.serviceId);
      const currentStaff = await repository.staff(data.staffId);
      if (!currentService || !currentStaff)
        throw new AppError(409, "服務或人員已停用");
      const hours = await repository.hours();
      if (
        !computeSlots(
          start.toISODate()!,
          tenant.timezone,
          currentService.durationMinutes,
          hours,
          [],
        ).some((s) => Date.parse(s) === start.toMillis())
      )
        throw new AppError(409, "營業時間已變更");
      return repository.insert({
        serviceId: data.serviceId,
        staffId: data.staffId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        startAt: start.toJSDate(),
        endAt: start
          .plus({ minutes: currentService.durationMinutes })
          .toJSDate(),
        serviceName: currentService.name,
        price: currentService.price,
      });
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = String(error);
    if (/23P01|exclusion|Booking_no_overlap/i.test(message))
      throw new AppError(409, "此時段剛被預約，請選擇其他時段");
    throw error;
  }
}
