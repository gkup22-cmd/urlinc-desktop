import { useEffect, useRef } from "react";
import { Phone, PhoneOff, X, Volume2, Mic } from "lucide-react";
import { useIntercom } from "@/contexts/IntercomContext";

function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

const card: React.CSSProperties = {
  position: "fixed",
  bottom: 80,
  right: 20,
  zIndex: 9999,
  background: "rgba(15, 15, 18, 0.93)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: "16px 20px",
  backdropFilter: "blur(14px)",
  color: "#fff",
  minWidth: 240,
  boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
  fontFamily: "inherit",
};

const lbl: React.CSSProperties = {
  fontSize: ".68rem",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  color: "#8e8ea8",
  marginBottom: 3,
};

const nameSty: React.CSSProperties = {
  fontWeight: 700,
  fontSize: "1.05rem",
  marginBottom: 13,
};

const rowSty: React.CSSProperties = { display: "flex", gap: 9 };

const btn = (bg: string): React.CSSProperties => ({
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 0",
  borderRadius: 10,
  background: bg,
  border: "none",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: ".83rem",
  fontFamily: "inherit",
});

const sliderRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const sliderLabel: React.CSSProperties = {
  fontSize: ".72rem",
  color: "#8e8ea8",
  width: 22,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  accentColor: "#6366f1",
  cursor: "pointer",
};

const pct: React.CSSProperties = {
  fontSize: ".7rem",
  color: "#8e8ea8",
  width: 30,
  textAlign: "right",
  flexShrink: 0,
};

/** Mic device selector — shown before answering/calling so the right device is used. */
function MicPicker({ devices, selected, onChange }: {
  devices: { deviceId: string; label: string }[];
  selected: string;
  onChange: (id: string) => void;
}) {
  if (devices.length < 2) return null; // only one mic, nothing to pick
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...lbl, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
        <Mic size={10} /> Microphone
      </div>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "#1f1f28",
          color: "#c8c8d8",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 7,
          padding: "5px 8px",
          fontSize: ".75rem",
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        <option value="">System default</option>
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
        ))}
      </select>
    </div>
  );
}

/** Live mic level canvas bar — reads from the Web Audio analyser each frame. */
function MicMeter({ analyserRef }: { analyserRef: React.RefObject<AnalyserNode | null> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef    = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const buf = new Uint8Array(32);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      if (!analyser || !ctx2d || !canvas) return;

      analyser.getByteFrequencyData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length) / 128;
      const level = Math.min(1, rms * 2.5); // scale up so normal speech shows nicely

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.fillStyle = "#1f1f28";
      ctx2d.fillRect(0, 0, w, h);

      // gradient bar
      const grad = ctx2d.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, "#4ade80");
      grad.addColorStop(0.6, "#facc15");
      grad.addColorStop(1, "#f87171");
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, 0, w * level, h);
    }

    draw();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [analyserRef]);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...lbl, marginBottom: 4 }}>Your mic level</div>
      <canvas ref={canvasRef} width={200} height={8} style={{ width: "100%", height: 8, borderRadius: 4, display: "block" }} />
      <div style={{ fontSize: ".65rem", color: "#555", marginTop: 3 }}>
        If bar stays dark, adjust mic in Windows Sound Settings
      </div>
    </div>
  );
}

export function IntercomUI() {
  const {
    callState, incomingCall, outgoingCall, remoteStream,
    callDuration, connectedName,
    speakerVolume, setSpeakerVolume,
    analyserRef, micTrackInfo, micError, callError,
    audioDevices, selectedDeviceId, setSelectedDeviceId,
    answer, reject, hangup,
  } = useIntercom();

  // Always-mounted audio element — srcObject must survive call state transitions.
  // Placing it inside a conditional block causes it to unmount/remount when
  // callState changes (e.g. ringing → connected), losing srcObject since
  // remoteStream hasn't changed so the effect doesn't re-fire.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (remoteStream) {
      el.srcObject = remoteStream;
      el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [remoteStream]);

  // Apply speaker volume live whenever the slider changes
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = speakerVolume;
  }, [speakerVolume]);

  return (
    <>
      {/* Always in the DOM so srcObject stays attached across state transitions */}
      <audio ref={audioRef} autoPlay style={{ display: "none" }} />

      {(micError ?? callError) && (
        <div style={{ ...card, bottom: 140, background: "rgba(60,0,0,0.95)", border: "1px solid #7f1d1d" }}>
          <div style={{ ...lbl, color: "#f87171" }}>{micError ? "Mic error" : "Call failed"}</div>
          <div style={{ fontSize: ".75rem", color: "#fca5a5", wordBreak: "break-all" }}>{micError ?? callError}</div>
        </div>
      )}

      {callState === "ringing" && incomingCall && (
        <div style={card}>
          <div style={lbl}>Incoming call</div>
          <div style={nameSty}>{incomingCall.fromName}</div>
          <MicPicker devices={audioDevices} selected={selectedDeviceId} onChange={setSelectedDeviceId} />
          <div style={rowSty}>
            <button style={btn("#16a34a")} onClick={answer}>
              <Phone size={14} /> Answer
            </button>
            <button style={btn("#dc2626")} onClick={reject}>
              <PhoneOff size={14} /> Decline
            </button>
          </div>
        </div>
      )}

      {callState === "calling" && outgoingCall && (
        <div style={card}>
          <div style={lbl}>Calling…</div>
          <div style={nameSty}>{outgoingCall.toName}</div>
          <button style={{ ...btn("#dc2626"), flex: undefined, width: "100%" }} onClick={hangup}>
            <X size={14} /> Cancel
          </button>
        </div>
      )}

      {callState === "connected" && (
        <div style={card}>
          <div style={{ ...lbl, color: "#4ade80" }}>● Connected</div>
          <div style={{ ...nameSty, marginBottom: 2 }}>{connectedName ?? "Call"}</div>
          <div style={{ color: "#8e8ea8", fontSize: ".83rem", marginBottom: 14 }}>{fmt(callDuration)}</div>

          {/* Live mic VU meter — shows if mic is actually capturing */}
          <MicMeter analyserRef={analyserRef} />
          {micTrackInfo && (
            <div style={{ fontSize: ".62rem", color: "#555", marginBottom: 10, wordBreak: "break-all" }}>
              {micTrackInfo}
            </div>
          )}

          {/* Speaker volume */}
          <div style={{ ...sliderRow, marginBottom: 14 }}>
            <span style={sliderLabel} title="Speaker volume"><Volume2 size={13} /></span>
            <input
              type="range" min={0} max={1} step={0.02}
              value={speakerVolume}
              onChange={(e) => setSpeakerVolume(parseFloat(e.target.value))}
              style={sliderStyle}
            />
            <span style={pct}>{Math.round(speakerVolume * 100)}%</span>
          </div>

          <button style={{ ...btn("#dc2626"), flex: undefined, width: "100%" }} onClick={hangup}>
            <PhoneOff size={14} /> Hang Up
          </button>
        </div>
      )}
    </>
  );
}
