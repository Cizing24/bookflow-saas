import { z } from "zod";
import { respond, sameOrigin } from "@/lib/http";
import {
  publicDetail,
  publicChange,
  publicSlots,
} from "@/modules/operations/service";
import { rateLimit } from "@/modules/operations/rate-limit";
export async function POST(r: Request) {
  return respond(async () => {
    sameOrigin(r);
    await rateLimit(r, "self-management", 60);
    const { token, mode, ...data } = z
      .object({
        token: z.string(),
        mode: z.enum(["detail", "slots"]).optional(),
      })
      .passthrough()
      .parse(await r.json());
    if (mode === "detail") return publicDetail(token);
    if (mode === "slots") return publicSlots(token, data);
    return publicChange(token, data);
  });
}
