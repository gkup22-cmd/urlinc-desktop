import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "wouter";
import { useAuth } from "@workspace/replit-auth-web";
import { useGroupIntercom } from "@/hooks/useGroupIntercom";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import {
  Wifi, WifiOff, Send, Smartphone,
  Lock, Mail, Loader2, Play, Pause, SkipBack, SkipForward, MessageSquare, Mic,
  MicOff, Users,
} from "lucide-react";

type WatchState = { title: string; source: "jellyfin" | "plex"; watchSessionId: string } | null;
type JellyfinStatus = { playing: true; title: string; type: string; isPaused: boolean; positionTicks: number; runtimeTicks: number } | { playing: false };

const INTERCOM_ROOM = "FAMILY";

export default function PhoneRemotePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sessionId = params.get("session") ?? "";
  const { user } = useAuth();

  type AuthStatus = "checking" | "authorized" | "needs-login" | "wrong-account" | "magic-sent";

  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [pcConnected, setPcConnected] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [showCloseButton, setShowCloseButton] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const failCount = useRef(0);
  const sessionOkRef = useRef<boolean | null>(null);
  const isActiveTab = useRef(false);
  const bcRef = useRef<BroadcastChannel | null>(null);

  // Watch Together + Jellyfin state
  const [watchState, setWatchState] = useState<WatchState>(null);
  const [jellyfinStatus, setJellyfinStatus] = useState<JellyfinStatus>({ playing: false });
  const [isPlaying, setIsPlaying] = useState<boolean | null>(null);
  const lastCommandRef = useRef(0);

  // Always-on intercom (Family Room)
  const intercom = useGroupIntercom();
  const ptt = usePushToTalk({
    disabled: !intercom.joined || intercom.micState !== "ok",
    onTransmit: intercom.setTransmit,
  });
  const intercomJoinedRef = useRef(false);
  const [chatDraft, setChatDraft] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync so poll callback can read current sessionOk without
  // being listed as a dependency (which would restart the interval on every change).
  useEffect(() => { sessionOkRef.current = sessionOk; }, [sessionOk]);

  // Auto-close when duplicate detected; show manual button if browser blocks it.
  useEffect(() => {
    if (!isDuplicate) return;
    window.close();
    const t = setTimeout(() => setShowCloseButton(true), 300);
    return () => clearTimeout(t);
  }, [isDuplicate]);

  // Detect duplicate tabs: ping existing tabs, if one responds this is a dupe.
  useEffect(() => {
    if (!sessionId) return;
    let bc: BroadcastChannel;
    try { bc = new BroadcastChannel(`urlinc-remote-${sessionId}`); }
    catch { return; }
    bcRef.current = bc;

    bc.onmessage = (e: MessageEvent<{ type: string }>) => {
      if (e.data.type === "ping" && isActiveTab.current) {
        bc.postMessage({ type: "pong" });
      } else if (e.data.type === "pong") {
        setIsDuplicate(true);
      }
    };

    bc.postMessage({ type: "ping" });

    const timer = setTimeout(() => { isActiveTab.current = true; }, 400);

    return () => {
      clearTimeout(timer);
      bc.close();
      bcRef.current = null;
    };
  }, [sessionId]);

  // Check session on mount.
  useEffect(() => {
    if (!sessionId) { setSessionOk(false); return; }
    fetch(`/api/remote/info/${sessionId}`)
      .then((r) => r.json().catch(() => null))
      .then((d: { ok?: boolean; pcConnected?: boolean } | null) => {
        if (!d) return;
        setSessionOk(!!d.ok);
        if (d.pcConnected) { failCount.current = 0; setPcConnected(true); }
      })
      .catch(() => { /* stay in loading state */ });
  }, [sessionId]);

  // Check if the phone user is logged in and owns this session
  useEffect(() => {
    if (sessionOk !== true || !sessionId) return;
    fetch(`/api/remote/info/${sessionId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok?: boolean; loggedIn?: boolean; authorized?: boolean }) => {
        if (d.authorized) setAuthStatus("authorized");
        else if (d.loggedIn) setAuthStatus("wrong-account");
        else setAuthStatus("needs-login");
      })
      .catch(() => setAuthStatus("needs-login"));
  }, [sessionOk, sessionId]);

  // Poll every 3s — require 6 consecutive failures (~18s) before marking disconnected.
  useEffect(() => {
    if (!sessionId || sessionOk === false) return;
    const poll = () => {
      fetch(`/api/remote/info/${sessionId}`)
        .then((r) => r.json().catch(() => null))
        .then((d: { ok?: boolean; pcConnected?: boolean; watchState?: WatchState } | null) => {
          if (!d) { failCount.current += 1; if (failCount.current >= 6) setPcConnected(false); return; }
          if (!d.ok) { setSessionOk(false); return; }
          if (sessionOkRef.current !== true) setSessionOk(true);
          if (d.pcConnected) { failCount.current = 0; setPcConnected(true); }
          else { failCount.current += 1; if (failCount.current >= 6) setPcConnected(false); }
          setWatchState(d.watchState ?? null);
        })
        .catch(() => { failCount.current += 1; if (failCount.current >= 6) setPcConnected(false); });
    };
    poll();
    const iv = setInterval(poll, 3_000);
    const onVisible = () => { if (document.visibilityState === "visible") { failCount.current = 0; poll(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVisible); };
  }, [sessionId, sessionOk]);

  // Poll Jellyfin playback state every 5s
  useEffect(() => {
    if (!sessionId || authStatus !== "authorized") return;
    const poll = () => {
      fetch(`/api/remote/jellyfin-status/${sessionId}`)
        .then((r) => r.json())
        .then((d: JellyfinStatus) => {
          setJellyfinStatus(d);
          if (d.playing && Date.now() - lastCommandRef.current > 3000) {
            setIsPlaying(!d.isPaused);
          }
          if (!d.playing) setIsPlaying(null);
        })
        .catch(() => { /* Jellyfin may not be configured */ });
    };
    poll();
    const iv = setInterval(poll, 5_000);
    return () => clearInterval(iv);
  }, [authStatus, sessionId]);

  // Auto-join the always-on intercom room once authorized
  useEffect(() => {
    if (authStatus !== "authorized" || intercomJoinedRef.current || intercom.joined) return;
    intercomJoinedRef.current = true;
    const nick =
      (typeof localStorage !== "undefined" ? localStorage.getItem("ptt-nickname") : null) ??
      ([user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "Me");
    void intercom.joinRoom(INTERCOM_ROOM, nick);
  }, [authStatus, intercom, user]);

  // Auto-scroll chat when new intercom messages arrive
  useEffect(() => {
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [intercom.messages.length]);

  const sendLoginLink = async () => {
    if (!loginEmail.trim()) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), redirect: window.location.href }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) setAuthStatus("magic-sent");
      else setLoginError(data.error ?? "Could not send link — try again");
    } catch {
      setLoginError("Network error — try again");
    }
    setLoginLoading(false);
  };

  const sendWatchControl = useCallback(async (action: string) => {
    const command = action === "play_pause" ? "PlayPause"
                  : action === "fast_forward" ? "FastForward"
                  : "Rewind";
    if (action === "play_pause") {
      lastCommandRef.current = Date.now();
      setIsPlaying((p) => !(p ?? true));
    }
    const positionTicks = jellyfinStatus.playing ? jellyfinStatus.positionTicks : 0;
    try {
      const res = await fetch(`/api/remote/jellyfin-command/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, positionTicks }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
        setFeedback(err.error ?? `Command failed (${res.status})`);
        setTimeout(() => setFeedback(""), 3000);
        if (action === "play_pause") setIsPlaying((p) => !p);
      }
    } catch {
      setFeedback("Could not reach server");
      setTimeout(() => setFeedback(""), 3000);
    }
  }, [jellyfinStatus, sessionId]);

  const sendChatMsg = useCallback(() => {
    const text = chatDraft.trim();
    if (!text || !intercom.joined) return;
    intercom.sendChat(text);
    setChatDraft("");
  }, [chatDraft, intercom]);

  // ── Duplicate tab ───────────────────────────────────────────────────────────
  if (isDuplicate) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-6 gap-5 text-center">
        <Smartphone className="w-12 h-12 text-amber-400" />
        <div>
          <p className="text-white text-lg font-semibold">Remote already open</p>
          <p className="text-gray-400 text-sm mt-1">
            {showCloseButton
              ? "Your browser blocked auto-close. Switch to the existing tab or close this one manually."
              : "Closing this tab…"}
          </p>
        </div>
        {showCloseButton && (
          <button
            onClick={() => window.close()}
            className="w-full max-w-xs py-3 rounded-xl bg-[#1f2937] border border-[#374151] text-gray-300 text-sm font-semibold active:scale-95 transition-all"
          >
            Close this tab
          </button>
        )}
      </div>
    );
  }

  // ── Invalid session ──────────────────────────────────────────────────────────
  if (sessionOk === false) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-6 gap-4">
        <WifiOff className="w-12 h-12 text-red-400" />
        <p className="text-white text-lg font-semibold text-center">Session not found</p>
        <p className="text-gray-400 text-sm text-center">
          The QR code may have expired. Go back to your PC and click <strong>Connect Remote</strong> again.
        </p>
      </div>
    );
  }

  if (sessionOk === null || (sessionOk === true && authStatus === "checking")) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00d4aa] border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Not logged in — show magic link login ────────────────────────────────────
  if (authStatus === "needs-login" || authStatus === "magic-sent") {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-6 gap-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#00d4aa]/15 flex items-center justify-center">
          <Lock className="w-7 h-7 text-[#00d4aa]" />
        </div>
        {authStatus === "magic-sent" ? (
          <>
            <div>
              <p className="text-white text-lg font-bold">Check your email</p>
              <p className="text-gray-400 text-sm mt-1 max-w-xs">
                We sent a sign-in link to <span className="text-white font-medium">{loginEmail}</span>.
                Tap it to verify and return here automatically.
              </p>
            </div>
            <button
              onClick={() => { setAuthStatus("needs-login"); setLoginError(""); }}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <div>
              <p className="text-white text-lg font-bold">Verify it's you</p>
              <p className="text-gray-400 text-sm mt-1 max-w-xs">
                Sign in with your URLinc email to use this remote. You'll only need to do this once.
              </p>
            </div>
            <div className="w-full max-w-xs space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void sendLoginLink()}
                  placeholder="your@email.com"
                  className="w-full bg-[#1f2937] border border-[#374151] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00d4aa]"
                />
              </div>
              {loginError && <p className="text-red-400 text-xs">{loginError}</p>}
              <button
                onClick={() => void sendLoginLink()}
                disabled={loginLoading || !loginEmail.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00d4aa] text-black text-sm font-bold disabled:opacity-40 active:scale-95 transition-all"
              >
                {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {loginLoading ? "Sending…" : "Send sign-in link"}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Logged in but wrong account ──────────────────────────────────────────────
  if (authStatus === "wrong-account") {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-6 gap-5 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
          <Lock className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="text-white text-lg font-bold">Wrong account</p>
          <p className="text-gray-400 text-sm mt-1 max-w-xs">
            You're signed into URLinc, but this remote belongs to a different account.
          </p>
        </div>
        <a
          href="/auth/logout"
          className="px-5 py-2.5 rounded-xl bg-[#1f2937] border border-[#374151] text-gray-300 text-sm font-semibold"
        >
          Sign out and use a different account
        </a>
      </div>
    );
  }

  const isWatching = watchState !== null || jellyfinStatus.playing;
  const nowPlayingTitle = watchState?.title ?? (jellyfinStatus.playing ? jellyfinStatus.title : "");
  const nowPlayingLabel = watchState
    ? `${watchState.source === "jellyfin" ? "Jellyfin" : "Plex"} · Watch Together`
    : "Jellyfin · Now Playing";

  // ── MAIN REMOTE VIEW ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col select-none pb-8">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4 border-b border-[#1f2937]">
        <div>
          <p className="text-[#00d4aa] text-[10px] font-bold uppercase tracking-widest">URLinc Remote</p>
          <p className="text-white text-base font-bold mt-0.5 leading-none">Media · Intercom · Chat</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
          pcConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-700/50 text-gray-400"
        }`}>
          {pcConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {pcConnected ? "PC connected" : "Waiting for PC…"}
        </div>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-[#00d4aa] text-black text-sm font-bold shadow-xl whitespace-nowrap pointer-events-none">
          {feedback}
        </div>
      )}

      <div className="flex flex-col flex-1 px-4 pt-4 gap-5 min-h-0">

        {/* Now playing bar — only when something detected */}
        {isWatching && (
          <div className="bg-[#1f2937] rounded-2xl border border-[#374151] px-4 py-3">
            <p className="text-[#00d4aa] text-[10px] font-bold uppercase tracking-widest">{nowPlayingLabel}</p>
            <p className="text-white text-sm font-semibold truncate mt-0.5">{nowPlayingTitle}</p>
          </div>
        )}

        {/* ── Media Controls ── */}
        <div>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-3">Media Controls</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => void sendWatchControl("rewind")}
              style={{ background: "#d97706" }}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl py-6 active:scale-90 transition-transform shadow-lg"
            >
              <SkipBack className="w-9 h-9 text-black" />
              <span className="text-black text-xs font-black uppercase tracking-wide">Rewind</span>
            </button>
            <button
              onClick={() => void sendWatchControl("play_pause")}
              style={{ background: "#16a34a" }}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl py-6 active:scale-90 transition-transform shadow-lg"
            >
              {isPlaying === true
                ? <Pause className="w-9 h-9 text-black" />
                : <Play className="w-9 h-9 text-black" />
              }
              <span className="text-black text-xs font-black uppercase tracking-wide">
                {isPlaying === true ? "Pause" : "Play"}
              </span>
            </button>
            <button
              onClick={() => void sendWatchControl("fast_forward")}
              style={{ background: "#2563eb" }}
              className="flex flex-col items-center justify-center gap-2 rounded-2xl py-6 active:scale-90 transition-transform shadow-lg"
            >
              <SkipForward className="w-9 h-9 text-white" />
              <span className="text-white text-xs font-black uppercase tracking-wide">Forward</span>
            </button>
          </div>
        </div>

        {/* ── Intercom — always-on family room ── */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
              Intercom · {intercom.roomCode ?? (intercom.micState === "denied" ? "Mic denied" : "Joining…")}
            </p>
            {intercom.joined && (
              <div className="flex items-center gap-1 text-gray-500 text-xs">
                <Users className="w-3 h-3" />
                <span>{intercom.peers.length + 1} here</span>
              </div>
            )}
          </div>

          {/* PTT button */}
          <button
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              if (!intercom.joined) return;
              if (intercom.micState !== "ok") {
                void intercom.requestMic().then(() => ptt.engage());
              } else {
                ptt.engage();
              }
            }}
            onPointerUp={ptt.release}
            onPointerLeave={ptt.release}
            onPointerCancel={ptt.release}
            style={{ background: intercom.transmitting ? "#7c3aed" : intercom.joined ? "#166534" : "#1f2937" }}
            className="w-full py-7 rounded-2xl flex flex-col items-center gap-2 active:scale-95 transition-all shadow-lg mb-3 touch-none"
            aria-label="Hold to talk"
          >
            {intercom.transmitting
              ? <MicOff className="w-8 h-8 text-white" />
              : <Mic className={`w-8 h-8 ${intercom.joined ? "text-green-300" : "text-gray-500"}`} />
            }
            <span className={`text-sm font-black uppercase tracking-wide ${intercom.joined ? "text-white" : "text-gray-500"}`}>
              {intercom.transmitting ? "Transmitting…" : intercom.joined ? "Hold to Talk" : "Connecting…"}
            </span>
            {intercom.transmitting && intercom.level > 0 && (
              <div className="w-32 h-1.5 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-75"
                  style={{ width: `${Math.round(intercom.level * 100)}%` }}
                />
              </div>
            )}
          </button>

          {/* Who's speaking */}
          {intercom.peers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {intercom.peers.map((p) => (
                <span
                  key={p.id}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    p.speaking
                      ? "bg-green-500/25 text-green-300 border border-green-500/30"
                      : "bg-[#1f2937] text-gray-400"
                  }`}
                >
                  {p.speaking ? "🔊 " : ""}{p.nickname}
                </span>
              ))}
            </div>
          )}

          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto bg-[#111827] rounded-2xl border border-[#1f2937] px-4 py-3 mb-3 min-h-[100px] space-y-3">
            {intercom.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-20 text-center">
                <MessageSquare className="w-6 h-6 text-gray-700 mb-2" />
                <p className="text-gray-600 text-xs">
                  {intercom.joined ? "No messages yet — say something!" : "Joining Family Room…"}
                </p>
              </div>
            ) : (
              intercom.messages.slice(-30).map((m) => (
                <div key={m.id} className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-[#86efac]">{m.nickname}</span>
                  <div className="bg-[#1f2937] rounded-2xl rounded-tl-sm px-3 py-2 max-w-[85%]">
                    <p className="text-sm text-gray-200 leading-relaxed">{m.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChatMsg()}
              placeholder={intercom.joined ? "Say something…" : "Connecting…"}
              disabled={!intercom.joined}
              className="flex-1 bg-[#111827] border border-[#374151] rounded-xl px-3 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#00d4aa] disabled:opacity-40"
            />
            <button
              onClick={sendChatMsg}
              disabled={!chatDraft.trim() || !intercom.joined}
              className="p-3 rounded-xl bg-[#00d4aa] text-black disabled:opacity-40 active:scale-95 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
