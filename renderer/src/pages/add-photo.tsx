import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { compressAndUploadPhoto, uploadEpub, uploadAudio } from "@/lib/upload";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCreatePhoto,
  useGetPhotoStats,
  getListPhotosQueryKey,
  getGetPhotoStatsQueryKey,
  createPhoto,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import {
  ImageIcon,
  Plus,
  Loader2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Upload,
  Clipboard,
  Images,
  X,
  CheckCircle,
  XCircle,
  ArrowRight,
  FolderOpen,
  BookOpen,
  Music,
  ChevronDown,
  Cloud,
} from "lucide-react";
import { useImageUrlWarning } from "@/hooks/use-image-url-warning";

function CategorySelect({ value, onChange, categories }: { value: string; onChange: (val: string) => void; categories: string[] }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allCategories = [...categories, ...localCategories.filter((c) => !categories.includes(c))];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const confirm = () => {
    const name = draft.trim();
    if (!name) return;
    if (!allCategories.includes(name)) setLocalCategories((prev) => [...prev, name]);
    onChange(name);
    setCreating(false);
    setDraft("");
  };

  const cancel = () => { setCreating(false); setDraft(""); };

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          placeholder="New category name…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirm(); } if (e.key === "Escape") cancel(); }}
        />
        <Button type="button" size="sm" onClick={confirm} disabled={!draft.trim()}>Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <span className={value && allCategories.includes(value) ? "text-foreground" : "text-muted-foreground"}>
          {value && allCategories.includes(value) ? value : "Select a category…"}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {allCategories.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">No categories yet</p>
            ) : (
              allCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`w-full flex items-center px-3 py-2 text-sm hover:bg-accent transition-colors text-left ${cat === value ? "bg-accent font-medium" : ""}`}
                  onClick={() => { onChange(cat); setOpen(false); }}
                >
                  {cat}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border" />
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left text-primary font-medium"
            onClick={() => { setOpen(false); setCreating(true); }}
          >
            <Plus className="w-4 h-4 shrink-0" />
            Create New Category
          </button>
        </div>
      )}
    </div>
  );
}

