// One card in the memory game: a CSS 3D flip between a face-down back and the
// emoji face. Ported from the hunt-link-quest Base44 project, types added.
export default function MemoryCard({
  emoji,
  flipped,
  matched,
  onClick,
}: {
  emoji: string;
  flipped: boolean;
  matched: boolean;
  onClick: () => void;
}) {
  const isUp = flipped || matched;
  return (
    <button
      onClick={onClick}
      disabled={isUp}
      aria-label={isUp ? emoji : "Face-down card"}
      className="aspect-square [perspective:1000px]"
    >
      <div
        className={`relative h-full w-full rounded-xl transition-transform duration-300 [transform-style:preserve-3d] ${
          isUp ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/10 bg-[#1E293B] [backface-visibility:hidden]">
          <span className="text-2xl text-[#D4AF37]">?</span>
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center rounded-xl border text-3xl [backface-visibility:hidden] [transform:rotateY(180deg)] ${
            matched ? "border-green-500/60 bg-green-500/10" : "border-white/10 bg-[#1A1A1A]"
          }`}
        >
          {emoji}
        </div>
      </div>
    </button>
  );
}
