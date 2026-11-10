const AMBER_DIM = "#9c7d44";

interface TuningDialProps {
  position: number;
  powered: boolean;
  tuning: boolean;
}

export default function TuningDial({ position, powered, tuning }: TuningDialProps) {
  return (
    <div aria-hidden="true">
      <div
        className="relative h-7 rounded overflow-hidden"
        style={{ background: "linear-gradient(180deg, #2a1d10, #120a04)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8)" }}
      >
        <div className="absolute inset-0 flex items-start justify-between px-2 pt-1">
          {Array.from({ length: 31 }).map((_, i) => (
            <div key={i} style={{ width: 1, height: i % 5 === 0 ? 10 : 5, background: AMBER_DIM, opacity: powered ? 1 : 0.4 }} />
          ))}
        </div>
        <div
          className="absolute top-0 bottom-0 w-[2px] motion-reduce:!transition-none"
          style={{
            left: `calc(8px + (100% - 16px) * ${position / 100})`,
            background: "#ff3b30",
            boxShadow: powered ? "0 0 8px rgba(255,59,48,0.9)" : "none",
            opacity: powered ? 1 : 0.4,
            transition: tuning ? "none" : "left 0.45s cubic-bezier(.3,1.3,.5,1)",
          }}
        />
      </div>
      <div className="text-[9px] tracking-[0.15em] mt-1 text-center" style={{ color: "#b8995a" }}>
        DECORATIVE DIAL · NOT A FREQUENCY
      </div>
    </div>
  );
}
