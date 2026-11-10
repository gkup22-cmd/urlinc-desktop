import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "wouter";
import { Link } from "wouter";
import { useGetPhoto } from "@workspace/api-client-react";
import type { Photo } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Minus,
  Plus,
  Sun,
  Moon,
  List,
  Loader2,
} from "lucide-react";

type EpubCFIInstance = {
  toRange(doc: Document, ignoreClass?: string): Range | null;
};

type EpubCFIConstructor = new (cfi: string) => EpubCFIInstance;

type SpineSection = {
  href: string;
  cfiBase: string;
  load(requester: unknown): Promise<unknown>;
  document: Document | undefined;
  cfiFromRange(range: Range): string;
};

type EpubBook = {
  destroy(): void;
  renderTo(element: HTMLElement, options: Record<string, unknown>): EpubRendition;
  loaded: { navigation: Promise<{ toc: TocItem[] }> };
  spine: { get(index: number): SpineSection | null | undefined };
  load: unknown;
  /** Resolves once the book's packaging (metadata, spine, manifest) is parsed. */
  opened: Promise<EpubBook>;
};

type EpubContents = {
  document: Document;
};

type EpubRendition = {
  display(target?: string): Promise<void>;
  prev(): void;
  next(): void;
  on(event: string, cb: (data: unknown) => void): void;
  getContents(): Array<EpubContents>;
  themes: {
    register(name: string, styles: Record<string, unknown>): void;
    select(name: string): void;
    fontSize(size: string): void;
    override(property: string, value: string): void;
  };
  hooks: {
    content: {
      register(fn: (contents: EpubContents) => void): void;
    };
  };
};

type EpubFactory = ((url: string) => EpubBook) & { CFI: EpubCFIConstructor };

type TocItem = {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
};

type RelocatedLocation = {
  start: { cfi: string; index?: number; percentage?: number };
};

type SavedProgress = {
  cfi: string | null;
  spineIndex: number | null;
  charOffset: number | null;
};

function countCharsBeforeRangeStart(
  doc: Document,
  container: Node,
  offset: number,
): number {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let total = 0;
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node === container) {
      return total + offset;
    }
    total += (node as Text).length;
    node = walker.nextNode();
  }
  return total;
}

function findRangeAtCharOffset(doc: Document, offset: number): Range | null {
  try {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let remaining = offset;
    let node: Node | null = walker.nextNode();
    while (node) {
      const textLen = (node as Text).length;
      if (remaining <= textLen) {
        const range = doc.createRange();
        range.setStart(node as Text, remaining);
        range.collapse(true);
        return range;
      }
      remaining -= textLen;
      node = walker.nextNode();
    }
    return null;
  } catch {
    return null;
  }
}

async function displayWithFallback(
  book: EpubBook,
  rendition: EpubRendition,
  progress: SavedProgress,
): Promise<void> {
  const { cfi, spineIndex, charOffset } = progress;

  if (cfi) {
    try {
      await rendition.display(cfi);
      return;
    } catch {
      // CFI failed — fall through to spine-index + char-offset restore
    }
  }

  if (typeof spineIndex !== "number" || spineIndex < 0) {
    await rendition.display();
    return;
  }

  const section = book.spine.get(spineIndex);
  if (!section) {
    await rendition.display();
    return;
  }

  if (typeof charOffset === "number" && charOffset >= 0) {
    try {
      await section.load(book.load);
      const doc = section.document;
      if (doc?.body) {
        const range = findRangeAtCharOffset(doc, charOffset);
        if (range) {
          const reconstructedCfi = section.cfiFromRange(range);
          await rendition.display(reconstructedCfi);
          return;
        }
      }
    } catch {
      // fall through to chapter-level href navigation
    }
  }

  await rendition.display(section.href);
}

