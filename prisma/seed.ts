import "dotenv/config";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import {
  availableDates,
  availableSlots,
  createBooking,
} from "../src/modules/booking/service";
if (process.env.NODE_ENV === "production")
  throw new Error("Demo seed is restricted to development/test databases.");
const email = "owner@bookflow.local";
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10)
  throw new Error("Set SEED_PASSWORD (at least 10 characters) before seeding.");
let user = await db.user.findUnique({ where: { email } });
if (!user) {
  await auth.api.signUpEmail({ body: { name: "示範店長", email, password } });
  user = await db.user.findUniqueOrThrow({ where: { email } });
}
const existed = await db.tenant.findUnique({ where: { slug: "flow-studio" } });
const tenant = await db.tenant.upsert({
  where: { slug: "flow-studio" },
  update: {},
  create: {
    name: "沐光工作室（示範）",
    slug: "flow-studio",
    timezone: "Asia/Taipei",
    memberships: { create: { userId: user.id, role: "OWNER" } },
    hours: {
      create: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        openMinute: 540,
        closeMinute: 1080,
      })),
    },
    services: {
      create: [
        { name: "深層放鬆護理", price: 1200, durationMinutes: 60 },
        { name: "日常修護", price: 800, durationMinutes: 30 },
      ],
    },
    staff: { create: [{ name: "小沐" }, { name: "阿光" }] },
  },
});
if (!existed) {
  const services = await db.service.findMany({
    where: { tenantId: tenant.id },
  });
  const staff = await db.staff.findMany({ where: { tenantId: tenant.id } });
  await db.staffService.createMany({
    data: staff.flatMap((s) =>
      services.map((v) => ({
        tenantId: tenant.id,
        staffId: s.id,
        serviceId: v.id,
      })),
    ),
    skipDuplicates: true,
  });
}
if (process.env.SEED_DEMO_BOOKINGS === "true") {
  const service = await db.service.findFirstOrThrow({
    where: { tenantId: tenant.id, active: true },
  });
  const staff = await db.staff.findFirstOrThrow({
    where: {
      tenantId: tenant.id,
      active: true,
      services: { some: { serviceId: service.id } },
    },
  });
  const dates = await availableDates(tenant.slug, service.id, staff.id);
  for (let i = 0; i < Math.min(3, dates.length); i++) {
    const slots = await availableSlots(
      tenant.slug,
      service.id,
      staff.id,
      dates[i],
    );
    if (!slots.length) continue;
    const idempotencyKey = `demo-seed-booking-${i}`;
    if (
      await db.booking.findUnique({
        where: {
          tenantId_idempotencyKey: { tenantId: tenant.id, idempotencyKey },
        },
      })
    )
      continue;
    await createBooking(tenant.slug, {
      serviceId: service.id,
      staffId: staff.id,
      startAt: slots[0],
      name: `示範顧客 ${i + 1}（合成）`,
      email: `demo-${i + 1}@example.com`,
      phone: "0900000000",
      idempotencyKey,
    });
  }
}
console.log(
  "Seed ready:",
  email,
  "/b/" + tenant.slug,
  "(password supplied via SEED_PASSWORD; existing credentials are not reset)",
);
await db.$disconnect();
