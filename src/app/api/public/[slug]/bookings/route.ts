import { respond, sameOrigin } from "@/lib/http";
import { createBooking } from "@/modules/booking/service";
export async function POST(
  r: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return respond(async () => {
    sameOrigin(r);
    return createBooking((await params).slug, await r.json());
  });
}
