import "dotenv/config";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";

const target = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  process.env.DEPLOYMENT_ENV !== "public-demo" ||
  process.env.DEMO_PROVISION_CONFIRM !== "CREATE_SYNTHETIC_DEMO" ||
  !process.env.DEMO_DATABASE_HOST ||
  target.hostname !== process.env.DEMO_DATABASE_HOST ||
  target.pathname !== "/bookflow_demo" ||
  !process.env.BETTER_AUTH_URL?.startsWith("https://")
)
  throw new Error(
    "Provisioning requires the explicitly identified HTTPS public-demo database.",
  );
const password = process.env.DEMO_OWNER_PASSWORD;
if (!password || password.length < 24 || password.startsWith("REPLACE_"))
  throw new Error(
    "Provide a private random owner password of at least 24 characters.",
  );
try {
  const identity = await db.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  if (identity[0]?.name !== "bookflow_demo")
    throw new Error("Database identity mismatch.");
  if (await db.tenant.count())
    throw new Error(
      "Provisioning refuses an existing dataset; it never resets data.",
    );
  const email = "owner@bookflow.example.test";
  // The CLI uses the same password hashing contract; public HTTP signup stays blocked.
  if (!(await db.user.findUnique({ where: { email } })))
    await auth.api.signUpEmail({
      body: { name: "合成示範店長", email, password },
    });
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261114)`;
    if (await tx.tenant.count())
      throw new Error("Demo dataset already exists.");
    const tenant = await tx.tenant.create({
      data: {
        name: "沐光工作室（合成 Demo）",
        slug: "flow-studio",
        timezone: "Asia/Taipei",
        maxAdvanceDays: 14,
        cancelCutoffMinutes: 0,
        rescheduleCutoffMinutes: 0,
        memberships: { create: { userId: user.id, role: "OWNER" } },
        hours: {
          create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            weekday,
            openMinute: 540,
            closeMinute: 1080,
          })),
        },
        services: {
          create: [{ name: "合成放鬆服務", price: 0, durationMinutes: 30 }],
        },
        staff: { create: [{ name: "合成人員 A" }, { name: "合成人員 B" }] },
      },
      include: { services: true, staff: true },
    });
    await tx.staffService.createMany({
      data: tenant.staff.flatMap((staff) =>
        tenant.services.map((service) => ({
          tenantId: tenant.id,
          staffId: staff.id,
          serviceId: service.id,
        })),
      ),
    });
    await tx.platformEvent.create({
      data: {
        actorId: user.id,
        tenantId: tenant.id,
        action: "PUBLIC_DEMO_PROVISIONED",
        reason: "Synthetic-only isolated demo provisioning",
        before: false,
        after: true,
      },
    });
  });
  console.log(
    "Synthetic demo provisioned at /b/flow-studio. Private credentials are never printed.",
  );
} finally {
  await db.$disconnect();
}
