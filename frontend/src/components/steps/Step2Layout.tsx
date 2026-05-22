import { useState } from "react";
import { api } from "../../api/client";
import { useWizard, Layout } from "../../store/wizard";
import { useToasts } from "../Toast";
import Step2ManualEditor from "./Step2ManualEditor";

export default function Step2Layout() {
  const { projectId, step2, setStep2, setStep } = useWizard();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);

  const setMode = async (mode: "auto" | "manual") => {
    if (!projectId) return;
    setStep2({ mode });
    if (mode === "auto") {
      try {
        await api.post(`/api/projects/${projectId}/step2/analyze`, { mode });
        setStep2({ mode: "auto", layout: null });
      } catch (e) {
        push(String(e), "error");
      }
    } else {
      setBusy(true);
      try {
        const res = await api.post<{ layout: Layout }>(
          `/api/projects/${projectId}/step2/analyze`,
          { mode: "manual" }
        );
        setStep2({ mode: "manual", layout: res.layout });
        push("Композиция распознана", "ok");
      } catch (e) {
        push(String(e), "error");
      } finally {
        setBusy(false);
      }
    }
  };

  const saveAndNext = async () => {
    if (!projectId) return;
    try {
      await api.post(`/api/projects/${projectId}/step2/save`, {
        mode: step2.mode,
        layout: step2.layout,
      });
      setStep(3);
    } catch (e) {
      push(String(e), "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h3 className="text-base font-semibold">Композиция</h3>
          <p className="text-sm text-zinc-500">
            Auto — модель сама компонует. Manual — задай зоны вручную.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-zinc-900 p-1 w-fit">
          {(["auto", "manual"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={
                step2.mode === m
                  ? "px-4 py-1.5 rounded-md text-sm bg-primary text-primary-foreground"
                  : "px-4 py-1.5 rounded-md text-sm text-zinc-400 hover:text-white"
              }
            >
              {m === "auto" ? "Auto" : "Manual"}
            </button>
          ))}
        </div>
      </div>

      {step2.mode === "manual" &&
        (busy ? (
          <div className="card text-zinc-500 text-sm">⏳ Анализирую композицию...</div>
        ) : step2.layout ? (
          <Step2ManualEditor
            layout={step2.layout}
            onChange={(l) => setStep2({ layout: l })}
          />
        ) : (
          <div className="card text-zinc-500 text-sm">
            Нажми «Manual» ещё раз, если анализ не подгрузился.
          </div>
        ))}

      <button className="btn-primary self-end" onClick={saveAndNext}>
        Далее →
      </button>
    </div>
  );
}
