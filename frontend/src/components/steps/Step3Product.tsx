import { useState } from "react";
import { api } from "../../api/client";
import { ProductMeta, useWizard } from "../../store/wizard";
import { useToasts } from "../Toast";
import ImageDropzone from "../ImageDropzone";

export default function Step3Product() {
  const { projectId, step3, setStep3, setStep } = useWizard();
  const push = useToasts((s) => s.push);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(step3.productMeta?.preview_url ?? null);
  const meta = step3.productMeta;

  const handleDrop = async (file: File) => {
    if (!projectId) return;
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<ProductMeta>(
        `/api/projects/${projectId}/step3/product`,
        fd
      );
      setStep3({ productMeta: res });
      setPreview(res.preview_url ?? null);
      push("Фото товара загружено", "ok");
    } catch (e) {
      push(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <ImageDropzone
        onDrop={handleDrop}
        preview={preview}
        label="Фото твоего товара (банка/упаковка)"
      />

      <div className="flex flex-col gap-3">
        {busy && <p className="text-zinc-500 text-sm">⏳ Анализирую упаковку...</p>}
        {meta && (
          <>
            <Field
              label="Brand name"
              value={meta.brand_name ?? ""}
              onChange={(v) => setStep3({ productMeta: { ...meta, brand_name: v } })}
            />
            <Field
              label="Тип упаковки"
              value={meta.package_type ?? "bottle"}
              onChange={(v) => setStep3({ productMeta: { ...meta, package_type: v } })}
            />
            <div className="card flex items-center gap-3">
              <span className="text-sm">Доминирующий цвет:</span>
              <span
                className="inline-block w-8 h-8 rounded border border-zinc-700"
                style={{ background: meta.color_dominant ?? "#FFFFFF" }}
              />
              <span className="text-xs text-zinc-500">{meta.color_dominant}</span>
            </div>
          </>
        )}

        <div className="flex justify-end mt-auto">
          <button className="btn-primary" disabled={!meta} onClick={() => setStep(4)}>
            Далее →
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="card">
      <label className="text-xs text-zinc-400 block mb-1">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
