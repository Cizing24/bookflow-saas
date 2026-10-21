import { respond, sameOrigin } from "@/lib/http";
import { AppError } from "@/modules/shared/errors";
import { createBooking } from "@/modules/booking/service";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return respond(async () => {
    sameOrigin(r);
    const body = await r.json();
    const key = r.headers.get("Idempotency-Key");
    if (key && body && typeof body === "object") {
      if (body.idempotencyKey && body.idempotencyKey !== key)
        throw new AppError(400, "重試識別碼不一致");
      body.idempotencyKey = key;
    }
    return createBooking((await params).slug, body);
  });
}
