import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Users, X, Copy, Check, Loader2, Tv2, MessageSquare, Send, Mic, ChevronDown, Languages, Radio, Trophy } from "lucide-react";

type TriviaQuestion = { topic: string; question: string; answer: string; choices?: string[] };
export type TriviaData = { title: string; question_count: number; estimated_minutes: number; questions: TriviaQuestion[] };
import { useAuth } from "@workspace/replit-auth-web";

const DICTATION_LANGS: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "it-IT", label: "Italian" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "ar-SA", label: "Arabic" },
  { code: "hi-IN", label: "Hindi" },
];

// ── MIC WAVEFORM ────────────────────────────────────────────────────────────
function useMicWaveform(active: boolean, numBars = 4): number[] {
  const [bars, setBars] = useState<number[]>(() => new Array(numBars).fill(0));
  const rafRef = useRef<number>(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setBars(new Array(numBars).fill(0));
      return;
    }

    let cancelled = false;

    navigator.mediaDevices?.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 32;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          const step = Math.max(1, Math.floor(data.length / numBars));
          setBars(Array.from({ length: numBars }, (_, i) => data[i * step] / 255));
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        cleanupRef.current = () => {
          cancelled = true;
          cancelAnimationFrame(rafRef.current);
          stream.getTracks().forEach((t) => t.stop());
          ctx.close().catch(() => {});
        };
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      cleanupRef.current?.();
      cleanupRef.current = null;
      setBars(new Array(numBars).fill(0));
    };
  }, [active, numBars]);

  return bars;
}

function WaveformBars({ bars, dark = false }: { bars: number[]; dark?: boolean }) {
  const allZero = bars.every((b) => b === 0);
  if (allZero) return null;
  return (
    <div
      className="flex items-end gap-px shrink-0"
      style={{ height: 16, width: bars.length * 5 - 1 }}
      aria-hidden="true"
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: `${Math.round(Math.max(20, h * 100))}%`,
            background: dark ? "rgba(255,255,255,0.85)" : "#ef4444",
            borderRadius: 2,
            transition: "height 80ms ease-out",
          }}
        />
      ))}
    </div>
  );
}

// ── TYPING DOTS ──────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <span className="inline-flex items-end gap-px" style={{ height: 12 }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4, height: 4, borderRadius: "50%",
            background: "rgba(255,255,255,0.6)",
            display: "inline-block",
            animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
// ────────────────────────────────────────────────────────────────────────────

export interface Participant {
  userId: string;
  name: string;
}

export interface SyncEvent {
  currentTime: number;
  playing: boolean;
  fromUserId: string;
}

export interface ChatMessage {
  fromUserId: string;
  fromName: string;
  text: string;
  timestamp: number;
}

// A watch session is either an URLinc-hosted video (videoId set) or a
// title from an external service like Plex/Jellyfin, played in that
// service's own player (external set) -- exactly one is non-null.
export interface ExternalMedia {
  source: "plex" | "jellyfin" | "jellyfin-3d";
  title: string;
  watchUrl: string;
  thumbnailUrl: string | null;
}

export interface WatchSession {
  sessionId: string;
  videoId: number | null;
  external: ExternalMedia | null;
  hostId: string;
  participants: Participant[];
}

interface UseWatchSessionOptions {
  onSync?: (event: SyncEvent) => void;
  onSessionEnded?: () => void;
  onParticipantJoined?: (p: Participant) => void;
  onParticipantLeft?: (p: Participant) => void;
  onChatMessage?: (msg: ChatMessage) => void;
  onTyping?: (userId: string, name: string) => void;
  onReconnected?: () => void;
  onParticipantReconnected?: (p: Participant) => void;
  onQueuedChatDiscarded?: (count: number) => void;
  onTriviaReady?: (triviaData: TriviaData) => void;
}

const CLIENT_PING_INTERVAL_MS = 20_000;
const RECONNECT_MAX_ATTEMPTS  = 10;
const CHAT_QUEUE_MAX          = 20;

