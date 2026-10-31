"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(true);
  const [message, setMessage] = useState("Loading security verification…");
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < 300));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!ready || !container.current || !window.turnstile) return;
    const api = window.turnstile;
    const clear = (message: string) => { onToken(""); setMessage(message); };
    try {
      onToken("");
      widget.current = api.render(container.current, {
        sitekey: siteKey, theme: "light", size: compact ? "compact" : "flexible", "response-field": false,
        callback: (token: string) => { onToken(token); setMessage("Verification complete."); },
        "expired-callback": () => clear("Verification expired. Please verify again."),
        "error-callback": () => { clear("Verification unavailable. Retry, or reload this page."); return true; },
        "timeout-callback": () => clear("Verification timed out. Please retry."),
      });
    } catch { clear("Verification could not load. Reload this page to try again."); }
    return () => { if (widget.current !== undefined) api.remove(widget.current); widget.current = undefined; };
  }, [ready, siteKey, onToken, compact]);
  useEffect(() => {
    // Multiple forms can share Next's single script load; each mounted widget
    // must also notice an API that became ready for another form.
    const poll = window.setInterval(() => {
      if (window.turnstile) { setReady(true); window.clearInterval(poll); }
    }, 100);
    const timer = window.setTimeout(() => {
      window.clearInterval(poll);
      if (!window.turnstile) setMessage("Verification could not load. Check your connection or content blocker, then reload this page.");
    }, 15000);
    return () => { window.clearTimeout(timer); window.clearInterval(poll); };
  }, []);
  return <div className="auth-verification">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive"
      onReady={() => setReady(true)} onError={() => { onToken(""); setMessage("Verification could not load. Reload this page to try again."); }}/>
    <div ref={container}/>
    <small role="status">{message}</small>
    <button type="button" className="text-button" onClick={() => {
      onToken(""); setMessage("Please complete security verification.");
      if (widget.current !== undefined) window.turnstile?.reset(widget.current);
      else window.location.reload();
    }}>Retry verification</button>
  </div>;
}
