import "dotenv/config";
import { dispatchNotifications } from "../src/modules/operations/notifications";
import { db } from "../src/lib/db";
try {
  console.info(await dispatchNotifications());
  await db.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
  });
} finally {
  await db.$disconnect();
}
