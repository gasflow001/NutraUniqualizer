import { useEffect, useRef, useState } from "react";
import { api, wsUrl } from "../../api/client";
import { useWizard, Variant } from "../../store/wizard";
import { useToasts } from "../Toast";
import ModelToggle from "../ModelToggle";

type GenResponse = {
  variants: Variant[];
  model: string;
  warning?: string | null;
  errors?: string[];
};

type LogLine = { text: string; ts: number };

export default function Step5Generate() {
  const { projectId, step5, setStep5, setStep } = useWizard();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    if (!projectId) return;
    const ws = new WebSocket(wsUrl(`/api/projects/${projectId}/step5/progress`));
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "request") {
          setPhase(`Отправлен запрос #${data.index}`);
          setLog((l) => [...l, { text: `→ Запрос ${data.index}`, ts: Date.now() }]);
        } else if (data.type === "image") {
          setPhase(`Получена картинка #${data.index}`);
          setLog((l) => [...l, { text: `✓ Получена ${data.index}`, ts: Date.now() }]);
        } else if (data.type === "done") {
          setDone((d) => d + 1);
          setPhase(`Сохранена #${data.index}`);
          setLog((l) => [...l, { text: `💾 Сохранена ${data.index}`, ts: Date.now() }]);
        } else if (data.type === "error") {
          setLog((l) => [
            ...l,
            { text: `⚠ #${data.index ?? "?"}: ${data.message}`, ts: Date.now() },
          ]);
        } else if (data.type === "complete") {
          setPhase("✅ Генерация завершена!");
          setLog((l) => [...l, { text: `✅ Готово ${data.count}`, ts: Date.now() }]);
        }
      } catch {}
    };
    return () => ws.close();
  }, [projectId]);

  const generate = async () => {
    if (!projectId) return;
    setBusy(true);
    setDone(0);
    setLog([]);
    setPhase("Подготовка промта и загрузка референсов...");
    startTimer();
    try {
      const res = await api.post<GenResponse>(
        `/api/projects/${projectId}/step5/generate`,
        {
          n_variants: step5.nVariants,
          model: step5.model,
          aspect_ratio:
            step5.aspectRatio === "4:5"
              ? "IMAGE_ASPECT_RATIO_PORTRAIT"
              : "IMAGE_ASPECT_RATIO_SQUARE",
        }
      );
      setStep5({ variants: res.variants });
      if (res.warning) push(res.warning, "info");
      if (res.errors && res.errors.length) {
        res.errors.forEach((e) => push(e, "error"));
      } else {
        push(`Готово: ${res.variants.length}`, "ok");
      }
    } catch (e) {
      push(String(e), "error");
    } finally {
      setBusy(false);
      stopTimer();
    }
  };

  const progressPct = busy
    ? Math.min(((done / step5.nVariants) * 100), 100)
    : 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}м ${sec.toString().padStart(2, "0")}с` : `${sec}с`;
  };

  return (
    <div className="grid gap-4">
      <div className="card grid sm:grid-cols-3 gap-4 items-end">
        <div>
          <label className="text-xs text-zinc-400 block mb-1">
            Вариантов: <span className="text-white font-semibold">{step5.nVariants}</span>
          </label>
          <input
            type="range"
            min={1}
            max={10}
            value={step5.nVariants}
            onChange={(e) => setStep5({ nVariants: Number(e.target.value) })}
            className="w-full accent-primary"
            disabled={busy}
          />
          <p className="text-[10px] text-zinc-500 mt-1">≈ {step5.nVariants * 30}с</p>
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Модель</label>
          <ModelToggle value={step5.model} onChange={(m) => setStep5({ model: m })} />
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Соотношение</label>
          <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
            {(["1:1", "4:5"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setStep5({ aspectRatio: a })}
                disabled={busy}
                className={
                  step5.aspectRatio === a
                    ? "flex-1 px-2 py-1.5 text-xs rounded-md bg-primary text-primary-foreground"
                    : "flex-1 px-2 py-1.5 text-xs rounded-md text-zinc-400 hover:text-white"
                }
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button className="btn-primary" disabled={busy} onClick={generate}>
        {busy ? (
          <span className="flex items-center gap-2 justify-center">
            <span
              className="inline-block w-4 h-4 border-2 border-transparent border-t-current rounded-full"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
            Генерация... {done}/{step5.nVariants}
          </span>
        ) : (
          "🚀 Сгенерировать"
        )}
      </button>

      {/* === Live progress panel === */}
      {busy && (
        <div className="card flex flex-col gap-3">
          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${Math.max(progressPct, 3)}%`,
                background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                animation: progressPct < 100 ? "pulse 2s ease-in-out infinite" : "none",
              }}
            />
          </div>

          {/* Status row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full bg-primary"
                style={{ animation: "pulse 1.5s ease-in-out infinite" }}
              />
              <span className="text-sm text-zinc-300">{phase}</span>
            </div>
            <div className="flex items-center gap-3 text-xs tabular-nums">
              <span className="text-zinc-400">
                {done}/{step5.nVariants} готово
              </span>
              <span className="text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-md">
                ⏱ {formatTime(elapsed)}
              </span>
            </div>
          </div>

          {/* Phase steps */}
          <div className="flex gap-1">
            {Array.from({ length: step5.nVariants }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                  i < done
                    ? "bg-green-500"
                    : i === done
                      ? "bg-primary"
                      : "bg-zinc-800"
                }`}
                style={
                  i === done && busy
                    ? { animation: "pulse 1.5s ease-in-out infinite" }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Log console */}
      {log.length > 0 && (
        <div className="card text-xs font-mono max-h-60 overflow-auto">
          {log.slice(-30).map((l, i) => (
            <div
              key={i}
              className={
                l.text.startsWith("⚠")
                  ? "text-red-400"
                  : l.text.startsWith("✅")
                    ? "text-green-400"
                    : l.text.startsWith("✓") || l.text.startsWith("💾")
                      ? "text-emerald-400"
                      : "text-zinc-400"
              }
            >
              {l.text}
            </div>
          ))}
          {busy && (
            <div className="text-zinc-600 mt-1" style={{ animation: "pulse 2s ease-in-out infinite" }}>
              ● ожидаю ответ...
            </div>
          )}
        </div>
      )}

      {step5.variants.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {step5.variants.map((v) => (
            <VariantCard key={v.id} variant={v} />
          ))}
        </div>
      )}

      {step5.variants.length > 0 && (
        <button className="btn-primary self-end" onClick={() => setStep(6)}>
          Далее → антифрод
        </button>
      )}
    </div>
  );
}

function VariantCard({ variant }: { variant: Variant }) {
  const { projectId, step5, setStep5 } = useWizard();
  const push = useToasts((s) => s.push);
  const [editing, setEditing] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"regen" | "edit" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const replaceVariant = (newV: Variant) => {
    // Use getState() to get the LATEST variants, not the stale closure snapshot.
    // This prevents race conditions when two regenerations run in parallel.
    const current = useWizard.getState().step5.variants;
    setStep5({
      variants: current.map((v) => (v.id === variant.id ? newV : v)),
    });
  };

  const regen = async () => {
    if (!projectId) return;
    setBusy(true);
    setBusyAction("regen");
    startTimer();
    try {
      const r = await api.post<Variant>(
        `/api/projects/${projectId}/step5/regenerate/${variant.id}`
      );
      replaceVariant(r);
      push("Перегенерировано", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setBusy(false);
      setBusyAction(null);
      stopTimer();
    }
  };

  const submitEdit = async () => {
    if (!projectId || !instruction.trim()) return;
    setBusy(true);
    setBusyAction("edit");
    startTimer();
    try {
      const r = await api.post<Variant>(
        `/api/projects/${projectId}/step5/edit/${variant.id}`,
        { instruction }
      );
      replaceVariant(r);
      setInstruction("");
      setEditing(false);
      push("Правка применена", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setBusy(false);
      setBusyAction(null);
      stopTimer();
    }
  };

  const statusText =
    busyAction === "regen"
      ? "Перегенерация..."
      : busyAction === "edit"
        ? "Применяю правки..."
        : "";

  return (
    <div className="card flex flex-col gap-2">
      <div className="relative">
        <img
          src={variant.url}
          alt={`v${variant.id}`}
          className={`w-full aspect-square object-cover rounded-lg bg-zinc-950 transition-all duration-300 ${
            busy ? "brightness-[0.3] blur-[2px]" : ""
          }`}
        />
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg">
            {/* Pulsing spinner */}
            <div className="relative w-14 h-14">
              <div
                className="absolute inset-0 rounded-full border-4 border-primary/30"
                style={{ animation: "pulse 2s ease-in-out infinite" }}
              />
              <div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary"
                style={{ animation: "spin 1s linear infinite" }}
              />
            </div>
            {/* Status text */}
            <span className="text-sm font-medium text-white drop-shadow-lg">
              {statusText}
            </span>
            {/* Elapsed timer */}
            <span className="text-xs text-zinc-300 tabular-nums">
              ⏱ {elapsed}с
            </span>
          </div>
        )}
      </div>
      <div className="flex gap-1 text-xs">
        <button
          className="btn-ghost flex-1 px-2 py-1"
          disabled={busy}
          onClick={regen}
        >
          {busy && busyAction === "regen" ? (
            <span className="flex items-center gap-1 justify-center">
              <span
                className="inline-block w-3 h-3 border-2 border-transparent border-t-current rounded-full"
                style={{ animation: "spin 0.8s linear infinite" }}
              />
              {elapsed}с...
            </span>
          ) : (
            "↻ Перегенерить"
          )}
        </button>
        <button
          className="btn-ghost flex-1 px-2 py-1"
          disabled={busy}
          onClick={() => setEditing((v) => !v)}
        >
          ✏ Чат
        </button>
      </div>
      {editing && (
        <div className="flex flex-col gap-2">
          <textarea
            className="input text-xs h-20"
            placeholder="напр.: «убери доктора, фон зеленее, банку крупнее»"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={busy}
          />
          <button
            className="btn-primary text-xs py-1"
            disabled={busy || !instruction.trim()}
            onClick={submitEdit}
          >
            {busy && busyAction === "edit" ? (
              <span className="flex items-center gap-1 justify-center">
                <span
                  className="inline-block w-3 h-3 border-2 border-transparent border-t-current rounded-full"
                  style={{ animation: "spin 0.8s linear infinite" }}
                />
                Применяю... {elapsed}с
              </span>
            ) : (
              "Применить"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

