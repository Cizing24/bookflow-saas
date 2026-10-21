import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { rateLimit } from "@/modules/operations/rate-limit";
import { respond, sameOrigin } from "@/lib/http";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  // Shared guard supplements Better Auth's stricter process-local endpoint limits.
  const guard = await respond(async () => {
    sameOrigin(request);
    await rateLimit(request, "auth-write", 60);
    return { ok: true };
  });
  if (!guard.ok) return guard;
  return handlers.POST(request);
}
