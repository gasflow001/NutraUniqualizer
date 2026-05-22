import { useState, useCallback } from "react";
import { api } from "../../api/client";
import { DesignAnalysis, useWizard } from "../../store/wizard";
import { useToasts } from "../Toast";
import ImageDropzone from "../ImageDropzone";

type UploadResponse = {
  preview_url: string;
  analysis: DesignAnalysis;
};

export default function Step4Design() {
  const { projectId, step4, setStep4, setStep } = useWizard();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(step4.previewUrl ?? null);
  const [certPreview, setCertPreview] = useState<string | null>(step4.certPreviewUrl ?? null);
  const [docPreview, setDocPreview] = useState<string | null>(step4.docPreviewUrl ?? null);
  const analysis = step4.designAnalysis;
  const useCert = step4.useCertificate ?? false;
  const useDoc = step4.useDoctor ?? false;

  const handleDrop = async (file: File) => {
    if (!projectId) return;
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<UploadResponse>(
        `/api/projects/${projectId}/step4/upload`,
        fd
      );
      setStep4({ designAnalysis: res.analysis, previewUrl: res.preview_url });
      setPreview(res.preview_url);
      push("Дизайн-референс проанализирован", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCertDrop = async (file: File) => {
    if (!projectId) return;
    setCertPreview(URL.createObjectURL(file));
    setCertBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ preview_url: string }>(
        `/api/projects/${projectId}/step4/certificate`,
        fd
      );
      setCertPreview(res.preview_url);
      setStep4({ useCertificate: true, certPreviewUrl: res.preview_url });
      push("Certificate uploaded", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setCertBusy(false);
    }
  };

  const toggleCert = async (on: boolean) => {
    setStep4({ useCertificate: on });
    if (!on && projectId) {
      setCertPreview(null);
      setStep4({ useCertificate: false, certPreviewUrl: null });
      try {
        await api.del(`/api/projects/${projectId}/step4/certificate`);
      } catch {}
    }
  };

  const handleDocDrop = async (file: File) => {
    if (!projectId) return;
    setDocPreview(URL.createObjectURL(file));
    setDocBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ preview_url: string }>(
        `/api/projects/${projectId}/step4/doctor`,
        fd
      );
      setDocPreview(res.preview_url);
      setStep4({ useDoctor: true, docPreviewUrl: res.preview_url });
      push("Doctor photo uploaded", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setDocBusy(false);
    }
  };

  const toggleDoc = async (on: boolean) => {
    setStep4({ useDoctor: on });
    if (!on && projectId) {
      setDocPreview(null);
      setStep4({ useDoctor: false, docPreviewUrl: null });
      try {
        await api.del(`/api/projects/${projectId}/step4/doctor`);
      } catch {}
    }
  };

  const updateField = (key: string, value: any) => {
    setStep4({ designAnalysis: { ...(analysis || {}), [key]: value } });
  };

  const translateText = useCallback(
    async (ruText: string): Promise<string> => {
      if (!projectId || !ruText.trim()) return "";
      const res = await api.post<{ translated: string }>(
        `/api/projects/${projectId}/step1/translate`,
        { text: ruText, target_lang: "en" }
      );
      return res.translated;
    },
    [projectId]
  );

  const saveAndNext = async () => {
    if (!projectId) return;
    try {
      await api.post(`/api/projects/${projectId}/step4/save`, {
        analysis: step4.designAnalysis,
      });
      setStep(5);
    } catch (e) {
      push(String(e), "error");
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="flex flex-col gap-4">
        <ImageDropzone
          onDrop={handleDrop}
          preview={preview}
          label="Дропни креатив-референс — по его стилю/структуре будет сгенерирован новый"
        />
        {busy && <p className="text-zinc-500 text-sm">⏳ Анализирую дизайн...</p>}
      </div>

      <div className="flex flex-col gap-3">
        {analysis ? (
          <>
            <FieldCard
              label="Сцена / фон"
              value={analysis.scene_description ?? ""}
              onChange={(v) => updateField("scene_description", v)}
              onTranslate={translateText}
            />
            <FieldCard
              label="Стиль композиции"
              value={analysis.composition_style ?? ""}
              onChange={(v) => updateField("composition_style", v)}
              onTranslate={translateText}
            />
            <FieldCard
              label="Настроение (mood)"
              value={analysis.mood ?? ""}
              onChange={(v) => updateField("mood", v)}
              onTranslate={translateText}
            />
            <ListCard
              label="Визуальные метафоры"
              items={analysis.visual_metaphors ?? []}
              onChange={(items) => updateField("visual_metaphors", items)}
              onTranslate={translateText}
            />
            <ListCard
              label="UI-элементы"
              items={analysis.ui_elements ?? []}
              onChange={(items) => updateField("ui_elements", items)}
              onTranslate={translateText}
            />
            <ListCard
              label="Реквизит / объекты"
              items={analysis.props ?? []}
              onChange={(items) => updateField("props", items)}
              onTranslate={translateText}
            />

            {analysis.color_scheme && (
              <div className="card">
                <h4 className="text-sm font-semibold mb-2">Цветовая схема</h4>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(analysis.color_scheme).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-6 h-6 rounded border border-zinc-700"
                        style={{ background: v || "#000" }}
                      />
                      <span className="text-xs text-zinc-400">{k}: {v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis.unique_features && analysis.unique_features.length > 0 && (
              <ListCard
                label="Уникальные фишки дизайна"
                items={analysis.unique_features}
                onChange={(items) => updateField("unique_features", items)}
                onTranslate={translateText}
              />
            )}

            {/* Certificate toggle */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">📜 Certificate</h4>
                <button
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    useCert ? "bg-blue-600" : "bg-zinc-700"
                  }`}
                  onClick={() => toggleCert(!useCert)}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      useCert ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
              {useCert && (
                <div className="mt-2">
                  <ImageDropzone
                    onDrop={handleCertDrop}
                    preview={certPreview}
                    label="Upload certificate image"
                  />
                  {certBusy && (
                    <p className="text-zinc-500 text-sm mt-1">⏳ Uploading...</p>
                  )}
                  <p className="text-zinc-500 text-[11px] mt-1.5">
                    The certificate will be placed visibly on the creative — readable but not the main focus.
                  </p>
                </div>
              )}
            </div>

            {/* Doctor toggle */}
            <div className="card">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold">🩺 Doctor</h4>
                <button
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    useDoc ? "bg-blue-600" : "bg-zinc-700"
                  }`}
                  onClick={() => toggleDoc(!useDoc)}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      useDoc ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
              {useDoc && (
                <div className="mt-2">
                  <ImageDropzone
                    onDrop={handleDocDrop}
                    preview={docPreview}
                    label="Upload doctor photo"
                  />
                  {docBusy && (
                    <p className="text-zinc-500 text-sm mt-1">⏳ Uploading...</p>
                  )}
                  <p className="text-zinc-500 text-[11px] mt-1.5">
                    The doctor will appear in the background on the side — adds medical credibility.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-auto">
              <button className="btn-primary" onClick={saveAndNext}>
                Далее →
              </button>
            </div>
          </>
        ) : (
          <div className="card text-zinc-500 text-sm">
            Загрузи креатив-референс слева — справа появится анализ его дизайна для редактирования.
          </div>
        )}
      </div>
    </div>
  );
}

function FieldCard({
  label,
  value,
  onChange,
  onTranslate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onTranslate?: (ruText: string) => Promise<string>;
}) {
  const [ruText, setRuText] = useState("");
  const [translating, setTranslating] = useState(false);

  const handleTranslate = async () => {
    if (!onTranslate || !ruText.trim()) return;
    setTranslating(true);
    try {
      const result = await onTranslate(ruText);
      onChange(result);
      setRuText("");
    } catch {
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="card">
      <label className="text-xs text-zinc-400 block mb-1">{label}</label>
      <input className="input mb-1.5" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="flex gap-1.5 items-center">
        <input
          className="input flex-1 text-xs"
          placeholder="написать на русском..."
          value={ruText}
          onChange={(e) => setRuText(e.target.value)}
          onBlur={() => {
            if (ruText.trim() && !value.trim()) handleTranslate();
          }}
        />
        <button
          className="btn-ghost text-xs px-1.5 py-1 shrink-0"
          disabled={translating || !ruText.trim()}
          onClick={handleTranslate}
          title="Перевести ru → en"
        >
          {translating ? (
            <span
              className="inline-block w-3.5 h-3.5 border-2 border-transparent border-t-current rounded-full"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
          ) : (
            "🔄"
          )}
        </button>
      </div>
    </div>
  );
}

function ListCard({
  label,
  items,
  onChange,
  onTranslate,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  onTranslate?: (ruText: string) => Promise<string>;
}) {
  const [translatingIdx, setTranslatingIdx] = useState<number | null>(null);
  const [ruInputs, setRuInputs] = useState<Record<number, string>>({});

  const handleTranslateItem = async (i: number) => {
    if (!onTranslate) return;
    const ru = ruInputs[i];
    if (!ru?.trim()) return;
    setTranslatingIdx(i);
    try {
      const result = await onTranslate(ru);
      const copy = [...items];
      copy[i] = result;
      onChange(copy);
      setRuInputs((prev) => ({ ...prev, [i]: "" }));
    } catch {
    } finally {
      setTranslatingIdx(null);
    }
  };

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{label}</h4>
        <button
          className="btn-ghost text-xs"
          onClick={() => onChange([...items, ""])}
        >
          + добавить
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex flex-col gap-1">
            <div className="flex gap-2 items-center">
              <input
                className="input flex-1 text-xs"
                placeholder="en"
                value={it}
                onChange={(e) => {
                  const copy = [...items];
                  copy[i] = e.target.value;
                  onChange(copy);
                }}
              />
              <button
                className="btn-ghost text-red-400 text-xs"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
            <div className="flex gap-1.5 items-center">
              <input
                className="input flex-1 text-[11px]"
                placeholder="написать на русском..."
                value={ruInputs[i] ?? ""}
                onChange={(e) => setRuInputs((prev) => ({ ...prev, [i]: e.target.value }))}
              />
              <button
                className="btn-ghost text-xs px-1 py-0.5 shrink-0"
                disabled={translatingIdx === i || !(ruInputs[i] ?? "").trim()}
                onClick={() => handleTranslateItem(i)}
                title="Перевести"
              >
                {translatingIdx === i ? (
                  <span
                    className="inline-block w-3 h-3 border-2 border-transparent border-t-current rounded-full"
                    style={{ animation: "spin 0.8s linear infinite" }}
                  />
                ) : (
                  "🔄"
                )}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

