import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function JustPressIt() {
  const [, setLocation] = useLocation();

  return (
    <div className="fixed inset-0 bg-black">
      <button
        onClick={() => setLocation("/photos?tab=tab5")}
        className="absolute top-3 left-3 z-50 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-sm text-white/80 hover:bg-black/80 hover:text-white transition-colors backdrop-blur-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>
      <iframe
        src="/just-press-it.html"
        className="w-full h-full border-0"
        title="Just Press It — URLinc"
        allow="autoplay"
      />
    </div>
  );
}
