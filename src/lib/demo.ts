import { AppError } from "@/modules/shared/errors";

export const syntheticContact = {
  name: "合成訪客",
  email: "visitor@example.test",
  phone: "0000000000",
} as const;

export function isPublicDemo() {
  return process.env.DEPLOYMENT_ENV === "public-demo";
}

export function assertDemoContact(contact: {
  name: string;
  email: string;
  phone: string;
}) {
  if (
    isPublicDemo() &&
    Object.entries(syntheticContact).some(
      ([key, value]) => contact[key as keyof typeof syntheticContact] !== value,
    )
  )
    throw new AppError(
      400,
      "公開 Demo 只接受畫面提供的合成聯絡資料，請勿填寫真實個資。",
    );
}
