import { z } from "zod";
import { DateTime } from "luxon";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { access, bookingScope, owner } from "./access";
import { tokenHash } from "./tokens";
import { assertCutoff, assertTransition } from "./domain";
import { recordEvent, enqueue } from "./notifications";
import { AppError } from "@/modules/shared/errors";
import {
  bookingResult,
  schedulingContext,
  withLockedTenant,
} from "@/modules/booking/repository";
import { slotsFor } from "@/modules/booking/service";
const idSchema = z.string().min(1).max(128);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const changeSchema = z.discriminatedUnion("action", [
  z.object({
    id: idSchema,
    action: z.literal("RESCHEDULE"),
    revision: z.number().int().min(0),
    serviceId: idSchema,
    staffId: idSchema,
    startAt: z.iso.datetime({ offset: true }),
  }),
  z.object({
    id: idSchema,
    action: z.enum(["CANCELLED", "COMPLETED", "NO_SHOW"]),
    revision: z.number().int().min(0).optional(),
  }),
]);
export const detailSelect = {
  ...bookingResult,
  serviceId: true,
  staffId: true,
  revision: true,
  customer: { select: { id: true, name: true, email: true, phone: true } },
  staff: { select: { id: true, name: true } },
} as const;
async function credential(token: string, tx: Prisma.TransactionClient = db) {
  const hash = tokenHash(tokenSchema.parse(token));
  const b = await tx.booking.findUnique({
    where: { managementTokenHash: hash },
    select: { id: true, tenantId: true },
  });
  if (!b) throw new AppError(404, "管理連結無效");
  return b;
}
export async function publicDetail(token: string) {
  const b = await credential(token);
  const booking = await db.booking.findFirstOrThrow({
    where: b,
    select: {
      ...bookingResult,
      serviceId: true,
      staffId: true,
      revision: true,
      staff: { select: { name: true } },
      tenant: {
        select: {
          name: true,
          slug: true,
          timezone: true,
          cancelCutoffMinutes: true,
          rescheduleCutoffMinutes: true,
        },
      },
    },
  });
  return booking;
}
export async function bookingDetail(tenantId: string, id: string) {
  const member = await access(tenantId);
  const b = await db.booking.findFirst({
    where: { ...bookingScope(member), id: idSchema.parse(id) },
    select: {
      ...detailSelect,
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!b) throw new AppError(404, "找不到預約");
  return b;
}
export async function changeBooking(
  tenantId: string,
  input: unknown,
  token?: string,
) {
  const data = changeSchema.parse(input);
  if (token) {
    const b = await credential(token);
    if (b.tenantId !== tenantId || b.id !== data.id)
      throw new AppError(404, "管理連結無效");
  } else await access(tenantId);
  try {
    return await withLockedTenant(tenantId, async (tx) => {
      const member = token ? null : await access(tenantId, tx);
      const scope = member
        ? bookingScope(member)
        : { tenantId, managementTokenHash: tokenHash(token!) };
      const before = await tx.booking.findFirst({
        where: { ...scope, id: data.id },
      });
      if (!before) throw new AppError(404, "找不到預約");
      if (data.revision !== undefined && before.revision !== data.revision)
        throw new AppError(409, "預約已異動，請重新載入");
      if (before.status !== "CONFIRMED") {
        if (data.action === "CANCELLED" && before.status === "CANCELLED")
          return { id: before.id, status: before.status };
        throw new AppError(409, "此預約狀態不允許此操作");
      }
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      });
      if (token) {
        if (!["RESCHEDULE", "CANCELLED"].includes(data.action))
          throw new AppError(403, "無此操作權限");
        assertCutoff(
          before.startAt,
          data.action === "RESCHEDULE"
            ? tenant.rescheduleCutoffMinutes
            : tenant.cancelCutoffMinutes,
        );
      }
      let update: Prisma.BookingUpdateInput;
      if (data.action === "RESCHEDULE") {
        if (member?.role === "STAFF" && data.staffId !== member.staffId)
          throw new AppError(403, "只能操作自己的工作資料");
        const context = await schedulingContext(tenantId, tx);
        const start = DateTime.fromISO(data.startAt).setZone(context.timezone);
        const slots = await slotsFor(
          context,
          data.serviceId,
          data.staffId,
          start.toISODate()!,
          tx,
          undefined,
          before.id,
        );
        if (!slots.some((s) => Date.parse(s) === start.toMillis()))
          throw new AppError(409, "此時段已無法預約，請重新選擇");
        const service = context.services.find((s) => s.id === data.serviceId)!;
        update = {
          service: { connect: { tenantId_id: { tenantId, id: service.id } } },
          staff: { connect: { tenantId_id: { tenantId, id: data.staffId } } },
          startAt: start.toJSDate(),
          endAt: start.plus({ minutes: service.durationMinutes }).toJSDate(),
          serviceName: service.name,
          price: service.price,
          bufferBeforeMinutes: service.bufferBeforeMinutes,
          bufferAfterMinutes: service.bufferAfterMinutes,
        };
      } else {
        assertTransition(
          before.status,
          data.action,
          before.startAt,
          before.endAt,
        );
        update = { status: data.action };
      }
      const after = await tx.booking.update({
        where: { id: before.id, tenantId },
        data: { ...update, revision: { increment: 1 } },
      });
      await recordEvent(
        tx,
        after,
        member ? `USER:${member.userId}` : "CUSTOMER",
        data.action,
        before,
      );
      if (data.action === "RESCHEDULE" || data.action === "CANCELLED") {
        await enqueue(
          tx,
          after,
          data.action === "RESCHEDULE" ? "RESCHEDULED" : "CANCELLED",
          token,
        );
        if (data.action === "RESCHEDULE")
          await enqueue(tx, after, "REMINDER", token);
      }
      return { id: after.id, status: after.status, revision: after.revision };
    });
  } catch (e) {
    if (/23P01|40P01|P2034|deadlock|exclusion/i.test(String(e)))
      throw new AppError(409, "時段衝突，請重新選擇");
    throw e;
  }
}
export async function publicChange(token: string, input: unknown) {
  const b = await credential(token);
  const data = z
    .object({ action: z.enum(["CANCELLED", "RESCHEDULE"]) })
    .passthrough()
    .parse(input);
  return changeBooking(b.tenantId, { ...data, id: b.id }, token);
}
const rangeSchema = z.object({
  from: z.iso.date(),
  days: z.coerce.number().int().min(1).max(92).default(7),
  staffId: idSchema.optional(),
  serviceId: idSchema.optional(),
});
export async function calendar(tenantId: string, input: unknown) {
  const member = await access(tenantId);
  const q = rangeSchema.parse(input);
  const from = DateTime.fromISO(q.from, {
    zone: member.tenant.timezone,
  }).startOf("day");
  const scope = bookingScope(member);
  if (member.role === "STAFF" && q.staffId && q.staffId !== member.staffId)
    throw new AppError(403, "只能查看自己的工作資料");
  const where = {
    ...scope,
    ...(q.staffId ? { staffId: q.staffId } : {}),
    ...(q.serviceId ? { serviceId: q.serviceId } : {}),
    startAt: {
      gte: from.toJSDate(),
      lt: from.plus({ days: q.days }).toJSDate(),
    },
  };
  const [bookings, staff, services] = await Promise.all([
    db.booking.findMany({
      where,
      select: detailSelect,
      orderBy: { startAt: "asc" },
      take: 2001,
    }),
    db.staff.findMany({
      where: {
        tenantId,
        ...(member.role === "STAFF"
          ? { id: member.staffId ?? "__unassigned__" }
          : {}),
      },
      select: { id: true, name: true },
    }),
    db.service.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ]);
  if (bookings.length > 2000)
    throw new AppError(400, "資料過多，請縮小日期或員工篩選範圍");
  return { bookings, staff, services, timezone: member.tenant.timezone };
}
export async function statistics(tenantId: string, input: unknown) {
  const member = await access(tenantId);
  const q = rangeSchema.parse(input);
  const scope = bookingScope(member);
  const from = DateTime.fromISO(q.from, {
    zone: member.tenant.timezone,
  }).startOf("day");
  const today = DateTime.now().setZone(member.tenant.timezone).startOf("day");
  const rows = await db.booking.findMany({
    where: {
      ...scope,
      startAt: {
        gte: from.toJSDate(),
        lt: from.plus({ days: q.days }).toJSDate(),
      },
    },
    select: { startAt: true, status: true, serviceName: true, serviceId: true },
  });
  const [todayCount, upcoming] = await Promise.all([
    db.booking.count({
      where: {
        ...scope,
        startAt: {
          gte: today.toJSDate(),
          lt: today.plus({ days: 1 }).toJSDate(),
        },
      },
    }),
    db.booking.findMany({
      where: { ...scope, status: "CONFIRMED", startAt: { gte: new Date() } },
      select: detailSelect,
      orderBy: { startAt: "asc" },
      take: 10,
    }),
  ]);
  const trend = Array.from({ length: q.days }, (_, i) => ({
    date: from.plus({ days: i }).toISODate()!,
    count: 0,
  }));
  const services: Record<string, { name: string; count: number }> = {};
  for (const b of rows) {
    const day = DateTime.fromJSDate(b.startAt)
      .setZone(member.tenant.timezone)
      .toISODate();
    trend.find((t) => t.date === day)!.count++;
    services[b.serviceId] ??= { name: b.serviceName, count: 0 };
    services[b.serviceId].count++;
  }
  return {
    todayCount,
    total: rows.length,
    completed: rows.filter((b) => b.status === "COMPLETED").length,
    cancelled: rows.filter((b) => b.status === "CANCELLED").length,
    upcoming,
    services: Object.values(services),
    trend,
  };
}
export async function customers(tenantId: string, input: unknown) {
  const member = await access(tenantId);
  if (member.role === "STAFF") throw new AppError(403, "顧客名冊限管理者存取");
  const q = z
    .object({
      search: z.string().max(100).default(""),
      id: idSchema.optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(input);
  if (q.id) {
    const customer = await db.customer.findFirst({
      where: { id: q.id, tenantId },
    });
    if (!customer) throw new AppError(404, "找不到顧客");
    const where = { tenantId, customer: { email: customer.email } };
    const [count, history] = await Promise.all([
      db.booking.count({ where }),
      db.booking.findMany({
        where,
        select: detailSelect,
        orderBy: { startAt: "desc" },
        skip: (q.page - 1) * 50,
        take: 50,
      }),
    ]);
    return { customer, count, history, page: q.page };
  }
  // Anonymous submissions keep immutable contacts; group by normalized email within this tenant.
  const where = {
    tenantId,
    OR: ["name", "email", "phone"].map((key) => ({
      [key]: { contains: q.search, mode: "insensitive" as const },
    })),
  };
  const groups = await db.customer.groupBy({
    by: ["email"],
    where,
    orderBy: { email: "asc" },
    skip: (q.page - 1) * 50,
    take: 50,
  });
  return {
    page: q.page,
    customers: await Promise.all(
      groups.map(async (g) => {
        const customer = await db.customer.findFirstOrThrow({
          where: { tenantId, email: g.email },
          orderBy: { id: "asc" },
        });
        const count = await db.booking.count({
          where: { tenantId, customer: { email: g.email } },
        });
        return { ...customer, count };
      }),
    ),
  };
}
export async function members(tenantId: string) {
  owner(await access(tenantId));
  return db.membership.findMany({
    where: { tenantId },
    select: {
      id: true,
      role: true,
      staffId: true,
      user: { select: { name: true, email: true } },
    },
  });
}
export async function saveMember(tenantId: string, input: unknown) {
  const data = z
    .object({
      email: z.email().transform((v) => v.toLowerCase()),
      role: z.enum(["ADMIN", "STAFF"]),
      staffId: idSchema.nullable().default(null),
      remove: z.boolean().default(false),
    })
    .parse(input);
  return withLockedTenant(tenantId, async (tx) => {
    owner(await access(tenantId, tx));
    const user = await tx.user.findUnique({ where: { email: data.email } });
    if (!user) throw new AppError(400, "請成員先註冊帳號");
    const existing = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing?.role === "OWNER")
      throw new AppError(403, "不可在此變更擁有者");
    if (
      data.staffId &&
      !(await tx.staff.findFirst({ where: { id: data.staffId, tenantId } }))
    )
      throw new AppError(400, "無效的員工綁定");
    if (data.remove)
      await tx.membership.deleteMany({
        where: { tenantId, userId: user.id, role: { not: "OWNER" } },
      });
    else
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: {
          tenantId,
          userId: user.id,
          role: data.role,
          staffId: data.staffId,
        },
        update: { role: data.role, staffId: data.staffId },
      });
    return { ok: true };
  });
}
export async function saveSettings(tenantId: string, input: unknown) {
  const data = z
    .object({
      cancelCutoffMinutes: z.number().int().min(0).max(525600),
      rescheduleCutoffMinutes: z.number().int().min(0).max(525600),
    })
    .parse(input);
  return withLockedTenant(tenantId, async (tx) => {
    owner(await access(tenantId, tx));
    await tx.tenant.update({ where: { id: tenantId }, data });
    return { ok: true };
  });
}
export async function notificationPreview(tenantId: string) {
  owner(await access(tenantId));
  return db.notification.findMany({
    where: { tenantId },
    orderBy: { availableAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      body: true,
      status: true,
      attempts: true,
      lastError: true,
      availableAt: true,
      sentAt: true,
    },
  });
}

export async function rescheduleSlots(
  tenantId: string,
  id: string,
  input: unknown,
  token?: string,
) {
  const q = z
    .object({ date: z.iso.date(), serviceId: idSchema, staffId: idSchema })
    .parse(input);
  const member = token ? null : await access(tenantId);
  if (token) {
    const b = await credential(token);
    if (b.tenantId !== tenantId || b.id !== id)
      throw new AppError(404, "管理連結無效");
  }
  const b = await db.booking.findFirst({
    where: {
      ...(member
        ? bookingScope(member)
        : { tenantId, managementTokenHash: tokenHash(token!) }),
      id,
    },
  });
  if (!b) throw new AppError(404, "找不到預約");
  if (member?.role === "STAFF" && q.staffId !== member.staffId)
    throw new AppError(403, "只能操作自己的工作資料");
  return slotsFor(
    await schedulingContext(tenantId),
    q.serviceId,
    q.staffId,
    q.date,
    undefined,
    undefined,
    id,
  );
}
export async function publicSlots(token: string, input: unknown) {
  const b = await credential(token);
  return rescheduleSlots(b.tenantId, b.id, input, token);
}
