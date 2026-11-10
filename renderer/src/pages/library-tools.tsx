import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Copy,
  Link2Off,
  ImageOff,
  BarChart2,
  ArrowRight,
  ChevronRight,
  Archive,
  Download,
  Trash2,
  ChevronDown,
  TriangleAlert,
} from "lucide-react";

const FREE_LIMITS = { videos: 15_000, photos: 500, audio: 1_000 } as const;

function MiniUsageBar({ count, limit }: { count: number; limit: number }) {
  const pct = Math.min(count / limit, 1);
  const warn = pct >= 0.8;
  const full = pct >= 1;
  return (
    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          full ? "bg-destructive" : warn ? "bg-amber-500" : "bg-primary"
        }`}
        style={{ width: `${Math.round(pct * 100)}%` }}
      />
    </div>
  );
}

const TOOLS = [
  {
    href: "/duplicates",
    icon: Copy,
    title: "Find duplicates",
    description:
      "Scans for identical URLs and similar-titled videos. Keeps the original and flags copies so you can review before deleting.",
    color: "text-primary bg-primary/10",
  },
  {
    href: "/broken-links",
    icon: Link2Off,
    title: "Broken video links",
    description:
      "Checks every video URL in your library and surfaces the ones that no longer load, so you can update or remove them.",
    color: "text-orange-500 bg-orange-500/10",
  },
  {
    href: "/broken-photos",
    icon: ImageOff,
    title: "Broken photo links",
    description:
      "Same as above for your photo library — finds images that have gone missing or moved since you added them.",
    color: "text-rose-500 bg-rose-500/10",
  },
] as const;

interface CategoryRow { name: string; count: number }

type ArchiveMode = "category" | "date-range";

function ArchiveSteps({
  count,
  exported,
  isDeleting,
  confirmLabel,
  onExport,
  onRemove,
  onConfirmOpen,
  showConfirm,
  setShowConfirm,
  confirmBody,
}: {
  count: number;
  exported: boolean;
  isDeleting: boolean;
  confirmLabel: string;
  onExport: () => void;
  onRemove: () => void;
  onConfirmOpen: () => void;
  showConfirm: boolean;
  setShowConfirm: (v: boolean) => void;
  confirmBody: string;
}) {
  return (
    <div className="space-y-3 mt-4">
      <div className={`flex items-start gap-3 p-4 rounded-xl border ${exported ? "border-green-500/30 bg-green-500/5" : "border-border bg-muted/30"}`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${exported ? "bg-green-500 text-white" : "bg-primary text-primary-foreground"}`}>
          {exported ? "✓" : "1"}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium mb-1">Export to file</p>
          <p className="text-xs text-muted-foreground mb-3">
            Downloads a JSON file to your device. Keep it — you can re-import it later.
          </p>
          <Button size="sm" variant={exported ? "outline" : "default"} onClick={onExport}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {exported ? "Download again" : `Export ${count.toLocaleString()} videos`}
          </Button>
        </div>
      </div>

      <div className={`flex items-start gap-3 p-4 rounded-xl border ${exported ? "border-border" : "border-border/40 opacity-50"}`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${exported ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
          2
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium mb-1">Remove from library</p>
          <p className="text-xs text-muted-foreground mb-3">
            Soft-deletes all {count.toLocaleString()} videos. They go to Trash (recoverable for 30 days).
          </p>
          <Button size="sm" variant="destructive" disabled={!exported} onClick={onConfirmOpen}>
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Remove {count.toLocaleString()} videos
          </Button>
        </div>
      </div>

      {!exported && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          Export your file first — step 2 unlocks after download.
        </p>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogTitle>{confirmLabel}</AlertDialogTitle>
          <AlertDialogDescription>{confirmBody}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onRemove}
              disabled={isDeleting}
            >
              {isDeleting ? "Removing…" : `Remove ${count.toLocaleString()} videos`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ArchiveSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ArchiveMode>("category");

  // Category mode state
  const [selected, setSelected] = useState("");
  const [catExported, setCatExported] = useState(false);
  const [catConfirm, setCatConfirm] = useState(false);
  const [catDeleting, setCatDeleting] = useState(false);

  // Date range mode state
  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(oneYearAgo);
  const [toDate, setToDate] = useState(today);
  const [rangeExported, setRangeExported] = useState(false);
  const [rangeConfirm, setRangeConfirm] = useState(false);
  const [rangeDeleting, setRangeDeleting] = useState(false);

  const { data: categories = [] } = useQuery<CategoryRow[]>({
    queryKey: ["categories"],
    queryFn: async () => {
      const r = await fetch("/api/categories", { credentials: "include" });
      return r.json() as Promise<CategoryRow[]>;
    },
    enabled: open,
  });

  const rangeValid = fromDate && toDate && fromDate <= toDate;

  const { data: rangeCountData } = useQuery<{ total: number }>({
    queryKey: ["range-count", fromDate, toDate],
    queryFn: async () => {
      const r = await fetch(
        `/api/videos/count-date-range?from=${fromDate}&to=${toDate}`,
        { credentials: "include" },
      );
      return r.json() as Promise<{ total: number }>;
    },
    enabled: open && mode === "date-range" && !!rangeValid,
  });
  const rangeCount = rangeCountData?.total ?? 0;

  const selectedCat = categories.find((c) => c.name === selected);
  const catCount = selectedCat?.count ?? 0;

  // Category handlers
  const handleCatExport = () => {
    const a = document.createElement("a");
    a.href = `/api/backup/export-category?category=${encodeURIComponent(selected)}`;
    a.click();
    setCatExported(true);
    toast({ title: `Downloading ${catCount.toLocaleString()} videos from "${selected}"` });
  };
  const handleCatRemove = async () => {
    setCatDeleting(true);
    try {
      const r = await fetch("/api/videos/bulk-delete", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectAll: true, filter: { category: selected } }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json() as { affected: number };
      void queryClient.invalidateQueries({ queryKey: ["lib-usage-videos"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast({ title: `Removed ${data.affected.toLocaleString()} videos from "${selected}"` });
      setSelected(""); setCatExported(false); setCatConfirm(false);
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    } finally { setCatDeleting(false); }
  };

  // Date range handlers
  const handleRangeExport = () => {
    const a = document.createElement("a");
    a.href = `/api/backup/export-date-range?from=${fromDate}&to=${toDate}`;
    a.click();
    setRangeExported(true);
    toast({ title: `Downloading ${rangeCount.toLocaleString()} videos (${fromDate} → ${toDate})` });
  };
  const handleRangeRemove = async () => {
    setRangeDeleting(true);
    try {
      const r = await fetch("/api/videos/bulk-delete-date-range", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json() as { affected: number };
      void queryClient.invalidateQueries({ queryKey: ["lib-usage-videos"] });
      void queryClient.invalidateQueries({ queryKey: ["range-count", fromDate, toDate] });
      toast({ title: `Removed ${data.affected.toLocaleString()} videos from ${fromDate} → ${toDate}` });
      setRangeExported(false); setRangeConfirm(false);
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    } finally { setRangeDeleting(false); }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/20 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Archive className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-sm">Archive videos</p>
            <p className="text-xs text-muted-foreground">
              Export by category or date range, then remove from library
            </p>
          </div>
        </div>
        <ChevronRight
          className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border">
          {/* Mode tabs */}
          <div className="flex gap-1 mt-4 mb-4 p-1 bg-muted rounded-lg">
            {(["category", "date-range"] as ArchiveMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === m
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "category" ? "By category" : "By date range"}
              </button>
            ))}
          </div>

          {mode === "category" && (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Pick a category to archive. The exported JSON can be re-imported any time — duplicates are always skipped.
              </p>
              <div className="relative mb-2">
                <select
                  value={selected}
                  onChange={(e) => { setSelected(e.target.value); setCatExported(false); }}
                  className="w-full appearance-none bg-background border border-border rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select a category…</option>
                  {categories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.count.toLocaleString()} videos)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
              {selected && (
                <ArchiveSteps
                  count={catCount}
                  exported={catExported}
                  isDeleting={catDeleting}
                  confirmLabel={`Remove "${selected}"?`}
                  confirmBody={`This will move all ${catCount.toLocaleString()} videos in "${selected}" to Trash. Recoverable for 30 days. Your exported file is unaffected.`}
                  onExport={handleCatExport}
                  onRemove={handleCatRemove}
                  onConfirmOpen={() => setCatConfirm(true)}
                  showConfirm={catConfirm}
                  setShowConfirm={setCatConfirm}
                />
              )}
            </>
          )}

          {mode === "date-range" && (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                Export all videos added between two dates. Useful for clearing out a year or season of content.
              </p>
              <div className="flex gap-3 mb-1">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">From</label>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate}
                    onChange={(e) => { setFromDate(e.target.value); setRangeExported(false); }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground block mb-1">To</label>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    max={today}
                    onChange={(e) => { setToDate(e.target.value); setRangeExported(false); }}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              {rangeValid && rangeCountData && (
                <p className="text-xs text-muted-foreground mb-1">
                  <span className="font-semibold text-foreground">{rangeCount.toLocaleString()} videos</span> added between {fromDate} and {toDate}
                </p>
              )}
              {rangeValid && rangeCount > 0 && (
                <ArchiveSteps
                  count={rangeCount}
                  exported={rangeExported}
                  isDeleting={rangeDeleting}
                  confirmLabel={`Remove videos from ${fromDate} → ${toDate}?`}
                  confirmBody={`This will move ${rangeCount.toLocaleString()} videos to Trash. Recoverable for 30 days. Your exported file is unaffected.`}
                  onExport={handleRangeExport}
                  onRemove={handleRangeRemove}
                  onConfirmOpen={() => setRangeConfirm(true)}
                  showConfirm={rangeConfirm}
                  setShowConfirm={setRangeConfirm}
                />
              )}
              {rangeValid && rangeCountData && rangeCount === 0 && (
                <p className="text-xs text-muted-foreground mt-2">No videos found in that date range.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function LibraryTools() {
  const [, setLocation] = useLocation();
  const [usageOpen, setUsageOpen] = useState(false);

  const { data: videoData } = useQuery<{ total: number }>({
    queryKey: ["lib-usage-videos"],
    queryFn: async () => {
      const r = await fetch("/api/videos/count", { credentials: "include" });
      return r.json() as Promise<{ total: number }>;
    },
    enabled: usageOpen,
  });
  const { data: photoData } = useQuery<{ total: number }>({
    queryKey: ["lib-usage-photos"],
    queryFn: async () => {
      const r = await fetch("/api/photos/count", { credentials: "include" });
      return r.json() as Promise<{ total: number }>;
    },
    enabled: usageOpen,
  });
  const { data: audioData } = useQuery<{ total: number }>({
    queryKey: ["lib-usage-audio"],
    queryFn: async () => {
      const r = await fetch("/api/music/count", { credentials: "include" });
      return r.json() as Promise<{ total: number }>;
    },
    enabled: usageOpen,
  });

  const videos = videoData?.total ?? 0;
  const photos = photoData?.total ?? 0;
  const audio = audioData?.total ?? 0;

  const anyWarn =
    usageOpen &&
    (videos / FREE_LIMITS.videos >= 0.8 ||
      photos / FREE_LIMITS.photos >= 0.8 ||
      audio / FREE_LIMITS.audio >= 0.8);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-primary" />
            Library tools
          </h1>
          <p className="text-muted-foreground mt-2">
            Keep your library healthy — find duplicates, fix broken links, archive old content, and track storage usage.
          </p>
        </div>

        {/* Tool cards */}
        <div className="flex flex-col gap-3 mb-3">
          {TOOLS.map(({ href, icon: Icon, title, description, color }) => (
            <button
              key={href}
              onClick={() => setLocation(href)}
              className="flex items-center gap-4 p-5 bg-card border border-border rounded-xl hover:border-primary/40 hover:bg-accent/20 transition-all text-left group"
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {description}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
            </button>
          ))}
        </div>

        {/* Archive section */}
        <div className="mb-3">
          <ArchiveSection />
        </div>

        {/* Library Usage collapsible */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/20 transition-colors"
            onClick={() => setUsageOpen((o) => !o)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BarChart2 className="w-5 h-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-sm">Library usage</p>
                <p className="text-xs text-muted-foreground">
                  Free-plan limits for videos, photos, and audio
                </p>
              </div>
              {anyWarn && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Nearing limit
                </span>
              )}
            </div>
            <ChevronRight
              className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${
                usageOpen ? "rotate-90" : ""
              }`}
            />
          </button>

          {usageOpen && (
            <div className="px-5 pb-5 pt-1 border-t border-border space-y-4">
              {(
                [
                  { label: "Videos", count: videos, limit: FREE_LIMITS.videos },
                  { label: "Photos", count: photos, limit: FREE_LIMITS.photos },
                  { label: "Audio", count: audio, limit: FREE_LIMITS.audio },
                ] as const
              ).map(({ label, count, limit }) => {
                const pct = Math.round((count / limit) * 100);
                const warn = pct >= 80;
                const full = pct >= 100;
                return (
                  <div key={label}>
                    <div className="flex justify-between items-baseline mb-1.5">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {count.toLocaleString()} / {limit.toLocaleString()}
                      </span>
                    </div>
                    <MiniUsageBar count={count} limit={limit} />
                    {(warn || full) && (
                      <p
                        className={`text-xs mt-1 ${
                          full ? "text-destructive" : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {full
                          ? "Limit reached — export content to make room"
                          : `${pct}% used — approaching your free plan limit`}
                      </p>
                    )}
                  </div>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setLocation("/settings#library-usage")}
              >
                <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                Manage in Settings
              </Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
