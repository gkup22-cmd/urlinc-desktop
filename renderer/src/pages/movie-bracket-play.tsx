import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trophy, X, Users, Gamepad2, CalendarDays, Pencil, Check, Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getTheme } from "@/lib/movie-night-themes";

type Caption = { author_email: string; caption: string; display_name: string };
type PuzzleResult = { email: string; game_type: string; completed: boolean; time_ms: number | null; display_name: string };
type PuzzleGames = {
  puzzle:     { id: number; title: string } | null;
  hunt:       { id: number; title: string } | null;
  wordsearch: { id: number; title: string } | null;
};

type MovieBracket = {
  id: number;
  creatorEmail: string;
  opponentEmail: string;
  movies: { title: string }[];
  eliminatedTitles: string[];
  currentTurnEmail: string;
  currentTurnName: string;
  status: "active" | "completed";
  winnerTitle: string | null;
  isMyTurn: boolean;
  theme: string | null;
  introNote: string | null;
  captionEnabled: boolean;
  myCaption: string | null;
  puzzleChallengeEnabled: boolean;
  myPuzzleResult: { game_type: string; completed: boolean; time_ms: number | null } | null;
  // Group voting
  isGroupMode: boolean;
  participants: string[];
  myVote: string | null;
  roundVoteCount: number;
  scheduledAt: string | null;
  mode: string | null;
  isCreator: boolean;
  customThemeUrl: string | null;
};

