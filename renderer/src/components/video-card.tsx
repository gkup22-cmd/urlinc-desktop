import { useLocation } from "wouter";
import { format } from "date-fns";
import { Play, Video, Star, Check } from "lucide-react";
import { detectPlatform, detectStreamingService, getVideoThumbnail } from "@/lib/youtube";
import { AdaptiveThumbnail } from "@/components/AdaptiveThumbnail";
import type { Video as VideoType } from "@workspace/api-client-react";

export function VideoCard({
  video,
  showDescription,
  isFavorite,
  onToggleFavorite,
  isSelected,
  hasSelection,
  onToggleSelect,
}: {
  video: VideoType;
  showDescription?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  isSelected?: boolean;
  hasSelection?: boolean;
  onToggleSelect?: (e: React.MouseEvent) => void;
}) {
  const thumbnail = getVideoThumbnail(video.youtubeUrl, video.thumbnailUrl);
  const platform = detectPlatform(video.youtubeUrl);
  const isFacebook = platform === "facebook";
  const streamingService = detectStreamingService(video.youtubeUrl, video.description);
  const hasThumbnail = thumbnail.length > 0;
  const [, navigate] = useLocation();
  const href = `/video/${video.id}`;

  return (
    <a
      href={href}
      className="group flex flex-col gap-3"
      data-testid={`card-video-${video.id}`}
      onClick={(e) => {
        // Ctrl/Cmd/middle-click should still open in a new tab natively --
        // only plain and shift-clicks are ours to intercept. Shift is
        // reserved for range-select (below) rather than wouter's Link,
        // which would otherwise swallow shift-clicks before our onClick
        // ever runs (it bails out early on any modifier key).
        if (e.ctrlKey || e.metaKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        if ((hasSelection || e.shiftKey) && onToggleSelect) {
          onToggleSelect(e);
        } else {
          navigate(href);
        }
      }}
    >
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border/50 transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-[0_0_20px_-5px_rgba(245,158,11,0.3)]">
        {onToggleSelect && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect(e);
            }}
            className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              isSelected
                ? "bg-primary border-primary opacity-100"
                : `bg-black/40 border-white/70 ${hasSelection ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
            }`}
            title={isSelected ? "Deselect" : "Select"}
          >
            {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />}
          </button>
        )}
        {onToggleFavorite && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-all ${
              isFavorite
                ? "bg-black/60 text-primary opacity-100"
                : "bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:text-primary"
            }`}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-primary" : ""}`} />
          </button>
        )}
        {hasThumbnail ? (
          <AdaptiveThumbnail
            src={thumbnail}
            alt={video.title}
            loading="lazy"
            className="w-full h-full transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#1877F2]/10">
            <Video className="w-10 h-10 text-[#1877F2] opacity-50" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 delay-75 shadow-lg">
            <Play className="w-5 h-5 ml-1" />
          </div>
        </div>

        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/80 text-[10px] font-medium text-white backdrop-blur-md">
          {video.category}
        </div>

        {isFacebook && (
          <div className={`absolute ${onToggleSelect ? "top-9" : "top-2"} left-2 px-1.5 py-0.5 rounded bg-[#1877F2] text-[9px] font-bold text-white tracking-wide`}>
            FB
          </div>
        )}

        {streamingService && (
          <div
            title={`Streaming on ${streamingService}`}
            className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/80 text-[10px] font-semibold text-white/90 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          >
            {streamingService}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 px-1">
        <h3 className="font-medium text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {video.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          Added {format(new Date(video.createdAt), "MMM d, yyyy")}
        </p>
        {showDescription && video.description && (
          <p className="text-xs text-muted-foreground/70 line-clamp-2 mt-0.5 italic">{video.description}</p>
        )}
      </div>
    </a>
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 animate-pulse">
      <div className="aspect-video rounded-xl bg-muted" />
      <div className="flex flex-col gap-2 px-1">
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-2/3" />
        <div className="h-3 bg-muted rounded w-1/3 mt-1" />
      </div>
    </div>
  );
}
