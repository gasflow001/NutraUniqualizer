const BASE = ""; // относительные пути — vite proxy в dev, тот же origin в prod

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  const ct = r.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? r.json() : r.text()) as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: async <T>(path: string, form: FormData): Promise<T> => {
    const r = await fetch(BASE + path, { method: "POST", body: form });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
    return r.json() as Promise<T>;
  },
};

export function wsUrl(path: string): string {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  // В dev (vite :5173) идём напрямую на backend, чтобы не зависеть
  // от vite ws-proxy, который иногда конфликтует с HMR-каналом.
  if (import.meta.env.DEV) {
    // .trim() — Windows-bat ловушка: "set VAR=value &&" даёт значение с trailing space.
    const port = String((import.meta as any).env.VITE_BACKEND_PORT || "8000").trim();
    return `${proto}//${loc.hostname}:${port}${path.trim()}`;
  }
  return `${proto}//${loc.host}${path.trim()}`;
}
