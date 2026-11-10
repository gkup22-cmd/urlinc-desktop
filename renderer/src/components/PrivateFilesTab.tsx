import { useState, useEffect, useCallback } from "react";
import {
  Lock, Unlock, FolderOpen, Folder, File, FileText, Image, Video,
  Music, Package, Code, ChevronRight, ChevronDown, AlertTriangle,
  Shield, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Crypto ───────────────────────────────────────────────────────────────────

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── localStorage keys ─────────────────────────────────────────────────────────

const LS_HASH       = "vaultPrivatePinHash";
const LS_TRIES      = "vaultPrivateAttempts";
const LS_LOCKOUT    = "vaultPrivateLockoutUntil";
const LS_PIN_ENABLED = "vaultPrivatePinEnabled";
const MAX_TRIES  = 3;
const LOCKOUT_MS = 30_000;

// ── IndexedDB (persists FileSystemDirectoryHandle across sessions) ────────────

async function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("vaultPrivateFiles", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("data");
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await idbOpen();
    return new Promise((res, rej) => {
      const r = db.transaction("data", "readonly").objectStore("data").get(key);
      r.onsuccess = () => res((r.result as T) ?? null);
      r.onerror   = () => rej(r.error);
    });
  } catch { return null; }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const r = db.transaction("data", "readwrite").objectStore("data").put(value, key);
    r.onsuccess = () => res();
    r.onerror   = () => rej(r.error);
  });
}

// ── File system helpers ───────────────────────────────────────────────────────

type Entry = { name: string; kind: "file" | "directory"; handle: FileSystemHandle };

async function readDir(dir: FileSystemDirectoryHandle): Promise<Entry[]> {
  const out: Entry[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, handle] of (dir as any).entries()) {
    out.push({ name, kind: (handle as FileSystemHandle).kind, handle });
  }
  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg","jpeg","png","gif","webp","svg","bmp","heic"].includes(ext))
    return <Image className="w-4 h-4 shrink-0 text-sky-400" />;
  if (["mp4","mkv","mov","avi","webm","m4v"].includes(ext))
    return <Video className="w-4 h-4 shrink-0 text-violet-400" />;
  if (["mp3","wav","flac","aac","ogg","m4a"].includes(ext))
    return <Music className="w-4 h-4 shrink-0 text-emerald-400" />;
  if (["pdf","doc","docx","txt","rtf","odt","pages","md"].includes(ext))
    return <FileText className="w-4 h-4 shrink-0 text-amber-400" />;
  if (["zip","rar","7z","tar","gz","bz2"].includes(ext))
    return <Package className="w-4 h-4 shrink-0 text-orange-400" />;
  if (["js","ts","jsx","tsx","py","go","rs","java","html","css","json","xml","sh"].includes(ext))
    return <Code className="w-4 h-4 shrink-0 text-cyan-400" />;
  return <File className="w-4 h-4 shrink-0 text-muted-foreground/60" />;
}

async function openFile(handle: FileSystemFileHandle) {
  try {
    const file = await handle.getFile();
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch { /* ignore */ }
}

// ── Tree node (self-contained, manages own expand state) ─────────────────────

function TreeNode({ entry, depth }: { entry: Entry; depth: number }) {
  const [expanded, setExpanded]     = useState(false);
  const [children, setChildren]     = useState<Entry[] | null>(null);
  const [loading, setLoading]       = useState(false);

  const activate = async () => {
    if (entry.kind === "file") {
      await openFile(entry.handle as FileSystemFileHandle);
      return;
    }
    if (!expanded && children === null) {
      setLoading(true);
      try {
        setChildren(await readDir(entry.handle as FileSystemDirectoryHandle));
      } finally {
        setLoading(false);
      }
    }
    setExpanded((e) => !e);
  };

  return (
    <div>
      <button
        onClick={() => void activate()}
        className="w-full flex items-center gap-2 py-2 hover:bg-accent/50 transition-colors text-sm text-left"
        style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: "12px" }}
      >
        {entry.kind === "directory" ? (
          loading
            ? <Loader2 className="w-4 h-4 shrink-0 text-muted-foreground animate-spin" />
            : expanded
              ? <ChevronDown  className="w-4 h-4 shrink-0 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {entry.kind === "directory"
          ? <Folder className={`w-4 h-4 shrink-0 ${expanded ? "text-primary" : "text-amber-400"}`} />
          : getFileIcon(entry.name)
        }

        <span className="truncate">{entry.name}</span>
      </button>

      {expanded && children !== null && (
        <div>
          {children.length === 0
            ? <p className="text-xs text-muted-foreground/50 py-1.5" style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}>Empty folder</p>
            : children.map((c) => <TreeNode key={c.name} entry={c} depth={depth + 1} />)
          }
        </div>
      )}
    </div>
  );
}

