import { useState, useEffect } from "react"; // v2
import { useSearch } from "wouter";
import { Loader2, Mail, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "loading" | "sent" | "error" | "resending";

export function LoginPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const errorParam = params.get("error");

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState(
    errorParam === "expired"
      ? "That sign-in link has expired or already been used. Please request a new one."
      : errorParam === "missing"
      ? "Invalid sign-in link. Please request a new one."
      : "",
  );

  useEffect(() => {
    if (errorParam) setStatus("error");
  }, [errorParam]);

  async function requestLink(emailAddress: string): Promise<void> {
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: emailAddress }),
    });
    // Use .catch so an HTML error page (Railway 502 during restart) doesn't
    // surface a raw SyntaxError — fall through to the generic message instead.
    const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (res.ok && data.ok) return;
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      await requestLink(trimmed);
      setStatus("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function handleResend() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setStatus("idle"); return; }
    setStatus("resending");
    setErrorMsg("");
    try {
      await requestLink(trimmed);
      setStatus("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm animate-in fade-in slide-in-from-bottom-6 duration-500">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-48 w-full overflow-hidden flex items-center justify-center">
            <img src="/urlair-logo.png?v=3" alt="URLinc" className="w-full h-full object-contain" />
          </div>
          <p className="text-sm text-muted-foreground">Your personal media vault</p>
        </div>

        {/* Sent confirmation */}
        {status === "sent" || status === "resending" ? (
          <div className="w-full space-y-5 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Check your email!</p>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                We sent a magic link to{" "}
                <span className="text-foreground font-medium">{email}</span>.
                <br />
                It expires in 15 minutes and can only be used once.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full h-12 gap-2"
                onClick={() => void handleResend()}
                disabled={status === "resending"}
              >
                {status === "resending"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />
                }
                Resend link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setStatus("idle"); setEmail(""); setErrorMsg(""); }}
              >
                Use a different email
              </Button>
            </div>
          </div>
        ) : (
          /* Email form */
          <form onSubmit={(e) => void handleSubmit(e)} className="w-full space-y-4">
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Enter your email to receive a sign-in link — no password needed.
            </p>

            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-14 text-base px-4"
              autoFocus
              required
              disabled={status === "loading"}
            />

            {errorMsg && (
              <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full h-14 text-base font-semibold gap-2"
              disabled={status === "loading" || !email.trim()}
            >
              {status === "loading"
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <Mail className="w-5 h-5" />
              }
              {status === "loading" ? "Sending…" : "Send me a login link"}
            </Button>
          </form>
        )}

      </div>
    </div>
  );
}

export default LoginPage;
