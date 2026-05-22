import { create } from "zustand";

type Toast = { id: number; text: string; kind: "info" | "error" | "ok" };
type Store = {
  toasts: Toast[];
  push: (text: string, kind?: Toast["kind"]) => void;
  remove: (id: number) => void;
};

export const useToasts = create<Store>((set, get) => ({
  toasts: [],
  push: (text, kind = "info") => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text, kind }] });
    setTimeout(() => get().remove(id), 4000);
  },
  remove: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function ToastViewport() {
  const toasts = useToasts((s) => s.toasts);
  const remove = useToasts((s) => s.remove);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`rounded-lg border px-4 py-2 text-sm shadow-lg cursor-pointer ${
            t.kind === "error"
              ? "bg-red-950 border-red-700 text-red-100"
              : t.kind === "ok"
              ? "bg-emerald-950 border-emerald-700 text-emerald-100"
              : "bg-zinc-900 border-zinc-700 text-zinc-100"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