// ── PIN dots display ──────────────────────────────────────────────────────────

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex gap-4 justify-center">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
            i < filled ? "bg-primary border-primary scale-110" : "border-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

// ── PIN pad ───────────────────────────────────────────────────────────────────

function PinPad({ value, onChange, onSubmit, disabled = false }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const press = (key: string) => {
    if (disabled) return;
    if (key === "del")   { onChange(value.slice(0, -1)); return; }
    if (key === "enter") { onSubmit(); return; }
    if (value.length >= 4) return;
    const next = value + key;
    onChange(next);
    if (next.length === 4) setTimeout(onSubmit, 150);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disabled) return;
      if (/^[0-9]$/.test(e.key)) {
        if (value.length >= 4) return;
        const next = value + e.key;
        onChange(next);
        if (next.length === 4) setTimeout(onSubmit, 150);
      } else if (e.key === "Backspace") {
        onChange(value.slice(0, -1));
      } else if (e.key === "Enter") {
        onSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [value, onChange, onSubmit, disabled]);

  const rows = [["1","2","3"], ["4","5","6"], ["7","8","9"], ["del","0","enter"]];

  return (
    <div className="flex flex-col gap-3 w-full max-w-[240px] mx-auto">
      {rows.map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-3">
          {row.map((k, ki) =>
            k === "" ? <div key={ki} /> : (
              <button
                key={k + ki}
                disabled={disabled}
                onClick={() => press(k)}
                className={`h-16 rounded-2xl border text-xl font-semibold transition-all active:scale-95 select-none
                  ${disabled ? "opacity-40 cursor-not-allowed" : ""}
                  ${k === "del"
                    ? "border-border/50 text-muted-foreground text-base hover:bg-accent"
                    : k === "enter"
                      ? "border-primary/40 bg-primary/10 text-primary text-base hover:bg-primary/20"
                      : "border-border bg-card hover:bg-accent hover:border-primary/30"
                  }`}
              >
                {k === "del" ? "⌫" : k === "enter" ? "↵" : k}
              </button>
            )
          )}
        </div>
      ))}
    </div>
  );
}

// ── Shared PIN screen shell ───────────────────────────────────────────────────

