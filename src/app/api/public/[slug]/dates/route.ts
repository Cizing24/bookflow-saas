import { respond } from "@/lib/http";
import { availableDates } from "@/modules/booking/service";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return respond(async () => {
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
