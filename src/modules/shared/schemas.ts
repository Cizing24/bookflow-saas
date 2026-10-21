import { z } from "zod";
import { DateTime, IANAZone } from "luxon";
export const tenantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(50),
  timezone: z
    .string()
    .refine((z) => IANAZone.isValidZone(z), "無效的 IANA 時區"),
});
export const serviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().int().min(0).max(10000000),
  durationMinutes: z.number().int().min(15).max(480).multipleOf(15),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  active: z.boolean().default(true),
});
export const staffSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().default(true),
});
export const bookingSchema = z.object({
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{16,128}$/)
    .optional(),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  startAt: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1).max(80),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{7,25}$/),
});
export const hoursSchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        openMinute: z.number().int().min(0).max(1439).multipleOf(30),
        closeMinute: z.number().int().min(30).max(1440).multipleOf(30),
      })
      .refine((h) => h.openMinute < h.closeMinute),
  )
  .max(7)
  .refine((h) => new Set(h.map((x) => x.weekday)).size === h.length);

const intervalSchema = z
  .object({
    openMinute: z.number().int().min(0).max(1439),
    closeMinute: z.number().int().min(1).max(1440),
  })
  .refine((h) => h.openMinute < h.closeMinute);
export const scheduleSchema = z
  .object({
    staffId: z.string().min(1),
    customSchedule: z.boolean(),
    serviceIds: z
      .array(z.string().min(1))
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
    schedule: z
      .array(
        intervalSchema.safeExtend({
          weekday: z.number().int().min(0).max(6),
          kind: z.enum(["WORK", "BREAK"]),
        }),
      )
      .max(100),
    absences: z
      .array(
        intervalSchema.safeExtend({
          date: z
            .string()
            .refine(
              (s) =>
                /^\d{4}-\d{2}-\d{2}$/.test(s) && DateTime.fromISO(s).isValid,
              "無效日期",
            ),
          reason: z.string().trim().max(200).default(""),
        }),
      )
      .max(366),
  })
  .refine(
    (data) =>
      !data.schedule.some((a, i) =>
        data.schedule.some(
          (b, j) =>
            j > i &&
            a.weekday === b.weekday &&
            a.kind === b.kind &&
            a.openMinute < b.closeMinute &&
            b.openMinute < a.closeMinute,
        ),
      ),
    "同類班段不得重疊",
  );
export const policySchema = z.object({
  minNoticeMinutes: z.number().int().min(0).max(525600),
  maxAdvanceDays: z.number().int().min(1).max(365),
  slotIntervalMinutes: z.number().int().min(5).max(120),
});
