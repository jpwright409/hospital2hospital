"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { switchMessageFacility } from "@/app/conversation-actions";
import { ActionForm } from "./account-forms";

export type MessageFacility = { id: string; name: string; unread: number };
export function MessageFacilitySwitcher({ facilities, activeId }: {
  facilities: MessageFacility[]; activeId: string | null;
}) {
  if (!facilities.length) return null;
  return <ActionForm action={switchMessageFacility} submit="Switch facility" className="message-facility-switcher">
    <label>Facility inbox<select key={activeId ?? "none"} name="facility_id" defaultValue={activeId ?? ""} required>
      <option value="" disabled>Choose an approved facility</option>
      {facilities.map(f => <option key={f.id} value={f.id}>{f.name}{Number(f.unread) > 0 ? ` (${f.unread} unread)` : ""}</option>)}
    </select></label>
  </ActionForm>;
}

// Visible-tab polling avoids Realtime and refreshes on navigation/read receipts.
export function MessageNotifications() {
  const path = usePathname();
  const [state, setState] = useState<{ facilities: MessageFacility[]; listingUpdates?: number; error?: string } | null>(null);
  useEffect(() => {
    let stopped = false;
    let request: AbortController | null = null;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      request?.abort();
      request = new AbortController();
      try {
        const response = await fetch("/api/message-notifications", { cache: "no-store", signal: request.signal });
        const result = await response.json();
        if (!stopped) setState(response.ok ? result : { facilities: [], error: result.error ?? "Notifications unavailable. Open notifications to retry." });
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === "AbortError"))
          setState({ facilities: [], error: "Notification counts unavailable. Open notifications to retry." });
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const update = () => void refresh();
    window.addEventListener("h2h-messages-updated", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      stopped = true; request?.abort(); clearInterval(timer);
      window.removeEventListener("h2h-messages-updated", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [path]);
  const messageUnread = state?.facilities.reduce((sum, f) => sum + Number(f.unread), 0) ?? 0;
  const listingUnread = state?.listingUpdates ?? 0;
  const unread = messageUnread + listingUnread;
  const label = !state ? "Checking notifications" : state.error ? state.error : `Notifications: ${messageUnread} unread messages and ${listingUnread} saved listing updates`;
  return <div className="message-notification">
    <Link href="/notifications" className="notification-button" aria-label={label} title={label}>
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>
      {unread > 0 && <span className="count">{unread > 99 ? "99+" : unread}</span>}
      {state?.error && <span className="notification-error" aria-hidden="true">!</span>}
    </Link>
    <span className="sr-only" role="status">{label}</span>
  </div>;
}
