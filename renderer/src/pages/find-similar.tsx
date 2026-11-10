import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShoppingCart, ArrowLeft, Loader2, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Product {
  name: string;
  description: string;
  priceRange: string;
  category: string;
  imageUrl: string;
  affiliateUrl: string;
}

function ProductCard({ product }: { product: Product }) {
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
          <a href={product.affiliateUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-lg px-3 py-2 hover:bg-amber-500/20 transition-colors">
            <ShoppingCart className="h-3.5 w-3.5" /> Search Amazon
          </a>
          <a href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product.category)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg px-3 py-2 hover:bg-blue-500/20 transition-colors">
            <ShoppingCart className="h-3.5 w-3.5" /> Search eBay
          </a>
          <a href={`https://www.walmart.com/search?q=${encodeURIComponent(product.category)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 rounded-lg px-3 py-2 hover:bg-yellow-500/20 transition-colors">
            <ShoppingCart className="h-3.5 w-3.5" /> Search Walmart
          </a>
        </div>
      </div>
    </div>
  );
}

export default function FindSimilar() {
  const [, setLocation] = useLocation();
  const imageUrl = new URLSearchParams(window.location.search).get("imageUrl") ?? "";
  const pageContext = new URLSearchParams(window.location.search).get("context") ?? "";

  const [status, setStatus] = useState<"loading" | "done" | "error" | "no-url">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) { setStatus("no-url"); return; }

    fetch("/api/find-similar-by-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ imageUrl, context: pageContext || undefined }),
    })
      .then(async (r) => {
        const data = await r.json() as { labels?: string[]; products?: Product[]; error?: string };
        if (!r.ok) throw new Error(data.error ?? "API error");
        setLabels(data.labels ?? []);
        setProducts(data.products ?? []);
        setStatus("done");
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : "Could not analyze that image.");
        setStatus("error");
      });
  }, [imageUrl]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-amber-400" />
          <span className="font-semibold text-sm">Find Similar Items</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {imageUrl && (
          <div className="rounded-xl overflow-hidden border border-border bg-muted max-h-72 flex items-center justify-center">
            <img src={imageUrl} alt="Analyzed image" className="max-h-72 max-w-full object-contain" />
          </div>
        )}

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            <p className="text-sm">AI is analyzing the image…</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-sm text-destructive">{errorMsg || "Could not analyze that image. Make sure you're logged in to URLinc and try again."}</p>
          </div>
        )}

        {status === "no-url" && (
          <div className="flex items-start gap-3 rounded-xl border border-border px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">No image URL provided. Right-click an image on any webpage and choose "Find Similar Items on URLinc".</p>
          </div>
        )}

        {status === "done" && (
          <>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">AI detected:</span>
                {labels.map((label) => (
                  <button
                    key={label}
                    onClick={() => setActiveLabel(activeLabel === label ? null : label)}
                    className={`text-xs border rounded-full px-3 py-1 transition-colors ${
                      activeLabel === label
                        ? "bg-amber-500 text-black border-amber-500 font-semibold"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {activeLabel && (
                  <span className="text-xs text-muted-foreground">— tap again to show all</span>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(activeLabel
                ? products.filter((p) => p.category === activeLabel)
                : products
              ).map((product, i) => (
                <ProductCard key={i} product={product} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