const formSchema = z.object({
  imageUrl: z.string().min(1, "Image URL is required")
    .refine(
      (v) => !v.startsWith("data:"),
      "Data URLs are not supported — please use the file picker or paste an image instead."
    )
    .refine(
      (v) =>
        v.startsWith("/api/storage/") ||
        (() => { try { new URL(v); return true; } catch { return false; } })(),
      "Must be a valid URL or uploaded image"
    ),
  sourceUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function cleanFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-\.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

type BulkItemStatus = "pending" | "uploading" | "done" | "error";

interface BulkItem {
  id: string;
  file: File;
  dataUrl: string;
  title: string;
  status: BulkItemStatus;
  errorMsg?: string;
}

function BulkImportTab({ existingCategories }: { existingCategories: string[] }) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [items, setItems] = useState<BulkItem[]>([]);
  const [category, setCategory] = useState<string>(
    settings.defaultCategoryNewlyAdded ? "Newly Added" : ""
  );
  const [importing, setImporting] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [allDone, setAllDone] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const newItems: BulkItem[] = imageFiles.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      dataUrl: URL.createObjectURL(file),
      title: cleanFilename(file.name),
      status: "pending" as BulkItemStatus,
    }));
    setItems((prev) => [...prev, ...newItems]);
    setAllDone(false);
    setDoneCount(0);
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await addFiles(files);
    e.target.value = "";
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    await addFiles(files);
  }, [addFiles]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateTitle = useCallback((id: string, title: string) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, title } : item));
  }, []);

  const startImport = useCallback(async () => {
    if (!category) {
      toast({ title: "Please select a category first", variant: "destructive" });
      return;
    }
    const pending = items.filter((i) => i.status === "pending" || i.status === "error");
    if (!pending.length) return;

    setImporting(true);
    setDoneCount(0);
    let successCount = 0;

    for (const item of pending) {
      setItems((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, status: "uploading" } : i)
      );
      try {
        const { imageUrl: storageUrl, thumbnailUrl } = await compressAndUploadPhoto(item.file);
        await createPhoto({ imageUrl: storageUrl, thumbnailUrl, title: item.title, category });
        setItems((prev) =>
          prev.map((i) => i.id === item.id ? { ...i, status: "done" } : i)
        );
        successCount++;
      } catch {
        setItems((prev) =>
          prev.map((i) => i.id === item.id ? { ...i, status: "error", errorMsg: "Upload failed" } : i)
        );
      }
      setDoneCount((c) => c + 1);
    }

    setImporting(false);
    setAllDone(true);
    queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });

    const failCount = pending.length - successCount;
    if (failCount === 0) {
      toast({
        title: `${successCount} photo${successCount !== 1 ? "s" : ""} imported`,
        description: "Your photos have been added to the library.",
        duration: 4000,
      });
    } else {
      toast({
        title: `${successCount} imported, ${failCount} failed`,
        description: "Some photos couldn't be saved. You can retry the failed ones.",
        variant: "destructive",
        duration: 5000,
      });
    }
  }, [items, category, queryClient, toast]);

  const clearAll = useCallback(() => {
    setItems([]);
    setAllDone(false);
    setDoneCount(0);
  }, []);

  const retryFailed = useCallback(() => {
    setItems((prev) => prev.map((i) => i.status === "error" ? { ...i, status: "pending", errorMsg: undefined } : i));
    setAllDone(false);
    setDoneCount(0);
  }, []);

  const pendingItems = items.filter((i) => i.status === "pending" || i.status === "error");
  const totalItems = items.length;
  const progressPct = totalItems > 0 ? Math.round((doneCount / pendingItems.length + (items.filter(i => i.status === "done").length / totalItems) * 0) * 100) : 0;
  const importedCount = items.filter((i) => i.status === "done").length;
  const failedCount = items.filter((i) => i.status === "error").length;

  const uploadProgress = importing && pendingItems.length > 0
    ? Math.round((doneCount / (pendingItems.length + doneCount - doneCount)) * 100)
    : 0;

  const currentDone = items.filter((i) => i.status === "done").length;
  const currentUploading = items.filter((i) => i.status === "uploading").length;
  const uploadProgressValue = importing
    ? Math.round(((currentDone + currentUploading * 0.5) / totalItems) * 100)
    : allDone ? 100 : 0;

  if (items.length === 0) {
    return (
      <div
        className={`rounded-xl border-2 border-dashed transition-colors ${
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-border/80 hover:bg-accent/30"
        } p-12 flex flex-col items-center gap-4 cursor-pointer`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className={`p-4 rounded-full transition-colors ${isDragOver ? "bg-primary/10" : "bg-muted"}`}>
          <Images className={`h-10 w-10 transition-colors ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-base">
            {isDragOver ? "Drop images here" : "Drag & drop images here"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse from your device
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Supports JPG, PNG, GIF, WebP and other image formats
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-2 gap-2">
          <FolderOpen className="h-4 w-4" />
          Choose Files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Batch controls */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium block mb-1.5">Category for all photos</label>
            <CategorySelect
              value={category}
              onChange={setCategory}
              categories={existingCategories}
            />
          </div>
          <div className="flex gap-2 sm:mt-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add More
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={importing}
              className="text-muted-foreground"
            >
              Clear All
            </Button>
          </div>
        </div>

        {/* Progress bar (while importing) */}
        {(importing || allDone) && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              {importing ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading {currentDone + 1} of {totalItems}…
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {importedCount} imported{failedCount > 0 ? `, ${failedCount} failed` : ""}
                </span>
              )}
              <span>{uploadProgressValue}%</span>
            </div>
            <Progress value={allDone ? 100 : uploadProgressValue} className="h-1.5" />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          {!allDone && (
            <Button
              type="button"
              disabled={importing || !category || pendingItems.length === 0}
              onClick={startImport}
              className="gap-2"
            >
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Importing…</>
              ) : (
                <><Upload className="h-4 w-4" />Import {pendingItems.length} Photo{pendingItems.length !== 1 ? "s" : ""}</>
              )}
            </Button>
          )}
          {allDone && failedCount > 0 && (
            <Button type="button" variant="outline" onClick={retryFailed} className="gap-2">
              Retry {failedCount} Failed
            </Button>
          )}
          {allDone && importedCount > 0 && (
            <Button type="button" onClick={() => setLocation("/photos")} className="gap-2">
              Go to Photos
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Preview grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className={`relative rounded-lg overflow-hidden border transition-all ${
              item.status === "done"
                ? "border-green-500/50 opacity-75"
                : item.status === "error"
                ? "border-destructive/50"
                : item.status === "uploading"
                ? "border-primary/50 ring-1 ring-primary/30"
                : "border-border"
            }`}
          >
            {/* Thumbnail */}
            <div className="aspect-square bg-muted overflow-hidden">
              <img
                src={item.dataUrl}
                alt={item.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Status overlay */}
            {item.status === "done" && (
              <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-500 drop-shadow" />
              </div>
            )}
            {item.status === "uploading" && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-primary drop-shadow" />
              </div>
            )}
            {item.status === "error" && (
              <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
                <XCircle className="h-8 w-8 text-destructive drop-shadow" />
              </div>
            )}

            {/* Remove button (only when not importing) */}
            {!importing && item.status !== "done" && (
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="absolute top-1 right-1 p-0.5 rounded-full bg-background/80 hover:bg-background border border-border/50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Title input */}
            <div className="p-1.5">
              <input
                type="text"
                value={item.title}
                onChange={(e) => updateTitle(item.id, e.target.value)}
                disabled={importing || item.status === "done"}
                className="w-full text-[11px] bg-transparent border-0 border-b border-border/40 focus:border-primary focus:outline-none px-0.5 py-0.5 leading-tight disabled:opacity-60 truncate"
                placeholder="Title…"
              />
            </div>
          </div>
        ))}

        {/* Add more tile */}
        {!importing && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-border/60 hover:bg-accent/20 flex flex-col items-center justify-center gap-1.5 text-muted-foreground transition-colors"
            style={{ minHeight: 0 }}
          >
            <Plus className="h-6 w-6" />
            <span className="text-[11px]">Add more</span>
          </button>
        )}
      </div>
    </div>
  );
}

declare global {
  interface Window {
    gapi: any;
    google: any;
    Dropbox: any;
  }
}

function loadGooglePickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.gapi?.load) { resolve(); return; }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google API script"));
    document.head.appendChild(script);
  });
}

function loadPickerLibrary(): Promise<void> {
  return new Promise((resolve) => {
    window.gapi.load("picker", { callback: () => resolve() });
  });
}

function GoogleDriveTab({ existingCategories }: { existingCategories: string[] }) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [status, setStatus] = useState<{ loading: boolean; connected: boolean; email: string | null }>({
    loading: true, connected: false, email: null,
  });
  const [category, setCategory] = useState<string>(
    settings.defaultCategoryNewlyAdded ? "Newly Added" : ""
  );
  const [pickerOpening, setPickerOpening] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastImportCount, setLastImportCount] = useState<number | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/google-drive/status");
      const data = await res.json();
      setStatus({ loading: false, connected: !!data.connected, email: data.email ?? null });
    } catch {
      setStatus({ loading: false, connected: false, email: null });
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  // Handle the redirect back from Google's consent screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("googleDrive");
    if (!result) return;
    if (result === "connected") {
      toast({ title: "Google Drive connected", duration: 3000 });
      void refreshStatus();
    } else if (result === "error") {
      toast({ title: "Couldn't connect Google Drive", description: "Please try again.", variant: "destructive" });
    }
    params.delete("googleDrive");
    const newSearch = params.toString();
    setLocation(`/add-photo${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = useCallback(async () => {
    await fetch("/api/integrations/google-drive", { method: "DELETE" });
    setStatus({ loading: false, connected: false, email: null });
    toast({ title: "Google Drive disconnected" });
  }, [toast]);

  const openPicker = useCallback(async () => {
    if (!category) {
      toast({ title: "Please select a category first", variant: "destructive" });
      return;
    }
    setPickerOpening(true);
    try {
      const configRes = await fetch("/api/integrations/google-drive/picker-config");
      if (!configRes.ok) throw new Error("config failed");
      const config: { apiKey: string; appId: string; accessToken: string } = await configRes.json();

      await loadGooglePickerScript();
      await loadPickerLibrary();

      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS_IMAGES)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(config.accessToken)
        .setDeveloperKey(config.apiKey)
        .setAppId(config.appId)
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setCallback(async (data: any) => {
          if (data.action !== window.google.picker.Action.PICKED) return;
          const files = (data.docs as Array<{ id: string; name: string }>).map((doc) => ({ id: doc.id, name: doc.name }));
          setImporting(true);
          try {
            const res = await fetch("/api/integrations/google-drive/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ files, category }),
            });
            const result: { results: { id: string; ok: boolean }[] } = await res.json();
            const successCount = result.results.filter((r) => r.ok).length;
            const failCount = result.results.length - successCount;
            setLastImportCount(successCount);
            queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
            if (failCount === 0) {
              toast({ title: `${successCount} photo${successCount !== 1 ? "s" : ""} imported`, duration: 4000 });
            } else {
              toast({ title: `${successCount} imported, ${failCount} failed`, variant: "destructive" });
            }
          } catch {
            toast({ title: "Import failed", variant: "destructive" });
          } finally {
            setImporting(false);
          }
        })
        .build();
      picker.setVisible(true);
    } catch {
      toast({ title: "Couldn't open Google Drive picker", variant: "destructive" });
    } finally {
      setPickerOpening(false);
    }
  }, [category, queryClient, toast]);

  if (status.loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-12 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-muted">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-base">Connect your Google Drive</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Pick specific photos to add to your Vault — URLinc only sees the photos you choose, not your whole Drive.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => { window.location.href = "/api/integrations/google-drive/connect"; }}
          className="gap-2 mt-2"
        >
          Connect Google Drive
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Connected{status.email ? ` as ${status.email}` : ""}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={handleDisconnect} className="text-muted-foreground">
            Disconnect
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium block mb-1.5">Category for imported photos</label>
            <CategorySelect value={category} onChange={setCategory} categories={existingCategories} />
          </div>
          <Button
            type="button"
            onClick={openPicker}
            disabled={pickerOpening || importing || !category}
            className="gap-2 sm:mt-5"
          >
            {pickerOpening || importing ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{importing ? "Importing…" : "Opening…"}</>
            ) : (
              <><Images className="h-4 w-4" />Pick Photos from Drive</>
            )}
          </Button>
        </div>
        {lastImportCount !== null && (
          <p className="flex items-center gap-1.5 text-xs text-green-500">
            <CheckCircle className="h-3.5 w-3.5" />
            {lastImportCount} photo{lastImportCount !== 1 ? "s" : ""} imported so far this session
          </p>
        )}
      </div>
    </div>
  );
}

