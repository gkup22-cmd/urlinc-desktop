import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MiniPlayerProvider } from "@/components/MiniPlayer";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { applyTheme, loadTheme } from "@/hooks/use-theme";
import { loadCreativeThemeId, CREATIVE_THEMES, applyCreativeVars } from "@/hooks/use-creative-theme";
import { loadAndApplyTvMode, useTv } from "@/hooks/use-tv";
import Home from "@/pages/home";
import AddVideo from "@/pages/add-video";
import VideoDetail from "@/pages/video-detail";
import Manage from "@/pages/manage";
import VideoTrash from "@/pages/video-trash";
import PhotoTrash from "@/pages/photo-trash";
import Photos from "@/pages/photos";
import AddPhoto from "@/pages/add-photo";
import PhotoDetail from "@/pages/photo-detail";
import PuzzlePlay from "@/pages/puzzle-play";
import HuntPlay from "@/pages/hunt-play";
import MemoryPlay from "@/pages/memory-play";
import SlidePlay from "@/pages/slide-play";
import WordSearchPlay from "@/pages/wordsearch-play";
import SpeedSortPlay from "@/pages/speedsort-play";
import CaptionDuelPlay from "@/pages/caption-duel-play";
import MovieBracketPlay from "@/pages/movie-bracket-play";
import GamesVault from "@/pages/games-vault";
import GamesVaultSection from "@/pages/games-vault-section";
import TicTacToe from "@/pages/game-tictactoe";
import ReactionTest from "@/pages/game-reaction";
import SimonSays from "@/pages/game-simon";
import WhackAMole from "@/pages/game-whackamole";
import Game2048 from "@/pages/game-2048";
import GamePegSolitaire from "@/pages/game-peg-solitaire";
import JustPressIt from "@/pages/game-just-press-it";
import GamePinball from "@/pages/game-pinball";
import HuntBuilder from "@/pages/hunt-builder";
import ManagePhotos from "@/pages/manage-photos";
import Duplicates from "@/pages/duplicates";
import BrokenLinks from "@/pages/broken-links";
import BrokenPhotos from "@/pages/broken-photos";
import SettingsPage from "@/pages/settings";
import PlaylistDetail from "@/pages/playlist-detail";
import Albums from "@/pages/albums";
import AlbumDetail from "@/pages/album-detail";
import NotFound from "@/pages/not-found";
import { LoginPage } from "@/pages/login";
import { ReadPage } from "@/pages/read";
import AdminPage from "@/pages/admin";
import MusicPage from "@/pages/music";
import ManageMusic from "@/pages/manage-music";
import AddMusicPage from "@/pages/add-music";
import MusicPlaylistDetailPage from "@/pages/music-playlist-detail";
import BrowseMusicPage from "@/pages/browse-music";
import MessagesPage from "@/pages/messages";
import IntercomPage from "@/pages/intercom";
import WatchPage from "@/pages/watch";
import WatchTogetherPage from "@/pages/watch-together";
import HelpPage from "@/pages/help";
import PrivacyPage from "@/pages/privacy";
import { MusicPlayerProvider } from "@/contexts/MusicPlayerContext";
import LaunchDeckPage from "@/pages/launch-deck";
import PhoneRemotePage from "@/pages/phone-remote";
import Player3DPage from "@/pages/player-3d";
import { RemoteProvider, useRemote } from "@/contexts/RemoteContext";
import { RemoteQrModal } from "@/components/remote-qr-modal";
import FindSimilar from "@/pages/find-similar";
import LibraryTools from "@/pages/library-tools";
import WishListPage from "@/pages/wish-list";
import PublicWishListPage from "@/pages/public-wish-list";
import DiscoverPage from "@/pages/discover";
import DiscoverCollectionPage from "@/pages/discover-collection";
import ThanksPage from "@/pages/thanks";
import DayPlanPage from "@/pages/day-plan";

function LaunchDeckRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/photos?tab=launch-deck"); }, [setLocation]);
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function HotkeyHandler() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setLocation("/add");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={Home} />
      <Route path="/add" component={AddVideo} />
      <Route path="/video/:id" component={VideoDetail} />
      <Route path="/manage" component={Manage} />
      <Route path="/manage/trash" component={VideoTrash} />
      <Route path="/photos" component={Photos} />
      <Route path="/add-photo" component={AddPhoto} />
      <Route path="/manage-photos" component={ManagePhotos} />
      <Route path="/manage-photos/trash" component={PhotoTrash} />
      <Route path="/photo/:id" component={PhotoDetail} />
      <Route path="/puzzle/:id" component={PuzzlePlay} />
      <Route path="/hunt/new" component={HuntBuilder} />
      <Route path="/hunt/:id" component={HuntPlay} />
      <Route path="/memory/:id" component={MemoryPlay} />
      <Route path="/slide/:id" component={SlidePlay} />
      <Route path="/wordsearch/:id" component={WordSearchPlay} />
      <Route path="/speedsort/:id" component={SpeedSortPlay} />
      <Route path="/caption-duel/:id" component={CaptionDuelPlay} />
      <Route path="/movie-bracket/:id" component={MovieBracketPlay} />
      <Route path="/launch-deck" component={LaunchDeckRedirect} />
      <Route path="/games-vault" component={GamesVault} />
      <Route path="/games-vault/:game" component={GamesVaultSection} />
      <Route path="/game/tictactoe" component={TicTacToe} />
      <Route path="/game/reaction" component={ReactionTest} />
      <Route path="/game/simon" component={SimonSays} />
      <Route path="/game/whackamole" component={WhackAMole} />
      <Route path="/game/2048" component={Game2048} />
      <Route path="/game/peg-solitaire" component={GamePegSolitaire} />
      <Route path="/game/just-press-it" component={JustPressIt} />
      <Route path="/game/pinball" component={GamePinball} />
      <Route path="/library-tools" component={LibraryTools} />
      <Route path="/duplicates" component={Duplicates} />
      <Route path="/broken-links" component={BrokenLinks} />
      <Route path="/broken-photos" component={BrokenPhotos} />
      <Route path="/find-similar" component={FindSimilar} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/playlists/:id" component={PlaylistDetail} />
      <Route path="/albums" component={Albums} />
      <Route path="/albums/:id" component={AlbumDetail} />
      <Route path="/read/:id" component={ReadPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/messages" component={MessagesPage} />
      <Route path="/intercom" component={IntercomPage} />
      <Route path="/help" component={HelpPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/thanks" component={ThanksPage} />
      <Route path="/music" component={MusicPage} />
      <Route path="/manage-music" component={ManageMusic} />
      <Route path="/music/playlists/:id" component={MusicPlaylistDetailPage} />
      <Route path="/music/browse-radio">{() => { window.location.replace('/music?tab=radio'); return null; }}</Route>
      <Route path="/music/browse-music" component={BrowseMusicPage} />
      <Route path="/add-music" component={AddMusicPage} />
      <Route path="/wish-list" component={WishListPage} />
      <Route path="/day-plan" component={DayPlanPage} />
      <Route path="/discover" component={DiscoverPage} />
      <Route path="/discover/topic/:id" component={DiscoverCollectionPage} />
      <Route path="/wish/:userId" component={PublicWishListPage} />
<Route path="/watch" component={WatchPage} />
      <Route path="/watch-together/:sessionId" component={WatchTogetherPage} />
      <Route path="/remote" component={PhoneRemotePage} />
      <Route path="/3d-player" component={Player3DPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RemoteModalHost() {
  const { modalOpen } = useRemote();
  return modalOpen ? <RemoteQrModal /> : null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    const isPublic = location === "/login" || location === "/privacy" || location.startsWith("/remote");
    if (!isAuthenticated && !isPublic) {
      setLocation("/login");
    }
    if (isAuthenticated && location === "/login") {
      setLocation("/");
    }
  }, [isLoading, isAuthenticated, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Suppress flash while redirect is in flight
  const isPublic = location === "/login" || location === "/privacy" || location.startsWith("/remote");
  if (!isAuthenticated && !isPublic) return null;
  if (isAuthenticated && location === "/login") return null;

  return <>{children}</>;
}

function ThemeInit() {
  useEffect(() => {
    applyTheme(loadTheme());
    const id = loadCreativeThemeId();
    if (id) {
      const ct = CREATIVE_THEMES.find(t => t.id === id);
      if (ct) applyCreativeVars(ct);
    }
    loadAndApplyTvMode();
  }, []);
  return null;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

type DpadDir = "up" | "down" | "left" | "right";

function getSpatialNeighbor(current: Element, dir: DpadDir): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el === current) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
    },
  );

  const cr = current.getBoundingClientRect();
  const cx = cr.left + cr.width / 2;
  const cy = cr.top + cr.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of all) {
    const r = el.getBoundingClientRect();
    const ex = r.left + r.width / 2;
    const ey = r.top + r.height / 2;
    const dx = ex - cx;
    const dy = ey - cy;

    const inDir =
      (dir === "right" && dx > 0) ||
      (dir === "left" && dx < 0) ||
      (dir === "down" && dy > 0) ||
      (dir === "up" && dy < 0);
    if (!inDir) continue;

    // Primary axis distance + heavy penalty for perpendicular drift
    const primary = dir === "right" || dir === "left" ? Math.abs(dx) : Math.abs(dy);
    const secondary = dir === "right" || dir === "left" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }

  return best;
}

function DpadHandler() {
  const { enabled } = useTv();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inputType = (e.target as HTMLInputElement).type;
      const isTextInput =
        (tag === "INPUT" && inputType !== "checkbox" && inputType !== "radio") ||
        tag === "TEXTAREA";

      // Back navigation — TV remotes send Backspace for "Back"
      if (e.key === "Backspace" && !isTextInput) {
        e.preventDefault();
        window.history.back();
        return;
      }

      const dirMap: Record<string, DpadDir> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      };
      const dir = dirMap[e.key];
      if (!dir || isTextInput) return;

      e.preventDefault();

      const focused = document.activeElement;
      if (!focused || focused === document.body || focused === document.documentElement) {
        document.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
        return;
      }

      const neighbor = getSpatialNeighbor(focused, dir);
      if (neighbor) {
        neighbor.focus();
        neighbor.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, setLocation]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
  <TooltipProvider>
    <MiniPlayerProvider onExpand={(video) => {
      // A full page reload here (window.location.href) used to wipe out
      // everything — the whole app state, including the video that was
      // just playing in the popup — which is what made audio disappear and
      // playback restart from zero when switching back to the main page.
      // pushState + a synthetic popstate lets wouter's router pick up the
      // new route in place, same as any other in-app navigation.
      const t = video.startSeconds ? Math.floor(video.startSeconds) : 0;
      const path = `/video/${video.id}${t > 0 ? `?t=${t}` : ""}`;
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }}>
      <MusicPlayerProvider>
        <ThemeInit />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <HotkeyHandler />
          <DpadHandler />
          <AuthGate>
            <RemoteProvider>
              <Router />
              <RemoteModalHost />
            </RemoteProvider>
          </AuthGate>
        </WouterRouter>
        <Toaster />
      </MusicPlayerProvider>
    </MiniPlayerProvider>
  </TooltipProvider>
</QueryClientProvider>
  );
}

export default App;
