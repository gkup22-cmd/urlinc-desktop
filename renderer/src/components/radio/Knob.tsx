import { useRef, useState } from "react";

const AMBER_DIM = "#9c7d44";
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface KnobProps {
  label: string;
  ariaLabel: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  size?: number;
  valueText?: string;
}

export default function Knob({ label, ariaLabel, value, onChange, step = 4, size = 64, valueText }: KnobProps) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; x: number; v: number } | null>(null);
  const latest = useRef(value);
  latest.current = value;
  const emit = (v: number) => { latest.current = clamp(v, 0, 100); onChange(latest.current); };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, x: e.clientX, v: value };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !start.current) return;
    const delta = (start.current.y - e.clientY) + (e.clientX - start.current.x);
    emit(start.current.v + delta * 0.5);
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    start.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    emit(latest.current + (e.deltaY < 0 ? step : -step));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowUp: step, ArrowRight: step, PageUp: step * 3,
      ArrowDown: -step, ArrowLeft: -step, PageDown: -step * 3,
    };
    if (e.key in map) { e.preventDefault(); emit(latest.current + map[e.key]); }
    if (e.key === "Home") { e.preventDefault(); emit(0); }
    if (e.key === "End") { e.preventDefault(); emit(100); }
  };

  const angle = -135 + (value / 100) * 270;

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div className="relative" style={{ width: size + 14, height: size + 14 }}>
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 w-[2px] h-[5px] rounded-full"
            style={{
              background: (i / 10) * 100 <= value ? "#e8c67a" : "rgba(156,125,68,0.45)",
              transform: `translate(-50%,-50%) rotate(${-135 + i * 27}deg) translateY(-${(size + 14) / 2 - 3}px)`,
              boxShadow: (i / 10) * 100 <= value ? "0 0 4px rgba(232,198,122,0.8)" : "none",
            }}
          />
        ))}
        <div
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuenow={Math.round(value)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={valueText}
          onKeyDown={onKeyDown}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="absolute left-1/2 top-1/2 rounded-full touch-none cursor-grab active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a1810]"
          style={{
            width: size, height: size,
            marginLeft: -size / 2, marginTop: -size / 2,
            background: "radial-gradient(circle at 35% 28%, #f4dd9a 0%, #c5a059 42%, #8a6d3a 78%, #4a3618 100%)",
            boxShadow: dragging
              ? "inset 0 -2px 6px rgba(0,0,0,0.6), inset 0 2px 4px rgba(255,240,200,0.4), 0 2px 5px rgba(0,0,0,0.6)"
              : "inset 0 -4px 8px rgba(0,0,0,0.55), inset 0 3px 5px rgba(255,240,200,0.5), 0 5px 10px rgba(0,0,0,0.6)",
            transform: `rotate(${angle}deg) scale(${dragging ? 0.98 : 1})`,
            transition: dragging ? "none" : "transform 0.18s ease-out, box-shadow 0.18s",
          }}
        >
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "repeating-conic-gradient(from 0deg, rgba(0,0,0,0.35) 0 4deg, transparent 4deg 8deg)",
              maskImage: "radial-gradient(circle, transparent 58%, black 60%, black 100%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 58%, black 60%, black 100%)",
            }}
          />
          <div
            className="absolute left-1/2 top-1.5 -translate-x-1/2 w-1 h-4 rounded-full"
            style={{ background: "#2a1810", boxShadow: "0 0 2px rgba(0,0,0,0.6)" }}
          />
        </div>
      </div>
      <span className="text-[9px] tracking-[0.2em] font-semibold" style={{ color: AMBER_DIM }}>{label}</span>
    </div>
  );
}
