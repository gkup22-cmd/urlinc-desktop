import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  useGetPhoto,
  useUpdatePhoto,
  useDeletePhoto,
  useGetPhotoStats,
  useGetPhotoSimilarItems,
  useListPhotos,
  getListPhotosQueryKey,
  getGetPhotoStatsQueryKey,
  getGetPhotoQueryKey,
  type Photo,
  type SimilarProduct,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { compressAndUploadPhoto } from "@/lib/upload";
import { Loader2, Trash2, Save, ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, ImageIcon, Upload, Clipboard, Images, Sparkles, ShoppingBag, ShoppingCart, AlertCircle, Maximize2, X, BookOpen } from "lucide-react";
import { useImageUrlWarning } from "@/hooks/use-image-url-warning";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CREATE_NEW = "__create_new__";

function CategorySelect({ value, onChange, categories }: { value: string; onChange: (val: string) => void; categories: string[] }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [localCategories, setLocalCategories] = useState<string[]>([]);

  const baseCategories = [...categories, ...localCategories.filter((c) => !categories.includes(c))];
  const allCategories = value && !baseCategories.includes(value) ? [...baseCategories, value] : baseCategories;

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
    <Select key={value} value={value} onValueChange={(val) => { if (val === CREATE_NEW) setCreating(true); else onChange(val); }}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a category…">{value || undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {allCategories.map((cat) => (
          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
        ))}
        {allCategories.length > 0 && <SelectSeparator />}
        <SelectItem value={CREATE_NEW} className="text-primary font-medium">+ Add Category</SelectItem>
      </SelectContent>
    </Select>
  );
}

