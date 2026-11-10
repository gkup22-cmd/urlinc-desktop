import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Camera, Plus, Trash2, Clock, CheckCircle2, Upload, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/upload";

type CaptionDuel = {
  id: number;
  opponentEmail: string;
  photoUrl: string;
  caption: string | null;
  status: "pending" | "captioned" | "completed";
};

export function CaptionDuelsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [opponentEmail, setOpponentEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const { data } = useQuery<{ items: CaptionDuel[] }>({
    queryKey: ["caption-duels"],
    queryFn: async () => {
      const res = await fetch("/api/caption-duels", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load duels");
      return res.json();
    },
  });

  const duels = data?.items ?? [];

  const reset = () => {
    setOpponentEmail("");
    setFile(null);
    setPreview(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const canSave = !!file && !!opponentEmail.trim();

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const photoUrl = await uploadFile(file);
      const res = await fetch("/api/caption-duels", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opponentEmail: opponentEmail.trim(), photoUrl }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: ["caption-duels"] });
      toast({ title: "Duel sent!" });
      setOpen(false);
      reset();
    } catch (err) {
      toast({ title: "Couldn't send that duel", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Delete this? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/caption-duels/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: ["caption-duels"] });
      toast({ title: "Duel removed" });
    } catch (err) {
      toast({ title: "Couldn't remove", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-8 w-full pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Camera className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
          Caption Duel
        </h2>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Start a Duel
        </Button>
      </div>

      {duels.length === 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border border-dashed border-border bg-card/30 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <Camera className="w-8 h-8 opacity-30" />
          <p className="text-sm">Send a photo to a friend — first one to caption it wins.</p>
        </button>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {duels.map((d) => (
            <div key={d.id} className="relative group">
              <Link
                href={`/caption-duel/${d.id}`}
                className="block rounded-xl border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors"
              >
                <div className="aspect-video overflow-hidden bg-muted/40">
                  <img src={d.photoUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-xs text-muted-foreground truncate">{d.opponentEmail}</p>
                  {d.status === "completed" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-green-400">
                      <CheckCircle2 className="w-3 h-3" /> Completed
                    </span>
                  ) : d.status === "captioned" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-blue-400">
                      <Star className="w-3 h-3" /> Rate it!
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400">
                      <Clock className="w-3 h-3" /> Waiting
                    </span>
                  )}
                </div>
              </Link>
              <button
                onClick={() => void remove(d.id)}
                title="Remove duel"
                className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a Caption Duel</DialogTitle>
            <DialogDescription>
              Pick a photo and challenge a friend to caption it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Photo</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="preview" className="w-full h-48 rounded-lg object-cover" />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white text-sm"
                  >
                    Change photo
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-36 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                >
                  <Upload className="w-6 h-6 opacity-40" />
                  <span className="text-sm">Click to choose a photo</span>
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Challenge</Label>
              {friends.length > 0 ? (
                <Select value={opponentEmail} onValueChange={setOpponentEmail}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a friend…" />
                  </SelectTrigger>
                  <SelectContent>
                    {friends.map((f) => (
                      <SelectItem key={f.id} value={f.email}>
                        {f.firstName || f.lastName ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim() : f.email}
                        {(f.firstName || f.lastName) && (
                          <span className="ml-1 text-muted-foreground text-xs">({f.email})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="email"
                  value={opponentEmail}
                  onChange={(e) => setOpponentEmail(e.target.value)}
                  placeholder="friend@example.com"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!canSave || saving} onClick={() => void save()}>
              {saving ? "Sending…" : "Send Challenge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
