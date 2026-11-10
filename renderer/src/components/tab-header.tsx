import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTabHeaders, type TabHeaderKey } from "@/hooks/use-tab-headers";

// A clickable region over the expanded image, positioned as percentages of the
// picture so it stays put at any size. Percentages rather than pixels because
// the banner is fluid, and tied to the expanded view because that's the only
// state where the whole image -- and so a known coordinate -- is on screen.
export type HeaderHotspot = {
  left: number; top: number; width: number; height: number;
  title: string;
  onClick: () => void;
};

function HotspotButton({ hotspot, onActivate }: { hotspot: HeaderHotspot; onActivate: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={hotspot.title}
      aria-label={hotspot.title}
      onClick={(e) => { e.stopPropagation(); onActivate(); hotspot.onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="absolute z-10 cursor-pointer focus:outline-none"
      style={{
        left: `${hotspot.left}%`, top: `${hotspot.top}%`,
        width: `${hotspot.width}%`, height: `${hotspot.height}%`,
        border: "none", borderRadius: 6,
        background: hover ? "rgba(245, 158, 11, 0.10)" : "transparent",
        boxShadow: hover ? "0 0 0 1px rgba(245, 158, 11, 0.55)" : "none",
        transition: "box-shadow 150ms ease, background 150ms ease",
      }}
    />
  );
}

// The banner strip at the top of a tab.
//
// Collapsed it shows a 4:1 window over the image, positioned by the offset an
// admin chose. Clicking expands it to the full picture, which is the only way
// to see everything a 4:1 band necessarily cuts. Expanding pushes the content
// below it down rather than overlaying, so it reads as opening a drawer.
//
// Renders nothing when an admin has switched this tab's banner off, or when
// the tab has neither an upload nor bundled artwork.
export function TabHeader({ tabKey, hotspot, hotspots, aspectRatio = "4/1", alwaysExpanded = false }: { tabKey: TabHeaderKey; hotspot?: HeaderHotspot; hotspots?: HeaderHotspot[]; aspectRatio?: string; alwaysExpanded?: boolean }) {
  const { headerSrc, fallbackSrc, isHeaderVisible, cropOffset } = useTabHeaders();
  const [expanded, setExpanded] = useState(false);

  // If the tab-headers query is already cached (e.g. navigating back to this tab),
  // trueSrc is the uploaded URL immediately — start there to avoid flashing the
  // bundled fallback. If the query hasn't loaded yet, trueSrc === bundled, so this
  // degrades to the original behavior: show the bundled image, swap when ready.
  const trueSrc = headerSrc(tabKey);
  const bundled = fallbackSrc(tabKey);
  const [displaySrc, setDisplaySrc] = useState<string | null>(trueSrc ?? bundled);

  const handleImgError = () => {
    if (bundled && displaySrc !== bundled) setDisplaySrc(bundled);
    else if (!bundled) setDisplaySrc(null);
  };

  useEffect(() => {
    if (!trueSrc || trueSrc === displaySrc) return;
    const img = new window.Image();
    img.onload = () => setDisplaySrc(trueSrc);
    img.onerror = () => setDisplaySrc(bundled ?? null);
    img.src = trueSrc;
    return () => { img.onload = null; img.onerror = null; };
  }, [trueSrc]);
  // Hover is tracked in state and drawn with inline styles rather than
  // Tailwind variants. A first attempt used group-hover:/hover: utilities with
  // opacity modifiers, and those never reached the CSS bundle at all -- so the
  // hotspot shipped invisible and took a while to diagnose. Inline styles
  // can't be dropped by a class scanner.
  // Headers uploaded before banners were stored whole are already 4:1, so
  // expanding one reveals nothing -- the window and the picture are the same
  // shape. Offering "Show full image" on those promises something that can't
  // happen, so the affordance is withheld until the image proves it has extra
  // height to give. Measured from the loaded image rather than assumed,
  // because whether it applies depends on when that particular file was
  // uploaded, which nothing else records.
  const [naturalRatio, setNaturalRatio] = useState<number | null>(null);
  const expandable = !alwaysExpanded && naturalRatio !== null && naturalRatio < 3.9;

  const src = displaySrc;
  if (!src || !isHeaderVisible(tabKey)) return null;

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalHeight > 0) setNaturalRatio(naturalWidth / naturalHeight);
  };

  return (
    <div className="relative group">
      <div
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? expanded : undefined}
        aria-label={expandable ? (expanded ? "Collapse banner" : "Expand banner to see the full image") : undefined}
        onClick={expandable ? () => setExpanded((e) => !e) : undefined}
        onKeyDown={expandable ? (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); }
        } : undefined}
        className={`block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg overflow-hidden ${expandable ? "cursor-pointer" : ""}`}
      >
        {expanded || alwaysExpanded ? (
          <img src={src} alt="" className="w-full h-auto block" onLoad={onImgLoad} onError={handleImgError} />
        ) : (
          // object-position reproduces the crop the admin slider previews, so
          // the two can't drift apart.
          <div className="w-full overflow-hidden" style={{ aspectRatio }}>
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover"
              style={{ objectPosition: `50% ${cropOffset(tabKey) * 100}%` }}
              onLoad={onImgLoad}
              onError={handleImgError}
            />
          </div>
        )}
      </div>

      {/* Only hint on hover -- a permanent badge over the artwork would be
          louder than the feature deserves. */}
      <div className={`pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-[10px] font-medium opacity-0 transition-opacity ${expandable ? "group-hover:opacity-100" : ""}`}>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Collapse" : "Show full image"}
      </div>

      {expanded && (() => {
        const all = hotspots ?? (hotspot ? [hotspot] : []);
        return all.map((hs, i) => (
          <HotspotButton key={i} hotspot={hs} onActivate={() => setExpanded(false)} />
        ));
      })()}
    </div>
  );
}
