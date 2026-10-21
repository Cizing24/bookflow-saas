import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await db.$queryRaw`SELECT "active" FROM "Tenant" LIMIT 1`;
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error(JSON.stringify({ event: "health_failed" }));
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
