import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { AppError } from "@/modules/shared/errors";
// Shared PostgreSQL counters. Do not trust user-controlled forwarding headers.
export async function rateLimit(request: Request, scope: string, limit = 120) {
  const ip =
    process.env.TRUST_PROXY_IP === "true"
      ? (request.headers.get("x-real-ip") ?? "unknown")
      : "shared";
  const key = createHash("sha256")
    .update(scope + ":" + ip)
    .digest("hex");
  const rows = await db.$queryRaw<
    { count: number }[]
  >`INSERT INTO "RateLimit" (key, count, "expiresAt") VALUES (${key},1,now()+interval '1 minute') ON CONFLICT (key) DO UPDATE SET count = CASE WHEN "RateLimit"."expiresAt" <= now() THEN 1 ELSE "RateLimit".count + 1 END, "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN now()+interval '1 minute' ELSE "RateLimit"."expiresAt" END RETURNING count`;
  if (rows[0].count > limit)
    throw new AppError(429, "請求過於頻繁，請稍候一分鐘再試");
}
