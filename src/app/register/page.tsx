import { AuthForm } from "@/components/auth-form";
import Link from "next/link";
import { isPublicDemo } from "@/lib/demo";
export default function Page() {
  if (isPublicDemo())
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">公開 Demo 不開放註冊</h1>
        <p className="my-4">
          請勿輸入真實個資。你可以使用合成資料完成預約，店家管理由操作者提供受控展示身分。
        </p>
        <Link
          className="font-semibold text-teal-700 underline"
          href="/b/flow-studio"
        >
          體驗合成預約
        </Link>
      </main>
    );
  return <AuthForm register />;
}
