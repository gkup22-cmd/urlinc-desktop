import { useState, useRef, useEffect, useCallback } from "react";
import { X, Maximize2, Play, Pause, GripHorizontal } from "lucide-react";
import { getEmbedUrl, getYoutubeVideoId } from "@/lib/youtube";

export interface MiniPlayerVideo {
  id: number;
  title: string;
  youtubeUrl: string;
  thumbnailUrl?: string | null;
  // Where playback should start, in seconds — carried over from wherever the
  // video was previously playing so popping out/expanding doesn't restart it.
  startSeconds?: number;
}

interface MiniPlayerProps {
  video: MiniPlayerVideo;
  onClose: () => void;
  onExpand: (startSeconds: number) => void;
  // Mirrors this MiniPlayer's own player instance up to the provider so
  // other pages can read its live position (e.g. to hand off playback
  // without restarting when the main page's player is engaged directly).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  playerRef?: React.MutableRefObject<any>;
  // Bumped whenever something elsewhere (e.g. the video's own page, when
  // clicking its now-disabled resume overlay) wants to draw attention to
  // the "Back to Video" button rather than silently doing nothing.
  pulseSignal?: number;
}

interface Position { x: number; y: number }

function MiniPlayer({ video, onClose, onExpand, playerRef, pulseSignal }: MiniPlayerProps) {
  const [position, setPosition] = useState<Position>({ x: window.innerWidth - 364, y: window.innerHeight - 220 });
  const [isDragging, setIsDragging] = useState(false);
  const [highlightBack, setHighlightBack] = useState(false);
  const isFirstPulseRef = useRef(true);

  useEffect(() => {
    if (isFirstPulseRef.current) { isFirstPulseRef.current = false; return; }
    if (pulseSignal === undefined) return;
    setHighlightBack(true);
    const t = setTimeout(() => setHighlightBack(false), 2200);
    return () => clearTimeout(t);
  }, [pulseSignal]);
  const [showControls, setShowControls] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const dragOffset = useRef<Position>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayerRef = useRef<any>(null);
  const ytOuterRef = useRef<HTMLDivElement>(null);

  const videoId = getYoutubeVideoId(video.youtubeUrl);
  const embedUrl = getEmbedUrl(video.youtubeUrl);

  // Spawn YouTube player
  useEffect(() => {
    if (!videoId || !ytOuterRef.current) return;
    const outer = ytOuterRef.current;

    const spawnPlayer = () => {
      outer.innerHTML = "";
      const mount = document.createElement("div");
      outer.appendChild(mount);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ytPlayerRef.current = new (window as any).YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          controls: 1,
          start: Math.max(0, Math.floor(video.startSeconds ?? 0)),
        },
        events: {
          onReady: () => {
            ytPlayerRef.current?.playVideo();
            if (playerRef) playerRef.current = ytPlayerRef.current;
          },
          onStateChange: (e: { data: number }) => {
            setIsPlaying(e.data === 1);
          },
        },
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) {
      spawnPlayer();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (window as any).onYouTubeIframeAPIReady as (() => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); spawnPlayer(); };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      try { ytPlayerRef.current?.destroy(); } catch { /* ignore */ }
      ytPlayerRef.current = null;
      if (playerRef) playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Dragging logic
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    setIsDragging(true);
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => {
      const newX = Math.max(0, Math.min(window.innerWidth - 340, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 200, e.clientY - dragOffset.current.y));
      setPosition({ x: newX, y: newY });
    };
    const onMouseUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  const togglePlay = () => {
    if (isPlaying) {
      ytPlayerRef.current?.pauseVideo();
    } else {
      ytPlayerRef.current?.playVideo();
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: 340,
        zIndex: 9999,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        userSelect: "none",
        cursor: isDragging ? "grabbing" : "default",
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Drag handle — only visible on hover */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          zIndex: 10,
          cursor: isDragging ? "grabbing" : "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: showControls ? "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)" : "transparent",
          transition: "background 0.2s",
        }}
      >
        {showControls && (
          <GripHorizontal style={{ width: 16, height: 16, color: "rgba(255,255,255,0.6)" }} />
        )}
      </div>

      {/* Video area */}
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", position: "relative" }}>
        {videoId ? (
          <div ref={ytOuterRef} style={{ position: "absolute", inset: 0 }} />
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
            allow="autoplay; fullscreen"
            title={video.title}
          />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>No preview available</p>
          </div>
        )}

        {/* Hover controls overlay */}
        {showControls && (
          <div style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            zIndex: 5,
            pointerEvents: "none",
          }}>
            <button
              onClick={togglePlay}
              style={{
                background: "rgba(0,0,0,0.7)",
                border: "none",
                borderRadius: "50%",
                width: 40,
                height: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                pointerEvents: "auto",
                color: "#fff",
              }}
            >
              {isPlaying
                ? <Pause style={{ width: 18, height: 18 }} />
                : <Play style={{ width: 18, height: 18 }} />}
            </button>
          </div>
        )}
      </div>

      {/* Bottom bar — title + buttons. Always visible (not just on hover)
          so the way back to the video's page is easy to find rather than
          something you have to discover by hovering over a small icon. */}
      <div style={{
        background: "rgba(10,10,10,0.95)",
        padding: "6px 8px",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        <p style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {video.title}
        </p>
        <button
          onClick={() => onExpand(ytPlayerRef.current?.getCurrentTime?.() ?? 0)}
          title="Go back to this video's page"
          style={{
            background: highlightBack ? "#eab308" : "rgba(255,255,255,0.12)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            color: highlightBack ? "#000" : "rgba(255,255,255,0.9)",
            padding: "4px 8px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
            boxShadow: highlightBack ? "0 0 0 4px rgba(234,179,8,0.35)" : "none",
            transition: "background 0.25s ease, color 0.25s ease, box-shadow 0.25s ease",
          }}
        >
          <Maximize2 style={{ width: 12, height: 12 }} />
          Back to Video
        </button>
        <button
          onClick={onClose}
          title="Close"
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", padding: 4, display: "flex", flexShrink: 0 }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );
}

// ── Mini Player Context ───────────────────────────────────────────────────────
// Allows any component in the app to trigger the mini player

import { createContext, useContext } from "react";

interface MiniPlayerContextType {
  openMiniPlayer: (video: MiniPlayerVideo) => void;
  closeMiniPlayer: () => void;
  currentVideo: MiniPlayerVideo | null;
  // Live position of the currently open pop-out, or 0 if none is open —
  // lets a page seek its own player to match before taking back playback.
  getMiniPlayerTime: () => number;
  // Draws attention to the pop-out's "Back to Video" button (a brief
  // highlight) — for when something elsewhere can't just resume playback
  // itself and needs to point the user at the button that can.
  pulseBackButton: () => void;
}

export const MiniPlayerContext = createContext<MiniPlayerContextType>({
  openMiniPlayer: () => {},
  closeMiniPlayer: () => {},
  currentVideo: null,
  getMiniPlayerTime: () => 0,
  pulseBackButton: () => {},
});

export function useMiniPlayer() {
  return useContext(MiniPlayerContext);
}

export function MiniPlayerProvider({ children, onExpand }: { children: React.ReactNode; onExpand: (video: MiniPlayerVideo) => void }) {
  const [currentVideo, setCurrentVideo] = useState<MiniPlayerVideo | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [pulseSignal, setPulseSignal] = useState(0);

  const openMiniPlayer = useCallback((video: MiniPlayerVideo) => {
    setCurrentVideo(video);
  }, []);

  const closeMiniPlayer = useCallback(() => {
    setCurrentVideo(null);
  }, []);

  const getMiniPlayerTime = useCallback(() => {
    return playerRef.current?.getCurrentTime?.() ?? 0;
  }, []);

  const pulseBackButton = useCallback(() => {
    setPulseSignal((n) => n + 1);
  }, []);

  return (
    <MiniPlayerContext.Provider value={{ openMiniPlayer, closeMiniPlayer, currentVideo, getMiniPlayerTime, pulseBackButton }}>
      {children}
      {currentVideo && (
        <MiniPlayer
          video={currentVideo}
          onClose={closeMiniPlayer}
          playerRef={playerRef}
          pulseSignal={pulseSignal}
          onExpand={(startSeconds) => {
            onExpand({ ...currentVideo, startSeconds });
            setCurrentVideo(null);
          }}
        />
      )}
    </MiniPlayerContext.Provider>
  );
}

export default MiniPlayer;
