import { newManagementToken, tokenHash } from "@/modules/operations/tokens";
import { recordEvent, enqueue } from "@/modules/operations/notifications";
import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { Prisma } from "@/generated/prisma/client";
import { availability } from "./domain";
import {
  publicTenant,
  listBusy,
  withLockedTenant,
  schedulingContext,
  bookingResult,
} from "./repository";
import { AppError } from "@/modules/shared/errors";
import { bookingSchema } from "@/modules/shared/schemas";
type Context = Awaited<ReturnType<typeof schedulingContext>>;
export async function slotsFor(
  tenant: Context,
  serviceId: string,
  staffId: string,
  date: string,
  tx?: Prisma.TransactionClient,
  knownBusy?: { startAt: Date; endAt: Date }[],
  excludeId?: string,
) {
  const service = tenant.services.find((s) => s.id === serviceId);
  const staff = tenant.staff.find((s) => s.id === staffId);
  if (
    !service ||
    !staff ||
    !staff.services.some((s) => s.serviceId === serviceId)
  )
    throw new AppError(400, "請選擇有效的服務與人員");
  const day = DateTime.fromISO(date, { zone: tenant.timezone });
  if (!day.isValid || day.toISODate() !== date) return [];
  const busy =
    knownBusy ??
    (await listBusy(
      tenant.id,
      staffId,
      day.startOf("day").toJSDate(),
      day.plus({ days: 1 }).startOf("day").toJSDate(),
      tx,
      excludeId,
    ));
  return availability({
    date,
    zone: tenant.timezone,
    duration: service.durationMinutes,
    hours: tenant.hours,
    schedule: staff.schedule,
    customSchedule: staff.customSchedule,
    absences: staff.absences,
    busy,
    bufferBefore: service.bufferBeforeMinutes,
    bufferAfter: service.bufferAfterMinutes,
    minNoticeMinutes: tenant.minNoticeMinutes,
    maxAdvanceDays: tenant.maxAdvanceDays,
    slotIntervalMinutes: tenant.slotIntervalMinutes,
  });
}
export async function availableSlots(
  slug: string,
  serviceId: string,
  staffId: string,
  date: string,
) {
  const tenant = await publicTenant(slug);
  if (!tenant) throw new AppError(404, "找不到店家");
  return slotsFor(await schedulingContext(tenant.id), serviceId, staffId, date);
}
export async function availableDates(
  slug: string,
  serviceId: string,
  staffId: string,
) {
  const tenant = await publicTenant(slug);
  if (!tenant) throw new AppError(404, "找不到店家");
  const context = await schedulingContext(tenant.id);
  const today = DateTime.now().setZone(context.timezone).startOf("day");
  const busy = await listBusy(
    tenant.id,
    staffId,
    today.toJSDate(),
    today.plus({ days: context.maxAdvanceDays + 1 }).toJSDate(),
  );
  const dates: string[] = [];
  for (let i = 0; i <= context.maxAdvanceDays; i++) {
    const date = today.plus({ days: i }).toISODate()!;
    if (
      (await slotsFor(context, serviceId, staffId, date, undefined, busy))
        .length
    )
      dates.push(date);
  }
  return dates;
}
export async function createBooking(slug: string, input: unknown) {
  const data = bookingSchema.parse(input);
  const tenant = await publicTenant(slug);
  if (!tenant) throw new AppError(404, "找不到店家");
  const { idempotencyKey, ...payload } = data;
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        ...payload,
        startAt: new Date(data.startAt).toISOString(),
      }),
    )
    .digest("hex");
  try {
    return await withLockedTenant(tenant.id, async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.booking.findUnique({
          where: {
            tenantId_idempotencyKey: { tenantId: tenant.id, idempotencyKey },
          },
          select: { ...bookingResult, requestHash: true },
        });
        if (existing) {
          if (existing.requestHash !== hash)
            throw new AppError(409, "此重試識別碼已用於不同的預約內容");
          const { requestHash: _, ...result } = existing;
          void _;
          return result;
        }
      }
      const context = await schedulingContext(tenant.id, tx);
      const start = DateTime.fromISO(data.startAt).setZone(context.timezone);
      const slots = await slotsFor(
        context,
        data.serviceId,
        data.staffId,
        start.toISODate()!,
        tx,
      );
      if (!slots.some((s) => Date.parse(s) === start.toMillis()))
        throw new AppError(409, "此時段已無法預約，請重新選擇");
      const service = context.services.find((s) => s.id === data.serviceId)!;
      const customer = await tx.customer.create({
        data: {
          tenantId: tenant.id,
          name: data.name,
          email: data.email,
          phone: data.phone,
        },
      });
      const managementToken = newManagementToken();
      const booking = await tx.booking.create({
        data: {
          tenantId: tenant.id,
          managementTokenHash: tokenHash(managementToken),
          serviceId: service.id,
          staffId: data.staffId,
          customerId: customer.id,
          startAt: start.toJSDate(),
          endAt: start.plus({ minutes: service.durationMinutes }).toJSDate(),
          serviceName: service.name,
          price: service.price,
          bufferBeforeMinutes: service.bufferBeforeMinutes,
          bufferAfterMinutes: service.bufferAfterMinutes,
          idempotencyKey,
          requestHash: idempotencyKey ? hash : null,
        },
      });
      await recordEvent(tx, booking, "CUSTOMER", "CREATED");
      await enqueue(tx, booking, "CONFIRMED", managementToken);
      await enqueue(tx, booking, "REMINDER", managementToken);
      return {
        id: booking.id,
        startAt: booking.startAt,
        endAt: booking.endAt,
        serviceName: booking.serviceName,
        price: booking.price,
        status: booking.status,
        managementToken,
      };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (
      /23P01|40P01|P2034|deadlock|exclusion|Booking_no_overlap/i.test(
        String(error),
      )
    )
      throw new AppError(409, "此時段剛被預約，請選擇其他時段");
    throw error;
  }
}