export function useWatchSession(options: UseWatchSessionOptions) {
  const { onSync, onSessionEnded, onParticipantJoined, onParticipantLeft, onChatMessage, onTyping, onReconnected, onParticipantReconnected, onQueuedChatDiscarded, onTriviaReady } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [session, setSession] = useState<WatchSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const chatQueueRef = useRef<string[]>([]);
  const [chatQueueLength, setChatQueueLength] = useState(0);

  const onSyncRef = useRef(onSync);
  const onSessionEndedRef = useRef(onSessionEnded);
  const onParticipantJoinedRef = useRef(onParticipantJoined);
  const onParticipantLeftRef = useRef(onParticipantLeft);
  const onChatMessageRef = useRef(onChatMessage);
  const onTypingRef = useRef(onTyping);
  const onReconnectedRef = useRef(onReconnected);
  const onParticipantReconnectedRef = useRef(onParticipantReconnected);
  const onQueuedChatDiscardedRef = useRef(onQueuedChatDiscarded);
  const onTriviaReadyRef = useRef(onTriviaReady);
  useEffect(() => {
    onSyncRef.current = onSync;
    onSessionEndedRef.current = onSessionEnded;
    onParticipantJoinedRef.current = onParticipantJoined;
    onParticipantLeftRef.current = onParticipantLeft;
    onChatMessageRef.current = onChatMessage;
    onTypingRef.current = onTyping;
    onReconnectedRef.current = onReconnected;
    onParticipantReconnectedRef.current = onParticipantReconnected;
    onQueuedChatDiscardedRef.current = onQueuedChatDiscarded;
    onTriviaReadyRef.current = onTriviaReady;
  });

  const scheduleReconnect = useCallback(() => {
    if (intentionalCloseRef.current) return;
    if (!sessionIdRef.current) return;
    if (reconnectAttemptRef.current >= RECONNECT_MAX_ATTEMPTS) {
      setReconnecting(false);
      const discarded = chatQueueRef.current.length;
      chatQueueRef.current = [];
      setChatQueueLength(0);
      if (discarded > 0) onQueuedChatDiscardedRef.current?.(discarded);
      return;
    }
    const delay = Math.min(300 * Math.pow(2, reconnectAttemptRef.current), 30_000);
    reconnectAttemptRef.current += 1;
    setReconnecting(true);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectWsRef.current();
    }, delay);
  }, []);

  const connectWsRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState < 2) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/api/ws/watch`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      reconnectAttemptRef.current = 0;
      const sid = sessionIdRef.current;
      if (sid) ws.send(JSON.stringify({ type: "join", sessionId: sid }));
    };

    ws.onclose = () => {
      setConnected(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data !== "string") return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data) as Record<string, unknown>; } catch { return; }

      const type = msg.type as string;

      if (type === "pong") return;

      if (type === "joined") {
        sessionIdRef.current = msg.sessionId as string;
        const participants = (msg.participants ?? []) as Participant[];
        setSession((prev) => prev ? { ...prev, participants } : null);
        if (msg.wasReconnect) onReconnectedRef.current?.();
        if (chatQueueRef.current.length > 0) {
          const queued = chatQueueRef.current.splice(0);
          setChatQueueLength(0);
          for (const text of queued) {
            ws.send(JSON.stringify({ type: "chat", text }));
          }
        }
      }

      if (type === "sync") {
        onSyncRef.current?.({
          currentTime: msg.currentTime as number,
          playing: Boolean(msg.playing),
          fromUserId: msg.fromUserId as string,
        });
      }

      if (type === "participant_joined") {
        const p: Participant = { userId: msg.userId as string, name: msg.name as string };
        setSession((prev) => prev ? { ...prev, participants: [...prev.participants.filter((x) => x.userId !== p.userId), p] } : null);
        onParticipantJoinedRef.current?.(p);
      }

      if (type === "participant_left") {
        const userId = msg.userId as string;
        setSession((prev) => prev ? { ...prev, participants: prev.participants.filter((x) => x.userId !== userId) } : null);
        onParticipantLeftRef.current?.({ userId, name: msg.name as string });
      }

      if (type === "participant_reconnected") {
        const p: Participant = { userId: msg.userId as string, name: msg.name as string };
        setSession((prev) =>
          prev ? { ...prev, participants: [...prev.participants.filter((x) => x.userId !== p.userId), p] } : null
        );
        onParticipantReconnectedRef.current?.(p);
      }

      if (type === "session_ended") {
        sessionIdRef.current = null;
        const discarded = chatQueueRef.current.length;
        chatQueueRef.current = [];
        setChatQueueLength(0);
        if (discarded > 0) onQueuedChatDiscardedRef.current?.(discarded);
        setSession(null);
        onSessionEndedRef.current?.();
      }

      if (type === "chat") {
        onChatMessageRef.current?.({
          fromUserId: msg.fromUserId as string,
          fromName: msg.fromName as string,
          text: msg.text as string,
          timestamp: msg.timestamp as number,
        });
      }

      if (type === "typing") {
        onTypingRef.current?.(msg.userId as string, msg.name as string);
      }

      if (type === "trivia_ready" && msg.triviaData) {
        onTriviaReadyRef.current?.(msg.triviaData as TriviaData);
      }
    };
  }, [scheduleReconnect]);

  connectWsRef.current = connect;

  useEffect(() => {
    const interval = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, CLIENT_PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const joinSession = useCallback(async (sessionId: string, sessionData: WatchSession) => {
    intentionalCloseRef.current = false;
    reconnectAttemptRef.current = 0;
    setSession(sessionData);
    // Persist so the user can navigate away and return to the session
    try {
      sessionStorage.setItem("wt-active-session", JSON.stringify({
        sessionId,
        videoId: sessionData.videoId,
        external: sessionData.external ? { title: sessionData.external.title } : null,
      }));
      window.dispatchEvent(new Event("wt-session-change"));
    } catch { /* sessionStorage blocked */ }
    connect();
    const ws = wsRef.current!;
    const sendJoin = () => ws.send(JSON.stringify({ type: "join", sessionId }));
    if (ws.readyState === WebSocket.OPEN) {
      sendJoin();
    } else {
      ws.addEventListener("open", sendJoin, { once: true });
    }
  }, [connect]);

  const sendSync = useCallback((currentTime: number, playing: boolean) => {
    const ws = wsRef.current;
    const sid = sessionIdRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !sid) return;
    ws.send(JSON.stringify({ type: "sync", currentTime, playing }));
  }, []);

  const sendChat = useCallback((text: string) => {
    const ws = wsRef.current;
    const sid = sessionIdRef.current;
    if (!sid) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "chat", text }));
    } else if (chatQueueRef.current.length < CHAT_QUEUE_MAX) {
      chatQueueRef.current.push(text);
      setChatQueueLength(chatQueueRef.current.length);
    }
  }, []);

  const sendTyping = useCallback(() => {
    const ws = wsRef.current;
    const sid = sessionIdRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !sid) return;
    ws.send(JSON.stringify({ type: "typing" }));
  }, []);

  const clearStoredSession = () => {
    try { sessionStorage.removeItem("wt-active-session"); window.dispatchEvent(new Event("wt-session-change")); } catch { /* ignore */ }
  };

  const endSession = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    const discardedEnd = chatQueueRef.current.length;
    chatQueueRef.current = [];
    setChatQueueLength(0);
    if (discardedEnd > 0) onQueuedChatDiscardedRef.current?.(discardedEnd);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end" }));
    }
    sessionIdRef.current = null;
    setSession(null);
    setReconnecting(false);
    clearStoredSession();
  }, []);

  const leaveSession = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    const discardedLeave = chatQueueRef.current.length;
    chatQueueRef.current = [];
    setChatQueueLength(0);
    if (discardedLeave > 0) onQueuedChatDiscardedRef.current?.(discardedLeave);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "leave" }));
      ws.close();
    }
    sessionIdRef.current = null;
    setSession(null);
    setReconnecting(false);
    clearStoredSession();
  }, []);

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      chatQueueRef.current = [];
      wsRef.current?.close();
    };
  }, []);

  return { session, connected, reconnecting, chatQueueLength, joinSession, sendSync, sendChat, sendTyping, endSession, leaveSession };
}

// ── Watch Together Button + Modal ──────────────────────────────────────────

interface WatchTogetherButtonCommonProps {
  onSessionStarted?: (session: WatchSession, watchHook: ReturnType<typeof useWatchSession>) => void;
  watchHook: ReturnType<typeof useWatchSession>;
  iconOnly?: boolean;
  onOpenChange?: (open: boolean) => void;
}
// Exactly one of videoId (an URLinc-hosted upload) or external (a
// Plex/Jellyfin title) -- same shape the backend expects.
type WatchTogetherButtonProps = WatchTogetherButtonCommonProps &
  ({ videoId: number; external?: undefined } | { videoId?: undefined; external: ExternalMedia });

interface Friend { id: string; email: string; firstName: string | null; lastName: string | null }

const MAX_INVITE = 4;

export function WatchTogetherButton({ videoId, external, onSessionStarted, watchHook, iconOnly, onOpenChange }: WatchTogetherButtonProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const PANEL_WIDTH = 256; // matches w-64 below
  // The dropdown is portaled to document.body (see render) rather than
  // living inside this button's own DOM position -- when this button sits
  // in a poster grid near the left edge of the screen, an ancestor further
  // up (the card's own stacking context, the scroll container, etc.) could
  // clip or paint behind it no matter how high its z-index went; a raw
  // z-index bump alone didn't fix that in practice. Rendering at the very
  // top of the DOM and positioning it with fixed pixel coordinates sidesteps
  // that entirely. Recomputed on open (and on resize, since screen size can
  // change while it's open) from the trigger's own on-screen position.
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  const PANEL_HEIGHT = 320;
  const recomputePanelPos = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(Math.max(8, rect.right - PANEL_WIDTH), window.innerWidth - PANEL_WIDTH - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= PANEL_HEIGHT
      ? rect.bottom + 4
      : Math.max(8, rect.top - PANEL_HEIGHT - 4);
    setPanelPos({ top, left });
  }, [PANEL_HEIGHT]);

  useEffect(() => {
    if (!open) { setPanelPos(null); return; }
    recomputePanelPos();
    window.addEventListener("resize", recomputePanelPos);
    return () => window.removeEventListener("resize", recomputePanelPos);
  }, [open, recomputePanelPos]);

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  // Prefetch on mount so the list is ready by the time the dropdown opens.
  useEffect(() => {
    if (friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { setFriends(data as Friend[]); setFriendsLoaded(true); })
      .catch(() => setFriendsLoaded(true));
  }, [friendsLoaded]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggleFriend = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else if (next.size < MAX_INVITE) { next.add(id); }
      return next;
    });
  };

  const handleStart = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/watch-sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          videoId != null
            ? { videoId, inviteeIds: Array.from(selected) }
            : { external, inviteeIds: Array.from(selected) }
        ),
      });
      const data = await res.json() as { sessionId?: string; inviteeNames?: string[]; error?: string };
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to create session", variant: "destructive" });
        return;
      }

      const { sessionId } = data;
      if (!sessionId) return;

      const joinRes = await fetch(`/api/watch-sessions/${sessionId}/join`, {
        method: "POST", credentials: "include",
      });
      const joinData = await joinRes.json() as WatchSession;

      await watchHook.joinSession(sessionId, joinData);
      onSessionStarted?.(joinData, watchHook);

      if (selected.size > 0) {
        const names = (data.inviteeNames ?? []).join(", ");
        toast({
          title: `Invite${selected.size > 1 ? "s" : ""} sent to ${names}`,
          description: "They'll see a notification to join the session.",
        });
      }
      setOpen(false);
      setSelected(new Set());
    } catch {
      toast({ title: "Failed to create session", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (!user) return null;

  return (
    <div className="relative" ref={triggerRef}>
      {iconOnly ? (
        <button
          onClick={() => setOpen((o) => !o)}
          title="Watch Together"
          className="p-1.5 rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Tv2 className="w-4 h-4" />
        </button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} className="gap-2">
          <Tv2 className="h-4 w-4" />
          Watch Together
        </Button>
      )}

      {open && panelPos && createPortal(
        <div
          ref={overlayRef}
          style={{ position: "fixed", top: panelPos.top, left: panelPos.left, width: PANEL_WIDTH }}
          className="z-[9999] bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invite friends to watch</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Select up to {MAX_INVITE}</p>
          </div>

          {!friendsLoaded ? (
            <div className="px-4 py-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading friends…
            </div>
          ) : friends.length === 0 ? (
            <div className="px-4 py-3 space-y-2.5">
              <p className="text-xs text-muted-foreground text-center">No friends added yet — you can share an invite link after starting.</p>
              <button
                onClick={() => void handleStart()}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tv2 className="w-3.5 h-3.5" />}
                {creating ? "Starting…" : "Start Watch Together"}
              </button>
            </div>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto">
                {friends.map((f) => {
                  const name = [f.firstName, f.lastName].filter(Boolean).join(" ").trim() || f.email;
                  const checked = selected.has(f.id);
                  const disabled = !checked && selected.size >= MAX_INVITE;
                  return (
                    <button
                      key={f.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left disabled:opacity-40"
                      disabled={disabled}
                      onClick={() => toggleFriend(f.id)}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                        {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{name}</p>
                        {name !== f.email && <p className="text-xs text-muted-foreground truncate">{f.email}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="px-3 py-2.5 border-t border-border">
                <button
                  onClick={() => void handleStart()}
                  disabled={creating}
                  className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
                >
                  {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tv2 className="w-3.5 h-3.5" />}
                  {creating ? "Starting…" : selected.size === 0 ? "Start Watch Together" : `Start with ${selected.size} ${selected.size === 1 ? "friend" : "friends"}`}
                </button>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Session Status Bar ──────────────────────────────────────────────────────

interface SessionStatusBarProps {
  session: WatchSession;
  currentUserId: string;
  connected: boolean;
  reconnecting?: boolean;
  onEnd: () => void;
  onLeave: () => void;
}

export function SessionStatusBar({ session, currentUserId, connected, reconnecting, onEnd, onLeave }: SessionStatusBarProps) {
  const isHost = session.hostId === currentUserId;
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl">
      <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-green-400 animate-pulse" : reconnecting ? "bg-yellow-400 animate-pulse" : "bg-red-400"}`} />
      <div className="flex items-center gap-1 shrink-0">
        {session.participants.map((p) => (
          <span key={p.userId} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold uppercase border border-border" title={p.name}>
            {p.name.charAt(0)}
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {reconnecting ? "Reconnecting…" : session.participants.length === 1 ? "Waiting for others to join…" : "Watching together"}
        </p>
        <p className="text-xs text-muted-foreground">Watch Together session active</p>
      </div>
      <span
        title={`Voice room: ${session.sessionId.slice(0, 6).toUpperCase()} — use the Talk button in the chat bar below`}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-muted text-muted-foreground shrink-0 select-none"
      >
        <Mic className="w-3.5 h-3.5" />
        Voice: {session.sessionId.slice(0, 6).toUpperCase()}
      </span>
      <button
        onClick={isHost ? onEnd : onLeave}
        className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors shrink-0"
      >
        {isHost ? "End Watch Together" : "Leave Watch Together"}
      </button>
    </div>
  );
}

// ── Chat Panel ───────────────────────────────────────────────────────────────

interface PTTProps {
  joined: boolean;
  micState: "idle" | "pending" | "ok" | "denied";
  transmitting: boolean;
  level: number;
  roomCode: string | null;
  onRequestMic: () => void | Promise<void>;
  onTransmit: (active: boolean) => void;
  onEnableAudio: () => void | Promise<void>;
  audioHealth: "ok" | "blocked" | "checking";
  peers: { id: string; nickname: string; speaking: boolean }[];
}

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (text: string) => void;
  onTyping?: () => void;
  reconnecting?: boolean;
  chatQueueLength?: number;
  captionTimeout?: number;
  onCaptionTimeoutChange?: (val: number) => void;
  dictationLang?: string;
  onDictationLangChange?: (val: string) => void;
  showDictationControls?: boolean;
  onShowDictationControlsChange?: (val: boolean) => void;
  // True while the video's own fullscreen wrapper (which this panel is a
  // normal child of, not portaled into) is the browser's fullscreen
  // element. Previously this component tracked document.fullscreenElement
  // itself via its own fullscreenchange listener and portaled into it,
  // racing against the video page's own listener (which swaps the
  // fullscreen target from the YouTube iframe to its wrapper) — the two
  // didn't reliably agree on which element was actually fullscreen, which
  // is why chat and its controls could vanish. Now that this panel is
  // rendered as a normal child of that same wrapper instead of portaled
  // elsewhere, all it needs is this boolean to switch its own positioning.
  isFullscreen?: boolean;
  /** Optional push-to-talk integration — shows a hold-to-talk button in the input bar */
  ptt?: PTTProps;
  /** Trivia data for the current content — enables the trivia toggle in Chat Settings */
  triviaData?: TriviaData | null;
  /** Controls whether Language Badge or Trivia is active */
  chatMode?: "language-badge" | "trivia";
  onChatModeChange?: (val: "language-badge" | "trivia") => void;
  /** True when the current user is the session host — only host fires trivia questions */
  isHost?: boolean;
}

