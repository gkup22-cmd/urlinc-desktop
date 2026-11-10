import { useState, useEffect, useCallback } from "react";

interface PhotoFavoriteRow {
  id: number;
  source: "photo";
  stationId: string;
  stationData: Record<string, unknown>;
  createdAt: string;
}

export function usePhotoFavorites() {
  const [favorites, setFavorites] = useState<Map<string, PhotoFavoriteRow>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/radio-favorites?source=photo", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<PhotoFavoriteRow[]>) : Promise.resolve([])))
      .then((rows) => setFavorites(new Map(rows.map((r) => [r.stationId, r]))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const isFavorite = useCallback((photoId: number) => favorites.has(String(photoId)), [favorites]);

  const favoriteIds = useCallback(() => Array.from(favorites.keys()).map(Number), [favorites]);

  const toggleFavorite = useCallback(
    async (photoId: number, photoData: Record<string, unknown>) => {
      const key = String(photoId);
      const wasFav = favorites.has(key);
      setFavorites((prev) => {
        const next = new Map(prev);
        if (wasFav) next.delete(key);
        else next.set(key, { id: 0, source: "photo", stationId: key, stationData: photoData, createdAt: new Date().toISOString() });
        return next;
      });
      try {
        if (wasFav) {
          await fetch(`/api/radio-favorites/${encodeURIComponent(key)}?source=photo`, {
            method: "DELETE",
            credentials: "include",
          });
        } else {
          await fetch("/api/radio-favorites", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "photo", stationId: key, stationData: photoData }),
          });
        }
      } catch {
        setFavorites((prev) => {
          const next = new Map(prev);
          if (wasFav) next.set(key, { id: 0, source: "photo", stationId: key, stationData: photoData, createdAt: new Date().toISOString() });
          else next.delete(key);
          return next;
        });
      }
    },
    [favorites],
  );

  return { loaded, isFavorite, favoriteIds, toggleFavorite };
}
