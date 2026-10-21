export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  }).catch(() => {
    throw new Error("無法連線，請確認網路後重試。");
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "請求失敗");
  return data as T;
}
