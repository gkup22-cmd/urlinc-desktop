import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type CaptionDuel = {
  id: number;
  opponentEmail: string;
  photoUrl: string;
  caption: string | null;
  rating: number | null;
  counterCaption: string | null;
  counterRating: number | null;
  // "pending"   — opponent hasn't captioned yet
  // "captioned" — opponent captioned, creator needs to rate
  // "completed" — creator has rated (and optionally replied)
  status: "pending" | "captioned" | "completed";
  isOpponent: boolean;
};

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 focus:outline-none"
          aria-label={`${n} star${n !== 1 ? "s" : ""}`}
        >
          <Star
            className={`w-7 h-7 transition-colors ${
              n <= (hover || value)
                ? "fill-yellow-400 text-yellow-400"
                : "fill-transparent text-white/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-5 h-5 ${n <= value ? "fill-yellow-400 text-yellow-400" : "fill-transparent text-white/20"}`}
        />
      ))}
    </div>
  );
}

export default function CaptionDuelPlay() {
  const [, params] = useRoute("/caption-duel/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = params?.id;

  const { data: duel, isLoading } = useQuery<CaptionDuel>({
    queryKey: ["caption-duel", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/caption-duels/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load that duel");
      return res.json();
    },
  });

  // Opponent: submit their caption
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);

  const submitCaption = async () => {
    if (!caption.trim() || !duel) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/caption-duels/${duel.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: caption.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Submit failed");
      await queryClient.invalidateQueries({ queryKey: ["caption-duel", id] });
      await queryClient.invalidateQueries({ queryKey: ["caption-duels"] });
      toast({ title: "Caption submitted! Waiting for their verdict…" });
    } catch (err) {
      toast({ title: "Couldn't submit", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Creator: rate + optional counter-caption
  const [starRating, setStarRating] = useState(0);
  const [counterCaption, setCounterCaption] = useState("");
  const [rating, setRatingSubmitting] = useState(false);

  // Opponent: rate creator's counter-caption
  const [counterStarRating, setCounterStarRating] = useState(0);
  const [counterRatingSubmitting, setCounterRatingSubmitting] = useState(false);

  const submitRating = async () => {
    if (!starRating || !duel) return;
    setRatingSubmitting(true);
    try {
      const body: { rating: number; counterCaption?: string } = { rating: starRating };
      if (counterCaption.trim()) body.counterCaption = counterCaption.trim();
      const res = await fetch(`/api/caption-duels/${duel.id}/rate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Rate failed");
      await queryClient.invalidateQueries({ queryKey: ["caption-duel", id] });
      await queryClient.invalidateQueries({ queryKey: ["caption-duels"] });
      toast({ title: "Verdict sent!" });
    } catch (err) {
      toast({ title: "Couldn't submit", description: (err as Error).message, variant: "destructive" });
    } finally {
      setRatingSubmitting(false);
    }
  };

  const submitCounterRating = async () => {
    if (!counterStarRating || !duel) return;
    setCounterRatingSubmitting(true);
    try {
      const res = await fetch(`/api/caption-duels/${duel.id}/rate-counter`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: counterStarRating }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Rate failed");
      await queryClient.invalidateQueries({ queryKey: ["caption-duel", id] });
      await queryClient.invalidateQueries({ queryKey: ["caption-duels"] });
      toast({ title: "Rating sent!" });
    } catch (err) {
      toast({ title: "Couldn't submit", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCounterRatingSubmitting(false);
    }
  };

  const back = () => setLocation("/games-vault");

  if (isLoading || !duel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">
        Loading…
      </div>
    );
  }

  const statusBadge = duel.status === "completed" ? (
    <span className="flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs text-green-400">
      <CheckCircle2 className="h-3 w-3" /> Completed
    </span>
  ) : duel.status === "captioned" ? (
    <span className="flex items-center gap-1 rounded-full bg-blue-900/40 px-2 py-0.5 text-xs text-blue-400">
      <Star className="h-3 w-3" /> {duel.isOpponent ? "Awaiting verdict" : "Rate it!"}
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-400">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-3">
        <button onClick={back} className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to Games
        </button>
      </div>

      <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10 space-y-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-white">Caption Duel</h1>
          {statusBadge}
        </div>

        <div className="w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
          <img src={duel.photoUrl} alt="" className="w-full object-contain max-h-[60vh]" />
        </div>

        {/* ── PENDING: opponent captions ── */}
        {duel.status === "pending" && duel.isOpponent && (
          <div className="space-y-3">
            <label className="block text-sm text-white/60">Your caption</label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              placeholder="Write something funny…"
              className="bg-[#1E293B] border-white/10 text-white placeholder:text-white/30 focus:border-[#3B82F6] resize-none"
            />
            <Button
              onClick={() => void submitCaption()}
              disabled={!caption.trim() || saving}
              className="w-full bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90"
            >
              {saving ? "Sending…" : "Submit Caption"}
            </Button>
          </div>
        )}

        {duel.status === "pending" && !duel.isOpponent && (
          <p className="text-center text-white/40 py-4">
            Waiting for {duel.opponentEmail} to caption this photo.
          </p>
        )}

        {/* ── CAPTIONED: creator rates ── */}
        {duel.status === "captioned" && !duel.isOpponent && (
          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
              <p className="text-xs text-white/40 mb-2">Their caption</p>
              <p className="text-lg text-white">"{duel.caption}"</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-white/60">Rate it</p>
              <StarPicker value={starRating} onChange={setStarRating} />
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-white/60">
                Your counter-caption <span className="text-white/30">(optional)</span>
              </label>
              <Textarea
                value={counterCaption}
                onChange={(e) => setCounterCaption(e.target.value)}
                rows={3}
                placeholder="Think you can do better? Prove it…"
                className="bg-[#1E293B] border-white/10 text-white placeholder:text-white/30 focus:border-[#3B82F6] resize-none"
              />
            </div>

            <Button
              onClick={() => void submitRating()}
              disabled={!starRating || rating}
              className="w-full bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90"
            >
              {rating ? "Sending…" : "Send Verdict"}
            </Button>
          </div>
        )}

        {duel.status === "captioned" && duel.isOpponent && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#1E293B] p-5">
              <p className="text-xs text-white/40 mb-2">Your caption</p>
              <p className="text-lg text-white">"{duel.caption}"</p>
            </div>
            <p className="text-center text-white/40 py-2">
              Waiting for their verdict…
            </p>
          </div>
        )}

        {/* ── COMPLETED: full exchange ── */}
        {duel.status === "completed" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-[#1E293B] p-5 space-y-3">
              <div>
                <p className="text-xs text-white/40 mb-1">
                  {duel.isOpponent ? "Your caption" : "Their caption"}
                </p>
                <p className="text-lg text-white">"{duel.caption}"</p>
              </div>
              {duel.rating !== null && (
                <div>
                  <p className="text-xs text-white/40 mb-1">
                    {duel.isOpponent ? "Their rating" : "Your rating"}
                  </p>
                  <StarDisplay value={duel.rating} />
                </div>
              )}
            </div>

            {duel.counterCaption && (
              <div className="rounded-xl border border-white/10 bg-[#0F1C2E] p-5 space-y-3">
                <div>
                  <p className="text-xs text-white/40 mb-2">
                    {duel.isOpponent ? "Their counter-caption" : "Your counter-caption"}
                  </p>
                  <p className="text-lg text-white">"{duel.counterCaption}"</p>
                </div>

                {/* Opponent rates the counter-caption */}
                {duel.isOpponent && duel.counterRating === null && (
                  <div className="space-y-2 pt-1 border-t border-white/10">
                    <p className="text-sm text-white/60">Rate their reply</p>
                    <StarPicker value={counterStarRating} onChange={setCounterStarRating} />
                    <Button
                      onClick={() => void submitCounterRating()}
                      disabled={!counterStarRating || counterRatingSubmitting}
                      className="w-full bg-[#3B82F6] text-white hover:bg-[#3B82F6]/90"
                    >
                      {counterRatingSubmitting ? "Sending…" : "Send Rating"}
                    </Button>
                  </div>
                )}

                {duel.counterRating !== null && (
                  <div className="pt-1 border-t border-white/10">
                    <p className="text-xs text-white/40 mb-1">
                      {duel.isOpponent ? "Your rating of their reply" : "Their rating of your reply"}
                    </p>
                    <StarDisplay value={duel.counterRating} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
