import { TAB, piecePath, type JigsawEdges } from "@/lib/jigsawShapes";

// Renders one interlocking jigsaw piece: an SVG shaped by a knobbed path,
// clipped from the full source image, sized to overflow its cell so tabs
// can poke into neighboring cells.
//
// Ported from the hunt-link-quest Base44 project. Unchanged apart from types.
export default function PuzzlePiece({
  id,
  rows,
  cols,
  imageUrl,
  edges,
  locked = false,
  dragging = false,
  brightness = 1,
  className = "",
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  id: number;
  rows: number;
  cols: number;
  imageUrl: string;
  edges: JigsawEdges;
  locked?: boolean;
  dragging?: boolean;
  /** Multiplier applied to the artwork only, so the piece outline and its
   *  drop shadow keep their contrast against the board at any setting. */
  brightness?: number;
  className?: string;
  onPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const row = Math.floor(id / cols);
  const col = id % cols;
  const d = piecePath(row, col, rows, cols, edges);
  const clipId = `piece-clip-${rows}x${cols}-${id}`;
  const vx = col - TAB;
  const vy = row - TAB;
  const vSize = 1 + TAB * 2;

  return (
    <div
      data-piece-id={id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute ${locked ? "" : "cursor-grab active:cursor-grabbing"} ${dragging ? "z-10 scale-105" : ""} ${className}`}
      style={{
        left: `${-TAB * 100}%`,
        top: `${-TAB * 100}%`,
        width: `${vSize * 100}%`,
        height: `${vSize * 100}%`,
        touchAction: locked ? undefined : "none",
        filter: dragging
          ? "drop-shadow(0 10px 14px rgba(0,0,0,0.6))"
          : "drop-shadow(0 2px 5px rgba(0,0,0,0.55))",
      }}
    >
      <svg viewBox={`${vx} ${vy} ${vSize} ${vSize}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: "visible" }}>
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={d} />
          </clipPath>
        </defs>
        <path d={d} fill="#2a2a2a" />
        <image
          href={imageUrl}
          x={0}
          y={0}
          width={cols}
          height={rows}
          preserveAspectRatio="none"
          clipPath={`url(#${clipId})`}
          style={brightness === 1 ? undefined : { filter: `brightness(${brightness})` }}
        />
        <path d={d} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={0.015} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
