const SUPPORT_URL = "https://buy.stripe.com/eVq9AL9mK12k2Mf4P1d3i00";

import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-settings";
import { useTheme } from "@/hooks/use-theme";
import { useTv } from "@/hooks/use-tv";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  useListPlaylists,
  useCreatePlaylist,
  useUpdatePlaylist,
  useDeletePlaylist,
  useListCategories,
  getListPlaylistsQueryKey,
  getListCategoriesQueryKey,
  getListVideosQueryKey,
  getGetVideoStatsQueryKey,
  getGetRecentVideosQueryKey,
  getListPhotosQueryKey,
  getGetPhotoStatsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Settings,
  Copy,
  Wrench,
  Tv2,
  ListVideo,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Palette,
  Sun,
  Moon,
  SunMoon,
  RotateCcw,
  ChevronDown,
  Download,
  Upload,
  Film,
  FolderOpen,
  Users,
  UserPlus,
  UserX,
  Share2,
  Bell,
  Send,
  AtSign,
  Info,
  Coffee,
  ImageIcon,
  Sparkles,
  Images,
  Music2,
  Server,
  Link2,
  Link2Off,
  Loader2,
  Eye,
  EyeOff,
  Link,
  Key,
  Puzzle,
  Archive,
  Shield,
  TriangleAlert,
  BarChart2,
} from "lucide-react";
import { type ColorMode } from "@/hooks/use-theme";
import { useTabSolidColor, useTabCardOpacity, useLibraryColoredText } from "@/hooks/useMusicBackground";
import { useScreensaverSettings } from "@/hooks/useScreensaver";
import { useListMusicPlaylists } from "@workspace/api-client-react";
import { useCreativeTheme, type CreativeTheme } from "@/hooks/use-creative-theme";

function hueLabel(h: number): string {
  if (h < 15 || h >= 345) return "Red";
  if (h < 40)  return "Orange";
  if (h < 70)  return "Yellow";
  if (h < 150) return "Green";
  if (h < 195) return "Teal";
  if (h < 255) return "Blue";
  if (h < 290) return "Indigo";
  if (h < 320) return "Purple";
  return "Pink";
}


type LibraryExport = {
  version: number;
  exportedAt: string;
  videos: Array<{ title: string; youtubeUrl: string; category: string; description?: string | null; thumbnailUrl?: string | null }>;
  playlists: Array<{ name: string; description?: string | null; videoUrls: string[] }>;
};

type PhotoExport = {
  version: number;
  exportedAt: string;
  photos: Array<{ title: string; category: string; imageUrl: string; sourceUrl?: string | null; description?: string | null }>;
};

type MusicExport = {
  version: number;
  exportedAt: string;
  tracks: Array<{ title: string; artist?: string | null; audioUrl: string; coverImageUrl?: string | null; durationSeconds?: number | null }>;
  playlists: Array<{ name: string; description?: string | null; trackUrls: string[] }>;
};

type Friend = { id: string; email: string; firstName: string | null; lastName: string | null; friendshipId: number };
type FriendRequest = { requestId: number; user: { id: string; email: string; firstName: string | null; lastName: string | null } | undefined; createdAt: string };
type VideoShare = { id: number; senderId: string; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; createdAt: string; videoId: number; videoTitle: string; videoYoutubeUrl: string; videoThumbnailUrl: string | null; videoCategory: string };
type PlaylistShare = { id: number; senderId: string; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; createdAt: string; playlistId: number; playlistName: string; playlistDescription: string | null; videoCount: number };
type CategoryShare = { id: number; senderId: string; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; createdAt: string; categoryName: string; videoCount: number };
type PhotoCategoryShare = { id: number; senderId: string; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; createdAt: string; categoryName: string; photoCount: number };
type VaultSourceShare = { id: number; senderId: string; senderEmail: string; senderFirstName: string | null; senderLastName: string | null; message: string | null; createdAt: string; listType: string; sourceCount: number };
const VAULT_SOURCE_LIST_LABELS: Record<string, string> = {
  streaming: "Streaming Services",
  "vault-games": "Games",
  "vault-reading": "Reading",
  "vault-stories": "Stories",
};

function displayName(u: { email: string; firstName?: string | null; lastName?: string | null }) {
  if (u.firstName || u.lastName) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return u.email;
}

