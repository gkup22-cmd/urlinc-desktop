import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";

export type PendingOpen = { url: string };
export type LastSaved = { url: string; title?: string };

export function useRemoteSession(opts?: { onNavigate?: () => void; onSessionExpired?: () => void }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pcConnected, setPcConnected] = useState(false);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [lastSaved, setLastSaved] = useState<LastSaved | null>(null);
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null);
  const lastSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setLocation] = useLocation();
  const esRef = useRef<EventSource | null>(null);
  const onSessionExpiredRef = useRef(opts?.onSessionExpired);
  onSessionExpiredRef.current = opts?.onSessionExpired;

  const createSession = useCallback(async () => {
    try {
      const res = await fetch("/api/remote/session", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return;
      const { sessionId: id } = await res.json() as { sessionId: string };
      setSessionId(id);
    } catch { /* ignore */ }
  }, []);

  const stopSession = useCallback(() => {
    // Kill the sessionId on the server so old QR codes stop working
    fetch("/api/remote/session/reset", { method: "POST", credentials: "include" }).catch(() => {});
    esRef.current?.close();
    esRef.current = null;
    setSessionId(null);
    setPcConnected(false);
    setPhoneConnected(false);
    setLastSaved(null);
    setPendingOpen(null);
  }, []);

  // PC heartbeat — posts every 5s; detects server restart (404) and notifies provider
  useEffect(() => {
    if (!sessionId) return;
    const beat = async () => {
      try {
        const r = await fetch(`/api/remote/heartbeat/${sessionId}`, {
          method: "POST",
          credentials: "include",
        });
        if (r.status === 404) {
          // Server restarted and wiped the session — signal provider to recreate
          setSessionId(null);
          setPcConnected(false);
          onSessionExpiredRef.current?.();
        }
      } catch { /* network hiccup — ignore, will retry */ }
    };
    void beat(); // immediate first beat
    const iv = setInterval(() => void beat(), 20_000); // 20s — 4× less DB traffic than 5s
    return () => clearInterval(iv);
  }, [sessionId]);

  const showSaved = useCallback((url: string, title?: string) => {
    if (lastSavedTimerRef.current) clearTimeout(lastSavedTimerRef.current);
    setLastSaved({ url, title });
    lastSavedTimerRef.current = setTimeout(() => setLastSaved(null), 4000);
  }, []);

  // Connect SSE when we have a session
  useEffect(() => {
    if (!sessionId) return;

    const es = new EventSource(`/api/remote/events/${sessionId}`);
    esRef.current = es;

    es.addEventListener("connected", () => setPcConnected(true));

    es.addEventListener("command", (e: MessageEvent) => {
      try {
        const cmd = JSON.parse(e.data as string) as { type: string; payload: Record<string, string> };
        setPhoneConnected(true);

        switch (cmd.type) {
          case "navigate":
            setLocation(cmd.payload.path ?? "/");
            opts?.onNavigate?.();
            break;
          case "open-url":
            // Can't call window.open from SSE handler — popup blocker kills it.
            // Surface as a clickable banner the user triggers with a real click.
            setPendingOpen({ url: cmd.payload.url });
            break;
          case "url-saved":
            showSaved(cmd.payload.url, cmd.payload.title);
            break;
          case "watch-control":
            // Dispatch a window event so any mounted page can react without
            // needing a callback wired through the context.
            window.dispatchEvent(new CustomEvent("urlinc:watch-control", {
              detail: { action: cmd.payload.action ?? "" },
            }));
            break;
        }
      } catch { /* ignore malformed events */ }
    });

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    es.onerror = () => {
      setPcConnected(false);
      // If the browser didn't auto-recover within 5s, reopen the connection ourselves
      reconnectTimer = setTimeout(() => {
        if (esRef.current?.readyState === EventSource.CLOSED) {
          esRef.current = null;
          // Trigger the useEffect to reopen by nudging sessionId — safest is just
          // to close and let the visibilitychange + this onerror path handle it.
          // Instead, directly reopen here so there's no dependency on tab focus.
          const newEs = new EventSource(`/api/remote/events/${sessionId}`);
          esRef.current = newEs;
          newEs.addEventListener("connected", () => setPcConnected(true));
          newEs.onerror = () => setPcConnected(false);
          newEs.addEventListener("command", (ev: MessageEvent) => {
            try {
              const cmd = JSON.parse(ev.data as string) as { type: string; payload: Record<string, string> };
              setPhoneConnected(true);
              switch (cmd.type) {
                case "navigate": setLocation(cmd.payload.path ?? "/"); break;
                case "open-url": setPendingOpen({ url: cmd.payload.url }); break;
                case "save-url": setPendingSave({ url: cmd.payload.url, title: cmd.payload.title }); break;
              }
            } catch { /* ignore */ }
          });
        }
      }, 5000);
    };

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es.close();
      esRef.current = null;
      setPcConnected(false);
    };
  }, [sessionId, setLocation]);

  // Reconnect SSE after sleep/wake or tab becoming visible again
  useEffect(() => {
    if (!sessionId) return;
    const reconnect = () => {
      if (document.visibilityState !== "visible") return;
      const es = esRef.current;
      // EventSource.CLOSED = 2; if it's closed or gone, reopen it
      if (!es || es.readyState === EventSource.CLOSED) {
        const newEs = new EventSource(`/api/remote/events/${sessionId}`);
        esRef.current = newEs;
        newEs.addEventListener("connected", () => setPcConnected(true));
        newEs.onerror = () => setPcConnected(false);
        newEs.addEventListener("command", (e: MessageEvent) => {
          try {
            const cmd = JSON.parse(e.data as string) as { type: string; payload: Record<string, string> };
            setPhoneConnected(true);
            switch (cmd.type) {
              case "navigate": setLocation(cmd.payload.path ?? "/"); break;
              case "open-url": setPendingOpen({ url: cmd.payload.url }); break;
              case "url-saved": showSaved(cmd.payload.url, cmd.payload.title); break;
            }
          } catch { /* ignore */ }
        });
      }
    };
    document.addEventListener("visibilitychange", reconnect);
    return () => document.removeEventListener("visibilitychange", reconnect);
  }, [sessionId, setLocation]);

  const remoteUrl = sessionId
    ? `${window.location.origin}/remote?session=${sessionId}`
    : null;

  return {
    sessionId,
    pcConnected,
    phoneConnected,
    remoteUrl,
    lastSaved,
    clearLastSaved: () => setLastSaved(null),
    pendingOpen,
    clearPendingOpen: () => setPendingOpen(null),
    createSession,
    stopSession,
  };
}
