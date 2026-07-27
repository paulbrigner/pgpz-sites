"use client";

import { useId } from "react";
import { Textarea } from "@/components/ui/textarea";
import { LetterSummaryMarkdown } from "@/components/letters/LetterSummaryMarkdown";

type LetterSummaryFieldProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

export function LetterSummaryField({
  value,
  onChange,
  label = "Member-facing summary",
}: LetterSummaryFieldProps) {
  const id = useId();

  return (
    <div className="sm:col-span-2">
      <label
        htmlFor={id}
        className="text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <Textarea
        id={id}
        className="mt-1.5 min-h-32 font-mono"
        value={value}
        maxLength={2_000}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs leading-5 text-slate-500">
        <p>
          Markdown supported: headings, <code>**bold**</code>,{" "}
          <code>*italic*</code>, links, lists, quotes, code, and tables. Raw
          HTML and images are not displayed.
        </p>
        <p aria-live="polite">{value.length.toLocaleString()} / 2,000</p>
      </div>
      {value.trim() ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Member preview
          </p>
          <LetterSummaryMarkdown>{value}</LetterSummaryMarkdown>
        </div>
      ) : null}
    </div>
  );
}