function ProductCard({ product }: { product: SimilarProduct }) {
  const [wishlisted, setWishlisted] = useState(false);

  const addToWishList = async () => {
    await fetch("/api/radio-favorites", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "wish-list",
        stationId: product.affiliateUrl,
        stationData: { title: product.name, imageUrl: product.imageUrl, affiliateUrl: product.affiliateUrl, type: "product" },
      }),
    });
    setWishlisted(true);
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-square bg-muted overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = `https://placehold.co/300x300/4a4a4a/ffffff?text=Item`;
          }}
        />
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium leading-snug line-clamp-2">{product.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{product.description}</p>
        <p className="text-sm font-semibold text-primary">{product.priceRange}</p>
        <div className="flex flex-col gap-1.5 mt-auto">
          <a href={`https://www.google.com/search?q=${encodeURIComponent(product.name)}&tbm=isch`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg px-3 py-2 transition-colors">
            <Images className="h-3.5 w-3.5" /> Search Google Images
          </a>
          <a href={product.affiliateUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg px-3 py-2 hover:bg-amber-500/20 transition-colors">
            <ShoppingCart className="h-3.5 w-3.5" /> Search Amazon
          </a>
          <button
            onClick={() => void addToWishList()}
            className={`inline-flex items-center justify-center gap-1.5 text-xs font-medium border rounded-lg px-3 py-2 transition-colors ${
              wishlisted
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            {wishlisted ? "In Wish List" : "Add to Wish List"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { Link } from "wouter";

const editSchema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  imageUrl: z.string().min(1, "Image URL is required")
    .refine(
      (v) => !v.startsWith("data:"),
      "Data URLs are not supported — please use the file picker or paste an image instead."
    )
    .refine(
      (v) => v.startsWith("/api/storage/") || (() => { try { new URL(v); return true; } catch { return false; } })(),
      "Must be a valid URL or uploaded image"
    ),
  sourceUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type EditValues = z.infer<typeof editSchema>;

export function PhotoDetail() {
  const { id } = useParams<{ id: string }>();
  const photoId = parseInt(id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgFallbackTried, setImgFallbackTried] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [similarSheetOpen, setSimilarSheetOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [albumMenuOpen, setAlbumMenuOpen] = useState(false);
  const [albums, setAlbums] = useState<{ id: number; name: string; photoCount: number }[]>([]);
  const [albumsLoaded, setAlbumsLoaded] = useState(false);
  const [addingToAlbum, setAddingToAlbum] = useState<number | null>(null);
  const albumMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!albumMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (albumMenuRef.current && !albumMenuRef.current.contains(e.target as Node)) setAlbumMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [albumMenuOpen]);

  useEffect(() => {
    if (!albumMenuOpen || albumsLoaded) return;
    fetch("/api/albums", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => { setAlbums(data as typeof albums); setAlbumsLoaded(true); })
      .catch(() => setAlbumsLoaded(true));
  }, [albumMenuOpen, albumsLoaded]);

  const handleAddToAlbum = async (albumId: number) => {
    setAddingToAlbum(albumId);
    try {
      const res = await fetch(`/api/albums/${albumId}/photos`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
      const data = await res.json() as { error?: string };
      if (res.ok) {
        const album = albums.find((a) => a.id === albumId);
        toast({ title: `Added to "${album?.name ?? "album"}"` });
        setAlbumMenuOpen(false);
      } else {
        toast({ title: data.error ?? "Failed to add to album", variant: "destructive" });
      }
    } finally {
      setAddingToAlbum(null);
    }
  };

  const { data: _photoRaw, isLoading, error } = useGetPhoto(photoId, {
    query: { enabled: !!photoId },
  } as Parameters<typeof useGetPhoto>[1]);
  const photo = _photoRaw as Photo | undefined;

  const updatePhoto = useUpdatePhoto();
  const deletePhoto = useDeletePhoto();
  const { data: stats } = useGetPhotoStats();
  const existingCategories = (stats?.byCategory ?? []).map((c) => c.category).sort();

  const { settings } = useSettings();
  const similarItems = useGetPhotoSimilarItems();

  const { data: photoList } = useListPhotos({ limit: 200 });
  const photoIds = (photoList?.items ?? []).map((p) => p.id);
  const currentIndex = photoIds.indexOf(photoId);
  const prevId = currentIndex > 0 ? (photoIds[currentIndex - 1] ?? null) : null;
  const nextId = currentIndex >= 0 && currentIndex < photoIds.length - 1 ? (photoIds[currentIndex + 1] ?? null) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setFullscreenOpen(false); return; }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prevId) setLocation(`/photo/${prevId}`);
      if (e.key === "ArrowRight" && nextId) setLocation(`/photo/${nextId}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prevId, nextId, setLocation]);

  const handleFindSimilar = () => {
    setSimilarSheetOpen(true);
    setSelectedLabel(null);
    similarItems.mutate({ id: photoId });
  };

  // Auto-open Shop Similar when arriving from the Wish List "Find Similar Items" button.
  // Strip the param from the URL immediately so a page refresh doesn't re-trigger analysis.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("shopSimilar") === "1" && photo) {
      window.history.replaceState(null, "", window.location.pathname);
      handleFindSimilar();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    values: photo
      ? {
          title: photo.title,
          category: photo.category,
          description: photo.description ?? "",
          imageUrl: photo.imageUrl,
          sourceUrl: photo.sourceUrl ?? "",
        }
      : undefined,
  });

  const watchImageUrl = form.watch("imageUrl");
  const { state: urlWarningState } = useImageUrlWarning(watchImageUrl ?? "");

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsUploading(true);
    try {
      const { imageUrl: storagePath } = await compressAndUploadPhoto(file);
      form.setValue("imageUrl", storagePath, { shouldValidate: true });
      setImgError(false);
      setImgFallbackTried(false);
    } catch {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [form, toast]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], "pasted.jpg", { type: imageType });
          setIsUploading(true);
          try {
            const { imageUrl: storagePath } = await compressAndUploadPhoto(file);
            form.setValue("imageUrl", storagePath, { shouldValidate: true });
            setImgError(false);
            setImgFallbackTried(false);
          } catch {
            toast({ title: "Failed to upload image", variant: "destructive" });
          } finally {
            setIsUploading(false);
          }
          return;
        }
      }
      toast({ title: "No image found in clipboard", variant: "destructive" });
    } catch {
      toast({ title: "Copy an image first, then click Paste", variant: "destructive" });
    }
  }, [form, toast]);

  const handleSave = (data: EditValues) => {
    updatePhoto.mutate(
      { id: photoId, data: { ...data, sourceUrl: data.sourceUrl || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPhotoQueryKey(photoId) });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
          toast({ title: "Photo updated" });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update photo.", variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = () => {
    deletePhoto.mutate(
      { id: photoId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPhotosQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPhotoStatsQueryKey() });
          toast({ title: "Photo deleted" });
          setLocation("/photos");
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to delete photo.", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error || !photo) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
          <p className="text-muted-foreground">Photo not found.</p>
          <Button variant="outline" asChild>
            <Link href="/photos"><ArrowLeft className="mr-2 h-4 w-4" />Back to Photos</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  // editedImageUrl is set while the user is actively editing the image field.
  // For display we try the full imageUrl first; if that fails (hotlink protection,
  // expired URL, etc.) the onError handler sets imgFallbackTried and we switch to
  // the thumbnail endpoint which proxies the image server-side.
  const editedImageUrl = form.watch("imageUrl");
  const displayUrl = editedImageUrl || photo.imageUrl;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/photos">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">

          {/* Image display — natural aspect ratio, scales to fit */}
          <div className="flex flex-col gap-4">
            <div className="relative group">
              <div className="rounded-xl overflow-hidden bg-muted border border-border/50 shadow-sm flex items-center justify-center">
                {!imgError ? (
                  <img
                    src={imgFallbackTried ? `/api/photos/${photo.id}/thumbnail` : displayUrl}
                    alt={photo.title}
                    className="w-full h-auto block object-contain max-h-[70vh]"
                    onError={() => {
                      if (!imgFallbackTried && !editedImageUrl) {
                        setImgFallbackTried(true);
                      } else {
                        setImgError(true);
                      }
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-24 text-muted-foreground">
                    <ImageIcon className="h-16 w-16 opacity-20" />
                    <p className="text-sm">Image could not be loaded</p>
                  </div>
                )}
              </div>
              {prevId && (
                <button
                  onClick={() => setLocation(`/photo/${prevId}`)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 bg-background border border-border shadow-lg hover:bg-accent transition-colors"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              {nextId && (
                <button
                  onClick={() => setLocation(`/photo/${nextId}`)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 bg-background border border-border shadow-lg hover:bg-accent transition-colors"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between">
              {settings.findSimilarItems && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleFindSimilar}
                  disabled={similarItems.isPending}
                  className="gap-2 text-sm"
                >
                  {similarItems.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 text-amber-400" />Find Similar Items</>
                  )}
                </Button>
              )}
              <div className="flex items-center gap-1 ml-auto">
                <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5" onClick={() => setFullscreenOpen(true)}>
                  <Maximize2 className="h-4 w-4" />
                  Fullscreen
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                  <a href={photo.imageUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1.5" />
                    Open original
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Edit form */}
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Details</h2>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} />
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

                  <FormField
                    control={form.control}
                    name="imageUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Image URL</FormLabel>
                        <FormControl>
                          <div className="space-y-2">
                            <Input
                              {...field}
                              onChange={(e) => {
                                field.onChange(e);
                                setImgError(false);
                                setImgFallbackTried(false);
                              }}
                            />
                            {urlWarningState === "warn" && (
                              <p className="flex items-center gap-1.5 text-xs text-amber-500">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                This URL couldn't be previewed — double-check the link or upload the image instead.
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                {isUploading ? "Uploading…" : "Upload file"}
                              </button>
                              <button
                                type="button"
                                onClick={handlePasteFromClipboard}
                                disabled={isUploading}
                                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
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
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="sourceUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source URL <span className="text-muted-foreground font-normal text-xs">(Pinterest, etc.)</span></FormLabel>
                        <FormControl>
                          <Input placeholder="" {...field} />
                        </FormControl>
                        <FormMessage />
                        {field.value && (
                          <a
                            href={field.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
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
                          <Textarea className="resize-none h-24" placeholder="" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={updatePhoto.isPending || isUploading} className="w-full">
                    {updatePhoto.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                    ) : isUploading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading…</>
                    ) : (
                      <><Save className="mr-2 h-4 w-4" />Save Changes</>
                    )}
                  </Button>
                </form>
              </Form>
            </div>

            <div className="relative" ref={albumMenuRef}>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setAlbumMenuOpen((o) => !o)}
              >
                <Images className="mr-2 h-4 w-4" />
                Add to Album
              </Button>
              {albumMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 pt-3 pb-2 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add to Album</p>
                  </div>
                  {!albumsLoaded ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground">Loading albums…</div>
                  ) : albums.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground">No albums yet. Create one from the Albums page.</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto divide-y divide-border">
                      {albums.map((a) => (
                        <button
                          key={a.id}
                          disabled={addingToAlbum !== null}
                          onClick={() => void handleAddToAlbum(a.id)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent transition-colors text-sm text-left disabled:opacity-50"
                        >
                          <span>{a.name}</span>
                          {addingToAlbum === a.id
                            ? <span className="text-xs text-muted-foreground">Adding…</span>
                            : <span className="text-xs text-muted-foreground">{a.photoCount} photo{a.photoCount !== 1 ? "s" : ""}</span>
                          }
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {(photo as Photo & { epubUrl?: string | null })?.epubUrl && (
              <Button variant="outline" className="w-full gap-2" asChild>
                <Link href={`/read/${photoId}`}>
                  <BookOpen className="h-4 w-4" />
                  Read Book
                </Link>
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Photo
            </Button>
          </div>
        </div>
      </div>

      {/* Similar Items Sheet */}
      <Sheet open={similarSheetOpen} onOpenChange={setSimilarSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-amber-400" />
              Similar Items
            </SheetTitle>
          </SheetHeader>

          {similarItems.isPending && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="text-sm">Analyzing your photo with AI…</p>
            </div>
          )}

          {similarItems.isError && (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
              <ImageIcon className="h-12 w-12 opacity-20" />
              <p className="text-sm text-center">
                {(similarItems.error as Error | undefined)?.message ?? "Analysis failed. Please try again."}
              </p>
              <Button variant="outline" size="sm" onClick={() => similarItems.mutate({ id: photoId })}>
                Try Again
              </Button>
            </div>
          )}

          {similarItems.isSuccess && similarItems.data && (
            <div className="space-y-6">
              {similarItems.data.labels.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">AI Detected</p>
                  <div className="flex flex-wrap gap-2">
                    {similarItems.data.labels.map((label) => {
                      const active = selectedLabel === label;
                      return (
                        <button
                          key={label}
                          onClick={() => setSelectedLabel(active ? null : label)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "bg-amber-500 text-black border-amber-500"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/25"
                          }`}
                        >
                          <Sparkles className="h-3 w-3" />
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Shop Similar{selectedLabel ? ` — ${selectedLabel}` : ""}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(selectedLabel
                    ? similarItems.data.products.filter((p) => p.name === selectedLabel)
                    : similarItems.data.products
                  ).map((product, i) => (
                    <ProductCard key={i} product={product} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the photo from your library.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fullscreen lightbox */}
      {fullscreenOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setFullscreenOpen(false)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 rounded-full p-2.5 bg-white/15 hover:bg-white/25 text-white border border-white/30 shadow-lg transition-colors"
            onClick={(e) => { e.stopPropagation(); setFullscreenOpen(false); }}
            aria-label="Close fullscreen"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Prev — pinned to viewport left edge */}
          {prevId && (
            <button
              onClick={(e) => { e.stopPropagation(); setLocation(`/photo/${prevId}`); }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-3 bg-white text-black shadow-xl hover:bg-white/90 transition-colors"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Next — pinned to viewport right edge */}
          {nextId && (
            <button
              onClick={(e) => { e.stopPropagation(); setLocation(`/photo/${nextId}`); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-3 bg-white text-black shadow-xl hover:bg-white/90 transition-colors"
              aria-label="Next photo"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Image — narrowed to leave room for the side buttons */}
          <div onClick={(e) => e.stopPropagation()}>
            <img
              src={displayUrl}
              alt={photo.title}
              className="max-w-[85vw] max-h-[95vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </Layout>
  );
}

export default PhotoDetail;
