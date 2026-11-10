import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";

type CallState = "idle" | "calling" | "ringing" | "connected";

interface IncomingCall {
  fromUserId: string;
  fromName: string;
  offer: RTCSessionDescriptionInit;
}

interface OutgoingCall {
  toUserId: string;
  toName: string;
}

interface AudioDevice { deviceId: string; label: string; }

interface IntercomContextValue {
  callState: CallState;
  incomingCall: IncomingCall | null;
  outgoingCall: OutgoingCall | null;
  remoteStream: MediaStream | null;
  callDuration: number;
  connectedName: string | null;
  micGain: number;
  speakerVolume: number;
  micTrackInfo: string | null;
  micError: string | null;
  callError: string | null;
  audioDevices: AudioDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  analyserRef: React.RefObject<AnalyserNode | null>;
  setMicGain: (v: number) => void;
  setSpeakerVolume: (v: number) => void;
  call: (friendId: string, friendName: string) => Promise<void>;
  answer: () => Promise<void>;
  reject: () => void;
  hangup: () => void;
}

const IntercomContext = createContext<IntercomContextValue | null>(null);

const STUN: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function IntercomProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const wsRef            = useRef<WebSocket | null>(null);
  const pcRef            = useRef<RTCPeerConnection | null>(null);
  const localStreamRef   = useRef<MediaStream | null>(null);
  const remoteUserIdRef  = useRef<string | null>(null);
  const connectedAtRef   = useRef<number | null>(null);
  const pingRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef      = useRef<AnalyserNode | null>(null);
  const audioCtxRef      = useRef<AudioContext | null>(null);

  const [callState,     setCallState]     = useState<CallState>("idle");
  const [incomingCall,  setIncomingCall]  = useState<IncomingCall | null>(null);
  const [outgoingCall,  setOutgoingCall]  = useState<OutgoingCall | null>(null);
  const [remoteStream,  setRemoteStream]  = useState<MediaStream | null>(null);
  const [callDuration,  setCallDuration]  = useState(0);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [micGain,           setMicGainState]      = useState(1.5);
  const [speakerVolume,     setSpeakerVolume]     = useState(1.0);
  const [micTrackInfo,      setMicTrackInfo]      = useState<string | null>(null);
  const [micError,          setMicError]          = useState<string | null>(null);
  const [callError,         setCallError]         = useState<string | null>(null);
  const [audioDevices,      setAudioDevices]      = useState<AudioDevice[]>([]);
  const [selectedDeviceId,  setSelectedDeviceId]  = useState<string>(
    () => { try { return localStorage.getItem("intercom_mic_device") ?? ""; } catch { return ""; } }
  );

  const sendWs = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    setMicTrackInfo(null);
    setMicError(null);
    // callError intentionally NOT cleared here — it persists until next call attempt
    audioCtxRef.current = null;
    remoteUserIdRef.current = null;
    connectedAtRef.current = null;
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
    setCallState("idle");
    setIncomingCall(null);
    setOutgoingCall(null);
    setRemoteStream(null);
    setCallDuration(0);
    setConnectedName(null);
  }, []);

  const createPc = useCallback(() => {
    const pc = new RTCPeerConnection(STUN);
    pcRef.current = pc;
    pc.ontrack = (e) => {
      // Use e.track directly — e.streams[0] is unreliable in unified-plan
      // when the track has no msid association on the remote side.
      if (e.track) setRemoteStream(new MediaStream([e.track]));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && remoteUserIdRef.current) {
        sendWs({ type: "ice", targetUserId: remoteUserIdRef.current, candidate: e.candidate.toJSON() });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected");
        // Capture the name before incomingCall/outgoingCall state may be cleared
        setConnectedName((prev) => prev); // will be set explicitly in call/answer
        connectedAtRef.current = Date.now();
        durationRef.current = setInterval(() => {
          setCallDuration(Math.floor((Date.now() - (connectedAtRef.current ?? Date.now())) / 1000));
        }, 1000);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        cleanup();
      }
    };
    return pc;
  }, [sendWs, cleanup]);

  // Enumerate devices once on mount — Chrome may already have permission from a prior call,
  // in which case labels will be populated without needing another getUserMedia.
  useEffect(() => {
    if (!user?.id) return;
    void navigator.mediaDevices.enumerateDevices().then((all) => {
      const inputs = all.filter((d) => d.kind === "audioinput").map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `Mic (${d.deviceId.slice(0, 6)})`,
      }));
      if (inputs.length > 0) setAudioDevices(inputs);
    }).catch(() => {});
  }, [user?.id]);

  // Enumerate mic devices — called after a real getUserMedia grant so labels are populated
  const refreshDevices = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    const inputs = all.filter((d) => d.kind === "audioinput").map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Mic (${d.deviceId.slice(0, 6)})`,
    }));
    setAudioDevices(inputs);
  }, []);

  const getLocalAudio = useCallback(async () => {
    setMicError(null);

    // Release any stale stream/context from a previous failed attempt before
    // acquiring a new one — prevents "Device in use" from our own prior call.
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      await audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    // Retry helper — NotReadableError can be transient when a voice-typing app
    // briefly holds the mic; retrying after a short pause usually succeeds.
    async function tryGetMedia(constraint: MediaStreamConstraints, retries = 3): Promise<MediaStream> {
      for (let i = 0; i < retries; i++) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraint);
        } catch (err) {
          const name = err instanceof Error ? err.name : "";
          if (name === "NotReadableError" && i < retries - 1) {
            await new Promise((r) => setTimeout(r, 600));
            continue;
          }
          throw err;
        }
      }
      throw new Error("unreachable");
    }

    let stream: MediaStream | null = null;
    if (selectedDeviceId) {
      try {
        stream = await tryGetMedia({ audio: { deviceId: { ideal: selectedDeviceId } }, video: false });
      } catch {
        stream = null; // fall through to system default
      }
    }
    if (!stream) {
      try {
        stream = await tryGetMedia({ audio: true, video: false });
      } catch (err) {
        const isInUse = err instanceof Error && err.name === "NotReadableError";
        const msg = isInUse
          ? "Mic is in use by another app (voice typing?). Stop voice typing and try again."
          : (err instanceof Error ? err.name + ": " + err.message : String(err));
        setMicError(msg);
        throw err;
      }
    }
    localStreamRef.current = stream;
    const t = stream.getAudioTracks()[0];
    setMicTrackInfo(t ? `${t.label} [${t.readyState}, muted:${t.muted}, enabled:${t.enabled}]` : "no track");
    void refreshDevices();

    // Create an analyser-only AudioContext for the VU meter — this does NOT
    // touch the WebRTC track at all, so it can't break audio delivery.
    try {
      const ctx = new AudioContext();
      await ctx.resume();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
    } catch {
      audioCtxRef.current = null;
    }

    return stream; // raw stream goes to WebRTC unchanged
  }, [selectedDeviceId, refreshDevices]);

  const setMicGain = useCallback((v: number) => {
    setMicGainState(v);
  }, []);

  const selectDevice = useCallback((id: string) => {
    setSelectedDeviceId(id);
    try { localStorage.setItem("intercom_mic_device", id); } catch { }
  }, []);

  // Stable message handler — rebuilt only when cleanup changes
  const handleMessage = useCallback((raw: MessageEvent) => {
    try {
      const msg = JSON.parse(raw.data as string) as {
        type: string;
        fromUserId?: string;
        fromName?: string;
        offer?: RTCSessionDescriptionInit;
        answer?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
        targetUserId?: string;
      };

      if (msg.type === "ring" && msg.fromUserId && msg.fromName && msg.offer) {
        setIncomingCall({ fromUserId: msg.fromUserId, fromName: msg.fromName, offer: msg.offer });
        setCallState("ringing");
        // Notify extension content script via custom DOM event
        window.dispatchEvent(new CustomEvent("urlinc:intercom-ring", { detail: { fromName: msg.fromName } }));
        return;
      }

      if (msg.type === "answered" && msg.answer && pcRef.current) {
        void pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer));
        return;
      }

      if (msg.type === "ice" && msg.candidate && pcRef.current) {
        void pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
        return;
      }

      if (msg.type === "rejected")   { cleanup(); setCallError("Call declined."); return; }
      if (msg.type === "hung_up")    { cleanup(); return; }
      if (msg.type === "unavailable") {
        cleanup();
        setCallError("Friend is offline — make sure they have URLinc open.");
        return;
      }
    } catch { /* ignore malformed */ }
  }, [cleanup]);

  // Connect WebSocket once user is logged in, with auto-reconnect
  useEffect(() => {
    if (!user?.id) return;

    let stopped = false;
    let retryMs = 2_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (stopped) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/intercom/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryMs = 2_000; // reset backoff on successful connect
        if (pingRef.current) clearInterval(pingRef.current);
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 25_000);
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
        wsRef.current = null;
        if (!stopped) {
          retryTimer = setTimeout(() => { retryMs = Math.min(retryMs * 2, 30_000); connect(); }, retryMs);
        }
      };

      ws.onerror = () => ws.close(); // triggers onclose which handles retry
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      wsRef.current?.close();
    };
  }, [user?.id, handleMessage]);

  const call = useCallback(async (friendId: string, friendName: string) => {
    if (callState !== "idle") return;
    setCallError(null);
    try {
      const stream = await getLocalAudio();
      const pc = createPc();
      remoteUserIdRef.current = friendId;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setConnectedName(friendName);
      setOutgoingCall({ toUserId: friendId, toName: friendName });
      setCallState("calling");
      sendWs({ type: "call", targetUserId: friendId, offer: pc.localDescription?.toJSON() });
    } catch (err) {
      cleanup();
      setCallError("Call failed: " + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    }
  }, [callState, getLocalAudio, createPc, sendWs, cleanup]);

  const answer = useCallback(async () => {
    if (!incomingCall) return;
    setCallError(null);
    try {
      const stream = await getLocalAudio();
      const pc = createPc();
      remoteUserIdRef.current = incomingCall.fromUserId;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      sendWs({ type: "answer", targetUserId: incomingCall.fromUserId, answer: pc.localDescription?.toJSON() });
      setConnectedName(incomingCall.fromName);
      setIncomingCall(null);
    } catch {
      cleanup();
    }
  }, [incomingCall, getLocalAudio, createPc, sendWs, cleanup]);

  const reject = useCallback(() => {
    if (incomingCall) sendWs({ type: "reject", targetUserId: incomingCall.fromUserId });
    cleanup();
  }, [incomingCall, sendWs, cleanup]);

  const hangup = useCallback(() => {
    const targetId = remoteUserIdRef.current
      ?? incomingCall?.fromUserId
      ?? outgoingCall?.toUserId;
    if (targetId) sendWs({ type: "hangup", targetUserId: targetId });
    cleanup();
  }, [incomingCall, outgoingCall, sendWs, cleanup]);

  return (
    <IntercomContext.Provider value={{
      callState, incomingCall, outgoingCall, remoteStream, callDuration, connectedName,
      micGain, speakerVolume, micTrackInfo, micError, callError, audioDevices, selectedDeviceId,
      setSelectedDeviceId: selectDevice,
      analyserRef, setMicGain, setSpeakerVolume,
      call, answer, reject, hangup,
    }}>
      {children}
    </IntercomContext.Provider>
  );
}

export function useIntercom() {
  const ctx = useContext(IntercomContext);
  if (!ctx) throw new Error("useIntercom must be used within IntercomProvider");
  return ctx;
}
