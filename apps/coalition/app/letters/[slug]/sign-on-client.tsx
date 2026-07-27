"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Download,
  FileCheck2,
  Loader2,
  Mail,
  UserRound,
  UsersRound,
} from "lucide-react";
import type {
  LetterCampaign,
  LetterSignOn,
} from "@/lib/letter-signons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LetterSummaryMarkdown } from "@/components/letters/LetterSummaryMarkdown";

type PublicSigner = {
  userId: string;
  signerKind: "individual" | "organization";
  displayName: string;
  organizationName: string | null;
  title: string | null;
  affiliation: string | null;
  acceptedAt: string;
};

type Props = {
  campaign: LetterCampaign;
  initialSignOn: LetterSignOn | null;
  initialSigners: PublicSigner[];
  member: {
    displayName: string;
    title: string | null;
    affiliation: string | null;
  };
  adminPreview: boolean;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(new Date(value));

export default function LetterSignOnClient({
  campaign,
  initialSignOn,
  initialSigners,
  member,
  adminPreview,
}: Props) {
  const router = useRouter();
  const [signerKind, setSignerKind] = useState<"individual" | "organization">(
    initialSignOn?.signerKind || "individual",
  );
  const [displayName, setDisplayName] = useState(
    initialSignOn?.displayName || member.displayName,
  );
  const [organizationName, setOrganizationName] = useState(
    initialSignOn?.organizationName || "",
  );
  const [title, setTitle] = useState(
    initialSignOn?.title || member.title || "",
  );
  const [affiliation, setAffiliation] = useState(
    initialSignOn?.affiliation || member.affiliation || "",
  );
  const [authorized, setAuthorized] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const signOnOpen = campaign.effectiveStatus === "open";
  const needsReconfirmation =
    !!initialSignOn && !initialSignOn.withdrawnAt && !initialSignOn.current;
  const activeSignOn =
    !!initialSignOn && initialSignOn.current && !initialSignOn.withdrawnAt;
  const signerGroups = useMemo(
    () => ({
      organizations: initialSigners.filter(
        (signer) => signer.signerKind === "organization",
      ),
      individuals: initialSigners.filter(
        (signer) => signer.signerKind === "individual",
      ),
    }),
    [initialSigners],
  );
  const documentUrl = `/api/letters/${encodeURIComponent(campaign.slug)}/document${adminPreview ? "?admin=1" : ""}`;

  async function submitSignOn(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/letters/${encodeURIComponent(campaign.slug)}/sign-on`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sign",
            signerKind,
            displayName,
            organizationName,
            title,
            affiliation,
            authorizedForOrganization: authorized,
            consent,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Sign-on failed.");
      setMessage({
        tone: body.warning ? "warning" : "success",
        text:
          body.warning ||
          "Your sign-on is confirmed. We sent the exact PDF and receipt to your account email.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The sign-on could not be recorded.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function withdraw() {
    if (
      !window.confirm(
        "Withdraw your sign-on? Your name will be removed from the current signer list.",
      )
    ) {
      return;
    }
    setWithdrawing(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/letters/${encodeURIComponent(campaign.slug)}/sign-on`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "withdraw" }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Withdrawal failed.");
      setMessage({
        tone: "success",
        text: "Your sign-on was withdrawn and removed from the current signer list.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "The sign-on could not be withdrawn.",
      });
    } finally {
      setWithdrawing(false);
    }
  }

  async function resendConfirmation() {
    setResending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/letters/${encodeURIComponent(campaign.slug)}/sign-on`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "resendConfirmation" }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Confirmation delivery failed.");
      }
      setMessage({
        tone: "success",
        text: "The confirmation receipt and exact signed PDF were sent again.",
      });
      router.refresh();
    } catch (error) {
      setMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Confirmation delivery failed.",
      });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-5 pb-16">
      <Link
        href="/letters"
        className="text-sm font-semibold text-[var(--brand-denim)] underline"
      >
        All Coalition letters
      </Link>
      <div className="mt-5 grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,0.85fr)]">
        <main className="min-w-0 space-y-6">
          {adminPreview ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
              Administrator preview: this draft is not visible to members and
              cannot accept sign-ons until you change its status to open.
            </div>
          ) : null}
          <section className="glass-surface p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[var(--brand-ink)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--zcash-gold)]">
                {campaign.effectiveStatus}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Deadline: {formatDate(campaign.deadlineAt)}
              </span>
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[var(--brand-ink)] sm:text-4xl">
              {campaign.title}
            </h1>
            {campaign.summary ? (
              <LetterSummaryMarkdown className="mt-4">
                {campaign.summary}
              </LetterSummaryMarkdown>
            ) : null}
            {campaign.recipient ? (
              <p className="mt-4 text-sm leading-6 text-slate-600">
                <strong className="text-[var(--brand-ink)]">Addressed to:</strong>{" "}
                {campaign.recipient}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                Version {campaign.currentDocument.version}
              </span>
              <span
                className="inline-flex max-w-full items-center rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-600"
                title={campaign.currentDocument.sha256}
              >
                SHA-256 {campaign.currentDocument.sha256.slice(0, 16)}…
              </span>
              <Button asChild variant="outline" size="sm">
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  Open PDF
                </a>
              </Button>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
            <iframe
              title={`Draft letter: ${campaign.title}`}
              src={documentUrl}
              className="h-[72vh] min-h-[40rem] w-full bg-white"
            />
          </section>
        </main>

        <aside className="space-y-6">
          <section className="glass-surface p-6">
            <h2 className="text-xl font-semibold text-[var(--brand-ink)]">
              {activeSignOn
                ? "Your sign-on is current"
                : needsReconfirmation
                  ? "Reconfirmation required"
                  : signOnOpen
                    ? "Sign on to this letter"
                    : "Sign-on period closed"}
            </h2>
            {activeSignOn ? (
              <div className="mt-4">
                <p className="flex items-start gap-2 text-sm leading-6 text-slate-600">
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  Confirmed as{" "}
                  <strong className="text-[var(--brand-ink)]">
                    {initialSignOn.signerKind === "organization"
                      ? initialSignOn.organizationName
                      : initialSignOn.displayName}
                  </strong>{" "}
                  on {formatDate(initialSignOn.acceptedAt)}.
                </p>
                {signOnOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5"
                    onClick={withdraw}
                    disabled={withdrawing}
                  >
                    {withdrawing ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    Withdraw sign-on
                  </Button>
                ) : null}
                {initialSignOn.confirmationStatus !== "sent" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={resendConfirmation}
                    disabled={resending}
                  >
                    {resending ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Resend confirmation
                  </Button>
                ) : null}
              </div>
            ) : signOnOpen ? (
              <form className="mt-5 space-y-4" onSubmit={submitSignOn}>
                {needsReconfirmation ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                    A material change was made after your last acceptance.
                    Review version {campaign.currentDocument.version} and
                    confirm again to return to the signer list.
                  </div>
                ) : null}
                <fieldset>
                  <legend className="text-sm font-semibold text-[var(--brand-ink)]">
                    Signer type
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(["individual", "organization"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setSignerKind(kind)}
                        aria-pressed={signerKind === kind}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                          signerKind === kind
                            ? "border-[var(--brand-denim)] bg-[var(--brand-ice)] text-[var(--brand-denim)]"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {kind === "individual" ? (
                          <UserRound className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Building2 className="h-4 w-4" aria-hidden="true" />
                        )}
                        {kind === "individual" ? "Individual" : "Organization"}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="block text-sm font-medium text-slate-700">
                  {signerKind === "organization"
                    ? "Authorized signatory"
                    : "Name as it should appear"}
                  <Input
                    className="mt-1.5"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={160}
                    required
                  />
                </label>
                {signerKind === "organization" ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Organization or project
                    <Input
                      className="mt-1.5"
                      value={organizationName}
                      onChange={(event) =>
                        setOrganizationName(event.target.value)
                      }
                      maxLength={180}
                      required
                    />
                  </label>
                ) : null}
                <label className="block text-sm font-medium text-slate-700">
                  Title
                  <Input
                    className="mt-1.5"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={180}
                  />
                </label>
                {signerKind === "individual" ? (
                  <label className="block text-sm font-medium text-slate-700">
                    Affiliation for identification
                    <Input
                      className="mt-1.5"
                      value={affiliation}
                      onChange={(event) => setAffiliation(event.target.value)}
                      maxLength={180}
                    />
                  </label>
                ) : null}
                {signerKind === "organization" ? (
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                    <input
                      type="checkbox"
                      checked={authorized}
                      onChange={(event) => setAuthorized(event.target.checked)}
                      className="mt-1 h-4 w-4"
                      required
                    />
                    I am authorized to add this organization or project as a
                    signatory.
                  </label>
                ) : null}
                <label className="flex items-start gap-3 rounded-xl border border-[rgba(245,168,0,0.35)] bg-[#fffaf0] p-4 text-sm leading-6 text-slate-700">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    className="mt-1 h-4 w-4"
                    required
                  />
                  I reviewed version {campaign.currentDocument.version},
                  support this letter, and authorize PGPZ to publish the signer
                  information entered above. I understand material changes
                  require reconfirmation.
                </label>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2
                      className="mr-2 h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileCheck2
                      className="mr-2 h-4 w-4"
                      aria-hidden="true"
                    />
                  )}
                  {needsReconfirmation ? "Reconfirm sign-on" : "Confirm sign-on"}
                </Button>
              </form>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-600">
                The deadline was {formatDate(campaign.deadlineAt)}. The signer
                list remains available for review.
              </p>
            )}

            {message ? (
              <div
                role="status"
                className={`mt-5 flex items-start gap-2 rounded-xl border p-4 text-sm leading-6 ${
                  message.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : message.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {message.tone === "success" ? (
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {message.text}
              </div>
            ) : null}
          </section>

          <section className="glass-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-[var(--brand-ink)]">
                Current signers
              </h2>
              <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                <UsersRound className="h-4 w-4" aria-hidden="true" />
                {initialSigners.length}
              </span>
            </div>
            {signerGroups.organizations.length ? (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Organizations and projects
                </h3>
                <ul className="mt-3 space-y-3">
                  {signerGroups.organizations.map((signer) => (
                    <li
                      key={signer.userId}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <p className="font-semibold text-[var(--brand-ink)]">
                        {signer.organizationName}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {signer.displayName}
                        {signer.title ? `, ${signer.title}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {signerGroups.individuals.length ? (
              <div className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Individuals
                </h3>
                <ul className="mt-3 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">
                  {signerGroups.individuals.map((signer) => (
                    <li key={signer.userId} className="py-3">
                      <p className="font-semibold text-[var(--brand-ink)]">
                        {signer.displayName}
                      </p>
                      {signer.title || signer.affiliation ? (
                        <p className="mt-1 text-sm text-slate-600">
                          {[signer.title, signer.affiliation]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!initialSigners.length ? (
              <p className="mt-4 text-sm leading-6 text-slate-600">
                No current signers yet. Confirmed sign-ons will appear here.
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  );
}
