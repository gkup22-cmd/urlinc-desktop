/**
 * useGroupIntercom — full-featured push-to-talk group intercom.
 * Faithful port of Emergent's useIntercom.ts for URLinc.
 *
 * Key differences from Emergent:
 *  - WS URL: /api/ptt/ws/:room/:clientId  (not /api/ws/...)
 *  - API URL base: /api/ptt/rooms/:room/  (not /api/rooms/...)
 *  - No callsign library — uses useAuth for default name, localStorage for persistence
 *  - iOS Safari: AnalyserNode skipped on Apple mobile (disturbs audio session)
 *  - replaceTrack(null) instead of track.enabled=false (WebKit bug 281758)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Peer {
  id:       string;
  nickname: string;
  speaking: boolean;
}

export interface ChatMessage {
  id:         string;
  room:       string;
  sender_id:  string;
  nickname:   string;
  text:       string;
  private:    boolean;
  created_at: string;
}

export interface VoiceMessage {
  id:          string;
  room:        string;
  sender_id:   string;
  nickname:    string;
  label:       string;
  duration_ms: number;
  mime:        string;
  created_at:  string;
}

export interface Reaction {
  from:     string;
  nickname: string;
  emoji:    string;
  at:       number;
}

export type MicState    = "idle" | "pending" | "ok" | "denied";
export type AudioHealth = "ok" | "blocked" | "checking";

// ── ICE servers ───────────────────────────────────────────────────────────────
// STUN: discovers public IP for NAT traversal
// TURN: relays audio when direct P2P connection fails (symmetric NAT, firewalls, etc.)
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: [
        "turn:global.relay.metered.ca:80",
        "turn:global.relay.metered.ca:80?transport=tcp",
        "turn:global.relay.metered.ca:443?transport=tcp",
        "turns:global.relay.metered.ca:443?transport=tcp",
      ],
      username: "25302b920343735699aeda0a",
      credential: "pKDW3OPL6NxFzxCs",
    },
  ],
  iceCandidatePoolSize: 10,
};

// ── Apple mobile detection (skip AnalyserNode on iPhone/iPad) ────────────────
const IS_APPLE_MOBILE =
  typeof navigator !== "undefined" &&
  /iPhone|iPad|iPod/.test(navigator.userAgent);

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useGroupIntercom() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Refs (do not cause re-renders) ────────────────────────────────────────
  const wsRef            = useRef<WebSocket | null>(null);
  const clientIdRef      = useRef<string>(crypto.randomUUID());
  const localStreamRef   = useRef<MediaStream | null>(null);
  const pcsRef           = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElsRef      = useRef<Map<string, HTMLAudioElement>>(new Map());
  const remoteStreamsRef  = useRef<Map<string, MediaStream>>(new Map());
  const transmitRef      = useRef(false);
  const awayRef          = useRef(false);
  const pingRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const vuRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalLeave = useRef(false);
  const targetsRef       = useRef<string[]>([]);  // private mode target ids
  const roomRef          = useRef<string | null>(null);
  const nicknameRef      = useRef<string>("Guest");
  const duckAmountRef    = useRef(0.3); // 0=off, 0.5=soft, 0.2=strong

  // ── State ─────────────────────────────────────────────────────────────────
  const [joined,         setJoined]         = useState(false);
  const [roomCode,       setRoomCode]       = useState<string | null>(null);
  const [peers,          setPeers]          = useState<Peer[]>([]);
  const [micState,       setMicState]       = useState<MicState>("idle");
  const [transmitting,   setTransmitting]   = useState(false);
  const [audioHealth,    setAudioHealth]    = useState<AudioHealth>("ok");
  const [level,          setLevel]          = useState(0);     // 0–1 VU meter
  const [away,           setAwayState]      = useState(false);
  const [messages,       setMessages]       = useState<ChatMessage[]>([]);
  const [voiceMessages,  setVoiceMessages]  = useState<VoiceMessage[]>([]);
  const [reactions,      setReactions]      = useState<Reaction[]>([]);
  const [privateTargets, setPrivateTargets] = useState<string[]>([]); // ids in current private call
  const [beepsOn,        setBeepsOn]        = useState(true);

  // ── Beep sounds ───────────────────────────────────────────────────────────
  const playTone = useCallback((freq: number, durationMs: number) => {
    if (!beepsOn) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch { /* no AudioContext — skip */ }
  }, [beepsOn]);

  const playJoin  = useCallback(() => playTone(880, 120), [playTone]);
  const playLeave = useCallback(() => playTone(440, 180), [playTone]);
  const playMsg   = useCallback(() => playTone(660, 80),  [playTone]);

  // ── Audio element helpers ─────────────────────────────────────────────────
  function getOrCreateAudioEl(peerId: string): HTMLAudioElement {
    let el = audioElsRef.current.get(peerId);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      document.body.appendChild(el);
      audioElsRef.current.set(peerId, el);
    }
    // Away mode: mute all incoming
    el.muted = awayRef.current;
    return el;
  }

  function removeAudioEl(peerId: string) {
    const el = audioElsRef.current.get(peerId);
    if (el) { el.srcObject = null; el.remove(); audioElsRef.current.delete(peerId); }
    remoteStreamsRef.current.delete(peerId);
  }

  function removeAllAudioEls() {
    for (const id of [...audioElsRef.current.keys()]) removeAudioEl(id);
  }

  // ── Volume ducking: lower others while transmitting ───────────────────────
  function setRemoteVolume(vol: number) {
    for (const el of audioElsRef.current.values()) {
      el.volume = vol;
    }
  }

  // ── Request mic access (call from a user-gesture handler) ────────────────
  const requestMic = useCallback(async () => {
    if (localStreamRef.current) return; // already have it
    setMicState("pending");
    try {
      const raw = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = raw;
      setMicState("ok");
      startVu();

      // Add track to any PCs created before mic was granted — onnegotiationneeded will re-offer
      const track = raw.getAudioTracks()[0];
      if (track) {
        for (const pc of pcsRef.current.values()) {
          if (pc.getSenders().length === 0) {
            pc.addTrack(track, raw);
          }
        }
      }
    } catch {
      setMicState("denied");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Enable audio (tap-to-unblock autoplay) ────────────────────────────────
  const enableAudio = useCallback(async () => {
    let anyFailed = false;
    for (const el of audioElsRef.current.values()) {
      try { await el.play(); } catch { anyFailed = true; }
    }
    // Only report "blocked" if there were elements that actually failed.
    // If the map was empty we can't conclude anything — leave health as-is.
    if (audioElsRef.current.size > 0) {
      setAudioHealth(anyFailed ? "blocked" : "ok");
    }
  }, []);

  // ── Away mode toggle ──────────────────────────────────────────────────────
  const setAway = useCallback((on: boolean) => {
    awayRef.current = on;
    setAwayState(on);
    for (const el of audioElsRef.current.values()) el.muted = on;
  }, []);

  // ── PeerConnection management ─────────────────────────────────────────────
  const getOrCreatePc = useCallback((peerId: string, ws: WebSocket): RTCPeerConnection => {
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId)!;

    const pc = new RTCPeerConnection(ICE);
    pcsRef.current.set(peerId, pc);

    // Add local track — replaced with null when PTT is off
    const track  = localStreamRef.current?.getAudioTracks()[0] ?? null;
    const stream = localStreamRef.current;
    if (stream && track) {
      pc.addTrack(track, stream);
      if (!transmitRef.current) {
        for (const sender of pc.getSenders()) {
          void sender.replaceTrack(null).catch(() => {});
        }
      }
    }

    pc.ontrack = (e) => {
      let ms = remoteStreamsRef.current.get(peerId);
      if (!ms) { ms = new MediaStream(); remoteStreamsRef.current.set(peerId, ms); }
      if (!ms.getTracks().some((t) => t.id === e.track.id)) ms.addTrack(e.track);

      const el = getOrCreateAudioEl(peerId);
      el.srcObject = ms;
      void el.play()
        .then(() => setAudioHealth("ok"))
        .catch(() => {
          setAudioHealth("blocked");
          // Auto-unblock on the very next user gesture anywhere on the page
          const unblock = () => {
            for (const audioEl of audioElsRef.current.values()) {
              void audioEl.play().catch(() => {});
            }
            setAudioHealth("ok");
          };
          document.addEventListener("click",   unblock, { once: true, capture: true });
          document.addEventListener("keydown",  unblock, { once: true, capture: true });
          document.addEventListener("touchend", unblock, { once: true, capture: true });
        });
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        console.log("[intercom] ICE candidate:", e.candidate.type, e.candidate.candidate);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "signal", to: peerId, data: e.candidate.toJSON() }));
        }
      } else {
        console.log("[intercom] ICE gathering complete");
      }
    };

    // Re-negotiate when tracks are added after PC creation (e.g. mic granted late)
    pc.onnegotiationneeded = async () => {
      try {
        if (pc.signalingState !== "stable") return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "signal", to: peerId, data: pc.localDescription?.toJSON() }));
        }
      } catch { /* ignore — likely a race with close() */ }
    };

    pc.onconnectionstatechange = () => {
      console.log("[intercom] connectionState →", pc.connectionState, "peer:", peerId);
      if (pc.connectionState === "connected") {
        toast({ title: "Voice connected", description: "Intercom link established.", duration: 2000 });
      } else if (pc.connectionState === "failed") {
        toast({ title: "Voice connection failed", description: "Could not establish a direct audio link. Check your network or firewall.", variant: "destructive", duration: 6000 });
        pc.close();
        pcsRef.current.delete(peerId);
        removeAudioEl(peerId);
      }
      // "disconnected" is transient — ICE may recover on its own; don't close yet.
      // The PC will progress to "failed" if it can't reconnect.
    };

    return pc;
  }, []);

  function closePc(peerId: string) {
    const pc = pcsRef.current.get(peerId);
    if (pc) { try { pc.close(); } catch { /* ignore */ } pcsRef.current.delete(peerId); }
    removeAudioEl(peerId);
  }

  function closeAllPcs() {
    for (const [id, pc] of pcsRef.current) {
      try { pc.close(); } catch { /* ignore */ }
      removeAudioEl(id);
    }
    pcsRef.current.clear();
  }

  // ── VU meter (level bar while transmitting) ───────────────────────────────
  function startVu() {
    if (IS_APPLE_MOBILE || !localStreamRef.current) return;
    try {
      const ctx      = new AudioContext();
      const clone    = localStreamRef.current.clone();  // never put WebRTC stream into graph
      const src      = ctx.createMediaStreamSource(clone);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      if (vuRef.current) clearInterval(vuRef.current);
      vuRef.current = setInterval(() => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
        setLevel(Math.min(1, avg / 128));
      }, 150);
    } catch { /* ignore */ }
  }

  function stopVu() {
    if (vuRef.current) { clearInterval(vuRef.current); vuRef.current = null; }
    setLevel(0);
  }

  // ── PTT transmit toggle ───────────────────────────────────────────────────
  const setTransmit = useCallback((active: boolean) => {
    transmitRef.current = active;
    setTransmitting(active);

    const track    = localStreamRef.current?.getAudioTracks()[0] ?? null;
    const isPrivate = targetsRef.current.length > 0;

    for (const [peerId, pc] of pcsRef.current) {
      // In private mode, only send audio to targets
      const shouldSend = active && (!isPrivate || targetsRef.current.includes(peerId));
      for (const sender of pc.getSenders()) {
        const wanted = shouldSend ? track : null;
        if (sender.track !== wanted) void sender.replaceTrack(wanted).catch(() => {});
      }
    }

    // Volume ducking: lower others while we talk (amount controlled by UI)
    setRemoteVolume(active ? duckAmountRef.current : 1.0);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "transmit", active }));
    }
  }, []);

  // ── Private mode ──────────────────────────────────────────────────────────
  const setPrivateMode = useCallback((targetIds: string[]) => {
    targetsRef.current = targetIds;
    setPrivateTargets(targetIds);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (targetIds.length > 0) {
        wsRef.current.send(JSON.stringify({ type: "private-start", targetIds }));
      } else {
        wsRef.current.send(JSON.stringify({ type: "private-stop", targetIds: [] }));
      }
    }
    // Re-apply transmit state for new target set
    if (transmitRef.current) setTransmit(true);
  }, [setTransmit]);

  // ── Send chat message ─────────────────────────────────────────────────────
  const sendChat = useCallback((text: string, isPrivate = false) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type:      "chat",
      text,
      private:   isPrivate,
      targetIds: isPrivate ? targetsRef.current : undefined,
    }));
  }, []);

  // ── Send reaction ─────────────────────────────────────────────────────────
  const sendReaction = useCallback((emoji: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "reaction", emoji }));
  }, []);

  // ── Dismiss voice message locally only (no API, no broadcast) ───────────
  const dismissVoiceMessage = useCallback((id: string) => {
    setVoiceMessages((prev) => prev.filter((v) => v.id !== id));
  }, []);

  // ── Delete voice message (REST + broadcast to room) ──────────────────────
  const deleteVoiceMessage = useCallback(async (id: string) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      const res = await fetch(`/api/ptt/rooms/${encodeURIComponent(room)}/voice/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return;
      setVoiceMessages((prev) => prev.filter((v) => v.id !== id));
      wsRef.current?.send(JSON.stringify({ type: "voice-deleted", voiceId: id }));
    } catch { /* ignore */ }
  }, []);

  // ── Upload voice message ──────────────────────────────────────────────────
  const uploadVoiceMessage = useCallback(async (blob: Blob, durationMs: number) => {
    const room = roomRef.current;
    if (!room) return;
    const formData = new FormData();
    formData.append("audio", blob);
    formData.append("nickname", nicknameRef.current);
    formData.append("duration_ms", String(durationMs));
    try {
      const res = await fetch(`/api/ptt/rooms/${encodeURIComponent(room)}/voice`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) return;
      const meta = await res.json() as VoiceMessage;
      setVoiceMessages((prev) => [...prev, meta]);
      // Notify room
      wsRef.current?.send(JSON.stringify({ type: "voice-saved", voiceId: meta.id }));
    } catch { /* ignore */ }
  }, []);

  // ── WS message handler ────────────────────────────────────────────────────
  const handleMessage = useCallback(async (event: MessageEvent, ws: WebSocket) => {
    try {
      const msg = JSON.parse(event.data as string) as Record<string, unknown>;

      // ── welcome: initial state on join ────────────────────────────────────
      if (msg.type === "welcome") {
        const initialPeers = (msg.peers as { id: string; nickname: string }[] ?? [])
          .map((p) => ({ ...p, speaking: false }));
        setPeers(initialPeers);
        setMessages((msg.chat as ChatMessage[] ?? []));
        setVoiceMessages((msg.voices as VoiceMessage[] ?? []));

        // Offer to all existing peers (we are the newcomer — we initiate)
        for (const p of initialPeers) {
          const pc    = getOrCreatePc(p.id, ws);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "signal", to: p.id, data: pc.localDescription?.toJSON() }));
          }
        }
        return;
      }

      // ── peer joined ───────────────────────────────────────────────────────
      if (msg.type === "peer-join" && msg.id && msg.nickname) {
        setPeers((prev) =>
          prev.some((p) => p.id === msg.id)
            ? prev
            : [...prev, { id: msg.id as string, nickname: msg.nickname as string, speaking: false }]
        );
        getOrCreatePc(msg.id as string, ws);
        playJoin();
        // Re-announce our speaking state so the new peer sees if we're already transmitting
        if (transmitRef.current && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "transmit", active: true }));
        }
        // Only ring if this page is not already the focused Watch Together page.
        // Suppresses spam notifications when both users are already watching together.
        if (document.visibilityState !== "visible") {
          window.dispatchEvent(new CustomEvent("urlinc:intercom-ring", {
            detail: { fromName: msg.nickname as string },
          }));
        }
        return;
      }

      // ── peer left ─────────────────────────────────────────────────────────
      if (msg.type === "peer-leave" && msg.id) {
        setPeers((prev) => prev.filter((p) => p.id !== msg.id));
        closePc(msg.id as string);
        playLeave();
        return;
      }

      // ── peer speaking ─────────────────────────────────────────────────────
      if (msg.type === "peer-speaking" && msg.id) {
        setPeers((prev) =>
          prev.map((p) => p.id === msg.id ? { ...p, speaking: !!(msg.active) } : p)
        );
        return;
      }

      // ── WebRTC signal relay ───────────────────────────────────────────────
      if (msg.type === "signal" && msg.from && msg.data) {
        const pc   = getOrCreatePc(msg.from as string, ws);
        const data = msg.data as RTCSessionDescriptionInit & RTCIceCandidateInit;

        if (data.type === "offer" || data.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit));
          if (data.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: "signal", to: msg.from, data: pc.localDescription?.toJSON() }));
            }
          }
        } else {
          try { await pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)); } catch { /* ignore */ }
        }
        return;
      }

      // ── chat message ──────────────────────────────────────────────────────
      if (msg.type === "chat" && msg.message) {
        setMessages((prev) => [...prev, msg.message as ChatMessage]);
        playMsg();
        return;
      }

      // ── reaction ──────────────────────────────────────────────────────────
      if (msg.type === "reaction" && msg.from && msg.emoji) {
        const r: Reaction = {
          from:     msg.from as string,
          nickname: msg.nickname as string ?? "",
          emoji:    msg.emoji as string,
          at:       Date.now(),
        };
        setReactions((prev) => [...prev.slice(-19), r]);
        return;
      }

      // ── voice message saved ───────────────────────────────────────────────
      if (msg.type === "voice-message-saved" && msg.message) {
        setVoiceMessages((prev) => {
          const m = msg.message as VoiceMessage;
          return prev.some((v) => v.id === m.id) ? prev : [...prev, m];
        });
        playMsg();
        return;
      }

      // ── voice message deleted (by any participant) ─────────────────────────
      if (msg.type === "voice-message-deleted" && msg.voiceId) {
        setVoiceMessages((prev) => prev.filter((v) => v.id !== (msg.voiceId as string)));
        return;
      }

      // ── private mode signals ──────────────────────────────────────────────
      if (msg.type === "private-start" && msg.from) {
        toast({ title: `${msg.nickname ?? "Someone"} wants a private call with you` });
        return;
      }
      if (msg.type === "private-stop") {
        return;
      }

      // ── room full ─────────────────────────────────────────────────────────
      if (msg.type === "room-full") {
        toast({ title: "Room is full", description: `Max ${msg.capacity ?? 6} people`, variant: "destructive" });
        return;
      }

    } catch { /* ignore malformed */ }
  }, [getOrCreatePc, playJoin, playLeave, playMsg, toast]);

  // ── Join room ─────────────────────────────────────────────────────────────
  const joinRoom = useCallback(async (code: string, nickname: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    intentionalLeave.current = false;
    nicknameRef.current = nickname;
    roomRef.current     = code;
    localStorage.setItem("ptt-nickname", nickname);

    // Only request mic if we don't already have a stream
    if (!localStreamRef.current) {
      setMicState("pending");
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStreamRef.current = raw;
        setMicState("ok");
        startVu();
      } catch {
        setMicState("denied");
      }
    }

    const clientId = clientIdRef.current;
    const proto    = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl    = `${proto}://${window.location.host}/api/ptt/ws/${encodeURIComponent(code)}/${clientId}?nickname=${encodeURIComponent(nickname)}`;
    const ws       = new WebSocket(wsUrl);
    wsRef.current  = ws;

    ws.onopen = () => {
      setJoined(true);
      setRoomCode(code);
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 25_000);
    };

    ws.onmessage = (event) => void handleMessage(event, ws);

    ws.onclose = () => {
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      setJoined(false);
      setRoomCode(null);
      setPeers([]);
      setReactions([]);
      setPrivateTargets([]);
      targetsRef.current = [];
      transmitRef.current = false;
      setTransmitting(false);
      setLevel(0);

      // Auto-reconnect if this was not an intentional leave
      if (!intentionalLeave.current && roomRef.current) {
        const savedRoom     = roomRef.current;
        const savedNickname = nicknameRef.current;
        roomRef.current = null;
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          void joinRoom(savedRoom, savedNickname);
        }, 3000);
      } else {
        roomRef.current = null;
        setMessages([]);
        setVoiceMessages([]);
      }
    };

    ws.onerror = () => ws.close();
  }, [handleMessage]);

  // ── Leave room ────────────────────────────────────────────────────────────
  const leaveRoom = useCallback(() => {
    intentionalLeave.current = true;
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
    stopVu();
    wsRef.current?.close();
    wsRef.current = null;
    closeAllPcs();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setJoined(false);
    setRoomCode(null);
    setPeers([]);
    setMessages([]);
    setVoiceMessages([]);
    setReactions([]);
    setPrivateTargets([]);
    targetsRef.current = [];
    setMicState("idle");
    transmitRef.current = false;
    setTransmitting(false);
    setLevel(0);
    roomRef.current = null;
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      intentionalLeave.current = true;
      if (pingRef.current) clearInterval(pingRef.current);
      if (vuRef.current) clearInterval(vuRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
      closeAllPcs();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Duck level (OFF=1, SOFT=0.5, STRONG=0.15) ────────────────────────────
  const setDuckAmount = useCallback((amount: number) => {
    duckAmountRef.current = amount;
  }, []);

  // ── Expose to consumer ────────────────────────────────────────────────────
  return {
    // connection
    joined,
    roomCode,
    clientId: clientIdRef.current,
    joinRoom,
    leaveRoom,
    // peers
    peers,
    // mic / transmit
    micState,
    transmitting,
    level,
    setTransmit,
    // audio
    audioHealth,
    enableAudio,
    requestMic,
    // away
    away,
    setAway,
    // chat
    messages,
    sendChat,
    // voice messages
    voiceMessages,
    uploadVoiceMessage,
    dismissVoiceMessage,
    deleteVoiceMessage,
    // reactions
    reactions,
    sendReaction,
    // private mode
    privateTargets,
    setPrivateMode,
    // settings
    beepsOn,
    setBeepsOn,
    setDuckAmount,
    nicknameRef,
  };
}