function PinScreen({ icon: Icon, title, subtitle, pinValue, onPinChange, onSubmit, error, showIcon = true, onCancel }: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  pinValue: string;
  onPinChange: (v: string) => void;
  onSubmit: () => void;
  error?: string;
  showIcon?: boolean;
  onCancel?: () => void;
}) {
  return (
    // pb-16 so Cancel isn't flush against the bottom edge. The pad is tall
    // enough that this screen usually overflows, and without the padding the
    // last control ends up looking like it fell off the page.
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-7 pb-16">
      <div className="flex flex-col items-center gap-3 text-center">
        {showIcon && (
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Icon className="w-8 h-8 text-primary" />
          </div>
        )}
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
      <PinDots filled={pinValue.length} />
      {error && <p className="text-sm text-destructive -mt-3 text-center">{error}</p>}
      <PinPad value={pinValue} onChange={onPinChange} onSubmit={onSubmit} />
      {/* Without this the only ways out are knowing the PIN or realising the
          tab strip above still works -- which reads as being stuck. */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

// ── Phase type ────────────────────────────────────────────────────────────────

type Phase = "loading" | "unsupported" | "setup" | "setup-confirm" | "locked" | "lockout" | "unlocked";

// ── Main component ────────────────────────────────────────────────────────────

export function PrivateFilesTab({ onExit }: { onExit?: () => void }) {
  const [phase, setPhase]             = useState<Phase>("loading");
  const [pin, setPin]                 = useState("");
  const [confirmPin, setConfirmPin]   = useState("");
  const [pinError, setPinError]       = useState("");
  const [attempts, setAttempts]       = useState(0);
  const [lockoutEnd, setLockoutEnd]   = useState(0);
  const [lockoutSecs, setLockoutSecs] = useState(0);
  const [rootHandle, setRootHandle]   = useState<FileSystemDirectoryHandle | null>(null);
  const [rootEntries, setRootEntries] = useState<Entry[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [pinEnabled, setPinEnabled]   = useState(() => localStorage.getItem(LS_PIN_ENABLED) !== "false");

  // Change-PIN sub-flow
  const [changingPin, setChangingPin]     = useState(false);
  const [newPin, setNewPin]               = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [newPinStep, setNewPinStep]       = useState<"enter" | "confirm">("enter");
  const [newPinError, setNewPinError]     = useState("");

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!("showDirectoryPicker" in window)) { setPhase("unsupported"); return; }
    const hash    = localStorage.getItem(LS_HASH);
    const lockout = Number(localStorage.getItem(LS_LOCKOUT) ?? 0);
    const tries   = Number(localStorage.getItem(LS_TRIES)   ?? 0);
    setAttempts(tries);
    if (!hash) { setPhase("setup"); return; }
    if (lockout > Date.now()) { setLockoutEnd(lockout); setPhase("lockout"); return; }
    const pinOn = localStorage.getItem(LS_PIN_ENABLED) !== "false";
    setPhase(pinOn ? "locked" : "unlocked");
  }, []);

  // ── Lockout countdown ─────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "lockout") return;
    const id = setInterval(() => {
      const secs = Math.ceil((lockoutEnd - Date.now()) / 1000);
      if (secs <= 0) {
        clearInterval(id);
        localStorage.removeItem(LS_LOCKOUT);
        localStorage.setItem(LS_TRIES, "0");
        setAttempts(0); setPin(""); setPhase("locked");
      } else {
        setLockoutSecs(secs);
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, lockoutEnd]);

  // ── Try to restore folder handle after unlock ─────────────────────────────

  const tryRestoreFolder = useCallback(async () => {
    const stored = await idbGet<FileSystemDirectoryHandle>("rootHandle");
    if (!stored) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perm = await (stored as any).queryPermission?.({ mode: "read" }) ?? "prompt";
      if (perm === "granted") {
        setRootHandle(stored);
        setRootEntries(await readDir(stored));
      }
    } catch { /* stale handle — user will re-pick */ }
  }, []);

  // Auto-restore folder whenever phase becomes "unlocked" (covers PIN-disabled init)
  useEffect(() => { if (phase === "unlocked") void tryRestoreFolder(); }, [phase, tryRestoreFolder]);

  // ── PIN unlock ────────────────────────────────────────────────────────────

  const attemptUnlock = useCallback(async () => {
    if (pin.length < 4) return;
    const stored = localStorage.getItem(LS_HASH) ?? "";
    const entered = await sha256hex(pin);
    if (entered === stored) {
      localStorage.setItem(LS_TRIES, "0");
      setAttempts(0); setPinError(""); setPin("");
      setPhase("unlocked");
    } else {
      const next = attempts + 1;
      setAttempts(next);
      localStorage.setItem(LS_TRIES, String(next));
      setPin("");
      if (next >= MAX_TRIES) {
        const end = Date.now() + LOCKOUT_MS;
        localStorage.setItem(LS_LOCKOUT, String(end));
        setLockoutEnd(end); setPhase("lockout");
      } else {
        setPinError(`Incorrect PIN — ${MAX_TRIES - next} attempt${MAX_TRIES - next !== 1 ? "s" : ""} left`);
      }
    }
  }, [pin, attempts, tryRestoreFolder]);

  // ── PIN setup ─────────────────────────────────────────────────────────────

  const advanceSetup = useCallback(async () => {
    if (phase === "setup") {
      if (pin.length < 4) return;
      setPhase("setup-confirm"); setPinError("");
    } else {
      // setup-confirm
      if (confirmPin.length < 4) return;
      if (confirmPin !== pin) {
        setPinError("PINs don't match — please try again");
        setPin(""); setConfirmPin(""); setPhase("setup");
        return;
      }
      localStorage.setItem(LS_HASH, await sha256hex(pin));
      localStorage.setItem(LS_TRIES, "0");
      setPinEnabled(true);
      localStorage.setItem(LS_PIN_ENABLED, "true");
      setPin(""); setConfirmPin(""); setPinError("");
      setPhase("unlocked");
    }
  }, [phase, pin, confirmPin]);

  // ── Folder picker ─────────────────────────────────────────────────────────

  const pickFolder = useCallback(async () => {
    try {
      setFolderLoading(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: "read" });
      await idbSet("rootHandle", handle);
      setRootHandle(handle);
      setRootEntries(await readDir(handle));
    } catch { /* cancelled */ } finally {
      setFolderLoading(false);
    }
  }, []);

  // ── Change PIN ────────────────────────────────────────────────────────────

  const savePinChange = useCallback(async () => {
    if (newPinStep === "enter") {
      if (newPin.length < 4) return;
      setNewPinStep("confirm"); setNewPinError("");
    } else {
      if (newPinConfirm.length < 4) return;
      if (newPinConfirm !== newPin) {
        setNewPinError("PINs don't match — try again");
        setNewPin(""); setNewPinConfirm(""); setNewPinStep("enter");
        return;
      }
      localStorage.setItem(LS_HASH, await sha256hex(newPin));
      setChangingPin(false); setNewPin(""); setNewPinConfirm(""); setNewPinStep("enter"); setNewPinError("");
    }
  }, [newPinStep, newPin, newPinConfirm]);

  const cancelChangePinForm = useCallback(() => {
    setChangingPin(false); setNewPin(""); setNewPinConfirm(""); setNewPinStep("enter"); setNewPinError("");
  }, []);

  const lock = useCallback(() => {
    setPhase("locked"); setPin(""); setPinError("");
    cancelChangePinForm();
  }, [cancelChangePinForm]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === "loading") return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  if (phase === "unsupported") return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center max-w-sm mx-auto px-4">
      <AlertTriangle className="w-12 h-12 text-amber-400" />
      <p className="text-lg font-semibold">Desktop Browser Required</p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Private Files uses the File System Access API, which requires a modern desktop
        browser such as Chrome or Edge. It is not supported on mobile or TV browsers.
      </p>
    </div>
  );

  if (phase === "lockout") return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
        <Lock className="w-8 h-8 text-destructive" />
      </div>
      <p className="text-lg font-semibold">Too many wrong attempts</p>
      <p className="text-muted-foreground text-sm">
        Try again in{" "}
        <span className="font-mono font-bold text-foreground tabular-nums">{lockoutSecs}</span> seconds.
      </p>
      {onExit && (
        <button
          type="button"
          onClick={onExit}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Leave Private Files
        </button>
      )}
    </div>
  );

  if (phase === "setup") return (
    <PinScreen
      icon={Shield}
      title="Create a PIN"
      subtitle="Choose a 4-digit PIN to protect this tab."
      pinValue={pin}
      onPinChange={setPin}
      onSubmit={advanceSetup}
      error={pinError}
      onCancel={onExit}
    />
  );

  if (phase === "setup-confirm") return (
    <PinScreen
      icon={Shield}
      title="Confirm your PIN"
      subtitle="Enter the same PIN again to confirm."
      pinValue={confirmPin}
      onPinChange={setConfirmPin}
      onSubmit={advanceSetup}
      error={pinError}
      onCancel={onExit}
    />
  );

  if (phase === "locked") return (
    <PinScreen
      icon={Lock}
      showIcon={false}
      title="Private Files"
      subtitle="Enter your PIN to access."
      pinValue={pin}
      onPinChange={setPin}
      onSubmit={attemptUnlock}
      error={pinError}
      onCancel={onExit}
    />
  );

  // ── Unlocked ──────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto py-6">

      {/* Header bar */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 min-w-0">
          <Unlock className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-medium">Private Files</span>
          {rootHandle && (
            <span className="text-xs text-muted-foreground truncate ml-1">/ {rootHandle.name}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {rootHandle && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void pickFolder()} disabled={folderLoading}>
              <FolderOpen className="w-3.5 h-3.5" /> Change Folder
            </Button>
          )}
          <div className="w-px h-4 bg-border shrink-0" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={pinEnabled}
              onChange={(e) => {
                const v = e.target.checked;
                setPinEnabled(v);
                localStorage.setItem(LS_PIN_ENABLED, v ? "true" : "false");
              }}
              className="w-3.5 h-3.5 accent-primary cursor-pointer"
            />
            Require PIN
          </label>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => { setChangingPin((v) => !v); setNewPin(""); setNewPinConfirm(""); setNewPinStep("enter"); setNewPinError(""); }}
          >
            <Shield className="w-3.5 h-3.5" /> Change PIN
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={lock}>
            <Lock className="w-3.5 h-3.5" /> Lock
          </Button>
        </div>
      </div>

      {/* Change-PIN inline form */}
      {changingPin && (
        <div className="mb-6 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-medium">
              {newPinStep === "enter" ? "Enter new PIN" : "Confirm new PIN"}
            </p>
            <button onClick={cancelChangePinForm} className="text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
          <div className="flex flex-col items-center gap-5">
            <PinDots filled={newPinStep === "enter" ? newPin.length : newPinConfirm.length} />
            {newPinError && <p className="text-sm text-destructive -mt-2 text-center">{newPinError}</p>}
            <PinPad
              value={newPinStep === "enter" ? newPin : newPinConfirm}
              onChange={newPinStep === "enter" ? setNewPin : setNewPinConfirm}
              onSubmit={() => void savePinChange()}
            />
          </div>
        </div>
      )}

      {/* Folder area */}
      {!rootHandle ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center rounded-xl border border-border border-dashed bg-card/30">
          <FolderOpen className="w-14 h-14 text-muted-foreground/25" />
          <div>
            <p className="text-base font-medium">No folder selected</p>
            <p className="text-sm text-muted-foreground mt-1">Choose a local folder to browse its contents.</p>
          </div>
          <Button onClick={() => void pickFolder()} disabled={folderLoading} className="gap-2">
            <FolderOpen className="w-4 h-4" />
            {folderLoading ? "Opening…" : "Choose Folder"}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {rootEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">This folder is empty.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {rootEntries.map((e) => (
                <TreeNode key={e.name} entry={e} depth={0} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
