import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminListUsers,
  useAdminDeleteUser,
  useAdminUpdateUserRole,
  useSendMessage,
  getAdminListUsersQueryKey,
  getGetInboxQueryKey,
} from "@workspace/api-client-react";
import type { AdminUserRole } from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  Loader2, Trash2, ShieldCheck, User, AlertTriangle,
  ChevronDown, ChevronUp, Mail, Send, X, Plus, Check, Search, Pencil, Lock, Shield,
  SlidersHorizontal, ShieldAlert, Download, Paperclip, Activity, RefreshCw, Archive,
  Upload, Link2, HelpCircle, Image as ImageIcon, Eye, EyeOff,
  Star, ExternalLink, Trophy,
} from "lucide-react";
import { uploadFile, compressAndUploadPhoto } from "@/lib/upload";
import { useTabHeaders, TAB_HEADERS, TAB_HEADERS_QUERY_KEY, type TabHeaderKey } from "@/hooks/use-tab-headers";
import { loadImageFromFile, encodeBannerSource } from "@/lib/crop-header";

// ── Types & constants ──────────────────────────────────────────────────────

type Role = AdminUserRole;
type Rank = {
  id: number;
  name: string;
  label: string;
  isBuiltin: boolean;
  isAdminRank: boolean;
  isConfigurable?: boolean | null;
  permissions?: Record<string, boolean> | null;
};
type UserInfo = { id: string; email: string | null; firstName: string | null; lastName: string | null; role: string };

// Builtin ranks that always have configurable permissions regardless of DB value.
const BUILTIN_CONFIGURABLE = new Set(["admin_l1", "admin_l2"]);

const PERMISSION_DEFS = [
  { key: "view_users",     label: "View Users",        description: "Browse the user list and see profile details" },
  { key: "delete_users",   label: "Delete Users",      description: "Permanently remove user accounts and all their data" },
  { key: "change_ranks",   label: "Change User Ranks", description: "Assign or change the rank of any user" },
  { key: "send_messages",  label: "Send Messages",     description: "Broadcast messages to users, ranks, or everyone" },
  { key: "manage_content", label: "Manage Content",    description: "Review and remove user-uploaded content (coming soon)" },
  { key: "manage_help",    label: "Manage Help Articles", description: "Add, edit, and remove Help page content" },
  { key: "manage_headers", label: "Manage Tab Headers",   description: "Upload and position the banner artwork on each tab" },
] as const;

type PermKey = typeof PERMISSION_DEFS[number]["key"];

function getPermissions(userRole: string | undefined, ranks: Rank[]): Record<PermKey, boolean> {
  const deny = Object.fromEntries(PERMISSION_DEFS.map((p) => [p.key, false])) as Record<PermKey, boolean>;
  if (!userRole) return deny;
  if (userRole === "admin_exec") return Object.fromEntries(PERMISSION_DEFS.map((p) => [p.key, true])) as Record<PermKey, boolean>;
  const rank = ranks.find((r) => r.name === userRole);
  const stored = (rank?.permissions ?? {}) as Record<string, boolean>;
  return Object.fromEntries(PERMISSION_DEFS.map((p) => [p.key, stored[p.key] === true])) as Record<PermKey, boolean>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function ranksQueryKey() { return ["admin", "ranks"]; }

function findLabel(ranks: Rank[], role: string): string {
  return ranks.find((r) => r.name === role)?.label ?? role;
}

function useRanks() {
  return useQuery<Rank[]>({
    queryKey: ranksQueryKey(),
    queryFn: async () => {
      const res = await fetch("/api/admin/ranks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ranks");
      const data = await res.json() as { ranks: Rank[] };
      return data.ranks;
    },
    staleTime: 60_000,
  });
}

function userName(u: UserInfo): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
}

// ── RoleDropdown ───────────────────────────────────────────────────────────

