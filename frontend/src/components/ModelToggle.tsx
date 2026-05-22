import { cn } from "../lib/cn";

type Model = "auto" | "GEM_PIX" | "GEM_PIX_2";

type Props = {
  value: Model;
  onChange: (m: Model) => void;
};

const OPTIONS: { id: Model; label: string; hint: string }[] = [
  { id: "auto", label: "Auto", hint: "Сам выберу по языку" },
  { id: "GEM_PIX_2", label: "Nano Banana Pro", hint: "Лучше с текстом" },
  { id: "GEM_PIX", label: "Nano Banana", hint: "Быстрее" },
];

export default function ModelToggle({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-900 p-1">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-md px-2 py-1.5 text-xs transition",
            value === o.id ? "bg-primary text-primary-foreground" : "text-zinc-400 hover:text-white"
          )}
          title={o.hint}
        >
          <div className="font-medium">{o.label}</div>
          <div className="text-[10px] opacity-70">{o.hint}</div>
        </button>
      ))}
    </div>
  );
}
