const SUPPORT_URL = "https://buy.stripe.com/eVq9AL9mK12k2Mf4P1d3i00";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { Settings, Home, LogOut, Images, Tv2, ShieldCheck, Music2, Mail, UserPlus, X, Film, ListVideo, Share2, Check, Radio, Headphones, Archive, Radio as RadioIcon, Sparkles, Trash2, HelpCircle, Trophy, MessageSquare, Inbox, Layers, Mic, Heart, Star, Link2Off, Compass } from "lucide-react";

import { useAuth } from "@workspace/replit-auth-web";
import { useTv } from "@/hooks/use-tv";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useGetVideoStats, useGetPhotoStats, useGetMusicCount, useGetUnreadCount, getGetUnreadCountQueryKey } from "@workspace/api-client-react";
import { MusicPlayerBar } from "@/components/MusicPlayerBar";
import { useCurrentTrack, useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { PhotoScreensaver } from "@/components/PhotoScreensaver";
import { useScreensaverSettings, useScreensaverTimer } from "@/hooks/useScreensaver";

function NavSection({
  label,
  links,
  location,
  tvMode,
}: {
  label: string;
  links: { href: string; label: string; icon: React.ElementType; badge?: number }[];
  location: string;
  tvMode: boolean;
}) {
  return (
    <div>
      <div className={`mt-5 mb-1 px-3 py-1 font-semibold tracking-wider text-muted-foreground uppercase ${tvMode ? "text-sm" : "text-xs"}`}>
        {label}
      </div>
      <div>
        {links.map((link) => {
          const active = location === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              data-tv-nav={tvMode ? "true" : undefined}
              className={`flex items-center gap-3 px-3 rounded-md transition-all ${
                tvMode ? "py-3.5 text-base" : "py-2"
              } ${
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <Icon className={tvMode ? "w-6 h-6 shrink-0" : "w-5 h-5 shrink-0"} />
              {link.label}
              {link.badge !== undefined && (
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {link.badge.toLocaleString()}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

type FriendRequest = { requestId: number; user: { id: string; email: string; firstName: string | null; lastName: string | null } | undefined; createdAt: string };
type VideoShare = { id: number; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; videoTitle: string; videoThumbnailUrl: string | null };
type PlaylistShare = { id: number; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; playlistName: string; videoCount: number };
type CategoryShare = { id: number; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; categoryName: string; videoCount: number };
type PhotoCategoryShare = { id: number; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; categoryName: string; photoCount: number };
type VaultSourceShare = { id: number; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; listType: string; sourceCount: number };
type WatchInvite = {
  id: number;
  sessionId: string;
  videoId: number | null;
  external: { source: "plex" | "jellyfin"; title: string; watchUrl: string; thumbnailUrl: string | null } | null;
  hostName: string;
};

// ── P2P Session invite type ────────────────────────────────────────────────────
type P2PInvite = {
  session_id: string;
  title: string;
  host_user: string;
  signal_hint: string;
  created_at: string;
};

// ── Game invite types ──────────────────────────────────────────────────────
type GameInvite =
  | { type: "caption-duel"; id: number; photoUrl: string; creatorEmail: string; creatorFirstName: string | null; creatorLastName: string | null; createdAt: string }
  | { type: "caption-duel-result"; id: number; opponentEmail: string; createdAt: string }
  | { type: "caption-duel-counter"; id: number; createdAt: string }
  | { type: "movie-bracket"; id: number; creatorEmail: string; movieCount: number; createdAt: string }
  | { type: "movie-bracket-vote"; id: number; creatorEmail: string; movieCount: number; createdAt: string }
  | { type: "movie-bracket-complete"; id: number; winnerTitle: string; mode?: string; introNote?: string | null; createdAt: string }
  | { type: "movie-bracket-note-update"; id: number; noteUpdatedAt: string; introNote: string | null; createdAt: string };

function gameInviteSender(invite: GameInvite) {
  if (invite.type === "caption-duel-result") return invite.opponentEmail;
  if (invite.type === "caption-duel-counter") return "Caption Duel";
  if ("creatorFirstName" in invite && (invite.creatorFirstName || invite.creatorLastName))
    return `${invite.creatorFirstName ?? ""} ${invite.creatorLastName ?? ""}`.trim();
  return "creatorEmail" in invite ? invite.creatorEmail : "";
}

// ── Cleanup nudge ──────────────────────────────────────────────────────────
// A lightweight, self-service suggestion (not an admin action) shown when a
// user's own account has accumulated a meaningful amount of duplicates or
// trash. Snoozable so it doesn't nag every session.
type CleanupNudge = { duplicateCount: number; trashedCount: number; trashedVideos: number; trashedPhotos: number };
const CLEANUP_NUDGE_SNOOZE_KEY = "cleanup_nudge_snoozed_until";
const CLEANUP_NUDGE_DUPLICATE_THRESHOLD = 5;
const CLEANUP_NUDGE_TRASH_THRESHOLD = 10;

function senderName(u: { senderEmail: string; senderFirstName: string | null; senderLastName: string | null }) {
  if (u.senderFirstName || u.senderLastName) return `${u.senderFirstName ?? ""} ${u.senderLastName ?? ""}`.trim();
  return u.senderEmail;
}

const VAULT_SOURCE_LIST_LABELS: Record<string, string> = {
  streaming: "Streaming Services",
  "vault-games": "Games",
  "vault-reading": "Reading",
  "vault-stories": "Stories",
};

function reqName(req: FriendRequest) {
  if (!req.user) return "Unknown";
  if (req.user.firstName || req.user.lastName) return `${req.user.firstName ?? ""} ${req.user.lastName ?? ""}`.trim();
  return req.user.email;
}

function NotificationPopover({
  friendRequests,
  videoShares,
  playlistShares,
  categoryShares,
  photoCategoryShares,
  vaultSourceShares,
  watchInvites,
  p2pInvites,
  gameInvites,
  cleanupNudge,
  trashCounts,
  mediaInboxCount,
  unreadMessageCount,
  onAcceptFriend,
  onDeclineFriend,
  onAddShare,
  onDismissShare,
  onDismissWatchInvite,
  onDismissP2PInvite,
  onDismissGameInvite,
  onDismissCleanupNudge,
  onClose,
}: {
  friendRequests: FriendRequest[];
  videoShares: VideoShare[];
  playlistShares: PlaylistShare[];
  categoryShares: CategoryShare[];
  photoCategoryShares: PhotoCategoryShare[];
  vaultSourceShares: VaultSourceShare[];
  watchInvites: WatchInvite[];
  p2pInvites: P2PInvite[];
  gameInvites: GameInvite[];
  cleanupNudge: CleanupNudge | null;
  trashCounts: { videos: number; photos: number } | null;
  mediaInboxCount: number;
  unreadMessageCount: number;
  onAcceptFriend: (id: number) => Promise<void>;
  onDeclineFriend: (id: number) => Promise<void>;
  onAddShare: (type: "video" | "playlist" | "category" | "photo-category" | "vault-source", id: number, label: string) => Promise<void>;
  onDismissShare: (type: "video" | "playlist" | "category" | "photo-category" | "vault-source", id: number) => Promise<void>;
  onDismissWatchInvite: (id: number) => void;
  onDismissP2PInvite: (sessionId: string) => void;
  onDismissGameInvite: (type: "caption-duel" | "caption-duel-result" | "caption-duel-counter" | "movie-bracket" | "movie-bracket-vote" | "movie-bracket-complete" | "movie-bracket-note-update", id: number) => void;
  onDismissCleanupNudge: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const totalItems = friendRequests.length + videoShares.length + playlistShares.length + categoryShares.length + photoCategoryShares.length + vaultSourceShares.length + watchInvites.length + p2pInvites.length + gameInvites.length + (cleanupNudge ? 1 : 0) + (mediaInboxCount >= 5 ? 1 : 0);

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setLoadingId(key);
    try { await fn(); } finally { setLoadingId(null); }
  };

  return createPortal(
    <div
      ref={ref}
      // React bubbles synthetic events along the JSX tree, not the actual
      // DOM tree -- so even though createPortal renders this elsewhere in
      // the document, a click in here still bubbles up to the bell icon's
      // own onClick (which toggles the popover open/closed) in the parent
      // component. That meant clicking "X" ran onClose() to close it, then
      // the very same click bubbled up and immediately reopened it -- only
      // ever visible on the X specifically, since every other control in
      // here is a link that navigates away before the reopen would show.
      onClick={(e) => e.stopPropagation()}
      className="fixed top-20 left-4 w-80 border border-popover-border rounded-xl shadow-2xl z-[9999] overflow-visible"
      style={{
        maxHeight: "min(28rem, 70vh)",
        overflowY: "auto",
        backgroundColor: "hsl(from hsl(var(--popover)) h s calc(l + 15))",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 z-10"
        style={{ backgroundColor: "hsl(from hsl(var(--popover)) h s calc(l + 15))" }}
      >
        <span className="text-sm font-semibold">Notifications</span>
        <div className="flex items-center gap-2">
          <a href="/library-tools" className="text-xs text-primary hover:underline" onClick={onClose}>
            View all
          </a>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Messages/Inbox — always available, not just when there's an unread count ── */}
      <a
        href="/messages"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Messages</p>
          <p className="text-xs text-muted-foreground">
            {unreadMessageCount > 0 ? `${unreadMessageCount} unread` : "Go to inbox"}
          </p>
        </div>
        {unreadMessageCount > 0 && (
          <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1.5">
            {unreadMessageCount}
          </span>
        )}
      </a>

      {/* ── Trash — always available, not just when there's something in it ── */}
      <a
        href="/manage/trash"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Trash2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Video Trash</p>
          <p className="text-xs text-muted-foreground">
            {trashCounts && trashCounts.videos > 0 ? `${trashCounts.videos} video${trashCounts.videos !== 1 ? "s" : ""}` : "Nothing to clean up"}
          </p>
        </div>
        {trashCounts && trashCounts.videos > 0 && (
          <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1.5">
            {trashCounts.videos}
          </span>
        )}
      </a>

      <a
        href="/manage-photos/trash"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-accent/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Trash2 className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Photo Trash</p>
          <p className="text-xs text-muted-foreground">
            {trashCounts && trashCounts.photos > 0 ? `${trashCounts.photos} photo${trashCounts.photos !== 1 ? "s" : ""}` : "Nothing to clean up"}
          </p>
        </div>
        {trashCounts && trashCounts.photos > 0 && (
          <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full min-w-[1.25rem] h-5 flex items-center justify-center px-1.5">
            {trashCounts.photos}
          </span>
        )}
      </a>

      {totalItems === 0 && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">No pending notifications</div>
      )}

      {/* ── Media Inbox nudge ── */}
      {mediaInboxCount >= 5 && (
        <div className="divide-y divide-border">
          <div className="px-4 py-3 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#00d4aa]/15 flex items-center justify-center shrink-0">
                <Inbox className="w-4 h-4 text-[#00d4aa]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Media Inbox is filling up</p>
                <p className="text-xs text-muted-foreground">{mediaInboxCount} item{mediaInboxCount !== 1 ? "s" : ""} waiting to be sorted</p>
              </div>
            </div>
            <div className="pl-11">
              <a
                href="/?tab=library&category=Media+Inbox"
                className="h-7 px-2 inline-flex items-center text-xs font-medium rounded-md bg-[#00d4aa] text-black hover:bg-[#00d4aa]/90 transition-colors"
                onClick={onClose}
              >
                Sort Media Inbox
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Cleanup nudge ── */}
      {cleanupNudge && (
        <div className="divide-y divide-border">
          <div className="px-4 py-3 space-y-2.5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Your library could use some tidying</p>
                <p className="text-xs text-muted-foreground">
                  {cleanupNudge.duplicateCount > 0 && `${cleanupNudge.duplicateCount} duplicate${cleanupNudge.duplicateCount !== 1 ? "s" : ""}`}
                  {cleanupNudge.duplicateCount > 0 && cleanupNudge.trashedCount > 0 && " · "}
                  {cleanupNudge.trashedCount > 0 && `${cleanupNudge.trashedCount} in trash`}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground" onClick={onDismissCleanupNudge}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex gap-1.5 flex-wrap pl-11">
              {cleanupNudge.duplicateCount > 0 && (
                <a
                  href="/duplicates"
                  className="h-7 px-2 inline-flex items-center text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={onClose}
                >
                  Duplicates
                </a>
              )}
              {cleanupNudge.trashedVideos > 0 && (
                <a
                  href="/manage/trash"
                  className="h-7 px-2 inline-flex items-center text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={onClose}
                >
                  Video Trash
                </a>
              )}
              {cleanupNudge.trashedPhotos > 0 && (
                <a
                  href="/manage-photos/trash"
                  className="h-7 px-2 inline-flex items-center text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={onClose}
                >
                  Photo Trash
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Game invites (Caption Duels + Movie Brackets) ── */}
      {gameInvites.length > 0 && (
        <div className="divide-y divide-border">
          {gameInvites.map((invite) => (
            <div key={`${invite.type}-${invite.id}`} className="px-4 py-3 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${invite.type === "movie-bracket-complete" ? "bg-[#D4AF37]/15" : invite.type === "movie-bracket-note-update" ? "bg-amber-500/15" : "bg-primary/10"}`}>
                {invite.type === "movie-bracket-complete"
                  ? <Trophy className="w-4 h-4 text-[#D4AF37]" />
                  : invite.type === "movie-bracket-note-update"
                  ? <MessageSquare className="w-4 h-4 text-amber-400" />
                  : <Sparkles className="w-4 h-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {invite.type === "caption-duel" ? "Caption Duel challenge"
                    : invite.type === "caption-duel-result" ? "Caption Duel — rate it!"
                    : invite.type === "caption-duel-counter" ? "Caption Duel — verdict in!"
                    : invite.type === "movie-bracket-complete"
                      ? (invite.mode === "direct" ? "You're invited to Movie Night!" : "Tonight's pick is in!")
                    : invite.type === "movie-bracket-note-update" ? "Movie Night note updated"
                    : invite.type === "movie-bracket-vote" ? "Cast your veto!"
                    : "You're invited to Movie Night!"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {invite.type === "caption-duel-result"
                    ? `${invite.opponentEmail} captioned your photo — give it a rating!`
                    : invite.type === "caption-duel-counter"
                    ? "They rated your caption. See what they thought!"
                    : invite.type === "movie-bracket-complete"
                    ? (invite.mode === "direct"
                        ? `${invite.winnerTitle}${invite.introNote ? ` · ${invite.introNote.length > 60 ? invite.introNote.slice(0, 60) + "…" : invite.introNote}` : ""}`
                        : `Tonight's movie: ${invite.winnerTitle}`)
                    : invite.type === "movie-bracket-note-update"
                    ? (invite.introNote ? (invite.introNote.length > 60 ? invite.introNote.slice(0, 60) + "…" : invite.introNote) : "The host updated the details for Movie Night")
                    : invite.type === "movie-bracket-vote"
                    ? `Group vote in progress · ${invite.movieCount} movies`
                    : `${gameInviteSender(invite)} invited you · ${invite.movieCount} movies to pick from`}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <a
                  href={`/movie-bracket/${invite.id}`}
                  className="h-7 px-2 inline-flex items-center text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={() => { onDismissGameInvite(invite.type, invite.id); onClose(); }}
                  style={invite.type === "movie-bracket-complete" ? { background: "#D4AF37", color: "#000" } : invite.type === "movie-bracket-note-update" ? { background: "rgb(245 158 11)", color: "#000" } : undefined}
                >
                  {invite.type === "caption-duel-result" ? "Rate it"
                    : invite.type === "caption-duel-counter" ? "See verdict"
                    : invite.type === "movie-bracket-complete" ? "View"
                    : invite.type === "movie-bracket-note-update" ? "View"
                    : invite.type === "movie-bracket-vote" ? "Vote now"
                    : "Play"}
                </a>
                {invite.type !== "movie-bracket-complete" && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
                    onClick={() => onDismissGameInvite(invite.type, invite.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── P2P Stream invites ── */}
      {p2pInvites.length > 0 && (
        <div className="divide-y divide-border">
          {p2pInvites.map((invite) => (
            <div key={invite.session_id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <Radio className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">🎬 {invite.title}</p>
                <p className="text-xs text-muted-foreground truncate">{invite.host_user} is streaming live</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <a
                  href={`/watch?session=${invite.session_id}&signal=${encodeURIComponent(invite.signal_hint)}&title=${encodeURIComponent(invite.title)}&host=${encodeURIComponent(invite.host_user)}`}
                  className="h-7 px-2 inline-flex items-center text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-500 transition-colors"
                  onClick={() => { onDismissP2PInvite(invite.session_id); onClose(); }}
                >
                  Watch Now
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-muted-foreground"
                  onClick={() => onDismissP2PInvite(invite.session_id)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {watchInvites.length > 0 && (
        <div className="divide-y divide-border">
          {watchInvites.map((invite) => (
            <div key={invite.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Tv2 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">Watch Together invite</p>
                <p className="text-xs text-muted-foreground truncate">
                  {invite.external
                    ? `${invite.hostName} invited you to watch "${invite.external.title}" on ${invite.external.source === "plex" ? "Plex" : "Jellyfin"}`
                    : `${invite.hostName} invited you to watch`}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <a
                  href={invite.external ? `/watch-together/${invite.sessionId}` : `/video/${invite.videoId}?session=${invite.sessionId}`}
                  className="h-7 px-2 inline-flex items-center text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={() => { onDismissWatchInvite(invite.id); onClose(); }}
                >
                  Join
                </a>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
                  onClick={() => onDismissWatchInvite(invite.id)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {friendRequests.length > 0 && (
        <div className="divide-y divide-border">
          {friendRequests.map((req) => (
            <div key={req.requestId} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <UserPlus className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{reqName(req)}</p>
                <p className="text-xs text-muted-foreground">Friend request</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" className="h-7 px-2 text-xs" disabled={loadingId === `fr-${req.requestId}`}
                  onClick={() => void wrap(`fr-${req.requestId}`, () => onAcceptFriend(req.requestId))}>
                  <Check className="w-3 h-3 mr-1" /> Accept
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={loadingId === `fr-${req.requestId}`}
                  onClick={() => void wrap(`fr-${req.requestId}`, () => onDeclineFriend(req.requestId))}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {videoShares.length > 0 && (
        <div className="divide-y divide-border">
          {videoShares.map((share) => (
            <div key={share.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-7 rounded bg-muted shrink-0 overflow-hidden">
                {share.videoThumbnailUrl
                  ? <img src={share.videoThumbnailUrl} alt={share.videoTitle} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Film className="w-3 h-3 text-muted-foreground" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.videoTitle}</p>
                <p className="text-xs text-muted-foreground truncate">Video from {senderName(share)}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" className="h-7 px-2 text-xs" disabled={loadingId === `vs-${share.id}`}
                  onClick={() => void wrap(`vs-${share.id}`, () => onAddShare("video", share.id, share.videoTitle))}>Add</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={loadingId === `vs-${share.id}`}
                  onClick={() => void wrap(`vs-${share.id}`, () => onDismissShare("video", share.id))}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {playlistShares.length > 0 && (
        <div className="divide-y divide-border">
          {playlistShares.map((share) => (
            <div key={share.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ListVideo className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.playlistName}</p>
                <p className="text-xs text-muted-foreground truncate">Playlist from {senderName(share)} · {share.videoCount} video{share.videoCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" className="h-7 px-2 text-xs" disabled={loadingId === `ps-${share.id}`}
                  onClick={() => void wrap(`ps-${share.id}`, () => onAddShare("playlist", share.id, share.playlistName))}>Add</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={loadingId === `ps-${share.id}`}
                  onClick={() => void wrap(`ps-${share.id}`, () => onDismissShare("playlist", share.id))}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {categoryShares.length > 0 && (
        <div className="divide-y divide-border">
          {categoryShares.map((share) => (
            <div key={share.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Film className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.categoryName}</p>
                <p className="text-xs text-muted-foreground truncate">Category from {senderName(share)} · {share.videoCount} video{share.videoCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" className="h-7 px-2 text-xs" disabled={loadingId === `cs-${share.id}`}
                  onClick={() => void wrap(`cs-${share.id}`, () => onAddShare("category", share.id, share.categoryName))}>Add</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={loadingId === `cs-${share.id}`}
                  onClick={() => void wrap(`cs-${share.id}`, () => onDismissShare("category", share.id))}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {photoCategoryShares.length > 0 && (
        <div className="divide-y divide-border">
          {photoCategoryShares.map((share) => (
            <div key={share.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Share2 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.categoryName}</p>
                <p className="text-xs text-muted-foreground truncate">Photos from {senderName(share)} · {share.photoCount} photo{share.photoCount !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" className="h-7 px-2 text-xs" disabled={loadingId === `pcs-${share.id}`}
                  onClick={() => void wrap(`pcs-${share.id}`, () => onAddShare("photo-category", share.id, share.categoryName))}>Add</Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={loadingId === `pcs-${share.id}`}
                  onClick={() => void wrap(`pcs-${share.id}`, () => onDismissShare("photo-category", share.id))}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {vaultSourceShares.length > 0 && (
        <div className="divide-y divide-border">
          {vaultSourceShares.map((share) => {
            const label = VAULT_SOURCE_LIST_LABELS[share.listType] ?? share.listType;
            return (
              <div key={share.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Archive className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{label} sources</p>
                  <p className="text-xs text-muted-foreground truncate">From {senderName(share)} · {share.sourceCount} source{share.sourceCount !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" className="h-7 px-2 text-xs" disabled={loadingId === `vss-${share.id}`}
                    onClick={() => void wrap(`vss-${share.id}`, () => onAddShare("vault-source", share.id, label))}>Add</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" disabled={loadingId === `vss-${share.id}`}
                    onClick={() => void wrap(`vss-${share.id}`, () => onDismissShare("vault-source", share.id))}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Broken Links — always available ── */}
      <a
        href="/broken-links"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-accent/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Link2Off className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Broken Links</p>
          <p className="text-xs text-muted-foreground">Find &amp; remove dead videos from your library</p>
        </div>
      </a>

      {/* ── Intercom — always available, pinned above Help ── */}
      <a
        href="/intercom"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-accent/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Mic className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Intercom</p>
          <p className="text-xs text-muted-foreground">Voice chat &amp; communication</p>
        </div>
      </a>

      {/* ── Help — always available, pinned at the very bottom of the list ── */}
      <a
        href="/help"
        onClick={onClose}
        className="flex items-center gap-3 px-4 py-3 border-t border-border hover:bg-accent/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <HelpCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Help</p>
          <p className="text-xs text-muted-foreground">Search for answers or send us a message</p>
        </div>
      </a>
    </div>,
    document.body,
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { enabled: tvMode } = useTv();
  const { data: videoStats } = useGetVideoStats();
  const { data: photoStats } = useGetPhotoStats();
  const { data: musicCount } = useGetMusicCount({});
  const { data: unreadData } = useGetUnreadCount({ query: { queryKey: getGetUnreadCountQueryKey(), refetchInterval: 30_000 } });
  const unreadCount = unreadData?.count ?? 0;

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "My Account"
    : "My Account";

  const { toast } = useToast();


  const [activeWtSession, setActiveWtSession] = useState<{ sessionId: string; videoId: number | null; external: { title: string } | null } | null>(() => {
    try { const r = sessionStorage.getItem("wt-active-session"); return r ? JSON.parse(r) as { sessionId: string; videoId: number | null; external: { title: string } | null } : null; } catch { return null; }
  });
  useEffect(() => {
    const handler = () => {
      try { const r = sessionStorage.getItem("wt-active-session"); setActiveWtSession(r ? JSON.parse(r) as { sessionId: string; videoId: number | null; external: { title: string } | null } : null); } catch { setActiveWtSession(null); }
    };
    window.addEventListener("wt-session-change", handler);
    return () => window.removeEventListener("wt-session-change", handler);
  }, []);

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [videoShares, setVideoShares] = useState<VideoShare[]>([]);
  const [playlistShares, setPlaylistShares] = useState<PlaylistShare[]>([]);
  const [categoryShares, setCategoryShares] = useState<CategoryShare[]>([]);
  const [photoCategoryShares, setPhotoCategoryShares] = useState<PhotoCategoryShare[]>([]);
  const [vaultSourceShares, setVaultSourceShares] = useState<VaultSourceShare[]>([]);
  const [p2pInvites, setP2PInvites] = useState<P2PInvite[]>([]);
  const [gameInvites, setGameInvites] = useState<GameInvite[]>([]);
  const dismissedGameInviteIds = useRef<Set<string>>(new Set(
    JSON.parse(localStorage.getItem("dismissed_game_invite_ids") ?? "[]") as string[]
  ));
  const [cleanupNudge, setCleanupNudge] = useState<CleanupNudge | null>(null);
  // Separate from cleanupNudge -- that's null below a "worth nagging about"
  // threshold, but the permanent Trash row needs the real counts (including
  // zero) every time, not just once there's enough to bother mentioning.
  const [trashCounts, setTrashCounts] = useState<{ videos: number; photos: number } | null>(null);
  const [mediaInboxCount, setMediaInboxCount] = useState(0);
  const MEDIA_INBOX_NUDGE_THRESHOLD = 5;

  const [notifCount, setNotifCount] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const notifIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCounts = useRef<{ rq: number; sh: number; ps: number; cs: number; vss: number; wi: number; p2p: number; gi: number } | null>(null);

  const recalcCount = (
    rq: FriendRequest[],
    sh: VideoShare[],
    ps: PlaylistShare[],
    cs: CategoryShare[],
    pcs: PhotoCategoryShare[],
    vss: VaultSourceShare[],
    wi: number,
    p2p: number,
    gi: number,
  ) => rq.length + sh.length + ps.length + cs.length + pcs.length + vss.length + wi + p2p + gi;

  const [watchInvites, setWatchInvites] = useState<WatchInvite[]>([]);
  const dismissedInviteIds = useRef<Set<number>>(new Set(
    JSON.parse(localStorage.getItem("dismissed_watch_invite_ids") ?? "[]") as number[]
  ));
  const dismissedP2PIds = useRef<Set<string>>(new Set(
  JSON.parse(localStorage.getItem("dismissed_p2p_ids") ?? "[]") as string[]
));

  useEffect(() => {
    if (!user) return;

    const checkNotifs = async () => {
      try {
        const [rqData, shData, psData, csData, pcsData, vssData, wiData, p2pData, giData] = await Promise.all([
          fetch("/api/friends/requests", { credentials: "include" }).then((r) => r.ok ? r.json() : { incoming: [] }) as Promise<{ incoming: FriendRequest[] }>,
          fetch("/api/video-shares", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<VideoShare[]>,
          fetch("/api/playlist-shares", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<PlaylistShare[]>,
          fetch("/api/category-shares", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<CategoryShare[]>,
          fetch("/api/photo-category-shares", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<PhotoCategoryShare[]>,
          fetch("/api/vault-source-shares", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<VaultSourceShare[]>,
          fetch("/api/watch-invites", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<WatchInvite[]>,
          fetch("/api/p2p/my-sessions", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<P2PInvite[]>,
          fetch("/api/game-invites", { credentials: "include" }).then((r) => r.ok ? r.json() : []) as Promise<GameInvite[]>,
        ]);

        const rq = rqData.incoming ?? [];
        const sh = shData ?? [];
        const ps = psData ?? [];
        const cs = csData ?? [];
        const pcs = pcsData ?? [];
        const vss = vssData ?? [];
        const wi = (wiData ?? []).filter((i) => !dismissedInviteIds.current.has(i.id));
        const p2p = (p2pData ?? []).filter((i) => !dismissedP2PIds.current.has(i.session_id));
        const gi = (giData ?? []).filter((i) => !dismissedGameInviteIds.current.has(`${i.type}-${i.id}`));

        const counts = { rq: rq.length, sh: sh.length, ps: ps.length, cs: cs.length, vss: vss.length, wi: wi.length, p2p: p2p.length, gi: gi.length };

        if (prevCounts.current !== null) {
          const prev = prevCounts.current;
          if (counts.rq > prev.rq) { const n = counts.rq - prev.rq; toast({ title: `Friend request${n > 1 ? "s" : ""}`, description: `You have ${n} new friend request${n > 1 ? "s" : ""}.` }); }
          if (counts.sh > prev.sh) { const n = counts.sh - prev.sh; toast({ title: `Video${n > 1 ? "s" : ""} shared with you`, description: `${n} new video${n > 1 ? "s have" : " has"} been shared with you.` }); }
          if (counts.ps > prev.ps) { const n = counts.ps - prev.ps; toast({ title: `Playlist${n > 1 ? "s" : ""} shared with you`, description: `${n} new playlist${n > 1 ? "s have" : " has"} been shared with you.` }); }
          if (counts.cs > prev.cs) { const n = counts.cs - prev.cs; toast({ title: `Categor${n > 1 ? "ies" : "y"} shared with you`, description: `${n} new categor${n > 1 ? "ies have" : "y has"} been shared with you.` }); }
          if (counts.vss > prev.vss) { const n = counts.vss - prev.vss; toast({ title: `Vault source${n > 1 ? "s" : ""} shared with you`, description: `${n} new vault source${n > 1 ? "s have" : " has"} been shared with you.` }); }
          if (counts.wi > prev.wi && wi.length) { toast({ title: "Watch Together invite", description: `${wi[0].hostName} invited you to watch together.` }); }
          if (counts.p2p > prev.p2p && p2p.length) {
            toast({
              title: "🎬 Live stream available",
              description: `${p2p[0].host_user} is streaming "${p2p[0].title}" — click the notification bell to watch.`,
            });
          }
          if (counts.gi > prev.gi && gi.length) {
            const newest = gi[gi.length - 1];
            if (newest.type === "caption-duel-result") {
              toast({
                title: "Caption Duel — rate it!",
                description: `${newest.opponentEmail} captioned your photo — give it a rating!`,
              });
            } else if (newest.type === "caption-duel-counter") {
              toast({
                title: "Caption Duel — verdict is in!",
                description: "They rated your caption. See what they thought!",
              });
            } else {
              const sender = gameInviteSender(newest);
              toast({
                title: newest.type === "caption-duel" ? "Caption Duel challenge!" : "Movie Bracket challenge!",
                description: `${sender} challenged you — check your notifications.`,
              });
            }
          }
        }

        prevCounts.current = counts;
        setFriendRequests(rq);
        setVideoShares(sh);
        setPlaylistShares(ps);
        setCategoryShares(cs);
        setPhotoCategoryShares(pcs);
        setVaultSourceShares(vss);
        setWatchInvites(wi);
        setP2PInvites(p2p);
        setGameInvites(gi);
        setNotifCount(recalcCount(rq, sh, ps, cs, pcs, vss, wi.length, p2p.length, gi.length));
      } catch { /* silent */ }
    };

    void checkNotifs();
    notifIntervalRef.current = setInterval(() => { void checkNotifs(); }, 30_000);
    return () => { if (notifIntervalRef.current) clearInterval(notifIntervalRef.current); };
  }, [user]);

  // Cleanup nudge — checked once per load, not on the 30s poll, since these
  // counts don't need to be real-time and the query is heavier than the
  // share/invite checks above. A fresh check can also be forced (bypassing
  // the snooze) by dispatching "urlinc:recheck-cleanup" -- the trash/
  // duplicates pages do this right after a successful restore/purge/delete,
  // so the reminder doesn't sit stale until the next full page load.
  const checkCleanup = useCallback(async (opts?: { skipSnooze?: boolean }) => {
    // The snooze only ever applied to whether the nudge CARD pops back up --
    // the permanent Trash row's counts need to stay accurate regardless, so
    // this no longer bails out of the fetch entirely while snoozed.
    let isSnoozed = false;
    if (!opts?.skipSnooze) {
      const snoozedUntil = localStorage.getItem(CLEANUP_NUDGE_SNOOZE_KEY);
      isSnoozed = !!snoozedUntil && new Date(snoozedUntil).getTime() > Date.now();
    }
    try {
      const [videoSummary, photoSummary] = await Promise.all([
        fetch("/api/videos/cleanup-summary", { credentials: "include" })
          .then((r) => r.ok ? r.json() : { duplicateVideos: 0, trashedVideos: 0, mediaInboxCount: 0 }) as Promise<{ duplicateVideos: number; trashedVideos: number; mediaInboxCount: number }>,
        fetch("/api/photos/cleanup-summary", { credentials: "include" })
          .then((r) => r.ok ? r.json() : { duplicatePhotos: 0, trashedPhotos: 0 }) as Promise<{ duplicatePhotos: number; trashedPhotos: number }>,
      ]);
      const duplicateCount = videoSummary.duplicateVideos + photoSummary.duplicatePhotos;
      const trashedCount = videoSummary.trashedVideos + photoSummary.trashedPhotos;
      setTrashCounts({ videos: videoSummary.trashedVideos, photos: photoSummary.trashedPhotos });
      setMediaInboxCount(videoSummary.mediaInboxCount ?? 0);
      if (!isSnoozed && (duplicateCount >= CLEANUP_NUDGE_DUPLICATE_THRESHOLD || trashedCount >= CLEANUP_NUDGE_TRASH_THRESHOLD)) {
        setCleanupNudge({
          duplicateCount,
          trashedCount,
          trashedVideos: videoSummary.trashedVideos,
          trashedPhotos: photoSummary.trashedPhotos,
        });
      } else {
        setCleanupNudge(null);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    void checkCleanup();
  }, [user, checkCleanup]);

  useEffect(() => {
    const handler = () => { void checkCleanup({ skipSnooze: true }); };
    window.addEventListener("urlinc:recheck-cleanup", handler);
    return () => window.removeEventListener("urlinc:recheck-cleanup", handler);
  }, [checkCleanup]);

  const handleDismissCleanupNudge = () => {
    const snoozeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(CLEANUP_NUDGE_SNOOZE_KEY, snoozeUntil);
    setCleanupNudge(null);
  };

  const mediaInboxNudge = mediaInboxCount >= MEDIA_INBOX_NUDGE_THRESHOLD;
  const hasNotif = notifCount > 0 || unreadCount > 0 || cleanupNudge !== null || mediaInboxNudge;
  const dotCount = notifCount + unreadCount + (cleanupNudge ? 1 : 0) + (mediaInboxNudge ? 1 : 0);

  // Mirror the notification bell's count onto the browser tab itself, the
  // same way Gmail/Facebook prefix their tab title with "(N)" -- so an
  // alert is noticeable even when this isn't the active tab. Sidebar is
  // mounted for the whole app session, so this naturally stays in sync
  // with dotCount everywhere without any page needing to know about it.
  useEffect(() => {
    document.title = dotCount > 0 ? `(${dotCount}) URLinc` : "URLinc";
    return () => { document.title = "URLinc"; };
  }, [dotCount]);

  const handleAcceptFriend = async (id: number) => {
    const res = await fetch(`/api/friends/requests/${id}/accept`, { method: "POST", credentials: "include" });
    if (res.ok) {
      toast({ title: "Friend accepted!" });
      setFriendRequests((prev) => { const next = prev.filter((r) => r.requestId !== id); setNotifCount(recalcCount(next, videoShares, playlistShares, categoryShares, photoCategoryShares, vaultSourceShares, watchInvites.length, p2pInvites.length)); return next; });
    } else { toast({ title: "Failed to accept", variant: "destructive" }); }
  };

  const handleDeclineFriend = async (id: number) => {
    await fetch(`/api/friends/requests/${id}`, { method: "DELETE", credentials: "include" });
    setFriendRequests((prev) => { const next = prev.filter((r) => r.requestId !== id); setNotifCount(recalcCount(next, videoShares, playlistShares, categoryShares, photoCategoryShares, vaultSourceShares, watchInvites.length, p2pInvites.length)); return next; });
  };

  const handleAddShare = async (type: "video" | "playlist" | "category" | "photo-category" | "vault-source", id: number, label: string) => {
    const endpoints: Record<string, string> = { video: `/api/video-shares/${id}/add`, playlist: `/api/playlist-shares/${id}/add`, category: `/api/category-shares/${id}/add`, "photo-category": `/api/photo-category-shares/${id}/add`, "vault-source": `/api/vault-source-shares/${id}/add` };
    const res = await fetch(endpoints[type], { method: "POST", credentials: "include" });
    const data = await res.json() as { message?: string };
    if (res.ok) { toast({ title: data.message ?? `"${label}" added` }); removeShare(type, id); }
    else { toast({ title: "Failed to add", variant: "destructive" }); }
  };

  const handleDismissShare = async (type: "video" | "playlist" | "category" | "photo-category" | "vault-source", id: number) => {
    const endpoints: Record<string, string> = { video: `/api/video-shares/${id}`, playlist: `/api/playlist-shares/${id}`, category: `/api/category-shares/${id}`, "photo-category": `/api/photo-category-shares/${id}`, "vault-source": `/api/vault-source-shares/${id}` };
    await fetch(endpoints[type], { method: "DELETE", credentials: "include" });
    removeShare(type, id);
  };

  const removeShare = (type: "video" | "playlist" | "category" | "photo-category" | "vault-source", id: number) => {
    if (type === "video") setVideoShares((prev) => { const next = prev.filter((s) => s.id !== id); setNotifCount(recalcCount(friendRequests, next, playlistShares, categoryShares, photoCategoryShares, vaultSourceShares, watchInvites.length, p2pInvites.length)); return next; });
    else if (type === "playlist") setPlaylistShares((prev) => { const next = prev.filter((s) => s.id !== id); setNotifCount(recalcCount(friendRequests, videoShares, next, categoryShares, photoCategoryShares, vaultSourceShares, watchInvites.length, p2pInvites.length)); return next; });
    else if (type === "category") setCategoryShares((prev) => { const next = prev.filter((s) => s.id !== id); setNotifCount(recalcCount(friendRequests, videoShares, playlistShares, next, photoCategoryShares, vaultSourceShares, watchInvites.length, p2pInvites.length)); return next; });
    else if (type === "photo-category") setPhotoCategoryShares((prev) => { const next = prev.filter((s) => s.id !== id); setNotifCount(recalcCount(friendRequests, videoShares, playlistShares, categoryShares, next, vaultSourceShares, watchInvites.length, p2pInvites.length)); return next; });
    else setVaultSourceShares((prev) => { const next = prev.filter((s) => s.id !== id); setNotifCount(recalcCount(friendRequests, videoShares, playlistShares, categoryShares, photoCategoryShares, next, watchInvites.length, p2pInvites.length)); return next; });
  };

  const handleDismissWatchInvite = (id: number) => {
    dismissedInviteIds.current.add(id);
    localStorage.setItem("dismissed_watch_invite_ids", JSON.stringify([...dismissedInviteIds.current]));
    setWatchInvites((prev) => {
      const next = prev.filter((i) => i.id !== id);
      setNotifCount(recalcCount(friendRequests, videoShares, playlistShares, categoryShares, photoCategoryShares, vaultSourceShares, next.length, p2pInvites.length, gameInvites.length));
      return next;
    });
  };

  const handleDismissP2PInvite = (sessionId: string) => {
    dismissedP2PIds.current.add(sessionId);
    localStorage.setItem("dismissed_p2p_ids", JSON.stringify([...dismissedP2PIds.current]));
    setP2PInvites((prev) => {
      const next = prev.filter((i) => i.session_id !== sessionId);
      setNotifCount(recalcCount(friendRequests, videoShares, playlistShares, categoryShares, photoCategoryShares, vaultSourceShares, watchInvites.length, next.length, gameInvites.length));
      return next;
    });
  };

  const handleDismissGameInvite = (type: "caption-duel" | "caption-duel-result" | "caption-duel-counter" | "movie-bracket" | "movie-bracket-vote" | "movie-bracket-complete" | "movie-bracket-note-update", id: number) => {
    const key = `${type}-${id}`;
    dismissedGameInviteIds.current.add(key);
    localStorage.setItem("dismissed_game_invite_ids", JSON.stringify([...dismissedGameInviteIds.current]));
    setGameInvites((prev) => {
      const next = prev.filter((i) => !(i.type === type && i.id === id));
      setNotifCount(recalcCount(friendRequests, videoShares, playlistShares, categoryShares, photoCategoryShares, vaultSourceShares, watchInvites.length, p2pInvites.length, next.length));
      return next;
    });
  };

  return (
    <aside className="w-64 border-r border-border bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50 flex flex-col h-screen sticky top-0">
      <div className="px-4 pt-6 pb-2 flex flex-col items-center">
        <div
          className={`relative rounded-lg transition-all cursor-pointer`}
          style={hasNotif ? { boxShadow: "0 0 18px 6px rgba(251, 191, 36, 0.5)" } : undefined}
          role="button"
          tabIndex={0}
          title={hasNotif ? `${dotCount} new alert${dotCount !== 1 ? "s" : ""} — click to view` : "Notifications"}
          onClick={() => setPopoverOpen((o) => !o)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPopoverOpen((o) => !o); } }}
        >
          <div className="flex items-center justify-center hover:opacity-80 transition-opacity">
            <div className="h-[116px] w-[220px] overflow-hidden flex items-center justify-center">
              <img src="/urlair-logo.png?v=3" alt="URLinc" className="w-full h-full object-contain" />
            </div>
          </div>
          {hasNotif && (
            <div
              className="absolute top-2 right-2 min-w-[1.375rem] h-[1.375rem] flex items-center justify-center rounded-full bg-green-500 text-white text-[10px] font-bold px-1.5 leading-none shadow-sm pointer-events-none"
            >
              {dotCount}
            </div>
          )}
          {popoverOpen && (
            <NotificationPopover
              friendRequests={friendRequests}
              videoShares={videoShares}
              playlistShares={playlistShares}
              categoryShares={categoryShares}
              photoCategoryShares={photoCategoryShares}
              vaultSourceShares={vaultSourceShares}
              watchInvites={watchInvites}
              p2pInvites={p2pInvites}
              gameInvites={gameInvites}
              cleanupNudge={cleanupNudge}
              trashCounts={trashCounts}
              mediaInboxCount={mediaInboxCount}
              unreadMessageCount={unreadCount}
              onAcceptFriend={handleAcceptFriend}
              onDeclineFriend={handleDeclineFriend}
              onAddShare={handleAddShare}
              onDismissShare={handleDismissShare}
              onDismissWatchInvite={handleDismissWatchInvite}
              onDismissP2PInvite={handleDismissP2PInvite}
              onDismissGameInvite={handleDismissGameInvite}
              onDismissCleanupNudge={handleDismissCleanupNudge}
              onClose={() => setPopoverOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Active Watch Together session — shown when navigated away from the video */}
      {activeWtSession && (() => {
        const sessionHref = activeWtSession.videoId
          ? `/video/${activeWtSession.videoId}`
          : null;
        const label = activeWtSession.external?.title ?? "Watch Together";
        return sessionHref ? (
          <div className="px-3 pt-2 pb-1">
            <Link
              href={sessionHref}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors text-sm font-medium w-full"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="truncate">{label}</span>
              <span className="ml-auto text-[10px] font-normal opacity-70 shrink-0">Return</span>
            </Link>
          </div>
        ) : null;
      })()}

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {([
          { href: "/",        label: "My Videos", icon: Film,       badge: videoStats?.total },
          { href: "/music",   label: "My Audio",  icon: Headphones, badge: musicCount?.total },
          { href: "/photos",       label: "My Vault",     icon: Archive,  badge: photoStats?.total },
          { href: "/wish-list",    label: "Wish List",    icon: Star },
          { href: "/day-plan",     label: "UR🔗Day",      icon: Compass },
          { href: "/settings",     label: "Settings",     icon: Settings },
          ...(user?.isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
        ] as { href: string; label: string; icon: React.ElementType; badge?: number; externalUrl?: string }[]).map(({ href, label, icon: Icon, badge, externalUrl }) => {
          const active =
            href === "/"
              ? (location === "/" || location.startsWith("/video/") || location.startsWith("/playlists/") || location === "/manage" || location === "/add")
              : href === "/music"
              ? (location.startsWith("/music") || location === "/manage-music" || location === "/add-music" || location === "/music/browse-radio")
              : href === "/photos"
              ? (location.startsWith("/photos") || location.startsWith("/albums") || location === "/add-photo" || location === "/manage-photos" || location === "/duplicates")
              : (location === href || location.startsWith(href + "/"));
          const cls = `flex items-center gap-3 px-3 rounded-lg transition-all ${
            tvMode ? "py-3.5 text-base" : "py-2.5"
          } ${
            active
              ? "bg-primary/10 text-primary font-semibold"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          }`;
          const inner = (
            <>
              <Icon className={tvMode ? "w-6 h-6 shrink-0" : "w-5 h-5 shrink-0"} />
              <span className="text-sm">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{badge.toLocaleString()}</span>
              )}
            </>
          );
          return externalUrl ? (
            <a key={href} href={externalUrl} target="_blank" rel="noopener noreferrer" className={cls}>
              {inner}
            </a>
          ) : (
            <Link key={href} href={href} data-tv-nav={tvMode ? "true" : undefined} className={cls}>
              {inner}
            </Link>
          );
        })}
      </nav>

      {/* Support button */}
      <div className="px-3 pb-2">
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all text-sm"
        >
          <Heart className="w-5 h-5 shrink-0" />
          <span>Support URLinc</span>
        </a>
      </div>

      <div className="px-3 pb-4 pt-2 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-accent/30 transition-colors">
          {user?.profileImageUrl ? (
            <img src={user.profileImageUrl} alt={displayName} className="w-8 h-8 rounded-full object-cover ring-1 ring-border flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">{displayName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <span className="text-sm font-medium truncate flex-1 text-foreground">{displayName}</span>
          <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={logout} title="Sign out" data-testid="button-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

    </aside>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { settings } = useScreensaverSettings();
  const [screensaverActive, setScreensaverActive] = useState(false);
  const currentTrack = useCurrentTrack();
  const player = useMusicPlayer();
  const playerVisible = !!currentTrack && !player.minimized;

  const handleActivate = () => {
    if (settings.enabled && settings.albumId) setScreensaverActive(true);
  };

  const { dismiss } = useScreensaverTimer(
    settings.enabled && !!settings.albumId,
    settings.inactivityMinutes,
    handleActivate,
  );

  const handleDismiss = () => {
    setScreensaverActive(false);
    dismiss();
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <div className="flex flex-1 overflow-hidden min-h-0">
        <Sidebar />
        <main id="main-scroll" className={`flex-1 overflow-y-auto min-w-0${playerVisible ? " pb-[72px]" : ""}`}>
          {children}
        </main>
      </div>
      <MusicPlayerBar />

      {screensaverActive && (
        <PhotoScreensaver
          settings={settings}
          onDismiss={handleDismiss}
        />
      )}

    </div>
  );
}