function FriendsSection() {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [fr, rq] = await Promise.all([
        fetch("/api/friends", { credentials: "include" }).then((r) => r.json()) as Promise<Friend[]>,
        fetch("/api/friends/requests", { credentials: "include" }).then((r) => r.json()) as Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>,
      ]);
      setFriends(fr);
      setIncoming(rq.incoming ?? []);
      setOutgoing(rq.outgoing ?? []);
    } catch { toast({ title: "Failed to load friends", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleSend = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setSending(true);
    try {
      const res = await fetch("/api/friends/request", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: e }) });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        if (res.status === 404 && (data.error ?? "").includes("No account found")) {
          setInviteEmail(e);
          return;
        }
        toast({ title: data.error ?? "Failed to send request", variant: "destructive" });
        return;
      }
      toast({ title: "Friend request sent!" });
      setEmail(""); void load();
    } finally { setSending(false); }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      const res = await fetch("/api/friends/invite", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail }) });
      if (res.ok) {
        toast({ title: `Invitation sent to ${inviteEmail}!` });
        setEmail("");
        setInviteEmail(null);
      } else {
        let errorMsg = "Failed to send invitation";
        try { const data = await res.json() as { error?: string }; errorMsg = data.error ?? errorMsg; } catch { /* non-JSON body */ }
        toast({ title: errorMsg, variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to send invitation", variant: "destructive" });
    } finally { setInviting(false); }
  };

  const handleAccept = async (id: number) => {
    const res = await fetch(`/api/friends/requests/${id}/accept`, { method: "POST", credentials: "include" });
    if (res.ok) { toast({ title: "Friend accepted!" }); void load(); }
    else toast({ title: "Failed to accept", variant: "destructive" });
  };

  const handleDecline = async (id: number) => {
    await fetch(`/api/friends/requests/${id}`, { method: "DELETE", credentials: "include" });
    void load();
  };

  const handleRemove = async (friendshipId: number, name: string) => {
    const res = await fetch(`/api/friends/${friendshipId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) { toast({ title: `Removed ${name}` }); void load(); }
    else toast({ title: "Failed to remove", variant: "destructive" });
  };

  return (
    <section id="notifications">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Users className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">Friends</h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        <div className="px-6 py-5">
          <p className="font-medium text-sm mb-0.5">Add a Friend</p>
          <p className="text-xs text-muted-foreground mb-3">Enter the email address they use to sign in to URLinc.</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setInviteEmail(null); }}
                onKeyDown={(e) => e.key === "Enter" && void handleSend()}
                placeholder="friend@example.com"
                className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <Button size="sm" onClick={() => void handleSend()} disabled={sending || !email.trim()}>
              <Send className="w-4 h-4 mr-2" />
              {sending ? "Sending…" : "Send Request"}
            </Button>
          </div>
          {inviteEmail && (
            <div className="mt-3 p-4 bg-muted/40 border border-border rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">
                No URLinc account found for <span className="font-medium text-foreground">{inviteEmail}</span>. Would you like to send them an invitation?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleSendInvite()} disabled={inviting}>
                  {inviting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Sending…</> : "Send Invite"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setInviteEmail(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        {incoming.length > 0 && (
          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              Incoming Requests
              <span className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">{incoming.length}</span>
            </p>
            <div className="space-y-2">
              {incoming.map((req) => (
                <div key={req.requestId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{req.user ? displayName(req.user) : "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">{req.user?.email}</p>
                  </div>
                  <Button size="sm" onClick={() => void handleAccept(req.requestId)}>Accept</Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void handleDecline(req.requestId)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {outgoing.length > 0 && (
          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-3 text-muted-foreground">Pending</p>
            <div className="space-y-2">
              {outgoing.map((req) => (
                <div key={req.requestId} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Send className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{req.user?.email ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">Awaiting response</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => void handleDecline(req.requestId)}>Cancel</Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-6 py-5">
          {loading && friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">No friends yet. Send a request above to get started.</p>
          ) : (
            <>
              <p className="font-medium text-sm mb-3">{friends.length} Friend{friends.length !== 1 ? "s" : ""}</p>
              <div className="space-y-1">
                {friends.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 py-1 group">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{displayName(f)}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.email}</p>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      title="Remove friend"
                      onClick={() => void handleRemove(f.friendshipId, displayName(f))}
                    >
                      <UserX className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </section>
  );
}

function SharedVideosSection() {
  const { toast } = useToast();
  const [shares, setShares] = useState<VideoShare[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/video-shares", { credentials: "include" });
      setShares(await res.json() as VideoShare[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  if (!loading && shares.length === 0) return null;

  const handleAdd = async (shareId: number, title: string) => {
    setLoadingId(shareId);
    try {
      const res = await fetch(`/api/video-shares/${shareId}/add`, { method: "POST", credentials: "include" });
      const data = await res.json() as { message?: string };
      if (res.ok) { toast({ title: data.message ?? `"${title}" added` }); void load(); }
      else toast({ title: "Failed to add video", variant: "destructive" });
    } finally {
      setLoadingId(null);
    }
  };

  const handleDismiss = async (shareId: number) => {
    await fetch(`/api/video-shares/${shareId}`, { method: "DELETE", credentials: "include" });
    void load();
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Share2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">Shared with Me</h2>
          {shares.length > 0 && <span className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">{shares.length}</span>}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {loading ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">Loading…</div>
        ) : shares.map((share) => {
          const sender = share.senderFirstName || share.senderLastName ? `${share.senderFirstName ?? ""} ${share.senderLastName ?? ""}`.trim() : share.senderEmail;
          return (
            <div key={share.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-24 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                {share.videoThumbnailUrl
                  ? <img src={share.videoThumbnailUrl} alt={share.videoTitle} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No thumb</div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.videoTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">From {sender}</p>
                {share.message && <p className="text-xs text-muted-foreground/70 italic mt-0.5 truncate">"{share.message}"</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" disabled={loadingId === share.id} onClick={() => void handleAdd(share.id, share.videoTitle)}>
                  {loadingId === share.id ? "Adding…" : "Add to Library"}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={loadingId === share.id} onClick={() => void handleDismiss(share.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

function SharedPlaylistsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shares, setShares] = useState<PlaylistShare[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/playlist-shares", { credentials: "include" });
      setShares(await res.json() as PlaylistShare[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  if (!loading && shares.length === 0) return null;

  const handleAdd = async (shareId: number, name: string) => {
    setLoadingId(shareId);
    try {
      const res = await fetch(`/api/playlist-shares/${shareId}/add`, { method: "POST", credentials: "include" });
      const data = await res.json() as { message?: string };
      if (res.ok) {
        toast({ title: data.message ?? `"${name}" added` });
        await queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
        void load();
      } else {
        toast({ title: "Failed to add playlist", variant: "destructive" });
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDismiss = async (shareId: number) => {
    await fetch(`/api/playlist-shares/${shareId}`, { method: "DELETE", credentials: "include" });
    void load();
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <ListVideo className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">Playlists Shared with Me</h2>
          {shares.length > 0 && <span className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">{shares.length}</span>}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {loading ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">Loading…</div>
        ) : shares.map((share) => {
          const sender = share.senderFirstName || share.senderLastName
            ? `${share.senderFirstName ?? ""} ${share.senderLastName ?? ""}`.trim()
            : share.senderEmail;
          return (
            <div key={share.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ListVideo className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.playlistName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From {sender} · {share.videoCount} video{share.videoCount !== 1 ? "s" : ""}
                </p>
                {share.message && <p className="text-xs text-muted-foreground/70 italic mt-0.5 truncate">"{share.message}"</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" disabled={loadingId === share.id} onClick={() => void handleAdd(share.id, share.playlistName)}>
                  {loadingId === share.id ? "Adding…" : "Add to Library"}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={loadingId === share.id} onClick={() => void handleDismiss(share.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

function SharedCategoriesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shares, setShares] = useState<CategoryShare[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/category-shares", { credentials: "include" });
      setShares(await res.json() as CategoryShare[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  if (!loading && shares.length === 0) return null;

  const handleAdd = async (shareId: number, name: string) => {
    setLoadingId(shareId);
    try {
      const res = await fetch(`/api/category-shares/${shareId}/add`, { method: "POST", credentials: "include" });
      const data = await res.json() as { message?: string };
      if (res.ok) {
        toast({ title: data.message ?? `"${name}" added` });
        await queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
        void load();
      } else {
        toast({ title: "Failed to add category", variant: "destructive" });
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDismiss = async (shareId: number) => {
    await fetch(`/api/category-shares/${shareId}`, { method: "DELETE", credentials: "include" });
    void load();
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Film className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">Categories Shared with Me</h2>
          {shares.length > 0 && <span className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">{shares.length}</span>}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {loading ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">Loading…</div>
        ) : shares.map((share) => {
          const sender = share.senderFirstName || share.senderLastName
            ? `${share.senderFirstName ?? ""} ${share.senderLastName ?? ""}`.trim()
            : share.senderEmail;
          return (
            <div key={share.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Film className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.categoryName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From {sender} · {share.videoCount} video{share.videoCount !== 1 ? "s" : ""}
                </p>
                {share.message && <p className="text-xs text-muted-foreground/70 italic mt-0.5 truncate">"{share.message}"</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" disabled={loadingId === share.id} onClick={() => void handleAdd(share.id, share.categoryName)}>
                  {loadingId === share.id ? "Adding…" : "Add to Library"}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={loadingId === share.id} onClick={() => void handleDismiss(share.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

function SharedPhotoCategoriesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [shares, setShares] = useState<PhotoCategoryShare[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/photo-category-shares", { credentials: "include" });
      setShares(await res.json() as PhotoCategoryShare[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  if (!loading && shares.length === 0) return null;

  const handleAdd = async (shareId: number, name: string) => {
    setLoadingId(shareId);
    try {
      const res = await fetch(`/api/photo-category-shares/${shareId}/add`, { method: "POST", credentials: "include" });
      const data = await res.json() as { message?: string };
      if (res.ok) {
        toast({ title: data.message ?? `"${name}" added` });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() }),
        ]);
        void load();
      } else {
        toast({ title: "Failed to add photos", variant: "destructive" });
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDismiss = async (shareId: number) => {
    await fetch(`/api/photo-category-shares/${shareId}`, { method: "DELETE", credentials: "include" });
    void load();
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">Photo Categories Shared with Me</h2>
          {shares.length > 0 && <span className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">{shares.length}</span>}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {loading ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">Loading…</div>
        ) : shares.map((share) => {
          const sender = share.senderFirstName || share.senderLastName
            ? `${share.senderFirstName ?? ""} ${share.senderLastName ?? ""}`.trim()
            : share.senderEmail;
          return (
            <div key={share.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <ImageIcon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{share.categoryName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From {sender} · {share.photoCount} photo{share.photoCount !== 1 ? "s" : ""}
                </p>
                {share.message && <p className="text-xs text-muted-foreground/70 italic mt-0.5 truncate">"{share.message}"</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" disabled={loadingId === share.id} onClick={() => void handleAdd(share.id, share.categoryName)}>
                  {loadingId === share.id ? "Adding…" : "Add to Photos"}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={loadingId === share.id} onClick={() => void handleDismiss(share.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

function SharedVaultSourcesSection() {
  const { toast } = useToast();
  const [shares, setShares] = useState<VaultSourceShare[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/vault-source-shares", { credentials: "include" });
      setShares(await res.json() as VaultSourceShare[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  if (!loading && shares.length === 0) return null;

  const handleAdd = async (shareId: number, label: string) => {
    setLoadingId(shareId);
    try {
      const res = await fetch(`/api/vault-source-shares/${shareId}/add`, { method: "POST", credentials: "include" });
      const data = await res.json() as { message?: string };
      if (res.ok) {
        toast({ title: data.message ?? `"${label}" added` });
        void load();
      } else {
        toast({ title: "Failed to add sources", variant: "destructive" });
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleDismiss = async (shareId: number) => {
    await fetch(`/api/vault-source-shares/${shareId}`, { method: "DELETE", credentials: "include" });
    void load();
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Archive className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">Vault Sources Shared with Me</h2>
          {shares.length > 0 && <span className="bg-primary text-primary-foreground text-xs font-semibold rounded-full px-1.5 py-0.5 leading-none">{shares.length}</span>}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {loading ? (
          <div className="px-6 py-5 text-sm text-muted-foreground">Loading…</div>
        ) : shares.map((share) => {
          const sender = share.senderFirstName || share.senderLastName
            ? `${share.senderFirstName ?? ""} ${share.senderLastName ?? ""}`.trim()
            : share.senderEmail;
          const label = VAULT_SOURCE_LIST_LABELS[share.listType] ?? share.listType;
          return (
            <div key={share.id} className="flex items-center gap-4 px-5 py-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Archive className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{label} sources</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From {sender} · {share.sourceCount} source{share.sourceCount !== 1 ? "s" : ""}
                </p>
                {share.message && <p className="text-xs text-muted-foreground/70 italic mt-0.5 truncate">"{share.message}"</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" disabled={loadingId === share.id} onClick={() => void handleAdd(share.id, label)}>
                  {loadingId === share.id ? "Adding…" : "Add to Vault"}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={loadingId === share.id} onClick={() => void handleDismiss(share.id)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

// ── Preferred Player Toggle ───────────────────────────────────────────────────
// Shown between Plex and Jellyfin sections when both are connected.
// Lets the user pick which service is used for movie-night library checks.

function PreferredPlayerToggle() {
  const { toast } = useToast();
  const { data: plexConfig } = useQuery<{ connected: boolean }>({
    queryKey: ["plex-config"],
    queryFn: () => fetch("/api/integrations/plex", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: jellyfinConfig } = useQuery<{ connected: boolean }>({
    queryKey: ["jellyfin-config"],
    queryFn: () => fetch("/api/integrations/jellyfin", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: libraryIndex, refetch: refetchIndex } = useQuery<LibraryIndexStatus>({
    queryKey: ["library-index"],
    queryFn: () => fetch("/api/integrations/library-index", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  if (!plexConfig?.connected || !jellyfinConfig?.connected) return null;

  const preferred = libraryIndex?.preferredPlayer ?? null;

  const setPreferred = async (player: "plex" | "jellyfin") => {
    try {
      await fetch("/api/integrations/preferred-player", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player }),
      });
      void refetchIndex();
      toast({ title: `${player === "plex" ? "Plex" : "Jellyfin"} set as preferred player` });
    } catch {
      toast({ title: "Failed to save preference", variant: "destructive" });
    }
  };

  return (
    <div className="my-3 mx-1 rounded-xl border border-border bg-card px-5 py-4 flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">Preferred player for movie nights</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Used for library search and Watch Now links — choose the app you actually want to open.
        </p>
      </div>
      <div className="flex items-center rounded-lg border border-border overflow-hidden shrink-0">
        <button
          onClick={() => void setPreferred("plex")}
          className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
            preferred === "plex"
              ? "bg-[#E5A00D] text-black"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          Plex
        </button>
        <div className="w-px h-full bg-border" />
        <button
          onClick={() => void setPreferred("jellyfin")}
          className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
            preferred === "jellyfin"
              ? "bg-[#AA5CC3] text-white"
              : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          Jellyfin
        </button>
      </div>
    </div>
  );
}

// ── Plex Integration ──────────────────────────────────────────────────────────

const PLEX_COLOR = "#E5A00D";

interface PlexConfig { connected: boolean; serverUrl?: string; tokenHint?: string; autoPlexCategory?: boolean }
interface PlexTestResult { ok: boolean; serverName?: string; error?: string }

interface LibraryIndexStatus { synced: boolean; count: number; source: string | null; preferredPlayer: string | null; syncedAt: string | null }

function PlexIntegrationSection() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [xmlUrl, setXmlUrl] = useState("");
  const [xmlExtracted, setXmlExtracted] = useState<"ok" | "err" | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: config, refetch } = useQuery<PlexConfig>({
    queryKey: ["plex-config"],
    queryFn: () => fetch("/api/integrations/plex", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: libraryIndex, refetch: refetchLibraryIndex } = useQuery<LibraryIndexStatus>({
    queryKey: ["library-index"],
    queryFn: () => fetch("/api/integrations/library-index", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
    enabled: open,
  });

  const handleXmlUrlChange = (raw: string) => {
    setXmlUrl(raw);
    setXmlExtracted(null);
    if (!raw.trim()) return;
    try {
      const u = new URL(raw.trim());
      const extractedToken = u.searchParams.get("X-Plex-Token") ?? u.searchParams.get("x-plex-token");
      if (!extractedToken) { setXmlExtracted("err"); return; }
      // Server URL = origin (scheme + host + port), stripping the /library/... path
      const extractedServer = u.origin; // e.g. https://192-168-1-234...plex.direct:32400
      setServerUrl(extractedServer);
      setToken(extractedToken);
      setXmlExtracted("ok");
    } catch {
      setXmlExtracted("err");
    }
  };

  const handleTest = async (overrideUrl?: string, overrideToken?: string) => {
    const testUrl = overrideUrl ?? serverUrl;
    const testToken = overrideToken ?? token;
    if (!testUrl.trim() || !testToken.trim()) {
      toast({ title: "Enter server URL and token first", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      // Try browser-side first — works when the user is on the same network as Plex
      try {
        const base = testUrl.trim().replace(/\/$/, "");
        const browserRes = await fetch(`${base}/identity?X-Plex-Token=${encodeURIComponent(testToken.trim())}`, {
          signal: AbortSignal.timeout(5000),
        });
        if (browserRes.ok) {
          const xml = await browserRes.text();
          const name = xml.match(/friendlyName="([^"]+)"/)?.[1];
          toast({ title: `Connected to ${name ?? "Plex"}!` });
          return;
        }
      } catch { /* not reachable from browser; fall through to server-side */ }

      // Server-side test (works for publicly accessible Plex servers)
      const res = await fetch("/api/integrations/plex/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: testUrl.trim(), token: testToken.trim() }),
      });
      const data = await res.json() as PlexTestResult;
      if (data.ok) {
        toast({ title: `Connected to ${data.serverName ?? "Plex"}!` });
      } else {
        toast({ title: "Connection failed", description: "Plex server not reachable. If it's on your local network, just click Save — it will still work.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not reach server", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!serverUrl.trim() || !token.trim()) {
      toast({ title: "Server URL and token are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/plex", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: serverUrl.trim(), token: token.trim() }),
      });
      if (res.ok) {
        toast({ title: "Plex connected!" });
        setShowForm(false);
        setToken("");
        void refetch();
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch("/api/integrations/plex", { method: "DELETE", credentials: "include" });
    toast({ title: "Plex disconnected" });
    setShowForm(false);
    void refetch();
  };

  const handleSyncLibrary = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/library-index/sync", { method: "POST", credentials: "include" });
      const data = await res.json() as { ok?: boolean; count?: number; error?: string };
      if (data.ok) {
        toast({ title: `Library synced — ${data.count?.toLocaleString() ?? 0} movies indexed` });
        void refetchLibraryIndex();
      } else {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const isConnected = config?.connected;
  const autoPlexCategory = config?.autoPlexCategory ?? true;

  const handleToggleAutoCategory = async (checked: boolean) => {
    if (!isConnected) return;
    await fetch("/api/integrations/plex", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoPlexCategory: checked }),
    });
    void refetch();
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Server className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Connected Services
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Plex row */}
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                  style={{ background: `${PLEX_COLOR}22`, color: PLEX_COLOR }}>
                  P
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Plex</p>
                  {isConnected ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {config.serverUrl} · token ···{config.tokenHint?.slice(-4)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isConnected ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setServerUrl(config.serverUrl ?? ""); setToken(""); setShowForm((v) => !v); }}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => void handleDisconnect()}>
                      <Link2Off className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => { setServerUrl(""); setToken(""); setShowForm(true); }} style={{ background: PLEX_COLOR, color: "#000", border: 0 }}>
                    <Link2 className="w-3.5 h-3.5 mr-1.5" /> Connect
                  </Button>
                )}
              </div>
            </div>

            {/* Connection form */}
            {showForm && (
              <div className="mt-5 space-y-4 border-t border-border pt-5">

                {/* ── Quick-configure: paste XML URL ───────────────────────── */}
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    Quick setup — paste your Plex XML URL
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Follow steps 1–5 in the instructions below to open the XML view, then paste the
                    full URL here and we'll extract everything automatically.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      value={xmlUrl}
                      onChange={(e) => handleXmlUrlChange(e.target.value)}
                      placeholder="https://192-168-1-234.abc123.plex.direct:32400/library/metadata/123?X-Plex-Token=XXXXX"
                      className={`w-full h-9 rounded-md border bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring pr-28 ${
                        xmlExtracted === "ok"
                          ? "border-green-500 focus:ring-green-500"
                          : xmlExtracted === "err"
                          ? "border-destructive focus:ring-destructive"
                          : "border-input"
                      }`}
                    />
                    {xmlExtracted === "ok" && (
                      <span className="absolute right-2.5 top-2 flex items-center gap-1 text-[10px] font-semibold text-green-600 dark:text-green-400">
                        <Check className="w-3 h-3" /> Extracted!
                      </span>
                    )}
                    {xmlExtracted === "err" && (
                      <span className="absolute right-2.5 top-2 text-[10px] font-semibold text-destructive">
                        Invalid URL
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="flex-1 border-t border-border" />
                  <span>or enter manually</span>
                  <div className="flex-1 border-t border-border" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Plex Server URL</label>
                  <input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="http://192.168.1.100:32400  or  https://xxx.plex.direct:32400"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Plex Token (X-Plex-Token)</label>
                  <div className="relative">
                    <input
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Your Plex token"
                      className="w-full h-9 rounded-md border border-input bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void handleTest()} disabled={testing}>
                    {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                    Test Connection
                  </Button>
                  <Button size="sm" onClick={() => void handleSave()} disabled={saving} style={{ background: PLEX_COLOR, color: "#000", border: 0 }}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setToken(""); setXmlUrl(""); setXmlExtracted(null); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Auto-category setting — visible when connected */}
            {isConnected && (
              <label className="mt-4 flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input
                    type="checkbox"
                    checked={autoPlexCategory}
                    onChange={(e) => void handleToggleAutoCategory(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    role="checkbox"
                    aria-checked={autoPlexCategory}
                    className={`w-9 h-5 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
                      autoPlexCategory ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      autoPlexCategory ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">Automatically assign Plex category</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Videos added from a Plex URL are automatically placed in a <strong>Plex</strong> category.
                    If the category doesn't exist yet, it's created on first use.
                  </p>
                </div>
              </label>
            )}

            {/* Movie Library Index */}
            {isConnected && (
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-muted-foreground" />
                    Movie Library Index
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {libraryIndex?.synced
                      ? `${libraryIndex.count.toLocaleString()} movies · last synced ${new Date(libraryIndex.syncedAt!).toLocaleDateString()}`
                      : "Not synced yet — used for cross-participant movie matching"}
                  </p>
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={() => void handleSyncLibrary()}
                  disabled={syncing}
                  className="shrink-0"
                >
                  {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                  {libraryIndex?.synced ? "Re-sync" : "Sync Now"}
                </Button>
              </div>
            )}

            {/* How to find your Plex token — always visible, collapses/expands */}
            <div className="mt-5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowInstructions((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
              >
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  How to find your Plex token
                </span>
                <ChevronDown
                  className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
                  style={{ transform: showInstructions ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>

              {showInstructions ? (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-4">
                  <ol className="space-y-2.5 text-xs text-foreground">
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${PLEX_COLOR}33`, color: PLEX_COLOR }}>1</span>
                      <span>Open your Plex web app in a browser — <code className="bg-muted px-1 py-0.5 rounded text-[10px]">127.0.0.1:32400/web</code> or <code className="bg-muted px-1 py-0.5 rounded text-[10px]">app.plex.tv</code></span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${PLEX_COLOR}33`, color: PLEX_COLOR }}>2</span>
                      <span>Click on any movie or show to open its detail page</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${PLEX_COLOR}33`, color: PLEX_COLOR }}>3</span>
                      <span>Click the <strong>⋯</strong> (three dots) menu → <strong>Get Info</strong></span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${PLEX_COLOR}33`, color: PLEX_COLOR }}>4</span>
                      <span>In the top-right corner of the popup, click <strong>"View XML"</strong></span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${PLEX_COLOR}33`, color: PLEX_COLOR }}>5</span>
                      <span>Your browser will open a URL ending in <code className="bg-muted px-1 py-0.5 rounded text-[10px]">?X-Plex-Token=XXXX…</code></span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${PLEX_COLOR}33`, color: PLEX_COLOR }}>6</span>
                      <span>Copy the <strong>entire URL</strong> and paste it in the <strong>"Quick setup"</strong> field above — we'll extract everything automatically!</span>
                    </li>
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const JELLYFIN_COLOR = "#AA5CC3";

