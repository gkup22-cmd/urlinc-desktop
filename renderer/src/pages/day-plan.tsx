import { useState, useCallback, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import {
  MapPin, CalendarDays, Compass, Loader2, ArrowRight,
  RefreshCw, ChevronLeft, ChevronRight, Clock, Wallet,
  Shirt, Sparkles, Info, Navigation, RotateCcw, Check, Copy, Lock,
  BookmarkPlus, Bookmark, Trash2, FolderOpen, Film, ShoppingCart, Share2, Users, X,
  Video, ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const LOADING_MESSAGES = [
  "Geocoding your location…",
  "Scouting morning spots…",
  "Finding the best lunch…",
  "Planning your afternoon…",
  "Booking dinner ideas…",
  "Discovering evening options…",
  "Putting it all together…",
];

// ── Constants ────────────────────────────────────────────────────────────────

const VIBES = [
  { id: "outdoors", label: "Outdoors & nature" },
  { id: "food",     label: "Food & drink" },
  { id: "arts",     label: "Arts & culture" },
  { id: "music",    label: "Live music" },
  { id: "thrill",   label: "Adventure & thrills" },
  { id: "hidden",   label: "Hidden gems" },
  { id: "markets",  label: "Markets & shopping" },
  { id: "chill",    label: "Chill & wellness" },
  { id: "family",   label: "Family friendly" },
  { id: "night",    label: "Nightlife" },
  { id: "history",  label: "History" },
  { id: "sports",   label: "Sports & games" },
] as const;

const BUDGETS = [
  { id: "free",  label: "Nearly free",          note: "Under $25 / person" },
  { id: "lean",  label: "Easy on the wallet",   note: "$25 – $60 / person" },
  { id: "mid",   label: "Mid-range",            note: "$60 – $130 / person" },
  { id: "treat", label: "Treat yourself",       note: "$130+ / person" },
  { id: "open",  label: "No budget",            note: "Anything goes" },
] as const;

const SLOT_ORDER = ["Morning", "Lunch", "Afternoon", "Dinner", "Evening"] as const;

const SLOT_COLORS: Record<string, { border: string; pill: string; dot: string }> = {
  Morning:   { border: "border-amber-500/30",  pill: "bg-amber-500/15 text-amber-300",  dot: "bg-amber-400" },
  Lunch:     { border: "border-green-500/30",  pill: "bg-green-500/15 text-green-300",  dot: "bg-green-400" },
  Afternoon: { border: "border-sky-500/30",    pill: "bg-sky-500/15 text-sky-300",      dot: "bg-sky-400" },
  Dinner:    { border: "border-orange-500/30", pill: "bg-orange-500/15 text-orange-300", dot: "bg-orange-400" },
  Evening:   { border: "border-purple-500/30", pill: "bg-purple-500/15 text-purple-300", dot: "bg-purple-400" },
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function money(n: number) {
  return n === 0 ? "Free" : `$${Math.round(n)}`;
}

function prettyTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

function prettyDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
}

function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActivityOption {
  title: string;
  description: string;
  category: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
  cost_per_person: number;
  cost_notes: string | null;
  attire: string;
  why_it_fits: string;
  booking_note: string | null;
  affiliate_url?: string;
}

function amazonMovieUrl(title: string) {
  return `https://www.amazon.com/s?k=${encodeURIComponent(title)}&i=instant-video&tag=urlinctm-20`;
}

function mapsUrl(title: string, address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} ${address}`)}`;
}

interface SavedPlan {
  id: number;
  area_name: string;
  plan_date: string;
  selection: number[];
  plan_json: DayPlan;
  created_at: string;
}

interface DaySlot {
  slot: string;
  time_label: string;
  options: ActivityOption[];
}

interface DayPlan {
  resolved_location: string;
  area_name: string;
  latitude: number;
  longitude: number;
  radius_miles: number;
  plan_date: string;
  vibes: string[];
  budget_level: string;
  slots: DaySlot[];
}

// ── Activity card ──────────────────────────────────────────────────────────

function ActivityCard({ option }: { option: ActivityOption }) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold leading-snug">{option.title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{option.description}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
          <span>{option.address}</span>
        </div>
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
          <span>{prettyTime(option.start_time)} – {prettyTime(option.end_time)} · {formatDuration(option.duration_minutes)}</span>
        </div>
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <Wallet className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
          <span>{money(option.cost_per_person)} / person{option.cost_notes ? ` · ${option.cost_notes}` : ""}</span>
        </div>
        <div className="flex items-start gap-1.5 text-muted-foreground">
          <Shirt className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
          <span>{option.attire}</span>
        </div>
      </div>

      {option.why_it_fits && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-muted-foreground/80">
          <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/50" />
          <span className="italic">{option.why_it_fits}</span>
        </div>
      )}

      {option.booking_note && (
        <div className="flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-[12px] text-secondary-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-60" />
          <span>{option.booking_note}</span>
        </div>
      )}

      {option.affiliate_url ? (
        <a
          href={option.affiliate_url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-amber-400 hover:underline underline-offset-2"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Rent or Buy on Amazon
        </a>
      ) : (
        <a
          href={mapsUrl(option.title, option.address)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline underline-offset-2"
        >
          <Navigation className="h-3.5 w-3.5" />
          Directions &amp; map
        </a>
      )}
    </div>
  );
}