function RoleDropdown({
  userId, current, isMe, canEdit, ranks,
}: {
  userId: string; current: string; isMe: boolean; canEdit: boolean; ranks: Rank[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const updateRole = useAdminUpdateUserRole({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        setOpen(false);
      },
      onError: (err) => {
        toast({ title: "Error", description: (err as Error).message ?? "Failed to update role.", variant: "destructive" });
        setOpen(false);
      },
    },
  });

  const isPending = updateRole.isPending && updateRole.variables?.userId === userId;

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  };

  if (!canEdit || isMe) {
    return <span className="inline-flex items-center text-sm text-muted-foreground">{findLabel(ranks, current)}</span>;
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={handleOpen}
        disabled={isPending}
        className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded border border-border bg-background hover:bg-accent transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : findLabel(ranks, current)}
        <ChevronDown className="w-3 h-3 text-muted-foreground" />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[180px] overflow-y-auto py-1"
            style={{ top: dropdownPos.top, right: dropdownPos.right, maxHeight: "260px" }}
          >
            {ranks.map((rank) => (
              <button
                key={rank.name}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${rank.name === current ? "font-medium" : ""}`}
                onClick={() => updateRole.mutate({ userId, data: { role: rank.name as Role } })}
              >
                {rank.label}
                {rank.name === current && <Check className="w-3 h-3 text-muted-foreground ml-auto" />}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ── RankPicker ─────────────────────────────────────────────────────────────

function RankPicker({ ranks, value, onChange }: { ranks: Rank[]; value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value ? findLabel(ranks, value) : "");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = ranks.filter((r) => {
    const q = query.toLowerCase();
    return r.label.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  });

  useEffect(() => { if (!value) setQuery(""); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative max-w-xs">
      <div className="relative">
        <input
          className="w-full text-sm bg-background border border-border rounded px-3 py-2 pr-8 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Type to filter ranks…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        />
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-popover border border-border rounded-lg shadow-lg" style={{ overflow: "clip" }}>
          <div className="max-h-40 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">No ranks match</p>}
            {filtered.map((rank) => (
              <button
                key={rank.name}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors ${rank.name === value ? "font-medium" : ""}`}
                onClick={() => { onChange(rank.name); setQuery(rank.label); setOpen(false); }}
              >
                {rank.label}
                {rank.name === value && <Check className="w-3 h-3 text-muted-foreground ml-auto" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── UserMultiPicker ────────────────────────────────────────────────────────

function UserMultiPicker({
  users, selected, onChange, ranks,
}: {
  users: UserInfo[]; selected: Set<string>; onChange: (v: Set<string>) => void; ranks: Rank[];
}) {
  const [filter, setFilter] = useState("");

  const filtered = users.filter((u) => {
    const q = filter.toLowerCase();
    return userName(u).toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  const toggleAll = () => {
    if (filtered.every((u) => selected.has(u.id))) {
      const next = new Set(selected);
      filtered.forEach((u) => next.delete(u.id));
      onChange(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((u) => next.add(u.id));
      onChange(next);
    }
  };

  const allChecked = filtered.length > 0 && filtered.every((u) => selected.has(u.id));

  return (
    <div className="space-y-2">
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          className="w-full text-sm bg-background border border-border rounded px-3 py-2 pl-8 outline-none focus:ring-1 focus:ring-primary"
          placeholder="Filter users…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="border border-border rounded-lg max-w-xs" style={{ overflow: "clip" }}>
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors border-b border-border rounded-t-lg"
          onClick={toggleAll}
        >
          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${allChecked ? "bg-primary border-primary" : "border-border"}`}>
            {allChecked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
          </div>
          {allChecked ? "Deselect all" : "Select all"}
          {filtered.length !== users.length && ` (${filtered.length} visible)`}
        </button>

        <div className="max-h-44 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-3 text-center">No users match</p>
          )}
          {filtered.map((u) => {
            const checked = selected.has(u.id);
            return (
              <button
                key={u.id}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-0 ${checked ? "bg-primary/5" : ""}`}
                onClick={() => toggle(u.id)}
              >
                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary" : "border-border"}`}>
                  {checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{userName(u)}</p>
                  {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                </div>
                <span className="ml-auto text-xs text-muted-foreground shrink-0">
                  {findLabel(ranks, u.role)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected.size > 0 && (
        <p className="text-xs text-primary font-medium">
          {selected.size} user{selected.size !== 1 ? "s" : ""} selected
        </p>
      )}
    </div>
  );
}

// ── PermissionToggle ───────────────────────────────────────────────────────

function PermissionToggle({
  label, description, enabled, onChange, disabled,
}: {
  label: string; description: string; enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      disabled={disabled}
      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all w-full disabled:opacity-50 ${
        enabled
          ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
          : "border-border bg-background hover:bg-accent/40"
      }`}
    >
      <div className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${enabled ? "bg-primary" : "bg-muted-foreground/25"}`}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-150 ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
      </div>
    </button>
  );
}

// ── VaultBuiltInsManagement ───────────────────────────────────────────────
// Lets an admin add/remove entries from the built-in list shown on My
// Vault's Games/Reading/Stories tabs (and My Videos' Streaming Services
// tab) without a code change + redeploy.

type AdminVaultSource = { id: number; listType: string; name: string; url: string; description: string; emoji: string | null; iconUrl?: string | null; color: string; pinned?: boolean };

const VAULT_SOURCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "vault-stories", label: "Stories" },
  { value: "vault-games", label: "Games" },
  { value: "vault-reading", label: "Reading" },
  { value: "streaming", label: "Streaming Services" },
  { value: "music-browse", label: "Browse Music" },
  { value: "music-stream", label: "Stream Sources" },
  { value: "music-audiobooks", label: "Audiobooks" },
  { value: "music-radio-picker", label: "Radio Picker" },
];

function VaultBuiltInsManagement() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [listType, setListType] = useState("vault-stories");
  const [items, setItems] = useState<AdminVaultSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<"link" | "upload">("link");
  const [nameDraft, setNameDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [emojiDraft, setEmojiDraft] = useState("");
  const [iconUrlDraft, setIconUrlDraft] = useState("");
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [pinnedDraft, setPinnedDraft] = useState(false);
  const [fileDraft, setFileDraft] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  // Set while the add form is repurposed to edit an existing built-in
  // instead of creating a new one -- same form, same fields, just PATCHes
  // that id on submit rather than POSTing a new row.
  const [editingId, setEditingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/vault-builtins?type=${encodeURIComponent(listType)}`, { credentials: "include" });
      const data = await res.json() as { items?: AdminVaultSource[] };
      setItems(data.items ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [listType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    const name = nameDraft.trim();
    const description = descriptionDraft.trim();
    if (!name || !description) {
      toast({ title: "Name and description are required", variant: "destructive" });
      return;
    }
    if (addMode === "link" && !urlDraft.trim()) {
      toast({ title: "URL is required", variant: "destructive" });
      return;
    }
    if (addMode === "upload" && !fileDraft) {
      toast({ title: "Choose a file to upload", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const url = addMode === "upload" && fileDraft ? await uploadFile(fileDraft) : urlDraft.trim();
      const res = await fetch(
        editingId ? `/api/admin/vault-sources/${editingId}` : "/api/admin/vault-sources",
        {
          method: editingId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listType, name, url, description,
            emoji: emojiDraft.trim() || undefined,
            iconUrl: iconUrlDraft.trim(),
            pinned: pinnedDraft,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Failed to ${editingId ? "save" : "add"}`);
      }
      setNameDraft(""); setUrlDraft(""); setDescriptionDraft(""); setEmojiDraft(""); setIconUrlDraft(""); setPinnedDraft(false); setFileDraft(null);
      setShowAddForm(false);
      setEditingId(null);
      await refresh();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : `Failed to ${editingId ? "save" : "add"}`, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (item: AdminVaultSource) => {
    setEditingId(item.id);
    setAddMode("link");
    setNameDraft(item.name);
    setUrlDraft(item.url);
    setDescriptionDraft(item.description);
    setEmojiDraft(item.emoji ?? "");
    setIconUrlDraft(item.iconUrl ?? "");
    setPinnedDraft(item.pinned ?? false);
    setShowAddForm(true);
  };

  const handleUploadIcon = async (file: File) => {
    setUploadingIcon(true);
    try {
      const { thumbnailUrl } = await compressAndUploadPhoto(file);
      setIconUrlDraft(thumbnailUrl);
    } catch {
      toast({ title: "Couldn't upload that image", variant: "destructive" });
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleDelete = async (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/admin/vault-sources/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
      void refresh();
    }
  };

  return (
    <section className="mt-8 bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-muted flex-wrap">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 shrink-0 group focus:outline-none">
          <Archive className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Vault Built-in Sources</h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
        <div className="flex gap-1 flex-wrap">
          {VAULT_SOURCE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setListType(opt.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                listType === opt.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        )}
        {open && (
        <Button
          size="sm"
          className="ml-auto gap-1.5 shrink-0"
          onClick={() => {
            setShowAddForm((v) => !v);
            setEditingId(null); setIconUrlDraft(""); setNameDraft(""); setUrlDraft(""); setDescriptionDraft(""); setEmojiDraft(""); setPinnedDraft(false);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
        )}
      </div>

      {open && showAddForm && (
        <div className="px-5 py-4 border-b border-border space-y-2">
          {editingId ? (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Edit Source</p>
          ) : (
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant={addMode === "link" ? "secondary" : "ghost"} onClick={() => setAddMode("link")} className="gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Link to a URL
            </Button>
            <Button type="button" size="sm" variant={addMode === "upload" ? "secondary" : "ghost"} onClick={() => setAddMode("upload")} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Upload from my computer
            </Button>
          </div>
          )}
          <input
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
          {addMode === "link" ? (
            <input
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              placeholder="https://..."
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
            />
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm,.pdf,text/html,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setFileDraft(file);
                  if (file && !nameDraft.trim()) setNameDraft(file.name.replace(/\.[^.]+$/, ""));
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 shrink-0">
                <Upload className="w-3.5 h-3.5" /> Choose file
              </Button>
              <span className="text-sm text-muted-foreground truncate">
                {fileDraft ? fileDraft.name : "HTML or PDF, up to 50 MB"}
              </span>
            </div>
          )}
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Description"
            rows={2}
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Emoji (optional, e.g. 🐻⚔️ -- Stories tab only)"
            value={emojiDraft}
            onChange={(e) => setEmojiDraft(e.target.value)}
          />
          <div className="flex gap-2 items-center">
            {iconUrlDraft && (
              <img src={iconUrlDraft} alt="" className="w-8 h-8 rounded object-contain bg-black/20 shrink-0 border border-border" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <input
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              placeholder="Icon image URL (optional)"
              value={iconUrlDraft}
              onChange={(e) => setIconUrlDraft(e.target.value)}
            />
            <input
              ref={iconFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file) void handleUploadIcon(file);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => iconFileInputRef.current?.click()} disabled={uploadingIcon} className="gap-1.5 shrink-0">
              {uploadingIcon ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinnedDraft}
              onChange={(e) => setPinnedDraft(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            Pinned <span className="text-xs text-muted-foreground">(always shown first, ahead of favorites)</span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>
              {adding ? (editingId ? "Saving…" : "Adding…") : editingId ? "Save" : "Add"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAddForm(false); setFileDraft(null); setPinnedDraft(false);
                setEditingId(null); setIconUrlDraft(""); setNameDraft(""); setUrlDraft(""); setDescriptionDraft(""); setEmojiDraft("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {open && (
      <div className="divide-y divide-border">
        {loading ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">No built-in sources yet for this tab.</div>
        ) : items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-5 py-3">
            {item.emoji && <span className="text-xl shrink-0">{item.emoji}</span>}
            {item.iconUrl && (
              <img src={item.iconUrl} alt="" className="w-7 h-7 rounded object-contain bg-black/20 shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium truncate">{item.name}</p>
                {item.pinned && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                    Pinned
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
            </div>
            <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => startEdit(item)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {confirmDeleteId === item.id ? (
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="destructive" onClick={() => void handleDelete(item.id)}>Yes</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>No</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(item.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

// ── HelpArticlesManagement ─────────────────────────────────────────────────
// Lets the Help page (Settings > notifications bell > Help) be kept up to
// date without a code deploy -- it started as a static hand-written page.

interface HelpArticle { id: number; category: string; question: string; answer: string; }

function HelpArticlesManagement() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/help", { credentials: "include" });
      setItems(res.ok ? await res.json() as HelpArticle[] : []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const categories = [...new Set(items.map((i) => i.category))];
  const grouped = categories.map((category) => ({
    category,
    entries: items.filter((i) => i.category === category),
  }));

  const handleAdd = async () => {
    const category = categoryDraft.trim();
    const question = questionDraft.trim();
    const answer = answerDraft.trim();
    if (!category || !question || !answer) {
      toast({ title: "Category, question, and answer are all required", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/admin/help", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, question, answer }),
      });
      if (!res.ok) throw new Error();
      setQuestionDraft(""); setAnswerDraft("");
      setShowAddForm(false);
      await refresh();
    } catch {
      toast({ title: "Failed to add article", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    const question = editQuestion.trim();
    const answer = editAnswer.trim();
    if (!question || !answer) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/help/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      if (!res.ok) throw new Error();
      setEditingId(null);
      await refresh();
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/admin/help/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
      void refresh();
    }
  };

  return (
    <section className="mt-8 bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-muted flex-wrap">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 shrink-0 group focus:outline-none">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Help Articles</h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
        <Button size="sm" className="ml-auto gap-1.5 shrink-0" onClick={() => setShowAddForm((v) => !v)}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
        )}
      </div>

      {open && (
      <>
      {showAddForm && (
        <div className="px-5 py-4 border-b border-border space-y-2">
          <input
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Category (e.g. My Videos -- reuse an existing one to group with it)"
            value={categoryDraft}
            onChange={(e) => setCategoryDraft(e.target.value)}
            list="help-categories"
          />
          <datalist id="help-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
          <input
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Question"
            value={questionDraft}
            onChange={(e) => setQuestionDraft(e.target.value)}
          />
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            placeholder="Answer"
            rows={3}
            value={answerDraft}
            onChange={(e) => setAnswerDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void handleAdd()} disabled={adding}>{adding ? "Adding…" : "Add"}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">No help articles yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {grouped.map((group) => (
            <div key={group.category}>
              <div className="px-5 py-2 bg-muted/40 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {group.category}
              </div>
              {group.entries.map((item) => (
                <div key={item.id} className="px-5 py-3 border-t border-border/50">
                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <input
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                      />
                      <textarea
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        rows={3}
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void handleSaveEdit(item.id)} disabled={savingEdit}>
                          <Check className="w-3.5 h-3.5 mr-1.5" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.question}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.answer}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => { setEditingId(item.id); setEditQuestion(item.question); setEditAnswer(item.answer); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {confirmDeleteId === item.id ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="destructive" onClick={() => void handleDelete(item.id)}>Yes</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>No</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(item.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </section>
  );
}

// ── FeaturedFilmsManagement ────────────────────────────────────────────────

type TriviaQuestion = { topic: string; question: string; answer: string; choices?: string[] };
type TriviaData = { title: string; category: string; question_count: number; estimated_minutes: number; questions: TriviaQuestion[] };

type FeaturedFilmAdmin = {
  id: number; title: string; youtubeUrl: string; thumbnailUrl: string | null;
  description: string | null; category: string; featuredMonth: string;
  triviaData: TriviaData | null;
};

function FeaturedFilmsManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", youtubeUrl: "", thumbnailUrl: "", description: "",
    category: "Featured", featuredMonth: (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })(),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importParsed, setImportParsed] = useState<Array<{ title: string; url: string; category: string; description: string }> | null>(null);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMonth, setImportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const [triviaFilmId, setTriviaFilmId] = useState<number | null>(null);
  const [triviaJson, setTriviaJson] = useState("");
  const [triviaError, setTriviaError] = useState("");
  const [savingTrivia, setSavingTrivia] = useState(false);

  const { data, refetch } = useQuery<{ films: FeaturedFilmAdmin[] }>({
    queryKey: ["admin-featured-films"],
    queryFn: async () => {
      const res = await fetch("/api/admin/featured-films", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ films: FeaturedFilmAdmin[] }>;
    },
    staleTime: 30_000,
  });

  const films = data?.films ?? [];

  const handleAdd = async () => {
    if (!form.title.trim() || !form.youtubeUrl.trim() || !form.featuredMonth.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/featured-films", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: "Film added to Fresh Finds" });
      setForm((f) => ({ ...f, title: "", youtubeUrl: "", thumbnailUrl: "", description: "" }));
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["discover-films"] });
      void queryClient.invalidateQueries({ queryKey: ["discover-months"] });
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`/api/admin/featured-films/${id}`, { method: "DELETE", credentials: "include" });
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["discover-films"] });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleImportParse = () => {
    setImportError("");
    setImportParsed(null);
    try {
      const parsed = JSON.parse(importJson) as unknown;
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const items = (parsed as Record<string, unknown>[]).map((p, i) => {
        if (!p.title || !p.url) throw new Error(`Item ${i + 1} missing title or url`);
        return {
          title: String(p.title),
          url: String(p.url),
          category: String(p.category || "Featured"),
          description: String(p.description || ""),
        };
      });
      setImportParsed(items);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const handleImport = async () => {
    if (!importParsed) return;
    setImporting(true);
    let added = 0; let failed = 0;
    for (const item of importParsed) {
      try {
        const res = await fetch("/api/admin/featured-films", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: item.title, youtubeUrl: item.url, description: item.description || null, category: item.category, featuredMonth: importMonth }),
        });
        if (res.ok) added++; else failed++;
      } catch { failed++; }
    }
    setImporting(false);
    setImportParsed(null);
    setImportJson("");
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["discover-films"] });
    void queryClient.invalidateQueries({ queryKey: ["discover-months"] });
    toast({ title: `Imported ${added} item${added !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}` });
  };

  const handleRemoveTrivia = async (filmId: number) => {
    try {
      const res = await fetch(`/api/admin/featured-films/${filmId}/trivia`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triviaData: null }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: "Trivia removed." });
      setTriviaFilmId(null);
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["discover-films"] });
    } catch (e) {
      toast({ title: "Failed to remove trivia", description: String(e), variant: "destructive" });
    }
  };

  const handleSaveTrivia = async () => {
    if (triviaFilmId === null) return;
    setTriviaError("");
    let parsed: unknown;
    try { parsed = JSON.parse(triviaJson); } catch { setTriviaError("Invalid JSON"); return; }
    setSavingTrivia(true);
    try {
      const res = await fetch(`/api/admin/featured-films/${triviaFilmId}/trivia`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triviaData: parsed }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: "Trivia saved!" });
      setTriviaFilmId(null);
      setTriviaJson("");
      void refetch();
      void queryClient.invalidateQueries({ queryKey: ["discover-films"] });
    } catch (err) {
      setTriviaError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingTrivia(false);
    }
  };

  const CATEGORIES = ["Featured", "YouTube Movie", "Podcast", "Music Stream", "Book", "Comic", "Film Noir", "Classic Horror", "Silent Comedy", "Western", "Classic Drama", "Comedy", "Romance", "Action", "Drama", "Documentary", "Game", "Audiobook", "Classic Literature", "Mystery Audiobook", "Non-Fiction Audiobook", "Radio Show", "Radio Drama", "Radio Comedy", "Radio Mystery"];

  return (
    <section className="rounded-2xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-3 text-left"
          onClick={() => setOpen((o) => !o)}
        >
          <Star className="w-5 h-5 text-primary" />
          <div>
            <p className="font-semibold">Fresh Finds Content</p>
            <p className="text-sm text-muted-foreground">{films.length} item{films.length !== 1 ? "s" : ""} curated</p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <a
            href="https://scout-curate-link.base44.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30 hover:bg-amber-500/15 transition"
          >
            <ExternalLink className="w-3 h-3" />
            Content Scout
          </a>
          <button onClick={() => setOpen((o) => !o)}>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-6 pt-2 border-t border-border">
          {/* Add form */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Add an item</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Title *"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                placeholder="YouTube URL *"
                value={form.youtubeUrl}
                onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                placeholder="Thumbnail URL (optional — auto-filled for YouTube)"
                value={form.thumbnailUrl}
                onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30 sm:col-span-2"
              />
              <textarea
                placeholder="Short description (optional)"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none sm:col-span-2"
              />
              <div className="flex gap-3">
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="month"
                  value={form.featuredMonth}
                  onChange={(e) => setForm((f) => ({ ...f, featuredMonth: e.target.value }))}
                  className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <Button onClick={() => void handleAdd()} disabled={saving || !form.title.trim() || !form.youtubeUrl.trim()} className="self-end">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Add Item
              </Button>
            </div>
          </div>

          {/* Import from Content Scout */}
          <div className="space-y-3">
            <button
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setImportOpen((o) => !o); setImportError(""); setImportParsed(null); }}
            >
              <Download className="w-4 h-4" />
              Import from Content Scout
              {importOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {importOpen && (
              <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground">
                  In Content Scout → Saved List, click <strong>Copy as JSON for URLinc</strong>, then paste below.
                </p>
                <textarea
                  placeholder={'[{"title":"...","url":"...","category":"...","description":"..."}]'}
                  value={importJson}
                  onChange={(e) => { setImportJson(e.target.value); setImportParsed(null); setImportError(""); }}
                  rows={4}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono text-xs"
                />
                {importError && <p className="text-xs text-destructive">{importError}</p>}
                <div className="flex items-center gap-3">
                  <input
                    type="month"
                    value={importMonth}
                    onChange={(e) => setImportMonth(e.target.value)}
                    className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <Button size="sm" variant="outline" onClick={handleImportParse} disabled={!importJson.trim()}>
                    Preview
                  </Button>
                </div>
                {importParsed && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">{importParsed.length} item{importParsed.length !== 1 ? "s" : ""} ready to import:</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {importParsed.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-background border border-border">
                          <span className="text-muted-foreground shrink-0">{item.category}</span>
                          <span className="font-medium truncate">{item.title}</span>
                        </div>
                      ))}
                    </div>
                    <Button onClick={() => void handleImport()} disabled={importing} className="w-full">
                      {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                      Import {importParsed.length} item{importParsed.length !== 1 ? "s" : ""}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Film list grouped by month */}
          {films.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No featured films yet.</p>
          ) : (
            <div className="space-y-4">
              {Array.from(new Set(films.map((f) => f.featuredMonth))).map((m) => (
                <div key={m}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {new Date(Number(m.split("-")[0]), Number(m.split("-")[1]) - 1, 1)
                      .toLocaleString("default", { month: "long", year: "numeric" })}
                  </p>
                  <div className="space-y-2">
                    {films.filter((f) => f.featuredMonth === m).map((film) => (
                      <div key={film.id}>
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 group">
                        <div className="w-16 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                          {(film.thumbnailUrl || film.youtubeUrl.includes("youtube")) && (
                            <img
                              src={film.thumbnailUrl || `https://img.youtube.com/vi/${film.youtubeUrl.match(/[?&]v=([^&]+)/)?.[1] ?? ""}/default.jpg`}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{film.title}</p>
                          <p className="text-xs text-muted-foreground">{film.category}</p>
                        </div>
                        <a href={film.youtubeUrl} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => { setTriviaFilmId(triviaFilmId === film.id ? null : film.id); setTriviaJson(""); setTriviaError(""); }}
                          title={film.triviaData ? `Trivia: ${(film.triviaData as TriviaData).question_count} questions` : "Add trivia"}
                          className={[
                            "opacity-0 group-hover:opacity-100 transition-opacity",
                            film.triviaData ? "text-blue-400 hover:text-blue-300" : "text-muted-foreground hover:text-blue-400",
                          ].join(" ")}
                        >
                          <Trophy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => void handleDelete(film.id)}
                          disabled={deleting === film.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:opacity-70 disabled:opacity-40"
                        >
                          {deleting === film.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                      {triviaFilmId === film.id && (
                        <div className="mx-3 mb-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
                          <p className="text-xs font-medium text-blue-300">
                            Paste the trivia JSON from Content Scout:
                          </p>
                          <textarea
                            value={triviaJson}
                            onChange={(e) => { setTriviaJson(e.target.value); setTriviaError(""); }}
                            placeholder='{"title":"...","questions":[...]}'
                            rows={4}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-blue-500/30 resize-none font-mono"
                          />
                          {triviaError && <p className="text-xs text-destructive">{triviaError}</p>}
                          {film.triviaData && (
                            <p className="text-xs text-blue-400/70">
                              Currently has {(film.triviaData as TriviaData).question_count} questions — paste new JSON to replace.
                            </p>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <Button size="sm" onClick={() => void handleSaveTrivia()} disabled={savingTrivia || !triviaJson.trim()}>
                              {savingTrivia ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trophy className="w-3 h-3 mr-1" />}
                              Save Trivia
                            </Button>
                            {film.triviaData && (
                              <Button size="sm" variant="destructive" onClick={() => void handleRemoveTrivia(film.id)} disabled={savingTrivia}>
                                Remove Trivia
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setTriviaFilmId(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── RankManagement ─────────────────────────────────────────────────────────

function RankManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: ranks = [], isLoading } = useRanks();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newIsConfigurable, setNewIsConfigurable] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [expandedPermissionsId, setExpandedPermissionsId] = useState<number | null>(null);

  const slugify = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

  const updateRank = useMutation({
    mutationFn: async ({ id, label }: { id: number; label: string }) => {
      const res = await fetch(`/api/admin/ranks/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to update rank");
      }
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ranksQueryKey() }); setEditingId(null); },
    onError: (err) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const createRank = useMutation({
    mutationFn: async (data: { name: string; label: string; isAdminRank: boolean; isConfigurable: boolean }) => {
      const res = await fetch("/api/admin/ranks", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to create rank");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ranksQueryKey() });
      setIsAdding(false); setNewName(""); setNewLabel(""); setNewIsAdmin(false); setNewIsConfigurable(false);
      toast({ title: "Rank created" });
    },
    onError: (err) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const deleteRank = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/ranks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to delete rank");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ranksQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
      setConfirmDeleteId(null);
      toast({ title: "Rank deleted" });
    },
    onError: (err) => {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
      setConfirmDeleteId(null);
    },
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ rankId, permissions }: { rankId: number; permissions: Record<string, boolean> }) => {
      const res = await fetch(`/api/admin/ranks/${rankId}/permissions`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed to update permissions");
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ranksQueryKey() }),
    onError: (err) => toast({ title: "Error", description: (err as Error).message, variant: "destructive" }),
  });

  const handlePermissionToggle = (rank: Rank, key: string, value: boolean) => {
    const current = (rank.permissions ?? {}) as Record<string, boolean>;
    updatePermissions.mutate({ rankId: rank.id, permissions: { ...current, [key]: value } });
  };

  const showPermissions = (rank: Rank) =>
    rank.name !== "admin_exec" &&
    (BUILTIN_CONFIGURABLE.has(rank.name) || rank.isConfigurable === true);

  return (
    <div className="mt-8 border border-border rounded-xl" style={{ overflow: "clip" }}>
      <div className="flex items-center justify-between px-5 py-3 bg-muted border-b border-border rounded-tl-xl rounded-tr-xl">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Rank Management</h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && !isAdding && (
          <Button size="sm" variant="outline" onClick={() => setIsAdding(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Rank
          </Button>
        )}
      </div>

      {open && (
      <div className="divide-y divide-border">
        {isAdding && (
          <div className="px-5 py-4 bg-accent/20 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Rank</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Display Name</label>
                <input
                  autoFocus
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. Support Team"
                  value={newLabel}
                  onChange={(e) => { setNewLabel(e.target.value); setNewName(slugify(e.target.value)); }}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Rank ID</label>
                <input
                  className="w-full text-sm bg-background border border-border rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary font-mono"
                  placeholder="e.g. support_team"
                  value={newName}
                  onChange={(e) => setNewName(slugify(e.target.value))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} className="accent-primary" />
                <span className="text-sm">Grants admin access</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={newIsConfigurable} onChange={(e) => setNewIsConfigurable(e.target.checked)} className="accent-primary" />
                <span className="text-sm">Has configurable permissions</span>
              </label>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!newName.trim() || !newLabel.trim() || createRank.isPending}
                onClick={() => createRank.mutate({ name: newName.trim(), label: newLabel.trim(), isAdminRank: newIsAdmin, isConfigurable: newIsConfigurable })}
              >
                {createRank.isPending && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
                Save Rank
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewName(""); setNewLabel(""); setNewIsAdmin(false); setNewIsConfigurable(false); }}>Cancel</Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="px-5 py-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (
          <div className="overflow-y-auto max-h-[280px] divide-y divide-border">
            {ranks.map((rank) => (
          <div key={rank.id}>
            {/* Rank row */}
            <div className="flex items-center gap-3 px-5 py-3">
              <div className="w-4 shrink-0 flex items-center justify-center">
                {rank.isBuiltin && <span title="Built-in rank"><Lock className="w-3.5 h-3.5 text-muted-foreground/50" /></span>}
              </div>

              <div className="flex-1 min-w-0">
                {editingId === rank.id ? (
                  <input
                    autoFocus
                    className="text-sm bg-background border border-border rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary w-full max-w-xs"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateRank.mutate({ id: rank.id, label: editLabel });
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium">{rank.label}</span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{rank.name}</span>
                    {!rank.isAdminRank && (
                      <span className="text-xs text-muted-foreground shrink-0">(no admin access)</span>
                    )}
                    {rank.name === "admin_exec" && (
                      <span className="text-xs text-primary/70 font-medium shrink-0">Full access</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Permissions button — only for non-exec admin ranks */}
                {showPermissions(rank) && editingId !== rank.id && (
                  <button
                    onClick={() => setExpandedPermissionsId(expandedPermissionsId === rank.id ? null : rank.id)}
                    className={`flex items-center gap-1.5 h-7 px-2.5 text-xs rounded-md border transition-colors ${
                      expandedPermissionsId === rank.id
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    Permissions
                  </button>
                )}

                {editingId === rank.id ? (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2"
                      disabled={!editLabel.trim() || updateRank.isPending}
                      onClick={() => updateRank.mutate({ id: rank.id, label: editLabel })}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground"
                    onClick={() => { setEditingId(rank.id); setEditLabel(rank.label); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}

                {rank.isBuiltin ? (
                  <div className="w-7" />
                ) : confirmDeleteId === rank.id ? (
                  <div className="flex items-center gap-1 ml-1">
                    <span className="text-xs text-destructive">Delete?</span>
                    <Button size="sm" variant="destructive" className="h-7 text-xs px-2"
                      disabled={deleteRank.isPending}
                      onClick={() => deleteRank.mutate(rank.id)}>
                      {deleteRank.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                      onClick={() => setConfirmDeleteId(null)}>No</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDeleteId(rank.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Permissions panel */}
            {expandedPermissionsId === rank.id && showPermissions(rank) && (
              <div className="px-5 py-4 bg-muted/20 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Permissions for {rank.label}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {PERMISSION_DEFS.map(({ key, label, description }) => {
                    const enabled = (rank.permissions as Record<string, boolean> | null | undefined)?.[key] === true;
                    return (
                      <PermissionToggle
                        key={key}
                        label={label}
                        description={description}
                        enabled={enabled}
                        disabled={updatePermissions.isPending}
                        onChange={(v) => handlePermissionToggle(rank, key, v)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ── DiagnosticsPanel ───────────────────────────────────────────────────────
// Site-wide data-integrity checks, distinct from the per-user self-service
// broken-links/duplicates pages. Read-only, on-demand (the storage scan can
// take a moment on a large bucket, so it doesn't run automatically).

type DiagnosticsData = {
  generatedAt: string;
  lastCleanupAt: string | null;
  orphanedStorage: { fileCount: number; bytes: number };
  trash: { trashedVideos: number; oldestTrashedVideo: string | null; trashedPhotos: number; oldestTrashedPhoto: string | null };
  musicPlaylists: { orphanedCount: number };
  overview: {
    totalUsers: number; totalVideos: number; totalPhotos: number;
    totalPlaylists: number; totalMusic: number; totalMusicPlaylists: number;
    totalStorageBytes: number;
  };
  shares: {
    pendingVideoShares: number; staleVideoShares: number;
    pendingPlaylistShares: number; stalePlaylistShares: number;
    pendingCategoryShares: number; staleCategoryShares: number;
    pendingPhotoCategoryShares: number; stalePhotoCategoryShares: number;
  };
};

function diagnosticsQueryKey() { return ["admin", "diagnostics"]; }

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function StatCard({ label, value, detail, warn, action }: { label: string; value: number | string; detail: string; warn?: boolean; action?: ReactNode }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${warn ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-accent/20"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${warn ? "text-amber-500" : ""}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{detail}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function DiagnosticsPanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data, isFetching, refetch, error } = useQuery<DiagnosticsData>({
    queryKey: diagnosticsQueryKey(),
    queryFn: async () => {
      const res = await fetch("/api/admin/diagnostics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to run diagnostics");
      return res.json() as Promise<DiagnosticsData>;
    },
    enabled: false,
  });

  const [isCleaningStorage, setIsCleaningStorage] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);

  const confirmCleanupOrphanedStorage = async () => {
    setShowCleanupConfirm(false);
    setIsCleaningStorage(true);
    try {
      const res = await fetch("/api/admin/diagnostics/cleanup-orphaned-storage", {
        method: "POST", credentials: "include",
      });
      const body = await res.json() as { started?: boolean; count?: number; bytes?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to start cleanup");
      toast({
        title: body.count ? `Cleaning up ${body.count.toLocaleString()} files (${formatBytes(body.bytes ?? 0)})` : "Nothing to clean up",
        description: body.count ? "Running in the background — re-run Diagnostics in a minute to confirm." : undefined,
      });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsCleaningStorage(false);
    }
  };

  const hasRun = data !== undefined;
  const staleShareTotal = data
    ? data.shares.staleVideoShares + data.shares.stalePlaylistShares + data.shares.staleCategoryShares + data.shares.stalePhotoCategoryShares
    : 0;
  const pendingShareTotal = data
    ? data.shares.pendingVideoShares + data.shares.pendingPlaylistShares + data.shares.pendingCategoryShares + data.shares.pendingPhotoCategoryShares
    : 0;

  return (
    <div className="mt-8 border border-border rounded-xl" style={{ overflow: "clip" }}>
      <div className="flex items-center justify-between px-5 py-3 bg-muted border-b border-border rounded-tl-xl rounded-tr-xl">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 group focus:outline-none">
          <Activity className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Diagnostics</h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
        <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching
            ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
          {hasRun ? "Re-run" : "Run Diagnostics"}
        </Button>
        )}
      </div>

      {open && (
      <div className="px-5 py-4">
        {error && <p className="text-sm text-destructive">Failed to run diagnostics. Try again.</p>}

        {!hasRun && !isFetching && !error && (
          <p className="text-sm text-muted-foreground">
            Site-wide checks across every user's data: orphaned storage files, trash, orphaned music-playlist rows,
            overall storage/row counts, and stale pending shares. Read-only — nothing is deleted automatically.
          </p>
        )}

        {isFetching && !hasRun && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Last run: {new Date(data.generatedAt).toLocaleString()}</p>
            {(() => {
              const lastClean = data.lastCleanupAt ? new Date(data.lastCleanupAt) : null;
              const daysSince = lastClean ? Math.floor((Date.now() - lastClean.getTime()) / 86400000) : null;
              const color = daysSince === null || daysSince > 60 ? "text-red-500" : daysSince > 30 ? "text-yellow-500" : "text-green-500";
              const label = daysSince === null ? "Never cleaned — consider running a cleanup" : daysSince === 0 ? "Cleaned today" : `Last cleaned: ${daysSince} day${daysSince === 1 ? "" : "s"} ago${daysSince > 30 ? " — cleanup recommended" : ""}`;
              return <p className={`text-xs font-medium ${color}`}>🧹 {label}</p>;
            })()}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                label="Orphaned storage files"
                value={data.orphanedStorage.fileCount}
                detail={data.orphanedStorage.fileCount > 0 ? `${formatBytes(data.orphanedStorage.bytes)} wasted` : "None found"}
                warn={data.orphanedStorage.fileCount > 0}
                action={data.orphanedStorage.fileCount > 0 && (
                  <Button size="sm" variant="outline" className="h-6 text-xs w-full" onClick={() => setShowCleanupConfirm(true)} disabled={isCleaningStorage}>
                    {isCleaningStorage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Clean Up
                  </Button>
                )}
              />
              <StatCard
                label="Videos in trash"
                value={data.trash.trashedVideos}
                detail={data.trash.oldestTrashedVideo ? `Oldest: ${daysAgo(data.trash.oldestTrashedVideo)}d ago` : "Empty"}
              />
              <StatCard
                label="Photos in trash"
                value={data.trash.trashedPhotos}
                detail={data.trash.oldestTrashedPhoto ? `Oldest: ${daysAgo(data.trash.oldestTrashedPhoto)}d ago` : "Empty"}
              />
              <StatCard
                label="Orphaned music-playlist rows"
                value={data.musicPlaylists.orphanedCount}
                detail={data.musicPlaylists.orphanedCount > 0 ? "Point to a deleted playlist/song" : "None found"}
                warn={data.musicPlaylists.orphanedCount > 0}
              />
              <StatCard
                label="Total storage used"
                value={formatBytes(data.overview.totalStorageBytes)}
                detail={`${data.overview.totalVideos} videos, ${data.overview.totalPhotos} photos, ${data.overview.totalMusic} songs`}
              />
              <StatCard
                label="Pending shares"
                value={pendingShareTotal}
                detail={staleShareTotal > 0 ? `${staleShareTotal} older than 30 days` : "All recent"}
                warn={staleShareTotal > 0}
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground pt-2 border-t border-border">
              <span>{data.overview.totalUsers} users</span>
              <span>{data.overview.totalPlaylists} playlists</span>
              <span>{data.overview.totalMusicPlaylists} music playlists</span>
            </div>
          </div>
        )}
      </div>
      )}

      <AlertDialog open={showCleanupConfirm} onOpenChange={setShowCleanupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete orphaned storage files?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <strong>{data?.orphanedStorage.fileCount.toLocaleString() ?? "these"} file{data?.orphanedStorage.fileCount !== 1 ? "s" : ""}</strong>
              {data?.orphanedStorage.bytes ? ` (${formatBytes(data.orphanedStorage.bytes)})` : ""} from Google Cloud Storage.
              <br /><br />
              Files with no matching database record are removed. This <strong>cannot be undone</strong> — any file deleted here is gone permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmCleanupOrphanedStorage()}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── ComposePanel ───────────────────────────────────────────────────────────

type AttachedPayload = { data: Record<string, unknown>; type: "music" | "photos" | "videos"; count: number };

function ComposePanel({ users, ranks }: { users: UserInfo[]; ranks: Rank[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"all" | "role" | "user">("all");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [attachedPayload, setAttachedPayload] = useState<AttachedPayload | null>(null);
  const [attachLoading, setAttachLoading] = useState<"music" | "photos" | "videos" | null>(null);
  const [sending, setSending] = useState(false);

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (targetType === "all" ||
      (targetType === "role" && selectedRole.trim().length > 0) ||
      (targetType === "user" && selectedUserIds.size > 0));

  const handleAttach = async (type: "music" | "photos" | "videos") => {
    setAttachLoading(type);
    try {
      const endpoint = type === "music" ? "/api/music/export" : type === "photos" ? "/api/photos/export" : "/api/library/export";
      const res = await fetch(endpoint, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json() as Record<string, unknown>;
      const count =
        type === "music" ? (Array.isArray(data.tracks) ? data.tracks.length : 0) :
        type === "photos" ? (Array.isArray(data.photos) ? data.photos.length : 0) :
        Array.isArray(data.videos) ? data.videos.length : 0;
      setAttachedPayload({ data, type, count });
    } catch {
      toast({ title: "Error", description: "Failed to fetch library export.", variant: "destructive" });
    } finally {
      setAttachLoading(null);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      if (targetType === "user") {
        const ids = [...selectedUserIds];
        for (const userId of ids) {
          const res = await fetch("/api/messages", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title.trim(), body: body.trim(),
              targetType: "user", targetValue: userId,
              ...(attachedPayload ? { payload: attachedPayload.data } : {}),
            }),
          });
          if (!res.ok) throw new Error("Send failed");
        }
        toast({ title: "Messages sent", description: `Sent to ${ids.length} user${ids.length !== 1 ? "s" : ""}.` });
      } else {
        const res = await fetch("/api/messages", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(), body: body.trim(),
            targetType, targetValue: targetType === "role" ? selectedRole.trim() : undefined,
          }),
        });
        if (!res.ok) throw new Error("Send failed");
        toast({ title: "Message sent", description: "Your message has been delivered." });
      }
      void queryClient.invalidateQueries({ queryKey: getGetInboxQueryKey() });
      setTitle(""); setBody(""); setTargetType("all"); setSelectedRole("");
      setSelectedUserIds(new Set()); setAttachedPayload(null);
    } catch {
      toast({ title: "Error", description: "Failed to send message.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const targetButtons: { id: "all" | "role" | "user"; label: string }[] = [
    { id: "all", label: "Everyone" },
    { id: "role", label: "By Rank" },
    { id: "user", label: selectedUserIds.size > 0 ? `Specific User/s (${selectedUserIds.size})` : "Specific User/s" },
  ];

  return (
    <div className="mt-8 border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-muted/40 border-b border-border">
        <Mail className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Send Message</h2>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex gap-3 flex-wrap">
          {targetButtons.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setTargetType(id); setSelectedRole(""); setSelectedUserIds(new Set()); setAttachedPayload(null); }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                targetType === id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {targetType === "role" && (
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Select rank</label>
            <RankPicker ranks={ranks} value={selectedRole} onChange={setSelectedRole} />
          </div>
        )}

        {targetType === "user" && (
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1.5">Select users</label>
            <UserMultiPicker users={users} selected={selectedUserIds} onChange={setSelectedUserIds} ranks={ranks} />
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Subject</label>
          <input
            className="w-full text-sm bg-background border border-border rounded px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            placeholder="Message subject"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">Body</label>
          <textarea
            rows={4}
            className="w-full text-sm bg-background border border-border rounded px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none"
            placeholder="Write your message here…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        {/* Attach Library Export — only available for direct (user) messages */}
        {targetType === "user" && (
          <div className="border border-border/60 rounded-lg p-3 space-y-2.5 bg-muted/20">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Paperclip className="w-3.5 h-3.5" />
              Attach Library Export
              <span className="text-muted-foreground/60 font-normal ml-1">— recipient imports with one tap</span>
            </div>

            {attachedPayload ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-sm">
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-primary font-medium capitalize">
                    {attachedPayload.type === "music" ? "Music" : attachedPayload.type === "photos" ? "Photos" : "Videos"} export ready
                  </span>
                  <span className="text-muted-foreground">— {attachedPayload.count} item{attachedPayload.count !== 1 ? "s" : ""}</span>
                </div>
                <button
                  onClick={() => setAttachedPayload(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {(["videos", "photos", "music"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => void handleAttach(type)}
                    disabled={!!attachLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-accent transition-colors disabled:opacity-60 capitalize"
                  >
                    {attachLoading === type ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    {type === "music" ? "Music Tracks" : type === "photos" ? "Photos" : "Videos"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button disabled={!canSend || sending} onClick={() => void handleSend()} className="gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {targetType === "user" && selectedUserIds.size > 1 ? `Send to ${selectedUserIds.size} users` : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── AdminPage ──────────────────────────────────────────────────────────────

// ── StarterPackManagement ──────────────────────────────────────────────────

type StarterVideo = {
  id: number; title: string; youtube_url: string; thumbnail_url: string | null;
  description: string | null; category: string; sort_order: number;
};

const STARTER_CATEGORIES = [
  "Movie Central", "Film Noir", "Classic Horror", "Silent Comedy", "Western",
  "Classic Drama", "Comedy", "Romance", "Action", "Drama", "Documentary",
];

function StarterPackManagement() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(() => {
    try { return localStorage.getItem("starterPackView") === "preview"; } catch { return false; }
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [form, setForm] = useState({ title: "", youtubeUrl: "", thumbnailUrl: "", description: "", category: "Movie Central" });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ title: "", youtubeUrl: "", thumbnailUrl: "", description: "", category: "" });

  const { data, refetch } = useQuery<{ videos: StarterVideo[] }>({
    queryKey: ["admin-starter-pack"],
    queryFn: async () => {
      const res = await fetch("/api/admin/starter-pack", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ videos: StarterVideo[] }>;
    },
    staleTime: 30_000,
  });

  const videos = data?.videos ?? [];

  const handleAdd = async () => {
    if (!form.title.trim() || !form.youtubeUrl.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/starter-pack", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, youtubeUrl: form.youtubeUrl, thumbnailUrl: form.thumbnailUrl, description: form.description, category: form.category }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Failed"); }
      toast({ title: "Added to starter pack" });
      setForm({ title: "", youtubeUrl: "", thumbnailUrl: "", description: "", category: "Movie Central" });
      void refetch();
    } catch (err) {
      toast({ title: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`/api/admin/starter-pack/${id}`, { method: "DELETE", credentials: "include" });
      void refetch();
    } catch { toast({ title: "Delete failed", variant: "destructive" }); }
    finally { setDeleting(null); }
  };

  const startEdit = (v: StarterVideo) => {
    setEditing(v.id);
    setEditForm({ title: v.title, youtubeUrl: v.youtube_url, thumbnailUrl: v.thumbnail_url ?? "", description: v.description ?? "", category: v.category });
  };

  const finishEdit = () => { setEditing(null); };

  const handleSaveEdit = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/starter-pack/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editForm.title, youtubeUrl: editForm.youtubeUrl, thumbnailUrl: editForm.thumbnailUrl, description: editForm.description, category: editForm.category }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Updated" });
      finishEdit();
      void refetch();
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await Promise.all([...selectedIds].map((id) =>
        fetch(`/api/admin/starter-pack/${id}`, { method: "DELETE", credentials: "include" })
      ));
      toast({ title: `Removed ${selectedIds.size} video${selectedIds.size !== 1 ? "s" : ""} from starter pack` });
      setSelectedIds(new Set());
      setLastSelectedIdx(null);
      void refetch();
    } catch { toast({ title: "Delete failed", variant: "destructive" }); }
    finally { setBulkDeleting(false); }
  };

  const handleCardClick = (idx: number, id: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIdx !== null) {
        const lo = Math.min(lastSelectedIdx, idx);
        const hi = Math.max(lastSelectedIdx, idx);
        const allSelected = videos.slice(lo, hi + 1).every((v) => prev.has(v.id));
        videos.slice(lo, hi + 1).forEach((v) => { if (allSelected) next.delete(v.id); else next.add(v.id); });
      } else {
        if (next.has(id)) next.delete(id); else next.add(id);
      }
      return next;
    });
    setLastSelectedIdx(idx);
  };

  return (
    <section className="rounded-2xl border border-border p-6 space-y-4">
      <button className="w-full flex items-center justify-between" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-center gap-3">
          <Star className="w-5 h-5 text-primary" />
          <div className="text-left">
            <p className="font-semibold">New User Starter Pack</p>
            <p className="text-sm text-muted-foreground">
              {videos.length > 0 ? `${videos.length} video${videos.length !== 1 ? "s" : ""} — new users receive these` : "Using built-in classics (no custom videos added yet)"}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="space-y-6 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground">When new users sign up they receive these videos in their library. If this list is empty, the built-in public domain classics are used instead. Add Movie Central or any YouTube link here to replace the defaults.</p>

          {/* Add form */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Add a video</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input placeholder="Title *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              <input placeholder="YouTube URL *" value={form.youtubeUrl} onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30">
                {STARTER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input placeholder="Thumbnail URL (optional)" value={form.thumbnailUrl} onChange={(e) => setForm((f) => ({ ...f, thumbnailUrl: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              <textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2}
                className="sm:col-span-2 px-3 py-2 text-sm rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>
            <Button size="sm" onClick={() => void handleAdd()} disabled={saving || !form.title.trim() || !form.youtubeUrl.trim()}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />} Add to Starter Pack
            </Button>
          </div>

          {/* List / Card-Preview toggle */}
          {videos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Current starter pack ({videos.length})</p>
                <div className="flex gap-1 rounded-lg border border-border p-0.5 bg-muted">
                  <button
                    type="button"
                    onClick={() => { setPreviewMode(false); try { localStorage.setItem("starterPackView", "list"); } catch {} }}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${!previewMode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    ☰ List
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPreviewMode(true); try { localStorage.setItem("starterPackView", "preview"); } catch {} }}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${previewMode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    ⊞ New User Preview
                  </button>
                </div>
              </div>

              {/* LIST VIEW */}
              {!previewMode && (
                <>
                  {/* List bulk toolbar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedIds.size > 0 ? (
                      <>
                        <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setSelectedIds(new Set()); setLastSelectedIdx(null); }}>Deselect all</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setSelectedIds(new Set(videos.map((v) => v.id)))}>Select all</Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs px-3 gap-1" onClick={() => void handleBulkDelete()} disabled={bulkDeleting}>
                          {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Remove {selectedIds.size}
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setSelectedIds(new Set(videos.map((v) => v.id)))}>Select all</Button>
                    )}
                  </div>

                  {videos.map((v, idx) => {
                    const isSelected = selectedIds.has(v.id);
                    return (
                      <div
                        key={v.id}
                        className={`rounded-lg border p-3 space-y-2 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}
                      >
                        {editing === v.id ? (
                          <div className="space-y-2">
                            <input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title"
                              className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background outline-none" />
                            <input value={editForm.youtubeUrl} onChange={(e) => setEditForm((f) => ({ ...f, youtubeUrl: e.target.value }))} placeholder="YouTube URL"
                              className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background outline-none" />
                            <div className="flex gap-2">
                              <select value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                                className="flex-1 px-3 py-1.5 text-sm rounded border border-border bg-background outline-none">
                                {STARTER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                              </select>
                              <input value={editForm.thumbnailUrl} onChange={(e) => setEditForm((f) => ({ ...f, thumbnailUrl: e.target.value }))} placeholder="Thumbnail URL"
                                className="flex-1 px-3 py-1.5 text-sm rounded border border-border bg-background outline-none" />
                            </div>
                            <textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" rows={2}
                              className="w-full px-3 py-1.5 text-sm rounded border border-border bg-background outline-none resize-none" />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => void handleSaveEdit(v.id)}><Check className="w-3 h-3 mr-1" />Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => finishEdit()}><X className="w-3 h-3 mr-1" />Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={(e) => handleCardClick(idx, v.id, e.shiftKey)}
                              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40 hover:border-primary"}`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{v.title}</p>
                              <p className="text-xs text-muted-foreground">{v.category}</p>
                              <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                                <ExternalLink className="w-3 h-3" /> {v.youtube_url.slice(0, 50)}{v.youtube_url.length > 50 ? "…" : ""}
                              </a>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(v)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => void handleDelete(v.id)} disabled={deleting === v.id}>
                                {deleting === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* CARD PREVIEW — shows exactly what a new user sees */}
              {previewMode && (
                <div>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="text-xs text-muted-foreground">This is exactly what a new user's video library looks like on sign-up. Click cards to select, Shift+click to select a range.</p>
                    {selectedIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setSelectedIds(new Set()); setLastSelectedIdx(null); }}>Deselect all</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setSelectedIds(new Set(videos.map((v) => v.id)))}>Select all</Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs px-3 gap-1" onClick={() => void handleBulkDelete()} disabled={bulkDeleting}>
                          {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Remove {selectedIds.size}
                        </Button>
                      </div>
                    )}
                    {selectedIds.size === 0 && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setSelectedIds(new Set(videos.map((v) => v.id)))}>Select all</Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {videos.map((v, idx) => {
                      const isSelected = selectedIds.has(v.id);
                      const isEditing = editing === v.id;

                      // Inline edit form — replaces the card while editing
                      if (isEditing) {
                        return (
                          <div key={v.id} className="col-span-2 sm:col-span-3 lg:col-span-4 rounded-xl border border-primary bg-card p-4 space-y-3">
                            <p className="text-sm font-semibold">Editing: {v.title}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} placeholder="Title"
                                className="px-3 py-1.5 text-sm rounded border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30 sm:col-span-2" />
                              <input value={editForm.youtubeUrl} onChange={(e) => setEditForm((f) => ({ ...f, youtubeUrl: e.target.value }))} placeholder="YouTube URL"
                                className="px-3 py-1.5 text-sm rounded border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30 sm:col-span-2" />
                              <select value={editForm.category} onChange={(e) => setEditForm((f) => ({ ...f, category: e.target.value }))}
                                className="px-3 py-1.5 text-sm rounded border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30">
                                {STARTER_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                              </select>
                              <input value={editForm.thumbnailUrl} onChange={(e) => setEditForm((f) => ({ ...f, thumbnailUrl: e.target.value }))} placeholder="Thumbnail URL (optional)"
                                className="px-3 py-1.5 text-sm rounded border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                              <textarea value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description (optional)" rows={2}
                                className="sm:col-span-2 px-3 py-1.5 text-sm rounded border border-border bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => void handleSaveEdit(v.id)}><Check className="w-3 h-3 mr-1" />Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => finishEdit()}><X className="w-3 h-3 mr-1" />Cancel</Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={v.id}
                          className={`group relative rounded-xl overflow-hidden border bg-card flex flex-col cursor-pointer transition-all ${isSelected ? "border-primary ring-2 ring-primary/40" : "border-border"}`}
                          onClick={(e) => handleCardClick(idx, v.id, e.shiftKey)}
                        >
                          {/* Thumbnail */}
                          <div className="relative aspect-video bg-muted overflow-hidden">
                            {v.thumbnail_url ? (
                              <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="text-2xl opacity-30">🎬</span>
                              </div>
                            )}
                            {/* Selection circle */}
                            <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary opacity-100" : "bg-black/40 border-white/70 opacity-0 group-hover:opacity-100"}`}>
                              {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                            </div>
                            {/* Edit / Delete overlay (only when nothing selected) */}
                            {selectedIds.size === 0 && (
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(v); }}
                                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors" title="Edit">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); void handleDelete(v.id); }}
                                  disabled={deleting === v.id}
                                  className="p-1.5 rounded-lg bg-red-500/70 hover:bg-red-500/90 text-white transition-colors" title="Remove from pack">
                                  {deleting === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                              </div>
                            )}
                          </div>
                          {/* Card body */}
                          <div className="p-2 flex-1 flex flex-col gap-0.5">
                            <p className="text-xs font-medium leading-snug line-clamp-2">{v.title}</p>
                            <span className="text-[10px] text-muted-foreground">{v.category}</span>
                            <a href={v.youtube_url} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-primary hover:underline flex items-center gap-0.5 mt-auto">
                              <ExternalLink className="w-2.5 h-2.5" /> YouTube
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── TabHeadersManagement ───────────────────────────────────────────────────
// Manage the banner artwork at the top of each tab.
//
// Banners display through a 4:1 window, but the upload is stored at its own
// shape and the window is applied at render time. That has two consequences
// worth knowing: repositioning is a saved number rather than a re-crop, so it
// can be changed forever without re-uploading; and the whole picture survives,
// which is what lets a banner expand to show everything the window cuts.
//
// WebP encoding happens in the browser, so a 2MB PNG reaches storage as a few
// hundred KB. The server only ever stores a URL and an offset.
function TabHeadersManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { settings, headerSrc, cropOffset } = useTabHeaders();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingKeyRef = useRef<TabHeaderKey | null>(null);

  const [positioning, setPositioning] = useState<{ key: TabHeaderKey; src: string; offset: number } | null>(null);
  const [busyKey, setBusyKey] = useState<TabHeaderKey | null>(null);

  const patch = async (key: TabHeaderKey, body: Record<string, unknown>, okMessage: string) => {
    setBusyKey(key);
    try {
      const res = await fetch(`/api/admin/tab-headers/${key}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      await queryClient.invalidateQueries({ queryKey: TAB_HEADERS_QUERY_KEY });
      toast({ title: okMessage });
      return true;
    } catch (err) {
      toast({ title: "Couldn't update that header", description: (err as Error).message, variant: "destructive" });
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const key = pendingKeyRef.current;
    e.target.value = "";
    if (!file || !key) return;
    setBusyKey(key);
    try {
      const img = await loadImageFromFile(file);
      const blob = await encodeBannerSource(img);
      const url = await uploadFile(new File([blob], `${key}-header.webp`, { type: "image/webp" }));
      setBusyKey(null);
      const saved = await patch(key, { imageUrl: url, cropOffset: 0.5 }, "Header uploaded");
      // Straight into positioning: a fresh upload is centred, which is rarely
      // where you want a 4:1 band to sit on a 16:9 picture.
      if (saved) setPositioning({ key, src: url, offset: 0.5 });
    } catch (err) {
      setBusyKey(null);
      toast({ title: "Couldn't read that image", description: (err as Error).message, variant: "destructive" });
    }
  };

  const revert = async (key: TabHeaderKey) => {
    setBusyKey(key);
    try {
      const res = await fetch(`/api/admin/tab-headers/${key}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Remove failed");
      await queryClient.invalidateQueries({ queryKey: TAB_HEADERS_QUERY_KEY });
      toast({ title: "Reverted to the built-in header" });
    } catch (err) {
      toast({ title: "Couldn't remove that header", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="mt-8 bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-muted flex-wrap">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 shrink-0 group focus:outline-none">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Tab Headers</h2>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="divide-y divide-border">
          <p className="px-5 py-3 text-xs text-muted-foreground">
            Banners show through a 4:1 window. Use Position to choose which part of the picture that window sits over —
            it can be changed any time without re-uploading. Visitors can click a banner to see the whole image.
          </p>

          {TAB_HEADERS.map((tab) => {
            const setting = settings[tab.key];
            const custom = setting?.imageUrl ?? null;
            const visible = setting?.visible !== false;
            const src = headerSrc(tab.key);
            const busy = busyKey === tab.key;
            return (
              <div key={tab.key} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                <div className={`w-40 shrink-0 aspect-[4/1] rounded-md overflow-hidden border border-border bg-background ${visible ? "" : "opacity-30"}`}>
                  {src
                    ? <img src={src} alt="" className="w-full h-full object-cover"
                           style={{ objectPosition: `50% ${cropOffset(tab.key) * 100}%` }} />
                    : <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">No image</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{tab.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {!visible ? "Hidden" : custom ? "Custom" : src ? "Built-in default" : "No header yet"}
                  </p>
                  {/* Only sections whose artwork suits the whole area carry a
                      spanLabel, so the choice appears where it means something
                      rather than on every row. */}
                  {"spanLabel" in tab && (
                    <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        className="accent-primary cursor-pointer"
                        checked={setting?.spanAll === true}
                        disabled={busy}
                        onChange={(e) => void patch(tab.key, { spanAll: e.target.checked },
                          e.target.checked ? "Showing on all tabs" : "Showing on its own tab only")}
                      />
                      {tab.spanLabel}
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="ghost" disabled={busy}
                          onClick={() => void patch(tab.key, { visible: !visible }, visible ? "Header hidden" : "Header shown")}>
                    {visible ? <><EyeOff className="w-3.5 h-3.5" /><span className="ml-1.5">Hide</span></>
                             : <><Eye className="w-3.5 h-3.5" /><span className="ml-1.5">Show</span></>}
                  </Button>
                  {src && (
                    <Button size="sm" variant="ghost" disabled={busy}
                            onClick={() => setPositioning({ key: tab.key, src, offset: cropOffset(tab.key) })}>
                      <SlidersHorizontal className="w-3.5 h-3.5" /><span className="ml-1.5">Position</span>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy}
                          onClick={() => { pendingKeyRef.current = tab.key; fileInputRef.current?.click(); }}>
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span className="ml-1.5">{custom ? "Replace" : "Upload"}</span>
                  </Button>
                  {custom && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revert(tab.key)}>
                      Revert
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFileChosen(e)} />

      {positioning && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6" onClick={() => setPositioning(null)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="text-sm font-semibold">Position the banner</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Slide to choose which band of the picture the 4:1 window sits over. Nothing is discarded —
                the full image is kept, and visitors can click the banner to see all of it.
              </p>
            </div>

            {/* Same object-position the tab itself uses, so the preview can't
                drift from what actually renders. */}
            <div className="w-full aspect-[4/1] overflow-hidden rounded-lg border border-border bg-background">
              <img src={positioning.src} alt="" className="w-full h-full object-cover"
                   style={{ objectPosition: `50% ${positioning.offset * 100}%` }} />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground shrink-0">Top</span>
              <input type="range" min={0} max={1} step={0.01} value={positioning.offset}
                     onChange={(e) => setPositioning((p) => p && { ...p, offset: Number(e.target.value) })}
                     className="flex-1 accent-primary" />
              <span className="text-xs text-muted-foreground shrink-0">Bottom</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setPositioning(null)}>Cancel</Button>
              <Button size="sm" disabled={busyKey === positioning.key}
                      onClick={async () => {
                        const ok = await patch(positioning.key, { cropOffset: positioning.offset }, "Position saved");
                        if (ok) setPositioning(null);
                      }}>
                {busyKey === positioning.key ? "Saving…" : "Save position"}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}


export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [openUsers, setOpenUsers] = useState(false);

  if (user && !user.isAdmin) {
    setLocation("/");
    return null;
  }

  const isExec = user?.role === "admin_exec";
  const { data, isLoading: usersLoading } = useAdminListUsers();
  const { data: ranks = [], isLoading: ranksLoading } = useRanks();

  const deleteUser = useAdminDeleteUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User deleted" });
        void queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
        setConfirmDelete(null);
      },
      onError: (err) => {
        toast({ title: "Error", description: (err as Error).message ?? "Failed to delete user.", variant: "destructive" });
        setConfirmDelete(null);
      },
    },
  });

  const toggleAffiliate = useMutation({
    mutationFn: async ({ userId, excluded }: { userId: string; excluded: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}/affiliate-excluded`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded }),
      });
      if (!res.ok) throw new Error("Failed to update affiliate status");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not update affiliate status.", variant: "destructive" });
    },
  });

  const users = data?.users ?? [];
  const isLoading = authLoading || usersLoading || ranksLoading;
  const perms = getPermissions(user?.role, ranks);
  const hasAnyAccess = isExec || (Object.values(perms) as boolean[]).some(Boolean);

  // musicCount and affiliateExcluded are added by the query but not in the generated
  // AdminUser type — extend it locally.
  type AdminUserExtended = typeof users[0] & { musicCount: number; affiliateExcluded: boolean };
  const usersExt = users as AdminUserExtended[];

  type SortCol = "user" | "joined" | "content" | "rank";
  type SortDir = "asc" | "desc";
  const [sortCol, setSortCol] = useState<SortCol>("joined");
  const [sortDir, setSortDir] = useState<SortDir>("desc"); // newest first by default

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "joined" || col === "content" ? "desc" : "asc");
    }
  };

  const sortedUsers = useMemo(() => {
    return [...usersExt].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "user": {
          const na = [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email || "";
          const nb = [b.firstName, b.lastName].filter(Boolean).join(" ") || b.email || "";
          cmp = na.localeCompare(nb);
          break;
        }
        case "joined":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "content":
          cmp = (a.videoCount + a.photoCount + (a.musicCount ?? 0))
              - (b.videoCount + b.photoCount + (b.musicCount ?? 0));
          break;
        case "rank":
          cmp = (a.role ?? "").localeCompare(b.role ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [usersExt, sortCol, sortDir]);

  // Render a clickable column header with sort indicator
  const sortTh = (col: SortCol, label: string, className = "") => {
    const active = sortCol === col;
    const Icon = active && sortDir === "asc" ? ChevronUp : ChevronDown;
    return (
      <th
        className={`px-4 py-3 font-semibold cursor-pointer select-none transition-colors ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        } ${className}`}
        onClick={() => handleSort(col)}
      >
        <span className="inline-flex items-center gap-0.5">
          {label}
          <Icon className={`w-3.5 h-3.5 shrink-0 transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
        </span>
      </th>
    );
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <ShieldCheck className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">
              {isExec ? "Full management access" : "Limited access — contact an Executive Admin to adjust your permissions"}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* No access state */}
            {!hasAnyAccess && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ShieldAlert className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="font-medium text-muted-foreground">No permissions assigned</p>
                <p className="text-sm text-muted-foreground/70 mt-1 max-w-xs">
                  An Executive Admin needs to configure permissions for your rank before you can access admin features.
                </p>
              </div>
            )}

            {/* User list */}
            {perms.view_users && (
              <div className="border border-border rounded-xl" style={{ overflow: "clip" }}>
                <button
                  onClick={() => setOpenUsers((o) => !o)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-muted border-b border-border"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-semibold">Users ({users.length})</h2>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${openUsers ? "rotate-180" : ""}`} />
                </button>
                {openUsers && (
                <div className="overflow-y-auto max-h-[325px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-muted group">
                        {sortTh("user",    "User",    "text-left rounded-tl-xl")}
                        {sortTh("joined",  "Joined",  "text-left")}
                        {sortTh("content", "Content", "text-right")}
                        {sortTh("rank",    "Rank",    "text-center")}
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground rounded-tr-xl" />
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No users found.</td>
                        </tr>
                      )}
                      {sortedUsers.map((u) => {
                        const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || u.id;
                        const isMe = u.id === user?.id;
                        const isPendingDelete = deleteUser.isPending && deleteUser.variables?.userId === u.id;
                        const role = u.role ?? "user";

                        return (
                          <tr key={u.id} className="group border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {u.profileImageUrl ? (
                                  <img src={u.profileImageUrl} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                                    <User className="w-4 h-4 text-primary" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium truncate">{name}</span>
                                    {isMe && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">You</span>}
                                  </div>
                                  {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {new Date(u.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {(() => {
                                const mc = (u as AdminUserExtended).musicCount ?? 0;
                                const total = u.videoCount + u.photoCount + mc;
                                return (
                                  <div>
                                    <div className="tabular-nums font-medium">{total.toLocaleString()}</div>
                                    <div className="text-[10px] text-muted-foreground/60 group-hover:text-muted-foreground transition-colors whitespace-nowrap mt-0.5">
                                      {u.videoCount}v · {u.photoCount}p · {mc}m
                                    </div>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <RoleDropdown
                                userId={u.id}
                                current={role}
                                isMe={isMe}
                                canEdit={isExec || perms.change_ranks}
                                ranks={ranks}
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isExec && (
                                  <button
                                    title={(u as AdminUserExtended).affiliateExcluded ? "Affiliate excluded — click to re-enable" : "Click to exclude from affiliate links (family/friends)"}
                                    onClick={() => toggleAffiliate.mutate({ userId: u.id, excluded: !(u as AdminUserExtended).affiliateExcluded })}
                                    className={`h-7 px-2 rounded text-xs font-medium border transition-colors ${(u as AdminUserExtended).affiliateExcluded ? "bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30" : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"}`}
                                  >
                                    {(u as AdminUserExtended).affiliateExcluded ? "No Affiliate" : "Affiliate OK"}
                                  </button>
                                )}
                              {!isMe && (isExec || perms.delete_users) && (
                                confirmDelete === u.id ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                                    <span className="text-xs text-destructive font-medium">Delete all data?</span>
                                    <Button size="sm" variant="destructive" className="h-7 text-xs px-2" disabled={isPendingDelete} onClick={() => deleteUser.mutate({ userId: u.id })}>
                                      {isPendingDelete ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(u.id)}>
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )
                              )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}

            {/* Vault built-in sources — any admin */}
            <VaultBuiltInsManagement />

            {/* Featured Films (Discover tab) — exec only */}
            {isExec && <FeaturedFilmsManagement />}

            {/* New User Starter Pack — exec only */}
            {isExec && <StarterPackManagement />}

            {/* Help articles — gated by the Manage Help Articles permission */}
            {(isExec || perms.manage_help) && <HelpArticlesManagement />}

            {/* Tab headers — gated by the Manage Tab Headers permission */}
            {(isExec || perms.manage_headers) && <TabHeadersManagement />}

            {/* Rank management — exec only */}
            {isExec && <RankManagement />}

            {/* Diagnostics — exec only */}
            {isExec && <DiagnosticsPanel />}

            {/* Send message */}
            {perms.send_messages && (
              <ComposePanel
                users={users.map((u) => ({ id: u.id, email: u.email ?? null, firstName: u.firstName ?? null, lastName: u.lastName ?? null, role: u.role ?? "user" }))}
                ranks={ranks}
              />
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
