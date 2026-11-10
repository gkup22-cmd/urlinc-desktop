import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trophy, Plus, Trash2, X, Film, ChevronLeft, ChevronRight, Shuffle, Sparkles, Check, Loader2, RefreshCw, MessageSquare, Users, CalendarDays, Clapperboard, Images, Play, UtensilsCrossed, ChefHat, Printer, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { MOVIE_NIGHT_THEMES, THEME_GENRES, getTheme } from "@/lib/movie-night-themes";

type MovieBracket = {
  id: number;
  creatorEmail: string;
  opponentEmail: string;
  movies: { title: string }[];
  eliminatedTitles: string[];
  status: "active" | "completed";
  winnerTitle: string | null;
  currentTurnEmail: string;
  participants: string[];
  theme: string | null;
  customThemeUrl: string | null;
  scheduledAt: string | null;
  mode: string | null;
  isOwner: boolean;
};

function defaultEveningTime(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T19:00`;
}

export function MovieBracketsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"bracket" | "direct">("bracket");
  const [pendingLeaveId, setPendingLeaveId] = useState<number | null>(null);
  const [step, setStep] = useState<"theme" | "movies">("theme");
  const [scheduledAt, setScheduledAt] = useState("");
  const [directMovie, setDirectMovie] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step === "movies") {
      const el = scrollContainerRef.current;
      if (el) setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }), 50);
    }
  }, [step]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [themeCarousel, setThemeCarousel] = useState(0);
  const [introNote, setIntroNote] = useState("");
  const [participantEmails, setParticipantEmails] = useState<string[]>([]);
  const [participantInput, setParticipantInput] = useState("");
  const [titles, setTitles] = useState(["", "", "", ""]);
  const [saving, setSaving] = useState(false);
  type StreamOption = { name: string; logo: string; type: "flatrate" | "rent" | "buy"; url: string };
  type LibraryHit = {
    plex?: { ratingKey: string; watchUrl: string };
    plexAlt?: { title: string; ratingKey: string; watchUrl: string };
    jellyfin?: { itemId: string; watchUrl: string };
    jellyfinAlt?: { title: string; itemId: string; watchUrl: string };
    streaming?: StreamOption[];
  };
  const [libraryMatches, setLibraryMatches] = useState<Record<string, LibraryHit>>({});
  const [checkingLibrary, setCheckingLibrary] = useState(false);
  const [searchedService, setSearchedService] = useState<"plex" | "jellyfin" | "both" | "none" | null>(null);
  const [customPhotoUrl, setCustomPhotoUrl] = useState<string | null>(null);
  const [customPhotoTitle, setCustomPhotoTitle] = useState<string | null>(null);
  const [showPhotoGrid, setShowPhotoGrid] = useState(false);
  const [captionEnabled, setCaptionEnabled] = useState(false);
  const [puzzleChallengeEnabled, setPuzzleChallengeEnabled] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ title: string; year: number; type: string; reason: string }>>([]);
  const ytWindowRef = useRef<Window | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [addedTitles, setAddedTitles] = useState<Set<string>>(new Set());
  const [seenTitles, setSeenTitles] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [themeGenreFilter, setThemeGenreFilter] = useState<string | null>(null);

  const GENRES = ["Action", "Comedy", "Horror", "Romance", "Sci-Fi", "Thriller", "Drama", "Animation", "Western", "Fantasy", "Mystery", "Documentary"];
  type DinnerItem = { course: string; name: string; description: string };
  type DinnerMenu = { title: string; items: DinnerItem[] };
  type DinnerRecipe = { ingredients: string[]; steps: string[] };
  const [showDinner, setShowDinner] = useState(false);
  const [dinnerMenus, setDinnerMenus] = useState<DinnerMenu[]>([]);
  const [selectedMenuIdx, setSelectedMenuIdx] = useState<number | null>(null);
  const [loadingDinner, setLoadingDinner] = useState(false);
  const [recipes, setRecipes] = useState<Record<string, DinnerRecipe>>({});
  const [loadingRecipe, setLoadingRecipe] = useState<string | null>(null);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [printingMenu, setPrintingMenu] = useState(false);

  const { data } = useQuery<{ items: MovieBracket[] }>({
    queryKey: ["movie-brackets"],
    queryFn: async () => {
      const res = await fetch("/api/movie-brackets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load brackets");
      return res.json();
    },
  });

  const brackets = data?.items ?? [];

  type Friend = { id: string; email: string; firstName: string | null; lastName: string | null };
  const { data: friendsData } = useQuery<Friend[]>({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const friends = friendsData ?? [];

  type LibraryPhoto = { id: number; imageUrl: string; thumbnailUrl: string | null; title: string };
  const { data: photosData } = useQuery<{ items: LibraryPhoto[] }>({
    queryKey: ["photos-for-theme"],
    queryFn: async () => {
      const res = await fetch("/api/photos?limit=100", { credentials: "include" });
      if (!res.ok) return { items: [] };
      return res.json();
    },
    enabled: showPhotoGrid,
    staleTime: 60_000,
  });
  const libraryPhotos = photosData?.items ?? [];

  const reset = () => {
    setStep("theme");
    setDialogMode("bracket");
    setSelectedTheme(null);
    setThemeCarousel(0);
    setIntroNote("");
    setParticipantEmails([]);
    setParticipantInput("");
    setTitles(["", "", "", ""]);
    setLibraryMatches({});
    setCustomPhotoUrl(null);
    setCustomPhotoTitle(null);
    setShowPhotoGrid(false);
    setCaptionEnabled(false);
    setPuzzleChallengeEnabled(false);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedGenre(null);
    setThemeGenreFilter(null);
    setLoadingSuggestions(false);
    setCheckingLibrary(false);
    setSearchedService(null);
    setAddedTitles(new Set());
    setSeenTitles([]);
    setScheduledAt("");
    setDirectMovie("");
  };

  const filteredThemes = themeGenreFilter
    ? MOVIE_NIGHT_THEMES.filter((t) => t.genres.includes(themeGenreFilter))
    : MOVIE_NIGHT_THEMES;
  const previewTheme = filteredThemes[themeCarousel % Math.max(1, filteredThemes.length)];
  const activeThemeName = customPhotoUrl ? (customPhotoTitle ?? "Your Photo") : previewTheme.name;
  const activeThemeTagline = customPhotoUrl ? "" : previewTheme.tagline;
  const updateTitle = (i: number, val: string) => setTitles((prev) => prev.map((t, idx) => idx === i ? val : t));
  const addTitle = () => setTitles((prev) => [...prev, ""]);
  const removeTitle = (i: number) => setTitles((prev) => prev.filter((_, idx) => idx !== i));

  const fetchSuggestions = async (opts?: { genreOverride?: string | null; clearSeen?: boolean }) => {
    const genre = opts?.genreOverride !== undefined ? opts.genreOverride : selectedGenre;
    const exclude = opts?.clearSeen ? [] : seenTitles;
    setShowSuggestions(true);
    setLoadingSuggestions(true);
    setSuggestions([]);
    try {
      const res = await fetch("/api/movie-suggestions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeName: activeThemeName,
          tagline: activeThemeTagline,
          voiceOver: customPhotoUrl ? "" : previewTheme.voiceOver,
          ...(genre ? { genre } : {}),
          exclude,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? `Server error ${res.status}`);
      }
      const data = (await res.json()) as { suggestions: Array<{ title: string; year: number; type: string; reason: string }> };
      const newSuggestions = data.suggestions ?? [];
      setSuggestions(newSuggestions);
      setSeenTitles([...new Set([...exclude, ...newSuggestions.map((s) => s.title)])]);
      // Library check — results sort matching titles to top
      if (newSuggestions.length > 0) {
        setCheckingLibrary(true);
        fetch("/api/integrations/library-check", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titles: newSuggestions.map((s) => s.title) }),
        }).then((r) => r.json()).then((d: { results: Record<string, LibraryHit>; searched?: string }) => {
          setLibraryMatches((prev) => ({ ...prev, ...d.results }));
          if (d.searched) setSearchedService(d.searched as typeof searchedService extends null ? never : NonNullable<typeof searchedService>);
        }).catch(() => {}).finally(() => setCheckingLibrary(false));
      }
    } catch (err) {
      setSuggestions([]);
      toast({ title: "Couldn't load suggestions", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const COURSE_EMOJI: Record<string, string> = {
    Starter: "🥗", Main: "🍽️", Dessert: "🍰", Cocktail: "🍹", Mocktail: "🧃",
  };

  const fetchRecipe = async (course: string, dishName: string, description: string) => {
    const key = `${selectedMenuIdx}-${course}`;
    const cached = recipes[key];
    if (cached && (cached.ingredients.length > 0 || cached.steps.length > 0)) {
      setExpandedRecipe(expandedRecipe === key ? null : key);
      return;
    }
    setLoadingRecipe(key);
    setExpandedRecipe(key);
    try {
      const res = await fetch("/api/movie-dinner-recipe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeName: activeThemeName, dishName, description }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as DinnerRecipe;
      if (data.ingredients.length === 0 && data.steps.length === 0) throw new Error("Empty");
      setRecipes((prev) => ({ ...prev, [key]: data }));
    } catch {
      setExpandedRecipe(null);
      toast({ title: "Couldn't load recipe — tap to retry", variant: "destructive" });
    } finally {
      setLoadingRecipe(null);
    }
  };

  const fetchDinner = async () => {
    setShowDinner(true);
    setLoadingDinner(true);
    setDinnerMenus([]);
    setSelectedMenuIdx(null);
    setRecipes({});
    setExpandedRecipe(null);
    try {
      const res = await fetch("/api/movie-dinner", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeName: activeThemeName, tagline: activeThemeTagline }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { menus: Array<{ title: string; items: Array<{ course: string; name: string; description: string }> }> };
      setDinnerMenus(data.menus ?? []);
    } catch {
      setDinnerMenus([]);
    } finally {
      setLoadingDinner(false);
    }
  };

  const addDinnerToNote = () => {
    if (selectedMenuIdx === null || !dinnerMenus[selectedMenuIdx]) return;
    const menu = dinnerMenus[selectedMenuIdx];
    const block = `🍽 ${activeThemeName.toUpperCase()} DINNER MENU\n${menu.title}\n\n`
      + menu.items.map((i) => `${COURSE_EMOJI[i.course] ?? "•"} ${i.course}: ${i.name}\n   ${i.description}`).join("\n\n");
    setIntroNote((prev) => (prev.trim() ? prev.trim() + "\n\n" : "") + block);
    setShowDinner(false);
    toast({ title: "Menu added to your note" });
  };

  const printMenu = async () => {
    if (selectedMenuIdx === null || !dinnerMenus[selectedMenuIdx]) return;
    const menu = dinnerMenus[selectedMenuIdx];
    setPrintingMenu(true);
    toast({ title: "Consulting the world's top chefs…", description: "Gathering every ingredient and step for your full menu. Sit tight!" });

    // Fetch all missing recipes in parallel before building the PDF
    const allRecipes: Record<string, DinnerRecipe> = { ...recipes };
    await Promise.all(menu.items.map(async (item) => {
      const key = `${selectedMenuIdx}-${item.course}`;
      if (allRecipes[key]?.ingredients.length) return; // already cached
      try {
        const res = await fetch("/api/movie-dinner-recipe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ themeName: previewTheme.name, dishName: item.name, description: item.description }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as DinnerRecipe;
        if (data.ingredients.length > 0 || data.steps.length > 0) allRecipes[key] = data;
      } catch { /* skip missing recipe */ }
    }));
    setRecipes(allRecipes);
    setPrintingMenu(false);

    const coursesHtml = menu.items.map((item) => {
      const key = `${selectedMenuIdx}-${item.course}`;
      const recipe = allRecipes[key];
      const recipeHtml = recipe?.ingredients.length ? `
        <div class="recipe">
          <h4>Ingredients</h4>
          <ul>${recipe.ingredients.map((ing) => `<li>${ing}</li>`).join("")}</ul>
          <h4>Steps</h4>
          <ol>${recipe.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
        </div>` : "";
      return `
        <div class="course">
          <h3>${COURSE_EMOJI[item.course] ?? "•"} ${item.course}: ${item.name}</h3>
          <p class="desc">${item.description}</p>
          ${recipeHtml}
        </div>`;
    }).join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>${activeThemeName} — ${menu.title}</title>
      <style>
        body{font-family:Georgia,serif;max-width:680px;margin:48px auto;color:#111;line-height:1.65;padding:0 24px}
        h1{font-size:1.9em;margin:0 0 2px}
        .subtitle{color:#555;font-style:italic;margin:0 0 2em}
        .course{margin-bottom:1.8em;padding-left:1em;border-left:3px solid #ddd}
        .course h3{margin:0 0 4px;font-size:1.05em}
        .desc{color:#555;margin:0 0 .75em;font-size:.93em}
        .recipe{background:#f7f7f7;border-radius:6px;padding:.75em 1em;margin-top:.5em}
        .recipe h4{margin:.5em 0 .2em;font-size:.78em;text-transform:uppercase;letter-spacing:.08em;color:#888}
        ul,ol{margin:.2em 0 .4em;padding-left:1.4em}
        li{margin-bottom:.2em;font-size:.88em}
        @media print{body{margin:20px}}
      </style>
    </head><body>
      <h1>🍽 ${activeThemeName}</h1>
      <p class="subtitle">${menu.title}</p>
      ${coursesHtml}
    </body></html>`);
    win.document.close();
    win.print();
  };

  const toggleSuggestion = (s: { title: string; year: number }) => {
    const displayTitle = s.year > 0 ? `${s.title} (${s.year})` : s.title;
    if (dialogMode === "direct") {
      if (directMovie === displayTitle) {
        setDirectMovie("");
        setAddedTitles(new Set());
      } else {
        setDirectMovie(displayTitle);
        setAddedTitles(new Set([displayTitle]));
      }
      return;
    }
    if (addedTitles.has(displayTitle)) {
      setAddedTitles((prev) => { const next = new Set(prev); next.delete(displayTitle); return next; });
      setTitles((prev) => {
        const filtered = prev.filter((t) => t !== displayTitle);
        while (filtered.length < 4) filtered.push("");
        return filtered;
      });
    } else {
      setAddedTitles((prev) => new Set(prev).add(displayTitle));
      setTitles((prev) => {
        const emptyIdx = prev.findIndex((t) => t.trim() === "");
        if (emptyIdx !== -1) return prev.map((t, i) => (i === emptyIdx ? displayTitle : t));
        return [...prev, displayTitle];
      });
    }
  };

  const validTitles = titles.map((t) => t.trim()).filter(Boolean);
  const canSave = dialogMode === "direct"
    ? participantEmails.length >= 1 && directMovie.trim().length > 0 && !saving
    : participantEmails.length >= 1 && validTitles.length >= 3 && !saving;

  const addParticipant = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || participantEmails.includes(trimmed)) return;
    setParticipantEmails((prev) => [...prev, trimmed]);
    setParticipantInput("");
  };

  const removeParticipant = (email: string) =>
    setParticipantEmails((prev) => prev.filter((e) => e !== email));

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        participants: participantEmails,
        movies: dialogMode === "direct"
          ? [{ title: directMovie.trim() }]
          : validTitles.map((title) => ({ title })),
      };
      if (customPhotoUrl) body.customThemeUrl = customPhotoUrl;
      else if (selectedTheme) body.theme = selectedTheme;
      if (introNote.trim()) body.introNote = introNote.trim();
      if (dialogMode === "bracket" && captionEnabled) body.captionEnabled = true;
      if (dialogMode === "bracket" && puzzleChallengeEnabled) body.puzzleChallengeEnabled = true;
      if (scheduledAt) body.scheduledAt = new Date(scheduledAt).toISOString();
      if (dialogMode === "direct") body.mode = "direct";
      const res = await fetch("/api/movie-brackets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: ["movie-brackets"] });
      toast({ title: dialogMode === "direct" ? "Movie night planned!" : "Bracket started!" });
      setOpen(false);
      reset();
    } catch (err) {
      toast({ title: dialogMode === "direct" ? "Couldn't plan that night" : "Couldn't start that bracket", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this bracket for everyone? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/movie-brackets/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: ["movie-brackets"] });
      toast({ title: "Bracket removed" });
    } catch (err) {
      toast({ title: "Couldn't remove", description: (err as Error).message, variant: "destructive" });
    }
  };

  const leave = (id: number) => setPendingLeaveId(id);

  const confirmLeave = async () => {
    if (pendingLeaveId === null) return;
    const id = pendingLeaveId;
    setPendingLeaveId(null);
    try {
      const res = await fetch(`/api/movie-brackets/${id}/leave`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Leave failed");
      await queryClient.invalidateQueries({ queryKey: ["movie-brackets"] });
      toast({ title: "Removed from your list", description: "The host has been notified." });
    } catch (err) {
      toast({ title: "Couldn't remove", description: (err as Error).message, variant: "destructive" });
    }
  };

  const renderSuggestionList = () => {
    const inLib = (s: typeof suggestions[number]) => !!(libraryMatches[s.title]?.plex || libraryMatches[s.title]?.jellyfin || libraryMatches[s.title]?.plexAlt || libraryMatches[s.title]?.jellyfinAlt);
    const libRows = suggestions.filter(inLib);
    const otherRows = suggestions.filter((s) => !inLib(s));
    const renderRow = (s: typeof suggestions[number]) => {
      const displayTitle = s.year > 0 ? `${s.title} (${s.year})` : s.title;
      const added = addedTitles.has(displayTitle);
      const hit = libraryMatches[s.title];
      const hasLib = !!(hit?.plex || hit?.jellyfin || hit?.plexAlt || hit?.jellyfinAlt);
      return (
        <button
          key={`${s.title}-${s.year}`}
          onClick={() => toggleSuggestion(s)}
          className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all border ${
            added
              ? "bg-green-500/8 border-green-500/25 hover:bg-red-500/10 hover:border-red-500/25"
              : hasLib
                ? "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15"
                : "bg-white/8 border-white/10 hover:bg-white/15 hover:border-white/25"
          } cursor-pointer`}
        >
          <div
            className={`shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${added ? "bg-green-500/20" : ""}`}
            style={!added ? { backgroundColor: `${previewTheme.accent}22` } : undefined}
          >
            {added ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Plus className="w-3.5 h-3.5" style={{ color: previewTheme.accent }} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white leading-snug">{s.title}</span>
              <span className="text-[11px] text-white/40">{s.year > 0 ? s.year : ""}</span>
              <span className="text-[11px] text-white/35 italic">{s.type}</span>
              {hasLib && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-400/20 px-2 py-0.5 rounded-full shrink-0">
                  <Play className="w-2.5 h-2.5 fill-current" />
                  {hit?.plex ? "In Plex" : "In Jellyfin"}
                </span>
              )}
              {!hasLib && (hit?.plexAlt || hit?.jellyfinAlt) && (() => {
                const altHit = hit.plexAlt ?? hit.jellyfinAlt!;
                const src = hit.plexAlt ? "Plex" : "Jellyfin";
                return (
                  <a
                    href={altHit.watchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300 bg-amber-400/15 hover:bg-amber-400/25 px-2 py-0.5 rounded-full shrink-0 transition-colors"
                    title={`You have "${altHit.title}" in your ${src} library`}
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    {altHit.title} in {src}
                  </a>
                );
              })()}
            </div>
            <p className="text-xs text-white/55 leading-snug mt-0.5">{s.reason}</p>
            {!hasLib && hit?.streaming && hit.streaming.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const stream = hit.streaming!.filter((o) => o.type === "flatrate");
                  const rentBuy = hit.streaming!.filter((o) => o.type !== "flatrate");
                  const seen = new Set<string>();
                  const dedup = (arr: StreamOption[]) => arr.filter((o) => { if (seen.has(o.name)) return false; seen.add(o.name); return true; });
                  const all = dedup([...stream, ...rentBuy]).slice(0, 6);
                  return all.map((o) => (
                    <a
                      key={o.name}
                      href={o.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${o.type === "flatrate" ? "Stream on" : o.type === "rent" ? "Rent on" : "Buy on"} ${o.name}`}
                      className="inline-flex items-center gap-1 text-[10px] text-white/60 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-full px-1.5 py-0.5 transition-colors"
                    >
                      <img src={o.logo} alt={o.name} className="w-3.5 h-3.5 rounded-sm object-cover" />
                      <span>{o.name}</span>
                      {o.type !== "flatrate" && <span className="text-white/35 capitalize">{o.type}</span>}
                    </a>
                  ));
                })()}
              </div>
            )}
          </div>
        </button>
      );
    };
    return (
      <>
        {checkingLibrary && (
          <p className="text-[11px] text-white/35 flex items-center justify-center gap-1.5 py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {searchedService === "plex" ? "Checking your Plex library…" : searchedService === "jellyfin" ? "Checking your Jellyfin library…" : "Checking your library…"}
          </p>
        )}
        {!checkingLibrary && libRows.length > 0 && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70 pt-1 pb-0.5">In your library</p>
        )}
        {libRows.map(renderRow)}
        {!checkingLibrary && suggestions.length > 0 && libRows.length === 0 && (
          <p className="text-[11px] text-white/25 pb-1">
            {searchedService === "plex" ? "None of these are in your Plex library." : searchedService === "jellyfin" ? "None of these are in your Jellyfin library." : "None of these are in your Plex or Jellyfin library."}
            {" "}Stream, rent, or buy options shown below each title.
          </p>
        )}
        {!checkingLibrary && libRows.length > 0 && otherRows.length > 0 && (
          <p className="text-[11px] font-semibold uppercase tracking-widest text-white/25 pt-3 pb-0.5">More suggestions</p>
        )}
        {otherRows.map(renderRow)}
      </>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Film className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Movie Night Bracket
        </h2>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { reset(); setDialogMode("direct"); setScheduledAt(defaultEveningTime()); setOpen(true); }}>
            <CalendarDays className="w-3.5 h-3.5" /> Plan a Night
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { reset(); setDialogMode("bracket"); setScheduledAt(defaultEveningTime()); setOpen(true); }}>
            <Plus className="w-3.5 h-3.5" /> Start a Bracket
          </Button>
        </div>
      </div>

      {brackets.length === 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed border-border bg-card/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <Film className="w-8 h-8 opacity-30" />
          <p className="text-sm">Nominate movies, everyone vetoes one per round — last one standing is tonight's pick.</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {brackets.map((b) => {
            const remaining = b.movies.filter((m) => !b.eliminatedTitles.includes(m.title));
            return (
              <div key={b.id} className="relative group">
                <Link
                  href={`/movie-bracket/${b.id}`}
                  className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
                >
                  <div className="aspect-video flex flex-col items-center justify-center gap-1 relative overflow-hidden px-3 text-center">
                    {(b.theme || b.customThemeUrl) && (
                      <img
                        src={b.customThemeUrl ?? `/theme-${b.theme}.png`}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-60"
                      />
                    )}
                    {!b.theme && !b.customThemeUrl && <div className="absolute inset-0 bg-muted/40" />}
                    <div className="relative z-10 flex flex-col items-center gap-1">
                      {b.status === "completed" ? (
                        <>
                          <Trophy className="w-6 h-6 text-[#D4AF37] mb-1" />
                          <p className="text-xs font-semibold text-white leading-tight line-clamp-2 drop-shadow">{b.winnerTitle}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl font-bold text-white drop-shadow">{remaining.length}</p>
                          <p className="text-[10px] text-white/80 drop-shadow">movies left</p>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="p-3 space-y-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {b.participants?.length > 0
                        ? `${b.participants.length} players`
                        : b.opponentEmail}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.mode === "direct"
                        ? (b.scheduledAt
                            ? new Date(b.scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                            : "Planned")
                        : b.status === "completed"
                        ? "Completed"
                        : `${b.movies.length} nominated`}
                    </p>
                    {b.scheduledAt && b.mode !== "direct" && (
                      <p className="text-xs text-primary/70 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {new Date(b.scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      </p>
                    )}
                  </div>
                </Link>
                {b.isOwner ? (
                  <button
                    onClick={() => void remove(b.id)}
                    title="Delete bracket (host only)"
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => void leave(b.id)}
                    title="Remove from my list"
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-orange-400 transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className={`p-0 overflow-hidden gap-0 border-0 [&>button]:hidden ${step === "theme" ? "left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none rounded-none" : "max-h-[90vh] flex flex-col max-w-lg w-full"}`}>
          {step === "theme" ? (
            /* ── FULL-SCREEN THEME PICKER ── */
            <div className="relative w-full h-full bg-black overflow-hidden">
              {/* Full-bleed image */}
              <img
                key={customPhotoUrl ?? previewTheme.id}
                src={customPhotoUrl ?? previewTheme.image}
                alt={customPhotoUrl ? "Your photo" : previewTheme.name}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
              />
              {/* Gradients: darken top + heavy bottom */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/95" />

              {/* Top bar */}
              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-4">
                <p className="text-[11px] font-semibold tracking-[0.3em] uppercase text-white/50">
                  Movie Night · Pick Your Vibe
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-full bg-black/40 text-white/50 hover:text-white hover:bg-black/70 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Side arrows */}
              <button
                onClick={() => setThemeCarousel((i) => (i - 1 + filteredThemes.length) % filteredThemes.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={() => setThemeCarousel((i) => (i + 1) % filteredThemes.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/80 transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              {/* Bottom content */}
              <div className="absolute bottom-0 left-0 right-0 px-6 pb-5 space-y-3">
                {/* Theme info */}
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold tracking-[0.25em] uppercase" style={{ color: customPhotoUrl ? "#a78bfa" : previewTheme.accent }}>
                    {customPhotoUrl ? "Your Photo" : themeGenreFilter ? `${themeCarousel + 1} of ${filteredThemes.length} · ${themeGenreFilter}` : `${themeCarousel + 1} of ${MOVIE_NIGHT_THEMES.length}`}
                  </p>
                  <h2 className="text-2xl font-bold text-white drop-shadow-lg">{customPhotoUrl ? "Your Photo" : previewTheme.name}</h2>
                  <p className="text-sm text-white/65 italic leading-snug">{customPhotoUrl ? "A personal touch for your movie night" : previewTheme.tagline}</p>
                </div>

                {/* Genre filter chips — pick a genre to narrow the carousel; tap active chip to cycle */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {themeGenreFilter && (
                    <button
                      onClick={() => { setThemeGenreFilter(null); setThemeCarousel(0); }}
                      className="px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all border bg-white/12 border-white/25 text-white/65 hover:bg-white/20 hover:text-white"
                    >
                      ✕ All
                    </button>
                  )}
                  {THEME_GENRES.map((g) => {
                    const active = themeGenreFilter === g;
                    return (
                      <button
                        key={g}
                        onClick={() => {
                          if (active) {
                            setThemeCarousel((i) => (i + 1) % filteredThemes.length);
                          } else {
                            setThemeGenreFilter(g);
                            setThemeCarousel(0);
                          }
                        }}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all border ${
                          active
                            ? "text-black border-transparent"
                            : "bg-black/30 border-white/20 text-white/55 hover:bg-black/50 hover:text-white/80"
                        }`}
                        style={active ? { background: previewTheme.accent, borderColor: previewTheme.accent } : undefined}
                      >
                        {active ? `${g} ${themeCarousel + 1}/${filteredThemes.length}` : g}
                      </button>
                    );
                  })}
                </div>

                {/* Progress dots */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {filteredThemes.map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => setThemeCarousel(i)}
                      title={t.name}
                      className={`h-1.5 rounded-full transition-all duration-200 ${
                        i === themeCarousel ? "w-5 bg-white" : "w-1.5 bg-white/35 hover:bg-white/65"
                      }`}
                    />
                  ))}
                </div>

                {/* Personal note */}
                <Textarea
                  value={introNote}
                  onChange={(e) => setIntroNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder={'Add a personal note shown to your friend… (optional)'}
                  className="resize-none text-sm bg-black/50 border-white/20 text-white placeholder:text-white/30 focus:border-white/50 backdrop-blur-sm"
                />

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-white/60 hover:text-white hover:bg-white/10 shrink-0"
                    onClick={() => setThemeCarousel(Math.floor(Math.random() * filteredThemes.length))}
                  >
                    <Shuffle className="w-3.5 h-3.5" /> Random
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    style={{ color: previewTheme.accent }}
                    onClick={() => void fetchSuggestions()}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Movie Ideas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={loadingDinner}
                    className="gap-1.5 shrink-0 text-white/60 hover:text-white hover:bg-white/10"
                    onClick={() => void fetchDinner()}
                  >
                    {loadingDinner
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <UtensilsCrossed className="w-3.5 h-3.5" />}
                    Dinner & a Movie
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`gap-1.5 shrink-0 ${customPhotoUrl ? "text-violet-400 hover:text-violet-300" : "text-white/60 hover:text-white hover:bg-white/10"}`}
                    onClick={() => setShowPhotoGrid(true)}
                  >
                    <Images className="w-3.5 h-3.5" /> {customPhotoUrl ? "Change Photo" : "My Photos"}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    className="text-white/50 hover:text-white hover:bg-white/10"
                    onClick={() => { setSelectedTheme(null); setCustomPhotoUrl(null); setStep("movies"); }}
                  >
                    No Theme
                  </Button>
                  <Button
                    className="font-bold px-6 text-black"
                    style={{ background: customPhotoUrl ? "#a78bfa" : previewTheme.accent }}
                    onClick={() => { setSelectedTheme(customPhotoUrl ? null : previewTheme.id); setStep("movies"); }}
                  >
                    {customPhotoUrl ? "Use My Photo" : "Use This Theme"}
                  </Button>
                </div>
              </div>
              {/* Suggestions overlay */}
              {showSuggestions && (
                <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.25em] uppercase" style={{ color: previewTheme.accent }}>
                        AI Movie Ideas
                      </p>
                      <h3 className="text-lg font-bold text-white">{activeThemeName}</h3>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {dialogMode === "direct"
                          ? "Plan a Night — tap to pick one movie to watch"
                          : "Start a Bracket — tap movies to add to your list"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void fetchSuggestions()}
                        disabled={loadingSuggestions}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors text-xs font-medium disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingSuggestions ? "animate-spin" : ""}`} />
                        New ideas
                      </button>
                      <button
                        title={`Search "${activeThemeName}" on YouTube`}
                        className="p-1.5 rounded-full bg-white/10 text-white/60 hover:text-red-400 hover:bg-white/20 transition-colors"
                        onClick={() => {
                          const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(activeThemeName + " movies")}`;
                          const win = window.open(url, "urlinc-youtube");
                          if (win) { ytWindowRef.current = win; win.focus(); }
                        }}
                      >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => setShowSuggestions(false)}
                        className="p-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Genre chips */}
                  <div className="shrink-0 px-5 pb-2 flex gap-1.5 flex-wrap">
                    {GENRES.map((g) => {
                      const active = selectedGenre === g;
                      return (
                        <button
                          key={g}
                          onClick={() => {
                            const next = active ? null : g;
                            setSelectedGenre(next);
                            void fetchSuggestions({ genreOverride: next, clearSeen: true });
                          }}
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all border ${
                            active
                              ? "text-black border-transparent"
                              : "bg-white/8 border-white/15 text-white/55 hover:bg-white/15 hover:text-white/80"
                          }`}
                          style={active ? { background: previewTheme.accent, borderColor: previewTheme.accent } : undefined}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>

                  {/* List */}
                  <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
                    {loadingSuggestions ? (
                      <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Loader2 className="w-7 h-7 animate-spin" style={{ color: previewTheme.accent }} />
                        <p className="text-sm text-white/50">Asking AI for ideas…</p>
                      </div>
                    ) : suggestions.length === 0 ? (
                      <div className="flex items-center justify-center h-40">
                        <p className="text-sm text-white/40">No suggestions available. Try again.</p>
                      </div>
                    ) : renderSuggestionList()
                    }
                  </div>

                  {/* Footer */}
                  {!loadingSuggestions && addedTitles.size > 0 && (
                    <div className="shrink-0 px-5 pb-5">
                      <Button
                        className="w-full font-bold text-black"
                        style={{ background: previewTheme.accent }}
                        onClick={() => { setSelectedTheme(previewTheme.id); setStep("movies"); }}
                      >
                        {dialogMode === "direct"
                          ? `Use This Theme · "${directMovie || [...addedTitles][0]}"`
                          : `Use This Theme · ${addedTitles.size} movie${addedTitles.size !== 1 ? "s" : ""} added`}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Dinner overlay */}
              {showDinner && (
                <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm flex flex-col">
                  <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.25em] uppercase" style={{ color: previewTheme.accent }}>
                        Dinner &amp; a Movie
                      </p>
                      <h3 className="text-lg font-bold text-white">{activeThemeName}</h3>
                      <p className="text-[11px] text-white/40 mt-0.5">AI-generated themed menu for your night</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void fetchDinner()}
                        disabled={loadingDinner}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors text-xs font-medium disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingDinner ? "animate-spin" : ""}`} />
                        New ideas
                      </button>
                      <button
                        onClick={() => setShowDinner(false)}
                        className="p-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Menu option cards — one per complete menu, tap to select */}
                  <div className="flex-1 overflow-y-auto px-5 pt-1 pb-3 space-y-2">
                    {loadingDinner ? (
                      <div className="flex flex-col items-center justify-center h-40 gap-3">
                        <Loader2 className="w-7 h-7 animate-spin" style={{ color: previewTheme.accent }} />
                        <p className="text-sm text-white/50">Asking AI for menu ideas…</p>
                      </div>
                    ) : dinnerMenus.length === 0 ? (
                      <div className="flex items-center justify-center h-40">
                        <p className="text-sm text-white/40">No menus available. Try again.</p>
                      </div>
                    ) : (
                      dinnerMenus.map((menu, idx) => {
                        const isSelected = selectedMenuIdx === idx;
                        return (
                          <button
                            key={idx}
                            onClick={() => setSelectedMenuIdx(idx)}
                            className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                              isSelected
                                ? "border-white/40 bg-white/10"
                                : "border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20"
                            }`}
                          >
                            <div className="flex items-start gap-2 mb-2">
                              {isSelected && (
                                <span className="shrink-0 mt-0.5 text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: previewTheme.accent, color: "#000" }}>
                                  Selected
                                </span>
                              )}
                              <span className="text-sm font-bold text-white leading-snug">{menu.title}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                              {menu.items.map((item) => (
                                <span key={item.course} className="text-[11px] text-white/50">
                                  {COURSE_EMOJI[item.course] ?? "•"} {item.name}
                                </span>
                              ))}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Full menu preview + recipe buttons + add — shown when a menu is selected */}
                  {!loadingDinner && selectedMenuIdx !== null && dinnerMenus[selectedMenuIdx] && (
                    <div className="shrink-0 border-t border-white/10 bg-black/60 backdrop-blur-sm">
                      <div className="px-5 pt-4 pb-3">
                        <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-white/35 mb-2">Note preview</p>
                        <div className="max-h-56 overflow-y-auto rounded-lg bg-white/4 px-3 py-2 space-y-3">
                          <div>
                            <p className="text-[11px] font-bold text-white/80">🍽 {activeThemeName.toUpperCase()} DINNER MENU</p>
                            <p className="text-[10px] text-white/40 italic">{dinnerMenus[selectedMenuIdx].title}</p>
                          </div>
                          {dinnerMenus[selectedMenuIdx].items.map((item) => {
                            const key = `${selectedMenuIdx}-${item.course}`;
                            const recipe = recipes[key];
                            const isExpanded = expandedRecipe === key;
                            const isLoadingThis = loadingRecipe === key;
                            return (
                              <div key={item.course} className="space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-white/85">
                                      {COURSE_EMOJI[item.course] ?? "•"} {item.course}: {item.name}
                                    </span>
                                    <p className="text-[11px] text-white/50 leading-snug mt-0.5">{item.description}</p>
                                  </div>
                                  <button
                                    onClick={() => void fetchRecipe(item.course, item.name, item.description)}
                                    className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-colors ${
                                      isExpanded
                                        ? "bg-white/20 text-white"
                                        : "bg-white/8 text-white/50 hover:bg-white/15 hover:text-white/80"
                                    }`}
                                  >
                                    {isLoadingThis
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <ChefHat className="w-3 h-3" />}
                                    Recipe
                                  </button>
                                </div>
                                {isExpanded && recipe && (
                                  <div className="ml-4 rounded-lg bg-white/6 border border-white/8 px-3 py-2 space-y-2">
                                    <div>
                                      <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">Ingredients</p>
                                      <ul className="space-y-0.5">
                                        {recipe.ingredients.map((ing, i) => (
                                          <li key={i} className="text-[11px] text-white/65 flex gap-1.5">
                                            <span className="text-white/30 shrink-0">·</span>{ing}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide mb-1">Steps</p>
                                      <ol className="space-y-1">
                                        {recipe.steps.map((step, i) => (
                                          <li key={i} className="text-[11px] text-white/65 flex gap-1.5">
                                            <span className="shrink-0 font-semibold text-white/30">{i + 1}.</span>{step}
                                          </li>
                                        ))}
                                      </ol>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="px-5 pb-5 flex flex-col gap-2">
                        <Button
                          className="w-full font-bold text-black"
                          style={{ background: previewTheme.accent }}
                          onClick={addDinnerToNote}
                        >
                          Add full menu to note
                        </Button>
                        <Button
                          variant="outline"
                          disabled={printingMenu}
                          className="w-full gap-1.5 text-white/60 border-white/15 hover:text-white hover:border-white/30 text-xs"
                          onClick={() => void printMenu()}
                        >
                          {printingMenu
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Consulting the chefs…</>
                            : <><Printer className="w-3.5 h-3.5" /> Print / Save PDF</>}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* My Photos overlay */}
              {showPhotoGrid && (
                <div className="absolute inset-0 z-10 bg-black/90 backdrop-blur-sm flex flex-col">
                  <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.25em] uppercase text-violet-400">
                        Your Library
                      </p>
                      <h3 className="text-lg font-bold text-white">Pick a Photo</h3>
                    </div>
                    <button
                      onClick={() => setShowPhotoGrid(false)}
                      className="p-1.5 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 pb-5">
                    {libraryPhotos.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-white/40 text-sm gap-2">
                        <Images className="w-8 h-8 opacity-30" />
                        <p>No photos in your library yet</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 gap-1.5">
                        {libraryPhotos.map((photo) => (
                          <button
                            key={photo.id}
                            type="button"
                            onClick={() => { setCustomPhotoUrl(photo.imageUrl); setCustomPhotoTitle(photo.title); setShowPhotoGrid(false); }}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                              customPhotoUrl === photo.imageUrl
                                ? "border-violet-400 ring-2 ring-violet-400/50"
                                : "border-white/10 hover:border-white/40"
                            }`}
                          >
                            <img
                              src={photo.thumbnailUrl ?? photo.imageUrl}
                              alt={photo.title}
                              className="w-full h-full object-cover"
                            />
                            {customPhotoUrl === photo.imageUrl && (
                              <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                                <Check className="w-6 h-6 text-white drop-shadow" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Step 2: movies + opponent */}
              {(selectedTheme || customPhotoUrl) && (
                <div className="relative h-24 shrink-0 overflow-hidden bg-black">
                  <img
                    src={customPhotoUrl ?? `/theme-${selectedTheme}.png`}
                    alt=""
                    className="w-full h-full object-cover opacity-50"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 px-4 pb-2 flex items-center gap-2">
                    <button
                      onClick={() => setStep("theme")}
                      className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
                    >
                      <ChevronLeft className="w-3 h-3" /> Change theme
                    </button>
                    <span className="text-xs text-white/40 ml-auto italic">{getTheme(selectedTheme)?.name}</span>
                  </div>
                </div>
              )}

              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 p-5">
                <DialogHeader className="mb-4">
                  <DialogTitle>
                    {dialogMode === "direct" ? "Plan a Movie Night" : "Start a Movie Night Bracket"}
                  </DialogTitle>
                  <DialogDescription>
                    {dialogMode === "direct"
                      ? "Pick the film, set a date, and invite your group. No voting — just show up and watch."
                      : "Add at least 3 movies and invite your group. Each round everyone vetoes one movie — last one standing is tonight's pick."}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Invite Group
                    </Label>

                    {/* Added participants chips */}
                    {participantEmails.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {participantEmails.map((e) => {
                          const friend = friends.find((f) => f.email === e);
                          const label = friend?.firstName || friend?.lastName
                            ? `${friend.firstName ?? ""} ${friend.lastName ?? ""}`.trim()
                            : e.split("@")[0];
                          return (
                            <span key={e} className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-xs font-medium">
                              {label}
                              <button onClick={() => removeParticipant(e)} className="hover:text-destructive transition-colors ml-0.5">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Add from friends list or by email */}
                    {friends.length > 0 ? (
                      <div className="max-h-40 overflow-y-auto rounded-md border border-input divide-y divide-border">
                        {friends.map((f) => {
                          const isSelected = participantEmails.includes(f.email);
                          const label = f.firstName || f.lastName
                            ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim()
                            : f.email;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => isSelected ? removeParticipant(f.email) : addParticipant(f.email)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50"}`}
                            >
                              <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"}`}>
                                {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              <span className="flex-1 truncate">{label}</span>
                              {(f.firstName || f.lastName) && (
                                <span className="text-muted-foreground text-xs truncate max-w-[120px]">{f.email}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {participantEmails.length === 0 && (
                      <p className="text-xs text-muted-foreground">Select at least one person to invite.</p>
                    )}
                  </div>

                  {dialogMode === "direct" ? (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Clapperboard className="w-3.5 h-3.5" /> Scheduled Movie
                      </Label>
                      <Input
                        value={directMovie}
                        onChange={(e) => setDirectMovie(e.target.value)}
                        placeholder="Movie title…"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Movies <span className="text-muted-foreground font-normal">(at least 3)</span></Label>
                      <div className="space-y-2">
                        {titles.map((t, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              value={t}
                              onChange={(e) => updateTitle(i, e.target.value)}
                              placeholder={`Movie ${i + 1}`}
                            />
                            {titles.length > 3 && (
                              <button onClick={() => removeTitle(i)} className="text-muted-foreground hover:text-foreground shrink-0">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={addTitle}
                        className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 mt-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add another movie
                      </button>
                      <p className="text-xs text-muted-foreground">{validTitles.length} valid title{validTitles.length === 1 ? "" : "s"}</p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" /> Movie Night Date
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground [color-scheme:dark]"
                    />
                  </div>

                  {dialogMode === "bracket" && selectedTheme && (
                    <button
                      type="button"
                      onClick={() => setCaptionEnabled((v) => !v)}
                      className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                        captionEnabled
                          ? "border-primary/50 bg-primary/5"
                          : "border-border bg-card/30 hover:border-border/80"
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        captionEnabled ? "border-primary bg-primary" : "border-muted-foreground/40"
                      }`}>
                        {captionEnabled && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">Caption This before joining</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Guests caption the theme image before they can play — then everyone sees each other's captions.
                        </p>
                      </div>
                    </button>
                  )}

                  {dialogMode === "bracket" && (
                    <button
                      type="button"
                      onClick={() => setPuzzleChallengeEnabled((v) => !v)}
                      className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                        puzzleChallengeEnabled
                          ? "border-amber-500/50 bg-amber-500/5"
                          : "border-border bg-card/30 hover:border-border/80"
                      }`}
                    >
                      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        puzzleChallengeEnabled ? "border-amber-500 bg-amber-500" : "border-muted-foreground/40"
                      }`}>
                        {puzzleChallengeEnabled && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">Puzzle Challenge 🧩</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Each guest picks a mini-game to play before voting. Finishers get the Hall of Fame — everyone else gets the Wall of Shame.
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              <div className="shrink-0 px-5 pb-5 flex gap-2 border-t border-border pt-4">
                {!selectedTheme && (
                  <Button variant="ghost" size="sm" onClick={() => setStep("theme")} className="gap-1">
                    <ChevronLeft className="w-3.5 h-3.5" /> Theme
                  </Button>
                )}
                <div className="flex-1" />
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button disabled={!canSave} onClick={() => void save()}>
                  {saving ? "Saving…" : dialogMode === "direct" ? "Plan It" : "Start Bracket"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingLeaveId !== null} onOpenChange={(o) => { if (!o) setPendingLeaveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from your list?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be removed from this bracket and the host will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmLeave()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