function downloadICS(title: string, scheduledAt: string) {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//URLinc//Movie Night//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Movie Night: ${title}`,
    "DESCRIPTION:URLinc Movie Night pick",
    `UID:urlinc-movie-${Date.now()}@urlinc.us`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `movie-night-${title.replace(/\s+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MovieBracketPlay() {
  const [, params] = useRoute("/movie-bracket/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = params?.id;

  const [titleCardDismissed, setTitleCardDismissed] = useState(false);
  const [pendingEliminate, setPendingEliminate] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [captionSubmitting, setCaptionSubmitting] = useState(false);
  const [captionWallVisible, setCaptionWallVisible] = useState(false);
  const [captionDone, setCaptionDone] = useState(false);
  const [allCaptions, setAllCaptions] = useState<Caption[]>([]);
  const [puzzleRevealDismissed, setPuzzleRevealDismissed] = useState(false);
  const [puzzlePassSubmitting, setPuzzlePassSubmitting] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  type ParticipantHit = { email: string; displayName: string | null; source: string };
  type LibraryHit = {
    plex?: { ratingKey: string; watchUrl: string };
    jellyfin?: { itemId: string; watchUrl: string };
    participants?: ParticipantHit[];
  };
  const [libraryMatch, setLibraryMatch] = useState<LibraryHit | null>(null);

  const { data: bracket, isLoading, isError } = useQuery<MovieBracket | null>({
    queryKey: ["movie-bracket", id],
    enabled: !!id,
    staleTime: 0,
    retry: false,
    // Poll while a group vote round is in progress (waiting for others)
    refetchInterval: (query) => {
      const b = query.state.data;
      if (!b) return false;
      if (b.isGroupMode && b.status === "active" && b.myVote !== null) return 4000;
      return false;
    },
    queryFn: async () => {
      const res = await fetch(`/api/movie-brackets/${id}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Could not load that bracket");
      return res.json();
    },
  });

  const showPuzzleSelection = !!(bracket?.puzzleChallengeEnabled && !bracket.myPuzzleResult && !captionWallVisible && (!bracket.captionEnabled || !!bracket.myCaption || captionDone));
  const showPuzzleReveal = !!(bracket?.puzzleChallengeEnabled && bracket.myPuzzleResult && !puzzleRevealDismissed);

  const { data: puzzleGames } = useQuery<PuzzleGames>({
    queryKey: ["bracket-puzzle-games"],
    enabled: showPuzzleSelection,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/movie-brackets/puzzle-games`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: puzzleRevealData } = useQuery<{ results: PuzzleResult[] }>({
    queryKey: ["bracket-puzzle-results", id],
    enabled: showPuzzleReveal,
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(`/api/movie-brackets/${id}/puzzle-results`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  // Check the host's library once the winner is known, plus all participant stored indexes
  useEffect(() => {
    if (!bracket?.winnerTitle || bracket.status !== "completed") return;
    const participantEmails = bracket.isGroupMode
      ? bracket.participants
      : [bracket.creatorEmail, bracket.opponentEmail].filter(Boolean);
    fetch("/api/integrations/library-check", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles: [bracket.winnerTitle], participantEmails }),
    }).then((r) => r.json()).then((d: { results: Record<string, LibraryHit> }) => {
      const hit = d.results[bracket.winnerTitle!];
      if (hit) setLibraryMatch(hit);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracket?.winnerTitle, bracket?.status]);

  const back = () => setLocation("/games-vault/movie-bracket");

  const submitCaption = async () => {
    if (!bracket || !captionText.trim()) return;
    setCaptionSubmitting(true);
    try {
      const res = await fetch(`/api/movie-brackets/${bracket.id}/captions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: captionText.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      const wallRes = await fetch(`/api/movie-brackets/${bracket.id}/captions`, { credentials: "include" });
      if (wallRes.ok) {
        const data = (await wallRes.json()) as { captions: Caption[] | null };
        setAllCaptions(data.captions ?? []);
      }
      setCaptionWallVisible(true);
      await queryClient.invalidateQueries({ queryKey: ["movie-bracket", id] });
    } catch {
      toast({ title: "Couldn't submit caption", variant: "destructive" });
    } finally {
      setCaptionSubmitting(false);
    }
  };

  // ── GROUP VOTE ──────────────────────────────────────────────────────────────
  const castVote = async (title: string) => {
    if (!bracket) return;
    try {
      const res = await fetch(`/api/movie-brackets/${bracket.id}/vote`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      await queryClient.invalidateQueries({ queryKey: ["movie-bracket", id] });
      await queryClient.invalidateQueries({ queryKey: ["movie-brackets"] });
      setPendingEliminate(null);
    } catch (err) {
      toast({ title: "Couldn't cast vote", description: (err as Error).message, variant: "destructive" });
    }
  };

  // ── PUZZLE PASS ──────────────────────────────────────────────────────────────
  const choosePuzzlePass = async () => {
    if (!bracket) return;
    setPuzzlePassSubmitting(true);
    try {
      await fetch(`/api/movie-brackets/${bracket.id}/puzzle-result`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: "pass", completed: false, timeMs: null }),
      });
      await queryClient.invalidateQueries({ queryKey: ["movie-bracket", id] });
    } catch {
      toast({ title: "Couldn't record that", variant: "destructive" });
    } finally {
      setPuzzlePassSubmitting(false);
    }
  };

  // ── LEGACY 2-PLAYER ELIMINATE ──────────────────────────────────────────────
  const eliminate = async (title: string) => {
    if (!bracket?.isMyTurn) return;
    try {
      const res = await fetch(`/api/movie-brackets/${bracket.id}/eliminate`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      await queryClient.invalidateQueries({ queryKey: ["movie-bracket", id] });
      await queryClient.invalidateQueries({ queryKey: ["movie-brackets"] });
    } catch (err) {
      toast({ title: "Couldn't eliminate that movie", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">Loading…</div>;
  }

  if (isError || bracket === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-8 text-center text-white">
        <span className="text-6xl">🎬</span>
        <h2 className="text-2xl font-bold">This movie night was cancelled</h2>
        <p className="max-w-xs text-sm text-white/50">
          {isError ? "Something went wrong loading this bracket." : "The host removed this bracket. Nothing left to see here!"}
        </p>
        <button
          onClick={() => setLocation("/")}
          className="mt-2 rounded-lg bg-white/10 px-6 py-2 text-sm text-white transition hover:bg-white/20"
        >
          Back home
        </button>
      </div>
    );
  }

  if (!bracket) {
    return <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">Loading…</div>;
  }

  const theme = getTheme(bracket.theme);
  const themeImage = theme?.image ?? bracket.customThemeUrl ?? null;
  const needsCaption = bracket.captionEnabled && !bracket.myCaption && !captionDone;

  // ── CAPTION INPUT SCREEN ──
  if (needsCaption && !captionWallVisible) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black text-white">
        {themeImage && (
          <>
            <img src={themeImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/90" />
          </>
        )}

        <div className="relative z-10 flex flex-col items-center gap-5 px-8 text-center max-w-xl w-full">
          <p className="text-[11px] font-semibold tracking-[0.3em] uppercase" style={{ color: theme?.accent ?? "#fff" }}>
            Caption This
          </p>
          <h1 className="text-3xl font-bold drop-shadow-lg">{theme?.name ?? "Movie Night"}</h1>
          <p className="text-white/60 italic text-sm leading-relaxed">{theme?.tagline}</p>

          <Textarea
            value={captionText}
            onChange={(e) => setCaptionText(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Write your caption for this theme…"
            className="w-full resize-none text-sm bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/50 backdrop-blur-sm"
          />
          <p className="text-xs text-white/30 self-end -mt-3">{captionText.length}/300</p>

          <Button
            size="lg"
            disabled={!captionText.trim() || captionSubmitting}
            className="px-10 font-bold text-black"
            style={{ background: theme?.accent ?? "#fff" }}
            onClick={() => void submitCaption()}
          >
            {captionSubmitting ? "Submitting…" : "Submit Caption"}
          </Button>

          <button
            className="text-xs text-white/25 hover:text-white/50 transition-colors mt-1"
            onClick={() => setCaptionDone(true)}
          >
            Skip (host)
          </button>
        </div>
      </div>
    );
  }

  // ── CAPTION WALL ──
  if (captionWallVisible) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-black text-white">
        {themeImage && (
          <>
            <img src={themeImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-black/80" />
          </>
        )}

        <div className="relative z-10 flex flex-col min-h-screen">
          <div className="px-8 pt-14 pb-4 text-center">
            <p className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-2" style={{ color: theme?.accent ?? "#fff" }}>
              Captions Are In
            </p>
            <h2 className="text-2xl font-bold">{theme?.name ?? "Movie Night"}</h2>
            <p className="text-sm text-white/50 mt-1">Everyone's take on the theme</p>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 max-w-xl mx-auto w-full">
            {allCaptions.length === 0 ? (
              <p className="text-center text-white/30 py-8 text-sm">No captions yet.</p>
            ) : (
              allCaptions.map((c) => (
                <div
                  key={c.author_email}
                  className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                >
                  <p className="text-[11px] text-white/40 mb-1.5 font-medium tracking-wide uppercase">
                    {c.display_name}
                  </p>
                  <p className="text-white/90 italic leading-relaxed">"{c.caption}"</p>
                </div>
              ))
            )}
          </div>

          <div className="px-8 pb-10 max-w-xl mx-auto w-full">
            <Button
              size="lg"
              className="w-full font-bold text-black"
              style={{ background: theme?.accent ?? "#fff" }}
              onClick={() => { setCaptionWallVisible(false); setCaptionDone(true); }}
            >
              Let's Pick Our Movie
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── PUZZLE GAME SELECTION ──
  if (showPuzzleSelection) {
    const huntGame = puzzleGames?.hunt ?? null;
    const gameOptions: { emoji: string; label: string; tagline: string; available: boolean; onClick: () => void }[] = [
      {
        emoji: "🧩",
        label: "Jigsaw Puzzle",
        tagline: "Assemble tonight's theme image",
        available: true,
        onClick: () => setLocation(`/puzzle/bracket?bracketId=${bracket.id}`),
      },
      {
        emoji: "🔤",
        label: "Word Search",
        tagline: "Find every hidden word",
        available: true,
        onClick: () => setLocation(`/wordsearch/bracket?bracketId=${bracket.id}`),
      },
      {
        emoji: "🔍",
        label: "Seek & Find",
        tagline: huntGame ? "Hunt for hidden objects" : "No games available in the vault",
        available: !!huntGame,
        onClick: () => huntGame && setLocation(`/hunt/${huntGame.id}?bracketId=${bracket.id}`),
      },
    ];
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black text-white">
        {themeImage && (
          <>
            <img src={themeImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-black/70" />
          </>
        )}
        <div className="relative z-10 w-full max-w-sm px-6 py-10 space-y-6 text-center">
          <Gamepad2 className="mx-auto h-10 w-10 text-amber-400" />
          <div>
            <h2 className="text-2xl font-bold">Puzzle Challenge</h2>
            <p className="mt-1.5 text-sm text-white/50">Pick a game to play before voting. Complete it to earn the Hall of Fame.</p>
          </div>

          <div className="space-y-3">
            {gameOptions.map(({ emoji, label, tagline, available, onClick }) => (
              <div key={label}>
                <button
                  disabled={!available}
                  onClick={available ? onClick : undefined}
                  className={`w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${
                    available
                      ? "border-white/20 bg-white/5 hover:border-amber-400/50 hover:bg-amber-400/5"
                      : "border-white/10 bg-white/5 opacity-40 cursor-not-allowed"
                  }`}
                >
                  <span className="text-3xl">{emoji}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{label}</p>
                    <p className="text-xs text-white/50">{tagline}</p>
                  </div>
                </button>
                {label === "Seek & Find" && !available && (
                  <p className="mt-1.5 px-1 text-left text-xs text-amber-400/70">
                    💡 Psst — head to the Games section and look for the vault. Expand your mind and other things to find the hidden key and you can create your own Seek & Find games. Shhh!, it's a secret passage way.
                  </p>
                )}
              </div>
            ))}

            <button
              onClick={() => void choosePuzzlePass()}
              disabled={puzzlePassSubmitting}
              className="w-full flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-red-400/30 hover:bg-red-400/5"
            >
              <span className="text-3xl">😬</span>
              <div className="flex-1">
                <p className="font-semibold text-white">Pass</p>
                <p className="text-xs text-white/50">Skip the game — Wall of Shame awaits</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PUZZLE REVEAL ──
  if (showPuzzleReveal) {
    const hallOfFame = (puzzleRevealData?.results ?? []).filter((r) => r.completed);
    const wallOfShame = (puzzleRevealData?.results ?? []).filter((r) => !r.completed);
    const gameLabels: Record<string, string> = { puzzle: "Jigsaw", wordsearch: "Word Search", hunt: "Seek & Find", pass: "Passed" };
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-black text-white">
        {themeImage && (
          <>
            <img src={themeImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-20" />
            <div className="absolute inset-0 bg-black/80" />
          </>
        )}
        <div className="relative z-10 flex flex-col min-h-screen">
          <div className="px-8 pt-14 pb-4 text-center">
            <p className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-2 text-amber-400">Puzzle Challenge Results</p>
            <h2 className="text-2xl font-bold">How'd everyone do?</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5 max-w-sm mx-auto w-full">
            {hallOfFame.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-[#D4AF37] mb-2">🏆 Hall of Fame</p>
                <div className="space-y-2">
                  {hallOfFame.map((r) => (
                    <div key={r.email} className="flex items-center gap-3 rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 px-4 py-3">
                      <Trophy className="h-4 w-4 text-[#D4AF37] shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{r.display_name}</p>
                        <p className="text-xs text-white/40">{gameLabels[r.game_type] ?? r.game_type}{r.time_ms ? ` · ${Math.floor(r.time_ms / 60000)}:${String(Math.floor((r.time_ms % 60000) / 1000)).padStart(2, "0")}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {wallOfShame.length > 0 && (
              <div>
                <p className="text-xs font-semibold tracking-wider uppercase text-white/30 mb-2">😬 Wall of Shame</p>
                <div className="space-y-2">
                  {wallOfShame.map((r) => (
                    <div key={r.email} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                      <span className="text-base">😬</span>
                      <div className="flex-1">
                        <p className="text-sm text-white/60">{r.display_name}</p>
                        <p className="text-xs text-white/30">{gameLabels[r.game_type] ?? r.game_type}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!puzzleRevealData && (
              <p className="text-center text-sm text-white/30 py-8">Loading results…</p>
            )}
          </div>

          <div className="px-8 pb-10 max-w-sm mx-auto w-full">
            <Button
              size="lg"
              className="w-full font-bold text-black"
              style={{ background: theme?.accent ?? "#D4AF37" }}
              onClick={() => setPuzzleRevealDismissed(true)}
            >
              Let's Vote!
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── TITLE CARD ──
  const showTitleCard = !!theme && !titleCardDismissed && bracket?.status !== "completed";
  if (showTitleCard) {
    return (
      <div
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-black text-white"
        style={{ "--theme-accent": theme.accent } as React.CSSProperties}
      >
        <img src={theme.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/80" />

        <div className="relative z-10 flex flex-col items-center gap-6 px-8 text-center max-w-xl">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase" style={{ color: theme.accent }}>
            URLinc Movie Night
          </p>
          <h1 className="text-4xl font-bold leading-tight drop-shadow-lg">{theme.name}</h1>
          <p className="text-lg text-white/70 italic leading-relaxed">{theme.tagline}</p>
          <p className="text-sm text-white/50 leading-relaxed max-w-sm">{theme.voiceOver}</p>

          {bracket.introNote && (
            <div
              className="rounded-xl border px-5 py-3 text-sm text-white/80 italic"
              style={{ borderColor: `${theme.accent}40`, background: `${theme.accent}15` }}
            >
              "{bracket.introNote}"
            </div>
          )}

          <Button
            size="lg"
            className="mt-2 px-10 text-black font-bold"
            style={{ background: theme.accent }}
            onClick={() => setTitleCardDismissed(true)}
          >
            Let's Pick Our Movie
          </Button>
        </div>
      </div>
    );
  }

  // ── BRACKET GAME ──
  const remaining = bracket.movies.filter((m) => !bracket.eliminatedTitles.includes(m.title));

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-3">
        <button onClick={back} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">Movie Night Bracket</h1>
          {bracket.isGroupMode && (
            <span className="flex items-center gap-1 text-xs text-white/40">
              <Users className="h-3.5 w-3.5" /> {bracket.participants.length} players
            </span>
          )}
        </div>

        {bracket.status === "completed" ? (
          <div className="flex flex-col items-center rounded-xl border border-[#D4AF37]/40 bg-[#1E293B] p-8 text-center">
            <Trophy className="mb-3 h-12 w-12 text-[#D4AF37]" />
            <p className="text-sm text-white/50">
              {bracket.mode === "direct" ? "You're watching" : "Tonight's movie is"}
            </p>
            <p className="mt-1 text-2xl font-bold text-white">{bracket.winnerTitle}</p>
            {bracket.mode === "direct" && (
              <div className="mt-4 w-full max-w-sm">
                {editingNote ? (
                  <div className="space-y-2">
                    {bracket.introNote && (
                      <p className="text-[11px] text-[#D4AF37]/50 tracking-wide uppercase">Add an update</p>
                    )}
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder={bracket.introNote ? "What's new? Your update will appear at the top…" : "Write a note for your group…"}
                      className="w-full rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/5 px-4 py-3 text-sm text-white/80 italic leading-relaxed resize-none placeholder:text-white/30 focus:outline-none focus:border-[#D4AF37]/60"
                    />
                    {bracket.introNote && (
                      <div className="max-h-24 overflow-y-auto border border-white/10 rounded-lg px-3 py-2 bg-white/5">
                        <p className="text-[11px] text-white/30 mb-1 uppercase tracking-wide">Original note</p>
                        <p className="text-xs text-white/40 italic leading-relaxed">{bracket.introNote}</p>
                      </div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingNote(false)}
                        className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={noteSaving || !noteText.trim()}
                        onClick={async () => {
                          setNoteSaving(true);
                          const finalNote = bracket.introNote
                            ? `Update: ${noteText.trim()}\n\n${bracket.introNote}`
                            : noteText.trim();
                          try {
                            await fetch(`/api/movie-brackets/${bracket.id}/note`, {
                              method: "PATCH",
                              credentials: "include",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ note: finalNote }),
                            });
                            await queryClient.invalidateQueries({ queryKey: ["movie-bracket", id] });
                            setEditingNote(false);
                            setNoteText("");
                          } finally {
                            setNoteSaving(false);
                          }
                        }}
                        className="flex items-center gap-1 text-xs font-medium rounded-lg bg-[#D4AF37] text-black px-3 py-1 hover:bg-[#c9a227] transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> {noteSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {bracket.introNote ? (
                      <div className="max-h-36 overflow-y-auto border border-[#D4AF37]/20 rounded-xl px-4 py-3 bg-[#D4AF37]/5">
                        <p className="text-sm text-white/70 italic leading-relaxed whitespace-pre-line">"{bracket.introNote}"</p>
                      </div>
                    ) : bracket.isCreator ? (
                      <p className="text-xs text-white/30 italic">No note yet — add one for your group.</p>
                    ) : null}
                    {bracket.isCreator && (
                      <button
                        onClick={() => { setNoteText(""); setEditingNote(true); }}
                        className="mt-2 flex items-center gap-1.5 text-xs text-[#D4AF37]/50 hover:text-[#D4AF37] transition-colors"
                      >
                        <Pencil className="w-3 h-3" /> {bracket.introNote ? "Add update" : "Add a note"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {bracket.scheduledAt && (
              <p className="mt-3 text-sm text-white/60">
                {new Date(bracket.scheduledAt).toLocaleDateString(undefined, {
                  weekday: "long", month: "long", day: "numeric",
                  hour: "numeric", minute: "2-digit",
                })}
              </p>
            )}
            {bracket.scheduledAt && (
              <button
                onClick={() => downloadICS(bracket.winnerTitle!, bracket.scheduledAt!)}
                className="mt-4 flex items-center gap-1.5 rounded-lg border border-white/20 px-4 py-2 text-sm text-white/70 hover:text-white hover:border-white/40 transition-colors"
              >
                <CalendarDays className="h-4 w-4" /> Add to Calendar
              </button>
            )}

            {/* Watch Now / Find It row */}
            <div className="mt-5 flex flex-col items-center gap-2 w-full max-w-xs">
              {libraryMatch?.plex && (
                <a
                  href={libraryMatch.plex.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#E5A00D] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#f0b020] transition-colors"
                >
                  <Play className="h-4 w-4 fill-current" /> Watch in Plex
                </a>
              )}
              {libraryMatch?.jellyfin && (
                <a
                  href={libraryMatch.jellyfin.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#00A4DC] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0090c5] transition-colors"
                >
                  <Play className="h-4 w-4 fill-current" /> Watch in Jellyfin
                </a>
              )}
              {!libraryMatch?.plex && !libraryMatch?.jellyfin && bracket.winnerTitle && (
                <a
                  href={`https://www.justwatch.com/us/search?q=${encodeURIComponent(bracket.winnerTitle)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 rounded-lg border border-white/20 px-5 py-2.5 text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
                >
                  <ExternalLink className="h-4 w-4" /> Find somewhere to watch
                </a>
              )}
              {(libraryMatch?.participants ?? []).length > 0 && (
                <div className="w-full mt-1 rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-left">
                  <p className="text-[11px] text-white/40 font-semibold uppercase tracking-wider mb-2">In someone's library</p>
                  <div className="space-y-1.5">
                    {libraryMatch!.participants!.map((p) => (
                      <div key={p.email} className="flex items-center gap-2 text-sm text-white/80">
                        <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                          p.source.includes("plex")
                            ? "bg-[#E5A00D]/20 text-[#E5A00D]"
                            : "bg-[#AA5CC3]/20 text-[#AA5CC3]"
                        }`}>
                          {p.source.includes("plex") ? "Plex" : "Jellyfin"}
                        </span>
                        <span className="truncate">{p.displayName ?? p.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : bracket.isGroupMode ? (
          /* ── GROUP VOTING UI ── */
          <>
            {bracket.myVote === null ? (
              <p className="text-sm text-white/50">
                Your turn — {remaining.length} left. Pick the one you want to cut.
              </p>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <p className="text-white/70">You voted to cut <span className="text-white font-medium">{bracket.myVote}</span>.</p>
                <p className="text-white/40 text-xs mt-1">
                  {bracket.roundVoteCount} of {bracket.participants.length} voted — waiting for the rest…
                </p>
              </div>
            )}

            <div className="space-y-2">
              {remaining.map((m) => {
                const isMyVote = bracket.myVote === m.title;
                const isPending = pendingEliminate === m.title;
                return (
                  <div
                    key={m.title}
                    className={`rounded-lg border transition-all ${
                      isMyVote
                        ? "border-red-500/40 bg-red-500/5"
                        : isPending
                        ? "border-red-500/50 bg-[#1A1A1A]"
                        : "border-white/10 bg-[#1A1A1A]"
                    }`}
                  >
                    <button
                      onClick={() => {
                        if (bracket.myVote !== null) return;
                        setPendingEliminate(isPending ? null : m.title);
                      }}
                      disabled={bracket.myVote !== null}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-white transition hover:bg-white/5 disabled:cursor-default rounded-lg"
                    >
                      <span>{m.title}</span>
                      {isMyVote && <span className="text-xs text-red-400">Your veto</span>}
                      {!isMyVote && !isPending && bracket.myVote === null && (
                        <span className="text-xs text-white/30">Veto</span>
                      )}
                    </button>
                    {isPending && (
                      <div className="flex items-center gap-2 px-4 pb-3">
                        <button
                          onClick={() => void castVote(m.title)}
                          className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
                        >
                          Yes, veto this
                        </button>
                        <button
                          onClick={() => setPendingEliminate(null)}
                          className="flex-1 rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {bracket.eliminatedTitles.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-white/30 mb-2">Eliminated</p>
                <div className="space-y-1">
                  {(bracket.eliminatedTitles as string[]).map((t) => (
                    <p key={t} className="text-sm text-white/30 line-through">{t}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── LEGACY 2-PLAYER UI ── */
          <>
            <p className="text-sm text-white/50">
              {bracket.isMyTurn
                ? `Your turn — ${remaining.length} left. Eliminate one.`
                : `Waiting for ${bracket.currentTurnName} to eliminate a movie.`}
            </p>
            <div className="space-y-2">
              {remaining.map((m) => (
                <div
                  key={m.title}
                  className={`rounded-lg border bg-[#1A1A1A] transition-all ${
                    pendingEliminate === m.title
                      ? "border-red-500/50"
                      : "border-white/10"
                  }`}
                >
                  <button
                    onClick={() => bracket.isMyTurn && setPendingEliminate(pendingEliminate === m.title ? null : m.title)}
                    disabled={!bracket.isMyTurn}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-white transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50 rounded-lg"
                  >
                    <span>{m.title}</span>
                    {bracket.isMyTurn && pendingEliminate !== m.title && (
                      <span className="flex items-center gap-1 text-xs text-white/40">
                        <X className="h-3.5 w-3.5" /> Eliminate
                      </span>
                    )}
                  </button>
                  {pendingEliminate === m.title && (
                    <div className="flex items-center gap-2 px-4 pb-3">
                      <button
                        onClick={() => { void eliminate(m.title); setPendingEliminate(null); }}
                        className="flex-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
                      >
                        Yes, eliminate
                      </button>
                      <button
                        onClick={() => setPendingEliminate(null)}
                        className="flex-1 rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {bracket.eliminatedTitles.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-white/30 mb-2">Eliminated</p>
                <div className="space-y-1">
                  {(bracket.eliminatedTitles as string[]).map((t) => (
                    <p key={t} className="text-sm text-white/30 line-through">{t}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
