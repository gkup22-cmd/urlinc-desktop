import React, { useRef, useState, useEffect, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { CabinetStation } from "./RadioCabinet";
import MetalKnob from "./MetalKnob";
import PhoneDial from "./PhoneDial";

// ─── Set true to see colored overlays for calibration ────────────────────────
const DEBUG_OVERLAYS = false;

// ─── Position constants (% of 1821×864 image) ────────────────────────────────
const P = {
  vol:     { left: "6.7%",  top: "35.8%", width: "16.0%", height: "34.0%" },
  tune:    { left: "77.6%", top: "36.5%", width: "16.0%", height: "34.0%" },
  display: { left: "22.7%", top: "40.1%", width: "54.5%", height: "18.1%" },
  presets: [
    { left: "28.0%", top: "61.0%", width: "6.0%", height: "7.9%" },
    { left: "35.5%", top: "60.9%", width: "6.0%", height: "8.4%" },
    { left: "43.0%", top: "61.2%", width: "6.0%", height: "7.7%" },
    { left: "50.8%", top: "60.9%", width: "6.1%", height: "8.4%" },
    { left: "58.5%", top: "60.8%", width: "5.8%", height: "8.3%" },
    { left: "66.0%", top: "60.8%", width: "5.8%", height: "8.2%" },
  ],
  btnPrev:  { left: "26.9%", top: "74.6%", width: "7.5%", height: "14.0%" },
  btnPlay:  { left: "37.2%", top: "73.4%", width: "9.5%", height: "17.0%" },
  btnNext:  { left: "49.3%", top: "74.7%", width: "7.5%", height: "14.0%" },
  btnFav:   { left: "59.0%", top: "74.6%", width: "7.5%", height: "14.0%" },
  btnPower: { left: "68.9%", top: "74.9%", width: "7.5%", height: "14.0%" },
};

// ─── Car radio position constants ─────────────────────────────────────────────
const P_CAR_GOLD = {
  vol:     { left: "17.2%", top: "22.5%", width: "16.0%", height: "34.0%" },
  tune:    { left: "76.2%", top: "24.2%", width: "16.0%", height: "34.0%" },
  display: { left: "34.8%", top: "20.0%", width: "39.2%", height: "32.3%" },
  presets: [
    { left: "32.3%", top: "56.5%", width: "6.0%", height: "7.9%" },
    { left: "39.7%", top: "56.6%", width: "6.0%", height: "8.4%" },
    { left: "47.8%", top: "57.0%", width: "6.0%", height: "7.7%" },
    { left: "55.2%", top: "57.3%", width: "6.1%", height: "8.4%" },
    { left: "62.8%", top: "56.4%", width: "5.8%", height: "8.3%" },
    { left: "70.1%", top: "57.2%", width: "5.8%", height: "8.2%" },
  ],
  btnPrev:  { left: "38.9%", top: "74.0%", width: "7.5%", height: "14.0%" },
  btnPlay:  { left: "49.6%", top: "73.1%", width: "9.5%", height: "17.0%" },
  btnNext:  { left: "62.3%", top: "75.0%", width: "7.5%", height: "14.0%" },
  btnFav:   { left: "74.8%", top: "74.1%", width: "7.5%", height: "14.0%" },
  btnPower: { left: "84.3%", top: "73.6%", width: "7.5%", height: "14.0%" },
};

const P_CAR_BLACK = {
  vol:     { left: "15.2%", top: "22.5%", width: "16.0%", height: "34.0%" },
  tune:    { left: "70.7%", top: "24.4%", width: "16.0%", height: "34.0%" },
  display: { left: "33.9%", top: "18.8%", width: "34.4%", height: "32.4%" },
  presets: [
    { left: "30.2%", top: "57.2%", width: "6.0%", height: "7.9%" },
    { left: "36.9%", top: "56.5%", width: "6.0%", height: "8.4%" },
    { left: "44.3%", top: "56.1%", width: "6.0%", height: "7.7%" },
    { left: "51.0%", top: "56.1%", width: "6.1%", height: "8.4%" },
    { left: "58.4%", top: "55.7%", width: "5.8%", height: "8.3%" },
    { left: "64.9%", top: "55.9%", width: "5.8%", height: "8.2%" },
  ],
  btnPrev:  { left: "36.1%", top: "74.8%", width: "7.5%", height: "14.0%" },
  btnPlay:  { left: "46.6%", top: "72.6%", width: "9.5%", height: "17.0%" },
  btnNext:  { left: "58.1%", top: "73.7%", width: "7.5%", height: "14.0%" },
  btnFav:   { left: "69.1%", top: "74.8%", width: "7.5%", height: "14.0%" },
  btnPower: { left: "77.7%", top: "74.9%", width: "7.5%", height: "14.0%" },
};

// ─── Portrait mobile position constants (calibrate after deploy) ──────────────
const P_PORTRAIT = {
  vol:     { left: "2.5%",  top: "37.0%", width: "14.0%", height: "12.0%" },
  tune:    { left: "83.5%", top: "37.0%", width: "14.0%", height: "12.0%" },
  display: { left: "10.0%", top: "26.5%", width: "80.0%", height: "14.0%" },
  presets: [
    { left: "17.0%", top: "42.5%", width: "9.5%", height: "6.0%" },
    { left: "27.5%", top: "42.5%", width: "9.5%", height: "6.0%" },
    { left: "38.0%", top: "42.5%", width: "9.5%", height: "6.0%" },
    { left: "48.5%", top: "42.5%", width: "9.5%", height: "6.0%" },
    { left: "59.0%", top: "42.5%", width: "9.5%", height: "6.0%" },
    { left: "69.5%", top: "42.5%", width: "9.5%", height: "6.0%" },
  ],
  btnPrev:  { left: "17.0%", top: "57.0%", width: "17.0%", height: "12.0%" },
  btnPlay:  { left: "37.5%", top: "56.0%", width: "25.0%", height: "14.0%" },
  btnNext:  { left: "66.0%", top: "57.0%", width: "17.0%", height: "12.0%" },
  btnFav:   { left: "17.0%", top: "70.5%", width: "17.0%", height: "10.0%" },
  btnPower: { left: "66.0%", top: "70.5%", width: "17.0%", height: "10.0%" },
};

// ─── Skin definitions ─────────────────────────────────────────────────────────
export const SKINS = [
  { id: "wood",             label: "Dark Wood",       src: "/radio/radio-face.png",             p: P           },
  { id: "cream",            label: "Cream",           src: "/radio/radio-face-cream.png",       p: P           },
  { id: "black",            label: "Black Chrome",    src: "/radio/radio-face-black.png",       p: P           },
  { id: "car-gold",         label: "Car (Gold)",      src: "/radio/radio-car-gold.png",         p: P_CAR_GOLD  },
  { id: "car-black",        label: "Car (Black)",     src: "/radio/radio-car-black.png",        p: P_CAR_BLACK },
  { id: "mobile-portrait",  label: "Mobile Portrait", src: "/radio/radio-mobile-portrait.png",  p: P_PORTRAIT  },
] as const;
export type SkinId = typeof SKINS[number]["id"];

// ─── Screen mode detection ─────────────────────────────────────────────────────
export type ScreenMode = "desktop" | "portrait-mobile" | "landscape-mobile";
export function useScreenMode(): ScreenMode {
  const check = (): ScreenMode => {
    const w = window.innerWidth, h = window.innerHeight;
    if (w >= 900) return "desktop";
    return w > h ? "landscape-mobile" : "portrait-mobile";
  };
  const [mode, setMode] = React.useState<ScreenMode>(check);
  useEffect(() => {
    const handler = () => setMode(check());
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, []);
  return mode;
}

// ─── Position utilities (for calibration mode) ────────────────────────────────
type PosObj = { left: string; top: string; width: string; height: string };
type NumPos = { left: number; top: number; width: number; height: number };
const toNum = (p: PosObj): NumPos => ({
  left: parseFloat(p.left), top: parseFloat(p.top),
  width: parseFloat(p.width), height: parseFloat(p.height),
});
const toStr = (p: NumPos): PosObj => ({
  left: `${p.left.toFixed(1)}%`, top: `${p.top.toFixed(1)}%`,
  width: `${p.width.toFixed(1)}%`, height: `${p.height.toFixed(1)}%`,
});

// ─── Draggable calibration overlay ───────────────────────────────────────────
function CalibOverlay({
  pos, onChange, color, label, circle, containerRef,
}: {
  pos: PosObj;
  onChange: (p: PosObj) => void;
  color: string;
  label: string;
  circle?: boolean;
  containerRef: RefObject<HTMLDivElement>;
}) {
  const dragRef = useRef<{
    type: "move" | "br";
    startX: number; startY: number; startPos: NumPos;
  } | null>(null);

  const getSize = () => {
    const el = containerRef.current;
    return el ? { w: el.offsetWidth, h: el.offsetHeight } : { w: 1, h: 1 };
  };

  const onDown = (e: React.PointerEvent<HTMLElement>, type: "move" | "br") => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, startPos: toNum(pos) };
  };

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    const { w, h } = getSize();
    const dx = (e.clientX - dragRef.current.startX) / w * 100;
    const dy = (e.clientY - dragRef.current.startY) / h * 100;
    const sp = dragRef.current.startPos;
    const np: NumPos = dragRef.current.type === "move"
      ? { left: sp.left + dx, top: sp.top + dy, width: sp.width, height: sp.height }
      : { left: sp.left, top: sp.top, width: Math.max(2, sp.width + dx), height: Math.max(2, sp.height + dy) };
    onChange(toStr(np));
  };

  const onUp = () => { dragRef.current = null; };

  return (
    <div
      style={{
        position: "absolute",
        left: pos.left, top: pos.top, width: pos.width, height: pos.height,
        background: `${color}55`,
        border: `2px solid ${color}`,
        borderRadius: circle ? "50%" : 4,
        cursor: "move",
        zIndex: 20,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
      }}
      onPointerDown={(e) => onDown(e, "move")}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span style={{
        fontSize: 8, color: "#fff", fontWeight: 700,
        textShadow: "0 0 4px #000", pointerEvents: "none", userSelect: "none",
        textAlign: "center", lineHeight: 1.2,
      }}>
        {label}
      </span>
      {/* Bottom-right resize handle (not for circles) */}
      {!circle && (
        <div
          style={{
            position: "absolute", bottom: -5, right: -5,
            width: 10, height: 10,
            background: "#fff", border: `2px solid ${color}`,
            borderRadius: 2, cursor: "se-resize", zIndex: 21,
          }}
          onPointerDown={(e) => { e.stopPropagation(); onDown(e, "br"); }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}
    </div>
  );
}

// ─── Invisible drag-to-rotate knob ───────────────────────────────────────────
function PhotoKnob({
  value, onChange, ariaLabel, pos, onLongPress,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  pos: PosObj;
  onLongPress?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ y: number; x: number; v: number } | null>(null);
  const latestV = useRef(value);
  latestV.current = value;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFired = useRef(false);
  const holdOrigin = useRef<{ x: number; y: number } | null>(null);

  const cancelHold = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        position: "absolute",
        ...pos,
        borderRadius: "50%",
        cursor: dragging ? "grabbing" : "grab",
        outline: DEBUG_OVERLAYS ? "2px solid #00aaff" : "none",
        background: DEBUG_OVERLAYS ? "rgba(0,100,255,0.30)" : "transparent",
      }}
      className="touch-none focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-0"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        startRef.current = { y: e.clientY, x: e.clientX, v: value };
        setDragging(true);
        if (onLongPress) {
          holdFired.current = false;
          holdOrigin.current = { x: e.clientX, y: e.clientY };
          holdTimer.current = setTimeout(() => {
            holdFired.current = true;
            onLongPress();
          }, 600);
        }
      }}
      onPointerMove={(e) => {
        if (!startRef.current) return;
        const delta = (startRef.current.y - e.clientY) + (e.clientX - startRef.current.x);
        onChange(clamp(startRef.current.v + delta * 0.5));
        // Cancel hold if knob was dragged significantly
        if (holdOrigin.current) {
          const dx = Math.abs(e.clientX - holdOrigin.current.x);
          const dy = Math.abs(e.clientY - holdOrigin.current.y);
          if (dx > 8 || dy > 8) cancelHold();
        }
      }}
      onPointerUp={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
        startRef.current = null;
        cancelHold();
      }}
      onPointerCancel={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
        startRef.current = null;
        cancelHold();
      }}
      onWheel={(e) => {
        e.preventDefault();
        onChange(clamp(latestV.current + (e.deltaY < 0 ? 4 : -4)));
      }}
      onKeyDown={(e) => {
        const step = 4;
        const map: Record<string, number> = {
          ArrowUp: step, ArrowRight: step, PageUp: step * 3,
          ArrowDown: -step, ArrowLeft: -step, PageDown: -step * 3,
        };
        if (e.key in map) { e.preventDefault(); onChange(clamp(latestV.current + map[e.key])); }
        if (e.key === "Home") { e.preventDefault(); onChange(0); }
        if (e.key === "End") { e.preventDefault(); onChange(100); }
      }}
    />
  );
}

