"use client";
import { imageUploadSizeError, IMAGE_UPLOAD_LIMIT_LABEL } from "@/lib/upload-limits.mjs";
import Link from "next/link";
import Image from "next/image";
import compactLogo from "../../public/brand/Small Logo.png";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { saveProfile } from "@/app/profile-actions";
import { LogoutForm } from "./account-forms";

type Profile = { name: string; email: string; avatar: string | null };

function ProfileEditor({ profile, close, busy, saved }: { profile: Profile; close: () => void; busy: (value: boolean) => void; saved: () => void }) {
  const [name, setName] = useState(profile.name);
  const [file, setFile] = useState(false);
  const [remove, setRemove] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current?.closest("dialog")?.open) input.current.focus(); return () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }; }, []);
  const [state, action, pending] = useActionState(async (previous: { error?: string; success?: string }, form: FormData) => {
    busy(true);
    try { const result = await saveProfile(previous, form); if (result.success) { saved(); close(); } return result; }
    finally { busy(false); }
  }, {});
  const changed = name.trim() !== profile.name || file || remove;
  const avatar = remove ? null : preview ?? profile.avatar;
  return <form action={action} aria-busy={pending}>
    <h2>Edit profile</h2>
    <fieldset disabled={pending} className="profile-fields">
      <div className="profile-avatar-preview">{avatar ? <Image src={avatar} alt="Your profile headshot" width={80} height={80} unoptimized/> : <span className="profile-avatar-placeholder" aria-label="No headshot">{(name.trim()[0] || "?").toUpperCase()}</span>}</div>
      <label>Your name<input ref={input} name="display_name" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)}/></label>
      <label>Verified login email<input type="email" value={profile.email} readOnly/><small>Your login email is managed by account authentication.</small></label>
      <label>Profile avatar / headshot<input ref={fileInput} type="file" name="avatar" accept="image/jpeg,image/png,image/webp" onChange={e => {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        const selected = e.target.files?.[0];
        e.currentTarget.setCustomValidity(imageUploadSizeError(selected?.size ?? 0));
        if (!e.currentTarget.reportValidity()) { previewUrl.current = null; setPreview(null); setFile(false); return; }
        const url = selected ? URL.createObjectURL(selected) : null;
        previewUrl.current = url; setPreview(url); setFile(!!selected); setRemove(false);
      }}/><small>JPEG, PNG or WebP, up to {IMAGE_UPLOAD_LIMIT_LABEL}. Saved as a cropped 256px square.</small></label>
      {profile.avatar && <label className="profile-remove"><input type="checkbox" name="remove_avatar" value="yes" checked={remove} onChange={e => {
        setRemove(e.target.checked);
        if (e.target.checked) { if (fileInput.current) { fileInput.current.value = ""; fileInput.current.setCustomValidity(""); } setFile(false); setPreview(null); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; }
      }}/>Remove current headshot</label>}
    </fieldset>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    <div className="profile-dialog-actions"><button className="button primary" disabled={!changed || pending} type="submit">{pending ? "Saving…" : "Save changes"}</button><button className="button secondary" type="button" disabled={pending} onClick={close}>Cancel</button></div>
  </form>;
}

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef(false);
  const id = useId();
  const path = usePathname();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json(); if (response.ok) setProfile(result.profile); else setProfile(null);
    }).catch(() => {});
    return () => controller.abort();
  }, [path, notice]);
  async function edit() {
    setOpen(false); setLoading(true); setError(""); setNotice("");
    dialog.current?.showModal();
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.profile) throw new Error(response.status === 401 ? "Log in with a confirmed account to edit your profile." : result.error || "Unable to load your profile. Please retry.");
      setProfile(result.profile); setSession(value => value + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  return <div ref={menu} className="account-menu" onPointerEnter={e => { if (e.pointerType === "mouse") setOpen(true); }} onPointerLeave={e => { if (e.pointerType === "mouse" && !menu.current?.contains(document.activeElement)) setOpen(false); }}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }} onKeyDown={e => {
      if (dialog.current?.open) return;
      if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); }
      if (e.key === "ArrowDown" && e.target === trigger.current) { e.preventDefault(); setOpen(true); requestAnimationFrame(() => menu.current?.querySelector("a")?.focus()); }
    }}>
    <button ref={trigger} type="button" className="button primary header-cta account-menu-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {profile?.avatar ? <Image src={profile.avatar} alt="" width={24} height={24} unoptimized/> : <span className="account-brand-mark"><Image src={compactLogo} alt="" width={32} height={16} sizes="32px"/></span>}My account <span aria-hidden="true">▾</span>
    </button>
    <div className="account-menu-links" id={id} hidden={!open}><Link href="/account" onClick={() => setOpen(false)}>Account home</Link><button type="button" onClick={edit}>Edit profile</button><LogoutForm/></div>
    <span className="sr-only" role="status">{notice}</span>
    <dialog ref={dialog} className="profile-dialog" aria-label="Edit profile" onClose={() => trigger.current?.focus()} onCancel={e => { if (pending.current) e.preventDefault(); }}>
      {loading ? <><p role="status">Loading your profile…</p><button className="button secondary" onClick={() => dialog.current?.close()}>Cancel</button></> : error ? <><p className="error" role="alert">{error}</p><div className="profile-dialog-actions"><button className="button primary" onClick={edit}>Retry</button><button className="button secondary" onClick={() => dialog.current?.close()}>Cancel</button></div></> : profile && <ProfileEditor key={session} profile={profile} close={() => dialog.current?.close()} busy={value => { pending.current = value; }} saved={() => setNotice("Profile changes saved.")}/>}
    </dialog>
  </div>;
}
