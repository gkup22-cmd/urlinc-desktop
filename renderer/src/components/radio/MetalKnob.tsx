import React, { useRef, useState } from "react";

const clamp = (v: number) => Math.max(0, Math.min(100, v));

interface MetalKnobProps {
  label: string;
  ariaLabel?: string;
  value: number;
  onChange: (v: number) => void;
  size?: number;
  valueText?: string;
  step?: number;
}

/**
 * Chrome rotary knob with a glowing orange SVG arc ring. value 0..100.
 * Drag (touch/mouse), scroll wheel, or arrow keys.
 */
export default function MetalKnob({
  label, ariaLabel, value, onChange, size = 72, valueText, step = 4,
}: MetalKnobProps) {
  const [drag, setDrag] = useState(false);
  const start = useRef<{ x: number; y: number; v: number } | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const emit = (v: number) => { latest.current = clamp(v); onChange(latest.current); };

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, v: value };
    setDrag(true);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag || !start.current) return;
    emit(start.current.v + ((start.current.y - e.clientY) + (e.clientX - start.current.x)) * 0.5);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(false);
    start.current = null;
  };
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = {
      ArrowUp: step, ArrowRight: step, PageUp: step * 3,
      ArrowDown: -step, ArrowLeft: -step, PageDown: -step * 3,
    };
    if (e.key in map) { e.preventDefault(); emit(latest.current + map[e.key]); }
    if (e.key === "Home") { e.preventDefault(); emit(0); }
    if (e.key === "End")  { e.preventDefault(); emit(100); }
  };

  const ring  = size + 22;
  const r     = ring / 2 - 6;
  const circ  = 2 * Math.PI * r;
  const arc   = circ * 0.75; // 270° sweep
  const angle = -135 + (value / 100) * 270;

  return (
    <div className="flex flex-col items-center select-none">
      <div className="relative" style={{ width: ring, height: ring }}>
        {/* Arc ring */}
        <svg width={ring} height={ring} className="absolute inset-0" style={{ transform: "rotate(135deg)" }} aria-hidden="true">
          <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="rgba(255,120,30,0.18)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${arc} ${circ}`} />
          <circle
            cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="#ff8a1f" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${(arc * value) / 100} ${circ}`}
            style={{ filter: "drop-shadow(0 0 5px rgba(255,138,31,0.95))", transition: drag ? "none" : "stroke-dasharray .15s" }}
          />
        </svg>
        {/* Knob body */}
        <div
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel ?? label}
          aria-valuenow={Math.round(value)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={valueText}
          onKeyDown={handleKey}
          onWheel={(e) => emit(latest.current + (e.deltaY < 0 ? step : -step))}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="absolute left-1/2 top-1/2 rounded-full touch-none cursor-grab focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
          style={{
            width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
            background: "conic-gradient(from 20deg, #f2f2f2, #8c8c8c, #e9e9e9, #6e6e6e, #f5f5f5, #909090, #f2f2f2)",
            boxShadow: drag
              ? "inset 0 0 0 2px #3a3a3a, 0 1px 4px rgba(0,0,0,.8)"
              : "inset 0 0 0 2px #3a3a3a, inset 0 0 10px rgba(0,0,0,.45), 0 5px 10px rgba(0,0,0,.8)",
            transform: `rotate(${angle}deg) scale(${drag ? 0.97 : 1})`,
            transition: drag ? "none" : "transform .15s ease-out",
          }}
        >
          {/* Knurling texture */}
          <div className="absolute inset-[18%] rounded-full" style={{ background: "repeating-conic-gradient(rgba(0,0,0,.22) 0 3deg, rgba(255,255,255,.12) 3deg 6deg)" }} />
          {/* Orange indicator dot */}
          <div className="absolute left-1/2 top-[6%] -translate-x-1/2 w-[3px] h-[16%] rounded-full" style={{ background: "#ff8a1f", boxShadow: "0 0 4px #ff8a1f" }} />
        </div>
      </div>
      <span className="text-[10px] font-bold tracking-[0.18em] -mt-1" style={{ color: "#f4e3c0" }}>{label}</span>
    </div>
  );
}
