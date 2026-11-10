import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { useListMusicPlaylists } from "@workspace/api-client-react";
import type { ScreensaverSettings } from "@/hooks/useScreensaver";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Photo {
  id: number;
  imageUrl: string;
  title: string;
}

function useAlbumPhotos(albumId: number | null) {
  return useQuery<Photo[]>({
    queryKey: ["screensaver-photos", albumId],
    queryFn: async () => {
  if (!albumId) return [];
  const res = await fetch(`/api/albums/${albumId}`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json() as { photos: Photo[] };
  return data.photos ?? [];
},
    enabled: albumId !== null,
    staleTime: 5 * 60 * 1000,
  });
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PhotoScreensaver({
  settings,
  onDismiss,
}: {
  settings: ScreensaverSettings;
  onDismiss: () => void;
}) {
  const { data: rawPhotos = [] } = useAlbumPhotos(settings.albumId);
  const { data: playlists } = useListMusicPlaylists();
  const player = useMusicPlayer();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true); // for fade transition
  const [showControls, setShowControls] = useState(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const musicStartedRef = useRef(false);

  // Shuffle or order photos
  useEffect(() => {
    if (rawPhotos.length === 0) return;
    setPhotos(settings.shuffle ? shuffle(rawPhotos) : rawPhotos);
    setIndex(0);
  }, [rawPhotos, settings.shuffle]);

  // Start music playlist if configured
  useEffect(() => {
    if (musicStartedRef.current) return;
    if (!settings.playlistId || !playlists) return;
    const playlist = playlists.find((p) => p.id === settings.playlistId);
    if (!playlist) return;

    // Fetch playlist tracks then start playing
    fetch(`/api/music-playlists/${settings.playlistId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : { tracks: [] })
      .then((data: { tracks: Array<{ id: number; title: string; artist?: string | null; audioUrl: string; coverImageUrl?: string | null; durationSeconds?: number | null }> }) => data.tracks)
      .then((tracks) => {        if (tracks.length === 0) return;
        const queue = tracks.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist ?? null,
          audioUrl: t.audioUrl,
          coverImageUrl: t.coverImageUrl ?? null,
          durationSeconds: t.durationSeconds ?? null,
        }));
        player.playQueue(queue, 0, "/screensaver");
        if (settings.fullscreen) void document.documentElement.requestFullscreen?.();
        musicStartedRef.current = true;
      })
      .catch(() => {});
  }, [settings.playlistId, playlists, player]);

  // Auto-advance slides
  useEffect(() => {
    if (photos.length === 0) return;
    slideTimerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % photos.length);
        setVisible(true);
      }, 600);
    }, settings.slideDurationSeconds * 1000);

    return () => {
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    };
  }, [photos, settings.slideDurationSeconds]);

  // Show controls briefly on mouse move
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  const goNext = useCallback(() => {
    setVisible(false);
    setTimeout(() => { setIndex((i) => (i + 1) % photos.length); setVisible(true); }, 300);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setVisible(false);
    setTimeout(() => { setIndex((i) => (i - 1 + photos.length) % photos.length); setVisible(true); }, 300);
  }, [photos.length]);

  const handleDismiss = useCallback(() => {
    // Stop music when dismissing
    if (document.fullscreenElement) void document.exitFullscreen();
    player.pause();
    musicStartedRef.current = false;
    onDismiss();
  }, [onDismiss, player]);

  const currentPhoto = photos[index];

  if (photos.length === 0) {
    return (
      <div
        className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
        onClick={handleDismiss}
      >
        <p className="text-white/50 text-sm">No photos in this album.</p>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black overflow-hidden ${showControls ? "cursor-default" : "cursor-none"}`}
      onMouseMove={handleMouseMove}
      onClick={handleDismiss}
    >
      {/* Photo */}
      {currentPhoto && (
        <img
          key={currentPhoto.id}
          src={currentPhoto.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.6s ease-in-out",
          }}
        />
      )}

      {/* Subtle vignette */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)" }}
      />

      {/* Controls overlay — shown on mouse move */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ opacity: showControls ? 1 : 0, transition: "opacity 0.3s ease" }}
      >
        {/* Dismiss button */}
        <button
          className="pointer-events-auto absolute top-6 right-6 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Prev button */}
        <button
          className="pointer-events-auto absolute left-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Next button */}
        <button
          className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Slide counter */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {photos.slice(0, 12).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === index % 12 ? 20 : 6,
                height: 6,
                background: i === index % 12 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
          {photos.length > 12 && (
            <span className="text-white/50 text-xs ml-1">{index + 1}/{photos.length}</span>
          )}
        </div>
      </div>

      {/* Bottom hints */}
      {!showControls && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
          <p className="text-white/20 text-xs">Click anywhere to exit</p>
        </div>
      )}

      {/* Fullscreen button — shown in controls overlay */}
      {showControls && settings.fullscreen && !document.fullscreenElement && (
        <button
          className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/50 text-white text-xs font-medium hover:bg-black/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); void document.documentElement.requestFullscreen(); }}
        >
          ⛶ Go Fullscreen
        </button>
      )}
    </div>
  );
}
