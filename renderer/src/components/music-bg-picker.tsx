import { MUSIC_BACKGROUNDS, type MusicBgKey } from "@/hooks/useMusicBackground";

// ── Existing picker (used in the inline toolbar) ──────────────────────────────
export function MusicBgPicker({
  current,
  onChange,
}: {
  current: MusicBgKey;
  onChange: (key: MusicBgKey) => void;
}) {
  return (
    <div className="flex items-center gap-1.5" title="Switch scene background">
      {(Object.keys(MUSIC_BACKGROUNDS) as MusicBgKey[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          title={MUSIC_BACKGROUNDS[key].label}
          className={`relative w-9 h-6 rounded overflow-hidden transition-all ${
            current === key
              ? "ring-2 ring-primary ring-offset-1 ring-offset-black scale-110 shadow-lg"
              : "opacity-55 hover:opacity-90 ring-1 ring-white/20"
          }`}
        >
          <img
            src={MUSIC_BACKGROUNDS[key].src}
            className="w-full h-full object-cover"
            alt={MUSIC_BACKGROUNDS[key].label}
          />
        </button>
      ))}
    </div>
  );
}

// ── Per-tab picker (used in Settings — image selection only) ──────────────────
export function TabBgPicker({
  label,
  current,
  onChange,
}: {
  label: string;
  current: MusicBgKey;
  onChange: (key: MusicBgKey) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.keys(MUSIC_BACKGROUNDS) as MusicBgKey[]).map((key) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={MUSIC_BACKGROUNDS[key].label}
            className={`relative w-16 h-10 rounded-lg overflow-hidden transition-all ${
              current === key
                ? "ring-2 ring-primary ring-offset-1 ring-offset-black scale-105 shadow-lg"
                : "opacity-55 hover:opacity-90 ring-1 ring-white/20"
            }`}
          >
            <img
              src={MUSIC_BACKGROUNDS[key].src}
              className="w-full h-full object-cover"
              alt={MUSIC_BACKGROUNDS[key].label}
            />
            <span className="absolute bottom-0 inset-x-0 text-[9px] text-center text-white bg-black/50 py-0.5 truncate px-1">
              {MUSIC_BACKGROUNDS[key].label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Background image renderer ─────────────────────────────────────────────────
export function MusicPageBg({ src, brightness = 40 }: { src: string; brightness?: number }) {
  const b = brightness / 100;
  const imgOpacity = 0.15 + b * 0.75;
  const overlayAlpha = (0.65 - b * 0.55).toFixed(2);
  return (
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <img
        key={src}
        src={src}
        className="absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-in-out"
        style={{
          opacity: imgOpacity,
          transition: "opacity 0.2s ease",
          objectPosition: src.includes("Taylermade") ? "70% 20%" : "center center",
        }}
        alt=""
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: `rgba(0,0,0,${overlayAlpha})`,
          transition: "background-color 0.2s ease",
        }}
      />
    </div>
  );
}

// ── Solid color background renderer (used when images are off) ────────────────
export function MusicPageSolidBg({
  color,
  opacity = 40,
}: {
  color: string;
  opacity?: number;
}) {
  return (
    <div
      className="absolute inset-0 z-0 pointer-events-none"
      style={{
        backgroundColor: color,
        opacity: opacity / 100,
        transition: "opacity 0.2s ease, background-color 0.2s ease",
      }}
    />
  );
}
