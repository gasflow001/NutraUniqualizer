import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToasts } from "../components/Toast";

type FinalItem = {
  id: number;
  url: string | null;
  prompt: string;
};

type HistoryProject = {
  id: number;
  name: string;
  source_lang: string | null;
  created_at: string;
  updated_at: string;
  source_url: string | null;
  product_url: string | null;
  design_ref_url: string | null;
  segments: any | null;
  finals: FinalItem[];
};

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
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 1000);
}

export default function History() {
  const [items, setItems] = useState<HistoryProject[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const push = useToasts((s) => s.push);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ history: HistoryProject[] }>("/api/projects/history")
      .then((r) => setItems(r.history))
      .catch((e) => push(String(e), "error"))
      .finally(() => setLoading(false));
  }, [push]);

  const toggle = (id: number) =>
    setExpanded((prev) => (prev === id ? null : id));

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  /** Extract short text summary from segments */
  const segmentSummary = (segments: any): string => {
    if (!segments) return "";
    const segs = segments.segments || segments;
    const parts: string[] = [];

    const extractText = (val: any): string => {
      if (!val) return "";
      if (Array.isArray(val)) return val.map((v: any) => v?.ru || v?.original || "").filter(Boolean).join(", ");
      if (typeof val === "object") return val.ru || val.original || "";
      return "";
    };

    const h = extractText(segs.headline);
    if (h) parts.push(`Заголовок: ${h}`);
    const sub = extractText(segs.subheadline);
    if (sub) parts.push(`Подзаголовок: ${sub}`);
    const ben = extractText(segs.benefits);
    if (ben) parts.push(`Benefits: ${ben}`);
    const cta = extractText(segs.cta);
    if (cta) parts.push(`CTA: ${cta}`);

    return parts.join(" · ");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span
          className="inline-block w-6 h-6 border-2 border-transparent border-t-primary rounded-full"
          style={{ animation: "spin 0.8s linear infinite" }}
        />
        <span className="ml-2 text-zinc-400">Загрузка истории...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        История готовых креативов
        <span className="text-zinc-500 text-sm font-normal ml-2">
          ({items.length} {items.length === 1 ? "проект" : "проектов"})
        </span>
      </h2>

      {items.length === 0 ? (
        <div className="card text-zinc-500 text-sm text-center py-10">
          Пока нет завершённых проектов. Создай проект и пройди до шага 6 (Экспорт).
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((p) => (
            <div key={p.id} className="card">
              {/* Header row */}
              <button
                className="w-full flex items-start gap-4 text-left"
                onClick={() => toggle(p.id)}
              >
                {/* Thumbnail = first final */}
                <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-zinc-900">
                  {p.finals[0]?.url ? (
                    <img
                      src={p.finals[0].url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">
                      —
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold truncate">
                      #{p.id} · {p.name}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">
                        {p.finals.length} крео
                      </span>
                      <span className="text-xs text-zinc-500">
                        {expanded === p.id ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {fmtDate(p.updated_at)}
                    {p.source_lang && (
                      <span className="ml-2 text-zinc-600">
                        lang: {p.source_lang}
                      </span>
                    )}
                  </div>
                  {p.segments && (
                    <p className="text-[11px] text-zinc-500 mt-1 truncate">
                      {segmentSummary(p.segments)}
                    </p>
                  )}
                </div>
              </button>

              {/* Expanded details */}
              {expanded === p.id && (
                <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-col gap-4">
                  {/* Input images row */}
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                      Исходные материалы
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      <InputThumb
                        label="Креатив-исходник"
                        url={p.source_url}
                      />
                      <InputThumb
                        label="Фото товара"
                        url={p.product_url}
                      />
                      <InputThumb
                        label="Дизайн-референс"
                        url={p.design_ref_url}
                      />
                    </div>
                  </div>

                  {/* Segments */}
                  {p.segments && (
                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                        Текст сегменты
                      </h4>
                      <SegmentsDisplay segments={p.segments} />
                    </div>
                  )}

                  {/* Finals */}
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                      Готовые креативы ({p.finals.length})
                    </h4>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {p.finals.map((f) => (
                        <div key={f.id} className="bg-zinc-900 rounded-lg overflow-hidden">
                          {f.url ? (
                            <img
                              src={f.url}
                              alt={`creative ${f.id}`}
                              className="w-full aspect-square object-cover"
                            />
                          ) : (
                            <div className="w-full aspect-square flex items-center justify-center text-zinc-700">
                              no image
                            </div>
                          )}
                          <div className="p-2 flex flex-col gap-1">
                            {f.prompt && (
                              <details className="text-[10px] text-zinc-500">
                                <summary className="cursor-pointer hover:text-zinc-300">
                                  промпт...
                                </summary>
                                <p className="mt-1 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                                  {f.prompt}
                                </p>
                              </details>
                            )}
                            {f.url && (
                              <button
                                className="text-[11px] text-primary hover:underline self-end"
                                onClick={() =>
                                  downloadFile(
                                    `/api/projects/${p.id}/download/${f.id}`,
                                    `creative_${f.id}.png`
                                  )
                                }
                              >
                                ⬇ скачать
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InputThumb({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-zinc-500">{label}</span>
      {url ? (
        <img
          src={url}
          alt={label}
          className="w-full aspect-square object-cover rounded-lg bg-zinc-950"
        />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-700 text-[10px]">
          не загружено
        </div>
      )}
    </div>
  );
}

function SegmentsDisplay({ segments }: { segments: any }) {
  const segs = segments?.segments || segments;
  if (!segs) return null;

  const renderField = (label: string, val: any) => {
    if (!val) return null;
    let items: { original: string; ru: string }[] = [];
    if (Array.isArray(val)) {
      items = val;
    } else if (typeof val === "object" && ("original" in val || "ru" in val)) {
      items = [val];
    } else {
      return null;
    }
    if (items.length === 0) return null;

    return (
      <div className="flex flex-col gap-0.5" key={label}>
        <span className="text-[10px] text-zinc-500 font-semibold">{label}</span>
        {items.map((it, i) => (
          <div key={i} className="text-xs text-zinc-300 flex gap-2">
            <span className="text-zinc-500">{it.original}</span>
            {it.ru && <span>→ {it.ru}</span>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-zinc-900/50 rounded-lg p-3 flex flex-col gap-2">
      {renderField("Headline", segs.headline)}
      {renderField("Subheadline", segs.subheadline)}
      {renderField("Benefits", segs.benefits)}
      {renderField("CTA", segs.cta)}
      {renderField("Badges", segs.badges)}
    </div>
  );
}
