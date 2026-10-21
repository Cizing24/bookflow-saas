import { respond } from "@/lib/http";
import { overview } from "@/modules/tenant/service";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  return respond(async () => overview((await params).tenantId));
}
