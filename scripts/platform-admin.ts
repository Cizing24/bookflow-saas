import "dotenv/config";
import { db } from "../src/lib/db";
const [action, email] = process.argv.slice(2);
if (!["grant", "revoke"].includes(action) || !email)
  throw new Error(
    "Usage: npm run platform:admin -- grant|revoke registered-email",
  );
try {
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { email: email.toLowerCase() },
    });
    if (action === "grant")
      await tx.platformAdmin.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      });
    else await tx.platformAdmin.deleteMany({ where: { userId: user.id } });
    await tx.platformEvent.create({
      data: {
        actorId: "CLI_OPERATOR",
        action: action === "grant" ? "ADMIN_GRANTED" : "ADMIN_REVOKED",
        reason: `Target user ID: ${user.id}`,
      },
    });
  });
  console.info("Platform privilege updated and audited.");
} finally {
  await db.$disconnect();
}
