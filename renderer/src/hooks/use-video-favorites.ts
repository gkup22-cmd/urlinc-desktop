import { useState, useEffect, useCallback } from "react";

interface VideoFavoriteRow {
  id: number;
  source: "video";
  stationId: string;
  stationData: Record<string, unknown>;
  createdAt: string;
}

export function useVideoFavorites() {
  const [favorites, setFavorites] = useState<Map<string, VideoFavoriteRow>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/radio-favorites?source=video", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<VideoFavoriteRow[]>) : Promise.resolve([])))
      .then((rows) => setFavorites(new Map(rows.map((r) => [r.stationId, r]))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const isFavorite = useCallback((videoId: number) => favorites.has(String(videoId)), [favorites]);

  const favoriteIds = useCallback(() => Array.from(favorites.keys()).map(Number), [favorites]);

  const toggleFavorite = useCallback(
    async (videoId: number, videoData: Record<string, unknown>) => {
      const key = String(videoId);
      const wasFav = favorites.has(key);
      setFavorites((prev) => {
        const next = new Map(prev);
        if (wasFav) next.delete(key);
        else next.set(key, { id: 0, source: "video", stationId: key, stationData: videoData, createdAt: new Date().toISOString() });
        return next;
      });
      try {
        if (wasFav) {
          await fetch(`/api/radio-favorites/${encodeURIComponent(key)}?source=video`, {
            method: "DELETE",
            credentials: "include",
          });
        } else {
          await fetch("/api/radio-favorites", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "video", stationId: key, stationData: videoData }),
          });
        }
      } catch {
        setFavorites((prev) => {
          const next = new Map(prev);
          if (wasFav) next.set(key, { id: 0, source: "video", stationId: key, stationData: videoData, createdAt: new Date().toISOString() });
          else next.delete(key);
          return next;
        });
      }
    },
    [favorites],
  );

  return { loaded, isFavorite, favoriteIds, toggleFavorite };
}
