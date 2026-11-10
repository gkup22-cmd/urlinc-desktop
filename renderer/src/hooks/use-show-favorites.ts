import { useState, useEffect, useCallback } from "react";

interface ShowFavoriteRow {
  id: number;
  source: "show";
  stationId: string;
  stationData: Record<string, unknown>;
  createdAt: string;
}

export function useShowFavorites() {
  const [favorites, setFavorites] = useState<Map<string, ShowFavoriteRow>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/radio-favorites?source=show", { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<ShowFavoriteRow[]>) : Promise.resolve([])))
      .then((rows) => setFavorites(new Map(rows.map((r) => [r.stationId, r]))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const isFavorite = useCallback((showId: number) => favorites.has(String(showId)), [favorites]);

  const toggleFavorite = useCallback(
    async (showId: number, showData: Record<string, unknown>) => {
      const key = String(showId);
      const wasFav = favorites.has(key);
      setFavorites((prev) => {
        const next = new Map(prev);
        if (wasFav) next.delete(key);
        else next.set(key, { id: 0, source: "show", stationId: key, stationData: showData, createdAt: new Date().toISOString() });
        return next;
      });
      try {
        if (wasFav) {
          await fetch(`/api/radio-favorites/${encodeURIComponent(key)}?source=show`, {
            method: "DELETE",
            credentials: "include",
          });
        } else {
          await fetch("/api/radio-favorites", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "show", stationId: key, stationData: showData }),
          });
        }
      } catch {
        setFavorites((prev) => {
          const next = new Map(prev);
          if (wasFav) next.set(key, { id: 0, source: "show", stationId: key, stationData: showData, createdAt: new Date().toISOString() });
          else next.delete(key);
          return next;
        });
      }
    },
    [favorites],
  );

  return { loaded, isFavorite, toggleFavorite };
}
