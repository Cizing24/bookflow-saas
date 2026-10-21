import { rateLimit } from "@/modules/operations/rate-limit";
import { respond } from "@/lib/http";
import { availableDates } from "@/modules/booking/service";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return respond(async () => {
    await rateLimit(r, "public-dates", 240);
    const q = new URL(r.url).searchParams;
    return {
      dates: await availableDates(
        (await params).slug,
        q.get("serviceId") ?? "",
        q.get("staffId") ?? "",
      ),
    };
  });
}
