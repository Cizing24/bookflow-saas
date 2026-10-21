export default function Loading() {
  return (
    <div
      role="status"
      className="flex min-h-screen items-center justify-center gap-3 text-slate-500"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      載入中…
    </div>
  );
}
