/**
 * Intercom — family push-to-talk, modeled after Emergent's layout.
 *
 * Desktop: left panel (PTT + participants) + right sidebar (chat always open)
 * Mobile:  full PTT view with a chat button that opens a slide-up panel
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import {
  useGroupIntercom,
  type Peer, type ChatMessage, type VoiceMessage, type Reaction,
} from "@/hooks/useGroupIntercom";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { useAuth } from "@workspace/replit-auth-web";
import {
  Radio, Mic, MicOff, LogOut, Copy, Check, Volume1,
  Send, MessageSquare, PlayCircle, StopCircle,
  Bell, BellOff, EyeOff, Eye, Smile, X, Search, Trash2,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Room code history helpers
// ─────────────────────────────────────────────────────────────────────────────
const ROOM_HISTORY_KEY = "ptt-rooms-history";

function getRoomHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(ROOM_HISTORY_KEY) ?? "[]"); }
  catch { return []; }
}

function saveRoomToHistory(code: string) {
  const hist = getRoomHistory().filter((c) => c !== code);
  hist.unshift(code);
  try { localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(hist.slice(0, 3))); }
  catch { /* localStorage blocked */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Room entry screen
// ─────────────────────────────────────────────────────────────────────────────
function RoomEntry({ onJoin, defaultCode = "" }: { onJoin: (code: string, nickname: string) => void; defaultCode?: string }) {
  const { user } = useAuth();
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("ptt-nickname") ?? "" : "";
  const defaultName = saved || [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "";

  const [code,        setCode]        = useState(defaultCode.toUpperCase());
  const [nickname,    setNickname]    = useState(defaultName);

  // Auto-join when arriving via a Watch Together voice link (room pre-filled)
  useEffect(() => {
    if (defaultCode && defaultName) {
      onJoin(defaultCode.toUpperCase(), defaultName.trim());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showHistory, setShowHistory] = useState(false);
  const [history]                     = useState(() => getRoomHistory());
  const canJoin = code.trim().length >= 2 && nickname.trim().length >= 1;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6">
      <div className="w-full max-w-xs space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 border border-white/10 mb-5">
            <Radio className="w-10 h-10 text-white/80" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Intercom</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Family push-to-talk · works on any device</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">Your name</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Dad"
              className="w-full px-4 py-3.5 rounded-xl border border-border bg-muted/30 text-base focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">Room code</label>
            <div className="flex gap-2 relative">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onFocus={() => setShowHistory(true)}
                  onBlur={() => setTimeout(() => setShowHistory(false), 150)}
                  placeholder="e.g. FAMILY"
                  maxLength={12}
                  className="w-full px-4 py-3.5 rounded-xl border border-border bg-muted/30 text-base font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50"
                />
                {showHistory && history.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-10 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
                    {history.map((h) => (
                      <button
                        key={h}
                        onPointerDown={(e) => { e.preventDefault(); setCode(h); setShowHistory(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-mono tracking-widest hover:bg-muted/50 transition-colors"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setCode(Math.random().toString(36).slice(2, 7).toUpperCase())}
                className="px-3 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                New
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Anyone with this code can join your room</p>
          </div>
        </div>

        <button
          onClick={() => { if (canJoin) { saveRoomToHistory(code.trim().toUpperCase()); onJoin(code.trim().toUpperCase(), nickname.trim()); } }}
          disabled={!canJoin}
          className="w-full py-4 rounded-2xl bg-green-600 text-white font-bold text-base hover:bg-green-500 active:scale-[.98] transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          Join Room
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sound check — plays a short tone so you can verify speakers work
// ─────────────────────────────────────────────────────────────────────────────
function soundCheck() {
  try {
    const ctx  = new AudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.2);
  } catch { /* no AudioContext */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice bubble (in chat feed)
// ─────────────────────────────────────────────────────────────────────────────
function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function VoiceBubble({ vm, isMe, onDelete, onDeleteAll }: { vm: VoiceMessage; isMe: boolean; onDelete?: () => void; onDeleteAll?: () => void }) {
  const [playing,       setPlaying]       = useState(false);
  const [currentTime,   setCurrentTime]   = useState(0);
  const [duration,      setDuration]      = useState(vm.duration_ms > 0 ? vm.duration_ms / 1000 : 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function toggle() {
    if (!audioRef.current) {
      const a = new Audio(`/api/ptt/voice/${vm.id}/audio`);
      a.onloadedmetadata = () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration); };
      a.ontimeupdate = () => setCurrentTime(a.currentTime);
      a.onended = () => { setPlaying(false); setCurrentTime(0); };
      audioRef.current = a;
    }
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      setPlaying(false);
    } else {
      void audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div className={`flex flex-col gap-1 mb-4 ${isMe ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
        <span className="font-semibold uppercase tracking-wide">{isMe ? "YOU" : vm.nickname}</span>
        <span>{new Date(vm.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="rounded-xl border p-3 min-w-[200px] max-w-[90%] bg-white/5 border-white/10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold mb-2">
          <span>{vm.label}</span>
          <span className="ml-auto font-mono">{fmtTime(playing ? currentTime : duration)}</span>
          {onDelete && (
            confirmDelete ? (
              <span className="flex items-center gap-1.5 ml-1">
                <span className="text-red-400">Delete?</span>
                <button
                  onClick={() => { onDelete(); setConfirmDelete(false); }}
                  className="text-red-400 font-bold hover:text-red-300 transition-colors"
                >Yes</button>
                {onDeleteAll && (
                  <button
                    onClick={() => { onDeleteAll(); setConfirmDelete(false); }}
                    className="text-orange-400 font-bold hover:text-orange-300 transition-colors"
                    title="Delete this message from all users"
                  >All</button>
                )}
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >No</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggle} className="text-white hover:text-green-400 transition-colors flex-shrink-0">
            {playing ? <StopCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
          </button>
          <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-100"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Text bubble (in chat feed)
// ─────────────────────────────────────────────────────────────────────────────
function renderWithLinks(text: string) {
  const URL_RE = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer"
        className="underline text-blue-400 hover:text-blue-300 break-all">
        {m[0]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function TextBubble({ m, isMe }: { m: ChatMessage; isMe: boolean }) {
  return (
    <div className={`flex flex-col gap-1 mb-4 ${isMe ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
        <span className="font-semibold uppercase tracking-wide">{isMe ? "YOU" : m.nickname}</span>
        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className={`px-4 py-2.5 rounded-xl text-sm leading-relaxed max-w-[90%] ${
        m.private
          ? "bg-yellow-500/15 border border-yellow-500/30 text-foreground"
          : isMe
          ? "bg-white/10 text-foreground"
          : "bg-white/5 text-foreground border border-white/10"
      }`}>
        {m.private && <span className="mr-1.5 opacity-60">🔒</span>}
        {renderWithLinks(m.text)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Emoji picker data
// ─────────────────────────────────────────────────────────────────────────────
const EMOJI_CATS: { label: string; emojis: string[] }[] = [
  { label: "😀", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😉","😊","😇","🥰","😍","🤩","😘","😚","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖"] },
  { label: "👋", emojis: ["👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","💪","💅","🤳","✍️","💋","👄","👁","👀","🧠","👶","🧒","👦","👧","🧑","👨","👩","🧓","👴","👵","🧔","🤦","🤷","🙍","🙎","🙅","🙆","💁","🙋","🙇"] },
  { label: "🐶", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐒","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🐢","🐍","🦎","🐙","🦑","🦐","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐘","🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🐈","🐓","🦃","🦜","🕊","🐇","🦝","🦨","🦡","🦦","🦥","🐁","🐀","🦔"] },
  { label: "🍔", emojis: ["🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶","🧄","🧅","🥔","🍠","🥜","🍞","🥐","🥖","🧀","🥚","🍳","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🌮","🌯","🥙","🍜","🍝","🍛","🍣","🍱","🥟","🍤","🍙","🍘","🍥","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🥛","🍼","☕","🍵","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧋"] },
  { label: "🚗", emojis: ["🚗","🚕","🚙","🚌","🚎","🏎","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🚲","🛴","🚁","✈","🛩","🛫","🛬","🚀","🛸","⚓","🛟","⛵","🚤","🛥","🛳","🚢","🚂","🚄","🚅","🚇","🚊","🚝","🛤","⛽","🚨","🚥","🚦","🛑","🚧","🌍","🌎","🌏","🌐","🗺","🧭","🏔","⛰","🌋","🏕","🏖","🏜","🏝","🏠","🏡","🏢","🏥","🏦","🏨","🏪","🏫","🏰","💒","🗼","🗽"] },
  { label: "⚽", emojis: ["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🥅","⛳","🎣","🥊","🥋","🎽","🛹","⛸","🥌","🎿","⛷","🏂","🏋","🤸","⛹","🏄","🏊","🚴","🏆","🥇","🥈","🥉","🏅","🎖","🎗","🎫","🎟","🎪","🤹","🎭","🩰","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🎻","🎲","♟","🎯","🎳","🎮","🎰","🧩","🎊","🎉","🎈","🎀","🎁","🎄","🎃","🎆","🎇","✨","🎏"] },
  { label: "❤️", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","☀️","🌤","⛅","☁️","🌦","🌧","⛈","🌩","🌨","❄️","☃️","⛄","🌬","💧","💦","🌊","🌈","⭐","🌟","💫","✨","☄️","🔥","🌙","🌛","🌝","🌞","🌺","🌸","🌼","🌻","🌹","🌷","🌱","🌿","☘️","🍀","🍁","🍂","🍃","🌵","🌴","🌳","🌲"] },
  { label: "💎", emojis: ["💎","💍","👑","🏆","🎯","🔑","🗝","🔒","🔓","🔔","📢","📣","🎵","🎶","💡","🔦","🕯","💰","💵","💳","🪙","💸","📱","💻","🖥","🖨","⌨","🖱","💾","💿","📀","📺","📷","📸","📹","🎥","📞","☎","📟","📠","📻","🧭","⏱","⏲","⏰","🕰","⌛","⏳","📡","🔋","🔌","🔮","🧲","💊","🌡","🔬","🔭","🛒","🧲","🪞","🛋","🪑","🚪","🪟","🧹","🧺","🧻","🧼","🪥","🧴","🧷","🧸","🪁","🎭","🎨","🪄","🃏","🀄","🎴"] },
];

const EMOJI_RECENT_KEY = "ptt-emoji-recent";
const MAX_RECENT = 12;

function getRecentEmojis(): string[] {
  try { return JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) ?? "[]"); }
  catch { return []; }
}

function saveRecentEmoji(emoji: string) {
  const recent = getRecentEmojis().filter((e) => e !== emoji);
  recent.unshift(emoji);
  try { localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT))); }
  catch { /* localStorage blocked */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reaction bubble (in chat feed)
// ─────────────────────────────────────────────────────────────────────────────
function ReactionBubble({ r, isMe }: { r: Reaction; isMe: boolean }) {
  return (
    <div className="flex justify-center mb-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm">
        <span className="text-xl">{r.emoji}</span>
        <span className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{isMe ? "You" : r.nickname}</span> reacted
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

function ChatPanel({
  messages, voiceMessages, myId, myAuthId, reactions, roomCode,
  onSendText, onSendVoice, onSendReaction, onDeleteVoice, onDeleteAllVoice, onClearChat,
  onClose,
}: {
  messages: ChatMessage[];
  voiceMessages: VoiceMessage[];
  myId: string;
  myAuthId: string;
  reactions: Reaction[];
  roomCode: string;
  onSendText: (text: string, priv: boolean) => void;
  onSendVoice: (blob: Blob, durationMs: number) => void;
  onSendReaction: (emoji: string) => void;
  onDeleteVoice: (id: string) => void;
  onDeleteAllVoice?: () => void;
  onClearChat?: () => void;
  onClose?: () => void;
}) {
  const [text,          setText]          = useState("");
  const [recording,     setRecording]     = useState(false);
  const [recordingSec,  setRecordingSec]  = useState(0);
  const [showEmoji,     setShowEmoji]     = useState(false);
  const [activeCat,     setActiveCat]     = useState(0);
  const [recentEmoji,   setRecentEmoji]   = useState<string[]>(() => getRecentEmojis());
  const [showSearch,    setShowSearch]    = useState(false);
  const [searchText,    setSearchText]    = useState("");
  const [confirmClear,  setConfirmClear]  = useState(false);
  const mediaRef   = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const startRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);

  // Merge text + voice + reactions into one chronological feed
  type FeedItem =
    | { kind: "text";     data: ChatMessage;  at: number }
    | { kind: "voice";    data: VoiceMessage; at: number }
    | { kind: "reaction"; data: Reaction;     at: number };

  const q = searchText.toLowerCase();
  const feed: FeedItem[] = [
    ...messages
      .filter((m) => !q || m.text.toLowerCase().includes(q) || m.nickname.toLowerCase().includes(q))
      .map((m) => ({ kind: "text"     as const, data: m, at: new Date(m.created_at).getTime() })),
    ...voiceMessages
      .filter((v) => !q || v.nickname.toLowerCase().includes(q) || v.label.toLowerCase().includes(q))
      .map((v) => ({ kind: "voice"    as const, data: v, at: new Date(v.created_at).getTime() })),
    ...(!q ? reactions.map((r) => ({ kind: "reaction" as const, data: r, at: r.at })) : []),
  ].sort((a, b) => a.at - b.at);

  const totalCount = messages.length + voiceMessages.length;

  // Reaction burst: header indicator for recent ones
  const recentReactions = reactions.filter((r) => Date.now() - r.at < 4000);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed.length]);

  function pickEmoji(emoji: string) {
    saveRecentEmoji(emoji);
    setRecentEmoji(getRecentEmojis());
    setShowEmoji(false);
    // Insert at cursor position in text field
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart ?? text.length;
      const end   = input.selectionEnd   ?? text.length;
      const next  = text.slice(0, start) + emoji + text.slice(end);
      setText(next);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setText((t) => t + emoji);
    }
  }

  function submit() {
    if (!text.trim()) return;
    onSendText(text.trim(), false);
    setText("");
  }

  async function toggleRecord() {
    if (recording) {
      mediaRef.current?.stop();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecording(false);
      setRecordingSec(0);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          onSendVoice(blob, Date.now() - startRef.current);
          stream.getTracks().forEach((t) => t.stop());
        };
        startRef.current = Date.now();
        mr.start();
        mediaRef.current = mr;
        setRecordingSec(0);
        setRecording(true);
        timerRef.current = setInterval(() => {
          setRecordingSec(Math.floor((Date.now() - startRef.current) / 1000));
        }, 500);
      } catch { /* mic denied */ }
    }
  }

  // Emojis for the active category panel
  const activeCatEmojis = activeCat === -1 ? recentEmoji : EMOJI_CATS[activeCat]?.emojis ?? [];

  return (
    <div className="flex flex-col h-full border-l border-white/10">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 flex-shrink-0">
        <span className="font-bold text-sm tracking-widest">CHAT</span>
        {totalCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-green-600 text-white text-[10px] font-bold leading-none">
            {totalCount} NEW
          </span>
        )}
        <span className="text-muted-foreground text-sm ml-1">{totalCount}</span>
        <div className="flex-1" />
        {recentReactions.length > 0 && (
          <span className="text-xl">{recentReactions[recentReactions.length - 1].emoji}</span>
        )}
        <button
          onClick={() => { setShowSearch((v) => !v); setSearchText(""); }}
          className={`p-1.5 rounded-lg transition-colors ${showSearch ? "text-foreground bg-white/10" : "text-muted-foreground hover:text-foreground hover:bg-white/10"}`}
          title="Search messages"
        >
          <Search className="w-4 h-4" />
        </button>
        {onClearChat && !confirmClear && (
          <button
            onClick={() => setConfirmClear(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-white/10 transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {onClearChat && confirmClear && (
          <span className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">Clear all?</span>
            <button
              onClick={() => { onClearChat(); setConfirmClear(false); }}
              className="px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-500"
            >Yes</button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground hover:text-foreground"
            >No</button>
          </span>
        )}
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 border-b border-white/10 flex-shrink-0">
          <input
            autoFocus
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search messages…"
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/40"
          />
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {feed.length === 0 && (
          <p className="text-center text-muted-foreground text-sm pt-8">No messages yet</p>
        )}
        {feed.map((item, i) => {
          if (item.kind === "text")     return <TextBubble     key={i} m={item.data}  isMe={item.data.sender_id === myId} />;
          if (item.kind === "voice")    return <VoiceBubble    key={i} vm={item.data} isMe={item.data.sender_id === myAuthId} onDelete={() => onDeleteVoice(item.data.id)} onDeleteAll={onDeleteAllVoice} />;
          if (item.kind === "reaction") return <ReactionBubble key={i} r={item.data}  isMe={item.data.from === myId} />;
          return null;
        })}
        <div ref={bottomRef} />
      </div>

      {/* Full emoji picker */}
      {showEmoji && (
        <div className="border-t border-white/10 flex-shrink-0" style={{ maxHeight: 260 }}>
          {/* Category tabs */}
          <div className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto scrollbar-none">
            {recentEmoji.length > 0 && (
              <button
                onClick={() => setActiveCat(-1)}
                className={`flex-shrink-0 px-2 py-1 rounded text-sm transition-colors ${activeCat === -1 ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/8"}`}
              >
                🕐
              </button>
            )}
            {EMOJI_CATS.map((cat, i) => (
              <button
                key={i}
                onClick={() => setActiveCat(i)}
                className={`flex-shrink-0 px-2 py-1 rounded text-sm transition-colors ${activeCat === i ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/8"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* Label */}
          {activeCat === -1 && (
            <div className="px-3 pb-1 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
              Recently Used
            </div>
          )}
          {/* Emoji grid */}
          <div className="overflow-y-auto px-2 pb-2" style={{ maxHeight: 190 }}>
            <div className="grid gap-0.5" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
              {activeCatEmojis.map((e) => (
                <button
                  key={e}
                  onClick={() => pickEmoji(e)}
                  className="text-xl p-1 rounded hover:bg-white/10 active:scale-90 transition-all"
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Text input */}
      <div className="border-t border-white/10 px-3 py-3 flex gap-2 flex-shrink-0">
        <button
          onClick={() => setShowEmoji((v) => !v)}
          className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${showEmoji ? "text-foreground bg-white/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
          title="Insert emoji"
        >
          <Smile className="w-5 h-5" />
        </button>
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder="Type a message…"
            className="w-full px-3 py-2.5 pr-8 rounded-xl bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500/40"
          />
          {text && (
            <button
              onClick={() => { setText(""); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
              title="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!text.trim()}
          className="p-2.5 rounded-xl bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-colors flex-shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>

      {/* Leave a voice message button */}
      <div className="px-3 pb-4 flex-shrink-0">
        <button
          onClick={() => void toggleRecord()}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-colors ${
            recording
              ? "border-red-500/60 bg-red-500/15 text-red-400"
              : "border-white/15 bg-white/5 text-foreground hover:bg-white/10"
          }`}
        >
          {recording
            ? <><StopCircle className="w-4 h-4" /> Recording… {fmtTime(recordingSec)}</>
            : <><Mic className="w-4 h-4" /> Leave a voice message</>
          }
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Participant card
// ─────────────────────────────────────────────────────────────────────────────
function ParticipantCard({
  nickname, speaking, isMe, isEmpty,
  selected, onToggle,
}: {
  nickname?: string; speaking?: boolean; isMe?: boolean;
  isEmpty?: boolean; selected?: boolean; onToggle?: () => void;
}) {
  if (isEmpty) {
    return (
      <div className="flex flex-col gap-1 p-3 rounded-xl border border-white/8 bg-white/3 opacity-50">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">EMPTY SLOT</div>
        <div className="text-xs text-muted-foreground">Share the code — up to 6 people.</div>
      </div>
    );
  }

  return (
    <button
      onClick={onToggle}
      disabled={isMe}
      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
        speaking  ? "border-green-500/60 bg-green-500/10" :
        selected  ? "border-primary/60 bg-primary/10" :
                    "border-white/10 bg-white/5 hover:bg-white/8"
      } ${isMe ? "cursor-default" : "cursor-pointer"}`}
    >
      <div className="flex flex-col gap-0.5 text-left">
        <span className="text-sm font-bold uppercase tracking-widest">
          {nickname}{isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(YOU)</span>}
        </span>
        <span className={`text-xs ${speaking ? "text-green-400" : "text-muted-foreground"}`}>
          {speaking ? "TALKING" : "LISTENING"}
        </span>
      </div>
      {/* Mic icon */}
      <Mic className={`w-5 h-5 flex-shrink-0 ${speaking ? "text-green-400 animate-pulse" : "text-muted-foreground/40"}`} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Active room — full layout
// ─────────────────────────────────────────────────────────────────────────────
const PTT_CAPACITY = 6;

function ActiveRoom(props: ReturnType<typeof useGroupIntercom>) {
  const { user } = useAuth();
  const {
    roomCode, clientId, peers,
    micState, transmitting, level, setTransmit,
    audioHealth, enableAudio,
    away, setAway,
    messages, sendChat,
    voiceMessages, uploadVoiceMessage, dismissVoiceMessage, deleteVoiceMessage,
    reactions, sendReaction,
    setPrivateMode,
    beepsOn, setBeepsOn,
    setDuckAmount,
    nicknameRef,
    leaveRoom,
  } = props;

  const [tapMode,       setTapMode]       = useState(false);
  const [dip,           setDip]           = useState<"off" | "soft" | "strong">("soft");
  const [copied,        setCopied]        = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [chatOpen,      setChatOpen]      = useState(false);
  const [chatClearedAt, setChatClearedAt] = useState(0);

  async function clearChat() {
    try {
      await fetch(`/api/ptt/rooms/${roomCode}/chat`, { method: "DELETE" });
      setChatClearedAt(Date.now());
      // Delete all voice messages — each triggers WS broadcast so all clients update
      await Promise.all(voiceMessages.map((v) => deleteVoiceMessage(v.id)));
    } catch { /* ignore */ }
  }


  const myNickname = nicknameRef?.current ?? (typeof localStorage !== "undefined" ? (localStorage.getItem("ptt-nickname") ?? "Me") : "Me");
  const pttDisabled = micState === "denied";

  // Dip Others → update duck amount
  useEffect(() => {
    setDuckAmount(dip === "off" ? 1.0 : dip === "soft" ? 0.5 : 0.15);
  }, [dip, setDuckAmount]);

  // Sync private mode
  useEffect(() => {
    setPrivateMode(selectedPeers);
  }, [selectedPeers, setPrivateMode]);

  // If tapMode is on, transmit is locked ON
  const tapActive = useRef(false);
  function handleTapToggle() {
    const next = !tapMode;
    setTapMode(next);
    tapActive.current = next;
    setTransmit(next);
  }

  const { engage, release } = usePushToTalk({
    disabled: pttDisabled || tapMode,
    onTransmit: setTransmit,
  });

  function copyCode() {
    if (!roomCode) return;
    void navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!roomCode) return null;

  const anyoneSpeaking = peers.some((p) => p.speaking);
  const speakerName    = peers.find((p) => p.speaking)?.nickname;
  const totalMessages  = messages.length + voiceMessages.length;

  // Build participant slots (always show PTT_CAPACITY total = 6)
  const slots = Array.from({ length: PTT_CAPACITY }, (_, i) => {
    if (i === 0) return { isMe: true, peer: null };
    const peer = peers[i - 1];
    return peer ? { isMe: false, peer } : { isMe: false, peer: null };
  });

  return (
    <div className="flex items-start">

      {/* ════════════ LEFT PANEL ════════════ */}
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">

        {/* Top bar */}
        <div className="flex items-center px-5 py-3 border-b border-white/10 flex-shrink-0 gap-3">
          <div className="flex-1 min-w-0">
            {/* Room name */}
            <button onClick={copyCode} className="flex items-center gap-2 hover:text-green-400 transition-colors">
              <span className="font-bold text-lg tracking-wider">#{roomCode}</span>
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-white/30" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse" />
              LIVE · {peers.length + 1} HERE
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setBeepsOn((v) => !v)}
              title={beepsOn ? "Mute sounds" : "Enable sounds"}
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
            >
              {beepsOn ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setAway(!away)}
              title={away ? "You are away" : "Go away (mutes incoming)"}
              className={`p-2 rounded-xl transition-colors ${away ? "text-orange-400 bg-orange-400/10" : "text-muted-foreground hover:text-foreground hover:bg-white/8"}`}
            >
              {away ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            {/* Chat button on mobile */}
            <button
              onClick={() => setChatOpen(true)}
              className="md:hidden relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/8 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              {totalMessages > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-600 text-white text-[9px] font-bold flex items-center justify-center">
                  {totalMessages > 9 ? "9+" : totalMessages}
                </span>
              )}
            </button>
            <button
              onClick={leaveRoom}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm font-semibold transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Leave
            </button>
          </div>
        </div>

        {/* Audio blocked */}
        {audioHealth === "blocked" && (
          <button
            onClick={() => void enableAudio()}
            className="mx-5 mt-3 flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm font-medium hover:bg-blue-500/15 transition-colors flex-shrink-0"
          >
            <Volume1 className="w-4 h-4 flex-shrink-0" />
            Tap here to enable audio — browser blocked autoplay
          </button>
        )}

        {/* Mic denied */}
        {micState === "denied" && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm flex-shrink-0">
            <MicOff className="w-4 h-4 flex-shrink-0" />
            Microphone denied — you can listen but not talk
          </div>
        )}

        {/* Someone is speaking indicator — always in DOM to avoid layout shift */}
        <div className={`mx-5 mt-3 px-4 py-2 rounded-xl border text-sm font-medium flex-shrink-0 transition-opacity duration-200 ${
          anyoneSpeaking
            ? "bg-green-500/10 border-green-500/30 text-green-400 animate-pulse opacity-100"
            : "border-transparent text-transparent opacity-0 pointer-events-none select-none"
        }`}>
          {speakerName ?? " "} {anyoneSpeaking ? "is talking…" : ""}
        </div>

        {/* ── PTT button area ── */}
        <div className="flex flex-col items-center justify-center gap-6 px-6 py-8">

          {/* VU meter — always in DOM when transmitting to avoid layout shift */}
          <div className={`w-48 h-1.5 rounded-full bg-white/10 overflow-hidden transition-opacity duration-100 ${transmitting && level > 0.02 ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
            <div
              className="h-full bg-green-400 rounded-full transition-all duration-75"
              style={{ width: `${Math.round(level * 100)}%` }}
            />
          </div>

          {/* Big PTT circle — pointer events with capture prevent Android long-press stuck-on */}
          <button
            onPointerDown={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); engage(); }}
            onPointerUp={(e) => { e.preventDefault(); release(); }}
            onPointerCancel={(e) => { e.preventDefault(); release(); }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={pttDisabled}
            className={`
              w-52 h-52 rounded-full flex flex-col items-center justify-center gap-3
              font-bold text-base tracking-widest transition-all select-none touch-none
              ${pttDisabled
                ? "border-2 border-white/15 bg-white/5 text-white/30 cursor-not-allowed"
                : transmitting || tapMode
                ? "border-2 border-green-500 bg-green-500/15 text-green-300 scale-95 shadow-[0_0_60px_rgba(74,222,128,0.3)]"
                : "border-2 border-white/25 bg-white/5 text-white hover:border-white/40 hover:bg-white/8 active:scale-95 cursor-pointer"
              }
            `}
            style={{ WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
          >
            {(transmitting || tapMode)
              ? <><Radio className="w-12 h-12 animate-pulse" /><span>TALKING</span></>
              : pttDisabled
              ? <><MicOff className="w-12 h-12" /><span>NO MIC</span></>
              : <><Mic className="w-12 h-12" /><span>PUSH TO TALK</span></>
            }
          </button>

          {/* Below circle: instructions + TAP TO TALK button */}
          {!pttDisabled && (
            <div className="flex flex-col items-center gap-3 text-xs text-muted-foreground tracking-widest uppercase">
              <span>HOLD TO TALK · OR HOLD SPACE</span>
              <button
                onClick={handleTapToggle}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-sm font-semibold tracking-wider transition-all ${
                  tapMode
                    ? "border-green-500/70 bg-green-500/15 text-green-400"
                    : "border-white/20 bg-white/5 text-foreground hover:bg-white/10"
                }`}
              >
                {tapMode ? <Radio className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {tapMode ? "TAP TO STOP TALKING" : "TAP TO TALK (STAYS ON)"}
              </button>
            </div>
          )}

          {/* DIP OTHERS */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tracking-widest uppercase flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="15.54" y1="8.46" x2="19.07" y2="4.93"/>
                <line x1="19.07" y1="19.07" x2="15.54" y2="15.54"/>
              </svg>
              DIP OTHERS
            </span>
            {(["off", "soft", "strong"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setDip(v)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase transition-colors ${
                  dip === v
                    ? "bg-white/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/8"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Sound check */}
          <button
            onClick={soundCheck}
            className="text-xs text-muted-foreground hover:text-foreground tracking-widest uppercase flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            SOUND CHECK
          </button>
        </div>

        {/* ── IN THIS GROUP ── */}
        <div className="border-t border-white/10 px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">In This Group</span>
            <span className="text-xs text-muted-foreground">{peers.length + 1}/{PTT_CAPACITY} PEOPLE</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Me */}
            <ParticipantCard
              nickname={myNickname}
              speaking={transmitting}
              isMe
            />
            {/* Others + empty slots */}
            {Array.from({ length: PTT_CAPACITY - 1 }, (_, i) => {
              const peer = peers[i];
              if (peer) {
                return (
                  <ParticipantCard
                    key={peer.id}
                    nickname={peer.nickname}
                    speaking={peer.speaking}
                    selected={selectedPeers.includes(peer.id)}
                    onToggle={() =>
                      setSelectedPeers((prev) =>
                        prev.includes(peer.id) ? prev.filter((x) => x !== peer.id) : [...prev, peer.id]
                      )
                    }
                  />
                );
              }
              return <ParticipantCard key={`empty-${i}`} isEmpty />;
            })}
          </div>
          {selectedPeers.length > 0 && (
            <button
              onClick={() => setSelectedPeers([])}
              className="mt-2 text-xs text-muted-foreground underline"
            >
              Clear selection (exit private mode)
            </button>
          )}
        </div>
      </div>

      {/* ════════════ RIGHT PANEL — chat sidebar (desktop always visible) ════════════ */}
      <div className="hidden md:flex md:flex-col md:w-80 lg:w-96 flex-shrink-0 overflow-hidden sticky top-0 h-[100dvh]">
        <ChatPanel
          messages={messages.filter((m) => new Date(m.created_at).getTime() > chatClearedAt)}
          voiceMessages={voiceMessages}
          myId={clientId}
          myAuthId={user?.id ?? ""}
          reactions={reactions}
          roomCode={roomCode}
          onSendText={sendChat}
          onSendVoice={uploadVoiceMessage}
          onSendReaction={sendReaction}
          onDeleteVoice={dismissVoiceMessage}
          onDeleteAllVoice={deleteVoiceMessage}
          onClearChat={clearChat}
        />
      </div>

      {/* ════════════ MOBILE CHAT OVERLAY ════════════ */}
      {chatOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-background flex flex-col">
          <ChatPanel
            messages={messages.filter((m) => new Date(m.created_at).getTime() > chatClearedAt)}
            voiceMessages={voiceMessages}
            myId={clientId}
            myAuthId={user?.id ?? ""}
            reactions={reactions}
            roomCode={roomCode}
            onSendText={sendChat}
            onSendVoice={uploadVoiceMessage}
            onSendReaction={sendReaction}
            onDeleteVoice={deleteVoiceMessage}
            onClearChat={clearChat}
            onClose={() => setChatOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page root
// ─────────────────────────────────────────────────────────────────────────────
export default function IntercomPage() {
  const intercom = useGroupIntercom();
  const { joined, joinRoom } = intercom;

  const defaultRoom =
    typeof window !== "undefined"
      ? (new URLSearchParams(window.location.search).get("room") ?? "")
      : "";

  return (
    <Layout>
      {joined ? <ActiveRoom {...intercom} /> : <RoomEntry onJoin={joinRoom} defaultCode={defaultRoom} />}
    </Layout>
  );
}
