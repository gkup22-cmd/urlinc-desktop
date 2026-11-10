import { useEffect, useRef, useState, useCallback } from "react";
import type { ChatMessage } from "@/components/watch-session";

const DICTATION_LANGS = [
  { code: "en-US", label: "English (US)" }, { code: "en-GB", label: "English (UK)" },
  { code: "es-ES", label: "Spanish" },      { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },       { code: "pt-BR", label: "Portuguese" },
  { code: "it-IT", label: "Italian" },      { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },       { code: "zh-CN", label: "Chinese" },
  { code: "ar-SA", label: "Arabic" },       { code: "hi-IN", label: "Hindi" },
];

// ── Persist settings to localStorage ─────────────────────────────────────────
function loadSettings() {
  try {
    const s = localStorage.getItem("urlinc_watch_settings");
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}
function saveSettings(patch: Record<string, unknown>) {
  try {
    const current = loadSettings();
    localStorage.setItem("urlinc_watch_settings", JSON.stringify({ ...current, ...patch }));
  } catch { /* ignore */ }
}

export default function WatchPage() {
  const params    = new URLSearchParams(window.location.search);
  const sessionId = params.get("session") ?? "";
  const title     = params.get("title")   ?? "Private Stream";
  const isHost    = params.get("host") === "You";

  // Load saved settings
  const saved = loadSettings();

  const wrapperRef = useRef<HTMLDivElement>(null);  // fullscreen target
  const videoRef   = useRef<HTMLVideoElement>(null);
  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatWsRef  = useRef<WebSocket | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const msgsEndRef = useRef<HTMLDivElement>(null);

  type ConnState = "connecting" | "live" | "error";
  const [connState,    setConnState]    = useState<ConnState>("connecting");
  const [errMsg,       setErrMsg]       = useState("The host may be offline or your invitation may have expired.");
  const [paused,       setPaused]       = useState(false);
  const [muted,        setMuted]        = useState(false);
  const [volume,       setVolume]       = useState(1);
  const [elapsed,      setElapsed]      = useState(0);
  const [showCtrl,     setShowCtrl]     = useState(true);
  const [messages,     setMessages]     = useState<ChatMessage[]>([]);
  const [myUserId,     setMyUserId]     = useState("");
  const [draft,        setDraft]        = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [chatVisible,  setChatVisible]  = useState(true);
  const [unread,       setUnread]       = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const [streamPos,    setStreamPos]    = useState(0);
  const [streamDur,    setStreamDur]    = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [movieStarted, setMovieStarted] = useState(false);
  const [pausedBy,     setPausedBy]     = useState<string | null>(null);
  const pausedByTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Settings (with localStorage persistence) ──────────────────────────────
  const [bgOpacity,  setBgOpacityRaw]  = useState<number>(saved.bgOpacity  ?? 0.5);
  const [chatLines,  setChatLinesRaw]  = useState<number>(saved.chatLines  ?? 6);
  const [captionFade,setCaptionFadeRaw]= useState<number>(saved.captionFade ?? 0);
  const [dictLang,   setDictLangRaw]   = useState<string>(saved.dictLang   ?? "en-US");
  const [captionVisible, setCaptionVisible] = useState(true);
  const [translateOn,  setTranslateOn]   = useState(false);
  const [translations, setTranslations]  = useState<Record<string, string>>({});
  const [showLangBadge, setShowLangBadge] = useState<boolean>(saved.showLangBadge ?? true);
  const setShowLangBadgeAndSave = (v: boolean) => { setShowLangBadge(v); saveSettings({ showLangBadge: v }); };

  const setBgOpacity   = (v: number) => { setBgOpacityRaw(v);   saveSettings({ bgOpacity: v }); };
  const setChatLines   = (v: number) => { setChatLinesRaw(v);   saveSettings({ chatLines: v }); };
  const setCaptionFade = (v: number) => { setCaptionFadeRaw(v); saveSettings({ captionFade: v }); };
  const setDictLang    = (v: string) => { setDictLangRaw(v);    saveSettings({ dictLang: v }); };

  // ── Caption fade ──────────────────────────────────────────────────────────
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (captionFade === 0) { setCaptionVisible(false); return; }       // Off -> Hidden
    if (captionFade === 30) { setCaptionVisible(true); return; }       // Always on -> Always visible
    setCaptionVisible(true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => setCaptionVisible(false), captionFade * 1000);
    return () => { if (fadeTimer.current) clearTimeout(fadeTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, captionFade]);

  // ── Fullscreen detection ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Auto-hide controls ────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowCtrl(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!paused && !inputFocused && !showSettings) setShowCtrl(false);
    }, 3000);
  }, [paused, inputFocused, showSettings]);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [resetHideTimer]);

  useEffect(() => {
    if (paused || inputFocused || showSettings) {
      setShowCtrl(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      resetHideTimer();
    }
  }, [paused, inputFocused, showSettings, resetHideTimer]);

  // ── Chat WebSocket ────────────────────────────────────────────────────────
  const connectChat = useCallback(() => {
    if (!sessionId) return;
    if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.OPEN) return;
    if (chatWsRef.current && chatWsRef.current.readyState === WebSocket.CONNECTING) return;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/p2p/chat/${sessionId}`);
    chatWsRef.current = ws;
    ws.onopen = () => { setReconnecting(false); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>;
        if (msg.type === "chat") {
          setMessages((prev) => [...prev, {
            fromUserId: msg.fromUserId as string,
            fromName:   msg.fromName as string,
            text:       msg.text as string,
            timestamp:  msg.timestamp as number,
          }]);
          setUnread((u) => u + 1);
        }
        if (msg.type === "participant_joined") {
          setMessages((prev) => [...prev, { fromUserId: "system", fromName: "URLinc", text: `👋 ${msg.name as string} joined the stream`, timestamp: Date.now() }]);
        }
        if (msg.type === "participant_left") {
          setMessages((prev) => [...prev, { fromUserId: "system", fromName: "URLinc", text: `${msg.name as string} left the stream`, timestamp: Date.now() }]);
        }
        if (msg.type === "play") {
          setMovieStarted(true);
          const v = videoRef.current;
          if (v) void v.play();
          const from = msg.fromName as string;
          setPausedBy(null);
          if (from && from !== "Host") {
            setPausedBy(`▶ ${from} resumed`);
            if (pausedByTimer.current) clearTimeout(pausedByTimer.current);
            pausedByTimer.current = setTimeout(() => setPausedBy(null), 3000);
          }
        }
        if (msg.type === "pause") {
          const v = videoRef.current;
          if (v) v.pause();
          const from = msg.fromName as string;
          setPausedBy(`⏸ ${from} paused`);
          if (pausedByTimer.current) clearTimeout(pausedByTimer.current);
        }
        if (msg.type === "seek") {
          const v = videoRef.current;
          if (v && msg.position !== undefined) v.currentTime = msg.position as number;
        }
        if (msg.type === "position") {
          setStreamPos(msg.pos as number);
          if (msg.duration) setStreamDur(msg.duration as number);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      setReconnecting(true);
      setTimeout(() => {
        if (chatWsRef.current?.readyState !== WebSocket.OPEN &&
            chatWsRef.current?.readyState !== WebSocket.CONNECTING) {
          connectChat();
        }
      }, 5000);
    };
    ws.onerror = () => { ws.close(); };
  }, [sessionId]);

  // ── WebRTC ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { setConnState("error"); setErrMsg("No session ID provided."); return; }
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
      ]
    });
    let gotTrack = false;
    const retryAfterFailure = (message: string) => {
      setConnState("error");
      setErrMsg(message);
      // Auto-retry after 5 seconds
      setTimeout(() => {
        if (videoRef.current) {
          setConnState("connecting");
          setErrMsg("The host may be offline or your invitation may have expired.");
          window.location.reload();
        }
      }, 5000);
    };
    // The WebRTC handshake can silently stall (NAT traversal / TURN relay
    // issues) with no connectionstatechange event ever firing -- previously
    // this left viewers stuck on the "Connecting..." spinner indefinitely,
    // with no way out short of the host resetting the whole session.
    const connectTimeout = setTimeout(() => {
      if (!gotTrack) retryAfterFailure("Connection is taking too long — retrying automatically…");
    }, 20000);
    pc.ontrack = (event) => {
      const v = videoRef.current;
      if (v && event.streams?.[0]) {
        gotTrack = true;
        clearTimeout(connectTimeout);
        v.srcObject = event.streams[0];
        setConnState("live");
        connectChat();
        setMessages([{ fromUserId: "system", fromName: "URLinc", text: `🎬 Welcome to "${title}" — enjoy the stream!`, timestamp: Date.now() }]);
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        retryAfterFailure("Connection lost — retrying automatically…");
      }
    };
    const connect = async () => {
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        const resp = await fetch(`/api/p2p/offer/${sessionId}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ sdp: pc.localDescription!.sdp, type: pc.localDescription!.type, username: "viewer", peer_id: crypto.randomUUID() }),
        });
        if (!resp.ok) {
          setErrMsg(resp.status === 403 ? "You are not invited to this stream." : resp.status === 503 ? "The host is not connected yet. Try again in a moment." : `Connection error (${resp.status}).`);
          setConnState("error"); return;
        }
        const answer = await resp.json() as RTCSessionDescriptionInit;
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        fetch("/api/auth/me", { credentials: "include" }).then((r) => r.json()).then((d: { id?: string }) => { if (d.id) setMyUserId(d.id); }).catch(() => {});
      } catch (err) { setErrMsg((err as Error).message || "Could not connect."); setConnState("error"); }
    };
    void connect();
    return () => { clearTimeout(connectTimeout); pc.close(); chatWsRef.current?.close(); };
  }, [sessionId, connectChat, title]);

  // ── Elapsed ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setElapsed(Math.floor(v.currentTime));
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, []);

  // ── Auto-scroll + unread ──────────────────────────────────────────────────
  useEffect(() => { if (chatVisible) msgsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatVisible]);
  useEffect(() => { if (chatVisible) setUnread(0); }, [chatVisible]);

  const fmt = (s: number) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return h ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
  };

  const translateMessage = async (key: string, text: string) => {
    if (translations[key]) return;
    try {
      const targetLang = dictLang.split("-")[0];
      const res = await fetch("/api/translate", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, targetLang }),
      });
      if (res.ok) {
        const d = await res.json() as { translatedText: string };
        setTranslations((prev) => ({ ...prev, [key]: d.translatedText }));
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!translateOn) return;
    messages.forEach((msg) => {
      if (msg.fromUserId === "system") return;
      const key = `${msg.fromUserId}-${msg.timestamp}`;
      if (!translations[key]) void translateMessage(key, msg.text);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translateOn, messages]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    const ws = chatWsRef.current;
    if (v.paused) {
      void v.play();
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "play" }));
    } else {
      v.pause();
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pause" }));
    }
  };

  // Fullscreen on wrapper div so overlays stay visible
  const toggleFS = () => {
    if (!document.fullscreenElement) void wrapperRef.current?.requestFullscreen();
    else void document.exitFullscreen();
  };

  const togglePiP = async () => {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (videoRef.current && videoRef.current.readyState >= 2) await videoRef.current.requestPictureInPicture();
  };

  const sendPlay = () => {
    const ws = chatWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "play" }));
    }
    setMovieStarted(true);
    const v = videoRef.current;
    if (v) void v.play();
  };

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    const ws = chatWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "chat", text }));
    setDraft("");
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "f" || e.key === "F") toggleFS();
      if (e.key === "m" || e.key === "M") { if (videoRef.current) videoRef.current.muted = !muted; }
      if (e.key === "p" || e.key === "P") void togglePiP();
      if (e.key === "ArrowUp")   { const v = videoRef.current; if (v) { v.volume = Math.min(1, v.volume+0.1); setVolume(v.volume); } }
      if (e.key === "ArrowDown") { const v = videoRef.current; if (v) { v.volume = Math.max(0, v.volume-0.1); setVolume(v.volume); } }
      if (e.key === "Escape") setShowSettings(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [muted]);

  const isMine   = (msg: ChatMessage) => msg.fromUserId === myUserId;
  const isSystem = (msg: ChatMessage) => msg.fromUserId === "system";
  const isLive   = connState === "live" && !reconnecting;
  const chatH    = chatLines * 28;

  return (
    <div
      ref={wrapperRef}
      style={{ position: "fixed", inset: 0, background: "#000", cursor: showCtrl ? "default" : "none", fontFamily: "'Segoe UI', sans-serif" }}
      onMouseMove={resetHideTimer}
      onClick={(e) => {
        resetHideTimer();
        if (showSettings && !(e.target as HTMLElement).closest("[data-settings]")) setShowSettings(false);
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        :fullscreen { background: #000; }
        ::backdrop { background: #000; }
      `}</style>

      {/* Connecting */}
      {connState === "connecting" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, color: "#e0e0e0" }}>
          <div style={{ width: 48, height: 48, border: "4px solid #2a2a4a", borderTopColor: "#c9a84c", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#888", fontSize: ".9rem" }}>Connecting to host…</p>
        </div>
      )}

      {/* Error */}
      {connState === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#e0e0e0" }}>
          <p style={{ color: "#f87171", fontSize: "1rem", fontWeight: "bold" }}>Connection lost</p>
          <p style={{ color: "#888", fontSize: ".85rem" }}>{errMsg}</p>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: ".75rem" }}>Retrying in 5 seconds…</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8, background: "#2a2a4a", border: "none", color: "#e0e0e0", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: ".85rem" }}>↩ Retry Now</button>
        </div>
      )}

      {/* Video */}
      <video
        ref={videoRef} playsInline
        style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onVolumeChange={() => { if (videoRef.current) { setMuted(videoRef.current.muted); setVolume(videoRef.current.volume); } }}
      />

      {/* Lobby — waiting for host to start */}
      {connState === "live" && !movieStarted && (
        <div
          onClick={() => {
            const v = videoRef.current;
            if (v) v.play().catch(() => {});
            // Viewers shouldn't be stuck waiting on a "play" broadcast that may have
            // been missed (e.g. chat socket wasn't open yet when the host started it).
            if (!isHost) setMovieStarted(true);
          }}
          style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 16,
            background: "rgba(0,0,0,0.85)",
            zIndex: 25, cursor: "pointer",
          }}
        >
          <div style={{ width: 48, height: 48, border: "4px solid #2a2a4a", borderTopColor: "#c9a84c", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <p style={{ color: "#c9a84c", fontSize: "1.1rem", fontWeight: "bold" }}>{title}</p>
          {isHost ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); sendPlay(); }}
                style={{
                  background: "#27ae60", border: "none", color: "#fff",
                  borderRadius: 8, padding: "12px 32px",
                  fontSize: "1rem", fontWeight: "bold", cursor: "pointer",
                  marginTop: 8,
                }}
              >
                ▶▶ Start Movie
              </button>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: ".75rem" }}>Viewers are waiting in the lobby</p>
            </>
          ) : (
            <>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: ".9rem" }}>Waiting for host to start the movie…</p>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: ".75rem", marginTop: 4 }}>Tap anywhere to enable audio</p>
            </>
          )}
        </div>
      )}

      {/* Paused-by overlay */}
      {pausedBy && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(0,0,0,0.7)", color: "#fff",
          padding: "12px 24px", borderRadius: 8,
          fontSize: "1rem", fontWeight: "bold",
          zIndex: 25, pointerEvents: "none",
          backdropFilter: "blur(4px)",
        }}>
          {pausedBy}
        </div>
      )}

      {/* Title */}
      {connState === "live" && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "16px 24px", background: "linear-gradient(rgba(0,0,0,0.6), transparent)", color: "#e0e0e0", fontSize: ".9rem", opacity: showCtrl ? 1 : 0, transition: "opacity 0.3s ease", pointerEvents: "none" }}>
          {title}
        </div>
      )}

      {/* Chat messages */}
      {connState === "live" && chatVisible && captionVisible && (
        <div style={{
          position: "absolute", bottom: 58, left: 0, right: 0,
          maxHeight: `${chatH}px`, overflowY: "auto", overflowX: "hidden",
          padding: "8px 20px 8px",
          background: `rgba(0,0,0,${bgOpacity})`,
          scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent",
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 6, fontSize: ".87rem", lineHeight: 1.5 }}>
              {isSystem(msg) ? (
                <span style={{ color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>{msg.text}</span>
              ) : (
                <>
                  <span style={{ fontWeight: 600, marginRight: 6, color: isMine(msg) ? "#facc15" : "#86efac" }}>
                    {isMine(msg) ? "You" : msg.fromName}:
                  </span>
                  <span style={{ color: "#fff" }}>
                    {translateOn ? (translations[`${msg.fromUserId}-${msg.timestamp}`] ?? msg.text) : msg.text}
                  </span>
                </>
              )}
            </div>
          ))}
          <div ref={msgsEndRef} />
        </div>
      )}

      {/* Settings popup */}
      {connState === "live" && showSettings && (
        <div
          data-settings
          style={{
            position: "absolute", bottom: 60, left: "50%", transform: "translateX(-50%)",
            background: "rgba(10,10,25,0.97)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10, padding: "16px 20px", minWidth: 260, zIndex: 40,
            backdropFilter: "blur(12px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ color: "#c9a84c", fontSize: ".75rem", fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", margin: 0 }}>Chat Settings</p>
            <button onClick={() => setShowSettings(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0 }}>✕</button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={labelStyle}>Background opacity</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={dimStyle}>Low</span>
              <input type="range" min={0} max={0.95} step={0.05} value={bgOpacity} onChange={(e) => setBgOpacity(parseFloat(e.target.value))} style={{ flex: 1, accentColor: "#c9a84c" }} />
              <span style={dimStyle}>High</span>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={labelStyle}>Chat size</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={dimStyle}>S</span>
              <input type="range" min={2} max={14} step={1} value={chatLines} onChange={(e) => setChatLines(parseInt(e.target.value))} style={{ flex: 1, accentColor: "#c9a84c" }} />
              <span style={dimStyle}>L</span>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={labelStyle}>Caption fade</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={dimStyle}>Off</span>
              <input type="range" min={0} max={30} step={1} value={captionFade} onChange={(e) => setCaptionFade(parseInt(e.target.value))} style={{ flex: 1, accentColor: "#c9a84c" }} />
              <span style={dimStyle}>Always on</span>
            </div>
            <p style={{ ...dimStyle, textAlign: "center", marginTop: 2 }}>{captionFade === 0 ? "Hidden" : captionFade === 30 ? "Always visible" : `Fades after ${captionFade}s`}</p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={labelStyle}>Dictation language</p>
            <select value={dictLang} onChange={(e) => setDictLang(e.target.value)} style={{ width: "100%", background: "#111", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, padding: "4px 8px", fontSize: ".78rem" }}>
              {DICTATION_LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ ...labelStyle, margin: 0 }}>Language badge</p>
            <button
              type="button"
              onClick={() => setShowLangBadgeAndSave(!showLangBadge)}
              style={{ position: "relative", display: "inline-flex", height: 18, width: 30, borderRadius: 9, border: "none", cursor: "pointer", background: showLangBadge ? "#c9a84c" : "rgba(255,255,255,0.2)", transition: "background 0.2s" }}
            >
              <span style={{ position: "absolute", top: 2, left: showLangBadge ? 14 : 2, width: 14, height: 14, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
            </button>
          </div>
        </div>
      )}

      {/* Progress bar — thin bar just above controls; draggable for the host */}
      {connState === "live" && chatVisible && captionVisible && movieStarted && streamDur > 0 && (
        <div
          onClick={isHost ? (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
            const newPos = pct * streamDur;
            setStreamPos(newPos);
            const ws = chatWsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "seek", position: newPos }));
          } : undefined}
          style={{
            position: "absolute", bottom: 52, left: 0, right: 0,
            height: isHost ? 10 : 4, background: "rgba(255,255,255,0.1)",
            zIndex: 29, pointerEvents: isHost ? "auto" : "none",
            cursor: isHost ? "pointer" : "default",
          }}
        >
          <div style={{
            height: "100%",
            width: `${Math.min((streamPos / streamDur) * 100, 100)}%`,
            background: GOLD_COLOR,
            transition: "width 1s linear",
          }} />
        </div>
      )}

      {/* Unified bottom bar */}
      {connState === "live" && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 52,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", gap: 8, padding: "0 12px",
          opacity: showCtrl ? 1 : 0, transition: "opacity 0.3s ease",
          pointerEvents: showCtrl ? "auto" : "none", zIndex: 30,
        }}>
          {!inputFocused && <button onClick={togglePlay} style={btnStyle} title={paused ? "Play" : "Pause"}>{paused ? "▶" : "⏸"}</button>}
          {!inputFocused && <span style={{ color: "#c9a84c", fontSize: ".8rem", whiteSpace: "nowrap", minWidth: 44, fontVariantNumeric: "tabular-nums" }}>{fmt(elapsed)}</span>}

          {/* LIVE button — opens settings when live */}
          {!inputFocused && (
            <button
              data-settings
              onClick={() => { if (isLive) setShowSettings((s) => !s); }}
              style={{
                background: isLive ? "rgba(39,174,96,0.25)" : "rgba(192,57,43,0.25)",
                border: `1px solid ${isLive ? "#27ae60" : "#c0392b"}`,
                color: isLive ? "#2ecc71" : "#e74c3c",
                fontSize: ".65rem", fontWeight: "bold",
                padding: "2px 8px", borderRadius: 4, letterSpacing: 1,
                whiteSpace: "nowrap", cursor: isLive ? "pointer" : "default",
                transition: "all 0.3s ease",
              }}
              title={isLive ? "Chat settings" : reconnecting ? "Reconnecting…" : "Disconnected"}
            >
              ● {isLive ? "LIVE" : reconnecting ? "RECONNECTING" : "OFFLINE"}
            </button>
          )}

          {/* Chat toggle */}
          {!inputFocused && (
            <button onMouseDown={(e) => { e.preventDefault(); setChatVisible((v) => !v); }} style={{ ...btnStyle, position: "relative" }} title={chatVisible ? "Hide chat" : "Show chat"}>
              💬
              {!chatVisible && unread > 0 && (
                <span style={{ background: "#c9a84c", color: "#000", fontSize: ".6rem", fontWeight: "bold", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", position: "absolute", top: -4, right: -4 }}>{unread}</span>
              )}
            </button>
          )}

          {/* Expanding input */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              onFocus={() => { setInputFocused(true); setShowCtrl(true); setShowSettings(false); }}
              onBlur={() => { setInputFocused(false); resetHideTimer(); }}
              placeholder={reconnecting ? "Reconnecting…" : "Type a message…"}
              maxLength={500}
              style={{ flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, padding: "6px 14px", color: "#fff", fontSize: ".85rem", outline: "none" }}
            />
            {draft.trim() && (
              <button onMouseDown={(e) => { e.preventDefault(); sendChat(); }} style={{ ...btnStyle, background: "#c9a84c", color: "#000" }} title="Send">➤</button>
            )}
          </div>

          {!inputFocused && (
            <>
              {showLangBadge && (
                <button
                  onClick={() => setTranslateOn((t) => !t)}
                  style={{
                    background: translateOn ? "#c9a84c" : "rgba(255,255,255,0.15)",
                    border: "none", color: translateOn ? "#000" : "#fff",
                    borderRadius: 4, padding: "2px 7px",
                    fontSize: ".7rem", fontWeight: "bold", cursor: "pointer",
                    letterSpacing: 0.5, flexShrink: 0,
                  }}
                  title={translateOn ? "Show original language" : `Translate to ${DICTATION_LANGS.find(l => l.code === dictLang)?.label ?? dictLang}`}
                >
                  {dictLang.split("-")[0].toUpperCase()}
                </button>
              )}
              <button onClick={() => void togglePiP()} style={btnStyle} title="Picture in Picture">⧉</button>
              <button onClick={toggleFS} style={btnStyle} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                {isFullscreen ? "⊡" : "⛶"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const GOLD_COLOR = "#c9a84c";

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
  borderRadius: 6, width: 32, height: 32, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", fontSize: ".9rem",
};
const labelStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.5)", fontSize: ".7rem",
  textTransform: "uppercase", letterSpacing: 1, marginBottom: 4,
};
const dimStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.3)", fontSize: ".7rem",
};
