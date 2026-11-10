import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  useGetInbox,
  useMarkMessageRead,
  useDeleteMessage,
  getGetInboxQueryKey,
  getGetMusicCountQueryKey,
  getListPhotosQueryKey,
  getGetPhotoStatsQueryKey,
  getGetVideoStatsQueryKey,
  getListVideosQueryKey,
  getGetRecentVideosQueryKey,
} from "@workspace/api-client-react";
import type { InboxMessage } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, MailOpen, Trash2, ChevronDown, ChevronUp, AlertTriangle, Download, CheckCircle2, Reply, Send, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

// payload and senderId are added/confirmed here since the generated type may not expose them
type InboxMessageWithPayload = InboxMessage & {
  payload?: Record<string, unknown> | null;
  senderId: string;
};

function detectPayloadInfo(payload: unknown): { type: "music" | "photos" | "videos"; count: number; label: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (Array.isArray(p.tracks))  return { type: "music",  count: p.tracks.length,  label: `${p.tracks.length} track${p.tracks.length !== 1 ? "s" : ""}` };
  if (Array.isArray(p.photos))  return { type: "photos", count: p.photos.length,  label: `${p.photos.length} photo${p.photos.length !== 1 ? "s" : ""}` };
  if (Array.isArray(p.videos))  return { type: "videos", count: p.videos.length,  label: `${p.videos.length} video${p.videos.length !== 1 ? "s" : ""}` };
  return null;
}

