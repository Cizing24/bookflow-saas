import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/modules/shared/errors";
export async function respond(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
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
        { status: error.status },
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
export function sameOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL!).origin
  )
    throw new AppError(403, "不允許此來源的請求");
}
