import { useState } from "react";
import { api } from "../../api/client";
import { FinalVariant, useWizard } from "../../store/wizard";
import { useToasts } from "../Toast";

async function downloadFile(url: string, filename: string) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  const blob = await resp.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Delay cleanup so browser has time to start download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 1000);
}

export default function Step6Export() {
  const { projectId, step5, step6, setStep6 } = useWizard();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [strength, setStrength] = useState(1.0);
  const [selected, setSelected] = useState<Set<number>>(
    new Set(step5.variants.map((v) => Number(v.id)))
  );

  const toggle = (id: number) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const finalize = async () => {
    if (!projectId || selected.size === 0) return;
    setBusy(true);
    try {
      const r = await api.post<{ finals: FinalVariant[] }>(
        `/api/projects/${projectId}/step6/finalize`,
        { variant_ids: Array.from(selected), strength }
      );
      setStep6({ finals: r.finals });
      push("Антифрод применён", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const downloadZip = async () => {
    if (!projectId) return;
    try {
      await downloadFile(
        `/api/projects/${projectId}/download_all`,
        `project_${projectId}_finals.zip`
      );
    } catch (e) {
      push(String(e), "error");
    }
  };

  const downloadOne = async (variantId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!projectId) return;
    try {
      // Use backend download endpoint with Content-Disposition header
      await downloadFile(
        `/api/projects/${projectId}/download/${variantId}`,
        `creative_${variantId}.png`
      );
    } catch (err) {
      push(String(err), "error");
    }
  };

  return (
    <div className="grid gap-4">
      <div className="card flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h3 className="text-base font-semibold">Антифрод-постпроцесс</h3>
          <p className="text-sm text-zinc-500">
            Pillow: rotation + crop + jitter + noise — ломает pHash «семей» FB.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400">сила:</label>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="accent-primary"
          />
          <span className="text-xs text-zinc-300 w-8">{strength.toFixed(1)}×</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {step5.variants.map((v) => {
          const final = step6.finals.find((f) => Number(f.id) === Number(v.id));
          const isSel = selected.has(Number(v.id));
          return (
            <div
              key={v.id}
              className={`card flex flex-col gap-2 transition ${
                isSel ? "ring-2 ring-primary" : "opacity-60"
              }`}
              onClick={() => toggle(Number(v.id))}
            >
              <img
                src={final?.url ?? v.url}
                className="w-full aspect-square object-cover rounded-lg bg-zinc-950"
                alt={`v${v.id}`}
              />
              <div className="flex justify-between text-xs">
                <span>{isSel ? "✓ выбрано" : "не выбрано"}</span>
                {final && (
                  <button
                    className="text-primary hover:underline"
                    onClick={(e) => downloadOne(Number(v.id), e)}
                  >
                    скачать
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          className="btn-secondary"
          disabled={busy || selected.size === 0}
          onClick={finalize}
        >
          {busy ? "⏳ обработка..." : `Применить антифрод (${selected.size})`}
        </button>
        <button
          className="btn-primary"
          disabled={step6.finals.length === 0}
          onClick={downloadZip}
        >
          ⬇ Скачать ZIP
        </button>
      </div>
    </div>
  );
}