// ── Slot row ─────────────────────────────────────────────────────────────────

function SlotRow({
  slot,
  selectedIdx,
  onSwap,
  onRefresh,
  refreshing,
}: {
  slot: DaySlot;
  selectedIdx: number;
  onSwap: (idx: number) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const colors = SLOT_COLORS[slot.slot] ?? SLOT_COLORS["Morning"];
  const option = slot.options[selectedIdx] ?? slot.options[0];
  const count = slot.options.length;

  return (
    <div className={`rounded-xl border ${colors.border} bg-card p-4 md:p-5 mb-4`}>
      {/* Slot header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
          <span className={`text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${colors.pill}`}>
            {slot.slot}
          </span>
          <span className="text-xs text-muted-foreground">{slot.time_label}</span>
        </div>

        <div className="flex items-center gap-1">
          {count > 1 && (
            <>
              <button
                onClick={() => onSwap((selectedIdx - 1 + count) % count)}
                className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Previous option"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-center">
                {selectedIdx + 1}/{count}
              </span>
              <button
                onClick={() => onSwap((selectedIdx + 1) % count)}
                className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Next option"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="Get new options for this slot"
          >
            {refreshing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />
            }
          </button>
        </div>
      </div>

      {option ? (
        <ActivityCard option={option} />
      ) : (
        <p className="text-sm text-muted-foreground">No option selected.</p>
      )}
    </div>
  );
}

// ── Budget summary panel ──────────────────────────────────────────────────────

function BudgetPanel({ plan, selection }: { plan: DayPlan; selection: number[] }) {
  const selectedOptions = plan.slots.map((s, i) => s.options[selection[i] ?? 0]);
  const total = selectedOptions.reduce((sum, o) => sum + (o?.cost_per_person ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Budget breakdown</p>
      {plan.slots.map((s, i) => {
        const opt = s.options[selection[i] ?? 0];
        return (
          <div key={s.slot} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{s.slot}</span>
            <span className="font-medium tabular-nums">{opt ? money(opt.cost_per_person) : "—"}</span>
          </div>
        );
      })}
      <div className="border-t border-border pt-2 flex items-center justify-between font-semibold">
        <span>Total / person</span>
        <span className="text-primary tabular-nums">{money(total)}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DayPlanPage() {
  const { toast } = useToast();

  // Form state
  const [location, setLocation] = useState("");
  const [radius, setRadius] = useState(15);
  const [date, setDate] = useState(todayISO());
  const [vibes, setVibes] = useState<string[]>([]);
  const [budget, setBudget] = useState("lean");
  const [locationError, setLocationError] = useState(false);
  const [scanVibes, setScanVibes] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(true);

  // Plan state
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
  const [refreshingSlot, setRefreshingSlot] = useState<number | null>(null);
  const [seenTitles, setSeenTitles] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [saveLimit, setSaveLimit] = useState(10);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [movieTitle, setMovieTitle] = useState("");
  const [showMovieInput, setShowMovieInput] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [friends, setFriends] = useState<{ id: string; firstName: string | null; lastName: string | null; email: string }[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sharingToId, setSharingToId] = useState<string | null>(null);
  const [sharedToIds, setSharedToIds] = useState<Set<string>>(new Set());
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleVibe = (id: string) =>
    setVibes((cur) =>
      cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]
    );

  const startLoadingCycle = () => {
    let i = 0;
    setLoadingMsg(LOADING_MESSAGES[0]);
    loadingIntervalRef.current = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length;
      setLoadingMsg(LOADING_MESSAGES[i]);
    }, 2800);
  };

  const stopLoadingCycle = () => {
    if (loadingIntervalRef.current) {
      clearInterval(loadingIntervalRef.current);
      loadingIntervalRef.current = null;
    }
  };

  useEffect(() => () => stopLoadingCycle(), []);

  // Sequential sweep: left→right across row 1, left→right across row 2,
  // then reverse right→left row 2, right→left row 1, then all dark.
  useEffect(() => {
    const vibeIds = VIBES.map((v) => v.id);
    const sweep = [...vibeIds, ...vibeIds.slice().reverse()];
    const sequence = [...sweep, ...sweep]; // two full passes
    let i = 0;
    const id = setInterval(() => {
      if (i >= sequence.length) {
        clearInterval(id);
        setScanVibes(new Set());
        setIsScanning(false);
        return;
      }
      setScanVibes(new Set([sequence[i]]));
      i++;
    }, 100);
    return () => clearInterval(id);
  }, []);

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch("/api/day-plan/saved", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json() as { plans: SavedPlan[]; limit: number };
      setSavedPlans(data.plans);
      setSaveLimit(data.limit);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await fetch("/api/day-plan/save", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, selection }),
      });
      const data = await res.json() as { id?: number; error?: string };
      if (!res.ok) {
        toast({ title: "Couldn't save", description: data.error ?? "Try again", variant: "destructive" });
        return;
      }
      setSavedId(data.id ?? null);
      fetchSaved();
    } catch {
      toast({ title: "Save failed", description: "Check your connection", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSaved = async (id: number) => {
    try {
      await fetch(`/api/day-plan/saved/${id}`, { method: "DELETE", credentials: "include" });
      setSavedPlans((cur) => cur.filter((p) => p.id !== id));
      if (savedId === id) setSavedId(null);
    } catch {
      toast({ title: "Delete failed", description: "Try again", variant: "destructive" });
    }
  };

  const handleLoadSaved = (saved: SavedPlan) => {
    setPlan(saved.plan_json);
    setSelection(saved.selection);
    setConfirmed(true);
    setSavedId(saved.id);
  };

  const buildCopyText = (p: DayPlan, sel: number[]) => {
    const SLOT_EMOJIS: Record<string, string> = { Morning: "☀️", Lunch: "🍽️", Afternoon: "🌤️", Dinner: "🍷", Evening: "🌙" };
    const lines = [`📅 My Day in ${p.area_name}`, prettyDate(p.plan_date), ""];
    p.slots.forEach((s, i) => {
      const opt = s.options[sel[i] ?? 0];
      if (!opt) return;
      lines.push(`${SLOT_EMOJIS[s.slot] ?? "📍"} ${s.slot.toUpperCase()} · ${s.time_label}`);
      lines.push(opt.title);
      lines.push(opt.description);
      lines.push(`📍 ${opt.address}`);
      lines.push(`💰 ${money(opt.cost_per_person)}${opt.cost_notes ? ` · ${opt.cost_notes}` : ""}`);
      lines.push("");
    });
    lines.push("Generated by UR🔗Day on urlinc.us");
    return lines.join("\n");
  };

  const handleCopy = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(buildCopyText(plan, selection));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Couldn't copy", description: "Try selecting the text manually", variant: "destructive" });
    }
  };

  const fetchFriends = useCallback(async () => {
    if (friends.length) return;
    setLoadingFriends(true);
    try {
      const res = await fetch("/api/friends", { credentials: "include" });
      if (res.ok) setFriends(await res.json());
    } finally {
      setLoadingFriends(false);
    }
  }, [friends.length]);

  const handleShareTo = async (recipientId: string) => {
    if (!plan || sharingToId) return;
    setSharingToId(recipientId);
    try {
      const res = await fetch("/api/day-plan/share", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId, plan, selection }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Share failed" })) as { error?: string };
        toast({ title: "Couldn't share", description: err.error ?? "Try again", variant: "destructive" });
        return;
      }
      setSharedToIds((cur) => new Set([...cur, recipientId]));
      toast({ title: "Plan shared!", description: "It's now in their URLinc inbox." });
    } catch {
      toast({ title: "Share failed", description: "Check your connection", variant: "destructive" });
    } finally {
      setSharingToId(null);
    }
  };

  const geocode = useCallback(async (query: string) => {
    const res = await fetch("/api/day-plan/geocode", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error("Location not found — try a city name or ZIP code");
    return res.json() as Promise<{ lat: number; lng: number; display_name: string }>;
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) { setLocationError(true); return; }
    setLocationError(false);
    setGenerating(true);
    setConfirmed(false);
    startLoadingCycle();

    try {
      const geo = await geocode(location.trim());

      // Show the resolved location name briefly so the user can spot wrong-country results
      const shortName = geo.display_name.split(",").slice(0, 3).join(",").trim();
      setLoadingMsg(`📍 ${shortName}`);

      const allSeen = Array.from(seenTitles);
      const res = await fetch("/api/day-plan/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: geo.display_name,
          lat: geo.lat,
          lng: geo.lng,
          radiusMiles: radius,
          date,
          vibes,
          budgetLevel: budget,
          avoid: allSeen.slice(0, 40),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" })) as { error?: string };
        throw new Error(err.error || "Generation failed");
      }

      const newPlan = await res.json() as DayPlan;
      setPlan(newPlan);
      setSelection(newPlan.slots.map(() => 0));

      // Remember all titles we've shown
      const newSeen = new Set(seenTitles);
      newPlan.slots.forEach((s) => s.options.forEach((o) => newSeen.add(o.title)));
      setSeenTitles(newSeen);
    } catch (err) {
      toast({ title: "Couldn't build your plan", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      stopLoadingCycle();
      setGenerating(false);
    }
  };

  const handleRefreshSlot = async (slotIndex: number) => {
    if (!plan) return;
    setRefreshingSlot(slotIndex);

    const existingTitles = plan.slots[slotIndex]?.options.map((o) => o.title) ?? [];

    try {
      const res = await fetch("/api/day-plan/regenerate-slot", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, slotIndex, existingTitles }),
      });

      if (!res.ok) throw new Error("Slot refresh failed");
      const { options } = await res.json() as { options: ActivityOption[] };

      const updatedPlan = { ...plan };
      updatedPlan.slots = plan.slots.map((s, i) =>
        i === slotIndex ? { ...s, options } : s
      );
      setPlan(updatedPlan);
      setSelection((cur) => cur.map((v, i) => (i === slotIndex ? 0 : v)));

      // Remember new titles
      const newSeen = new Set(seenTitles);
      options.forEach((o) => newSeen.add(o.title));
      setSeenTitles(newSeen);
    } catch {
      toast({ title: "Couldn't refresh this slot", description: "Try again in a moment", variant: "destructive" });
    } finally {
      setRefreshingSlot(null);
    }
  };

  const handleReset = () => {
    setPlan(null);
    setSelection([]);
    setConfirmed(false);
    setSavedId(null);
    setShowMovieInput(false);
    setMovieTitle("");
    setShowSharePicker(false);
    setSharedToIds(new Set());
  };

  const handleAddMovieNight = () => {
    if (!plan || !movieTitle.trim()) return;
    const eveningIdx = plan.slots.findIndex((s) => s.slot === "Evening");
    if (eveningIdx === -1) return;
    const movieOption: ActivityOption = {
      title: movieTitle.trim(),
      description: `A relaxing movie night at home with ${movieTitle.trim()}. Stream, rent, or buy on Amazon Prime Video — no reservations, no travel, just good cinema.`,
      category: "Movie Night",
      start_time: "20:00",
      end_time: "22:30",
      duration_minutes: 150,
      address: "At home",
      latitude: null,
      longitude: null,
      cost_per_person: 4,
      cost_notes: "Rental ~$4–$6 on Amazon Prime Video",
      attire: "Comfortable",
      why_it_fits: "A perfect low-key way to end the day without leaving home.",
      booking_note: null,
      affiliate_url: amazonMovieUrl(movieTitle.trim()),
    };
    const updatedSlots = plan.slots.map((s, i) =>
      i === eveningIdx ? { ...s, options: [movieOption, ...s.options] } : s
    );
    setPlan({ ...plan, slots: updatedSlots });
    setSelection((cur) => cur.map((v, i) => (i === eveningIdx ? 0 : v)));
    setShowMovieInput(false);
    setMovieTitle("");
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Compass className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">UR🔗Day</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Tell us where and what you're feeling — AI builds you a full day plan.
          </p>
        </div>

        {/* Saved plans — show on form view and confirmed view, not during plan selection */}
        {(!plan || confirmed) && !loadingSaved && savedPlans.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <FolderOpen className="h-3.5 w-3.5" /> Saved plans ({savedPlans.length}/{saveLimit})
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {savedPlans.map((saved) => {
                const total = saved.plan_json.slots.reduce((sum, s, i) => {
                  const opt = s.options[saved.selection[i] ?? 0];
                  return sum + (opt?.cost_per_person ?? 0);
                }, 0);
                return (
                  <div
                    key={saved.id}
                    onClick={() => confirmDeleteId !== saved.id && handleLoadSaved(saved)}
                    title={confirmDeleteId === saved.id ? undefined : "Open this plan"}
                    role="button"
                    className={`rounded-xl border bg-card p-4 transition-all ${
                      confirmDeleteId === saved.id
                        ? "border-destructive/40 cursor-default"
                        : savedId === saved.id
                        ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20 cursor-pointer hover:border-primary/50 hover:bg-accent/30"
                        : "border-border cursor-pointer hover:border-primary/50 hover:bg-accent/30"
                    }`}
                  >
                    {confirmDeleteId === saved.id ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-destructive">Delete "{saved.area_name}"?</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="px-3 py-1 rounded-lg border border-border text-xs font-medium hover:bg-accent/50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSaved(saved.id); setConfirmDeleteId(null); }}
                            className="px-3 py-1 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{saved.area_name}</p>
                          <p className="text-xs text-muted-foreground">{prettyDate(saved.plan_date)} · {money(total)}/person</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(saved.id); }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          title="Delete this plan"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Form */}
        {!plan && (
          <form onSubmit={handleGenerate} className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-5">
            {/* Where + date + radius row */}
            <div className="grid gap-4 md:grid-cols-[1.5fr_1fr_1.1fr]">
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  Where
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={location}
                    onChange={(e) => { setLocation(e.target.value); setLocationError(false); }}
                    placeholder="ZIP code, city or town"
                    className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  />
                </div>
                {locationError && (
                  <p className="text-xs text-destructive mt-1">Enter a ZIP code or city</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 block">
                  Which day
                </label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    How far
                  </label>
                  <span className="text-xs font-semibold">{radius} mi</span>
                </div>
                <div className="h-11 flex items-center rounded-lg border border-input bg-background px-3">
                  <input
                    type="range" min="5" max="60" step="5" value={radius}
                    onChange={(e) => setRadius(Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Vibes */}
            <div className="border-t border-border/60 pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                What sounds good
              </p>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => {
                  const active = vibes.includes(v.id);
                  const scanning = isScanning && scanVibes.has(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggleVibe(v.id)}
                      className={`rounded-full border px-3 py-1.5 text-[13px] transition-all duration-150 ${
                        active
                          ? "border-primary/40 bg-primary/10 text-primary font-medium"
                          : scanning
                          ? "border-primary/30 bg-primary/8 text-primary/70"
                          : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Budget + submit */}
            <div className="border-t border-border/60 pt-4 flex flex-col lg:flex-row gap-4 lg:items-end">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">
                  Budget for the day
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {BUDGETS.map((b) => {
                    const active = budget === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBudget(b.id)}
                        className={`rounded-lg border px-3 py-2.5 text-left transition-all ${
                          active
                            ? "border-primary bg-primary/8 ring-1 ring-primary/20"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <span className="block text-[13px] font-medium leading-tight">{b.label}</span>
                        <span className="block text-[11px] text-muted-foreground mt-0.5">{b.note}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={generating}
                className="h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition shrink-0"
              >
                {generating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {loadingMsg}</>
                ) : (
                  <><Compass className="h-4 w-4" /> Plan my day <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Plan results */}
        {plan && !confirmed && (
          <div className="space-y-6">
            {/* Plan header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{plan.area_name}</h2>
                <p className="text-sm text-muted-foreground">{prettyDate(plan.plan_date)} · {plan.radius_miles} mi radius</p>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
                New plan
              </button>
            </div>

            {/* Area overview map */}
            <div className="rounded-xl overflow-hidden border border-border h-48">
              <iframe
                title="Plan area map"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${plan.longitude - 0.15},${plan.latitude - 0.1},${plan.longitude + 0.15},${plan.latitude + 0.1}&layer=mapnik`}
                className="w-full h-full"
                loading="lazy"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_260px] lg:items-start">
              {/* Schedule */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">The schedule</p>
                {plan.slots.map((slot, i) => (
                  <SlotRow
                    key={slot.slot}
                    slot={slot}
                    selectedIdx={selection[i] ?? 0}
                    onSwap={(idx) => setSelection((cur) => cur.map((v, j) => j === i ? idx : v))}
                    onRefresh={() => handleRefreshSlot(i)}
                    refreshing={refreshingSlot === i}
                  />
                ))}

                {/* Movie night add-on */}
                <div className="mb-4 rounded-xl border border-purple-500/25 bg-purple-500/5 p-4">
                  <button
                    type="button"
                    onClick={() => setShowMovieInput((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-purple-300 hover:text-purple-200 transition-colors w-full text-left"
                  >
                    <Film className="h-4 w-4 shrink-0" />
                    🎬 Swap Evening for a movie night at home?
                  </button>
                  {showMovieInput && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={movieTitle}
                        onChange={(e) => setMovieTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddMovieNight(); } }}
                        placeholder="Movie title…"
                        className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleAddMovieNight}
                        disabled={!movieTitle.trim()}
                        className="h-9 rounded-lg bg-purple-600 px-3 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-40 transition"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>

                {/* Lock in button */}
                <button
                  onClick={() => { setConfirmed(true); handleSave(); }}
                  className="mt-2 w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition"
                >
                  <Lock className="h-4 w-4" />
                  This is my plan — lock it in!
                </button>
              </div>

              {/* Budget sidebar */}
              <div className="lg:sticky lg:top-20">
                <BudgetPanel plan={plan} selection={selection} />
              </div>
            </div>
          </div>
        )}

        {/* Confirmed plan view */}
        {plan && confirmed && (() => {
          const SLOT_EMOJIS: Record<string, string> = { Morning: "☀️", Lunch: "🍽️", Afternoon: "🌤️", Dinner: "🍷", Evening: "🌙" };
          const selectedStops = plan.slots.map((s, i) => ({ slot: s, option: s.options[selection[i] ?? 0] }));
          const total = selectedStops.reduce((sum, { option: o }) => sum + (o?.cost_per_person ?? 0), 0);

          return (
            <div className="space-y-6">
              {/* Confirmed header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="text-xl font-bold">Your day is set!</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.area_name} · {prettyDate(plan.plan_date)}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <RotateCcw className="h-4 w-4" />
                  New plan
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3 items-start">
                {!savedId ? (
                  <button
                    onClick={handleSave}
                    disabled={saving || savedPlans.length >= saveLimit}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition"
                    title={savedPlans.length >= saveLimit ? `Limit of ${saveLimit} plans reached — delete one first` : "Save this plan"}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                    {saving ? "Saving…" : savedPlans.length >= saveLimit ? `Limit reached (${saveLimit})` : "Save this plan"}
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400">
                    <Bookmark className="h-4 w-4" /> Saved!
                  </div>
                )}
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent/50 transition"
                >
                  {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied!" : "Copy plan"}
                </button>
                <button
                  onClick={() => setConfirmed(false)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent/50 transition"
                >
                  <RefreshCw className="h-4 w-4" />
                  Edit plan
                </button>
                <div className="relative">
                  <button
                    onClick={() => { setShowSharePicker((v) => !v); fetchFriends(); }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent/50 transition"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                  {showSharePicker && (
                    <div className="absolute left-0 top-full mt-2 z-20 w-64 rounded-xl border border-border bg-card shadow-xl">
                      <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-border">
                        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" /> Share with a friend
                        </span>
                        <button onClick={() => setShowSharePicker(false)} className="text-muted-foreground hover:text-foreground">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="p-2 max-h-56 overflow-y-auto">
                        {loadingFriends ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : friends.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No URLinc friends yet</p>
                        ) : (
                          friends.map((f) => {
                            const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || f.email;
                            const sent = sharedToIds.has(f.id);
                            return (
                              <button
                                key={f.id}
                                onClick={() => handleShareTo(f.id)}
                                disabled={!!sharingToId || sent}
                                className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent/50 disabled:opacity-60 transition-colors text-left"
                              >
                                <span className="truncate">{name}</span>
                                {sharingToId === f.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-muted-foreground" />
                                ) : sent ? (
                                  <Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
                                ) : (
                                  <Share2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Live webcams button */}
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(plan.area_name + " live webcam")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-400 hover:bg-sky-500/20 transition"
                  title={`Search YouTube live webcams for ${plan.area_name}`}
                >
                  <Video className="h-4 w-4" />
                  Live cams
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </div>

              {/* Confirmed stop list */}
              <div className="space-y-4">
                {selectedStops.map(({ slot: s, option: opt }) => {
                  if (!opt) return null;
                  const colors = SLOT_COLORS[s.slot] ?? SLOT_COLORS["Morning"];
                  return (
                    <div key={s.slot} className={`rounded-xl border ${colors.border} bg-card p-4 md:p-5`}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{SLOT_EMOJIS[s.slot] ?? "📍"}</span>
                        <span className={`text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${colors.pill}`}>
                          {s.slot}
                        </span>
                        <span className="text-xs text-muted-foreground">{s.time_label}</span>
                      </div>
                      <h3 className="font-semibold text-base mb-1">{opt.title}</h3>
                      <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{opt.description}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground mb-3">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{opt.address}</span>
                        <span className="flex items-center gap-1"><Wallet className="h-3 w-3" />{money(opt.cost_per_person)}{opt.cost_notes ? ` · ${opt.cost_notes}` : ""}</span>
                        <span className="flex items-center gap-1"><Shirt className="h-3 w-3" />{opt.attire}</span>
                      </div>
                      {opt.booking_note && (
                        <div className="flex items-start gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-[12px] text-secondary-foreground mb-3">
                          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-60" />
                          <span>{opt.booking_note}</span>
                        </div>
                      )}
                      {opt.affiliate_url ? (
                        <a
                          href={opt.affiliate_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-amber-400 hover:underline underline-offset-2"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          Rent or Buy on Amazon
                        </a>
                      ) : (
                        <a
                          href={mapsUrl(opt.title, opt.address)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary hover:underline underline-offset-2"
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Directions &amp; map
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between text-sm font-semibold">
                <span>Total for the day</span>
                <span className="text-primary tabular-nums text-base">{money(total)} / person</span>
              </div>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
