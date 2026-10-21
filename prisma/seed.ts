import "dotenv/config";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
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
console.log(
  "Seed ready:",
  email,
  "/b/" + tenant.slug,
  "(password supplied via SEED_PASSWORD; existing credentials are not reset)",
);
await db.$disconnect();
