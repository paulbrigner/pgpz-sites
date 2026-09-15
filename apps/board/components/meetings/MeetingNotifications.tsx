"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bell } from "lucide-react";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import { MEETING_NOTIFICATION_CATEGORIES, type MeetingNotificationCategory, type MeetingNotificationPreference } from "@/lib/meeting-notifications";

export function MeetingNotifications({ meetingId }: { meetingId: string }) {
  const [preference, setPreference] = useState<MeetingNotificationPreference | null>(null);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [ballots, setBallots] = useState<{ id: string; title: string }[]>([]);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const url = `/api/meetings/${encodeURIComponent(meetingId)}/notifications`;
  useEffect(() => {
    const openLinkedSettings = () => { if (window.location.hash === "#meeting-notifications") setExpanded(true); };
    openLinkedSettings(); window.addEventListener("hashchange", openLinkedSettings);
    return () => window.removeEventListener("hashchange", openLinkedSettings);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setPreference(null); setNotice("");
    void fetch(url, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load notification settings.");
      if (!cancelled) { setPreference(result.preference); setSavedEnabled(result.preference.enabled); setBallots(result.ballots); setEmail(result.email); }
    }).catch((error) => { if (!cancelled) setNotice(error.message); });
    return () => { cancelled = true; };
  }, [url, reload]);
  async function save(event: FormEvent) {
    event.preventDefault(); setPending(true); setNotice("");
    try {
      const response = await fetchWithBoardStepUp(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(preference) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save notification settings.");
      setPreference(result.preference); setSavedEnabled(result.preference.enabled);
      setNotice(result.preference.enabled ? "Saved. You’ll receive emails for future matching updates." : "Saved. Update emails for this meeting are off.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save notification settings."); }
    finally { setPending(false); }
  }
  const checkbox = "mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]";
  return <details id="meeting-notifications" open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)} className="mt-4 scroll-mt-28 rounded-2xl border border-[var(--border)] bg-white">
    <summary className="cursor-pointer rounded-2xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--focus)]"><Bell className="mr-2 inline h-4 w-4" aria-hidden="true" />Email notifications <span className="ml-2 text-[var(--muted)]">{preference ? savedEnabled ? "On" : "Off" : "Settings"}</span></summary>
    <form onSubmit={save} className="border-t border-[var(--border)] p-4 text-sm">
      <p className="max-w-3xl text-[var(--muted)]">Choose which updates to receive by email. Emails link back to the meeting and only cover activity you have access to. Official meeting notices and direct replies to your review assessments are handled separately.</p>
      {preference ? <fieldset disabled={pending} className="mt-4 grid gap-4 disabled:opacity-60">
        <label className="flex items-start gap-2 font-semibold"><input type="checkbox" className={checkbox} checked={preference.enabled} onChange={(e) => setPreference({ ...preference, enabled: e.target.checked })} />Email me updates for this meeting</label>
        <p className="text-xs text-[var(--muted)] [overflow-wrap:anywhere]">Sent to {email}. Changes apply to future updates; turning off stops queued updates too.</p>
        {preference.enabled && <>
          <fieldset className="grid gap-2"><legend className="mb-2 font-semibold">Follow</legend>
            <label className="flex gap-2"><input type="radio" name="notificationScope" checked={preference.scope === "meeting"} onChange={() => setPreference({ ...preference, scope: "meeting" })} />Entire meeting and all resolutions</label>
            <label className="flex gap-2"><input type="radio" name="notificationScope" checked={preference.scope === "items"} onChange={() => setPreference({ ...preference, scope: "items" })} />Selected resolutions only</label>
            {preference.scope === "items" && <div className="ml-6 grid max-h-64 gap-3 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
              {ballots.length ? ballots.map((ballot) => <label className="flex items-start gap-2 [overflow-wrap:anywhere]" key={ballot.id}><input type="checkbox" className={checkbox} checked={preference.ballotIds.includes(ballot.id)} onChange={(e) => setPreference({ ...preference, ballotIds: e.target.checked ? [...preference.ballotIds, ballot.id] : preference.ballotIds.filter((id) => id !== ballot.id) })} />{ballot.title}</label>) : <p>No resolutions are available yet. Follow the entire meeting to hear when resolutions become available.</p>}
            </div>}
          </fieldset>
          <fieldset><legend className="mb-2 font-semibold">Updates to include</legend><div className="grid gap-3 sm:grid-cols-2">
            {(Object.entries(MEETING_NOTIFICATION_CATEGORIES) as [MeetingNotificationCategory, string][]).filter(([key]) => preference.scope === "meeting" || ["materials", "resolutions", "discussion", "reviews", "consents"].includes(key)).map(([key, label]) => <label className="flex items-start gap-2" key={key}><input type="checkbox" className={checkbox} checked={preference.categories.includes(key)} onChange={(e) => setPreference({ ...preference, categories: e.target.checked ? [...preference.categories, key] : preference.categories.filter((c) => c !== key) })} />{label}</label>)}
          </div><p className="mt-3 text-xs text-[var(--muted)]">Review activity is limited to directors. Executive Session updates are limited to admitted participants. Selecting resolutions excludes general meeting and preparation-material updates.</p></fieldset>
          <label className="flex items-start gap-2"><input type="checkbox" className={checkbox} checked={preference.includeOwn} onChange={(e) => setPreference({ ...preference, includeOwn: e.target.checked })} />Also notify me about my own changes</label>
        </>}
        <button type="submit" className="w-fit rounded-full bg-[var(--primary)] px-4 py-2 font-semibold text-white">{pending ? "Saving…" : "Save notification settings"}</button>
      </fieldset> : !notice && <p className="mt-3">Loading settings…</p>}
      {notice && <p role="status" className="mt-3 [overflow-wrap:anywhere]">{notice}</p>}
      {notice && <button type="button" disabled={pending} onClick={() => setReload((n) => n + 1)} className="mt-2 font-semibold underline">Reload saved settings</button>}
    </form>
  </details>;
}
