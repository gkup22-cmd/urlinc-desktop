import { useState, useRef, useEffect, useCallback, Component } from "react";
import { openUrl } from "@/lib/openUrl";
// redeploy v10
import type { ReactNode, ErrorInfo } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { AdaptiveThumbnail } from "@/components/AdaptiveThumbnail";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CategorySelect } from "@/components/category-select";
import {
  useGetVideo,
  useUpdateVideo,
  useDeleteVideo,
  useFetchVideoDescriptionById,
  useListPlaylists,
  useAddVideoToPlaylist,
  useGetPlaylist,
  useListCategories,
  getGetVideoQueryKey,
  getListVideosQueryKey,
  getGetVideoStatsQueryKey,
  getGetRecentVideosQueryKey,
  getListPlaylistsQueryKey,
  getGetPlaylistQueryKey,
  getListCategoriesQueryKey,
  getInfiniteListVideosQueryKey,
  getGetVideoCountQueryKey,
  useGetVideoSimilarVideos,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { getVideoThumbnail, getEmbedUrl, detectPlatform, getYoutubeVideoId, isFacebookUrl } from "@/lib/youtube";
import { 
  ArrowLeft, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  X, 
  Save, 
  CalendarDays,
  FolderOpen,
  Maximize2,
  Minimize2,
  ListVideo,
  ChevronDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Upload,
  Clipboard,
  Plus,
  Share2,
  Send,
  Users,
  Tv2,
  Loader2,
  Sparkles,
  Tv as Youtube,
  PictureInPicture2,
  Star,
  GripVertical,
  ShoppingBag,
} from "lucide-react";
import { useVideoFavorites } from "@/hooks/use-video-favorites";
import { useAuth } from "@workspace/replit-auth-web";
import { WatchTogetherButton, SessionStatusBar, ChatPanel, useWatchSession, type Participant, type ChatMessage, type WatchSession, type TriviaData } from "@/components/watch-session";
import { useGroupIntercom } from "@/hooks/useGroupIntercom";
import { useMiniPlayer, type MiniPlayerVideo } from "@/components/MiniPlayer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// Catches any React render error inside the player so the rest of the page
// keeps working and the user gets a friendly "open externally" fallback.
class PlayerErrorBoundary extends Component<
  { url: string; label: string; children: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() { return { crashed: true }; }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[PlayerErrorBoundary]", err, info);
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-black/90 text-center px-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            This video can't be played directly.
          </p>
          <Button asChild size="sm">
            <a href={this.props.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open on {this.props.label}
            </a>
          </Button>
          <button
            className="text-xs text-muted-foreground/50 underline underline-offset-2 hover:text-muted-foreground"
            onClick={() => this.setState({ crashed: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function cleanTitleForSearch(title: string): string {
  return title
    .replace(/\s*\|.*$/, "")                                    // strip " | Channel Name" suffixes
    .replace(/⭐\s*[\d.]+[^)]*$/, "")                          // strip "⭐ 6.6 | Action, Drama"
    .replace(/\s*\(ft\..*?\)/gi, "")                           // strip "(ft. Actor Name)"
    .replace(/\s*\(starring[^)]*\)/gi, "")                     // strip "(starring X)"
    .replace(/\s*\(\d{4}\)\s*$/, "")                           // strip trailing year "(1944)"
    .replace(/\b(non-stop|full movie|full episode|full length|complete series|vol\.\s*\d+|volume\s*\d+)\b/gi, "")
    .replace(/!+/g, "")                                         // strip exclamation marks
    .replace(/\s+/g, " ")
    .trim();
}

function getWatchOnLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const known: Record<string, string> = {
      "tubitv.com": "Tubi",
      "pluto.tv": "Pluto TV",
      "peacocktv.com": "Peacock",
      "hulu.com": "Hulu",
      "disneyplus.com": "Disney+",
      "netflix.com": "Netflix",
      "primevideo.com": "Prime Video",
      "max.com": "Max",
      "paramountplus.com": "Paramount+",
    };
    return known[hostname] ?? hostname;
  } catch {
    return "this site";
  }
}

function PlayerOverlay({ containerRef, onPlay }: { containerRef: React.RefObject<HTMLDivElement | null>; onPlay: () => void }) {
  return (
    <div
      className="absolute inset-0 z-10 cursor-pointer"
      onClick={onPlay}
    />
  );
}

function FullscreenButton({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  };

  return (
    <button
      onClick={handleFullscreen}
      className="absolute bottom-3 right-3 p-1.5 rounded bg-black/70 text-white/70 hover:text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
      title="Fullscreen"
    >
      <Maximize2 className="h-3.5 w-3.5" />
    </button>
  );
}

function FbPlayer({ embedUrl, title, originalUrl }: { embedUrl: string; title: string; originalUrl: string }) {
  const [failed, setFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  if (failed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-black/90 text-center px-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          This Facebook video couldn't be embedded — it may be set to private or have sharing restrictions.
        </p>
        <Button asChild size="sm">
          <a href={originalUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Watch on Facebook
          </a>
        </Button>
        <button
          className="text-xs text-muted-foreground/50 underline underline-offset-2 hover:text-muted-foreground transition-colors"
          onClick={() => setFailed(false)}
        >
          Try embedding again
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full" data-testid="facebook-player">
      <iframe
        src={embedUrl}
        title={title}
        className="w-full h-full"
        style={{ border: "none", overflow: "hidden" }}
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
      />
      {!isPlaying && (
        <PlayerOverlay containerRef={containerRef} onPlay={() => setIsPlaying(true)} />
      )}
      <div className={`transition-opacity duration-300 ${isPlaying ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <button
          onClick={() => setFailed(true)}
          className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/70 text-[10px] text-white/60 hover:text-white hover:bg-black/90 transition-colors backdrop-blur-sm"
          title="Video not loading?"
        >
          Not working?
        </button>
      </div>
      <div className={`transition-opacity duration-300 ${isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <FullscreenButton containerRef={containerRef} />
      </div>
    </div>
  );
}

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal("")),
});
function PopOutButton({ video, onPopOut, iconOnly }: { video: { id: number; title: string; youtubeUrl: string; thumbnailUrl?: string | null }; onPopOut?: () => number | undefined; iconOnly?: boolean }) {
  const { openMiniPlayer } = useMiniPlayer();
  const handleClick = () => {
    const startSeconds = onPopOut?.();
    openMiniPlayer({
      id: video.id,
      title: video.title,
      youtubeUrl: video.youtubeUrl,
      thumbnailUrl: video.thumbnailUrl,
      startSeconds,
    });
  };
  if (iconOnly) {
    return (
      <button
        onClick={handleClick}
        title="Pop Out"
        className="p-1.5 rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
      >
        <PictureInPicture2 className="w-4 h-4" />
      </button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <PictureInPicture2 className="mr-2 h-4 w-4" />
      Pop Out
    </Button>
  );
}
export function VideoDetail() {
  const [, params] = useRoute("/video/:id");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const playlistIdParam = new URLSearchParams(search).get("playlist");
  const playlistContextId = playlistIdParam ? parseInt(playlistIdParam, 10) : null;
  const autoplayParam = new URLSearchParams(search).get("autoplay") === "1";
  const sessionParam = new URLSearchParams(search).get("session");
  const inviteTokenParam = new URLSearchParams(search).get("token");
  // Set when returning from the MiniPlayer via "Expand" so playback resumes
  // where the pop-out left off instead of restarting from the beginning.
  const resumeAtParam = new URLSearchParams(search).get("t");

  const [isEditing, setIsEditing] = useState(() => new URLSearchParams(search).get("edit") === "true");
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);
  const playlistMenuRef = useRef<HTMLDivElement>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const [friends, setFriends] = useState<{ id: string; email: string; firstName: string | null; lastName: string | null; friendshipId: number }[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [selectedShareFriends, setSelectedShareFriends] = useState<Set<string>>(new Set());
  const [similarVideosOpen, setSimilarVideosOpen] = useState(false);
  const [wishListedYt, setWishListedYt] = useState<Set<string>>(new Set());
  const [amazonQuery, setAmazonQuery] = useState("");
  const [amazonTags, setAmazonTags] = useState<string[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const similarVideos = useGetVideoSimilarVideos();
  const ytContainerRef = useRef<HTMLDivElement>(null);
  // What actually goes fullscreen — wraps the video AND (during Watch
  // Together) the chat panel/session bar as normal children, not just the
  // video. Portaling chat into whatever ended up fullscreen turned out
  // fragile (see git history), because it depended on the fullscreen
  // target reliably settling onto ytContainerRef and two separate listeners
  // agreeing on that. Making the whole block fullscreen together sidesteps
  // that class of bug entirely — chat/status bar are just normal descendants
  // of the fullscreen element, no portal or race involved.
  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
  const [isWrapperFullscreen, setIsWrapperFullscreen] = useState(false);
  // True after the user deliberately exits fullscreen via our own exit
  // button — the Watch Together sync handler otherwise auto-re-enters
  // fullscreen on the very next sync tick (autoFullscreen setting), snapping
  // straight back a second later regardless of what the user just chose.
  // Reset the moment fullscreen is genuinely (re)entered by any means, so
  // auto-fullscreen behaves normally again for whatever happens next.
  const userExitedFullscreenRef = useRef(false);

  // Player control bar (Favorite/Share/Pop-out/Watch Together/Source/Fullscreen):
  // fades in on mouse movement over the player, fades out after a few seconds
  // idle, mirroring YouTube's own controls. Stays visible the whole time a
  // dropdown (Share or Watch Together) is open, via the effect below.
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true);
  const playerControlsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMouseOverPlayerRef = useRef(false);
  const [watchTogetherOpen, setWatchTogetherOpen] = useState(false);
  const dropdownOpenRef = useRef(false);

  // How dim the control bar sits while fullscreen (there's nowhere to move
  // the cursor off-video to trigger the hide-on-leave fade there, so it's
  // dimmed instead of hidden). Dragged via the grip handle at the top of the
  // bar and remembered across sessions.
  const [fullscreenControlsOpacity, setFullscreenControlsOpacity] = useState<number>(() => {
    const stored = Number(localStorage.getItem("vvm_fullscreen_controls_opacity"));
    return stored >= 15 && stored <= 100 ? stored : 40;
  });
  const opacityDragRef = useRef<{ startY: number; startOpacity: number } | null>(null);
  const [isDraggingOpacity, setIsDraggingOpacity] = useState(false);

  // Shared by both grip handles (one above the icons, one below -- a single
  // handle ran out of vertical screen room to drag toward one end before the
  // cursor hit the edge of the screen, forcing repeated re-grabs). While
  // dragging we bypass the hover:opacity-100 class entirely and set opacity
  // via inline style instead: :hover matches the instant the cursor lands on
  // the handle (a descendant of the bar), which would otherwise pin the bar
  // at full opacity for the whole drag and only reveal the real value after
  // release -- exactly the "can't see it until I let go" symptom.
  const handleOpacityDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    opacityDragRef.current = { startY: e.clientY, startOpacity: fullscreenControlsOpacity };
    setIsDraggingOpacity(true);
  }, [fullscreenControlsOpacity]);

  const handleOpacityDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!opacityDragRef.current) return;
    const delta = opacityDragRef.current.startY - e.clientY;
    const next = Math.min(100, Math.max(15, opacityDragRef.current.startOpacity + delta / 2));
    setFullscreenControlsOpacity(Math.round(next));
  }, []);

  const handleOpacityDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!opacityDragRef.current) return;
    opacityDragRef.current = null;
    setIsDraggingOpacity(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    localStorage.setItem("vvm_fullscreen_controls_opacity", String(fullscreenControlsOpacity));
  }, [fullscreenControlsOpacity]);

  const showPlayerControls = useCallback(() => {
    setPlayerControlsVisible(true);
    if (playerControlsHideTimer.current) clearTimeout(playerControlsHideTimer.current);
  }, []);

  const scheduleHidePlayerControls = useCallback(() => {
    if (playerControlsHideTimer.current) clearTimeout(playerControlsHideTimer.current);
    playerControlsHideTimer.current = setTimeout(() => {
      if (!dropdownOpenRef.current) setPlayerControlsVisible(false);
    }, 3000);
  }, []);

  // mousemove never reaches our code while the cursor sits over the YouTube
  // iframe -- it's a separate cross-origin document, so the browser never
  // dispatches those events to the parent page for it. But mouseenter/
  // mouseleave on the wrapping div DO fire reliably for iframe boundary
  // crossings (that's the browser's own hit-testing, not something the
  // iframe's content has to cooperate with). So instead of hiding on a fixed
  // idle timer that has no way of knowing the cursor is still resting on the
  // video, we show the controls for as long as the cursor is anywhere inside
  // this box and only start the fade-out countdown once it actually leaves.
  useEffect(() => {
    setPlayerControlsVisible(true);
    scheduleHidePlayerControls();
    return () => { if (playerControlsHideTimer.current) clearTimeout(playerControlsHideTimer.current); };
  }, [scheduleHidePlayerControls]);

  useEffect(() => {
    dropdownOpenRef.current = shareMenuOpen || watchTogetherOpen;
    if (dropdownOpenRef.current || isMouseOverPlayerRef.current) {
      showPlayerControls();
    } else {
      scheduleHidePlayerControls();
    }
  }, [shareMenuOpen, watchTogetherOpen, showPlayerControls, scheduleHidePlayerControls]);

  const handlePlayerMouseEnter = useCallback(() => {
    isMouseOverPlayerRef.current = true;
    showPlayerControls();
  }, [showPlayerControls]);

  const handlePlayerMouseLeave = useCallback(() => {
    isMouseOverPlayerRef.current = false;
    scheduleHidePlayerControls();
  }, [scheduleHidePlayerControls]);

  // A click into the iframe shifts keyboard focus away from our window,
  // which we CAN observe -- kept as a fallback "user is interacting again"
  // signal for edge cases (e.g. focus moved without a preceding mouseenter).
  useEffect(() => {
    const handleWindowBlur = () => showPlayerControls();
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [showPlayerControls]);
  // Injection zone: React declares no children here — YT API owns the iframe inside
  const ytOuterRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayerRef = useRef<any>(null);
  const { closeMiniPlayer, currentVideo: poppedOutVideo, pulseBackButton } = useMiniPlayer();
  // closeMiniPlayer is a stable reference (useCallback with empty deps in a
  // provider that now lives for the app's whole lifetime), so it's safe to
  // read directly inside the player's event closures below without a ref.
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  

  const suppressSyncRef = useRef(false);
  const sendSyncRef = useRef<(t: number, playing: boolean) => void>(() => {});
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchSessionRef = useRef<ReturnType<typeof useWatchSession> | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [triviaData, setTriviaData] = useState<TriviaData | null>(null);
  const [chatMode, setChatMode] = useState<"language-badge" | "trivia">("language-badge");
  // True when the guest wants fullscreen (from autoFullscreen setting) but the
  // browser blocked the programmatic request — shows a manual prompt instead.
  const [wantFullscreen, setWantFullscreen] = useState(false);
  // Intro state
  const [intro, setIntro] = useState<{ objectPath: string; fileType: string; enabled: boolean; url: string; isSystemDefault?: boolean } | null>(null);
  const [introLoading, setIntroLoading] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(false);
  const introMediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const introFileInputRef = useRef<HTMLInputElement>(null);
  const adminIntroFileInputRef = useRef<HTMLInputElement>(null);
  const introShownRef = useRef(false);
  
  const watchSession = useWatchSession({
    onSync: ({ currentTime, playing }) => {
      // Fullscreen logic runs regardless of whether the player is ready yet —
      // the early return below would otherwise skip it entirely when the player
      // hasn't initialised, leaving wantFullscreen permanently unset.
      if (playing && settingsRef.current?.autoFullscreen && !document.fullscreenElement && !userExitedFullscreenRef.current) {
        const el = fullscreenWrapperRef.current;
        if (el) {
          el.requestFullscreen().catch(() => setWantFullscreen(true));
        } else {
          // Container not mounted yet — flag it; the prompt renders once session is set.
          setWantFullscreen(true);
        }
      }

      if (!ytPlayerRef.current) return;
      suppressSyncRef.current = true;
      const cur = (ytPlayerRef.current.getCurrentTime?.() ?? 0) as number;
      if (Math.abs(cur - currentTime) > 2) ytPlayerRef.current.seekTo(currentTime, true);
      if (playing) {
        ytPlayerRef.current.playVideo();
      } else {
        ytPlayerRef.current.pauseVideo();
      }
      setTimeout(() => { suppressSyncRef.current = false; }, 1000);
    },
    onSessionEnded: () => {
      toast({ title: "Watch session ended" });
      setChatMessages([]);
      setChatOpen(false);
      setWantFullscreen(false);
    },
    onParticipantJoined: (p: Participant) => toast({ title: `${p.name} joined the session` }),
    onParticipantLeft: (p: Participant) => toast({ title: `${p.name} left the session` }),
    onChatMessage: (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    },
    onTyping: (userId: string, name: string) => {
      // Forward to ChatPanel's internal handler via a custom event
      window.dispatchEvent(new CustomEvent("urlinc:typing", { detail: { userId, name } }));
    },
    onReconnected: () => {
      // This client itself silently rejoined via the grace window.
      // If this client is the host (e.g. host had a brief dropout), broadcast
      // the current playback position to bring non-host participants back in sync.
      const session = watchSessionRef.current?.session;
      if (!session || session.hostId !== user?.id) return;
      const player = ytPlayerRef.current;
      if (!player) return;
      const currentTime = (player.getCurrentTime?.() ?? 0) as number;
      const playing = (player.getPlayerState?.() ?? -1) === 1;
      sendSyncRef.current(currentTime, playing);
    },
    onParticipantReconnected: () => {
      // Another participant silently rejoined via the grace window.
      // If we are the host, immediately broadcast the current playback position
      // so their video snaps to the right time within ~1 s.
      const session = watchSessionRef.current?.session;
      if (!session || session.hostId !== user?.id) return;
      const player = ytPlayerRef.current;
      if (!player) return;
      const currentTime = (player.getCurrentTime?.() ?? 0) as number;
      const playing = (player.getPlayerState?.() ?? -1) === 1;
      sendSyncRef.current(currentTime, playing);
    },
    onQueuedChatDiscarded: (count) => {
      toast({
        title: `${count} queued message${count === 1 ? "" : "s"} could not be sent`,
        description: "The session ended before the connection was restored.",
        variant: "destructive",
      });
    },
    onTriviaReady: (data) => setTriviaData(data),
  });

  // Intercom — auto-join the voice room whenever a Watch Together session is active
  const intercom = useGroupIntercom();
  const intercomJoinedRef = useRef(false);
  useEffect(() => {
    const session = watchSession.session;
    if (!session || intercomJoinedRef.current || intercom.joined) return;
    const roomCode = session.sessionId.slice(0, 6).toUpperCase();
    const nickname =
      (typeof localStorage !== "undefined" ? localStorage.getItem("ptt-nickname") : null) ??
      ([user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || "Guest");
    intercomJoinedRef.current = true;
    void intercom.joinRoom(roomCode, nickname);
  }, [watchSession.session?.sessionId]);

  // Auto-join watch session when URL has ?session=:id OR when returning from navigation
  const sessionJoinAttemptedRef = useRef(false);
  useEffect(() => {
    if (sessionJoinAttemptedRef.current || watchSession.session) return;

    // Determine the target session: URL param first, then sessionStorage for this video
    let targetSessionId = sessionParam ?? null;
    let targetToken = inviteTokenParam ?? null;
    if (!targetSessionId) {
      try {
        const stored = sessionStorage.getItem("wt-active-session");
        if (stored) {
          const parsed = JSON.parse(stored) as { sessionId: string; videoId: number | null };
          if (parsed.videoId === id) targetSessionId = parsed.sessionId;
        }
      } catch { /* ignore */ }
    }

    if (!targetSessionId) return;
    sessionJoinAttemptedRef.current = true;
    void (async () => {
      try {
        const res = await fetch(`/api/watch-sessions/${targetSessionId}/join`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(targetToken ? { token: targetToken } : {}),
        });
        if (!res.ok) {
          // Session ended while away — clear stale storage
          try { sessionStorage.removeItem("wt-active-session"); window.dispatchEvent(new Event("wt-session-change")); } catch { /* ignore */ }
          return;
        }
        const data = await res.json() as WatchSession;
        await watchSession.joinSession(data.sessionId, data);
        toast({ title: sessionParam ? "Joined Watch Together session" : "Reconnected to Watch Together session" });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: "instant" });
          });
        });
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionParam, id]);

  const GENERIC_YT_DESC =
    "Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.";

  const [fetchingDesc, setFetchingDesc] = useState(false);
  const { settings, update } = useSettings();

  const { data: video, isLoading, error: videoError } = useGetVideo(id, {
    query: {
      queryKey: getGetVideoQueryKey(id),
      enabled: !!id,
      // Keep the previous video's data while the new video is loading so that
      // ytContainerRef stays mounted in the DOM — if it unmounts the browser
      // immediately exits fullscreen and we lose it for the rest of the playlist.
      placeholderData: keepPreviousData,
    },
  });
  const { data: playlistContext } = useGetPlaylist(playlistContextId ?? 0, {
    query: { queryKey: getGetPlaylistQueryKey(playlistContextId ?? 0), enabled: !!playlistContextId },
  });
  const { isFavorite, toggleFavorite } = useVideoFavorites();

  // Fetch stored trivia so the toggle appears even without a live WS push
  useEffect(() => {
    const url = video?.youtubeUrl;
    if (!url) return;
    fetch(`/api/discover/trivia-by-url?url=${encodeURIComponent(url)}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { triviaData?: TriviaData } | null) => { if (d?.triviaData) setTriviaData(d.triviaData); })
      .catch(() => {});
  }, [video?.youtubeUrl]);

  const playlistVideos = playlistContext?.videos ?? [];
  const currentPlaylistIndex = playlistVideos.findIndex((v) => v.id === id);
  const prevVideo = currentPlaylistIndex > 0 ? playlistVideos[currentPlaylistIndex - 1] : null;
  const nextVideo = currentPlaylistIndex !== -1 && currentPlaylistIndex < playlistVideos.length - 1
    ? playlistVideos[currentPlaylistIndex + 1]
    : null;

  useEffect(() => {
    if (!autoplayParam) return;
    // When autoFullscreen is on and we're not already in fullscreen, leave the
    // overlay visible so the user's first click triggers requestFullscreen() as
    // a genuine user gesture (browsers block programmatic fullscreen from timers).
    // For videos 2+ the container is already fullscreen thanks to keepPreviousData
    // keeping ytContainerRef mounted, so document.fullscreenElement is set and we
    // skip this branch — the overlay hides immediately and the video plays in place.
    if (settings.autoFullscreen && !document.fullscreenElement) return;
    setIsPlaying(true);
    // `settings` is intentionally omitted from deps — it's read from localStorage
    // and stable; we only want this to fire when the video or autoplay flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, autoplayParam]);

  // The YouTube iframe's own native fullscreen button (still present in its
  // controls) sets document.fullscreenElement to the iframe itself, a
  // descendant of fullscreenWrapperRef rather than the wrapper — intercept
  // that and re-target the wrapper instead, so chat/status bar (now normal
  // children of the wrapper, not portaled) stay part of the fullscreen
  // subtree regardless of which fullscreen button the user clicked.
  useEffect(() => {
    const handler = () => {
      const fse = document.fullscreenElement;
      if (!fse) {
        // Fullscreen exited entirely — clear the "want fullscreen" prompt.
        setWantFullscreen(false);
        setIsWrapperFullscreen(false);
        return;
      }
      // Our wrapper is already the fullscreen element — nothing to do.
      if (fse === fullscreenWrapperRef.current) {
        setWantFullscreen(false);
        setIsWrapperFullscreen(true);
        userExitedFullscreenRef.current = false;
        return;
      }
      // A child of our wrapper (i.e. the YouTube iframe) stole fullscreen.
      // Re-request on the wrapper to swap the fullscreen target. Calling
      // exitFullscreen() here too (as this used to) races against the
      // pending swap and sometimes wins, silently kicking the player back
      // out of fullscreen right after entering it — that's what made the
      // toggle flaky. requestFullscreen() alone is sufficient: per spec,
      // calling it while already in fullscreen just switches the fullscreen
      // element without needing an explicit exit first.
      if (fullscreenWrapperRef.current?.contains(fse)) {
        setIsWrapperFullscreen(false); // not settled yet -- next event will confirm
        fullscreenWrapperRef.current?.requestFullscreen().catch(() => {});
      }
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Refs so event callbacks always read the latest values without re-creating the player
  const nextVideoRef = useRef(nextVideo);
  const playlistContextIdRef = useRef(playlistContextId);
  // Fallback: keep full playlist + current id so onStateChange can recompute if nextVideoRef is still null
  const playlistVideosRef = useRef(playlistVideos);
  const currentIdRef = useRef(id);
  // Settings ref so onReady can read current settings without stale closure
  const settingsRef = useRef(settings);
  // Guard against YouTube firing onStateChange=0 (ended) more than once per video
  const hasNavigatedRef = useRef(false);
  // Latest resumeAtParam, read once by onReady so a fresh player (spawned
  // after navigating back from the MiniPlayer) seeks to the right spot.
  const resumeAtRef = useRef<number | null>(null);
  useEffect(() => {
    nextVideoRef.current = nextVideo;
    playlistContextIdRef.current = playlistContextId;
    playlistVideosRef.current = playlistVideos;
    currentIdRef.current = id;
    settingsRef.current = settings;
    sendSyncRef.current = watchSession.sendSync;
    watchSessionRef.current = watchSession;
    resumeAtRef.current = resumeAtParam ? Number(resumeAtParam) : null;
  });

  // Covers the case where this page's player was never destroyed (the user
  // popped out and expanded back without navigating away in between) — the
  // spawnPlayer effect below won't re-run since video.id hasn't changed, so
  // this seeks the still-alive player directly instead of waiting on onReady.
  useEffect(() => {
    if (!resumeAtParam) return;
    const t = Number(resumeAtParam);
    if (!Number.isFinite(t) || typeof ytPlayerRef.current?.seekTo !== "function") return;
    ytPlayerRef.current.seekTo(t, true);
    ytPlayerRef.current.playVideo();
    setIsPlaying(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("t");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, [resumeAtParam]);

  // YouTube IFrame API — the API fully owns the iframe it creates.
  // We use ytOuterRef as a stable container that React declares no children for,
  // then imperatively inject a fresh mount div before each init.
  // player.destroy() is safe here because we manage the outer container ourselves.
  useEffect(() => {
    if (!video) return;
    // keepPreviousData means video?.id may still be the OLD video while the new one
    // is loading. Don't spawn a player for stale data — wait for the real video.
    if (video.id !== id) return;
    const videoId = getYoutubeVideoId(video.youtubeUrl);
    if (!videoId) return;

    const outer = ytOuterRef.current;
    if (!outer) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let localPlayer: any = null;

    const spawnPlayer = () => {
      // Clear any iframe the YT API injected for the previous video
      outer.innerHTML = "";
      const mount = document.createElement("div");
      outer.appendChild(mount);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      localPlayer = new (window as any).YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: (autoplayParam || resumeAtParam) ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          // Removes YouTube's own native fullscreen button. It targets the
          // iframe itself, not fullscreenWrapperRef, so using it relies on
          // our swap-intercept effect correctly re-targeting fullscreen to
          // the wrapper -- which isn't reliable when triggered from within
          // a fullscreenchange handler rather than a direct click (browsers
          // are strict about requestFullscreen() needing a real user
          // gesture), and a failed swap left the wrapper's fullscreen state
          // stuck out of sync with the browser's actual fullscreen target,
          // taking chat down with it. We already provide our own equivalent
          // enter/exit controls that call requestFullscreen() directly from
          // a real click, so nothing is lost by removing YouTube's.
          fs: 0,
        },
        events: {
          onReady: () => {
            ytPlayerRef.current = localPlayer;
            if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
            syncIntervalRef.current = setInterval(() => {
              if (!suppressSyncRef.current && localPlayer?.getPlayerState?.() === 1) {
                sendSyncRef.current(localPlayer.getCurrentTime?.() ?? 0, true);
              }
            }, 2000);
            if (resumeAtRef.current != null) {
              // Resuming from the MiniPlayer on a fresh page load — seek to
              // where the pop-out left off instead of starting over.
              const t = resumeAtRef.current;
              resumeAtRef.current = null;
              localPlayer.seekTo(t, true);
              localPlayer.playVideo();
              setIsPlaying(true);
              const url = new URL(window.location.href);
              url.searchParams.delete("t");
              window.history.replaceState({}, "", url.pathname + url.search);
            } else if (autoplayParam) {
              localPlayer.playVideo();
              // Request fullscreen after the iframe is fully ready.
              // A short delay ensures the frame has rendered before the API call.
              if (settingsRef.current.autoFullscreen) {
                setTimeout(() => {
                  const fse = document.fullscreenElement;
                  // Enter fullscreen if we're not in it at all, OR if the fullscreen
                  // element is the page root (set by "Play All" click) rather than our
                  // wrapper — either way we want the wrapper to be fullscreen.
                  if (!fse || fse !== fullscreenWrapperRef.current) {
                    fullscreenWrapperRef.current?.requestFullscreen().catch(() => {});
                  }
                }, 200);
              }
            }
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) {
              setIsPlaying(true);
              // This page's player just started producing audio (whichever
              // way that happened — clicking the paused overlay, native
              // player controls, or a Watch Together sync) — a floating
              // pop-out playing the same or a different video would then be
              // fighting it for audio, so shut the pop-out down. No-op if
              // there isn't one open.
              closeMiniPlayer();
              if (!suppressSyncRef.current) sendSyncRef.current(localPlayer?.getCurrentTime?.() ?? 0, true);
            }
            if (e.data === 2) {
              setIsPlaying(false);
              if (!suppressSyncRef.current) sendSyncRef.current(localPlayer?.getCurrentTime?.() ?? 0, false);
            }
            if (e.data === 0) {                     // ended
              setIsPlaying(false);
              // Guard: YT can fire state=0 more than once; only navigate once
              if (hasNavigatedRef.current) return;
              let nv = nextVideoRef.current;
              const pid = playlistContextIdRef.current;
              // Fallback: recompute from latest playlist data if ref is still null
              // (can happen if playlist fetch hadn't resolved when the video ended)
              if (!nv && pid) {
                const videos = playlistVideosRef.current;
                const curId  = currentIdRef.current;
                const idx    = videos.findIndex((v) => v.id === curId);
                nv = idx !== -1 && idx < videos.length - 1 ? videos[idx + 1] : null;
              }
              if (nv && pid) {
                hasNavigatedRef.current = true;
                setLocation(`/video/${nv.id}?playlist=${pid}&autoplay=1`);
              }
            }
          },
        },
      });
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) {
      spawnPlayer();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (window as any).onYouTubeIframeAPIReady as (() => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onYouTubeIframeAPIReady = () => {
        prev?.();
        spawnPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      hasNavigatedRef.current = false; // reset so next video can navigate again
      userExitedFullscreenRef.current = false; // don't carry this video's exit choice into the next one
      if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
      ytPlayerRef.current = null;
      try { localPlayer?.destroy(); } catch { /* ignore */ }
      // outer.innerHTML is cleared at the top of spawnPlayer on next init
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id, autoplayParam, setLocation]);

  // Fetch user's intro on mount
  useEffect(() => {
    fetch("/api/intros", { credentials: "include" })
      .then((r) => r.json())
      .then((data: { intro: { objectPath: string; fileType: string; enabled: boolean; url: string; isSystemDefault?: boolean } | null }) => {
        if (data.intro) setIntro(data.intro);
      })
      .catch(() => {});
  }, []);
  const updateVideo = useUpdateVideo();
  const deleteVideo = useDeleteVideo();
  const fetchDesc = useFetchVideoDescriptionById();
  // TV shows live exclusively on the TV Shows tab -- excluded here so they
  // don't show up mixed in with regular playlists in "Add to Playlist".
  const { data: allPlaylists = [] } = useListPlaylists({ query: { queryKey: getListPlaylistsQueryKey() } });
  const playlists = allPlaylists.filter((p) => !p.isShow);
  const { data: categoryList = [] } = useListCategories({ query: { queryKey: getListCategoriesQueryKey() } });
  const addToPlaylist = useAddVideoToPlaylist();

  useEffect(() => {
    if (!playlistMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node)) {
        setPlaylistMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [playlistMenuOpen]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [shareMenuOpen]);

  // Hide cursor after 3 s of inactivity while the player container is fullscreen.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const showCursor = () => {
      const el = fullscreenWrapperRef.current;
      if (!el) return;
      el.style.cursor = "";
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        if (document.fullscreenElement === el) el.style.cursor = "none";
      }, 3000);
    };

    const onFullscreenChange = () => {
      const el = fullscreenWrapperRef.current;
      if (!el) return;
      if (document.fullscreenElement === el) {
        showCursor();
        el.addEventListener("mousemove", showCursor);
      } else {
        el.style.cursor = "";
        el.removeEventListener("mousemove", showCursor);
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = null;
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      const el = fullscreenWrapperRef.current;
      if (el) {
        el.style.cursor = "";
        el.removeEventListener("mousemove", showCursor);
      }
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    if (!shareMenuOpen || friendsLoaded) return;
    fetch("/api/friends", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => {
        setFriends(data as { id: string; email: string; firstName: string | null; lastName: string | null; friendshipId: number }[]);
        setFriendsLoaded(true);
      })
      .catch(() => setFriendsLoaded(true));
  }, [shareMenuOpen, friendsLoaded]);

  const toggleShareFriend = (id: string) => {
    setSelectedShareFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const handleShare = async () => {
    if (!video || selectedShareFriends.size === 0) return;
    setSharing(true);
    try {
      await Promise.all(Array.from(selectedShareFriends).map((friendId) =>
        fetch("/api/video-shares", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: friendId, videoId: video.id, message: shareMessage || undefined }),
        })
      ));
      toast({ title: selectedShareFriends.size === 1 ? "Video shared!" : `Video shared with ${selectedShareFriends.size} friends!` });
      setShareMenuOpen(false);
      setShareMessage("");
      setSelectedShareFriends(new Set());
    } catch {
      toast({ title: "Failed to share", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const handleAddToPlaylist = (playlistId: number, playlistName: string) => {
    if (!video) return;
    addToPlaylist.mutate(
      { id: playlistId, data: { videoId: video.id } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPlaylistQueryKey(playlistId) });
          queryClient.invalidateQueries({ queryKey: getListPlaylistsQueryKey() });
          toast({ title: `Added to "${playlistName}"` });
          setPlaylistMenuOpen(false);
        },
        onError: () => toast({ title: "Failed to add to playlist", variant: "destructive" }),
      }
    );
  };

  // Scroll to top after description is fetched and painted into the DOM.
  const prevDescRef = useRef<string>("");
  // Set when the description came from the manual entry box rather than a
  // fetch: you're already looking at text you just typed, so yanking the page
  // to the top would only throw away your place.
  const manualDescSaveRef = useRef(false);
  useEffect(() => {
    const newDesc = video?.description ?? "";
    const wasEmpty = !prevDescRef.current || prevDescRef.current === GENERIC_YT_DESC;
    const nowFilled = newDesc && newDesc !== GENERIC_YT_DESC;
    if (wasEmpty && nowFilled && !manualDescSaveRef.current) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
      });
    }
    manualDescSaveRef.current = false;
    prevDescRef.current = newDesc;
  }, [video?.description]);

  // Surfaces whether the last fetch attempt actually got a real description
  // back -- previously this was entirely silent, so a video stuck on the
  // generic YouTube fallback (API key exhausted/missing, or YouTube
  // blocking the scrape) gave no visible sign anything had even been
  // attempted.
  const [descFetchFailed, setDescFetchFailed] = useState(false);

  const runFetchDescription = () => {
    setFetchingDesc(true);
    fetchDesc.mutate(
      { id },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetVideoQueryKey(id), updated);
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
          const stillMissing = !updated.description || updated.description === GENERIC_YT_DESC;
          setDescFetchFailed(stillMissing);
          if (stillMissing) {
            toast({ title: "YouTube didn't return a description for this video", variant: "destructive" });
          }
        },
        onError: () => {
          setDescFetchFailed(true);
          toast({ title: "Couldn't reach YouTube to fetch the description", variant: "destructive" });
        },
        onSettled: () => setFetchingDesc(false),
      },
    );
  };

  // Reset the Amazon search query to the auto-cleaned title whenever a new video loads.
  useEffect(() => {
    if (video?.title) setAmazonQuery(cleanTitleForSearch(video.title));
    setAmazonTags([]);
  }, [video?.id]);

  // Fetch AI search chips when the Find Similar sheet opens.
  useEffect(() => {
    if (!similarVideosOpen || !video?.id || amazonTags.length > 0) return;
    setTagsLoading(true);
    fetch(`/api/videos/${video.id}/amazon-search-tags`, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => r.ok ? r.json() as Promise<{ tags: string[] }> : Promise.resolve({ tags: [] }))
      .then(({ tags }) => setAmazonTags(tags))
      .catch(() => {/* silent fail */})
      .finally(() => setTagsLoading(false));
  }, [similarVideosOpen, video?.id]);

  // When a video opens with no description (or the generic YouTube fallback),
  // silently fetch and save the real description from YouTube.
  useEffect(() => {
    setDescFetchFailed(false);
    if (!video || fetchingDesc) return;
    const desc = video.description ?? "";
    const needsFetch = !desc || desc === GENERIC_YT_DESC;
    if (!needsFetch) return;
    runFetchDescription();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
      title: video?.title || "",
      category: video?.category || "",
      description: video?.description || "",
      thumbnailUrl: video?.thumbnailUrl || "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sourceUrl: (video as any)?.sourceUrl || "",
    },
  });

  const watchedThumbnailUrl = form.watch("thumbnailUrl");
  const previewThumbnail = watchedThumbnailUrl?.trim()
    ? watchedThumbnailUrl.trim()
    : video
      ? getVideoThumbnail(video.youtubeUrl, null)
      : "";

  const thumbFileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const handleThumbnailFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      form.setValue("thumbnailUrl", dataUrl, { shouldValidate: true });
    } catch {
      toast({ title: "Failed to read file", variant: "destructive" });
    }
    e.target.value = "";
  }, [readFileAsDataUrl, form, toast]);

  const handleThumbnailPasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const dataUrl = await readFileAsDataUrl(new File([blob], "pasted", { type: imageType }));
          form.setValue("thumbnailUrl", dataUrl, { shouldValidate: true });
          return;
        }
      }
      toast({ title: "No image found in clipboard", variant: "destructive" });
    } catch {
      toast({ title: "Copy an image first, then click Paste", variant: "destructive" });
    }
  }, [readFileAsDataUrl, form, toast]);

  // Manual description entry, for when YouTube has nothing to give us (deleted
  // video, a Facebook/other-platform URL, private video…). Without this the
  // only recourse was the full edit form; this lets you paste one in place.
  // Declared up here with the other hooks -- above the early returns below.
  const [addingDescription, setAddingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");

  // --- Unsaved-changes guard: warn before leaving the edit form with unsaved
  // edits, whether via the Back button, a sidebar link, browser back, or
  // closing the tab. Must live above the isLoading/not-found early returns
  // below -- hooks can't be skipped on some renders (e.g. the first, while
  // data is still loading) and then called on later ones. ---
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const isDirty = form.formState.isDirty;

  const attemptNavigate = useCallback((navigate: () => void) => {
    if (isEditing && isDirty) {
      pendingNavigationRef.current = navigate;
      setShowUnsavedDialog(true);
    } else {
      navigate();
    }
  }, [isEditing, isDirty]);

  // Sidebar links (and any other in-app <a> link) are wouter <Link>s --
  // intercept the click in the capture phase, before wouter's own handler
  // runs, so a dirty edit form can prompt before the route actually changes.
  useEffect(() => {
    if (!isEditing || !isDirty) return;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || anchor.target === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      attemptNavigate(() => setLocation(href));
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [isEditing, isDirty, attemptNavigate, setLocation]);

  // Real tab close/refresh/browser-back can't be intercepted with a custom
  // dialog -- this triggers the browser's own generic "leave site?" prompt.
  useEffect(() => {
    if (!isEditing || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isEditing, isDirty]);

  // When a video 404s, the library cache may have a stale entry for it (e.g.
  // after auto-purge runs on old trash). Invalidate so the grid refetches on
  // the way back and the dead card disappears.
  useEffect(() => {
    if (!video && (videoError as { status?: number } | null)?.status === 404) {
      void queryClient.invalidateQueries({ queryKey: getInfiniteListVideosQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetVideoCountQueryKey() });
    }
  }, [video, videoError, queryClient]);

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 animate-pulse max-w-5xl mx-auto space-y-8">
          <div className="w-full aspect-video bg-muted rounded-2xl" />
          <div className="space-y-4">
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/4" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!video) {
    const errStatus = (videoError as { status?: number } | null)?.status;
    const errMsg = errStatus === 401
      ? "You need to be signed in to view this video."
      : errStatus === 404
        ? "This video doesn't exist or was removed."
        : errStatus != null
          ? `Server error (${errStatus}) — please try again.`
          : "Could not load this video.";
    return (
      <Layout>
        <div className="p-8 text-center mt-20 space-y-4">
          <h2 className="text-2xl font-display font-semibold">Video not found</h2>
          <p className="text-sm text-muted-foreground">{errMsg}</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button variant="outline" onClick={() => setLocation("/")}>Go back home</Button>
            {errStatus === 404 && (
              <Button variant="default" onClick={() => setLocation("/broken-links")}>
                Find &amp; remove broken links
              </Button>
            )}
          </div>
          {errStatus === 404 && (
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Use Library Tools → Broken Links to scan your library and bulk-remove any videos that no longer exist.
            </p>
          )}
        </div>
      </Layout>
    );
  }

  const thumbnail = getVideoThumbnail(video.youtubeUrl, video.thumbnailUrl);
  const platform = detectPlatform(video.youtubeUrl);
  const isFacebook = platform === "facebook";
  const isYouTube = platform === "youtube";
  const embedUrlBase = getEmbedUrl(video.youtubeUrl);
  // embedUrl used only as an existence check for whether to show the player section
  const embedUrl = embedUrlBase ?? null;
  const handleIntroUpload = async (e: React.ChangeEvent<HTMLInputElement>, setAsDefault = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIntroLoading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      const fileType = file.type.startsWith("video/") ? "video" : "audio";

      if (setAsDefault) {
        // Admin: set as system-wide default (doesn't save to personal intro)
        await fetch("/api/intros/system", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectPath, fileType }),
        });
        toast({ title: "System default intro updated!" });
      } else {
        // Regular upload: save to personal intro
        await fetch("/api/intros", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectPath, fileType }),
        });
        toast({ title: "Intro uploaded!" });
      }

      const introRes = await fetch("/api/intros", { credentials: "include" });
      const data = await introRes.json() as { intro: { objectPath: string; fileType: string; enabled: boolean; url: string; isSystemDefault?: boolean } | null };
      if (data.intro) setIntro(data.intro);
    } catch {
      toast({ title: "Failed to upload intro", variant: "destructive" });
    } finally {
      setIntroLoading(false);
    }
    e.target.value = "";
  };

  const handleIntroToggle = async () => {
    if (!intro) return;
    const newEnabled = !intro.enabled;
    setIntro({ ...intro, enabled: newEnabled });
    await fetch("/api/intros/toggle", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: newEnabled }),
    });
  };

  const handleIntroDelete = async () => {
    await fetch("/api/intros", { method: "DELETE", credentials: "include" });
    setIntro(null);
    toast({ title: "Intro removed" });
  };

  const applyUpdate = (data: z.infer<typeof formSchema>, onSaved?: () => void) => {
    updateVideo.mutate(
      { id, data: { ...data, sourceUrl: data.sourceUrl || undefined } },
      {
        onSuccess: (updatedVideo) => {
          queryClient.setQueryData(getGetVideoQueryKey(id), updatedVideo);
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() });

          setIsEditing(false);
          toast({ title: "Video updated" });
          onSaved?.();
        },
        onError: () => {
          toast({ title: "Failed to update", variant: "destructive" });
        }
      }
    );
  };
  const onSubmit = (data: z.infer<typeof formSchema>) => applyUpdate(data);

  // Saves a hand-entered description without opening the full edit form. Sends
  // the rest of the form's current values alongside it so the payload matches
  // what the update endpoint already accepts for a normal save.
  const saveManualDescription = () => {
    const text = descriptionDraft.trim();
    if (!text) return;
    manualDescSaveRef.current = true;
    applyUpdate({ ...form.getValues(), description: text }, () => {
      setAddingDescription(false);
      setDescriptionDraft("");
    });
  };

  const handleDelete = () => {
    deleteVideo.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVideosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetVideoStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentVideosQueryKey() });
          
          toast({ title: "Video deleted" });
          setLocation("/");
        },
        onError: () => {
          toast({ title: "Failed to delete", variant: "destructive" });
        }
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 md:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {playlistContext && currentPlaylistIndex !== -1 && (
          <div className="mb-4 flex items-center gap-2 px-1 py-2 bg-accent/40 border border-border rounded-xl">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground h-8 px-2"
              onClick={() => setLocation(`/playlists/${playlistContext.id}`)}
            >
              <ListVideo className="w-4 h-4 mr-1.5" />
              <span className="text-xs font-medium truncate max-w-32">{playlistContext.name}</span>
            </Button>
            <span className="text-xs text-muted-foreground ml-auto shrink-0">
              {currentPlaylistIndex + 1} / {playlistVideos.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={!prevVideo}
              title="Previous video"
              onClick={() => prevVideo && setLocation(`/video/${prevVideo.id}?playlist=${playlistContext.id}`)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={!nextVideo}
              title="Next video"
              onClick={() => nextVideo && setLocation(`/video/${nextVideo.id}?playlist=${playlistContext.id}`)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => attemptNavigate(() => window.history.back())} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit3 className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}

            {/* Add to Playlist dropdown */}
            <div className="relative" ref={playlistMenuRef}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPlaylistMenuOpen((o) => !o)}
              >
                <ListVideo className="mr-2 h-4 w-4" />
                Add to Playlist
                <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
              </Button>

              {playlistMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-48 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    {playlists.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                        No playlists yet.
                      </div>
                    ) : (
                      playlists.map((pl) => (
                        <button
                          key={pl.id}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                          onClick={() => handleAddToPlaylist(pl.id, pl.name)}
                          disabled={addToPlaylist.isPending}
                        >
                          <ListVideo className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{pl.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {pl.videoCount}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="border-t border-border" />
                  <button
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left text-primary font-medium"
                    onClick={() => { setPlaylistMenuOpen(false); setLocation("/settings?newPlaylist=1"); }}
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    Add New Playlist
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        <div
          ref={fullscreenWrapperRef}
          className={isWrapperFullscreen ? "relative w-full h-full bg-black flex flex-col" : "mb-8 space-y-3"}
        >
          <div
            className={isWrapperFullscreen ? "relative flex-1 min-h-0 bg-black overflow-hidden" : "relative aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl ring-1 ring-border"}
            onMouseEnter={handlePlayerMouseEnter}
            onMouseMove={showPlayerControls}
            onMouseLeave={handlePlayerMouseLeave}
          >
            {/* Our own fullscreen toggle, plus Favorite/Share/Pop-out/Watch
                Together/Open-from-Source, consolidated into one icon-only bar
                so nothing overlaps YouTube's own top-right chrome (settings,
                captions, etc. -- fs:0 only disables YouTube's fullscreen
                button, not the rest). Fades in on mouse movement over the
                player and fades out after a few seconds idle, mirroring
                YouTube's own controls -- stays visible while the Share or
                Watch Together dropdown is open so it can't vanish mid-use.
                Placed inside this box specifically since (unlike the outer
                wrapper) it's position:relative in both fullscreen and normal
                layout, and only descendants of the actual fullscreen element
                stay visible/interactive once fullscreen is engaged. */}
            {/* In fullscreen there's nowhere to move the cursor off the video
                to make this fade -- it fills the whole screen -- so keep it
                dimmed (but still fully clickable) instead of full-opacity,
                and let hovering directly over the bar itself un-dim it for
                legibility. Normal (non-fullscreen) layout keeps full opacity
                since the surrounding page gives somewhere else to rest the
                cursor and trigger the mouseleave fade instead. Dim level is
                user-adjustable via the grip handles above/below the icons. */}
            <div
              className={`absolute top-12 right-3 z-50 flex flex-col items-center gap-0.5 rounded-full bg-black/70 backdrop-blur-sm px-1 py-1.5 ${
                isDraggingOpacity ? "" : "transition-opacity duration-300"
              } ${
                playerControlsVisible
                  ? isWrapperFullscreen
                    ? isDraggingOpacity ? "" : "opacity-[var(--fs-controls-opacity)] hover:opacity-100"
                    : "opacity-100"
                  : "opacity-0 pointer-events-none"
              }`}
              style={
                isWrapperFullscreen
                  ? isDraggingOpacity
                    ? { opacity: fullscreenControlsOpacity / 100 }
                    : ({ "--fs-controls-opacity": fullscreenControlsOpacity / 100 } as React.CSSProperties)
                  : undefined
              }
            >
              {isWrapperFullscreen && (
                <div
                  onPointerDown={handleOpacityDragStart}
                  onPointerMove={handleOpacityDragMove}
                  onPointerUp={handleOpacityDragEnd}
                  title="Drag up/down to adjust transparency"
                  className="w-full flex justify-center py-0.5 -mt-0.5 mb-0.5 cursor-ns-resize touch-none text-white/50 hover:text-white/90 transition-colors"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              )}

              <button
                onClick={() =>
                  void toggleFavorite(video.id, {
                    id: video.id, title: video.title,
                    thumbnailUrl: video.thumbnailUrl ?? null,
                    youtubeUrl: video.youtubeUrl,
                    category: video.category,
                  })
                }
                title={isFavorite(video.id) ? "Remove from favorites" : "Add to favorites"}
                className="p-1.5 rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Star className={`w-4 h-4 ${isFavorite(video.id) ? "fill-primary text-primary" : ""}`} />
              </button>

              <div className="relative" ref={shareMenuRef}>
                <button
                  onClick={() => setShareMenuOpen((o) => !o)}
                  title="Share"
                  className="p-1.5 rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                </button>
                {shareMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Share with friends</p>
                      <input
                        type="text"
                        value={shareMessage}
                        onChange={(e) => setShareMessage(e.target.value)}
                        placeholder="Add a note…"
                        className="w-full text-sm bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        maxLength={200}
                      />
                    </div>
                    {!friendsLoaded ? (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading friends…
                      </div>
                    ) : friends.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                        No friends yet — add some in Settings.
                      </div>
                    ) : (
                      <>
                        <div className="max-h-48 overflow-y-auto">
                          {friends.map((f) => {
                            const name = f.firstName || f.lastName ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim() : f.email;
                            const checked = selectedShareFriends.has(f.id);
                            return (
                              <button
                                key={f.id}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                                onClick={() => toggleShareFriend(f.id)}
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                                  {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="truncate font-medium">{name}</p>
                                  {name !== f.email && <p className="text-xs text-muted-foreground truncate">{f.email}</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="px-3 py-2.5 border-t border-border">
                          <button
                            onClick={() => void handleShare()}
                            disabled={selectedShareFriends.size === 0 || sharing}
                            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
                          >
                            {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            {sharing ? "Sending…" : `Send${selectedShareFriends.size > 0 ? ` to ${selectedShareFriends.size}` : ""}`}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <PopOutButton
                video={video}
                iconOnly
                onPopOut={() => {
                  const t = ytPlayerRef.current?.getCurrentTime?.() ?? 0;
                  ytPlayerRef.current?.pauseVideo();
                  setIsPlaying(false);
                  return t;
                }}
              />
              <WatchTogetherButton videoId={id} watchHook={watchSession} iconOnly onOpenChange={setWatchTogetherOpen} />

              <button
                type="button"
                onClick={() => openUrl(video.youtubeUrl)}
                title="Open from Source"
                className="p-1.5 rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  if (isWrapperFullscreen) {
                    userExitedFullscreenRef.current = true;
                    document.exitFullscreen().catch(() => {});
                  } else {
                    fullscreenWrapperRef.current?.requestFullscreen().catch(() => {});
                  }
                }}
                title={isWrapperFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="p-1.5 rounded-full text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                {isWrapperFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {isWrapperFullscreen && (
                <div
                  onPointerDown={handleOpacityDragStart}
                  onPointerMove={handleOpacityDragMove}
                  onPointerUp={handleOpacityDragEnd}
                  title="Drag up/down to adjust transparency"
                  className="w-full flex justify-center py-0.5 mt-0.5 -mb-0.5 cursor-ns-resize touch-none text-white/50 hover:text-white/90 transition-colors"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
            <PlayerErrorBoundary url={video.youtubeUrl} label={isFacebook ? "Facebook" : getWatchOnLabel(video.youtubeUrl)}>
            {embedUrl ? (
              isFacebook ? (
                <FbPlayer embedUrl={embedUrl} title={video.title} originalUrl={video.youtubeUrl} />
              ) : !isYouTube ? (
                <iframe
                  src={embedUrl}
                  title={video.title}
                  className="absolute inset-0 w-full h-full"
                  allowFullScreen
                  allow="autoplay; fullscreen"
                />
              ) : (
                <div ref={ytContainerRef} className="relative w-full h-full" data-testid="youtube-player">
                  {/* YT API injection zone — React declares no children here */}
                  <div ref={ytOuterRef} className="absolute inset-0" />
                  {!isPlaying && poppedOutVideo?.id === video.id ? (
                    // This exact video is playing in the pop-out right now — resuming
                    // it directly from here (rather than via the pop-out's own "Back
                    // to Video" button) turned out to reliably drop audio, likely a
                    // browser autoplay-policy quirk around handing sound between two
                    // player instances outside of a single direct click. Rather than
                    // chase that further, this path is disabled in favor of the one
                    // that's proven reliable.
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-center px-6 cursor-pointer"
                      onClick={() => pulseBackButton()}
                    >
                      <p className="text-sm text-white/80 leading-relaxed">
                        Playing in the pop-out player.<br />Use its "Back to Video" button to bring playback back here.
                      </p>
                    </div>
                  ) : !isPlaying && (
                    <PlayerOverlay
                      containerRef={ytContainerRef}
                      onPlay={() => {
                        if (settings.autoFullscreen) {
                          fullscreenWrapperRef.current?.requestFullscreen().catch(() => {});
                        }
                      if (intro?.enabled && intro.url && !introShownRef.current) {
                        setIntroPlaying(true);
                        introShownRef.current = true;
                        const isVideo = intro.fileType === "video";
                        const el = isVideo
                          ? document.createElement("video")
                          : document.createElement("audio");
                        el.src = intro.url;
                        el.autoplay = true;
                        introMediaRef.current = el;
                        const finishIntro = () => {
                          setIntroPlaying(false);
                          if (isVideo && ytContainerRef.current?.contains(el)) ytContainerRef.current.removeChild(el);                          
                          setIsPlaying(true);
                          ytPlayerRef.current?.playVideo();                          
                        };
                        el.onended = finishIntro;
                        el.onerror = finishIntro;
                        if (isVideo) {
                          (el as HTMLVideoElement).style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:black;object-fit:contain";
                          ytContainerRef.current?.appendChild(el);
                        }
                        el.play().catch(finishIntro);
                      } else {
                        setIsPlaying(true);
                        ytPlayerRef.current?.playVideo();                        
                      }
                      }}
                      />
            )}
                                    {wantFullscreen && watchSession.session && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                      <button
                        className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl bg-black/80 border border-white/20 text-white hover:bg-black/95 transition-colors"
                        onClick={() => {
                          fullscreenWrapperRef.current?.requestFullscreen().catch(() => {});
                          setWantFullscreen(false);
                        }}
                      >
                        <Maximize2 className="w-10 h-10" />
                        <span className="text-lg font-semibold">Click to enter fullscreen</span>
                        <span className="text-sm text-white/60">Your settings have fullscreen enabled for Watch Together</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="relative w-full h-full">
                {thumbnail ? (
                  <AdaptiveThumbnail
                    src={thumbnail}
                    alt={video.title}
                    className="w-full h-full opacity-40"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <ExternalLink className="w-12 h-12 text-muted-foreground/20" />
                  </div>
                )}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center px-8">
                  <p className="text-sm text-white/80 leading-relaxed max-w-xs">
                    {isFacebook
                      ? "This Facebook video can't be played here — Reels and some other Facebook content can only be viewed on Facebook."
                      : "This video can't be played directly in the app."}
                  </p>
                  <button
                    type="button"
                    onClick={() => openUrl(video.youtubeUrl)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black font-semibold shadow-xl hover:bg-white/90 transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {isFacebook ? "Open in Facebook" : `Watch on ${getWatchOnLabel(video.youtubeUrl)}`}
                  </button>
                </div>
              </div>
            )}
            </PlayerErrorBoundary>
          </div>

          {/* Intro Panel — hidden while fullscreen; upload/preview controls
              aren't relevant to actively watching and there's no room for
              them once the video fills the screen. */}
          {!isWrapperFullscreen && (
          <div className="flex items-center gap-3 px-4 py-3 bg-card border border-border rounded-xl flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Movie Intro</p>
              <p className="text-xs text-muted-foreground truncate">
                {intro
                  ? introPlaying
                    ? "Playing intro…"
                    : intro.isSystemDefault
                      ? "URLinc default — plays before each video"
                      : intro.enabled
                        ? "Plays before each video"
                        : "Intro disabled"
                  : "No intro"}
              </p>
            </div>
            {settings.findSimilarVideos && (
            <Button variant="outline" size="sm" onClick={() => { setSimilarVideosOpen(true); if (video) similarVideos.mutate({ id: video.id }); }} disabled={similarVideos.isPending} className="gap-2 ml-auto">
              {similarVideos.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-400" />}
              Find Similar
            </Button>
          )}
            {intro && !intro.isSystemDefault && (
              <>
                <button
                  onClick={handleIntroToggle}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!intro.enabled ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"}`}
                >
                  {intro.enabled ? "Turn Off" : "Turn On"}
                </button>
                {intro.enabled && (
                  <button
                    onClick={() => {
                      setIntroPlaying(true);
                      const el = intro.fileType === "video"
                        ? document.createElement("video")
                        : document.createElement("audio");
                      el.src = intro.url;
                      el.autoplay = true;
                      introMediaRef.current = el;
                      el.onended = () => setIntroPlaying(false);
                      el.onerror = () => setIntroPlaying(false);
                      if (intro.fileType === "video") {
                        (el as HTMLVideoElement).style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:black;object-fit:contain";
                        document.body.appendChild(el);
                        el.onended = () => { setIntroPlaying(false); document.body.removeChild(el); };
                      }
                    }}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted hover:bg-accent transition-colors"
                  >
                    Preview
                  </button>
                )}
                <button onClick={handleIntroDelete} className="text-xs text-destructive hover:text-destructive/80 transition-colors">
                  Remove
                </button>
              </>
            )}
            {/* Preview button for system default */}
            {intro?.isSystemDefault && intro.enabled && (
              <button
                onClick={() => {
                  setIntroPlaying(true);
                  const el = document.createElement("video");
                  el.src = intro.url;
                  el.autoplay = true;
                  el.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:9999;background:black;object-fit:contain";
                  document.body.appendChild(el);
                  introMediaRef.current = el;
                  el.onended = () => { setIntroPlaying(false); document.body.removeChild(el); };
                  el.onerror = () => { setIntroPlaying(false); if (document.body.contains(el)) document.body.removeChild(el); };
                }}
                className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted hover:bg-accent transition-colors"
              >
                Preview
              </button>
            )}
            {/* Personal intro upload (Replace / Upload) */}
            <button
              onClick={() => introFileInputRef.current?.click()}
              disabled={introLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-muted hover:bg-accent transition-colors disabled:opacity-50"
            >
              <Upload className="w-3 h-3" />
              {intro && !intro.isSystemDefault ? "Replace" : "Upload"}
            </button>
            {/* Admin-only: set system default */}
            {user?.email === "gkup22@gmail.com" && (
              <button
                onClick={() => adminIntroFileInputRef.current?.click()}
                disabled={introLoading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                title="Set system-wide default intro (admin only)"
              >
                <Upload className="w-3 h-3" />
                Set Default
              </button>
            )}
            <input ref={introFileInputRef} type="file" accept="audio/*,video/*" className="hidden"
              onChange={(e) => void handleIntroUpload(e, false)} />
            <input ref={adminIntroFileInputRef} type="file" accept="audio/*,video/*" className="hidden"
              onChange={(e) => void handleIntroUpload(e, true)} />
          </div>
          )}
          {/* Hidden while fullscreen — the participant list and Leave/End
              button aren't something you need while actively watching, and
              take up space better spent on the video and chat. */}
          {watchSession.session && user && !isWrapperFullscreen && (
              <SessionStatusBar
                session={watchSession.session}
                currentUserId={user.id}
                connected={watchSession.connected}
                reconnecting={watchSession.reconnecting}
                onEnd={() => { watchSession.endSession(); setChatMessages([]); setWantFullscreen(false); }}
                onLeave={() => { watchSession.leaveSession(); setChatMessages([]); setWantFullscreen(false); }}
              />
            )}
          {watchSession.session && user && (
            <ChatPanel
                messages={chatMessages}
                currentUserId={user.id}
                onSend={(text) => watchSession.sendChat(text)}
                onTyping={() => watchSession.sendTyping()}
                reconnecting={watchSession.reconnecting}
                chatQueueLength={watchSession.chatQueueLength}
                captionTimeout={settings.chatCaptionTimeout >= 999 ? undefined : settings.chatCaptionTimeout}
                onCaptionTimeoutChange={(val) => update("chatCaptionTimeout", val)}
                dictationLang={settings.dictationLang}
                onDictationLangChange={(val) => update("dictationLang", val)}
                isFullscreen={isWrapperFullscreen}
                showDictationControls={settings.showDictationControls}
                onShowDictationControlsChange={(val) => update("showDictationControls", val)}
                triviaData={triviaData}
                chatMode={chatMode}
                onChatModeChange={(val) => setChatMode(val)}
                isHost={!watchSession.session || user.id === watchSession.session.hostId}
                ptt={{
                  joined: intercom.joined,
                  micState: intercom.micState,
                  transmitting: intercom.transmitting,
                  level: intercom.level,
                  roomCode: intercom.roomCode,
                  onRequestMic: intercom.requestMic,
                  onTransmit: intercom.setTransmit,
                  onEnableAudio: intercom.enableAudio,
                  audioHealth: intercom.audioHealth,
                  peers: intercom.peers,
                }}
              />
          )}

          {isFacebook && (
            <p className="text-xs text-muted-foreground text-center">
              Some Facebook videos can't be embedded due to privacy or sharing settings.{" "}
              <button
                type="button"
                onClick={() => openUrl(video.youtubeUrl)}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Watch directly on Facebook
              </button>{" "}
              if the player doesn't load.
            </p>
          )}
        </div>

        <div className="bg-card rounded-2xl p-6 md:p-8 border border-border shadow-sm">
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input className="text-lg font-medium" data-testid="input-title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <CategorySelect
                          value={field.value}
                          onChange={field.onChange}
                          categories={categoryList.map((c) => c.name).sort()}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="thumbnailUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preview Picture URL</FormLabel>
                      <FormControl>
                        <div className="space-y-2">
                          <Input
                            placeholder=""
                            data-testid="input-thumbnail-url"
                            {...field}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => thumbFileInputRef.current?.click()}
                              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent"
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Upload file
                            </button>
                            <button
                              type="button"
                              onClick={handleThumbnailPasteFromClipboard}
                              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent"
                            >
                              <Clipboard className="h-3.5 w-3.5" />
                              Paste image
                            </button>
                          </div>
                          <input
                            ref={thumbFileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleThumbnailFileChange}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                      {previewThumbnail && (
                        <div className="mt-3 relative aspect-video w-full max-w-sm rounded-lg overflow-hidden border border-border bg-black">
                          <AdaptiveThumbnail
                            src={previewThumbnail}
                            alt="Thumbnail preview"
                            className="w-full h-full"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <p className="absolute bottom-1 right-2 text-[10px] text-white/60 select-none">
                            preview
                          </p>
                        </div>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sourceUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source URL <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                      <FormControl>
                        <div className="relative">
                          <ExternalLink className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="" className="pl-9" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                      {field.value && (
                        <a href={field.value} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                          <ExternalLink className="h-3 w-3" />
                          Open source page
                        </a>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea className="h-32 resize-none" data-testid="textarea-description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this video from your library.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Yes, delete video
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Save your changes?</AlertDialogTitle>
                        <AlertDialogDescription>
                          You've changed something on this video that hasn't been saved yet.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { pendingNavigationRef.current = null; }}>
                          Stay on Page
                        </AlertDialogCancel>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const nav = pendingNavigationRef.current;
                            pendingNavigationRef.current = null;
                            setShowUnsavedDialog(false);
                            setIsEditing(false);
                            nav?.();
                          }}
                        >
                          Discard Changes
                        </Button>
                        <AlertDialogAction
                          onClick={() => {
                            void form.handleSubmit((data) => {
                              applyUpdate(data, () => {
                                const nav = pendingNavigationRef.current;
                                pendingNavigationRef.current = null;
                                setShowUnsavedDialog(false);
                                nav?.();
                              });
                            })();
                          }}
                        >
                          Save & Leave
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateVideo.isPending} data-testid="button-save-changes">
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          ) : (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl md:text-4xl font-display font-bold leading-tight mb-4">
                  {video.title}
                </h1>
                
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5 bg-accent/50 px-2.5 py-1 rounded-md text-foreground font-medium">
                    <FolderOpen className="w-4 h-4 text-primary" />
                    {video.category}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="w-4 h-4" />
                    Added {format(new Date(video.createdAt), "MMMM d, yyyy")}
                  </div>
                </div>
              </div>

              {video.description && video.description !== GENERIC_YT_DESC ? (
                <div className="pt-6 border-t border-border">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">Description</h3>
                  <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/80 leading-relaxed">
                    {video.description}
                  </div>
                </div>
              ) : (
                <div className="pt-6 border-t border-border">
                  <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">Description</h3>
                  {fetchingDesc ? (
                    <p className="text-sm text-muted-foreground italic">Fetching description from YouTube…</p>
                  ) : addingDescription ? (
                    <div className="space-y-3">
                      <Textarea
                        className="h-32 resize-none"
                        placeholder="Paste or type a description…"
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        autoFocus
                        data-testid="textarea-manual-description"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={saveManualDescription}
                          disabled={!descriptionDraft.trim() || updateVideo.isPending}
                          data-testid="button-save-manual-description"
                        >
                          {updateVideo.isPending ? "Saving…" : "Save description"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setAddingDescription(false); setDescriptionDraft(""); }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm text-muted-foreground italic">
                        {descFetchFailed ? "Couldn't fetch a description from YouTube for this video." : "No description yet."}
                      </p>
                      <Button size="sm" variant="outline" onClick={runFetchDescription}>
                        Try again
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setDescriptionDraft(""); setAddingDescription(true); }}
                        data-testid="button-add-description"
                      >
                        Add description
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
      </div>
      {/* Similar Videos Sheet */}
      <Sheet open={similarVideosOpen} onOpenChange={setSimilarVideosOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              Find Similar Videos
            </SheetTitle>
          </SheetHeader>

          {similarVideos.isPending && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm">Searching across platforms…</p>
            </div>
          )}

          {similarVideos.isError && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
              <Youtube className="h-12 w-12 opacity-20" />
              <p className="text-sm text-center">
                {(similarVideos.error as Error | undefined)?.message ?? "Search failed. Please try again."}
              </p>
              <Button variant="outline" size="sm" onClick={() => video && similarVideos.mutate({ id: video.id })}>
                Try Again
              </Button>
            </div>
          )}

          {similarVideos.isSuccess && similarVideos.data && (() => {
            const ytVideos = similarVideos.data.videos ?? [];

            return (
              <div className="space-y-5">
                {ytVideos.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-12">No similar videos found.</p>
                )}

                {ytVideos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">YouTube</p>
                    <div className="space-y-1">
                      {ytVideos.map((v, i) => (
                        <div key={i} className="flex gap-3 p-2 rounded-lg hover:bg-accent transition-colors group items-start">
                          <a
                            href={v.youtubeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex gap-3 flex-1 min-w-0"
                          >
                            {v.thumbnailUrl && (
                              <AdaptiveThumbnail src={v.thumbnailUrl} alt={v.title} className="w-28 h-16 rounded shrink-0 bg-muted" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">{v.title}</p>
                              <p className="text-xs text-muted-foreground mt-1 truncate">{v.channelTitle}</p>
                            </div>
                          </a>
                          <button
                            title={wishListedYt.has(v.youtubeUrl) ? "Added to Wish List" : "Add to Wish List"}
                            disabled={wishListedYt.has(v.youtubeUrl)}
                            onClick={async () => {
                              const key = v.youtubeUrl;
                              await fetch("/api/radio-favorites", {
                                method: "POST",
                                credentials: "include",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  source: "wish-list",
                                  stationId: key,
                                  stationData: { title: v.title, imageUrl: v.thumbnailUrl, youtubeUrl: v.youtubeUrl, type: "video" },
                                }),
                              });
                              setWishListedYt((prev) => new Set([...prev, key]));
                              toast({ title: "Added to Wish List", description: v.title });
                            }}
                            className={`shrink-0 mt-1 p-1.5 rounded-md transition-colors ${wishListedYt.has(v.youtubeUrl) ? "bg-amber-500/20 text-amber-400 cursor-default" : "text-muted-foreground hover:bg-amber-500/15 hover:text-amber-400"}`}
                          >
                            <ShoppingBag className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Buy or Rent on Amazon</p>
                  {/* AI-detected search chips */}
                  {(tagsLoading || amazonTags.length > 0) && (
                    <div className="mb-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">AI Detected</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tagsLoading && [1,2,3].map((i) => (
                          <div key={i} className="h-6 w-24 rounded-full bg-muted animate-pulse" />
                        ))}
                        {!tagsLoading && amazonTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => setAmazonQuery(prev => prev === tag ? "" : tag)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              amazonQuery === tag
                                ? "bg-amber-500 text-black border-amber-500"
                                : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/25"
                            }`}
                          >
                            <Sparkles className="h-3 w-3" />
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Editable search query — auto-cleaned from the YouTube title */}
                  <input
                    type="text"
                    value={amazonQuery}
                    onChange={(e) => setAmazonQuery(e.target.value)}
                    placeholder="Search term…"
                    className="w-full text-xs bg-muted/60 border border-border rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex flex-col gap-1.5">
                    <a
                      href={`https://www.amazon.com/s?k=${encodeURIComponent(amazonQuery || (video?.title ?? ""))}&i=instant-video${user?.affiliateExcluded ? "" : "&tag=urlinctm-20"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors border border-amber-500/20"
                    >
                      <span className="text-amber-400 text-lg leading-none">▶</span>
                      <div>
                        <p className="text-xs font-semibold text-amber-400">Stream on Prime Video</p>
                        <p className="text-[10px] text-muted-foreground">Buy or rent digitally</p>
                      </div>
                    </a>
                    <a
                      href={`https://www.amazon.com/s?k=${encodeURIComponent(amazonQuery || (video?.title ?? ""))}&i=movies-tv${user?.affiliateExcluded ? "" : "&tag=urlinctm-20"}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/70 transition-colors"
                    >
                      <span className="text-muted-foreground text-sm leading-none">💿</span>
                      <div>
                        <p className="text-xs font-medium">Buy Blu-ray / DVD</p>
                        <p className="text-[10px] text-muted-foreground">Physical media on Amazon</p>
                      </div>
                    </a>
                  </div>
                </div>

                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Also search on</p>
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={`https://vimeo.com/search?q=${encodeURIComponent(amazonQuery || (video?.title ?? ""))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/70 transition-colors font-medium text-sky-500"
                    >
                      Vimeo
                    </a>
                  </div>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

    </Layout>
  );
}

export default VideoDetail;

 
