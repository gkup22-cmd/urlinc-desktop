import { useState, useEffect, useCallback } from "react";

interface VaultSourceFavoriteRow {
  id: number;
  source: string;
  stationId: string;
  stationData: Record<string, unknown>;
  createdAt: string;
}

// Same generic radio_favorites table used for photo/video favorites, keyed
// by `listType` (e.g. "vault-games") so each source tab only ever sees its
// own starred entries.
export function useVaultSourceFavorites(listType: string) {
  const [favorites, setFavorites] = useState<Map<string, VaultSourceFavoriteRow>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/radio-favorites?source=${encodeURIComponent(listType)}`, { credentials: "include" })
      .then((r) => (r.ok ? (r.json() as Promise<VaultSourceFavoriteRow[]>) : Promise.resolve([])))
      .then((rows) => setFavorites(new Map(rows.map((r) => [r.stationId, r]))))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [listType]);

  const isFavorite = useCallback((stationId: string) => favorites.has(stationId), [favorites]);

  const toggleFavorite = useCallback(
    async (stationId: string, data: Record<string, unknown>) => {
      const wasFav = favorites.has(stationId);
      setFavorites((prev) => {
        const next = new Map(prev);
        if (wasFav) next.delete(stationId);
        else next.set(stationId, { id: 0, source: listType, stationId, stationData: data, createdAt: new Date().toISOString() });
        return next;
      });
      try {
        // fetch() only rejects on network failure, not on 4xx/5xx -- without
        // checking res.ok, a rejected request (e.g. an unrecognized source)
        // looks identical to success here, leaving the star showing
        // favorited for the rest of the session even though nothing was
        // ever saved, until the next reload silently reverts it.
        let res: Response;
        if (wasFav) {
          res = await fetch(`/api/radio-favorites/${encodeURIComponent(stationId)}?source=${encodeURIComponent(listType)}`, {
            method: "DELETE",
            credentials: "include",
          });
        } else {
          res = await fetch("/api/radio-favorites", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: listType, stationId, stationData: data }),
          });
        }
        if (!res.ok) throw new Error(`radio-favorites request failed: ${res.status}`);
      } catch {
        setFavorites((prev) => {
          const next = new Map(prev);
          if (wasFav) next.set(stationId, { id: 0, source: listType, stationId, stationData: data, createdAt: new Date().toISOString() });
          else next.delete(stationId);
          return next;
        });
      }
    },
    [favorites, listType],
  );

  return { loaded, isFavorite, toggleFavorite };
}