function loadDropboxChooserScript(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Dropbox) { resolve(); return; }
    const script = document.createElement("script");
    script.id = "dropboxjs";
    script.setAttribute("data-app-key", appKey);
    script.src = "https://www.dropbox.com/static/api/2/dropins.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Dropbox Chooser script"));
    document.head.appendChild(script);
  });
}

function DropboxTab({ existingCategories }: { existingCategories: string[] }) {
  const { toast } = useToast();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [status, setStatus] = useState<{ loading: boolean; connected: boolean; email: string | null }>({
    loading: true, connected: false, email: null,
  });
  const [category, setCategory] = useState<string>(
    settings.defaultCategoryNewlyAdded ? "Newly Added" : ""
  );
  const [chooserOpening, setChooserOpening] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastImportCount, setLastImportCount] = useState<number | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/dropbox/status");
      const data = await res.json();
      setStatus({ loading: false, connected: !!data.connected, email: data.email ?? null });
    } catch {
      setStatus({ loading: false, connected: false, email: null });
    }
  }, []);

  useEffect(() => { void refreshStatus(); }, [refreshStatus]);

  // Handle the redirect back from Dropbox's consent screen
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("dropbox");
    if (!result) return;
    if (result === "connected") {
      toast({ title: "Dropbox connected", duration: 3000 });
      void refreshStatus();
    } else if (result === "error") {
      toast({ title: "Couldn't connect Dropbox", description: "Please try again.", variant: "destructive" });
    }
    params.delete("dropbox");
    const newSearch = params.toString();
    setLocation(`/add-photo${newSearch ? `?${newSearch}` : ""}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDisconnect = useCallback(async () => {
    await fetch("/api/integrations/dropbox", { method: "DELETE" });
    setStatus({ loading: false, connected: false, email: null });
    toast({ title: "Dropbox disconnected" });
  }, [toast]);

  const openChooser = useCallback(async () => {
    if (!category) {
      toast({ title: "Please select a category first", variant: "destructive" });
      return;
    }
    setChooserOpening(true);
    try {
      const configRes = await fetch("/api/integrations/dropbox/config");
      if (!configRes.ok) throw new Error("config failed");
      const config: { appKey: string } = await configRes.json();
      await loadDropboxChooserScript(config.appKey);

      window.Dropbox.choose({
        success: async (files: Array<{ id: string; link: string; name: string }>) => {
          setImporting(true);
          let successCount = 0;
          for (const file of files) {
            try {
              await createPhoto({
                imageUrl: `/api/integrations/dropbox/image/${encodeURIComponent(file.id)}`,
                // NOT file.link -- that's a raw Dropbox-hosted link (their
                // Chooser widget's own temporary/direct URL), which expires
                // on Dropbox's own schedule independent of anything we do,
                // causing a 403 days or weeks later even though the photo
                // itself is still perfectly viewable through imageUrl above
                // (our own proxy, which refreshes the access token as
                // needed). Leaving sourceUrl unset makes clicking the photo
                // go to our own durable /photo/:id page instead of an
                // external link that can silently go stale.
                title: file.name.replace(/\.[^.]+$/, ""),
                category,
                description: "Imported from Dropbox",
              });
              successCount++;
            } catch { /* counted below via files.length - successCount */ }
          }
          const failCount = files.length - successCount;
          setLastImportCount(successCount);
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
          if (failCount === 0) {
            toast({ title: `${successCount} photo${successCount !== 1 ? "s" : ""} imported`, duration: 4000 });
          } else {
            toast({ title: `${successCount} imported, ${failCount} failed`, variant: "destructive" });
          }
          setImporting(false);
        },
        cancel: () => {},
        linkType: "direct",
        multiselect: true,
        extensions: ["images"],
      });
    } catch {
      toast({ title: "Couldn't open Dropbox picker", variant: "destructive" });
    } finally {
      setChooserOpening(false);
    }
  }, [category, queryClient, toast]);

  if (status.loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-12 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-muted">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-base">Connect your Dropbox</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Pick specific photos to add to your Vault — URLinc only sees the photos you choose, not your whole Dropbox.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => { window.location.href = "/api/integrations/dropbox/oauth-connect"; }}
          className="gap-2 mt-2"
        >
          Connect Dropbox
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Connected{status.email ? ` as ${status.email}` : ""}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={handleDisconnect} className="text-muted-foreground">
            Disconnect
          </Button>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium block mb-1.5">Category for imported photos</label>
            <CategorySelect value={category} onChange={setCategory} categories={existingCategories} />
          </div>
          <Button
            type="button"
            onClick={openChooser}
            disabled={chooserOpening || importing || !category}
            className="gap-2 sm:mt-5"
          >
            {chooserOpening || importing ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{importing ? "Importing…" : "Opening…"}</>
            ) : (
              <><Images className="h-4 w-4" />Pick Photos from Dropbox</>
            )}
          </Button>
        </div>
        {lastImportCount !== null && (
          <p className="flex items-center gap-1.5 text-xs text-green-500">
            <CheckCircle className="h-3.5 w-3.5" />
            {lastImportCount} photo{lastImportCount !== 1 ? "s" : ""} imported so far this session
          </p>
        )}
      </div>
    </div>
  );
}

export function AddPhoto() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const createPhotoMutation = useCreatePhoto();
  const { data: stats } = useGetPhotoStats();
  const existingCategories = (() => {
    const pinnedPhotoCats: string[] = (() => {
      try { return JSON.parse(localStorage.getItem("vvm_pinned_photo_cats") ?? "[]") as string[]; }
      catch { return []; }
    })();
    const cats = stats
      ? [...stats.byCategory].sort((a, b) => a.category.localeCompare(b.category)).map((c) => c.category)
      : [];
    const merged = [...new Set([...cats, ...pinnedPhotoCats])].sort();
    if (settings.defaultCategoryNewlyAdded && !merged.includes("Newly Added")) {
      return ["Newly Added", ...merged];
    }
    return merged;
  })();
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [prefetching, setPrefetching] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [epubUrl, setEpubUrl] = useState<string | null>(null);
  const [uploadingEpub, setUploadingEpub] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const epubInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // Stores the thumbnail URL generated when a file is uploaded, so it can be included in the form submission
  const uploadedThumbnailUrl = useRef<string | undefined>(undefined);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      imageUrl: "",
      sourceUrl: "",
      title: "",
      category: settings.defaultCategoryNewlyAdded ? "Newly Added" : "",
      description: "",
    },
  });

  const watchUrl = form.watch("imageUrl");
  const watchSourceUrl = form.watch("sourceUrl");
  const watchCategory = form.watch("category");
  const { state: urlWarningState } = useImageUrlWarning(watchUrl);

  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [watchUrl]);

  useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            setUploadingFile(true);
            void compressAndUploadPhoto(file)
              .then(({ imageUrl: storageUrl, thumbnailUrl }) => {
                form.setValue("imageUrl", storageUrl, { shouldValidate: true });
                uploadedThumbnailUrl.current = thumbnailUrl;
                setAutoFilled(false);
                toast({ title: "Image pasted" });
              })
              .catch(() => toast({ title: "Failed to upload image", variant: "destructive" }))
              .finally(() => setUploadingFile(false));
          }
          return;
        }
      }
    };
    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [form, toast]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setAutoFilled(false);

    if (!watchSourceUrl) return;
    try { new URL(watchSourceUrl); } catch { return; }

    debounceRef.current = setTimeout(async () => {
      setPrefetching(true);
      try {
        const res = await fetch(`/api/photos/prefetch?url=${encodeURIComponent(watchSourceUrl)}`);
        if (!res.ok) return;
        const data: { imageUrl: string | null; title: string | null; description: string | null } = await res.json();

        let filled = false;
        if (data.imageUrl && !form.getValues("imageUrl")) {
          form.setValue("imageUrl", data.imageUrl, { shouldValidate: true });
          filled = true;
        }
        if (data.title && !form.getValues("title")) {
          form.setValue("title", data.title, { shouldValidate: true });
          filled = true;
        }
        if (data.description && !form.getValues("description")) {
          form.setValue("description", data.description, { shouldValidate: true });
          filled = true;
        }
        if (filled) setAutoFilled(true);
      } catch {
        // silently ignore
      } finally {
        setPrefetching(false);
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [watchSourceUrl]);

  const isValidUrl = !watchUrl.startsWith("data:") && (watchUrl.startsWith("/api/storage/") || (() => {
    try { new URL(watchUrl); return true; } catch { return false; }
  })());

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const { imageUrl: storageUrl, thumbnailUrl } = await compressAndUploadPhoto(file);
      form.setValue("imageUrl", storageUrl, { shouldValidate: true });
      uploadedThumbnailUrl.current = thumbnailUrl;
      setAutoFilled(false);
    } catch {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
    e.target.value = "";
  }, [form, toast]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          setUploadingFile(true);
          try {
            const { imageUrl: storageUrl, thumbnailUrl } = await compressAndUploadPhoto(new File([blob], "pasted.jpg", { type: imageType }));
            form.setValue("imageUrl", storageUrl, { shouldValidate: true });
            uploadedThumbnailUrl.current = thumbnailUrl;
            setAutoFilled(false);
          } finally {
            setUploadingFile(false);
          }
          return;
        }
      }
      toast({ title: "No image found in clipboard", variant: "destructive" });
    } catch (err) {
      setUploadingFile(false);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast({ title: "Press Ctrl+V to paste your image", description: "Click anywhere on this page (not in a text field), then press Ctrl+V." });
      } else {
        toast({ title: "No image found in clipboard", variant: "destructive" });
      }
    }
  }, [form, toast]);

  const handleEpubFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingEpub(true);
    try {
      const url = await uploadEpub(file);
      setEpubUrl(url);
      toast({ title: "EPUB uploaded", duration: 2000 });
    } catch {
      toast({ title: "Failed to upload EPUB", variant: "destructive" });
    } finally {
      setUploadingEpub(false);
    }
    e.target.value = "";
  }, [toast]);

  const handleAudioFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAudio(true);
    try {
      const url = await uploadAudio(file);
      setAudioUrl(url);
      toast({ title: "Audio uploaded", duration: 2000 });
    } catch {
      toast({ title: "Failed to upload audio", variant: "destructive" });
    } finally {
      setUploadingAudio(false);
    }
    e.target.value = "";
  }, [toast]);

  const onSubmit = (data: FormValues) => {
    createPhotoMutation.mutate(
      { data: { ...data, thumbnailUrl: uploadedThumbnailUrl.current, sourceUrl: data.sourceUrl || undefined, epubUrl: epubUrl ?? undefined, audioUrl: audioUrl ?? undefined } },
      {
        onSuccess: (photo) => {
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
          toast({ title: "Photo added", description: "Your photo has been added to the library.", duration: 2000 });
          form.reset();
          setEpubUrl(null);
          setAudioUrl(null);
          setLocation(`/photo/${photo.id}`);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to add photo. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold">Add Photo</h1>
          <p className="text-muted-foreground mt-2">
            Add a single photo from a URL, or import multiple photos from your device at once.
          </p>
        </div>

        <Tabs defaultValue="single">
          <TabsList className="mb-6">
            <TabsTrigger value="single" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Single Photo
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2">
              <Images className="h-4 w-4" />
              Import from Files
            </TabsTrigger>
            <TabsTrigger value="google-drive" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Google Drive
            </TabsTrigger>
            <TabsTrigger value="dropbox" className="gap-2">
              <Cloud className="h-4 w-4" />
              Dropbox
            </TabsTrigger>
          </TabsList>

          {/* ── Single photo tab ── */}
          <TabsContent value="single">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
              <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                    <FormField
                      control={form.control}
                      name="sourceUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            Source URL
                            <span className="text-muted-foreground font-normal text-xs">
                              (Pinterest, Open Library, Gutenberg, etc.)
                            </span>
                            {prefetching && (
                              <span className="inline-flex items-center gap-1 text-xs text-primary">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Fetching…
                              </span>
                            )}
                            {autoFilled && !prefetching && (
                              <span className="inline-flex items-center gap-1 text-xs text-green-500">
                                <Sparkles className="h-3 w-3" />
                                Auto-filled
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <ExternalLink className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder=""
                                className="pl-9"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">Supported book sites — paste a URL to auto-fill cover &amp; title</p>
                            <div className="flex flex-wrap gap-2">
                              {([
                                { name: "Open Library", href: "https://openlibrary.org", className: "text-amber-600" },
                                { name: "Project Gutenberg", href: "https://www.gutenberg.org", className: "text-emerald-600" },
                                { name: "Standard Ebooks", href: "https://standardebooks.org", className: "text-violet-500" },
                                { name: "Internet Archive", href: "https://archive.org/details/texts", className: "text-sky-500" },
                                { name: "ManyBooks", href: "https://manybooks.net", className: "text-rose-500" },
                              ] as const).map(({ name, href, className }) => (
                                <a
                                  key={name}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-xs font-medium px-2.5 py-1 rounded-full bg-muted hover:bg-muted/70 transition-colors ${className}`}
                                >
                                  {name}
                                </a>
                              ))}
                            </div>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="imageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            Image URL
                            {field.value && autoFilled && (
                              <span className="inline-flex items-center gap-1 text-xs text-green-500">
                                <CheckCircle2 className="h-3 w-3" />
                                Filled automatically
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <div className="relative">
                                {prefetching ? (
                                  <Loader2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground animate-spin" />
                                ) : (
                                  <ImageIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                )}
                                <Input
                                  placeholder=""
                                  className="pl-9"
                                  {...field}
                                  onChange={(e) => {
                                    field.onChange(e);
                                    setAutoFilled(false);
                                  }}
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  disabled={uploadingFile}
                                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {uploadingFile ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Upload className="h-3.5 w-3.5" />
                                  )}
                                  {uploadingFile ? "Uploading…" : "Upload file"}
                                </button>
                                <button
                                  type="button"
                                  onClick={handlePasteFromClipboard}
                                  disabled={uploadingFile}
                                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  <Clipboard className="h-3.5 w-3.5" />
                                  Paste image
                                </button>
                              </div>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileChange}
                              />
                              {urlWarningState === "warn" && (
                                <p className="flex items-center gap-1.5 text-xs text-amber-500">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  This URL couldn't be previewed — double-check the link or upload the image instead.
                                </p>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                              <Input placeholder="" {...field} />
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
                                categories={existingCategories}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description <span className="text-muted-foreground font-normal text-xs">(Optional)</span></FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder=""
                              className="resize-none h-24"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />


                    {/* Audio file upload */}
                    <div className="border border-border rounded-lg p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2">
                            <Music className="h-4 w-4 text-muted-foreground" />
                            Audio File
                            <span className="text-muted-foreground font-normal text-xs">(Optional)</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Attach music, an audiobook, or podcast episode (MP3, M4A, OGG, WAV — up to 200 MB)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => audioInputRef.current?.click()}
                          disabled={uploadingAudio}
                          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                        >
                          {uploadingAudio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {uploadingAudio ? "Uploading…" : audioUrl ? "Replace" : "Choose file"}
                        </button>
                      </div>
                      {audioUrl && (
                        <div className="flex items-center gap-2 text-xs text-green-500">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          Audio file uploaded
                          <button type="button" onClick={() => setAudioUrl(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={handleAudioFileChange}
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={createPhotoMutation.isPending} size="lg" className="w-full sm:w-auto">
                        {createPhotoMutation.isPending ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                        ) : (
                          <><Plus className="mr-2 h-4 w-4" />Add to Library</>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>

              {/* Live preview */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Preview</h3>
                <div className="rounded-xl bg-muted border border-border/50 overflow-hidden shadow-inner min-h-48 flex items-center justify-center">
                  {prefetching && !isValidUrl ? (
                    <div className="flex flex-col items-center gap-2 p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">Fetching image…</p>
                    </div>
                  ) : isValidUrl && !imgError ? (
                    <>
                      <img
                        key={watchUrl}
                        src={watchUrl}
                        alt="Preview"
                        className="w-full h-auto block object-contain max-h-[500px]"
                        onLoad={() => setImgLoaded(true)}
                        onError={() => setImgError(true)}
                        style={{ display: imgLoaded ? "block" : "none" }}
                      />
                      {!imgLoaded && <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-3 p-8 text-center">
                      {imgError ? (
                        <>
                          <AlertCircle className="w-10 h-10 text-destructive/50" />
                          <p className="text-sm text-muted-foreground">Could not load image</p>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="w-10 h-10 opacity-20" />
                          <p className="text-sm text-muted-foreground">
                            Paste a source URL or image URL to preview
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {form.watch("title") && (
                  <div className="p-3 bg-card rounded-lg border border-border/50">
                    <p className="font-medium text-sm leading-tight">{form.watch("title")}</p>
                    {form.watch("category") && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-accent text-accent-foreground">
                        {form.watch("category")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── Bulk import tab ── */}
          <TabsContent value="bulk">
            <BulkImportTab existingCategories={existingCategories} />
          </TabsContent>

          {/* ── Google Drive tab ── */}
          <TabsContent value="google-drive">
            <GoogleDriveTab existingCategories={existingCategories} />
          </TabsContent>

          <TabsContent value="dropbox">
            <DropboxTab existingCategories={existingCategories} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

export default AddPhoto;
