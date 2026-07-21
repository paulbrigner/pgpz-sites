"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ResourceSubmissionForm({
  showSupportingLinks = false,
}: {
  showSupportingLinks?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitResource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/resources/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url, details }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "Unable to submit resource for review");
      }

      setTitle("");
      setUrl("");
      setDetails("");
      setMessage("Resource added to the PGPZ moderation queue.");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to submit resource for review",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="mt-5 space-y-4" onSubmit={submitResource}>
      {message ? (
        <Alert className="bg-emerald-50 text-[var(--brand-teal)]">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Submitted</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Submission issue</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium text-[var(--brand-ink)]">
          Resource title
          <input
            required
            maxLength={140}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-10 w-full rounded-md border border-[rgba(245,168,0,0.28)] bg-white px-3 text-sm text-[var(--brand-ink)] outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]"
            placeholder="Policy explainer, meeting note, campaign idea"
          />
        </label>
        <label className="space-y-1.5 text-sm font-medium text-[var(--brand-ink)]">
          Link <span className="font-normal text-slate-500">(optional)</span>
          <input
            type="url"
            maxLength={300}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="h-10 w-full rounded-md border border-[rgba(245,168,0,0.28)] bg-white px-3 text-sm text-[var(--brand-ink)] outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]"
            placeholder="https://"
          />
        </label>
      </div>

      <label className="space-y-1.5 text-sm font-medium text-[var(--brand-ink)]">
        Notes for the PGPZ team
        <textarea
          required
          maxLength={4000}
          rows={5}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          className="w-full resize-y rounded-md border border-[rgba(245,168,0,0.28)] bg-white px-3 py-2 text-sm leading-6 text-[var(--brand-ink)] outline-none transition focus:border-[var(--brand-denim)] focus:ring-2 focus:ring-[rgba(47,111,104,0.18)]"
          placeholder="Share context, urgency, suggested use, or who should follow up."
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="submit"
          className="w-full sm:w-auto"
          isLoading={submitting}
          disabled={submitting}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Submit for review
        </Button>
        {showSupportingLinks ? (
          <>
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <Link href="/resources">Browse approved resources</Link>
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" asChild>
              <Link href="https://pgpz.org" target="_blank" rel="noopener noreferrer">
                Visit PGPZ.org
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </>
        ) : null}
      </div>
    </form>
  );
}
