import QRCode from "react-qr-code";
import { X, Wifi, WifiOff, Smartphone, ExternalLink, Check } from "lucide-react";
import { useRemote } from "@/contexts/RemoteContext";
import { type PendingOpen } from "@/hooks/use-remote-session";

function OpenUrlBanner({ open, onDone }: { open: PendingOpen; onDone: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 space-y-2">
      <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
        <ExternalLink className="w-3.5 h-3.5" /> Phone wants to open a URL
      </p>
      <p className="text-xs text-foreground truncate">{open.url}</p>
      <div className="flex gap-2 pt-1">
        <a
          href={open.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onDone}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open
        </a>
        <button onClick={onDone} className="ml-auto px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function RemoteQrModal() {
  const {
    pcConnected, phoneConnected, remoteUrl,
    lastSaved,
    pendingOpen, clearPendingOpen,
    closeModal, stopSession,
  } = useRemote();

  const handleClose = () => closeModal();
  const handleDisconnect = () => { stopSession(); closeModal(); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-2xl p-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Connect Remote</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Scan with your phone or tablet</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-3">
          {remoteUrl ? (
            <div className="p-3 bg-white rounded-xl shadow-inner">
              <QRCode value={remoteUrl} size={200} />
            </div>
          ) : (
            <div className="w-[224px] h-[224px] rounded-xl bg-muted animate-pulse" />
          )}

          {/* Status row */}
          <div className="flex items-center gap-3 text-xs">
            <span className={`flex items-center gap-1 ${pcConnected ? "text-emerald-500" : "text-muted-foreground"}`}>
              {pcConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              PC ready
            </span>
            <span className="text-border">·</span>
            <span className={`flex items-center gap-1 ${phoneConnected ? "text-emerald-500" : "text-muted-foreground"}`}>
              <Smartphone className="w-3.5 h-3.5" />
              {phoneConnected ? "Phone connected" : "Waiting for phone…"}
            </span>
          </div>
        </div>

        {/* Manual URL */}
        {remoteUrl && (
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[10px] text-muted-foreground mb-1">Or open manually on any device:</p>
            <p className="text-xs font-mono text-foreground break-all">{remoteUrl}</p>
          </div>
        )}

        {/* Pending open from phone */}
        {pendingOpen && (
          <OpenUrlBanner open={pendingOpen} onDone={clearPendingOpen} />
        )}

        {/* Passive "just saved" notice — no action needed */}
        {lastSaved && (
          <div className="mt-4 rounded-xl border border-[#00d4aa]/40 bg-[#00d4aa]/10 p-3 flex items-center gap-2.5">
            <Check className="w-4 h-4 text-[#00d4aa] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#00d4aa]">Saved to Media Inbox</p>
              <p className="text-xs text-muted-foreground truncate">{lastSaved.title ?? lastSaved.url}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Bookmark this URL — it changes if you Disconnect.
          </p>
          <button
            onClick={handleDisconnect}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
