import { useCallback, useEffect, useRef, useState } from "react";
import { useRoute, useSearch, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@workspace/replit-auth-web";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { Loader2, ArrowLeft, AlertTriangle, Tv2, Mic } from "lucide-react";
import {
  SessionStatusBar,
  ChatPanel,
  useWatchSession,
  type Participant,
  type ChatMessage,
  type WatchSession,
  type TriviaData,
} from "@/components/watch-session";
import { openInPlexPlayer } from "@/lib/external-player";
import { useRemote } from "@/contexts/RemoteContext";
import { useGroupIntercom } from "@/hooks/useGroupIntercom";

// Standalone page for Watch Together sessions built around a Plex/Jellyfin
// title rather than an URLinc upload. For Jellyfin sessions the page renders
// the Jellyfin player in a full-screen iframe with the chat panel overlaid —
// one screen, no window switching. For Plex sessions Plex opens in its own
// player window (Plex doesn't allow iframing) and this page shows the chat.
export default function WatchTogetherPage() {
  const [, routeParams] = useRoute("/watch-together/:sessionId");
  const sessionId = routeParams?.sessionId ?? "";
  const search = useSearch();
  const inviteToken = new URLSearchParams(search).get("token");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings, update } = useSettings();

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [joining, setJoining] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const joinAttemptedRef = useRef(false);

  // For videoId-based sessions (YouTube etc.) — fetch the stored video record
  const [videoData, setVideoData] = useState<{ title: string; url: string; thumbnailUrl: string | null } | null>(null);
  const [triviaData, setTriviaData] = useState<TriviaData | null>(null);

  // Jellyfin-specific: chat starts hidden so Jellyfin's own controls aren't blocked
  const [jellyfinChatOpen, setJellyfinChatOpen] = useState(false);
  const [jellyfinUnread, setJellyfinUnread] = useState(false);
  const prevMsgLenRef = useRef(0);

  const watchSession = useWatchSession({
    onSessionEnded: () => {
      toast({ title: "Watch Together session ended" });
      setChatMessages([]);
    },
    onParticipantJoined: (p: Participant) => toast({ title: `${p.name} joined the session` }),
    onParticipantLeft: (p: Participant) => toast({ title: `${p.name} left the session` }),
    onChatMessage: (msg: ChatMessage) => setChatMessages((prev) => [...prev, msg]),
    onTyping: (userId: string, name: string) => {
      window.dispatchEvent(new CustomEvent("urlinc:typing", { detail: { userId, name } }));
    },
    onTriviaReady: (data) => setTriviaData(data),
    onQueuedChatDiscarded: (count) => {
      toast({
        title: `${count} queued message${count === 1 ? "" : "s"} could not be sent`,
        description: "The session ended before the connection was restored.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!sessionId || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/watch-sessions/${sessionId}/join`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(inviteToken ? { token: inviteToken } : {}),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setJoinError(data.error ?? "Couldn't join this Watch Together session.");
          return;
        }
        const data = (await res.json()) as WatchSession;
        await watchSession.joinSession(data.sessionId, data);
      } catch {
        setJoinError("Couldn't join this Watch Together session.");
      } finally {
        setJoining(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const session = watchSession.session;
  const external = session?.external ?? null;

  // Fetch stored video record for library video sessions
  useEffect(() => {
    const vid = session?.videoId;
    if (!vid) return;
    fetch(`/api/videos/${vid}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setVideoData({ title: d.title ?? "Watch Together", url: d.youtubeUrl ?? d.url ?? "", thumbnailUrl: d.thumbnailUrl ?? null }); })
      .catch(() => {});
  }, [session?.videoId]);

  // Fetch trivia for the current video URL
  useEffect(() => {
    const url = videoData?.url ?? (external?.source !== "plex" ? external?.watchUrl : null) ?? "";
    if (!url || url.startsWith("jellyfin-item:")) return;
    fetch(`/api/discover/trivia-by-url?url=${encodeURIComponent(url)}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { triviaData?: TriviaData } | null) => { if (d?.triviaData) setTriviaData(d.triviaData); })
      .catch(() => {});
  }, [videoData?.url, external?.watchUrl, external?.source]);

  const { sessionId: remoteSessionId } = useRemote();

  // ── Auto-join intercom when session connects ──────────────────────────────
  const intercom = useGroupIntercom();
  const intercomJoinedRef = useRef(false);
  const intercomRoomCode = session ? session.sessionId.slice(0, 6).toUpperCase() : "";

  useEffect(() => {
    if (!session || intercomJoinedRef.current || intercom.joined) return;
    const roomCode = session.sessionId.slice(0, 6).toUpperCase();
    const nickname =
      (typeof localStorage !== "undefined" && localStorage.getItem("ptt-nickname")) ||
      (user ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() : "") ||
      "Guest";
    intercomJoinedRef.current = true;
    void intercom.joinRoom(roomCode, nickname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId]);

  // ── PTT keyboard shortcut: hold M to talk (works in native fullscreen) ────
  useEffect(() => {
    if (!intercom.joined) return;
    let active = false;
    const onDown = (e: KeyboardEvent) => {
      if (e.key !== "m" && e.key !== "M") return;
      if (e.repeat || active) return;
      active = true;
      if (intercom.micState !== "ok") {
        void intercom.requestMic().then(() => intercom.setTransmit(true));
      } else {
        intercom.setTransmit(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "m" && e.key !== "M") return;
      active = false;
      intercom.setTransmit(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intercom.joined, intercom.micState]);

  const handleLeave = () => {
    if (intercom.joined) intercom.leaveRoom();
    watchSession.leaveSession();
    setChatMessages([]);
    setLocation("/");
  };
  const handleEnd = () => {
    if (intercom.joined) intercom.leaveRoom();
    watchSession.endSession();
    setChatMessages([]);
    setLocation("/");
  };

  // Track unread messages that arrive while the Jellyfin chat panel is hidden
  useEffect(() => {
    if (chatMessages.length > prevMsgLenRef.current && !jellyfinChatOpen) setJellyfinUnread(true);
    prevMsgLenRef.current = chatMessages.length;
  }, [chatMessages.length, jellyfinChatOpen]);

  // ── Remote: broadcast watch state so phone can show playback controls ────────
  useEffect(() => {
    if (!remoteSessionId || !session || external?.source !== "jellyfin") return;
    fetch(`/api/remote/watch-state/${remoteSessionId}`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true, title: external.title, source: "jellyfin", watchSessionId: session.sessionId }),
    }).catch(() => {});
    return () => {
      fetch(`/api/remote/watch-state/${remoteSessionId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }).catch(() => {});
    };
  }, [remoteSessionId, session?.sessionId, external?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Remote: handle watch-control commands from phone ────────────────────────
  // Uses a server-side proxy (/api/integrations/jellyfin/remote-command) instead of
  // a direct browser fetch, because Jellyfin's CORS policy (Access-Control-Allow-Origin: *)
  // blocks credentialed cross-origin requests from the browser.
  const controlJellyfin = useCallback(async (action: string) => {
    const command = action === "play_pause" ? "PlayPause"
                  : action === "fast_forward" ? "FastForward"
                  : "Rewind";
    try {
      await fetch("/api/integrations/jellyfin/remote-command", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
    } catch { /* silently ignore network errors */ }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      void controlJellyfin((e as CustomEvent<{ action: string }>).detail.action);
    };
    window.addEventListener("urlinc:watch-control", handler);
    return () => window.removeEventListener("urlinc:watch-control", handler);
  }, [controlJellyfin]);

  // ── Jellyfin: full-page iframe with toggleable chat ─────────────────────────
  if (!joining && !joinError && session && (external?.source === "jellyfin" || external?.source === "jellyfin-3d")) {
    const overlayBtn: React.CSSProperties = {
      background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.15)",
      color: "#fff", borderRadius: 8, padding: "6px 14px",
      cursor: "pointer", fontSize: ".8rem", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", gap: 6,
    };
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
        {/* Top-left: Leave button */}
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 20 }}>
          <button onClick={handleLeave} style={overlayBtn}>← Leave</button>
        </div>

        {/* Top-right: Chat toggle — always visible, even in Jellyfin fullscreen */}
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20 }}>
          <button
            onClick={() => { setJellyfinChatOpen((o) => !o); setJellyfinUnread(false); }}
            style={overlayBtn}
          >
            💬 {jellyfinChatOpen ? "Hide Chat" : "Chat"}
            {!jellyfinChatOpen && jellyfinUnread && (
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#facc15", flexShrink: 0 }} />
            )}
          </button>
        </div>

        {/* Jellyfin player — fills the full page; 3D sessions go through the anaglyph player.
            The watchUrl for jellyfin-3d is a "jellyfin-item:<itemId>" marker — the actual
            stream is fetched server-side via session-stream so the API key never leaves the
            server or appears in session data broadcast to participants. */}
        <iframe
          src={external.source === "jellyfin-3d"
            ? (() => {
                const itemId = external.watchUrl.startsWith("jellyfin-item:")
                  ? external.watchUrl.slice("jellyfin-item:".length)
                  : external.watchUrl;
                const proxyUrl = `${window.location.origin}/api/integrations/jellyfin/session-stream?sessionId=${sessionId}&itemId=${encodeURIComponent(itemId)}`;
                return `/player-3d.html?src=${encodeURIComponent(proxyUrl)}&autoplay=0`;
              })()
            : external.watchUrl}
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          // eslint-disable-next-line react/no-unknown-property
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          title={external.title}
        />

        {/* Floating PTT button — bottom-left, always visible once intercom joins */}
        {intercom.joined && (
          <div style={{ position: "absolute", bottom: 16, left: 16, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
            {intercom.peers.filter(p => p.speaking).map(p => (
              <div key={p.id} style={{ ...overlayBtn, pointerEvents: "none", fontSize: ".75rem", gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
                {p.nickname}
              </div>
            ))}
            {intercom.micState !== "ok" ? (
              <button
                style={{ ...overlayBtn, background: "rgba(234,179,8,0.25)", border: "1px solid rgba(234,179,8,0.4)", userSelect: "none" }}
                onClick={async () => { await intercom.requestMic(); }}
                title={`Room: ${intercomRoomCode} — tap to enable microphone`}
              >
                <Mic style={{ width: 14, height: 14 }} />
                {intercom.micState === "pending" ? "Enabling mic…" : "Tap to enable mic"}
              </button>
            ) : (
              <button
                style={{
                  ...overlayBtn,
                  background: intercom.transmitting ? "rgba(239,68,68,0.75)" : "rgba(0,0,0,0.55)",
                  border: intercom.transmitting ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(255,255,255,0.15)",
                  userSelect: "none",
                }}
                onMouseDown={() => intercom.setTransmit(true)}
                onMouseUp={() => intercom.setTransmit(false)}
                onMouseLeave={() => { if (intercom.transmitting) intercom.setTransmit(false); }}
                onTouchStart={(e) => { e.preventDefault(); intercom.setTransmit(true); }}
                onTouchEnd={() => intercom.setTransmit(false)}
                title={`Room: ${intercomRoomCode} — hold to talk · hold M key in fullscreen`}
              >
                <Mic style={{ width: 14, height: 14 }} />
                {intercom.transmitting ? "Talking…" : "Hold to Talk (or M key)"}
              </button>
            )}
          </div>
        )}

        {/* Chat panel — only rendered when open so Jellyfin controls stay accessible */}
        {jellyfinChatOpen && user && session && (
          <ChatPanel
            messages={chatMessages}
            currentUserId={user.id}
            onSend={(text) => watchSession.sendChat(text)}
            onTyping={() => watchSession.sendTyping()}
            reconnecting={watchSession.reconnecting}
            chatQueueLength={watchSession.chatQueueLength}
            captionTimeout={settings.chatCaptionTimeout >= 999 ? undefined : settings.chatCaptionTimeout}
            onCaptionTimeoutChange={(val) => update("chatCaptionTimeout", val)}
            dictationLang={settings.dictationLang}
            onDictationLangChange={(val) => update("dictationLang", val)}
            showDictationControls={settings.showDictationControls}
            onShowDictationControlsChange={(val) => update("showDictationControls", val)}
            triviaData={triviaData}
            chatMode={settings.chatMode}
            onChatModeChange={(val) => update("chatMode", val)}
            isHost={user.id === session.hostId}
          />
        )}
      </div>
    );
  }

  // ── Standard layout: joining spinner, error, and Plex sessions ──────────────
  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-8 pb-40 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </button>

        {joining && !joinError && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            Joining Watch Together session…
          </div>
        )}

        {joinError && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive" />
            <h2 className="text-lg font-semibold">Can't join this session</h2>
            <p className="text-muted-foreground max-w-sm">{joinError}</p>
          </div>
        )}

        {!joining && !joinError && session && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-4">
              {(external?.thumbnailUrl ?? videoData?.thumbnailUrl) && (
                <img
                  src={(external?.thumbnailUrl ?? videoData?.thumbnailUrl)!}
                  alt={external?.title ?? videoData?.title ?? "Watch Together"}
                  className="w-20 h-28 object-cover rounded-lg shrink-0 border border-border"
                />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {external ? `${external.source === "plex" ? "Plex" : "Jellyfin"} · Watch Together` : "Watch Together"}
                </p>
                <h1 className="text-xl font-display font-bold truncate">{external?.title ?? videoData?.title ?? "Watch Together"}</h1>
              </div>
            </div>

            {external ? (
              <>
                <button
                  onClick={() => { openInPlexPlayer(external.watchUrl); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  <Tv2 className="w-4 h-4" />
                  Open in Plex
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  Opens in its own player window — everyone should press play on their end to watch together.
                </p>
              </>
            ) : videoData?.url ? (
              <>
                <a
                  href={videoData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  <Tv2 className="w-4 h-4" />
                  Open Video
                </a>
                <p className="text-xs text-muted-foreground text-center">
                  Opens in a new tab — everyone open the same link and press play together.
                </p>
              </>
            ) : null}

            {user && session && (
              <SessionStatusBar
                session={session}
                currentUserId={user.id}
                connected={watchSession.connected}
                reconnecting={watchSession.reconnecting}
                onEnd={handleEnd}
                onLeave={handleLeave}
              />
            )}
          </div>
        )}
      </div>

      {user && session && (
        <ChatPanel
          messages={chatMessages}
          currentUserId={user.id}
          onSend={(text) => watchSession.sendChat(text)}
          onTyping={() => watchSession.sendTyping()}
          reconnecting={watchSession.reconnecting}
          chatQueueLength={watchSession.chatQueueLength}
          captionTimeout={settings.chatCaptionTimeout >= 999 ? undefined : settings.chatCaptionTimeout}
          onCaptionTimeoutChange={(val) => update("chatCaptionTimeout", val)}
          dictationLang={settings.dictationLang}
          onDictationLangChange={(val) => update("dictationLang", val)}
          showDictationControls={settings.showDictationControls}
          onShowDictationControlsChange={(val) => update("showDictationControls", val)}
          triviaData={triviaData}
          chatMode={settings.chatMode}
          onChatModeChange={(val) => update("chatMode", val)}
          isHost={user.id === session.hostId}
          ptt={{
            joined: intercom.joined,
            micState: intercom.micState,
            transmitting: intercom.transmitting,
            level: intercom.level,
            roomCode: intercom.roomCode,
            onRequestMic: intercom.requestMic,
            onTransmit: intercom.setTransmit,
            onEnableAudio: intercom.enableAudio,
            audioHealth: intercom.audioHealth,
            peers: intercom.peers,
          }}
        />
      )}
    </Layout>
  );
}
