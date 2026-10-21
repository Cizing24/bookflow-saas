"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useHydrated } from "@/lib/use-hydrated";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
export function AuthForm({ register = false }: { register?: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const data = {
        email: String(f.get("email")),
        password: String(f.get("password")),
      };
      const result = register
        ? await authClient.signUp.email({
            ...data,
            name: String(f.get("name")),
          })
        : await authClient.signIn.email(data);
      if (result.error) {
        setError(
          result.error.status === 429
            ? "操作次數過多，請稍候再試。"
            : register
              ? "註冊失敗，請檢查資料或使用其他 Email。"
              : "登入失敗，請確認 Email 與密碼。",
        );
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("連線失敗，請稍後重試。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-9 flex items-center justify-center gap-2 text-2xl font-bold"
        >
          <CalendarDays className="text-teal-700" />
          BookFlow
        </Link>
        <Card className="p-8">
          <p className="text-xs font-bold tracking-widest text-teal-700">
            WELCOME TO YOUR FLOW
          </p>
          <h1 className="mt-3 text-2xl font-bold">
            {register ? "開始你的從容經營" : "很高興再次見到你"}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {register
              ? "建立帳號，打造專屬店家的預約空間。"
              : "登入以管理店家、服務與預約。"}
          </p>
          <form onSubmit={submit} className="mt-8">
            <fieldset disabled={!hydrated || busy} className="space-y-5">
              {register && (
                <label>
                  姓名
                  <Input
                    name="name"
                    required
                    maxLength={80}
                    autoComplete="name"
                  />
                </label>
              )}
              <label>
                Email
                <Input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                密碼
                <Input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete={register ? "new-password" : "current-password"}
                />
              </label>
              {register && (
                <p className="text-xs text-slate-500">
                  請使用至少 10 個字元的密碼。
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button disabled={busy} className="w-full">
                {busy ? "處理中…" : register ? "建立帳號" : "登入"}
                <ArrowRight size={16} />
              </Button>
            </fieldset>
          </form>
          <p className="mt-6 text-center text-sm text-slate-500">
            {register ? "已經有帳號？" : "第一次使用？"}{" "}
            <Link
              className="font-semibold text-teal-700"
              href={register ? "/login" : "/register"}
            >
              {register ? "前往登入" : "建立帳號"}
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
