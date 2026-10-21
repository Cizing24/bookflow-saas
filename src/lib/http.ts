import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/modules/shared/errors";
export async function respond(fn: () => Promise<unknown>) {
  const response = await execute(fn);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
async function execute(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn(), {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "無效的 JSON 請求" }, { status: 400 });
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "資料格式不正確，請檢查欄位" },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.status === 429 ? { "Retry-After": "60" } : {}),
          },
        },
      );
    if (typeof error === "object" && error && "code" in error) {
      if (error.code === "P2002")
        return NextResponse.json(
          { error: "此 Slug 或資料已存在" },
          { status: 409 },
        );
      if (error.code === "P2025")
        return NextResponse.json({ error: "找不到指定資料" }, { status: 404 });
    }
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "Unknown",
    );
    return NextResponse.json(
      { error: "系統暫時無法處理，請稍後再試" },
      { status: 500 },
    );
  }
}
export async function readJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AppError(415, "請使用 JSON 格式");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "缺少請求內容");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new AppError(413, "請求內容過大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
export function sameOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL!).origin
  )
    throw new AppError(403, "不允許此來源的請求");
}