// ─── Invisible preset button with hold-to-store ───────────────────────────────
function PhotoPreset({
  index, active, station, powered, onRecall, onStore, pos, onHoverStart, onHoverEnd,
}: {
  index: number;
  active: boolean;
  station: CabinetStation | null;
  powered: boolean;
  onRecall: (i: number) => void;
  onStore: (i: number) => void;
  pos: PosObj;
  onHoverStart?: (name: string) => void;
  onHoverEnd?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const [flash, setFlash] = useState(false);
  const lit = active || flash;

  const store = () => {
    onStore(index);
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
  };

  return (
    <button
      type="button"
      aria-label={`Preset ${index + 1}${station ? `, ${station.name}` : ", empty"}. Hold or Shift+click to store.`}
      aria-pressed={active}
      disabled={!powered}
      title={station ? station.name : `Preset ${index + 1} — hold to save current station`}
      style={{
        position: "absolute",
        ...pos,
        background: DEBUG_OVERLAYS
          ? "rgba(255,50,50,0.35)"
          : lit
            ? "rgba(232,198,122,0.08)"   // active: keep image button visible, just tint amber
            : "rgba(0,0,0,0.52)",         // inactive: dark overlay dims the image button
        border: "none",
        borderRadius: "4px",
        cursor: powered ? "pointer" : "default",
        boxShadow: lit
          ? "inset 0 0 16px rgba(232,198,122,0.85), 0 0 10px rgba(232,198,122,0.55)"
          : "none",
        outline: DEBUG_OVERLAYS ? "2px solid red" : "none",
        transition: "background 0.2s, box-shadow 0.2s",
      }}
      className="focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-0 touch-manipulation"
      onPointerDown={() => {
        if (!powered) return;
        held.current = false;
        timer.current = setTimeout(() => { held.current = true; store(); }, 600);
      }}
      onPointerUp={() => { if (timer.current) clearTimeout(timer.current); }}
      onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}
      onPointerCancel={() => { if (timer.current) clearTimeout(timer.current); }}
      onClick={(e) => {
        if (!powered) return;
        if (held.current) { held.current = false; return; }
        if (e.shiftKey) return store();
        onRecall(index);
      }}
      onPointerEnter={() => { if (station?.name) onHoverStart?.(station.name); }}
      onPointerLeave={() => { onHoverEnd?.(); if (timer.current) clearTimeout(timer.current); }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// ─── Sliders button: tap → Amazon affiliate shop, hold → power toggle ────────
function PhotoSlidersBtn({
  onSliders, onPowerHold, powered, pos,
}: {
  onSliders: () => void;
  onPowerHold: () => void;
  powered: boolean;
  pos: PosObj;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  return (
    <button
      type="button"
      aria-label="Shop Amazon music (hold to toggle power)"
      title="Shop Amazon music (hold to toggle power)"
      style={{
        position: "absolute",
        ...pos,
        background: DEBUG_OVERLAYS ? "rgba(255,120,0,0.30)" : "transparent",
        border: "none",
        borderRadius: "50%",
        cursor: "pointer",
        boxShadow: powered
          ? "inset 0 0 12px rgba(232,198,122,0.45), 0 0 8px rgba(232,198,122,0.3)"
          : "inset 0 0 10px rgba(255,80,80,0.35)",
        outline: DEBUG_OVERLAYS ? "2px solid orange" : "none",
        transition: "box-shadow 0.2s",
      }}
      className="focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-0 touch-manipulation"
      onPointerDown={() => {
        held.current = false;
        timer.current = setTimeout(() => { held.current = true; onPowerHold(); }, 600);
      }}
      onPointerUp={() => { if (timer.current) clearTimeout(timer.current); }}
      onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}
      onPointerCancel={() => { if (timer.current) clearTimeout(timer.current); }}
      onClick={() => { if (held.current) { held.current = false; return; } onSliders(); }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// ─── Invisible playback button with glow on active ────────────────────────────
function PhotoBtn({
  ariaLabel, onClick, active, pos, disabled = false, children,
}: {
  ariaLabel: string;
  onClick: () => void;
  active?: boolean;
  pos: PosObj;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        position: "absolute",
        ...pos,
        background: DEBUG_OVERLAYS ? "rgba(150,0,255,0.30)" : "transparent",
        border: "none",
        borderRadius: "50%",
        cursor: disabled ? "default" : "pointer",
        boxShadow: active ? "inset 0 0 22px rgba(232,198,122,0.85), 0 0 16px rgba(232,198,122,0.65), 0 0 5px rgba(232,198,122,0.95)" : "inset 0 0 10px rgba(0,0,0,0.45)",
        outline: DEBUG_OVERLAYS ? "2px solid magenta" : "none",
        transition: "box-shadow 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      className="focus-visible:ring-2 focus-visible:ring-amber-300/60 focus-visible:ring-offset-0 active:scale-95 transition-transform touch-manipulation"
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface RadioCabinetPhotoProps {
  currentStation: CabinetStation | null;
  stations?: CabinetStation[];
  powered?: boolean;
  isPlaying?: boolean;
  isLoading?: boolean;
  error?: string | null;
  volume?: number;
  favorites?: string[];
  presets?: (CabinetStation | null)[];
  activePreset?: number | null;
  isAdmin?: boolean;
  /** When true, renders the cabinet image + display only — no interactive overlays. */
  passive?: boolean;
  /** Episode/track title to show below the station name in the display (e.g. for ORW). */
  nowPlayingTitle?: string;
  /** Controlled skin — when provided the internal skin switcher is hidden (parent renders it). */
  skinId?: SkinId;
  /** Called when the skin should change (controlled mode). */
  onSkinChange?: (id: SkinId) => void;
  /** Ref that will be set to a function that triggers calibration mode from outside. */
  calibrateFnRef?: React.MutableRefObject<(() => void) | null>;
  /** Station to save when a preset is stored (defaults to currentStation). Used by ORW to store shows instead of episodes. */
  storeStation?: CabinetStation | null;
  onPower?: () => void;
  onPlayPause?: () => void;
  onSelectStation?: (station: CabinetStation) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onVolumeChange?: (v: number) => void;
  onToggleFavorite?: (id: string) => void;
  onSetPreset?: (index: number, station: CabinetStation) => void;
  onRecallPreset?: (index: number) => void;
  /** Called when user clicks the NOW PLAYING display (e.g. scroll to station). */
  onDisplayClick?: () => void;
  /** Called on short-tap of the sliders button (defaults to Amazon music affiliate). */
  onSliders?: () => void;
}

export default function RadioCabinetPhoto({
  currentStation,
  stations = [],
  powered = true,
  isPlaying = false,
  isLoading = false,
  error = null,
  volume = 50,
  favorites = [],
  presets = Array(6).fill(null),
  activePreset = null,
  isAdmin = false,
  passive = false,
  nowPlayingTitle,
  skinId: controlledSkinId,
  onSkinChange,
  calibrateFnRef,
  storeStation,
  onPower = () => {},
  onPlayPause = () => {},
  onSelectStation = () => {},
  onPrev = () => {},
  onNext = () => {},
  onVolumeChange = () => {},
  onToggleFavorite = () => {},
  onSetPreset = () => {},
  onRecallPreset = () => {},
  onDisplayClick,
  onSliders = () => { window.open("https://www.amazon.com/music?tag=urlinctm-20", "_blank"); },
}: RadioCabinetPhotoProps) {
  const screenMode = useScreenMode();
  const isLandscapeMobile = screenMode === "landscape-mobile";
  const isPortraitMobile  = screenMode === "portrait-mobile";

  // Initialize skin based on screen mode at mount time
  const [internalSkinId, setInternalSkinId] = useState<SkinId>(() => {
    if (typeof window === "undefined") return "wood";
    const w = window.innerWidth, h = window.innerHeight;
    if (w < 900 && w > h) return "car-gold";
    if (w < 900 && h >= w) return "mobile-portrait";
    return "wood";
  });

  // Controlled vs uncontrolled: if parent passes skinId+onSkinChange, use those
  const isControlled = onSkinChange !== undefined;
  const skinId = isControlled ? (controlledSkinId ?? internalSkinId) : internalSkinId;
  const setSkinId = (id: SkinId) => {
    setInternalSkinId(id);
    if (isControlled) onSkinChange(id);
  };

  // Auto-switch on orientation change while mounted
  const prevMode = useRef(screenMode);
  useEffect(() => {
    if (screenMode === prevMode.current) return;
    prevMode.current = screenMode;
    if (screenMode === "landscape-mobile") {
      const next = internalSkinId === "car-black" ? "car-black" : "car-gold";
      setInternalSkinId(next);
      if (isControlled) onSkinChange?.(next);
    } else if (screenMode === "portrait-mobile") {
      setInternalSkinId("mobile-portrait");
      if (isControlled) onSkinChange?.("mobile-portrait");
    } else {
      const next = (internalSkinId === "car-gold" || internalSkinId === "car-black" || internalSkinId === "mobile-portrait") ? "wood" : internalSkinId;
      setInternalSkinId(next);
      if (isControlled) onSkinChange?.(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenMode]);

  const skin = SKINS.find(s => s.id === skinId) ?? SKINS[0];
  const activeP = skin.p;
  const isFav = currentStation ? favorites.includes(currentStation.id) : false;
  const [hoverPreview, setHoverPreview] = useState<string | null>(null);

  // ── Calibration state (admin only) ──────────────────────────────────────────
  const [calibrating, setCalibrating] = useState(false);

  // Expose calibration trigger to parent
  useEffect(() => {
    if (calibrateFnRef) calibrateFnRef.current = () => setCalibrating(true);
    return () => { if (calibrateFnRef) calibrateFnRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calibrateFnRef]);

  const loadSavedCalib = (p: typeof activeP) => {
    try {
      const saved = localStorage.getItem(`radio-calib-${skinId}`);
      if (saved) return JSON.parse(saved) as typeof calibPos;
    } catch {}
    return {
      vol: toNum(p.vol), tune: toNum(p.tune), display: toNum(p.display),
      presets: p.presets.map(toNum),
      btnPrev: toNum(p.btnPrev), btnPlay: toNum(p.btnPlay), btnNext: toNum(p.btnNext),
      btnFav: toNum(p.btnFav), btnPower: toNum(p.btnPower),
    };
  };

  const [calibPos, setCalibPos] = useState(() => loadSavedCalib(activeP));
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reload calibration when skin changes
  useEffect(() => {
    setCalibPos(loadSavedCalib(skin.p));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinId]);

  const updateCalib = (key: keyof typeof calibPos, idx?: number) => (pos: PosObj) => {
    setCalibPos(prev => {
      if (key === "presets" && idx !== undefined) {
        const arr = [...prev.presets];
        arr[idx] = toNum(pos);
        return { ...prev, presets: arr };
      }
      return { ...prev, [key]: toNum(pos) };
    });
  };

  const saveCalib = () => {
    try { localStorage.setItem(`radio-calib-${skinId}`, JSON.stringify(calibPos)); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const exitCalib = () => {
    setCalibrating(false);
    setCalibPos(loadSavedCalib(skin.p));
  };

  const copyJson = () => {
    const s = (p: NumPos) =>
      `{ left: "${p.left.toFixed(1)}%", top: "${p.top.toFixed(1)}%", width: "${p.width.toFixed(1)}%", height: "${p.height.toFixed(1)}%" }`;
    const json = `const P = {
  vol:     ${s(calibPos.vol)},
  tune:    ${s(calibPos.tune)},
  display: ${s(calibPos.display)},
  presets: [
${calibPos.presets.map(p => `    ${s(p)}`).join(",\n")},
  ],
  btnPrev:  ${s(calibPos.btnPrev)},
  btnPlay:  ${s(calibPos.btnPlay)},
  btnNext:  ${s(calibPos.btnNext)},
  btnFav:   ${s(calibPos.btnFav)},
  btnPower: ${s(calibPos.btnPower)},
};`;
    void navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Active positions: always use calibPos (which loads saved or falls back to hardcoded)
  const AP = {
    vol:     toStr(calibPos.vol),
    tune:    toStr(calibPos.tune),
    display: toStr(calibPos.display),
    presets: calibPos.presets.map(toStr),
    btnPrev:  toStr(calibPos.btnPrev),
    btnPlay:  toStr(calibPos.btnPlay),
    btnNext:  toStr(calibPos.btnNext),
    btnFav:   toStr(calibPos.btnFav),
    btnPower: toStr(calibPos.btnPower),
  };

  // ── Tune knob state ──────────────────────────────────────────────────────────
  const stationIndex = Math.max(0, stations.findIndex((s) => s.id === currentStation?.id));
  const slot = stations.length > 1 ? (stationIndex / (stations.length - 1)) * 100 : 50;
  const [tunePos, setTunePos] = useState(slot);
  const [tuning, setTuning] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!tuning) setTunePos(slot); }, [slot, tuning]);
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);

  const handleTune = (v: number) => {
    if (!powered || !stations.length) return;
    setTuning(true);
    setTunePos(v);
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      setTuning(false);
      const i = Math.round((v / 100) * (stations.length - 1));
      if (stations[i] && stations[i].id !== currentStation?.id) onSelectStation(stations[i]);
    }, 450);
  };

  // ── Display blink ────────────────────────────────────────────────────────────
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => setBlink(b => !b), 800);
    return () => clearInterval(id);
  }, [isPlaying]);

  const statusText = !powered ? "OFF"
    : error ? "ERROR"
    : isLoading ? "BUFFERING…"
    : isPlaying ? "NOW PLAYING"
    : currentStation ? "PAUSED"
    : "STANDBY";

  const radioInner = (
    <div
      ref={containerRef}
      role="region"
      aria-label="URLinc vintage radio"
      style={{
        position: "relative",
        width: isLandscapeMobile ? "auto" : "100%",
        height: isLandscapeMobile ? "100dvh" : "auto",
        userSelect: "none",
        borderRadius: isLandscapeMobile ? 0 : 8,
        overflow: "hidden",
        maxWidth: isPortraitMobile ? "420px" : undefined,
        margin: isPortraitMobile ? "0 auto" : undefined,
      }}
    >
      {/* Radio face photo */}
      <img
        src={skin.src}
        alt={`Vintage radio cabinet — ${skin.label}`}
        draggable={false}
        style={{
          display: "block",
          width: isLandscapeMobile ? "auto" : "100%",
          height: isLandscapeMobile ? "100dvh" : "auto",
          maxWidth: isPortraitMobile ? "100%" : undefined,
          opacity: powered ? 1 : 0.55,
          transition: "opacity 0.5s",
        }}
      />

      {/* ── Display overlay ─────────────────────────────────────────────── */}
      <div
        aria-live="polite"
        role={onDisplayClick && powered && currentStation ? "button" : undefined}
        tabIndex={onDisplayClick && powered && currentStation ? 0 : undefined}
        aria-label={onDisplayClick && powered && currentStation ? `Scroll to ${currentStation.name}` : undefined}
        onClick={onDisplayClick && powered && currentStation ? onDisplayClick : undefined}
        onKeyDown={onDisplayClick && powered && currentStation ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDisplayClick(); } } : undefined}
        style={{
          position: "absolute",
          ...AP.display,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "3% 5%",
          background: "rgba(0,0,0,0.38)",
          borderRadius: "4px",
          outline: DEBUG_OVERLAYS ? "2px solid yellow" : "none",
          pointerEvents: onDisplayClick && powered && currentStation ? "auto" : "none",
          cursor: onDisplayClick && powered && currentStation ? "pointer" : "default",
          opacity: powered ? 1 : 0,
          transition: "opacity 0.4s",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginBottom: "2%" }}>
          {isPlaying && (
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#ff4444", boxShadow: "0 0 6px #ff4444",
              opacity: blink ? 1 : 0.3, transition: "opacity 0.3s", flexShrink: 0,
            }} />
          )}
          <span style={{
            fontFamily: "'Courier New', monospace",
            fontSize: "clamp(7px, 1.2vw, 13px)",
            letterSpacing: "0.2em",
            color: error ? "#f87171" : "#9c7d44",
            textTransform: "uppercase",
          }}>{statusText}</span>
        </div>
        <div style={{
          fontFamily: "'Georgia', serif",
          fontSize: "clamp(10px, 2vw, 22px)",
          fontWeight: "bold",
          color: "#e8c67a",
          textShadow: "0 0 10px rgba(232,198,122,0.8)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.2,
        }}>
          {hoverPreview ?? (currentStation ? currentStation.name : "— no station —")}
        </div>
        {nowPlayingTitle && nowPlayingTitle !== currentStation?.name && (
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: "clamp(6px, 0.85vw, 9px)",
            color: "#c8a85a",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginTop: "1%",
            letterSpacing: "0.03em",
          }}>
            {nowPlayingTitle}
          </div>
        )}
        {currentStation && (
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: "clamp(6px, 0.9vw, 10px)",
            color: "#9c7d44", marginTop: "3%",
            display: "flex", gap: "1em", letterSpacing: "0.05em",
          }}>
            <span>{currentStation.country}</span>
            {currentStation.genre && <span>{currentStation.genre}</span>}
            {currentStation.bitrate > 0 && <span>{currentStation.bitrate} kbps</span>}
          </div>
        )}
        {error && powered && (
          <div style={{ color: "#f87171", fontSize: "clamp(6px, 0.9vw, 10px)", marginTop: "2%" }}>
            ⚠ {error}
          </div>
        )}
      </div>

      {!passive && <>
      {/* ── Volume knob (hidden on portrait — real MetalKnob rendered below) */}
      {!isPortraitMobile && <PhotoKnob value={volume} onChange={onVolumeChange} ariaLabel={`Volume — ${Math.round(volume)}%`} pos={AP.vol} onLongPress={onPower} />}

      {/* ── Tune knob (hidden on portrait — real MetalKnob rendered below) */}
      {!isPortraitMobile && <PhotoKnob value={tunePos} onChange={handleTune} ariaLabel={`Tune — ${currentStation?.name ?? "no station"}`} pos={AP.tune} />}

      {/* ── Preset buttons ───────────────────────────────────────────────── */}
      {presets.map((p, i) => (
        <PhotoPreset
          key={i} index={i}
          active={activePreset === i && powered}
          station={p} powered={powered}
          pos={AP.presets[i]}
          onRecall={onRecallPreset}
          onStore={(idx) => { const s = storeStation ?? currentStation; if (s) onSetPreset(idx, s); }}
          onHoverStart={(name) => setHoverPreview(name)}
          onHoverEnd={() => setHoverPreview(null)}
        />
      ))}

      {/* ── Playback buttons ─────────────────────────────────────────────── */}
      <PhotoBtn ariaLabel="Previous station" onClick={onPrev} pos={AP.btnPrev} disabled={!powered} />
      <PhotoBtn ariaLabel={isPlaying ? "Pause" : "Play"} onClick={onPlayPause} active={isPlaying} pos={AP.btnPlay} disabled={!powered} />
      <PhotoBtn ariaLabel="Next station" onClick={onNext} pos={AP.btnNext} disabled={!powered} />
      <PhotoBtn ariaLabel={isFav ? "Remove from favorites" : "Add to favorites"} onClick={() => currentStation && onToggleFavorite(currentStation.id)} active={isFav} pos={AP.btnFav} disabled={!powered || !currentStation} />
      <PhotoSlidersBtn onSliders={onSliders} onPowerHold={onPower} powered={powered} pos={AP.btnPower} />
      </>}

      {/* ── Calibration overlays (admin only, when calibrating) ──────────── */}
      {calibrating && (
        <>
          <CalibOverlay pos={toStr(calibPos.vol)}     onChange={updateCalib("vol")}     color="#00aaff" label="VOL"     circle containerRef={containerRef} />
          <CalibOverlay pos={toStr(calibPos.tune)}    onChange={updateCalib("tune")}    color="#00aaff" label="TUNE"    circle containerRef={containerRef} />
          <CalibOverlay pos={toStr(calibPos.display)} onChange={updateCalib("display")} color="#ffdd00" label="DISPLAY"        containerRef={containerRef} />
          {calibPos.presets.map((p, i) => (
            <CalibOverlay key={i} pos={toStr(p)} onChange={updateCalib("presets", i)} color="#ff4444" label={`P${i+1}`} containerRef={containerRef} />
          ))}
          <CalibOverlay pos={toStr(calibPos.btnPrev)}  onChange={updateCalib("btnPrev")}  color="#cc44ff" label="PREV"  circle containerRef={containerRef} />
          <CalibOverlay pos={toStr(calibPos.btnPlay)}  onChange={updateCalib("btnPlay")}  color="#cc44ff" label="PLAY"  circle containerRef={containerRef} />
          <CalibOverlay pos={toStr(calibPos.btnNext)}  onChange={updateCalib("btnNext")}  color="#cc44ff" label="NEXT"  circle containerRef={containerRef} />
          <CalibOverlay pos={toStr(calibPos.btnFav)}   onChange={updateCalib("btnFav")}   color="#cc44ff" label="FAV"   circle containerRef={containerRef} />
          <CalibOverlay pos={toStr(calibPos.btnPower)} onChange={updateCalib("btnPower")} color="#ff8800" label="PWR"   circle containerRef={containerRef} />

          {/* Calibration control panel */}
          <div style={{
            position: "absolute", top: "2%", left: "50%", transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.85)", border: "1px solid #e8c67a",
            borderRadius: 8, padding: "6px 10px",
            display: "flex", gap: 8, alignItems: "center",
            zIndex: 30, whiteSpace: "nowrap",
          }}>
            <span style={{ color: "#e8c67a", fontSize: 11, fontWeight: 600 }}>⚙ CALIBRATE</span>
            <button
              type="button"
              onClick={saveCalib}
              style={{
                padding: "3px 10px", borderRadius: 4,
                background: saved ? "#22c55e" : "#3b82f6",
                color: "#fff", border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 700,
              }}
            >
              {saved ? "✓ Saved!" : "Save"}
            </button>
            <button
              type="button"
              onClick={copyJson}
              style={{
                padding: "3px 10px", borderRadius: 4,
                background: copied ? "#22c55e" : "#e8c67a",
                color: "#1a1a1a", border: "none", cursor: "pointer",
                fontSize: 11, fontWeight: 700,
              }}
            >
              {copied ? "✓ Copied!" : "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={exitCalib}
              style={{
                padding: "3px 10px", borderRadius: 4,
                background: "#444", color: "#fff",
                border: "none", cursor: "pointer", fontSize: 11,
              }}
            >
              Exit
            </button>
          </div>
        </>
      )}

      {/* ── Skin switcher + admin calibrate button ───────────────────────── */}
      {!passive && !isControlled && <div style={{
        position: "absolute", bottom: "3%", right: "2%",
        display: "flex", gap: 6, alignItems: "center", zIndex: 10,
      }}>
        {!calibrating && (
          <button
            type="button"
            title="Admin: calibrate hit targets"
            onClick={() => setCalibrating(true)}
            style={{
              width: 22, height: 22, borderRadius: "50%",
              background: "rgba(0,0,0,0.6)", border: "1px solid #e8c67a44",
              color: "#e8c67a", fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >⚙</button>
        )}
        {SKINS
          .filter(s => {
            if (screenMode === "landscape-mobile") return s.id === "car-gold" || s.id === "car-black";
            if (screenMode === "portrait-mobile")  return s.id === "mobile-portrait";
            return s.id !== "car-gold" && s.id !== "car-black" && s.id !== "mobile-portrait";
          })
          .map(s => (
            <button
              key={s.id}
              type="button"
              aria-label={`Switch to ${s.label} skin`}
              aria-pressed={skinId === s.id}
              onClick={() => setSkinId(s.id)}
              title={s.label}
              style={{
                width: 22, height: 22, borderRadius: "50%",
                border: skinId === s.id ? "2px solid #e8c67a" : "2px solid rgba(255,255,255,0.3)",
                boxShadow: skinId === s.id ? "0 0 6px rgba(232,198,122,0.7)" : "0 1px 3px rgba(0,0,0,0.5)",
                backgroundImage: `url(${s.src})`,
                backgroundSize: "200%", backgroundPosition: "center",
                cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            />
          ))}
      </div>}

      {/* ── Screen-reader status ─────────────────────────────────────────── */}
      <div className="sr-only" role="status">
        {currentStation ? `${statusText}. ${currentStation.name}${error ? `. ${error}` : ""}` : statusText}
      </div>
    </div>
  );

  if (isLandscapeMobile) {
    return createPortal(
      <div style={{
        position: "fixed", top: 0, left: 0,
        width: "100dvw", height: "100dvh",
        zIndex: 2147483647,
        background: "#000",
        display: "flex",
        alignItems: "center", justifyContent: "center",
        userSelect: "none",
        overflow: "hidden",
      }}>
        {/* Scale the radio to fill the full screen height, let it clip sides if needed */}
        <div style={{
          height: "100dvh",
          width: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {radioInner}
        </div>
      </div>,
      document.body
    );
  }

  // ── Portrait mobile: photo backdrop + real rendered knobs below ─────────────
  if (isPortraitMobile) {
    return (
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        {radioInner}

        {/* Real VOL / PhoneDial / TUNE bar — no calibration needed */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px 6px",
          background: "linear-gradient(180deg,#1c1409,#0a0704)",
          borderTop: "1px solid #3a2a14",
          borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
        }}>
          <MetalKnob
            label="VOL"
            ariaLabel={`Volume — ${Math.round(volume)}%`}
            value={volume}
            onChange={onVolumeChange}
            valueText={`${Math.round(volume)} percent`}
            size={52}
          />
          <div style={{ flex: 1, padding: "0 12px" }}>
            <PhoneDial position={tunePos} powered={powered} />
          </div>
          <MetalKnob
            label="TUNE"
            ariaLabel={`Tune — ${currentStation?.name ?? "no station"}`}
            value={tunePos}
            onChange={handleTune}
            valueText={currentStation?.name ?? undefined}
            size={52}
          />
        </div>

        <p className="text-center text-[11px] mt-1.5" style={{ color: "#b8995a" }}>
          Tap a preset to recall · hold (or Shift+click) to store
        </p>
      </div>
    );
  }

  return (
    <div>
      {radioInner}
      <p className="text-center text-[11px] mt-1.5" style={{ color: "#b8995a" }}>
        Drag the knobs to tune · tap a preset to recall · hold (or Shift+click) to store
      </p>
    </div>
  );
}
