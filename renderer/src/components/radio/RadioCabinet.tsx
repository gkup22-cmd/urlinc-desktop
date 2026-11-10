import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Star, Power, Loader2 } from "lucide-react";
import Knob from "./Knob";
import PresetButton from "./PresetButton";
import TuningDial from "./TuningDial";

export interface CabinetStation {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  genre: string;
  bitrate: number;
  url?: string; // stream URL stored so presets work even before the station list loads
}

const WOOD_TEXTURE = "/radio/radio-wood.png";
const GRILLE_TEXTURE = "/radio/radio-grille.png";

const WOOD = {
  backgroundColor: "#3d2414",
  backgroundImage:
    `linear-gradient(180deg, rgba(255,210,160,0.10) 0%, rgba(0,0,0,0) 18%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.35) 100%), url(${WOOD_TEXTURE})`,
  backgroundSize: "100% 100%, 600px auto",
  boxShadow:
    "inset 0 2px 4px rgba(255,200,150,0.18), inset 0 -10px 24px rgba(0,0,0,0.55), 0 24px 50px rgba(0,0,0,0.6)",
  border: "2px solid #5a4220",
};
const GRILLE = {
  backgroundColor: "#241608",
  backgroundImage:
    `radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%), linear-gradient(rgba(20,10,4,0.35), rgba(20,10,4,0.35)), url(${GRILLE_TEXTURE})`,
  backgroundSize: "100% 100%, 100% 100%, 220px auto",
  boxShadow: "inset 0 0 22px rgba(0,0,0,0.7)",
};
const BRASS_TRIM = "2px solid #c5a059";
const AMBER = "#e8c67a";
const AMBER_DIM = "#9c7d44";

const mediaBtn = "min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-amber-500/10 active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40 motion-reduce:transition-none";

interface RadioCabinetProps {
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
  compact?: boolean;
  onPower?: () => void;
  onPlayPause?: () => void;
  onSelectStation?: (station: CabinetStation) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onVolumeChange?: (v: number) => void;
  onToggleFavorite?: (id: string) => void;
  onSetPreset?: (index: number, station: CabinetStation) => void;
  onRecallPreset?: (index: number) => void;
}

