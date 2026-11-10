import React, { useRef } from "react";
import { useMusicPlayer, useCurrentTrack } from "@/contexts/MusicPlayerContext";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Volume2, Music2, X, Radio,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useLocation } from "wouter";

function fmtTime(secs: number): string {
  if (!isFinite(secs) || isNaN(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MusicPlayerBar() {
  const player = useMusicPlayer();
  const track = useCurrentTrack();
  const seekRef = useRef(false);
  const [location, setLocation] = useLocation();

  if (!track || player.minimized || player.hidePlayerBar) return null;

  const seekable = player.duration > 0 && isFinite(player.duration);
  const progress = seekable ? Math.min(100, (player.currentTime / player.duration) * 100) : 0;

  const handleTrackClick = () => {
    if (!player.queueSource) return;
    // Navigate to the source list and highlight this specific track
    const url = track.id
      ? `${player.queueSource}?highlight=${track.id}`
      : player.queueSource;
    setLocation(url);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/80 px-4 py-2 flex items-center gap-4 h-[72px] z-50">
      {/* Track info — clickable when a source page is known */}
      <div
        className={`flex items-center gap-3 w-64 min-w-0 rounded-md transition-colors ${
          player.queueSource
            ? "cursor-pointer hover:bg-accent/40 -mx-2 px-2 py-1"
            : ""
        }`}
        onClick={player.queueSource ? handleTrackClick : undefined}
        title={player.queueSource ? "Go to track in library" : undefined}
      >
        {track.coverImageUrl ? (
          <img src={track.coverImageUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
            <Music2 className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate leading-tight ${player.queueSource ? "hover:text-primary transition-colors" : ""}`}>
            {track.title}
          </p>
          {track.artist && (
            <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">{track.artist}</p>
          )}
        </div>
      </div>

      {/* Controls + progress */}
      <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
        <div className="flex items-center gap-3">
          <button
            onClick={player.toggleShuffle}
            className={`p-1 rounded transition-colors ${player.shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            title="Shuffle"
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button
            onClick={player.prev}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={player.togglePlay}
            className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-sm"
          >
            {player.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            onClick={player.next}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <SkipForward className="w-5 h-5" />
          </button>
          <button
            onClick={player.toggleRepeat}
            className={`p-1 rounded transition-colors ${player.repeat !== "none" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            title={player.repeat === "none" ? "No repeat" : player.repeat === "one" ? "Repeat one" : "Repeat all"}
          >
            {player.repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        <div className="w-full max-w-md flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">
            {fmtTime(player.currentTime)}
          </span>
          <Slider
            value={[progress]}
            min={0}
            max={100}
            step={0.1}
            className="flex-1 h-1"
            disabled={!seekable}
            onValueChange={([val]) => {
              if (seekable) {
                // Clamp to [0, duration] — prevents seeking to Infinity on
                // streaming files that report duration=Infinity.
                player.seek(Math.min((val / 100) * player.duration, player.duration));
              }
            }}
          />
          <span className="text-[11px] tabular-nums text-muted-foreground w-8">
            {fmtTime(player.duration)}
          </span>
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 w-32 flex-shrink-0">
        <Volume2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <Slider
          value={[player.volume * 100]}
          min={0}
          max={100}
          step={1}
          className="flex-1 h-1"
          onValueChange={([val]) => player.setVolume(val / 100)}
        />
      </div>

      {/* Show Radio */}
      <button
        onClick={() => {
          let src = "";
          try { src = localStorage.getItem("urlinc-last-radio-source") ?? ""; } catch {}
          setLocation(src ? `/music?tab=radio&source=${src}` : "/music?tab=radio");
        }}
        title="Show radio"
        className="ml-2 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <Radio className="w-4 h-4" />
      </button>

      {/* Close */}
      <button
        onClick={player.clearQueue}
        title="Close player"
        className="ml-1 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
