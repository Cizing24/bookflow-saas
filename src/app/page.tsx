import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ShieldCheck,
  Users,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <CalendarDays className="text-teal-700" />
          BookFlow
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm">
            登入
          </Link>
          <Button asChild>
            <Link href="/register">
              免費開始 <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl gap-14 px-6 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <p className="mb-6 text-xs font-semibold tracking-[.22em] text-teal-700">
            LESS ADMIN. MORE FLOW.
          </p>
          <h1 className="text-5xl leading-tight font-bold tracking-tight lg:text-6xl">
            讓預約井然有序，
            <br />
            <span className="text-teal-700">把時間留給服務。</span>
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-slate-500">
            從顧客選擇時段，到你掌握每一天。BookFlow
            將預約、服務與團隊整合在一起，讓日常經營更從容。
          </p>
          <Button asChild className="mt-9">
            <Link href="/register">
              建立我的店家 <ArrowRight size={16} />
            </Link>
          </Button>
          <p className="mt-5 text-sm text-slate-500">
            專屬預約網址 · 不需顧客註冊 · 即時防止撞期
          </p>
        </div>
        <div className="relative rounded-3xl bg-teal-900 p-8 text-white lg:mt-3">
          <div className="mb-16 flex items-center justify-between">
            <span className="rounded-full border border-teal-700 px-3 py-1 text-xs">
              YOUR DAY, IN FLOW
            </span>
            <CalendarDays size={26} />
          </div>
          <h2 className="text-3xl leading-relaxed font-semibold">
            每個時段，
            <br />
            都有剛好的安排。
          </h2>
          <div className="mt-10 space-y-3">
            {[
              [CalendarDays, "預約管理", "顧客自行選擇，預約即時入列"],
              [Users, "團隊協作", "清楚掌握每位人員的預約"],
              [ShieldCheck, "安心經營", "獨立店家資料與安全登入"],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof Check;
              return (
                <div
                  key={String(title)}
                  className="flex gap-4 rounded-xl bg-white/10 p-4"
                >
                  <I size={22} className="mt-1 text-teal-300" />
                  <div>
                    <h3 className="font-semibold">{String(title)}</h3>
                    <p className="mt-1 text-sm text-teal-100/75">
                      {String(body)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-xs text-teal-200/60">
            以實際店家設定與即時可用時段為準
          </p>
        </div>
      </section>
      <footer className="mx-auto max-w-6xl border-t border-slate-200 px-6 py-6 text-sm text-slate-500">
        BookFlow — 為每一次用心服務，留好時間。
      </footer>
    </main>
  );
}