function MessageRow({ msg, isAdmin }: { msg: InboxMessageWithPayload; isAdmin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const markRead = useMarkMessageRead({
    mutation: {
      onSuccess: () => void qc.invalidateQueries({ queryKey: getGetInboxQueryKey() }),
    },
  });

  const deleteMsg = useDeleteMessage({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetInboxQueryKey() });
        setConfirmDelete(false);
      },
      onError: () => toast({ title: "Error", description: "Failed to delete message.", variant: "destructive" }),
    },
  });

  const handleImport = async () => {
    const payload = msg.payload;
    if (!payload || importState !== "idle") return;
    const info = detectPayloadInfo(payload);
    if (!info) return;
    setImportState("loading");
    try {
      const endpoint =
        info.type === "music"  ? "/api/music/import" :
        info.type === "photos" ? "/api/photos/import" :
                                  "/api/library/import";
      const res = await fetch(endpoint, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Import failed");
      const result = await res.json() as { imported?: number; skipped?: number };
      const imported = result.imported ?? info.count;
      const skipped = result.skipped ?? 0;
      setImportState("done");
      // Invalidate sidebar counts so badges update immediately after import
      if (info.type === "music") {
        void qc.invalidateQueries({ queryKey: ["/api/music"] });
        void qc.invalidateQueries({ queryKey: getGetMusicCountQueryKey() });
      } else if (info.type === "photos") {
        void qc.invalidateQueries({ queryKey: getListPhotosQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
      } else {
        void qc.invalidateQueries({ queryKey: getListVideosQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() });
      }
      toast({
        title: `Imported ${imported} ${info.type === "music" ? "tracks" : info.type}`,
        description: skipped > 0 ? `${skipped} already in your library.` : undefined,
      });
    } catch {
      setImportState("error");
      toast({ title: "Import failed", description: "Could not import the library content.", variant: "destructive" });
    }
  };

  const handleSendReply = async () => {
    if (!replyBody.trim() || replySending) return;
    setReplySending(true);
    try {
      // Use the dedicated reply endpoint — POST /messages is admin-only,
      // but any authenticated user can reply to a message they received.
      const res = await fetch(`/api/messages/${msg.id}/reply`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyBody.trim() }),
      });
      if (!res.ok) throw new Error("Send failed");
      setReplySent(true);
      setReplyBody("");
      setTimeout(() => { setReplySent(false); setReplyOpen(false); }, 2500);
    } catch {
      toast({ title: "Failed to send reply", variant: "destructive" });
    } finally {
      setReplySending(false);
    }
  };

  const toggle = () => {
    if (!expanded && !msg.isRead) {
      markRead.mutate({ messageId: msg.id });
    }
    setExpanded((e) => !e);
  };

  const targetLabel =
    msg.targetType === "all"
      ? "Everyone"
      : msg.targetType === "role"
      ? `Rank: ${msg.targetValue}`
      : "Direct";

  return (
    <div className={`border-b border-border last:border-0 transition-colors ${!msg.isRead ? "bg-primary/5" : ""}`}>
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
        onClick={toggle}
      >
        <div className="mt-0.5 shrink-0">
          {msg.isRead ? (
            <MailOpen className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Mail className="w-4 h-4 text-primary animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`font-semibold ${msg.isRead ? "text-foreground" : "text-primary"}`}>
              {msg.title}
            </span>
            <span className="text-xs text-muted-foreground">from {msg.senderName}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {new Date(msg.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {msg.targetType !== "all" && (
              <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                {targetLabel}
              </span>
            )}
            {!msg.isRead && (
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-semibold">
                New
              </span>
            )}
          </div>
          {!expanded && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">{msg.body}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-12 pb-5 pt-1 space-y-3">
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{msg.body}</p>

          {/* Reply to sender */}
          {!replySent ? (
            <>
              {!replyOpen ? (
                <button
                  onClick={() => setReplyOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Reply className="w-3.5 h-3.5" />
                  Reply to {msg.senderName}
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    rows={3}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={`Reply to ${msg.senderName}…`}
                    disabled={replySending}
                    className="w-full text-sm bg-background border border-border rounded px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                      onClick={() => { setReplyOpen(false); setReplyBody(""); }}>
                      Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs px-2 gap-1"
                      disabled={!replyBody.trim() || replySending}
                      onClick={() => void handleSendReply()}>
                      {replySending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                      Send reply
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Reply sent!
            </div>
          )}

          {/* Library-push import button — shown when an export payload is attached */}
          {msg.payload && (() => {
            const info = detectPayloadInfo(msg.payload);
            if (!info) return null;
            if (importState === "done") {
              return (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">Imported ✓</span>
                </div>
              );
            }
            return (
              <button
                onClick={() => void handleImport()}
                disabled={importState === "loading"}
                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
              >
                {importState === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {importState === "loading" ? "Importing…" : `Import ${info.label}`}
              </button>
            );
          })()}

          <div className="flex items-center gap-2 pt-1">
            {confirmDelete ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs text-destructive font-medium">Delete this message?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs px-2"
                  disabled={deleteMsg.isPending}
                  onClick={() => deleteMsg.mutate({ messageId: msg.id })}
                >
                  {deleteMsg.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Delete message
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Friend { id: string; email: string; firstName: string | null; lastName: string | null }

function FriendsCallSection() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((d: Friend[]) => setFriends(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || friends.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Friends</span>
      </div>
      <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
        {friends.map((f) => {
          const displayName = [f.firstName, f.lastName].filter(Boolean).join(" ").trim() || f.email;
          const initials = displayName.slice(0, 2).toUpperCase();
          return (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3 bg-card">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{displayName}</div>
                <div className="text-xs text-muted-foreground truncate">{f.email}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetInbox({ query: { queryKey: getGetInboxQueryKey(), refetchInterval: 30_000 } });
  const messages = (data?.messages ?? []) as InboxMessageWithPayload[];

  // Immediately refetch on mount so the notification glow/badge clears as
  // soon as the user lands on this page rather than waiting for the next poll.
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: getGetInboxQueryKey() });
  }, [qc]);
  const unread = messages.filter((m) => !m.isRead).length;
  const hasRead = messages.some((m) => m.isRead);
  const [deletingRead, setDeletingRead] = useState(false);
  const [confirmDeleteRead, setConfirmDeleteRead] = useState(false);

  const handleDeleteAllRead = async () => {
    setConfirmDeleteRead(false);
    setDeletingRead(true);
    try {
      const res = await fetch("/api/messages/read", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      void qc.invalidateQueries({ queryKey: getGetInboxQueryKey() });
      toast({ title: "Read messages deleted" });
    } catch {
      toast({ title: "Failed to delete messages", variant: "destructive" });
    } finally {
      setDeletingRead(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <FriendsCallSection />
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Inbox</h1>
            <p className="text-sm text-muted-foreground">
              {unread > 0
                ? `${unread} unread message${unread !== 1 ? "s" : ""}`
                : "You're all caught up"}
            </p>
          </div>
          {hasRead && (
            <div className="ml-auto flex items-center gap-2">
              {confirmDeleteRead ? (
                <>
                  <span className="text-xs text-muted-foreground">Delete all read messages? This cannot be undone.</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs px-2 gap-1"
                    disabled={deletingRead}
                    onClick={() => void handleDeleteAllRead()}
                  >
                    {deletingRead ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Yes, delete all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs px-2"
                    onClick={() => setConfirmDeleteRead(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDeleteRead(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete all read
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <MailOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No messages yet</p>
            <p className="text-sm mt-1 opacity-70">Messages from admins will appear here.</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {messages.map((msg) => (
              <MessageRow key={msg.id} msg={msg} isAdmin={user?.isAdmin ?? false} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
