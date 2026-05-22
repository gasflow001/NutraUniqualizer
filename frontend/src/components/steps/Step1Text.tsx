import { useState, useCallback } from "react";
import { api } from "../../api/client";
import ImageDropzone from "../ImageDropzone";
import ChatPanel from "../ChatPanel";
import { useToasts } from "../Toast";
import { Segments, useWizard } from "../../store/wizard";

type ParseResponse = { source_lang: string; segments: Segments };

/** Convert old API format (single object) to new format (array) for all fields. */
function normalizeSegments(raw: any): Segments {
  const toArr = (v: any): { original: string; ru: string }[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === "object" && ("original" in v || "ru" in v))
      return [{ original: v.original ?? "", ru: v.ru ?? "" }];
    return [];
  };
  return {
    headline: toArr(raw?.headline),
    subheadline: toArr(raw?.subheadline),
    benefits: toArr(raw?.benefits),
    cta: toArr(raw?.cta),
    badges: toArr(raw?.badges),
  };
}

export default function Step1Text() {
  const { projectId, step1, setStep1, setStep } = useWizard();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const segments = step1.segments;

  const handleDrop = async (file: File) => {
    if (!projectId) {
      push("Сначала создай проект", "error");
      return;
    }
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<ParseResponse>(
        `/api/projects/${projectId}/step1/parse`,
        fd
      );
      setStep1({ segments: normalizeSegments(res.segments), sourceLang: res.source_lang });
      push("Текст распознан", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const updateSegment = (key: keyof Segments, value: any) => {
    setStep1({ segments: { ...(segments || {}), [key]: value } });
  };

  const updateArr = (key: keyof Segments, idx: number, field: "original" | "ru", value: string) => {
    const arr = [...((segments?.[key] as any[]) ?? [])];
    arr[idx] = { ...arr[idx], [field]: value };
    updateSegment(key, arr);
  };

  const addItem = (key: keyof Segments) => {
    updateSegment(key, [...((segments?.[key] as any[]) ?? []), { original: "", ru: "" }]);
  };

  const removeItem = (key: keyof Segments, idx: number) => {
    updateSegment(key, ((segments?.[key] as any[]) ?? []).filter((_: any, j: number) => j !== idx));
  };

  const translateItem = useCallback(
    async (key: keyof Segments, idx: number) => {
      if (!projectId) return;
      const arr = (segments?.[key] as any[]) ?? [];
      const item = arr[idx];
      if (!item?.ru?.trim()) return;
      try {
        const res = await api.post<{ translated: string }>(
          `/api/projects/${projectId}/step1/translate`,
          { text: item.ru, target_lang: step1.sourceLang }
        );
        updateArr(key, idx, "original", res.translated);
      } catch (e) {
        push(String(e), "error");
      }
    },
    [projectId, segments, step1.sourceLang]
  );

  const saveAndNext = async () => {
    if (!projectId || !segments) return;
    try {
      await api.post(`/api/projects/${projectId}/step1/save`, {
        source_lang: step1.sourceLang,
        segments,
      });
      setStep(2);
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
          label="Дропни чужой Facebook-креатив для уникализации"
        />
        {busy && <p className="text-zinc-500 text-sm">⏳ Распознаю текст...</p>}
        {step1.sourceLang && (
          <p className="text-xs text-zinc-500">
            Язык оригинала: <span className="text-zinc-300">{step1.sourceLang}</span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {segments ? (
          <>
            <ArrayCard
              label="Headline"
              items={(segments.headline ?? []) as any[]}
              onChange={(i, f, v) => updateArr("headline", i, f, v)}
              onAdd={() => addItem("headline")}
              onRemove={(i) => removeItem("headline", i)}
              onTranslate={(i) => translateItem("headline", i)}
              sourceLang={step1.sourceLang}
            />
            <ArrayCard
              label="Subheadline"
              items={(segments.subheadline ?? []) as any[]}
              onChange={(i, f, v) => updateArr("subheadline", i, f, v)}
              onAdd={() => addItem("subheadline")}
              onRemove={(i) => removeItem("subheadline", i)}
              onTranslate={(i) => translateItem("subheadline", i)}
              sourceLang={step1.sourceLang}
              optional
            />
            <ArrayCard
              label="Benefits"
              items={(segments.benefits ?? []) as any[]}
              onChange={(i, f, v) => updateArr("benefits", i, f, v)}
              onAdd={() => addItem("benefits")}
              onRemove={(i) => removeItem("benefits", i)}
              onTranslate={(i) => translateItem("benefits", i)}
              sourceLang={step1.sourceLang}
            />
            <ArrayCard
              label="CTA"
              items={(segments.cta ?? []) as any[]}
              onChange={(i, f, v) => updateArr("cta", i, f, v)}
              onAdd={() => addItem("cta")}
              onRemove={(i) => removeItem("cta", i)}
              onTranslate={(i) => translateItem("cta", i)}
              sourceLang={step1.sourceLang}
              optional
            />
            <ArrayCard
              label="Badges"
              items={(segments.badges ?? []) as any[]}
              onChange={(i, f, v) => updateArr("badges", i, f, v)}
              onAdd={() => addItem("badges")}
              onRemove={(i) => removeItem("badges", i)}
              onTranslate={(i) => translateItem("badges", i)}
              sourceLang={step1.sourceLang}
            />

            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => setChatOpen((v) => !v)}>
                💬 {chatOpen ? "Скрыть чат" : "Чат правок"}
              </button>
              <button className="btn-primary flex-1" onClick={saveAndNext}>
                Далее →
              </button>
            </div>

            {chatOpen && projectId && (
              <ChatPanel
                wsPath={`/api/projects/${projectId}/step1/chat`}
                onPayload={(data) => {
                  const d = data as ParseResponse;
                  setStep1({ segments: normalizeSegments(d.segments), sourceLang: d.source_lang });
                  push("Сегменты обновлены", "ok");
                }}
                placeholder="напр.: «сделай заголовок жёстче, добавь срочность»"
              />
            )}
          </>
        ) : (
          <div className="card text-zinc-500 text-sm">
            Загрузи креатив слева — справа появятся сегменты текста для редактирования.
          </div>
        )}
      </div>
    </div>
  );
}

function ArrayCard({
  label,
  items,
  onChange,
  onAdd,
  onRemove,
  onTranslate,
  sourceLang,
  optional,
}: {
  label: string;
  items: { original: string; ru: string }[];
  onChange: (i: number, f: "original" | "ru", v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onTranslate?: (i: number) => Promise<void>;
  sourceLang?: string | null;
  optional?: boolean;
}) {
  const [translating, setTranslating] = useState<number | null>(null);

  const handleTranslate = async (i: number) => {
    if (!onTranslate) return;
    setTranslating(i);
    try {
      await onTranslate(i);
    } finally {
      setTranslating(null);
    }
  };

  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{label}</h4>
        <div className="flex items-center gap-2">
          {optional && <span className="text-[10px] text-zinc-500">опционально</span>}
          <button className="btn-ghost text-xs" onClick={onAdd}>+ добавить</button>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
            <input
              className="input"
              placeholder={sourceLang ? `оригинал (${sourceLang})` : "оригинал"}
              value={it.original}
              onChange={(e) => onChange(i, "original", e.target.value)}
            />
            <button
              className="btn-ghost text-xs px-1.5 py-1 shrink-0"
              title="Перевести ru → оригинал"
              disabled={translating === i || !it.ru?.trim()}
              onClick={() => handleTranslate(i)}
            >
              {translating === i ? (
                <span
                  className="inline-block w-3.5 h-3.5 border-2 border-transparent border-t-current rounded-full"
                  style={{ animation: "spin 0.8s linear infinite" }}
                />
              ) : (
                "🔄"
              )}
            </button>
            <input
              className="input"
              placeholder="русский"
              value={it.ru}
              onChange={(e) => onChange(i, "ru", e.target.value)}
              onBlur={() => {
                // Auto-translate on blur if original is empty and ru has text
                if (!it.original?.trim() && it.ru?.trim()) {
                  handleTranslate(i);
                }
              }}
            />
            <button className="btn-ghost text-red-400" onClick={() => onRemove(i)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}


