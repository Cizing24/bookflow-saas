"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">暫時無法載入</h1>
      <p className="my-5 text-slate-500">請確認網路連線後再試一次。</p>
      <Button onClick={reset}>重新載入</Button>
    </main>
  );
}
