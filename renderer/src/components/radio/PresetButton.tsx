import { useRef, useState } from "react";
import type { CabinetStation } from "./RadioCabinet";

const AMBER = "#e8c67a";
const HOLD_MS = 600;

interface PresetButtonProps {
  index: number;
  active: boolean;
  station: CabinetStation | null;
  onRecall: (index: number) => void;
  onStore: (index: number) => void;
}

export default function PresetButton({ index, active, station, onRecall, onStore }: PresetButtonProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [down, setDown] = useState(false);
  const [flash, setFlash] = useState(false);

  const store = () => {
    onStore(index);
    setFlash(true);
    setTimeout(() => setFlash(false), 500);
  };

  const onPointerDown = () => {
    held.current = false;
    setDown(true);
    timer.current = setTimeout(() => { held.current = true; store(); }, HOLD_MS);
  };
  const clear = () => { if (timer.current) clearTimeout(timer.current); setDown(false); };

  const onClick = (e: React.MouseEvent) => {
    if (held.current) { held.current = false; return; }
    if (e.shiftKey) return store();
    onRecall(index);
  };

  const lit = active || flash;

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        aria-label={`Preset ${index + 1}${station ? `, ${station.name}` : ", empty"}. Hold or Shift+click to store current station.`}
        aria-pressed={active}
        title={station ? station.name : "Empty — hold to store the current station"}
        onPointerDown={onPointerDown}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 touch-manipulation motion-reduce:transition-none"
        style={{
          width: 44, height: 44,
          transition: "transform 0.08s, box-shadow 0.15s",
          transform: down ? "translateY(2px)" : "translateY(0)",
          background: lit
            ? "linear-gradient(180deg, #f4dd9a 0%, #c5a059 100%)"
            : "linear-gradient(180deg, #e8e0cf 0%, #b9a888 100%)",
          boxShadow: down
            ? "inset 0 2px 4px rgba(0,0,0,0.5)"
            : lit
              ? "inset 0 -2px 4px rgba(0,0,0,0.35), 0 3px 0 #6b4f1e, 0 0 12px rgba(232,198,122,0.7)"
              : "inset 0 -2px 4px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.5), 0 3px 0 #6b4f1e",
          border: "1px solid #6b4f1e",
        }}
      >
        <span className="text-xs font-bold text-stone-800">{index + 1}</span>
      </button>
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: station ? AMBER : "rgba(156,125,68,0.3)", boxShadow: station ? `0 0 5px ${AMBER}` : "none" }}
      />
    </div>
  );
}
