import { useRef, useState } from "react";
import {
  scaledPoints, getRegions, normalizeRegions, polygonCentroid,
  type HuntItem, type Polygon,
} from "@/lib/polygon";

/**
 * Interactive image surface for the hunt game.
 * mode: 'draw'  -> clicks add polygon vertices for the active item
 * mode: 'play'  -> clicks are hit-tested by the parent
 * All geometry is stored normalized (0..1), so the same data works at any
 * rendered size and survives the image being displayed larger or smaller.
 *
 * Ported from the hunt-link-quest Base44 project; types added, logic intact.
 */
export default function ImageRegions({
  imageUrl,
  mode = "draw",
  items = [],
  activeIndex = -1,
  drawingPoints = [],
  foundIndices = new Set<number>(),
  onCanvasClick,
  onDims,
  fullscreen = false,
  hintIndex = -1,
}: {
  imageUrl: string;
  mode?: "draw" | "play";
  items?: HuntItem[];
  activeIndex?: number;
  drawingPoints?: Polygon;
  foundIndices?: Set<number>;
  onCanvasClick?: (x: number, y: number) => void;
  onDims?: (dims: { w: number; h: number }) => void;
  fullscreen?: boolean;
  hintIndex?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 1280, h: 800 });

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    const next = { w: el.naturalWidth || 1280, h: el.naturalHeight || 800 };
    setDims(next);
    if (onDims) onDims(next);
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!wrapRef.current || !onCanvasClick) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onCanvasClick(x, y);
  };

  const { w, h } = dims;
  const stroke = Math.max(2, Math.round(w / 400));

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/50 ${
        fullscreen ? "h-full w-auto max-w-full" : "w-full"
      }`}
      style={{ aspectRatio: `${w} / ${h}`, maxHeight: fullscreen ? "100%" : undefined }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          onLoad={handleLoad}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/30">
          No image
        </div>
      )}

      <svg
        data-hunt-canvas
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        style={{ cursor: mode === "draw" ? "crosshair" : "pointer" }}
        onClick={handleClick}
      >
        {items.map((item, i) => {
          const regions = normalizeRegions(getRegions(item), w, h);
          if (!regions.length) return null;
          const found = foundIndices.has(i);
          const isActive = i === activeIndex && mode === "draw";
          return regions.map((polygon, ri) => {
            if (!polygon || polygon.length < 3) return null;
            return (
              <polygon
                key={`${i}-${ri}`}
                points={scaledPoints(polygon, w, h)}
                fill={found ? "rgba(34,197,94,0.28)" : isActive ? "rgba(59,130,246,0.18)" : "transparent"}
                stroke={found ? "#22C55E" : isActive ? "#3B82F6" : "transparent"}
                strokeWidth={stroke}
              />
            );
          });
        })}

        {hintIndex >= 0 && items[hintIndex] && (() => {
          const regions = normalizeRegions(getRegions(items[hintIndex]), w, h);
          if (!regions.length) return null;
          const c = polygonCentroid(regions[0]);
          return (
            <circle
              cx={c.x * w}
              cy={c.y * h}
              r={stroke * 6}
              fill="rgba(212,175,55,0.25)"
              stroke="#D4AF37"
              strokeWidth={stroke}
              className="animate-pulse"
            />
          );
        })()}

        {mode === "draw" && drawingPoints.length > 0 && (
          <>
            <polyline
              points={scaledPoints(drawingPoints, w, h)}
              fill="rgba(59,130,246,0.12)"
              stroke="#3B82F6"
              strokeWidth={stroke}
              strokeDasharray={`${stroke * 3} ${stroke * 2}`}
            />
            {drawingPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x * w}
                cy={p.y * h}
                r={stroke * 2}
                fill={i === 0 ? "#22C55E" : "#3B82F6"}
                stroke="#fff"
                strokeWidth={1}
              />
            ))}
          </>
        )}
      </svg>
    </div>
  );
}
