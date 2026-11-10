import React from "react";

const MARKS = [88, 92, 96, 100, 104, 108];

interface PhoneDialProps {
  /** Needle position 0..100 matching the tune knob value */
  position?: number;
  powered?: boolean;
}

/**
 * Decorative FM frequency strip with an animated red needle.
 * Slot into a display area; the needle tracks the tune knob position.
 */
export default function PhoneDial({ position = 50, powered = true }: PhoneDialProps) {
  return (
    <div className="relative h-9" aria-hidden="true">
      {/* FM frequency marks */}
      <div className="absolute inset-x-1 top-0 flex justify-between text-[11px] font-semibold" style={{ color: "#f0dcae", opacity: powered ? 1 : 0.3 }}>
        {MARKS.map((m) => <span key={m}>{m}</span>)}
      </div>
      {/* Tick marks */}
      <div
        className="absolute inset-x-1 bottom-2 h-3"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(240,220,174,.7) 0 1px, transparent 1px 8px)", opacity: powered ? 1 : 0.2 }}
      />
      {/* Red needle */}
      <div
        className="absolute bottom-0 top-3 w-[2px] rounded-full"
        style={{
          left: `calc(4px + (100% - 8px) * ${position / 100})`,
          background: "#ff3b1f",
          boxShadow: powered ? "0 0 8px #ff3b1f" : "none",
          opacity: powered ? 1 : 0.2,
          transition: "left .2s ease-out",
        }}
      />
    </div>
  );
}
