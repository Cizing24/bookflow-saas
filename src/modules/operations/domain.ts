import { AppError } from "@/modules/shared/errors";
export type Status = "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
export function assertTransition(
  from: Status,
  to: Status,
  startAt: Date,
  endAt: Date,
  now = new Date(),
) {
  if (from !== "CONFIRMED" || to === "CONFIRMED")
    throw new AppError(409, "此預約狀態不允許此操作");
  if (
    (to === "COMPLETED" && now < endAt) ||
    (to === "NO_SHOW" && now < startAt)
  )
    throw new AppError(409, "尚未到可標記時間");
}
export function assertCutoff(startAt: Date, minutes: number, now = new Date()) {
  if (startAt.getTime() - now.getTime() <= minutes * 60000)
    throw new AppError(409, "已超過自助異動截止時間，請聯絡店家");
}
