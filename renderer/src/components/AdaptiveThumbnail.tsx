import { useState } from "react";

/**
 * A thumbnail <img> that avoids cropping portrait-shaped images (Reels,
 * Shorts) into a landscape box. Landscape images fill the box as normal
 * (object-cover); once a portrait image's real dimensions are known (only
 * available after it loads), it switches to object-contain so the whole
 * picture stays visible, letterboxed against the container's own
 * background instead of losing content off the top/bottom.
 */
export function AdaptiveThumbnail({
  src,
  alt,
  className,
  loading,
  onLoad,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  loading?: "lazy" | "eager";
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) {
  const [isPortrait, setIsPortrait] = useState(false);

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      onLoad={(e) => {
        setIsPortrait(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth);
        onLoad?.(e);
      }}
      onError={onError}
      className={`${className ?? ""} ${isPortrait ? "object-contain" : "object-cover"}`}
    />
  );
}
