"use client";
import { ActionForm } from "./account-forms";
import { markListingUpdatesRead } from "@/app/notification-actions";
import { RefreshConversation } from "./conversation-forms";

export function MarkListingUpdatesRead({ ids, all = false }: { ids: string[]; all?: boolean }) {
  return <ActionForm action={async (state, form) => {
    const result = await markListingUpdatesRead(state, form);
    if (result.success) window.dispatchEvent(new Event("h2h-messages-updated"));
    return result;
  }} submit={all ? "Mark this page as read" : "Mark as read"} className="compact-action">
    {ids.map(id => <input key={id} type="hidden" name="notification_id" value={id}/>)}
  </ActionForm>;
}
export function RefreshNotifications() { return <RefreshConversation label="Refresh notifications"/>; }
