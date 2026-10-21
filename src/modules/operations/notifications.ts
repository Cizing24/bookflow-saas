import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { db } from "@/lib/db";
import type { Prisma, Booking } from "@/generated/prisma/client";
import { withLockedTenant } from "@/modules/booking/repository";
export interface EmailMessage {
  id: string;
  recipient: string;
  subject: string;
  body: string;
}
export interface EmailProvider {
  send(message: EmailMessage): Promise<"SENT" | "PREVIEWED">;
}
export function emailProvider(): EmailProvider {
  if (
    process.env.EMAIL_PROVIDER === "preview" &&
    process.env.NODE_ENV !== "production"
  )
    return {
      async send() {
        return "PREVIEWED";
      },
    };
  return {
    async send(message) {
      const endpoint = process.env.EMAIL_HTTP_URL;
      const key = process.env.EMAIL_HTTP_TOKEN;
      if (
        process.env.EMAIL_PROVIDER !== "http" ||
        !endpoint?.startsWith("https://") ||
        !key ||
        !process.env.EMAIL_FROM
      )
        throw new Error("EMAIL_CONFIGURATION_REQUIRED");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "Idempotency-Key": message.id,
        },
        body: JSON.stringify({
          id: message.id,
          recipient: message.recipient,
          subject: message.subject,
          body: message.body,
          from: process.env.EMAIL_FROM,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("EMAIL_PROVIDER_REJECTED");
      return "SENT";
    },
  };
}
export function bookingSnapshot(b: Booking) {
  return {
    status: b.status,
    startAt: b.startAt.toISOString(),
    endAt: b.endAt.toISOString(),
    serviceId: b.serviceId,
    staffId: b.staffId,
    serviceName: b.serviceName,
    price: b.price,
    revision: b.revision,
  };
}
export async function recordEvent(
  tx: Prisma.TransactionClient,
  b: Booking,
  actor: string,
  action: string,
  before?: Booking,
) {
  await tx.bookingEvent.create({
    data: {
      tenantId: b.tenantId,
      bookingId: b.id,
      actor,
      action,
      before: before ? bookingSnapshot(before) : undefined,
      after: bookingSnapshot(b),
    },
  });
}
export async function enqueue(
  tx: Prisma.TransactionClient,
  b: Booking,
  kind: string,
  managementToken?: string,
) {
  const customer = await tx.customer.findUniqueOrThrow({
    where: { tenantId_id: { tenantId: b.tenantId, id: b.customerId } },
  });
  const tenant = await tx.tenant.findUniqueOrThrow({
    where: { id: b.tenantId },
  });
  const labels: Record<string, string> = {
    CONFIRMED: "預約成立",
    CANCELLED: "預約取消",
    RESCHEDULED: "預約改期",
    REMINDER: "預約提醒",
  };
  const subject = `${tenant.name}：${labels[kind]}`;
  const body = `${subject}\n${b.serviceName}\n${DateTime.fromJSDate(b.startAt).setZone(tenant.timezone).toFormat("yyyy-MM-dd HH:mm ZZ")} (${tenant.timezone})\n${managementToken ? new URL("/manage#" + managementToken, process.env.BETTER_AUTH_URL!).toString() : "請使用原預約管理連結，或聯絡店家。"}`;
  const availableAt =
    kind === "REMINDER"
      ? new Date(Math.max(Date.now(), b.startAt.getTime() - 86400000))
      : new Date();
  await tx.notification.create({
    data: {
      tenantId: b.tenantId,
      bookingId: b.id,
      revision: b.revision,
      kind,
      recipient: customer.email,
      subject,
      body,
      availableAt,
    },
  });
}
// At-least-once delivery: provider must deduplicate Idempotency-Key for crash recovery.
export async function dispatchNotifications(
  provider: EmailProvider = emailProvider(),
  limit = 50,
  tenantId: string | null = null,
) {
  let processed = 0;
  for (let i = 0; i < Math.min(100, limit); i++) {
    const leaseToken = randomUUID();
    const jobs = await db.$queryRaw<
      { id: string; tenantId: string }[]
    >`UPDATE "Notification" SET status='PROCESSING', "leaseUntil"=now()+interval '2 minutes', "leaseToken"=${leaseToken} WHERE id=(SELECT id FROM "Notification" WHERE ((status='PENDING' AND "availableAt"<=now()) OR (status='PROCESSING' AND "leaseUntil"<now())) AND (${tenantId}::text IS NULL OR "tenantId"=${tenantId}) ORDER BY "availableAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,"tenantId"`;
    if (!jobs.length) break;
    const job = jobs[0];
    await withLockedTenant(job.tenantId, async (tx) => {
      const n = await tx.notification.findFirst({
        where: { id: job.id, status: "PROCESSING", leaseToken },
        include: { booking: true },
      });
      if (!n) return;
      if (
        n.revision !== n.booking.revision ||
        (n.kind === "REMINDER" &&
          (n.booking.status !== "CONFIRMED" || n.booking.startAt <= new Date()))
      ) {
        await tx.notification.update({
          where: { id: n.id },
          data: { status: "SKIPPED", leaseUntil: null, leaseToken: null },
        });
        return;
      }
      try {
        const status = await provider.send({
          id: n.id,
          recipient: n.recipient,
          subject: n.subject,
          body: n.body,
        });
        await tx.notification.update({
          where: { id: n.id },
          data: {
            status,
            attempts: { increment: 1 },
            sentAt: status === "SENT" ? new Date() : null,
            lastError: null,
            leaseUntil: null,
            leaseToken: null,
          },
        });
      } catch {
        // Persist a fixed code; provider errors may contain credentials or PII.
        await tx.notification.update({
          where: { id: n.id },
          data: {
            status: "PENDING",
            attempts: { increment: 1 },
            availableAt: new Date(
              Date.now() +
                Math.min(3600000, 30000 * 2 ** Math.min(n.attempts, 7)),
            ),
            lastError: "DELIVERY_FAILED_CHECK_PROVIDER",
            leaseUntil: null,
            leaseToken: null,
          },
        });
      }
    });
    processed++;
  }
  return { processed };
}
