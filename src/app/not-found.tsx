import Link from "next/link";
export default function NotFound() {
  return (
    <main className="p-20 text-center">
      <h1 className="text-2xl font-bold">找不到此頁面</h1>
      <p className="my-5">請確認網址或店家 Slug 是否正確。</p>
      <Link href="/" className="text-teal-700 underline">
        回到首頁
      </Link>
    </main>
  );
}
