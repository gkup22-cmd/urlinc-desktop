import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Music2 } from "lucide-react";

const SOURCES = [
  {
    name: "Internet Archive",
    url: "https://archive.org/details/audio",
    color: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    description:
      "Millions of free audio recordings including live concerts, old-time radio, audiobooks, and music in the public domain. Most files are direct MP3/OGG downloads.",
    tip: "Search for a show or artist, then copy the direct .mp3 link from the download section.",
  },
  {
    name: "Free Music Archive",
    url: "https://freemusicarchive.org",
    color: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-500/30",
    bg: "bg-green-500/5",
    description:
      "Curated library of high-quality, legal audio downloads from independent artists. All tracks are under Creative Commons or similar open licenses.",
    tip: "Click a track, then use the download button to get the direct MP3 URL to paste into Add Track.",
  },
  {
    name: "Jamendo",
    url: "https://www.jamendo.com",
    color: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/30",
    bg: "bg-orange-500/5",
    description:
      "Over 600,000 tracks from independent musicians worldwide, all free for personal use under Creative Commons. Wide range of genres.",
    tip: "Right-click the play button on a track and copy the audio URL, or use their free download option.",
  },
  {
    name: "ccMixter",
    url: "https://ccmixter.org",
    color: "bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500/30",
    bg: "bg-purple-500/5",
    description:
      "Community music site featuring remixes, samples, and original tracks — all under Creative Commons licenses. Great for finding unique and experimental music.",
    tip: "Each track has a direct download link. Copy the MP3 URL from the download button.",
  },
];

export default function BrowseMusicPage() {
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border/50 bg-card/60 backdrop-blur-sm flex items-center gap-3 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setLocation("/music")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Music2 className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-base font-semibold truncate">Browse Music</h1>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <p className="text-sm text-muted-foreground mb-6">
              These sites offer music with direct MP3 links that play in the built-in player.
              Find a track, copy its direct audio URL, then use{" "}
              <button
                className="text-primary underline underline-offset-2 hover:opacity-80"
                onClick={() => setLocation("/add-music")}
              >
                Add Track
              </button>{" "}
              to add it to your library.
            </p>

            {SOURCES.map((src) => (
              <div
                key={src.name}
                className={`rounded-lg border ${src.border} ${src.bg} p-5 flex flex-col gap-3`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${src.color}`} />
                    <span className={`font-semibold text-sm ${src.text}`}>{src.name}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    onClick={() => window.open(src.url, "_blank", "noopener,noreferrer")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </Button>
                </div>

                <p className="text-sm text-foreground leading-relaxed">{src.description}</p>

                <div className="flex items-start gap-2 bg-background/60 rounded-md px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0 mt-0.5">Tip</span>
                  <p className="text-xs text-muted-foreground leading-relaxed">{src.tip}</p>
                </div>
              </div>
            ))}

            <div className="mt-6 rounded-lg border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">How to add a track:</strong> Once you find a direct
              audio link (ending in .mp3, .ogg, .flac, etc.), copy the URL and paste it into{" "}
              <button
                className="text-primary underline underline-offset-2 hover:opacity-80"
                onClick={() => setLocation("/add-music")}
              >
                Add Track
              </button>
              . The player will fetch the title and duration automatically for supported sources.
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