interface JellyfinConfig { connected: boolean; serverUrl?: string; apiKeyHint?: string }
interface JellyfinTestResult { ok: boolean; serverName?: string; error?: string }

function JellyfinIntegrationSection() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const { data: config, refetch } = useQuery<JellyfinConfig>({
    queryKey: ["jellyfin-config"],
    queryFn: () => fetch("/api/integrations/jellyfin", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: libraryIndex, refetch: refetchLibraryIndex } = useQuery<LibraryIndexStatus>({
    queryKey: ["library-index"],
    queryFn: () => fetch("/api/integrations/library-index", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
    enabled: open,
  });

  const handleTest = async () => {
    if (!serverUrl.trim() || !apiKey.trim()) {
      toast({ title: "Enter server URL and API key first", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/integrations/jellyfin/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim() }),
      });
      const data = await res.json() as JellyfinTestResult;
      if (data.ok) {
        toast({ title: `Connected to ${data.serverName ?? "Jellyfin"}!` });
      } else {
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not reach server", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!serverUrl.trim() || !apiKey.trim()) {
      toast({ title: "Server URL and API key are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/jellyfin", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: serverUrl.trim(), apiKey: apiKey.trim() }),
      });
      if (res.ok) {
        toast({ title: "Jellyfin connected!" });
        setShowForm(false);
        setApiKey("");
        void refetch();
      } else {
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch("/api/integrations/jellyfin", { method: "DELETE", credentials: "include" });
    toast({ title: "Jellyfin disconnected" });
    setShowForm(false);
    void refetch();
  };

  const handleSyncLibrary = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/library-index/sync", { method: "POST", credentials: "include" });
      const data = await res.json() as { ok?: boolean; count?: number; error?: string };
      if (data.ok) {
        toast({ title: `Library synced — ${data.count?.toLocaleString() ?? 0} movies indexed` });
        void refetchLibraryIndex();
      } else {
        toast({ title: "Sync failed", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const isConnected = config?.connected;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Server className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Jellyfin
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm font-bold"
                  style={{ background: `${JELLYFIN_COLOR}22`, color: JELLYFIN_COLOR }}>
                  J
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">Jellyfin</p>
                  {isConnected ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {config.serverUrl} · key ···{config.apiKeyHint?.slice(-4)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isConnected ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { setServerUrl(config.serverUrl ?? ""); setApiKey(""); setShowForm((v) => !v); }}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => void handleDisconnect()}>
                      <Link2Off className="w-3.5 h-3.5 mr-1.5" /> Disconnect
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => { setServerUrl(""); setApiKey(""); setShowForm(true); }} style={{ background: JELLYFIN_COLOR, color: "#fff", border: 0 }}>
                    <Link2 className="w-3.5 h-3.5 mr-1.5" /> Connect
                  </Button>
                )}
              </div>
            </div>

            {showForm && (
              <div className="mt-5 space-y-4 border-t border-border pt-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Jellyfin Server URL</label>
                  <input
                    type="url"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="http://192.168.1.100:8096"
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Your Jellyfin API key"
                      className="w-full h-9 rounded-md border border-input bg-background px-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void handleTest()} disabled={testing}>
                    {testing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                    Test Connection
                  </Button>
                  <Button size="sm" onClick={() => void handleSave()} disabled={saving} style={{ background: JELLYFIN_COLOR, color: "#fff", border: 0 }}>
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setApiKey(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Movie Library Index */}
            {isConnected && (
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-muted-foreground" />
                    Movie Library Index
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {libraryIndex?.synced
                      ? `${libraryIndex.count.toLocaleString()} movies · last synced ${new Date(libraryIndex.syncedAt!).toLocaleDateString()}`
                      : "Not synced yet — used for cross-participant movie matching"}
                  </p>
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={() => void handleSyncLibrary()}
                  disabled={syncing}
                  className="shrink-0"
                >
                  {syncing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                  {libraryIndex?.synced ? "Re-sync" : "Sync Now"}
                </Button>
              </div>
            )}

            <div className="mt-5 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setShowInstructions((prev) => !prev)}
                className="w-full flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
              >
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 shrink-0" />
                  How to find your Jellyfin API key
                </span>
                <ChevronDown
                  className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
                  style={{ transform: showInstructions ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>

              {showInstructions ? (
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-4">
                  <ol className="space-y-2.5 text-xs text-foreground">
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${JELLYFIN_COLOR}33`, color: JELLYFIN_COLOR }}>1</span>
                      <span>Open your Jellyfin server's web app and sign in as an admin</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${JELLYFIN_COLOR}33`, color: JELLYFIN_COLOR }}>2</span>
                      <span>Go to <strong>Dashboard</strong> → <strong>Advanced</strong> → <strong>API Keys</strong></span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${JELLYFIN_COLOR}33`, color: JELLYFIN_COLOR }}>3</span>
                      <span>Click the <strong>+</strong> button, give it a name (e.g. "URLinc"), and create it</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${JELLYFIN_COLOR}33`, color: JELLYFIN_COLOR }}>4</span>
                      <span>Copy the key it generates and paste it above, along with your server's URL</span>
                    </li>
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function triggerJsonDownload(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchLibraryExport(): Promise<LibraryExport> {
  const res = await fetch("/api/library/export", { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  return res.json() as Promise<LibraryExport>;
}

async function fetchPhotosExport(): Promise<PhotoExport> {
  const res = await fetch("/api/photos/export", { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  return res.json() as Promise<PhotoExport>;
}

async function fetchMusicExport(): Promise<MusicExport> {
  const res = await fetch("/api/music/export", { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  return res.json() as Promise<MusicExport>;
}

async function fetchMusicExportM3U(): Promise<Blob> {
  const res = await fetch("/api/music/export?format=m3u", { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  return res.blob();
}

async function fetchFreshFindsExport(): Promise<{ version: number; exportedAt: string; freshFinds: object[] }> {
  const res = await fetch("/api/discover/export", { credentials: "include" });
  if (!res.ok) throw new Error("Export failed");
  return res.json() as Promise<{ version: number; exportedAt: string; freshFinds: object[] }>;
}

function AutoBackupSection() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState<"off" | "daily" | "weekly">("off");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/backup/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setFrequency(d.frequency ?? "off"); setLastSentAt(d.lastSentAt ?? null); })
      .catch(() => {});
  }, [open]);

  const handleSaveFrequency = async (val: "off" | "daily" | "weekly") => {
    setFrequency(val);
    setSaving(true);
    try {
      await fetch("/api/backup/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: val }),
      });
      toast({ title: val === "off" ? "Auto-backup disabled" : `Auto-backup set to ${val}` });
    } catch {
      toast({ title: "Failed to save setting", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/backup/send-now", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      setLastSentAt(new Date().toISOString());
      toast({ title: "Backup sent!", description: "Check your email for the backup file." });
    } catch {
      toast({ title: "Failed to send backup", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Auto-Backup
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-0.5">Scheduled Backup</p>
            <p className="text-xs text-muted-foreground mb-4">
              Automatically email your full library backup (videos, photos, music) to your account email on a schedule.
              You can restore from any backup using Settings → Export / Import → Import from File.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(["off", "daily", "weekly"] as const).map((f) => (
                <Button
                  key={f}
                  variant={frequency === f ? "default" : "outline"}
                  size="sm"
                  disabled={saving}
                  onClick={() => handleSaveFrequency(f)}
                  className="capitalize"
                >
                  {f === "off" ? "Off" : f === "daily" ? "Daily" : "Weekly"}
                </Button>
              ))}
            </div>
            {lastSentAt && (
              <p className="text-xs text-muted-foreground">
                Last backup sent: {new Date(lastSentAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-0.5">Send Backup Now</p>
            <p className="text-xs text-muted-foreground mb-4">
              Immediately email your full library backup to your account email address.
            </p>
            <Button variant="outline" size="sm" onClick={handleSendNow} disabled={sending}>
              <Download className="w-4 h-4 mr-2" />
              {sending ? "Sending…" : "Send Backup Now"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ExportImportSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // TV shows live exclusively on the TV Shows tab -- excluded here so they
  // don't show up mixed in with regular playlists in the export picker.
  const { data: allPlaylistsRaw = [] } = useListPlaylists({
    query: { queryKey: getListPlaylistsQueryKey() },
  });
  const allPlaylists = allPlaylistsRaw.filter((p) => !p.isShow);

  const handleExportLibrary = async () => {
    setExporting("library");
    try {
      const data = await fetchLibraryExport();
      triggerJsonDownload(data, `web-vault-library-${new Date().toISOString().slice(0, 10)}.json`);
      toast({ title: `Exported ${data.videos.length} video${data.videos.length !== 1 ? "s" : ""} and ${data.playlists.length} playlist${data.playlists.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportVideos = async () => {
    setExporting("videos");
    try {
      const data = await fetchLibraryExport();
      triggerJsonDownload({ version: 1, exportedAt: data.exportedAt, videos: data.videos, playlists: [] }, `web-vault-videos-${new Date().toISOString().slice(0, 10)}.json`);
      toast({ title: `Exported ${data.videos.length} video${data.videos.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportPhotos = async () => {
    setExporting("photos");
    try {
      const data = await fetchPhotosExport();
      triggerJsonDownload(data, `web-vault-photos-${new Date().toISOString().slice(0, 10)}.json`);
      toast({ title: `Exported ${data.photos.length} photo${data.photos.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportMusicJson = async () => {
    setExporting("music-json");
    try {
      const data = await fetchMusicExport();
      const date = new Date().toISOString().slice(0, 10);
      triggerJsonDownload(data, `urlinc-music-${date}.json`);
      toast({ title: `Exported ${data.tracks.length} track${data.tracks.length !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportMusicM3U = async () => {
    setExporting("music-m3u");
    try {
      const blob = await fetchMusicExportM3U();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `urlinc-music-${new Date().toISOString().slice(0, 10)}.m3u`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Music library exported as M3U" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportFreshFinds = async () => {
    setExporting("fresh-finds");
    try {
      const data = await fetchFreshFindsExport();
      triggerJsonDownload(data, `urlinc-fresh-finds-${new Date().toISOString().slice(0, 10)}.json`);
      toast({ title: `Exported ${data.freshFinds.length} Fresh Finds entr${data.freshFinds.length !== 1 ? "ies" : "y"}` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const handleExportSelectedPlaylists = async () => {
    if (selectedIds.size === 0) return;
    setExporting("playlists");
    try {
      const data = await fetchLibraryExport();
      const selected = data.playlists.filter((_, i) => {
        const pl = allPlaylists[i];
        return pl && selectedIds.has(pl.id);
      });
      const nameSet = new Set(allPlaylists.filter((p) => selectedIds.has(p.id)).map((p) => p.name));
      const filteredPlaylists = data.playlists.filter((p) => nameSet.has(p.name));
      const referencedUrls = new Set(filteredPlaylists.flatMap((p) => p.videoUrls));
      const filteredVideos = data.videos.filter((v) => referencedUrls.has(v.youtubeUrl));
      void selected;
      const suffix = filteredPlaylists.length === 1 ? filteredPlaylists[0]!.name.replace(/[^a-z0-9]/gi, "-").toLowerCase() : `${filteredPlaylists.length}-playlists`;
      triggerJsonDownload(
        { version: 1, exportedAt: data.exportedAt, videos: filteredVideos, playlists: filteredPlaylists },
        `web-vault-${suffix}-${new Date().toISOString().slice(0, 10)}.json`
      );
      toast({ title: `Exported ${filteredPlaylists.length} playlist${filteredPlaylists.length !== 1 ? "s" : ""} with ${filteredVideos.length} video${filteredVideos.length !== 1 ? "s" : ""}` });
      setShowPlaylistPicker(false);
      setSelectedIds(new Set());
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const togglePlaylist = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === allPlaylists.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPlaylists.map((p) => p.id)));
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { toast({ title: "Invalid JSON file", variant: "destructive" }); return; }

      const obj = parsed as Record<string, unknown>;
      const isPhotoExport =
        typeof obj === "object" && obj !== null &&
        Array.isArray(obj.photos) && !Array.isArray(obj.videos);
      const isMusicExport =
        typeof obj === "object" && obj !== null &&
        Array.isArray(obj.tracks) && !Array.isArray(obj.videos) && !Array.isArray(obj.photos);
      const isFreshFindsExport =
        typeof obj === "object" && obj !== null && Array.isArray(obj.freshFinds);

      if (isFreshFindsExport) {
        const res = await fetch("/api/discover/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          toast({ title: err.error ?? "Import failed", variant: "destructive" });
          return;
        }
        const result = await res.json() as { imported: number; skipped: number };
        const parts: string[] = [];
        if (result.imported > 0) parts.push(`${result.imported} entr${result.imported !== 1 ? "ies" : "y"} added`);
        if (result.skipped > 0) parts.push(`${result.skipped} skipped (already exist)`);
        toast({ title: parts.length ? parts.join(" · ") : "Nothing new to import" });
      } else if (isMusicExport) {
        const res = await fetch("/api/music/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          toast({ title: err.error ?? "Import failed", variant: "destructive" });
          return;
        }
        const result = await res.json() as { imported: number; skipped: number };
        const parts: string[] = [];
        if (result.imported > 0) parts.push(`${result.imported} track${result.imported !== 1 ? "s" : ""} added`);
        if (result.skipped > 0) parts.push(`${result.skipped} skipped (already exist)`);
        toast({ title: parts.length ? parts.join(" · ") : "Nothing new to import" });
        queryClient.invalidateQueries({ queryKey: ["/api/music"] });
      } else if (isPhotoExport) {
        const res = await fetch("/api/photos/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          toast({ title: err.error ?? "Import failed", variant: "destructive" });
          return;
        }
        const result = await res.json() as { photosImported: number; photosSkipped: number };
        const parts: string[] = [];
        if (result.photosImported > 0) parts.push(`${result.photosImported} photo${result.photosImported !== 1 ? "s" : ""} added`);
        if (result.photosSkipped > 0) parts.push(`${result.photosSkipped} skipped (already exist)`);
        toast({ title: parts.length ? parts.join(" · ") : "Nothing new to import" });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() }),
        ]);
      } else {
        const res = await fetch("/api/library/import", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          toast({ title: err.error ?? "Import failed", variant: "destructive" });
          return;
        }
        const result = await res.json() as { videosImported: number; videosSkipped: number; playlistsImported: number; playlistsSkipped: number };
        const parts: string[] = [];
        if (result.videosImported > 0) parts.push(`${result.videosImported} video${result.videosImported !== 1 ? "s" : ""} added`);
        if (result.videosSkipped > 0) parts.push(`${result.videosSkipped} skipped (already exist)`);
        if (result.playlistsImported > 0) parts.push(`${result.playlistsImported} playlist${result.playlistsImported !== 1 ? "s" : ""} created`);
        if (result.playlistsSkipped > 0) parts.push(`${result.playlistsSkipped} playlist${result.playlistsSkipped !== 1 ? "s" : ""} skipped`);
        toast({ title: parts.length ? parts.join(" · ") : "Nothing new to import" });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() }),
        ]);
      }
    } catch {
      toast({ title: "Import failed", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Download className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Export / Import
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        <div className="px-6 py-5">
          <p className="font-medium text-sm mb-0.5">Export</p>
          <p className="text-xs text-muted-foreground mb-4">
            Download your library data as a JSON file you can back up or share for import.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportLibrary} disabled={!!exporting}>
              <Download className="w-4 h-4 mr-2" />
              {exporting === "library" ? "Exporting…" : "Full Library"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportVideos} disabled={!!exporting}>
              <Film className="w-4 h-4 mr-2" />
              {exporting === "videos" ? "Exporting…" : "Videos Only"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPhotos} disabled={!!exporting}>
              <ImageIcon className="w-4 h-4 mr-2" />
              {exporting === "photos" ? "Exporting…" : "Photos Only"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportMusicJson} disabled={!!exporting}>
              <Music2 className="w-4 h-4 mr-2" />
              {exporting === "music-json" ? "Exporting…" : "Music (JSON)"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportMusicM3U} disabled={!!exporting}>
              <Music2 className="w-4 h-4 mr-2" />
              {exporting === "music-m3u" ? "Exporting…" : "Music (M3U)"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportFreshFinds} disabled={!!exporting}>
              <Sparkles className="w-4 h-4 mr-2" />
              {exporting === "fresh-finds" ? "Exporting…" : "Fresh Finds"}
            </Button>
            <Button
              variant={showPlaylistPicker ? "secondary" : "outline"}
              size="sm"
              onClick={() => { setShowPlaylistPicker((v) => !v); setSelectedIds(new Set()); }}
              disabled={!!exporting}
            >
              <ListVideo className="w-4 h-4 mr-2" />
              Export Playlists…
            </Button>
          </div>

          {showPlaylistPicker && (
            <div className="mt-4 border border-border rounded-lg overflow-hidden">
              {allPlaylists.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No playlists yet.</p>
              ) : (
                <>
                  <div className="px-4 py-2 bg-muted/40 flex items-center justify-between border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground">
                      {selectedIds.size} of {allPlaylists.length} selected
                    </span>
                    <button
                      onClick={toggleAll}
                      className="text-xs text-primary hover:underline"
                    >
                      {selectedIds.size === allPlaylists.length ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div className="divide-y divide-border max-h-56 overflow-y-auto">
                    {allPlaylists.map((pl) => (
                      <label
                        key={pl.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(pl.id)}
                          onChange={() => togglePlaylist(pl.id)}
                          className="accent-primary h-4 w-4 rounded"
                        />
                        <span className="flex-1 text-sm font-medium truncate">{pl.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {(pl as { videoCount?: number }).videoCount ?? 0} video{(pl as { videoCount?: number }).videoCount !== 1 ? "s" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="px-4 py-3 bg-muted/40 border-t border-border flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleExportSelectedPlaylists}
                      disabled={selectedIds.size === 0 || !!exporting}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      {exporting === "playlists"
                        ? "Exporting…"
                        : selectedIds.size === 0
                        ? "Select playlists"
                        : `Export ${selectedIds.size} playlist${selectedIds.size !== 1 ? "s" : ""}`}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowPlaylistPicker(false); setSelectedIds(new Set()); }}>
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="px-6 py-5">
          <p className="font-medium text-sm mb-0.5">Import</p>
          <p className="text-xs text-muted-foreground mb-4">
            Import a previously exported file. Existing videos and playlists with matching URLs or names are skipped automatically.
          </p>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} disabled={importing}>
            <Upload className="w-4 h-4 mr-2" />
            {importing ? "Importing…" : "Import from File"}
          </Button>
        </div>
      </div>
      )}
    </section>
  );
}


function CategoriesSection() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories = [] } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("Uncategorized");
  const [deleting, setDeleting] = useState(false);

  const invalidateAll = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() }),
  ]);

  const handleRename = async (oldName: string) => {
    const newName = editValue.trim();
    if (!newName || newName === oldName) { setEditingName(null); return; }
    setRenaming(true);
    try {
      const res = await fetch("/api/categories/rename", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName }),
      });
      if (!res.ok) throw new Error();
      await invalidateAll();
      setEditingName(null);
    } catch {
      toast({ title: "Failed to rename category", variant: "destructive" });
    } finally {
      setRenaming(false);
    }
  };

  const handleRemoveCategory = async (mode: "move" | "delete") => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const url = mode === "move"
        ? `/api/categories/${encodeURIComponent(deleteTarget)}?mode=move&to=${encodeURIComponent(moveTo)}`
        : `/api/categories/${encodeURIComponent(deleteTarget)}?mode=delete`;
      const res = await fetch(url, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json() as { affected: number; to?: string };
      await invalidateAll();
      toast({
        title: mode === "delete"
          ? `Sent ${data.affected} video${data.affected !== 1 ? "s" : ""} to Trash and removed "${deleteTarget}"`
          : `Moved ${data.affected} video${data.affected !== 1 ? "s" : ""} to "${data.to ?? moveTo}"`,
      });
    } catch {
      toast({ title: "Failed to remove category", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Categories
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {categories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <FolderOpen className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          </div>
        )}

        <div className="max-h-[280px] overflow-y-auto">
        {categories.map((cat) => (
          <div
            key={cat.name}
            className="flex items-center gap-3 px-5 py-4 border-b border-border last:border-0 group hover:bg-accent/20 transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />

            {editingName === cat.name ? (
              <>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleRename(cat.name);
                    if (e.key === "Escape") setEditingName(null);
                  }}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-primary"
                  onClick={() => void handleRename(cat.name)}
                  disabled={!editValue.trim() || renaming}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingName(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <button
                  className="flex-1 text-left text-sm font-medium hover:text-primary transition-colors truncate"
                  onClick={() => setLocation(`/?category=${encodeURIComponent(cat.name)}`)}
                >
                  {cat.name}
                </button>
                <span className="text-xs text-muted-foreground shrink-0">
                  {cat.count} video{cat.count !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Rename"
                    onClick={() => { setEditingName(cat.name); setEditValue(cat.name); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete"
                    onClick={() => { setDeleteTarget(cat.name); setMoveTo("Uncategorized"); }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        </div>
      </div>
      )}

      {/* Two distinct choices rather than one destructive button: moving
          videos to Uncategorized is safe and non-destructive (the category
          just disappears from this list since nothing references it
          anymore); deleting sends them to Trash for 30 days, same as every
          other delete in the app -- no longer an instant, unrecoverable
          removal like this used to be. */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove category "{deleteTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Choose what happens to the videos currently in this category.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="px-1 py-2">
            <p className="text-sm font-medium mb-2">Move videos to:</p>
            <select
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={deleting}
            >
              <option value="Uncategorized">Uncategorized</option>
              {categories
                .filter((c) => c.name !== deleteTarget && c.name !== "Uncategorized")
                .map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
            </select>
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => void handleRemoveCategory("move")}
              disabled={deleting}
            >
              Move Videos
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleRemoveCategory("delete")}
              disabled={deleting}
            >
              Delete videos too
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function PlaylistsSection() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // TV shows live exclusively on the TV Shows tab -- excluded here so they
  // don't show up mixed in with regular playlists to manage.
  const { data: allPlaylists = [] } = useListPlaylists({
    query: { queryKey: getListPlaylistsQueryKey() },
  });
  const playlists = allPlaylists.filter((p) => !p.isShow);

  const createPlaylist = useCreatePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const deletePlaylist = useDeletePlaylist();

  const [isCreating, setIsCreating] = useState(false);
  const [open, setOpen] = useState(false);

  // When navigated here with ?newPlaylist=1, open the inline form immediately
  // and clear the param from the URL so a back-navigation doesn't re-trigger it.
  useEffect(() => {
    if (new URLSearchParams(search).get("newPlaylist") === "1") {
      setIsCreating(true);
      setOpen(true);
      setLocation("/settings", { replace: true });
    }
  }, [search, setLocation]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createPlaylist.mutate(
      { data: { name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          toast({ title: `Playlist "${name}" created` });
          setNewName("");
          setIsCreating(false);
        },
        onError: () => toast({ title: "Failed to create playlist", variant: "destructive" }),
      }
    );
  };

  const handleRename = (id: number) => {
    const name = editName.trim();
    if (!name) return;
    updatePlaylist.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          setEditingId(null);
        },
        onError: () => toast({ title: "Failed to rename", variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    deletePlaylist.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          toast({ title: `Deleted "${name}"` });
          setDeleteTarget(null);
        },
        onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
      }
    );
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <ListVideo className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Playlists
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && !isCreating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setIsCreating(true); setNewName(""); }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Playlist
          </Button>
        )}
      </div>

      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isCreating && (
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-accent/20">
            <ListVideo className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setIsCreating(false);
              }}
              placeholder="Playlist name…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-primary"
              onClick={handleCreate}
              disabled={!newName.trim() || createPlaylist.isPending}
            >
              <Check className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setIsCreating(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {playlists.length === 0 && !isCreating && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <ListVideo className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No playlists yet — create one above.</p>
          </div>
        )}

        <div className="max-h-[280px] overflow-y-auto">
        {playlists.map((pl) => (
          <div
            key={pl.id}
            className="flex items-center gap-3 px-5 py-4 border-b border-border last:border-0 group hover:bg-accent/20 transition-colors"
          >
            <ListVideo className="w-4 h-4 text-muted-foreground shrink-0" />

            {editingId === pl.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(pl.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-primary"
                  onClick={() => handleRename(pl.id)}
                  disabled={!editName.trim() || updatePlaylist.isPending}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setEditingId(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <button
                  className="flex-1 text-left text-sm font-medium hover:text-primary transition-colors truncate"
                  onClick={() => setLocation(`/playlists/${pl.id}`)}
                >
                  {pl.name}
                </button>
                <span className="text-xs text-muted-foreground shrink-0">
                  {pl.videoCount} video{pl.videoCount !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Rename"
                    onClick={() => { setEditingId(pl.id); setEditName(pl.name); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete"
                    onClick={() => setDeleteTarget({ id: pl.id, name: pl.name })}
                    disabled={deletePlaylist.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
        </div>
      </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete playlist "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the playlist. Your videos will remain in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deletePlaylist.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

interface AlbumSummary {
  id: number;
  name: string;
  description: string | null;
  photoCount: number;
}

function albumsQueryKey() { return ["albums"]; }

function AlbumsSection() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteAlbumTarget, setDeleteAlbumTarget] = useState<{ id: number; name: string } | null>(null);

  const { data: albums = [] } = useQuery<AlbumSummary[]>({
    queryKey: albumsQueryKey(),
    queryFn: async () => {
      const res = await fetch("/api/albums", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<AlbumSummary[]>;
    },
  });

  const createAlbum = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/albums", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
      toast({ title: `Album "${newName}" created` });
      setIsCreating(false);
      setNewName("");
    },
    onError: () => toast({ title: "Failed to create album", variant: "destructive" }),
  });

  const renameAlbum = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await fetch(`/api/albums/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
      toast({ title: "Album renamed" });
      setEditingId(null);
    },
    onError: () => toast({ title: "Failed to rename album", variant: "destructive" }),
  });

  const deleteAlbum = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/albums/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: albumsQueryKey() });
      toast({ title: `Deleted "${deleteAlbumTarget?.name}"` });
      setDeleteAlbumTarget(null);
    },
    onError: () => toast({ title: "Failed to delete album", variant: "destructive" }),
  });

  const handleRename = (id: number) => {
    if (!editName.trim()) return;
    renameAlbum.mutate({ id, name: editName.trim() });
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createAlbum.mutate(newName.trim());
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Images className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Albums
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && !isCreating && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setIsCreating(true); setNewName(""); }}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Album
          </Button>
        )}
      </div>

      {open && (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isCreating && (
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-accent/20">
            <Images className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setIsCreating(false);
              }}
              placeholder="Album name…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={handleCreate} disabled={!newName.trim() || createAlbum.isPending}>
              <Check className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsCreating(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {albums.length === 0 && !isCreating && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <Images className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No albums yet — create one above.</p>
          </div>
        )}

        <div className="max-h-[280px] overflow-y-auto">
          {albums.map((al) => (
            <div
              key={al.id}
              className="flex items-center gap-3 px-5 py-4 border-b border-border last:border-0 group hover:bg-accent/20 transition-colors"
            >
              <Images className="w-4 h-4 text-muted-foreground shrink-0" />

              {editingId === al.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(al.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7 text-primary"
                    onClick={() => handleRename(al.id)}
                    disabled={!editName.trim() || renameAlbum.isPending}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <button
                    className="flex-1 text-left text-sm font-medium hover:text-primary transition-colors truncate"
                    onClick={() => setLocation(`/albums/${al.id}`)}
                  >
                    {al.name}
                  </button>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {al.photoCount} photo{al.photoCount !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7"
                      title="Rename"
                      onClick={() => { setEditingId(al.id); setEditName(al.name); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Delete"
                      onClick={() => setDeleteAlbumTarget({ id: al.id, name: al.name })}
                      disabled={deleteAlbum.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      )}

      <AlertDialog open={!!deleteAlbumTarget} onOpenChange={(o) => { if (!o) setDeleteAlbumTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete album "{deleteAlbumTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the album. Your photos will remain in your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAlbumTarget && deleteAlbum.mutate(deleteAlbumTarget.id)}
              disabled={deleteAlbum.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

const MODES: { id: ColorMode; label: string; icon: React.ReactNode }[] = [
  { id: "dark", label: "Dark",  icon: <Moon    className="w-4 h-4" /> },
  { id: "dim",  label: "Dim",   icon: <SunMoon className="w-4 h-4" /> },
  { id: "light",label: "Light", icon: <Sun     className="w-4 h-4" /> },
];

function contrastLabel(v: number): string {
  if (v <= 20)  return "Whisper";
  if (v <= 45)  return "Soft";
  if (v <= 70)  return "Balanced";
  if (v <= 90)  return "High";
  return "Full";
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
        checked ? "bg-primary" : "bg-muted"
      }`}
    >
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function CreativeThemeCard({ theme, active, onActivate }: { theme: CreativeTheme; active: boolean; onActivate: () => void }) {
  const [bg, card, sidebar, primary] = theme.swatch;
  return (
    <button
      onClick={onActivate}
      className={`group relative flex flex-col rounded-lg overflow-hidden border-2 transition-all w-full text-left ${
        active ? "border-primary shadow-lg scale-[1.02]" : "border-border hover:border-primary/50 hover:scale-[1.01]"
      }`}
      style={{ background: bg }}
    >
      {/* Mini layout mockup */}
      <div className="flex h-16 w-full overflow-hidden">
        {/* Sidebar strip */}
        <div className="w-6 h-full flex-shrink-0 flex flex-col gap-0.5 px-0.5 py-1.5" style={{ background: sidebar }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="h-1 rounded-sm opacity-60" style={{ background: i === 1 ? primary : "#fff2", width: i === 1 ? "100%" : `${55+i*10}%` }} />
          ))}
        </div>
        {/* Content area */}
        <div className="flex-1 flex flex-col gap-1 p-1.5" style={{ background: card ?? bg }}>
          <div className="flex items-center gap-1 mb-0.5">
            <div className="h-1.5 rounded-full w-16 opacity-80" style={{ background: primary }} />
            <div className="ml-auto h-4 w-8 rounded-sm opacity-90" style={{ background: primary }} />
          </div>
          {[90,75,82,68].map((w, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="h-1 rounded-sm opacity-25 w-3" style={{ background: primary }} />
              <div className="h-1 rounded-sm opacity-30" style={{ background: "#fff", width: `${w}%` }} />
            </div>
          ))}
        </div>
      </div>
      {/* Label */}
      <div className="px-2.5 py-1.5 flex items-center justify-between" style={{ background: sidebar }}>
        <div>
          <p className="text-[10px] font-semibold leading-tight" style={{ color: active ? primary : "#fff" }}>{theme.name}</p>
          <p className="text-[8.5px] opacity-55 leading-tight mt-0.5" style={{ color: "#fff" }}>{theme.tagline}</p>
        </div>
        {active && (
          <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: primary }}>
            <Check className="w-2 h-2" style={{ color: bg }} />
          </div>
        )}
      </div>
    </button>
  );
}
function ScreensaverSection() {
  const { settings, update } = useScreensaverSettings();
  const [open, setOpen] = useState(false);

  const { data: albums = [] } = useQuery<{ id: number; name: string; photoCount: number }[]>({
    queryKey: ["albums"],
    queryFn: async () => {
      const res = await fetch("/api/albums", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: playlists = [] } = useListMusicPlaylists();

  const INACTIVITY_OPTIONS = [1, 2, 5, 10, 15, 30];
  const SLIDE_OPTIONS = [3, 5, 8, 10, 15, 20];
  const TRANSITION_OPTIONS: { id: "fade" | "slide" | "zoom"; label: string }[] = [
    { id: "fade",  label: "Fade"  },
    { id: "slide", label: "Slide" },
    { id: "zoom",  label: "Zoom"  },
  ];

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Images className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Photo Screensaver
          </h2>
          {settings.enabled && settings.albumId && (
            <span className="ml-1 text-[10px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded uppercase tracking-wide">On</span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          <div className="px-6 py-5">
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <div>
                <p className="font-medium text-sm">Enable Photo Screensaver</p>
                <p className="text-xs text-muted-foreground mt-0.5">Shows a fullscreen photo slideshow after a period of inactivity.</p>
              </div>
              <button role="checkbox" aria-checked={settings.enabled} onClick={() => update("enabled", !settings.enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${settings.enabled ? "bg-primary" : "bg-muted"}`}>
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${settings.enabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </label>
          </div>

          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-1">Start after</p>
            <p className="text-xs text-muted-foreground mb-3">How long to wait with no activity before starting.</p>
            <div className="flex flex-wrap gap-2">
              {INACTIVITY_OPTIONS.map((min) => (
                <button key={min} onClick={() => update("inactivityMinutes", min)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${settings.inactivityMinutes === min ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`}>
                  {min} min
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-1">Photo Album</p>
            <p className="text-xs text-muted-foreground mb-3">Choose which album to display in the screensaver.</p>
            {albums.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No albums yet — create one in the Albums section below.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                <button onClick={() => { update("albumId", null); update("albumName", null); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors border ${settings.albumId === null ? "bg-primary/10 border-primary/30 text-primary font-medium" : "border-transparent text-muted-foreground hover:bg-accent/40"}`}>
                  <Images className="w-4 h-4 shrink-0" />
                  <span>None — screensaver disabled</span>
                </button>
                {albums.map((album) => (
                  <button key={album.id} onClick={() => { update("albumId", album.id); update("albumName", album.name); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors border ${settings.albumId === album.id ? "bg-primary/10 border-primary/30 text-primary font-medium" : "border-transparent text-muted-foreground hover:bg-accent/40"}`}>
                    <Images className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{album.name}</span>
                    <span className="text-xs opacity-60 shrink-0">{album.photoCount} photo{album.photoCount !== 1 ? "s" : ""}</span>
                    {settings.albumId === album.id && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-1">Slide Duration</p>
            <p className="text-xs text-muted-foreground mb-3">How long each photo is shown.</p>
            <div className="flex flex-wrap gap-2">
              {SLIDE_OPTIONS.map((sec) => (
                <button key={sec} onClick={() => update("slideDurationSeconds", sec)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${settings.slideDurationSeconds === sec ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`}>
                  {sec}s
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-1">Transition Effect</p>
            <p className="text-xs text-muted-foreground mb-3">How photos change from one to the next.</p>
            <div className="flex gap-2">
              {TRANSITION_OPTIONS.map((t) => (
                <button key={t.id} onClick={() => update("transition", t.id)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors border ${settings.transition === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-5">
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <div>
                <p className="font-medium text-sm">Shuffle Photos</p>
                <p className="text-xs text-muted-foreground mt-0.5">Show photos in random order.</p>
              </div>
              <button role="checkbox" aria-checked={settings.shuffle} onClick={() => update("shuffle", !settings.shuffle)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${settings.shuffle ? "bg-primary" : "bg-muted"}`}>
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${settings.shuffle ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </label>
          </div>

          <div className="px-6 py-5">
            <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
              <div>
                <p className="font-medium text-sm">Launch in Fullscreen</p>
                <p className="text-xs text-muted-foreground mt-0.5">Automatically goes fullscreen when the screensaver starts.</p>
              </div>
              <button role="checkbox" aria-checked={settings.fullscreen} onClick={() => update("fullscreen", !settings.fullscreen)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${settings.fullscreen ? "bg-primary" : "bg-muted"}`}>
                <span className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${settings.fullscreen ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </label>
          </div>
          <div className="px-6 py-5">
            <p className="font-medium text-sm mb-1">Background Music <span className="text-xs font-normal text-muted-foreground">(optional)</span></p>
            <p className="text-xs text-muted-foreground mb-3">Play a music playlist during the screensaver.</p>
            {playlists.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No playlists yet — create one in My Audio.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                <button onClick={() => { update("playlistId", null); update("playlistName", null); }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors border ${settings.playlistId === null ? "bg-primary/10 border-primary/30 text-primary font-medium" : "border-transparent text-muted-foreground hover:bg-accent/40"}`}>
                  <Music2 className="w-4 h-4 shrink-0" />
                  <span>No music</span>
                </button>
                {playlists.map((pl) => (
                  <button key={pl.id} onClick={() => { update("playlistId", pl.id); update("playlistName", pl.name); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors border ${settings.playlistId === pl.id ? "bg-primary/10 border-primary/30 text-primary font-medium" : "border-transparent text-muted-foreground hover:bg-accent/40"}`}>
                    <Music2 className="w-4 h-4 shrink-0" />
                    <span className="flex-1 truncate">{pl.name}</span>
                    <span className="text-xs opacity-60 shrink-0">{pl.trackCount} track{pl.trackCount !== 1 ? "s" : ""}</span>
                    {settings.playlistId === pl.id && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function AppearanceSection() {
  const { theme, reset } = useTheme();
  const { activeId: creativeId, activate: activateCreative, reset: resetCreative, themes: creativeThemes } = useCreativeTheme();
  const { coloredText, setColoredText } = useLibraryColoredText();
  const { cardOpacity: libCardOp,    setCardOpacity: setLibCardOp    } = useTabCardOpacity("library");
  const { cardOpacity: radioCardOp,  setCardOpacity: setRadioCardOp  } = useTabCardOpacity("radio");
  const { cardOpacity: browseCardOp, setCardOpacity: setBrowseCardOp } = useTabCardOpacity("browse");
  const { cardOpacity: streamCardOp, setCardOpacity: setStreamCardOp } = useTabCardOpacity("stream");
  const { cardOpacity: abCardOp,     setCardOpacity: setAbCardOp     } = useTabCardOpacity("audiobooks");

  const { solidEnabled: librarySolid,    solidColor: libraryColor,    solidOpacity: libraryOpacity,    setSolidEnabled: setLibrarySolid,    setSolidColor: setLibraryColor,    setSolidOpacity: setLibraryOpacity    } = useTabSolidColor("library");
  const { solidEnabled: browseSolid,     solidColor: browseColor,     solidOpacity: browseOpacity,     setSolidEnabled: setBrowseSolid,     setSolidColor: setBrowseColor,     setSolidOpacity: setBrowseOpacity     } = useTabSolidColor("browse");
  const { solidEnabled: streamSolid,     solidColor: streamColor,     solidOpacity: streamOpacity,     setSolidEnabled: setStreamSolid,     setSolidColor: setStreamColor,     setSolidOpacity: setStreamOpacity     } = useTabSolidColor("stream");
  const { solidEnabled: audiobooksSolid, solidColor: audiobooksColor, solidOpacity: audiobooksOpacity, setSolidEnabled: setAudiobooksSolid, setSolidColor: setAudiobooksColor, setSolidOpacity: setAudiobooksOpacity } = useTabSolidColor("audiobooks");
  const { solidEnabled: radioSolid,      solidColor: radioColor,      solidOpacity: radioOpacity,      setSolidEnabled: setRadioSolid,      setSolidColor: setRadioColor,      setSolidOpacity: setRadioOpacity      } = useTabSolidColor("radio");
  const [open, setOpen] = useState(false);
  const [previewSolidTab, setPreviewSolidTab] = useState<"Library" | "Radio" | "Browse" | "Stream" | "Audiobooks">("Library");

  const solidPreviewSettings = {
    Library:    { enabled: librarySolid,    color: libraryColor,    bgOpacity: libraryOpacity,    cardOpacity: libCardOp    },
    Radio:      { enabled: radioSolid,      color: radioColor,      bgOpacity: radioOpacity,      cardOpacity: radioCardOp  },
    Browse:     { enabled: browseSolid,     color: browseColor,     bgOpacity: browseOpacity,     cardOpacity: browseCardOp },
    Stream:     { enabled: streamSolid,     color: streamColor,     bgOpacity: streamOpacity,     cardOpacity: streamCardOp },
    Audiobooks: { enabled: audiobooksSolid, color: audiobooksColor, bgOpacity: audiobooksOpacity, cardOpacity: abCardOp     },
  };

  const handleResetAll = () => {
    resetCreative();
    reset();
    persistListOpacity(80);
    persistBgBrightness(40);
  };

  const isDefault =
    theme.accentId === "amber" &&
    theme.mode === "dark" &&
    theme.bgHue === 222 &&
    !(theme.bgVivid ?? false) &&
    !(theme.textContrastEnabled ?? false) &&
    !(theme.textSolidEnabled ?? false);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 group focus:outline-none"
        >
          <Palette className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Appearance
          </h2>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetAll}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Default
          </Button>
        </div>
      </div>

      
      {/* Scene background settings */}
      {open && (
        <>
          {/* Creative theme picker */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Themes</p>
        <div className="grid grid-cols-4 gap-2">
          {creativeThemes.map((ct) => (
            <CreativeThemeCard
              key={ct.id}
              theme={ct}
              active={creativeId === ct.id}
              onActivate={() => activateCreative(ct.id)}
            />
          ))}
        </div>
        {!creativeId && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Click a theme for a complete visual overhaul, or expand Appearance below for manual controls.
          </p>
        )}
        {creativeId && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Theme active. Expand below to adjust tab colors and transparency, or{" "}
            <button className="underline hover:text-foreground" onClick={handleResetAll}>Reset to Default</button> to switch to full manual control.
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {/* Library colored text */}
        <div className="px-6 py-5">
          <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
            <div>
              <p className="font-medium text-sm">Colorful library text</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gives each track in My Audio Library a distinct color so they're easier to tell apart at a glance.
              </p>
            </div>
            <ToggleSwitch checked={coloredText} onChange={setColoredText} />
          </label>
        </div>

        </div>

        {/* Tab colors & content transparency — combined card with live preview */}
        <div className="bg-card border border-border rounded-xl overflow-hidden mt-3">
          <div className="px-6 py-5 border-b border-border/50">
            <p className="font-medium text-sm">Tab colors &amp; content transparency</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Shown when scene images are off — set a background color and card visibility per tab.
            </p>
          </div>

          {/* Live preview — auto-follows hovered/active row below */}
          <div className="px-6 pt-5 pb-4 border-b border-border/30">
            <div className="rounded-lg overflow-hidden border border-border/40 relative" style={{ height: 158 }}>
              {(() => {
                const ps = solidPreviewSettings[previewSolidTab];
                return (
                  <>
                    <div className="absolute inset-0 bg-background/30" />
                    {ps.enabled && (
                      <div className="absolute inset-0" style={{ backgroundColor: ps.color, opacity: ps.bgOpacity / 100 }} />
                    )}
                    <div className="absolute inset-0 flex flex-col gap-1 p-2.5" style={{ opacity: ps.cardOpacity / 100 }}>
                      <div className="flex items-center gap-1.5 px-1 mb-1">
                        <Music2 className="w-2.5 h-2.5 text-primary shrink-0" />
                        <span className="text-[9px] font-semibold">{previewSolidTab}</span>
                      </div>
                      {[
                        { title: "St James Infirmary Blues", artist: "Louis Armstrong", time: "3:12" },
                        { title: "Take Five",                artist: "Dave Brubeck",    time: "5:24" },
                        { title: "So What",                  artist: "Miles Davis",     time: "9:22" },
                        { title: "Autumn Leaves",            artist: "Bill Evans",      time: "7:06" },
                      ].map((row, i) => (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-card">
                          <div className="flex-1 min-w-0">
                            <p className="text-[8.5px] font-medium truncate leading-tight">{row.title}</p>
                            <p className="text-[7.5px] text-muted-foreground truncate leading-tight">{row.artist}</p>
                          </div>
                          <span className="text-[8px] text-muted-foreground tabular-nums shrink-0">{row.time}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
            {!solidPreviewSettings[previewSolidTab].enabled && (
              <p className="text-[10px] text-muted-foreground mt-2">Enable this tab's toggle below to preview its background color.</p>
            )}
          </div>

          {/* Per-tab rows — color swatch + 2 sliders + toggle */}
          {([
            { label: "Library",    enabled: librarySolid,    color: libraryColor,    bgOpacity: libraryOpacity,    cardOp: libCardOp,    setEnabled: setLibrarySolid,    setColor: setLibraryColor,    setBgOpacity: setLibraryOpacity,    setCardOp: setLibCardOp    },
            { label: "Radio",      enabled: radioSolid,      color: radioColor,      bgOpacity: radioOpacity,      cardOp: radioCardOp,  setEnabled: setRadioSolid,      setColor: setRadioColor,      setBgOpacity: setRadioOpacity,      setCardOp: setRadioCardOp  },
            { label: "Browse",     enabled: browseSolid,     color: browseColor,     bgOpacity: browseOpacity,     cardOp: browseCardOp, setEnabled: setBrowseSolid,     setColor: setBrowseColor,     setBgOpacity: setBrowseOpacity,     setCardOp: setBrowseCardOp },
            { label: "Stream",     enabled: streamSolid,     color: streamColor,     bgOpacity: streamOpacity,     cardOp: streamCardOp, setEnabled: setStreamSolid,     setColor: setStreamColor,     setBgOpacity: setStreamOpacity,     setCardOp: setStreamCardOp },
            { label: "Audiobooks", enabled: audiobooksSolid, color: audiobooksColor, bgOpacity: audiobooksOpacity, cardOp: abCardOp,     setEnabled: setAudiobooksSolid, setColor: setAudiobooksColor, setBgOpacity: setAudiobooksOpacity, setCardOp: setAbCardOp     },
          ] as const).map(({ label, enabled, color, bgOpacity, cardOp, setEnabled, setColor, setBgOpacity, setCardOp }) => (
            <div key={label} className="px-6 py-4 border-b border-border/30 last:border-0" onMouseEnter={() => setPreviewSolidTab(label)}>
              {/* Swatch + label/hex + toggle */}
              <div className="flex items-center gap-3 mb-2.5">
                <label
                  className="relative w-8 h-6 rounded-md ring-1 ring-white/20 overflow-hidden cursor-pointer flex-shrink-0 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: color }}
                  title={`Pick ${label} background color`}
                >
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{label}</p>
                  <p className="text-[10px] font-mono text-muted-foreground leading-tight" style={{ color }}>{color}</p>
                </div>
                <ToggleSwitch checked={enabled} onChange={setEnabled} />
              </div>
              {/* Two sliders side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`flex items-center gap-1.5 transition-opacity ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
                  <span className="text-[10px] text-muted-foreground shrink-0 w-16">BG intensity</span>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={bgOpacity}
                    onChange={(e) => setBgOpacity(Number(e.target.value))}
                    className="transparency-slider flex-1"
                  />
                  <span className="text-xs font-semibold text-amber-500 tabular-nums w-8 text-right shrink-0">{bgOpacity}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground shrink-0 w-10">Cards</span>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={cardOp}
                    onChange={(e) => setCardOp(Number(e.target.value))}
                    className="transparency-slider flex-1"
                  />
                  <span className="text-xs font-semibold text-amber-500 tabular-nums w-8 text-right shrink-0">{cardOp}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        </>
      )}
      </section>
    );
}
function ApiTokenSection() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ hasToken: boolean; tokenHint?: string; createdAt?: string } | null>(null);
  const [visibleToken, setVisibleToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/auth/token", { credentials: "include" });
      setTokenInfo(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (open) void load();
    else { setVisibleToken(null); setCopied(false); }
  }, [open]);

  const handleGenerate = async () => {
    if (tokenInfo?.hasToken) {
      const ok = window.confirm(
        "Generating a new token will invalidate the current one everywhere it's used " +
        "— including the URLinc Companion app, the browser extension, or any other device " +
        "still connected with it.\n\nContinue?"
      );
      if (!ok) return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/token", { method: "POST", credentials: "include" });
      const data = await res.json() as { token: string };
      setVisibleToken(data.token);
      void load();
      toast({ title: "New API token generated" });
    } catch {
      toast({ title: "Failed to generate token", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleReveal = async () => {
    setRevealing(true);
    try {
      const res = await fetch("/api/auth/token/full", { credentials: "include" });
      const data = await res.json() as { token: string };
      setVisibleToken(data.token);
    } catch {
      toast({ title: "Could not retrieve token", variant: "destructive" });
    } finally { setRevealing(false); }
  };

  const handleRevoke = async () => {
    const ok = window.confirm(
      "This immediately disconnects the URLinc Companion app and anything else currently " +
      "using this token — you'd need to generate a new one to reconnect them.\n\nRevoke the token?"
    );
    if (!ok) return;
    setLoading(true);
    try {
      await fetch("/api/auth/token", { method: "DELETE", credentials: "include" });
      setVisibleToken(null);
      void load();
      toast({ title: "Token revoked" });
    } catch {
      toast({ title: "Failed to revoke token", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleCopy = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Key className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            API Token
          </h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && (
        <div className="bg-card border border-border rounded-xl px-6 py-5 space-y-4">
          <p className="text-sm text-muted-foreground">
            Use this token to authenticate the URLinc Companion app on your desktop. Keep it private — anyone with this token can add items to your library.
          </p>

          {visibleToken ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Your token — copy it somewhere safe:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg font-mono break-all select-all">
                  {visibleToken}
                </code>
                <Button size="sm" variant="outline" onClick={() => void handleCopy(visibleToken)}>
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          ) : tokenInfo?.hasToken ? (
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg">
              <Key className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Token active</p>
                <p className="text-xs text-muted-foreground font-mono">{tokenInfo.tokenHint}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void handleReveal()} disabled={revealing}>
                {revealing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Show"}
              </Button>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleGenerate()} disabled={loading}>
              <Key className="w-4 h-4 mr-2" />
              {tokenInfo?.hasToken ? "Regenerate Token" : "Generate Token"}
            </Button>
            {tokenInfo?.hasToken && (
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => void handleRevoke()} disabled={loading}>
                Revoke
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { settings, update } = useSettings();
  const [openAbout, setOpenAbout] = useState(false);
  const [openLibraryTools, setOpenLibraryTools] = useState(false);
  const [mergingShows, setMergingShows] = useState(false);
  const [openPlayback, setOpenPlayback] = useState(false);
  const [openTvMode, setOpenTvMode] = useState(false);
  
  const { enabled: tvEnabled, autoDetected, override: tvOverride, setOverride: setTvOverride } = useTv();
  const [openAddingContent, setOpenAddingContent] = useState(false);
  const [openAiFeatures, setOpenAiFeatures] = useState(false);
  const [openAddOns, setOpenAddOns] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#notifications") {
      setTimeout(() => {
        document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <Settings className="w-8 h-8 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">Manage your library tools and preferences.</p>
        </div>

        <div className="space-y-8">
          {/* About */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setOpenAbout((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
                <Info className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">About</h2>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openAbout ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openAbout && (
            <div className="bg-card border border-border rounded-xl px-6 py-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                URLinc is your personal media library — store, organize, and enjoy your videos, photos and more all in one place. If you're enjoying this app feel free to buy me a coffee or make a small donation.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Designed and written by <span className="text-foreground font-medium">Gary Kuper</span>, with the help of AI agents in Claude, ChatGPT, Base44, and my lovely wife <span className="text-foreground font-medium">Angela Kuper</span>.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                In case you haven't noticed the references to "Tayler-made" throughout this app — it refers to our daughter, <span className="text-foreground font-medium">Tayler Kuper</span>. She is the reason we developed this fun little app, and we hope you truly enjoy it. 💙
              </p>
              <div className="pt-1 flex flex-wrap gap-3">
                <a
                  href={SUPPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-semibold text-sm transition-colors shadow-sm"
                >
                  <Coffee className="w-4 h-4" />
                  Support URLinc
                </a>
              </div>
            </div>
            )}
          </section>

          <AppearanceSection />
          <ScreensaverSection />
          <section>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setOpenLibraryTools((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
                <Wrench className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                  Library Tools
                </h2>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openLibraryTools ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openLibraryTools && (
            <div className="space-y-3">
              <div className="bg-card border border-border rounded-xl px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">Find Duplicates</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Scan your library for videos and photos with matching URLs.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation("/duplicates")}>
                    <Copy className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">Merge Duplicate Shows</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Combine TV shows that got split into two entries by a small naming difference.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={mergingShows}
                    onClick={async () => {
                      setMergingShows(true);
                      try {
                        const res = await fetch("/api/playlists/merge-duplicate-shows", { credentials: "include" });
                        if (!res.ok) throw new Error();
                        const data = await res.json() as { merged: number };
                        toast({
                          title: data.merged > 0
                            ? `Merged ${data.merged} duplicate show${data.merged !== 1 ? "s" : ""}`
                            : "No duplicate shows found",
                        });
                      } catch {
                        toast({ title: "Failed to check for duplicate shows", variant: "destructive" });
                      } finally {
                        setMergingShows(false);
                      }
                    }}
                  >
                    <Tv2 className="w-4 h-4 mr-2" />
                    {mergingShows ? "Checking…" : "Check & Merge"}
                  </Button>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">Find Broken Links</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Check your videos against YouTube and remove ones that are no longer available.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation("/broken-links")}>
                    <Link className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-sm">Find Broken Photo Links</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Check your vault photos for external image URLs that are no longer accessible.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLocation("/broken-photos")}>
                    <Link className="w-4 h-4 mr-2" />
                    Open
                  </Button>
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl px-6 py-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-medium text-sm">Trash</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Deleted videos and photos are kept here for 30 days before being permanently removed.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setLocation("/manage/trash")}>
                      <Film className="w-4 h-4 mr-2" />
                      Video Trash
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setLocation("/manage-photos/trash")}>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Photo Trash
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setOpenAddOns((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
                <Puzzle className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                  Helpful Add-Ons
                </h2>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openAddOns ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openAddOns && (
              <div className="space-y-3">
                <div className="bg-card border border-border rounded-xl px-6 py-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">Browser Extension</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Save videos, photos, audio, and links to your library from any page while you browse.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href="https://chromewebstore.google.com/detail/jcmnldafohnmelpfdgdobmpodhapnjgj"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Puzzle className="w-4 h-4 mr-2" />
                        Get Extension
                      </a>
                    </Button>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl px-6 py-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-sm">
                        URLinc Helper{" "}
                        <span className="text-xs text-muted-foreground font-normal ml-1">Windows</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Launch Deck on your desktop — right-click any file to add it, and launch apps directly from URLinc.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href="https://github.com/gkup22-cmd/URLair/releases/latest/download/URLinc-Helper.exe"
                        download
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Helper
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setOpenPlayback((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
                <Tv2 className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                  Playback
                </h2>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openPlayback ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openPlayback && (
            <div className="bg-card border border-border rounded-xl px-6 py-5">
              <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                <div>
                  <p className="font-medium text-sm">Open videos in full screen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically expands the video player to fill the screen when you open a video.
                  </p>
                </div>
                <button
                  role="checkbox"
                  aria-checked={settings.autoFullscreen}
                  onClick={() => update("autoFullscreen", !settings.autoFullscreen)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    settings.autoFullscreen ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                      settings.autoFullscreen ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>
            </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setOpenTvMode((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
                <Tv2 className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                  TV Mode
                </h2>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openTvMode ? "rotate-180" : ""}`} />
              </button>
              {tvEnabled && (
                <span className="ml-1 text-[10px] font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded uppercase tracking-wide">
                  On
                </span>
              )}
            </div>
            {openTvMode && (
            <div className="bg-card border border-border rounded-xl px-6 py-5 space-y-4">
              <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                <div>
                  <p className="font-medium text-sm">Enable TV Mode</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Larger text, bigger navigation targets, and arrow-key / d-pad navigation for remote controls.
                    {autoDetected && tvOverride === null && (
                      <span className="ml-1 text-primary">Auto-detected from your browser.</span>
                    )}
                  </p>
                </div>
                <button
                  role="checkbox"
                  aria-checked={tvEnabled}
                  onClick={() => setTvOverride(tvEnabled ? false : true)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    tvEnabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                      tvEnabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>
              {tvOverride !== null && (
                <div className="pt-1">
                  <button
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                    onClick={() => setTvOverride(null)}
                  >
                    Reset to auto-detect {autoDetected ? "(auto would enable)" : "(auto would disable)"}
                  </button>
                </div>
              )}
              <div className="pt-1 border-t border-border">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">D-pad navigation:</span> Arrow keys move focus between items.
                  Enter activates. Backspace goes back.
                </p>
              </div>
            </div>
            )}
          </section>

          

          <section>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setOpenAddingContent((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                  Adding Content
                </h2>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openAddingContent ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openAddingContent && (
            <div className="bg-card border border-border rounded-xl px-6 py-5">
              <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                <div>
                  <p className="font-medium text-sm">Pre-select "Newly Added" as default category</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When adding a video or photo, the category is automatically set to "Newly Added". You can still change it before saving.
                  </p>
                </div>
                <button
                  role="checkbox"
                  aria-checked={settings.defaultCategoryNewlyAdded}
                  onClick={() => update("defaultCategoryNewlyAdded", !settings.defaultCategoryNewlyAdded)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    settings.defaultCategoryNewlyAdded ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                      settings.defaultCategoryNewlyAdded ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>
            </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setOpenAiFeatures((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
                  AI Features
                </h2>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openAiFeatures ? "rotate-180" : ""}`} />
              </button>
            </div>
            {openAiFeatures && (
            <div className="bg-card border border-border rounded-xl px-6 py-5">
              <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                <div>
                  <p className="font-medium text-sm">Find Similar Items</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Shows a "Find Similar Items" button on photos that uses AI to identify objects and suggest shoppable products.
                  </p>
                </div>
                <button
                  role="checkbox"
                  aria-checked={settings.findSimilarItems}
                  onClick={() => update("findSimilarItems", !settings.findSimilarItems)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    settings.findSimilarItems ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                      settings.findSimilarItems ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>

              <div className="border-t border-border" />

              <label className="flex items-center justify-between gap-4 cursor-pointer select-none">
                <div>
                  <p className="font-medium text-sm">Find Similar Videos</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Shows a "Find Similar Videos" button on video pages that searches YouTube for related content.
                  </p>
                </div>
                <button
                  role="checkbox"
                  aria-checked={settings.findSimilarVideos}
                  onClick={() => update("findSimilarVideos", !settings.findSimilarVideos)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    settings.findSimilarVideos ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                      settings.findSimilarVideos ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>
            </div>
            )}
          </section>

          <PlexIntegrationSection />

          <PreferredPlayerToggle />

          <JellyfinIntegrationSection />

          <FriendsSection />

          <SharedVideosSection />

          <SharedPlaylistsSection />

          <SharedCategoriesSection />
          <SharedPhotoCategoriesSection />
          <SharedVaultSourcesSection />

          <AutoBackupSection />
          <ExportImportSection />
          <ApiTokenSection />

          <CategoriesSection />

          <PlaylistsSection />

          <AlbumsSection />

          <LibraryUsageSection />

          <DangerZoneSection />

        </div>
      </div>
    </Layout>
  );
}

// Planned free-tier limits — update these when pricing is finalised.
const FREE_LIMITS = { videos: 15_000, photos: 500, audio: 1_000 } as const;

interface ArchiveCandidate {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  category: string;
  createdAt: string;
}

function UsageBar({ count, limit }: { count: number; limit: number }) {
  const pct = Math.min(count / limit, 1);
  const warn = pct >= 0.8;
  const full = pct >= 1;
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${full ? "bg-destructive" : warn ? "bg-amber-500" : "bg-primary"}`}
        style={{ width: `${Math.round(pct * 100)}%` }}
      />
    </div>
  );
}

function LibraryUsageSection() {
  const [open, setOpen] = useState(false);
  const [showCandidates, setShowCandidates] = useState(false);

  const { data: videoData } = useQuery<{ total: number }>({
    queryKey: ["lib-usage-videos"],
    queryFn: async () => { const r = await fetch("/api/videos/count", { credentials: "include" }); return r.json() as Promise<{ total: number }>; },
    enabled: open,
  });
  const { data: photoData } = useQuery<{ total: number }>({
    queryKey: ["lib-usage-photos"],
    queryFn: async () => { const r = await fetch("/api/photos/count", { credentials: "include" }); return r.json() as Promise<{ total: number }>; },
    enabled: open,
  });
  const { data: audioData } = useQuery<{ total: number }>({
    queryKey: ["lib-usage-audio"],
    queryFn: async () => { const r = await fetch("/api/music/count", { credentials: "include" }); return r.json() as Promise<{ total: number }>; },
    enabled: open,
  });
  const { data: candidates = [], isFetching: candidatesLoading } = useQuery<ArchiveCandidate[]>({
    queryKey: ["lib-archive-candidates"],
    queryFn: async () => { const r = await fetch("/api/videos/archive-candidates?limit=12", { credentials: "include" }); return r.json() as Promise<ArchiveCandidate[]>; },
    enabled: open && showCandidates,
  });

  const videos = videoData?.total ?? 0;
  const photos = photoData?.total ?? 0;
  const audio = audioData?.total ?? 0;

  const videoWarn = videos / FREE_LIMITS.videos >= 0.8;
  const anyWarn = open && (
    videoWarn ||
    photos / FREE_LIMITS.photos >= 0.8 ||
    audio / FREE_LIMITS.audio >= 0.8
  );

  const rows: { label: string; icon: React.ReactNode; count: number; limit: number }[] = [
    { label: "Videos", icon: <Film className="w-4 h-4 text-muted-foreground" />, count: videos, limit: FREE_LIMITS.videos },
    { label: "Photos", icon: <Images className="w-4 h-4 text-muted-foreground" />, count: photos, limit: FREE_LIMITS.photos },
    { label: "Audio", icon: <Music2 className="w-4 h-4 text-muted-foreground" />, count: audio, limit: FREE_LIMITS.audio },
  ];

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase group-hover:text-foreground transition-colors">
            Library Usage
          </h2>
          {anyWarn && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30">
              <TriangleAlert className="w-3 h-3" /> Nearing limit
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="divide-y divide-border">
            {rows.map(({ label, icon, count, limit }) => {
              const pct = count / limit;
              const warn = pct >= 0.8;
              const full = pct >= 1;
              return (
                <div key={label} className="px-5 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {icon}
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(warn || full) && (
                        <TriangleAlert className={`w-4 h-4 ${full ? "text-destructive" : "text-amber-500"}`} />
                      )}
                      <span className={`text-xs font-mono tabular-nums ${full ? "text-destructive" : warn ? "text-amber-500" : "text-muted-foreground"}`}>
                        {count.toLocaleString()} / {limit.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <UsageBar count={count} limit={limit} />
                  {warn && !full && (
                    <p className="text-xs text-amber-500">
                      You're at {Math.round(pct * 100)}% of the free limit. Export older content to free up space.
                    </p>
                  )}
                  {full && (
                    <p className="text-xs text-destructive">
                      You've reached the free limit for {label.toLowerCase()}. Export and archive older content to continue adding more.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Archive suggestion panel — only shown when videos are near limit */}
          {videoWarn && (
            <div className="border-t border-border">
              <button
                onClick={() => setShowCandidates((s) => !s)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm hover:bg-accent/20 transition-colors"
              >
                <span className="flex items-center gap-2 font-medium text-amber-500">
                  <Archive className="w-4 h-4" />
                  Suggested for export — oldest videos
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${showCandidates ? "rotate-180" : ""}`} />
              </button>

              {showCandidates && (
                <div className="border-t border-border">
                  {candidatesLoading ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">Loading suggestions…</div>
                  ) : candidates.length === 0 ? (
                    <div className="px-5 py-6 text-sm text-muted-foreground text-center">No suggestions available.</div>
                  ) : (
                    <>
                      <p className="px-5 pt-3 pb-1 text-xs text-muted-foreground">
                        These are your oldest videos — good candidates to export and remove from your active library to free up space.
                      </p>
                      <div className="divide-y divide-border max-h-[320px] overflow-y-auto">
                        {candidates.map((c) => (
                          <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                            {c.thumbnailUrl ? (
                              <img src={c.thumbnailUrl} alt={c.title} className="w-14 h-9 rounded object-cover shrink-0" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <div className="w-14 h-9 rounded bg-muted flex items-center justify-center shrink-0">
                                <Film className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{c.title}</p>
                              <p className="text-xs text-muted-foreground">{c.category} · Added {new Date(c.createdAt).getFullYear()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="px-5 py-3 bg-muted/20 border-t border-border">
                        <p className="text-xs text-muted-foreground">
                          Use <strong>Settings → Export / Import → Videos</strong> to Export/ Save your full library before removing anything.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-3 bg-muted/30 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Limits shown are for free accounts. Exported libraries are yours to keep — use Settings → Export / Import to back up and archive content at any time.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function DangerZoneSection() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const MAGIC = "DeLeTe";
  const ready = confirmText === MAGIC;

  const handleDelete = async () => {
    if (!ready) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      navigate("/login");
    } catch {
      toast({ title: "Something went wrong — your account was not deleted.", variant: "destructive" });
      setDeleting(false);
    }
  };

  return (
    <section className="mt-10 rounded-2xl border border-destructive/40 bg-destructive/5 px-6 py-5">
      <h2 className="text-base font-semibold text-destructive mb-1">Danger Zone</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Permanently delete your URLinc account and all associated data — videos, photos, music,
        playlists, shortcuts, settings, and everything else. This cannot be undone.
      </p>
      <Button variant="destructive" onClick={() => { setConfirmText(""); setOpen(true); }}>
        Delete My Account
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!deleting) setOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <p>
              This will permanently erase <strong>everything</strong> — your library, playlists,
              photos, vault, shortcuts, watch history, and your account itself.
              There is no recovery.
            </p>
            <p className="text-muted-foreground">
              Type <span className="font-mono font-bold text-foreground">{MAGIC}</span> exactly
              (case-sensitive) to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-destructive"
              placeholder={MAGIC}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={!ready || deleting}
            >
              {deleting ? "Deleting…" : "Permanently Delete My Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
