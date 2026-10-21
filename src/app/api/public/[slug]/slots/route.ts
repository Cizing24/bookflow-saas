import { respond } from "@/lib/http";
import { availableSlots } from "@/modules/booking/service";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return respond(async () => {
    const q = new URL(r.url).searchParams;
    return {
      slots: await availableSlots(
        (await params).slug,
        q.get("serviceId") ?? "",
        q.get("staffId") ?? "",
        q.get("date") ?? "",
      ),
    };
  });
}