export function ChatPanel({ messages, currentUserId, onSend, onTyping, reconnecting, chatQueueLength = 0, captionTimeout, onCaptionTimeoutChange, dictationLang: dictationLangProp = "en-US", onDictationLangChange, showDictationControls = true, onShowDictationControlsChange, isFullscreen = false, ptt, triviaData, chatMode = "language-badge", onChatModeChange, isHost = false }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [bgOpacity, setBgOpacity] = useState(0.18);
  const [showOpacitySlider, setShowOpacitySlider] = useState(false);
  const [pttAlwaysOn, setPttAlwaysOnState] = useState(false);
  const pttAlwaysOnRef = useRef(false);
  const setPttAlwaysOn = (val: boolean) => { pttAlwaysOnRef.current = val; setPttAlwaysOnState(val); };
  const lastTapRef = useRef(0);
  const [chatLines, setChatLines] = useState(5);
  const [lineHeight, setLineHeight] = useState(28);
  const chatHeight = chatLines * lineHeight + 12;
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleIncomingTyping = useCallback((userId: string, name: string) => {
    setTypingUsers((prev) => ({ ...prev, [userId]: name }));
    if (typingTimersRef.current[userId]) clearTimeout(typingTimersRef.current[userId]);
    typingTimersRef.current[userId] = setTimeout(() => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 3000);
  }, []);

  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTypingSignal = useCallback(() => {
    if (typingThrottleRef.current) return;
    onTyping?.();
    typingThrottleRef.current = setTimeout(() => {
      typingThrottleRef.current = null;
    }, 2000);
  }, [onTyping]);

  const [hidden, setHidden] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const prevMessageCountRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current && hidden) setHasUnread(true);
    prevMessageCountRef.current = messages.length;
  }, [messages, hidden]);

  const handleReopen = () => { setHidden(false); setHasUnread(false); };

  // ── Trivia timer (host only) ──────────────────────────────────────────────
  const triviaStartRef = useRef<number | null>(null);
  const sentTriviaRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (chatMode === "trivia" && triviaData && isHost) {
      triviaStartRef.current = Date.now();
      sentTriviaRef.current = new Set();
    } else {
      triviaStartRef.current = null;
    }
  }, [chatMode, triviaData, isHost]);

  useEffect(() => {
    if (chatMode !== "trivia" || !triviaData || !isHost) return;
    const letters = ["A", "B", "C", "D"];
    const spacingSec = (triviaData.estimated_minutes * 60) / triviaData.questions.length;

    const interval = setInterval(() => {
      if (triviaStartRef.current === null) return;
      const elapsedSec = (Date.now() - triviaStartRef.current) / 1000;

      triviaData.questions.forEach((q, i) => {
        const triggerAt = spacingSec * (i + 0.5);
        if (elapsedSec >= triggerAt && !sentTriviaRef.current.has(i)) {
          sentTriviaRef.current.add(i);
          const choiceLine = q.choices
            ? q.choices.map((c, ci) => `${letters[ci]}) ${c}`).join("  ·  ")
            : "";
          const msg = [`🎬 Q${i + 1}/${triviaData.questions.length} · ${q.topic.toUpperCase()}`, q.question, choiceLine, "Reply A · B · C · D — 30 sec"].filter(Boolean).join("\n");
          onSend(msg);
          setTimeout(() => onSend(`✅ Q${i + 1} answer: ${q.answer}`), 30_000);
        }
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [chatMode, triviaData, isHost, onSend]);

  const triviaActive = chatMode === "trivia" && !!triviaData;
  const effectiveShowDictation = triviaActive ? false : showDictationControls;

  const [translateMode, setTranslateMode] = useState(false);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translatingCount, setTranslatingCount] = useState(0);

  const translateMessage = useCallback(async (key: string, originalText: string) => {
    setTranslatingCount((c) => c + 1);
    try {
      const targetLang = (dictationLangProp || "en-US").split("-")[0];
      const res = await fetch("/api/translate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: originalText, targetLang }),
      });
      if (res.ok) {
        const data = await res.json() as { translatedText: string };
        setTranslations((prev) => ({ ...prev, [key]: data.translatedText }));
      }
    } catch { } finally {
      setTranslatingCount((c) => Math.max(0, c - 1));
    }
  }, [dictationLangProp]);

  const toggleTranslateMode = useCallback(() => setTranslateMode((on) => !on), []);

  const [captionsVisible, setCaptionsVisible] = useState(() => captionTimeout === undefined);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (captionTimeout === undefined) return;
    if (captionTimeout === 0 || messages.length === 0) { setCaptionsVisible(false); return; }
    setCaptionsVisible(true);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => setCaptionsVisible(false), captionTimeout * 1000);
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, captionTimeout]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);

  const speechSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const draftPrefixRef = useRef("");
  const waveformBars = useMicWaveform(isListening);

  const toggleListening = useCallback(() => {
    if (isListening) { recognitionRef.current?.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = dictationLangProp;
    rec.interimResults = true;
    rec.continuous = false;
    draftPrefixRef.current = draft;
    rec.onresult = (e: any) => {
      let finalText = ""; let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interimText += e.results[i][0].transcript;
      }
      const prefix = draftPrefixRef.current;
      const sep = prefix && !prefix.endsWith(" ") ? " " : "";
      setDraft(prefix + sep + finalText + interimText);
    };
    rec.onend = () => { setIsListening(false); recognitionRef.current = null; };
    rec.onerror = () => { setIsListening(false); recognitionRef.current = null; };
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, [isListening, draft, dictationLangProp]);

  useEffect(() => () => { recognitionRef.current?.abort(); }, []);

  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (messages.length > prevMessageCountRef.current) {
      setNewMessageCount((c) => c + (messages.length - prevMessageCountRef.current));
    }
  }, [messages, isNearBottom]);

  useEffect(() => {
    const measure = () => {
      const el = scrollContainerRef.current?.querySelector(".space-y-0\\.5 > div");
      if (el) {
        const measured = el.getBoundingClientRect().height;
        if (measured > 0) setLineHeight(Math.round(measured));
      }
    };
    measure();
    const t = setTimeout(measure, 500);
    return () => clearTimeout(t);
  }, [messages]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { userId, name } = (e as CustomEvent).detail;
      handleIncomingTyping(userId, name);
    };
    window.addEventListener("urlinc:typing", handler);
    return () => window.removeEventListener("urlinc:typing", handler);
  }, [handleIncomingTyping]);

  // Only auto-focus when the user explicitly reopens chat after hiding it —
  // not on the very first mount, right as they land on the page (e.g. from
  // a Watch Together invite link). Focusing an off-screen-at-that-instant
  // input can drag the browser's own "scroll focused element into view"
  // behavior along with it, fighting whatever the page itself is trying to
  // scroll to right as it loads.
  const chatFirstMountRef = useRef(true);
  useEffect(() => {
    if (chatFirstMountRef.current) { chatFirstMountRef.current = false; return; }
    if (!hidden) inputRef.current?.focus();
  }, [hidden]);

  useEffect(() => {
    if (!hidden) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      setIsNearBottom(true);
      setNewMessageCount(0);
    }
  }, [hidden]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
    setIsNearBottom(true);
  }, [chatLines]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
    setIsNearBottom(true);
  }, [chatLines]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 40;
    setIsNearBottom(nearBottom);
    if (nearBottom) setNewMessageCount(0);
  }, []);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const safeLang = typeof dictationLangProp === "string" && dictationLangProp ? dictationLangProp : "en-US";
  const langLabel = DICTATION_LANGS.find((l) => l.code === safeLang)?.label.split(" ")[0] ?? safeLang.split("-")[0].toUpperCase();

  const recent = messages;
  const showMessages = captionTimeout === undefined ? true : captionsVisible;

  useEffect(() => {
    if (!translateMode) return;
    for (let i = 0; i < recent.length; i++) {
      const msg = recent[i];
      const key = `${msg.fromUserId}-${msg.timestamp}`;
      if (!(key in translations)) void translateMessage(key, msg.text);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateMode, recent, translations]);

  const typingNames = Object.values(typingUsers);
  const typingLabel = typingNames.length === 0 ? null
    : typingNames.length === 1 ? `${typingNames[0]} is typing`
    : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing`
    : "Several people are typing";

  // Caption slider value: 0=hidden, 1-30=seconds, 31=always on (undefined)
  const captionSliderValue = captionTimeout === undefined ? 31 : captionTimeout;
  const captionSliderLabel = captionTimeout === undefined
    ? "Always visible"
    : captionTimeout === 0
    ? "Hidden"
    : `Fades after ${captionTimeout}s`;

  if (hidden) {
    return (
      <div className={`${isFullscreen ? "absolute" : "fixed"} bottom-3 left-1/2 -translate-x-1/2 z-50`}>
        <button
          onClick={handleReopen}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/85 border border-white/15 text-white text-xs font-medium backdrop-blur-sm transition-colors shadow-lg"
          title="Show chat"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
          {hasUnread && <span className="w-2 h-2 rounded-full bg-primary" />}
          <ChevronDown className="w-3 h-3 rotate-180" />
        </button>
      </div>
    );
  }

  return (
    <>
        <div className={`${isFullscreen ? "absolute" : "fixed"} bottom-0 left-0 right-0 z-50`} style={{ background: `rgba(0,0,0,${1 - bgOpacity})` }}>
          <style>{`
            @keyframes typingBounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-4px)} }
            .urlinc-chat-scroll::-webkit-scrollbar { width: 3px; }
            .urlinc-chat-scroll::-webkit-scrollbar-track { background: transparent; }
            .urlinc-chat-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 999px; }
            .urlinc-chat-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
          `}</style>
          <div className="max-w-5xl mx-auto px-6 pt-3 pb-2">
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="urlinc-chat-scroll"
              style={{
                opacity: showMessages ? 1 : 0,
                transition: "opacity 0.5s ease",
                pointerEvents: showMessages ? "auto" : "none",
                maxHeight: showMessages ? `${chatHeight}px` : "0px",
                overflowY: showMessages ? "auto" : "hidden",
                overflowX: "hidden",
                transitionProperty: "opacity, max-height",
                transitionDuration: showMessages ? "0.3s, 0.3s" : "0.5s, 0.5s",
                transitionTimingFunction: "ease",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(255,255,255,0.15) transparent",
              }}
            >
              {recent.length === 0 && captionTimeout === undefined && (
                <p className="text-white/40 text-sm text-center py-1">No messages yet — say hi!</p>
              )}
              <div className="space-y-0.5 mb-2">
                {recent.map((msg) => {
                  const isMine = msg.fromUserId === currentUserId;
                  const key = `${msg.fromUserId}-${msg.timestamp}`;
                  const displayText = translateMode ? (translations[key] ?? msg.text) : msg.text;
                  return (
                    <div key={key} className="text-sm leading-relaxed">
                      <span className="font-semibold mr-1.5" style={{ color: isMine ? "#facc15" : "#86efac" }}>
                        {isMine ? "You" : msg.fromName}:
                      </span>
                      <span className="text-white">{displayText}</span>
                    </div>
                  );
                })}
              </div>
              {typingLabel && (
                <div className="flex items-center gap-1.5 pb-1">
                  <TypingDots />
                  <span className="text-[11px] text-white/50 italic">{typingLabel}</span>
                </div>
              )}
              <div ref={bottomRef} />
              {newMessageCount > 0 && !isNearBottom && (
                <div style={{ position: "sticky", bottom: 0, display: "flex", justifyContent: "center", paddingTop: 4, paddingBottom: 4 }}>
                  <button
                    onClick={() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); setNewMessageCount(0); }}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold shadow-lg"
                    style={{ background: "#facc15", color: "#1a1a1a" }}
                  >
                    {newMessageCount} new <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              )}
              {reconnecting && (
                <div className="text-[10px] text-yellow-400 pb-1 px-0.5 select-none">
                  {chatQueueLength > 0
                    ? `Reconnecting — ${chatQueueLength} message${chatQueueLength === 1 ? "" : "s"} queued`
                    : "Reconnecting — messages will send when back online"}
                </div>
              )}
            </div>
            {/* Audio blocked banner — shown when browser blocked audio autoplay */}
            {ptt && ptt.audioHealth === "blocked" && (
              <button
                type="button"
                onClick={() => void ptt.onEnableAudio()}
                className="w-full text-xs font-semibold py-1.5 px-3 rounded"
                style={{ background: "rgba(234,179,8,0.2)", border: "1px solid rgba(234,179,8,0.5)", color: "#fbbf24" }}
              >
                🔇 Tap here to enable incoming voice audio
              </button>
            )}
            {/* Speaking indicators — shown when someone is transmitting */}
            {ptt && ptt.peers.some(p => p.speaking) && (
              <div className="flex flex-wrap items-center gap-1.5 pb-1.5">
                {ptt.peers.filter(p => p.speaking).map(p => (
                  <div key={p.id} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)", color: "#4ade80" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0, animation: "typingBounce 0.8s infinite" }} />
                    {p.nickname}
                  </div>
                ))}
              </div>
            )}
            <div className="relative flex items-center gap-2 border-t border-white/10 pt-2">
              {/* PTT button — FIRST so it's always visible. Double-tap/click = always-on open mic */}
              {ptt && (
                <button
                  type="button"
                  onClick={() => {
                    if (!ptt.joined) return;
                    const now = Date.now();
                    if (now - lastTapRef.current < 400) {
                      lastTapRef.current = 0;
                      const next = !pttAlwaysOnRef.current;
                      setPttAlwaysOn(next);
                      void ptt.onEnableAudio();
                      if (next) {
                        if (ptt.micState !== "ok") void Promise.resolve(ptt.onRequestMic()).then(() => ptt.onTransmit(true));
                        else ptt.onTransmit(true);
                      } else {
                        ptt.onTransmit(false);
                      }
                    } else {
                      lastTapRef.current = now;
                    }
                  }}
                  onPointerDown={(e) => {
                    void ptt.onEnableAudio();
                    if (pttAlwaysOnRef.current) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    if (!ptt.joined) return;
                    if (ptt.micState !== "ok") void Promise.resolve(ptt.onRequestMic()).then(() => ptt.onTransmit(true));
                    else ptt.onTransmit(true);
                  }}
                  onPointerUp={() => { if (!pttAlwaysOnRef.current) ptt.onTransmit(false); }}
                  onPointerLeave={() => { if (!pttAlwaysOnRef.current) ptt.onTransmit(false); }}
                  onPointerCancel={() => { if (!pttAlwaysOnRef.current) ptt.onTransmit(false); }}
                  className="flex items-center gap-1 px-3 py-2 rounded-full shrink-0 transition-all select-none touch-none text-xs font-bold"
                  style={
                    pttAlwaysOn
                      ? { background: "#7c3aed", color: "#fff", boxShadow: "0 0 0 3px rgba(124,58,237,0.5)", animation: "typingBounce 2s ease-in-out infinite" }
                      : ptt.transmitting
                        ? { background: "#ef4444", color: "#fff", boxShadow: "0 0 0 4px rgba(239,68,68,0.5)" }
                        : ptt.joined
                          ? { background: "#16a34a", color: "#fff", boxShadow: "0 0 0 2px rgba(22,163,74,0.4)" }
                          : { background: "rgba(255,255,255,0.25)", color: "#fff", border: "2px solid rgba(255,255,255,0.7)" }
                  }
                  title={pttAlwaysOn ? "Open mic ON — double-tap to turn off" : `Hold to talk · double-tap for open mic · room: ${ptt.roomCode ?? "…"}`}
                >
                  <Radio className="w-4 h-4 shrink-0" />
                  <span>{pttAlwaysOn ? "Live" : ptt.transmitting ? "Talking…" : ptt.joined ? `Talk${ptt.peers.length > 0 ? ` (${ptt.peers.length})` : ""}` : "Joining…"}</span>
                </button>
              )}
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (e.target.value.trim()) handleTypingSignal();
                }}
                onKeyDown={handleKeyDown}
                placeholder={reconnecting ? "Reconnecting…" : isListening ? "Listening…" : "Type a message…"}
                maxLength={500}
                className="flex-1 text-sm rounded-full px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/30 min-w-0"
                style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}
              />
              {triviaActive && isHost && (
                <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full shrink-0 select-none" style={{ background: "rgba(250,204,21,0.15)", border: "1px solid rgba(250,204,21,0.3)", color: "#facc15" }}>
                  <Trophy className="w-2.5 h-2.5" />
                  Trivia on
                </div>
              )}
              {effectiveShowDictation && (
                <button
                  onClick={toggleTranslateMode}
                  type="button"
                  className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 select-none transition-colors"
                  style={translateMode ? { background: "#facc15", color: "#1a1a1a" } : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}
                  title={translateMode ? "Translation on — tap to show original text" : `Translate messages to ${DICTATION_LANGS.find((l) => l.code === dictationLangProp)?.label ?? dictationLangProp}`}
                >
                  {translatingCount > 0 ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Languages className="w-2.5 h-2.5" />}
                  {langLabel}
                </button>
              )}
              {speechSupported && (
                <>
                  {isListening && <WaveformBars bars={waveformBars} dark />}
                  <button
                    onClick={toggleListening}
                    type="button"
                    className="p-1.5 rounded-full shrink-0 transition-all"
                    style={isListening ? { background: "#ef4444", color: "#fff", boxShadow: "0 0 0 3px rgba(239,68,68,0.4)" } : { background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
                    title={isListening ? "Stop dictation" : "Dictate message"}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={handleSend}
                disabled={!draft.trim()}
                className="p-1.5 rounded-full shrink-0 transition-opacity disabled:opacity-30"
                style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
                title="Send"
              >
                <Send className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowOpacitySlider((s) => !s)}
                className="p-1.5 rounded shrink-0 transition-opacity"
                style={{ color: showOpacitySlider ? "#facc15" : "rgba(255,255,255,0.5)" }}
                title="Chat settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
              </button>
              {showOpacitySlider && (
                <div
                  className="absolute bottom-full mb-2 right-4 flex flex-col gap-3 px-4 py-3 rounded-lg"
                  style={{ background: "rgba(0,0,0,0.92)", border: "1px solid rgba(255,255,255,0.15)", minWidth: "240px" }}
                >
                  {/* Header with close button */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/60 uppercase tracking-wide font-semibold">Chat Settings</span>
                    <button
                      type="button"
                      onClick={() => setShowOpacitySlider(false)}
                      className="p-0.5 rounded hover:bg-white/10 transition-colors"
                      style={{ color: "rgba(255,255,255,0.5)" }}
                      title="Close"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Transparency */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/50 uppercase tracking-wide">Transparency</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40 shrink-0">Low</span>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={bgOpacity}
                        onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                        className="flex-1 accent-yellow-400"
                      />
                      <span className="text-[10px] text-white/40 shrink-0">High</span>
                    </div>
                  </div>
                  {/* Chat Size */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/50 uppercase tracking-wide">Chat Size</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40 shrink-0">S</span>
                      <input
                        type="range" min="1" max="10" step="1"
                        value={chatLines}
                        onChange={(e) => setChatLines(parseInt(e.target.value))}
                        className="flex-1 accent-yellow-400"
                      />
                      <span className="text-[10px] text-white/40 shrink-0">L</span>
                    </div>
                  </div>
                  {/* Caption Fade */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/50 uppercase tracking-wide">Caption Fade</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40 shrink-0">Off</span>
                      <input
                        type="range" min="0" max="31" step="1"
                        value={captionSliderValue}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          onCaptionTimeoutChange?.(v >= 31 ? 999 : v);
                        }}
                        className="flex-1 accent-yellow-400"
                      />
                      <span className="text-[10px] text-white/40 shrink-0">∞</span>
                    </div>
                    <span className="text-[10px] text-white/40 text-center">{captionSliderLabel}</span>
                  </div>
                  {/* Dictation Language */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-white/50 uppercase tracking-wide">Dictation Language</span>
                    <select
                      value={dictationLangProp}
                      onChange={(e) => onDictationLangChange?.(e.target.value)}
                      style={{ background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, padding: "4px 8px", fontSize: 11 }}
                    >
                      {DICTATION_LANGS.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                  {/* Language Badge / Trivia dual-purpose toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-white/50 uppercase tracking-wide">
                        {triviaData ? (chatMode === "trivia" ? "Trivia" : "Language Badge") : "Language Badge"}
                      </span>
                      {triviaData && (
                        <span className="text-[9px] text-white/30">
                          {chatMode === "trivia" ? `${triviaData.question_count} questions · ${triviaData.estimated_minutes} min` : "Toggle for trivia"}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (triviaData) {
                          onChatModeChange?.(chatMode === "trivia" ? "language-badge" : "trivia");
                        } else {
                          onShowDictationControlsChange?.(!showDictationControls);
                        }
                      }}
                      className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
                      style={{ background: (triviaData ? chatMode === "trivia" : showDictationControls) ? "#facc15" : "rgba(255,255,255,0.2)" }}
                    >
                      <span
                        className="pointer-events-none block h-3 w-3 rounded-full bg-white shadow transition-transform"
                        style={{ transform: (triviaData ? chatMode === "trivia" : showDictationControls) ? "translateX(12px)" : "translateX(0px)" }}
                      />
                    </button>
                  </div>
                </div>
              )}
              <button
                onClick={() => setHidden(true)}
                className="p-1.5 rounded shrink-0 transition-opacity"
                style={{ color: "rgba(255,255,255,0.5)" }}
                title="Hide chat"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
    </>
  );
}
