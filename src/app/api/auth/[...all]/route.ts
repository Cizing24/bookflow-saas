import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { rateLimit } from "@/modules/operations/rate-limit";
import { respond, sameOrigin } from "@/lib/http";
import { isPublicDemo } from "@/lib/demo";
const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;
export async function POST(request: Request) {
  if (
    isPublicDemo() &&
    new URL(request.url).pathname.startsWith("/api/auth/sign-up/")
  )
    return Response.json(
      { message: "公開 Demo 不開放註冊，請使用操作者提供的受控身分。" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  // Shared guard supplements Better Auth's stricter process-local endpoint limits.
  const guard = await respond(async () => {
    sameOrigin(request);
    await rateLimit(request, "auth-write", 60);
    return { ok: true };
  });
  if (!guard.ok) return guard;
  return handlers.POST(request);
}
