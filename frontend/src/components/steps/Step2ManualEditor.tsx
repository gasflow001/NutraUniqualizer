import { useRef, useState } from "react";
import { Layout } from "../../store/wizard";
import { useWizard } from "../../store/wizard";

type Props = {
  layout: Layout;
  onChange: (l: Layout) => void;
};

type Dragging = { id: string; offX: number; offY: number; mode: "move" | "resize" } | null;

export default function Step2ManualEditor({ layout, onChange }: Props) {
  const { projectId } = useWizard();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<Dragging>(null);
  const [showSource, setShowSource] = useState(true);

  const sourceUrl = projectId ? `/storage/uploads/${projectId}/source.jpg` : "";

  const onMouseDown = (
    e: React.MouseEvent<SVGRectElement>,
    zoneId: string,
    mode: "move" | "resize"
  ) => {
    e.stopPropagation();
    const pt = svgPoint(e.clientX, e.clientY);
    const z = layout.zones.find((z) => z.id === zoneId)!;
    setDragging({ id: zoneId, offX: pt.x - z.x, offY: pt.y - z.y, mode });
  };

  const svgPoint = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const pt = svgPoint(e.clientX, e.clientY);
    const zones = layout.zones.map((z) => {
      if (z.id !== dragging.id) return z;
      if (dragging.mode === "move") {
        return {
          ...z,
          x: clamp(pt.x - dragging.offX, 0, 1 - z.w),
          y: clamp(pt.y - dragging.offY, 0, 1 - z.h),
        };
      }
      return {
        ...z,
        w: clamp(pt.x - z.x, 0.05, 1 - z.x),
        h: clamp(pt.y - z.y, 0.05, 1 - z.y),
      };
    });
    onChange({ ...layout, zones });
  };

  const onMouseUp = () => setDragging(null);

  const updatePalette = (i: number, hex: string) => {
    const palette = [...layout.palette];
    palette[i] = hex;
    onChange({ ...layout, palette });
  };

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4">
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Зоны (тащи и ресайзь)</h4>
          <label className="text-xs text-zinc-400 flex items-center gap-2">
            <input
              type="checkbox"
              checked={showSource}
              onChange={(e) => setShowSource(e.target.checked)}
            />
            показывать исходник
          </label>
        </div>
        <svg
          ref={svgRef}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          className="w-full aspect-square bg-zinc-950 rounded-lg select-none"
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          {showSource && (
            <image
              href={sourceUrl}
              x={0}
              y={0}
              width={1}
              height={1}
              preserveAspectRatio="xMidYMid slice"
              opacity={0.35}
            />
          )}
          {layout.zones.map((z) => (
            <g key={z.id}>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                fill="rgba(59,130,246,0.15)"
                stroke="rgba(96,165,250,0.9)"
                strokeWidth={0.003}
                onMouseDown={(e) => onMouseDown(e, z.id, "move")}
                style={{ cursor: "move" }}
              />
              <text
                x={z.x + 0.01}
                y={z.y + 0.04}
                fontSize={0.025}
                fill="white"
                style={{ pointerEvents: "none" }}
              >
                {z.label}
              </text>
              <rect
                x={z.x + z.w - 0.02}
                y={z.y + z.h - 0.02}
                width={0.02}
                height={0.02}
                fill="rgba(250,204,21,0.95)"
                onMouseDown={(e) => onMouseDown(e, z.id, "resize")}
                style={{ cursor: "nwse-resize" }}
              />
            </g>
          ))}
        </svg>
      </div>

      <aside className="flex flex-col gap-3">
        <div className="card">
          <h4 className="text-sm font-semibold mb-2">Палитра</h4>
          <div className="flex flex-wrap gap-2">
            {layout.palette.map((c, i) => (
              <label key={i} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="color"
                  value={c}
                  onChange={(e) => updatePalette(i, e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border border-zinc-700"
                />
                <span className="text-xs text-zinc-400">{c}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="card">
          <h4 className="text-sm font-semibold mb-2">Стиль и настроение</h4>
          <label className="text-xs text-zinc-400 block">Стиль</label>
          <input
            className="input mb-2"
            value={layout.style}
            onChange={(e) => onChange({ ...layout, style: e.target.value })}
          />
          <label className="text-xs text-zinc-400 block">Mood</label>
          <input
            className="input"
            value={layout.mood}
            onChange={(e) => onChange({ ...layout, mood: e.target.value })}
          />
        </div>
      </aside>
    </div>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