function extractSectionText(rendition: EpubRendition): string {
  const contents = rendition.getContents();
  if (!contents.length) return "";
  const doc = contents[0].document;
  if (!doc?.body) return "";
  const clone = doc.body.cloneNode(true) as Element;
  clone.querySelectorAll("script, style, svg, img, figure, aside").forEach((el) =>
    el.remove(),
  );
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function ReadPage() {
  const { id } = useParams<{ id: string }>();
  const photoId = parseInt(id ?? "0", 10);

  const { data: photo, isLoading } = useGetPhoto(photoId);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const epubCFIRef = useRef<EpubCFIConstructor | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedProgressRef = useRef<SavedProgress>({ cfi: null, spineIndex: null, charOffset: null });
  const darkBoxRef = useRef<{ value: boolean } | null>(null);
  const buildCssRef = useRef<((dark: boolean) => string) | null>(null);

  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [isDark, setIsDark] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const epubUrl = (photo as Photo & { epubUrl?: string | null } | undefined)?.epubUrl;

  useEffect(() => {
    if (!photoId) return;
    fetch(`/api/photos/${photoId}/reading-progress`, { credentials: "include" })
      .then((r) =>
        r.ok
          ? (r.json() as Promise<{ cfi?: string | null; spineIndex?: number | null; charOffset?: number | null }>)
          : null,
      )
      .then((data) => {
        if (data) {
          savedProgressRef.current = {
            cfi: data.cfi ?? null,
            spineIndex: data.spineIndex ?? null,
            charOffset: data.charOffset ?? null,
          };
        }
      })
      .catch(() => {});
  }, [photoId]);

  useEffect(() => {
    if (!epubUrl || !containerRef.current) return;

    let cancelled = false;
    setInitialized(false);
    setLoadError(null);

    void (async () => {
      try {
        // Use the streaming proxy so bytes come directly from our server.
        // /storage/objects/* does a 302 to a GCS signed URL which CORS-blocks
        // browser blob fetches; /storage/stream/* pipes the bytes through Node.
        const streamUrl = epubUrl.replace(
          /^(\/api)?\/storage\/objects\//,
          "/api/storage/stream/",
        );
        const epubRes = await fetch(streamUrl, { credentials: "include" });
        if (!epubRes.ok) throw new Error(`HTTP ${epubRes.status}`);
        // Pass an ArrayBuffer directly — epubjs accepts it natively and this
        // avoids any blob-URL resource-resolution issues inside epubjs/JSZip.
        const epubBuffer = await epubRes.arrayBuffer();
        if (cancelled) return;

        const mod = await import("epubjs");
        if (cancelled) return;

        const ePub = mod.default as unknown as EpubFactory;
        epubCFIRef.current = ePub.CFI;

        const book = ePub(epubBuffer as unknown as string);
        bookRef.current = book;

        // Wait for the book's packaging (spine, manifest, metadata) to be fully
        // parsed before calling renderTo.  Without this, Rendition.start()
        // crashes because book.package is still undefined.
        await book.opened;
        if (cancelled) return;

        // Use explicit pixel dimensions — percentage strings can evaluate to 0
        // if the container layout hasn't settled when renderTo runs.
        const { width: cw, height: ch } =
          containerRef.current!.getBoundingClientRect();

        const rendition = book.renderTo(containerRef.current!, {
          width: Math.floor(cw) || 800,
          height: Math.floor(ch) || 600,
          // scrolled-doc renders each spine section as a scrollable document
          // rather than trying to paginate columns — far more reliable across
          // EPUB 2 and EPUB 3 files.
          flow: "scrolled-doc",
          spread: "none",
        });
        renditionRef.current = rendition;

        // Inject our reading styles with !important so the EPUB's own CSS
        // can't override them and hide content behind a white-on-white page.
        const buildCss = (dark: boolean) => `
          html, body {
            color: ${dark ? "#d4d4d4" : "#1a1a1a"} !important;
            background: ${dark ? "#1a1a1a" : "#f9f7f2"} !important;
            font-family: Georgia, 'Times New Roman', serif !important;
            line-height: 1.75 !important;
            padding: 1.5rem 6% !important;
            max-width: 40em;
            margin: 0 auto;
          }
          a { color: ${dark ? "#60a5fa" : "#2563eb"} !important; }
          p { margin: 0 0 0.9em 0; }
          img, svg { max-width: 100%; height: auto; }
        `;

        // Store whether dark-mode is active at hook-registration time in a
        // mutable box so the hook closure can read the latest value.
        const darkBox = { value: false };

        rendition.hooks.content.register((contents: EpubContents) => {
          const doc = contents.document;
          if (!doc?.head) return;
          // Remove any existing style element we injected (re-render case).
          doc.head.querySelectorAll("style[data-reader]").forEach((el) => el.remove());
          const style = doc.createElement("style");
          style.setAttribute("data-reader", "1");
          style.textContent = buildCss(darkBox.value);
          doc.head.appendChild(style);
        });

        // Keep a ref to darkBox so the isDark toggle effect can update it.
        darkBoxRef.current = darkBox;
        buildCssRef.current = buildCss;

        await displayWithFallback(book, rendition, savedProgressRef.current);
        if (!cancelled) setInitialized(true);

        rendition.on("relocated", (location: unknown) => {
          const loc = location as RelocatedLocation;
          const cfi = loc?.start?.cfi;

          if (!cfi) return;

          const spineIndex =
            typeof loc?.start?.index === "number" ? loc.start.index : null;
          const rawPct = loc?.start?.percentage;
          const percentage =
            typeof rawPct === "number" ? Math.round(rawPct * 100) : undefined;

          // Compute true cumulative char offset within the spine section.
          // Use EpubCFI.toRange() to find the exact DOM position, then count
          // all text characters from the body start to that position.
          let charOffset: number | null = null;
          try {
            const EpubCFI = epubCFIRef.current;
            if (EpubCFI) {
              const contents = rendition.getContents();
              if (contents.length > 0) {
                const doc = contents[0].document;
                if (doc?.body) {
                  const range = new EpubCFI(cfi).toRange(doc);
                  if (range) {
                    charOffset = countCharsBeforeRangeStart(
                      doc,
                      range.startContainer,
                      range.startOffset,
                    );
                  }
                }
              }
            }
          } catch {
            // charOffset stays null — save proceeds without it
          }

          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            fetch(`/api/photos/${photoId}/reading-progress`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cfi,
                spineIndex,
                charOffset,
                ...(percentage !== undefined ? { percentage } : {}),
              }),
            }).catch(() => {});
          }, 1500);
        });

        // Forward arrow-key events from inside the epubjs iframe so the
        // outer window handler doesn't miss them when the iframe has focus.
        rendition.on("keydown", (e: KeyboardEvent) => {
          if (e.key === "ArrowLeft") rendition.prev();
          if (e.key === "ArrowRight") rendition.next();
        });

        book.loaded.navigation
          .then((nav) => {
            if (!cancelled) setToc(nav.toc);
          })
          .catch(() => {});
      } catch {
        if (!cancelled)
          setLoadError(
            "Failed to load EPUB. The file may be corrupted or inaccessible.",
          );
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (bookRef.current) {
        bookRef.current.destroy();
        bookRef.current = null;
        renditionRef.current = null;
      }
    };
  }, [epubUrl, photoId]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    rendition.getContents().forEach((contents) => {
      const doc = contents.document;
      if (!doc?.head) return;
      doc.head.querySelectorAll("style[data-reader-font]").forEach((el) => el.remove());
      const style = doc.createElement("style");
      style.setAttribute("data-reader-font", "1");
      style.textContent = `html, body { font-size: ${fontSize}% !important; }`;
      doc.head.appendChild(style);
    });
  }, [fontSize]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !darkBoxRef.current || !buildCssRef.current) return;
    darkBoxRef.current.value = isDark;
    const css = buildCssRef.current(isDark);
    rendition.getContents().forEach((contents) => {
      const doc = contents.document;
      if (!doc?.head) return;
      doc.head.querySelectorAll("style[data-reader]").forEach((el) => el.remove());
      const style = doc.createElement("style");
      style.setAttribute("data-reader", "1");
      style.textContent = css;
      doc.head.appendChild(style);
    });
  }, [isDark]);

  const handlePrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const handleNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  const handleTocNav = useCallback((href: string) => {
    renditionRef.current?.display(href);
    setTocOpen(false);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePrev, handleNext]);

  const bg = isDark ? "bg-[#1a1a1a]" : "bg-[#f9f7f2]";
  const barBg = isDark ? "bg-[#111] border-gray-800" : "bg-white border-gray-200";
  const textMuted = isDark ? "text-gray-400" : "text-gray-500";
  const textMain = isDark ? "text-gray-200" : "text-gray-800";

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!epubUrl) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4">
        <BookOpen className="h-16 w-16 text-muted-foreground/30" />
        <p className="text-muted-foreground">No EPUB file is attached to this item.</p>
        <Button variant="outline" asChild>
          <Link href={`/photo/${photoId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Details
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 flex flex-col ${bg}`}>
      {/* ── Top toolbar ── */}
      <div
        className={`flex items-center gap-2 px-3 py-2 border-b shrink-0 ${barBg}`}
      >
        <Button variant="ghost" size="sm" asChild className="gap-1.5 shrink-0">
          <Link href={`/photo/${photoId}`}>
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
        </Button>

        <span className={`flex-1 text-sm font-medium truncate ${textMain}`}>
          {photo?.title ?? ""}
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className={textMuted}
            onClick={() => setFontSize((s) => Math.max(70, s - 10))}
            title="Decrease font size"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className={`text-xs w-9 text-center tabular-nums ${textMuted}`}>
            {fontSize}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={textMuted}
            onClick={() => setFontSize((s) => Math.min(200, s + 10))}
            title="Increase font size"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={textMuted}
            onClick={() => setIsDark((d) => !d)}
            title="Toggle light/dark mode"
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>

          {toc.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className={`${textMuted} ${tocOpen ? "bg-accent" : ""}`}
              onClick={() => setTocOpen((o) => !o)}
              title="Table of contents"
            >
              <List className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Content row ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ToC sidebar */}
        {tocOpen && toc.length > 0 && (
          <div
            className={`w-64 shrink-0 border-r overflow-y-auto ${isDark ? "bg-[#111] border-gray-800" : "bg-white border-gray-200"}`}
          >
            <p
              className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-widest border-b ${isDark ? "border-gray-800 text-gray-500" : "border-gray-100 text-gray-400"}`}
            >
              Contents
            </p>
            {toc.map((item) => (
              <button
                key={item.id || item.href}
                onClick={() => handleTocNav(item.href)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${isDark ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-50"}`}
              >
                {item.label.trim()}
              </button>
            ))}
          </div>
        )}

        {/* EPUB viewer */}
        <div className="flex-1 relative overflow-hidden">
          {!initialized && !loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
              <Loader2 className={`h-8 w-8 animate-spin ${textMuted}`} />
              <p className={`text-sm ${textMuted}`}>Loading book…</p>
            </div>
          )}
          {loadError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
              <BookOpen className={`h-12 w-12 ${textMuted} opacity-30`} />
              <p className={`text-sm ${textMuted}`}>{loadError}</p>
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" />
        </div>
      </div>

      {/* ── Bottom nav ── */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-t shrink-0 ${barBg}`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrev}
          className="gap-1.5"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <p className={`text-xs hidden sm:block ${textMuted}`}>
          ← → arrow keys to navigate
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          className="gap-1.5"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
