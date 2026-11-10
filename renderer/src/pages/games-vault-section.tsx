import { useRoute, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PuzzleGamesSection } from "@/components/puzzle-games-section";
import { HuntGamesSection } from "@/components/hunt-games-section";
import { MemoryGamesSection } from "@/components/memory-games-section";
import { SlideGamesSection } from "@/components/slide-games-section";
import { WordSearchGamesSection } from "@/components/wordsearch-games-section";
import { SpeedSortGamesSection } from "@/components/speedsort-games-section";
import { CaptionDuelsSection } from "@/components/caption-duels-section";
import { MovieBracketsSection } from "@/components/movie-brackets-section";

const TITLES: Record<string, string> = {
  "puzzle": "Jigsaw Puzzles",
  "seek-find": "Seek & Find",
  "slide": "Sliding Puzzle",
  "memory": "Memory Match",
  "word-search": "Word Search",
  "speedsort": "Speed Sort",
  "caption-duel": "Caption Duel",
  "movie-bracket": "Movie Night Bracket",
};

export default function GamesVaultSection() {
  const [, params] = useRoute("/games-vault/:game");
  const [, setLocation] = useLocation();
  const game = params?.game ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-[#121212] text-[#E0E0E0]">
      <div className="border-b border-white/5 px-6 py-3">
        <button
          onClick={() => setLocation("/games-vault")}
          className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Games Vault
        </button>
      </div>

      <div className="flex-1 py-4">
        {game === "puzzle" && <PuzzleGamesSection />}
        {game === "seek-find" && <HuntGamesSection />}
        {game === "slide" && <SlideGamesSection />}
        {game === "memory" && <MemoryGamesSection />}
        {game === "word-search" && <WordSearchGamesSection />}
        {game === "speedsort" && <SpeedSortGamesSection />}
        {game === "caption-duel" && <CaptionDuelsSection />}
        {game === "movie-bracket" && <MovieBracketsSection />}
        {!TITLES[game] && (
          <div className="flex items-center justify-center py-20 text-white/30 text-sm">
            Game not found.
          </div>
        )}
      </div>
    </div>
  );
}
