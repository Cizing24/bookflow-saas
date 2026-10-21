import { z } from "zod";
import { IANAZone } from "luxon";
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
  active: z.boolean().default(true),
});
export const staffSchema = z.object({
  name: z.string().trim().min(1).max(80),
  active: z.boolean().default(true),
});
export const bookingSchema = z.object({
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
