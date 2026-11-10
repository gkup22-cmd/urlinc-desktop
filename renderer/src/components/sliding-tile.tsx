// Renders one sliding-puzzle tile as a slice of the full source image,
// absolutely positioned via `style` (left/top/width/height) so moving it
// between grid cells animates as a slide instead of a teleport.
//
// Ported from the hunt-link-quest Base44 project, unchanged apart from types.
export default function SlidingTile({
  pieceId,
  rows,
  cols,
  imageUrl,
  onClick,
  style,
}: {
  pieceId: number;
  rows: number;
  cols: number;
  imageUrl: string;
  onClick: () => void;
  style: React.CSSProperties;
}) {
  const row = Math.floor(pieceId / cols);
  const col = pieceId % cols;
  // Background-position percentages address the slice by proportion rather
  // than pixels, so a tile shows the right part of the picture at any size.
  const bgPosX = cols > 1 ? (col / (cols - 1)) * 100 : 0;
  const bgPosY = rows > 1 ? (row / (rows - 1)) * 100 : 0;

  return (
    <button
      onClick={onClick}
      aria-label={`Tile ${pieceId + 1}`}
      className="absolute border border-black/40 bg-cover transition-all duration-200 ease-out hover:brightness-110"
      style={{
        ...style,
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${bgPosX}% ${bgPosY}%`,
      }}
    />
  );
}
