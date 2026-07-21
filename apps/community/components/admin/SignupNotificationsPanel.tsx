"use client";

import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Clock3, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

type PreferenceOption = {
  label: string;
  description: string;
};

type PreferencesResponse = {
  recipientEmail: string | null;
  delivery: {
    available: boolean;
    message: string | null;
  };
  preferences: {
    approvalRequested: boolean;
    successfulJoin: boolean;
  };
  options: {
    approvalRequested: PreferenceOption;
    successfulJoin: PreferenceOption | null;
  };
};

const emptyPreferences: PreferencesResponse["preferences"] = {
  approvalRequested: false,
  successfulJoin: false,
};

export function SignupNotificationsPanel() {
  const [recipientEmail, setRecipientEmail] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(emptyPreferences);
  const [options, setOptions] = useState<PreferencesResponse["options"] | null>(null);
  const [delivery, setDelivery] = useState<PreferencesResponse["delivery"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadPreferences = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/signup-notification-preferences", {
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "Failed to load notification preferences");
        if (!active) return;
        setRecipientEmail(typeof body.recipientEmail === "string" ? body.recipientEmail : null);
        setPreferences({
          approvalRequested: body.preferences?.approvalRequested === true,
          successfulJoin: body.preferences?.successfulJoin === true,
        });
        setOptions(body.options || null);
        setDelivery({
          available: body.delivery?.available === true,
          message: typeof body.delivery?.message === "string" ? body.delivery.message : null,
        });
      } catch (loadError: unknown) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load notification preferences",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadPreferences();
    return () => {
      active = false;
    };
  }, []);

  const savePreferences = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/signup-notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Failed to update notification preferences");
      setRecipientEmail(typeof body.recipientEmail === "string" ? body.recipientEmail : null);
      setPreferences({
        approvalRequested: body.preferences?.approvalRequested === true,
        successfulJoin: body.preferences?.successfulJoin === true,
      });
      setOptions(body.options || options);
      setDelivery({
        available: body.delivery?.available === true,
        message: typeof body.delivery?.message === "string" ? body.delivery.message : null,
      });
      setNotice("Notification preferences saved.");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to update notification preferences",
      );
    } finally {
      setSaving(false);
    }
  };

  const preferenceRows = options
    ? [
        {
          key: "approvalRequested" as const,
          option: options.approvalRequested,
          icon: Clock3,
        },
        ...(options.successfulJoin
          ? [
              {
                key: "successfulJoin" as const,
                option: options.successfulJoin,
                icon: CheckCircle2,
              },
            ]
          : []),
      ]
    : [];

  return (
    <section
      aria-labelledby="signup-notifications-heading"
      className="overflow-hidden rounded-2xl border bg-white/90 shadow-sm"
    >
      <div className="border-b bg-[linear-gradient(135deg,rgba(255,247,222,0.92),rgba(239,248,255,0.9))] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2
              id="signup-notifications-heading"
              className="flex items-center gap-2 text-lg font-semibold text-[var(--brand-ink)]"
            >
              <BellRing className="h-5 w-5 text-[var(--zcash-gold-deep)]" aria-hidden="true" />
              New-user email notifications
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Choose which signup events should be emailed to your administrator account. These choices
              apply only to you; every administrator manages their own notifications.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-2 text-xs text-slate-600">
            <Mail className="h-4 w-4" aria-hidden="true" />
            <span className="max-w-64 truncate">{recipientEmail || "Administrator account email"}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {loading ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600"
          >
            Loading notification preferences...
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {preferenceRows.map(({ key, option, icon: Icon }) => {
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-4 rounded-xl border bg-white px-4 py-4 transition hover:border-slate-300"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--brand-ice)] text-[var(--brand-ink)]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--brand-ink)]">{option.label}</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">
                      {option.description}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(event) => {
                      setPreferences((current) => ({ ...current, [key]: event.target.checked }));
                      setNotice(null);
                    }}
                    disabled={saving}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand-ink)]"
                  />
                </label>
              );
            })}
          </div>
        )}

        {!loading && delivery && !delivery.available ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            {delivery.message || "Email delivery is not currently available for your administrator account."}
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {error}
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            {notice}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-500">
            Notifications are off by default. Account suppression and admin access rules still apply.
          </p>
          <Button type="button" onClick={savePreferences} disabled={loading || saving || !options}>
            {saving ? "Saving..." : "Save notifications"}
          </Button>
        </div>
      </div>
    </section>
  );
}