export default function RadioCabinet({
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
  compact = false,
  onPower = () => {},
  onPlayPause = () => {},
  onSelectStation = () => {},
  onPrev = () => {},
  onNext = () => {},
  onVolumeChange = () => {},
  onToggleFavorite = () => {},
  onSetPreset = () => {},
  onRecallPreset = () => {},
}: RadioCabinetProps) {
  const isFav = currentStation && favorites.includes(currentStation.id);
  const stationIndex = Math.max(0, stations.findIndex((s) => s.id === currentStation?.id));
  const slot = stations.length > 1 ? (stationIndex / (stations.length - 1)) * 100 : 50;

  const [tunePos, setTunePos] = useState(slot);
  const [tuning, setTuning] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!tuning) setTunePos(slot); }, [slot, tuning]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  const handleTune = (v: number) => {
    if (!powered || !stations.length) return;
    setTuning(true);
    setTunePos(v);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      setTuning(false);
      const i = Math.round((v / 100) * (stations.length - 1));
      if (stations[i] && stations[i].id !== currentStation?.id) onSelectStation(stations[i]);
    }, 450);
  };

  const status = !powered ? "OFF" : error ? "ERROR" : isLoading ? "BUFFERING…" : isPlaying ? "NOW PLAYING" : currentStation ? "PAUSED" : "STANDBY";

  return (
    <div className="relative w-full rounded-[26px] p-4 sm:p-6" style={WOOD} role="region" aria-label="URLinc vintage radio">
      <div className="absolute left-4 right-4 top-1.5 h-[2px] rounded-full" style={{ background: "linear-gradient(90deg, transparent, #c5a059, transparent)" }} />

      <div className={`flex flex-col ${compact ? "gap-3" : "gap-5"}`}>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {/* grille + nameplate */}
          <div className="sm:col-span-2 rounded-xl p-4 flex items-center justify-center min-h-[96px] sm:min-h-[120px]" style={{ ...GRILLE, border: BRASS_TRIM }}>
            <div
              className="px-4 py-1.5 rounded"
              style={{ background: "linear-gradient(180deg,#d9b872,#a98543)", border: "1px solid #6b4f1e", boxShadow: "0 2px 4px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.4)" }}
            >
              <span className="text-sm font-black tracking-[0.2em]" style={{ color: "#2a1810" }}>URLinc</span>
            </div>
          </div>

          {/* amber display */}
          <div
            className="sm:col-span-3 rounded-xl p-4 flex flex-col justify-between transition-all duration-500 motion-reduce:transition-none"
            style={{
              background: "linear-gradient(180deg, #1a1208 0%, #0a0804 100%)",
              border: BRASS_TRIM,
              boxShadow: powered
                ? "inset 0 0 36px rgba(232,198,122,0.28), inset 0 2px 5px rgba(0,0,0,0.85), 0 0 0 2px #6b4f1e"
                : "inset 0 2px 5px rgba(0,0,0,0.9), 0 0 0 2px #6b4f1e",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[9px] tracking-[0.25em] font-semibold" style={{ color: error && powered ? "#f87171" : AMBER_DIM }}>
                {isLoading && <Loader2 size={11} className="animate-spin motion-reduce:animate-none" />}
                {status}
              </span>
            </div>

            <div className="my-2 min-h-[44px]" style={{ opacity: powered ? 1 : 0.12, transition: "opacity .4s" }}>
              <div className="text-base sm:text-lg font-bold truncate" style={{ color: AMBER, textShadow: `0 0 8px ${AMBER}` }}>
                {currentStation ? currentStation.name : "— no station selected —"}
              </div>
              <div className="text-[10px] sm:text-xs mt-0.5 flex flex-wrap gap-x-3" style={{ color: AMBER_DIM }}>
                {currentStation && (<><span>{currentStation.country}</span><span>{currentStation.genre}</span><span>{currentStation.bitrate} kbps</span></>)}
              </div>
              {error && powered && <div className="text-[11px] mt-1 text-red-400">⚠ {error} — try another station</div>}
            </div>

            <TuningDial position={tunePos} powered={powered} tuning={tuning} />
          </div>
        </div>

        {/* knobs + presets */}
        <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-between gap-x-2 gap-y-4">
          <div className="sm:order-1 justify-self-start"><Knob label="VOLUME" ariaLabel="Volume" value={volume} onChange={onVolumeChange} valueText={`${Math.round(volume)} percent`} /></div>
          <div className="col-span-2 row-start-2 sm:order-2 flex gap-2 sm:gap-2.5 justify-center">
            {presets.map((p, i) => (
              <PresetButton
                key={i}
                index={i}
                station={p}
                active={activePreset === i && powered}
                onRecall={onRecallPreset}
                onStore={(idx) => currentStation && onSetPreset(idx, currentStation)}
              />
            ))}
          </div>
          <div className="sm:order-3 justify-self-end"><Knob label="TUNE" ariaLabel="Tuning — scrub through stations" value={tunePos} onChange={handleTune} valueText={currentStation?.name} /></div>
        </div>
        <p className="text-center text-[11px] -mt-1" style={{ color: "#b8995a" }}>
          Tap a preset to recall · hold (or Shift+click) to store the current station
        </p>
        <div className="sr-only" role="status" aria-live="polite">
          {currentStation ? `${status}. ${currentStation.name}${error ? `. ${error}` : ""}` : status}
        </div>

        {/* media bar */}
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          <button aria-label={powered ? "Power off" : "Power on"} aria-pressed={powered} onClick={onPower} className={mediaBtn} style={{ color: powered ? "#ff8a4c" : AMBER_DIM, boxShadow: powered ? "0 0 12px rgba(255,138,76,0.45)" : "none" }}>
            <Power size={20} />
          </button>
          <button aria-label="Previous station" onClick={onPrev} disabled={!powered} className={mediaBtn} style={{ color: AMBER }}><SkipBack size={20} /></button>
          <button
            aria-label={isPlaying || isLoading ? "Pause" : "Play"}
            onClick={onPlayPause}
            disabled={!powered}
            className="p-3.5 rounded-full active:scale-95 active:translate-y-0.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 disabled:opacity-40 motion-reduce:transition-none"
            style={{ background: "radial-gradient(circle at 35% 30%, #f4dd9a, #c5a059 70%, #8a6d3a)", color: "#2a1810", boxShadow: "0 4px 12px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(0,0,0,0.4)" }}
          >
            {isLoading ? <Loader2 size={26} className="animate-spin motion-reduce:animate-none" /> : isPlaying ? <Pause size={26} /> : <Play size={26} />}
          </button>
          <button aria-label="Next station" onClick={onNext} disabled={!powered} className={mediaBtn} style={{ color: AMBER }}><SkipForward size={20} /></button>
          <button
            aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={!!isFav}
            onClick={() => currentStation && onToggleFavorite(currentStation.id)}
            disabled={!powered || !currentStation}
            className={mediaBtn}
            style={{ color: isFav ? AMBER : AMBER_DIM }}
          >
            <Star size={20} fill={isFav ? AMBER : "none"} />
          </button>
        </div>
      </div>
    </div>
  );
}
