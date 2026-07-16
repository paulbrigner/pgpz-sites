#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import {
  buildPolicyUpdateForumMarkdown,
  policyUpdateMarkdownImageUrls,
} from "@/lib/policy-update-markdown";
import type {
  PolicyUpdate,
  PolicyUpdateCategory,
  PolicyUpdateImage,
  PolicyUpdateSection,
} from "@/lib/policy-updates";

type CliOptions = {
  slug: string;
  output: string;
  pdf?: string;
  source: "generated" | "pdf";
  siteUrl: string;
  greeting: string;
  category: PolicyUpdateCategory;
  title?: string;
  shortTitle?: string;
  publishedAt?: string;
  displayDate?: string;
  summary?: string;
  emailSubject?: string;
  emailPreheader?: string;
};

type ExtractedPdf = {
  links: Array<{ page: number; text: string; href: string }>;
  images: PolicyUpdateImage[];
};

function usage() {
  return `Usage:
  npm run forum:update -- --slug <policy-update-slug> [--output output/file.md]

Generated-record export, recommended after admin page generation:
  npm run forum:update -- --slug 2026-06-15-weekly-policy-memo --output output/zcash-forum-weekly-policy-memo-2026-06-15.md

PDF fallback, useful before a generated record exists:
  npm run forum:update -- --source pdf --pdf "/path/to/memo.pdf" --slug 2026-06-15-weekly-policy-memo --title "Weekly Policy Memo: June 15, 2026" --published-at 2026-06-15 --summary "FinCEN AML rulemaking..."`;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "") || "https://community.pgpz.org";
}

function parseArgs(argv: string[]): CliOptions {
  const values = new Map<string, string>();
  const flags = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s);
    const key = rawKey.trim();
    if (!key) throw new Error(`Invalid argument: ${arg}`);

    if (inlineValue !== undefined) {
      values.set(key, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }

    values.set(key, next);
    index += 1;
  }

  if (flags.has("help") || flags.has("h")) {
    console.log(usage());
    process.exit(0);
  }

  const slug = values.get("slug")?.trim();
  if (!slug) throw new Error("Missing required --slug.");

  const sourceValue = values.get("source")?.trim().toLowerCase();
  return {
    slug,
    output: values.get("output")?.trim() || `output/zcash-forum-${slug}.md`,
    pdf: values.get("pdf")?.trim(),
    source: sourceValue === "pdf" ? "pdf" : "generated",
    siteUrl: normalizeBaseUrl(
      values.get("site-url") ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.BETTER_AUTH_URL ||
        "https://community.pgpz.org",
    ),
    greeting: values.get("greeting")?.trim() || "Hi everyone,",
    category: values.get("category") === "special" ? "special" : "weekly",
    title: values.get("title")?.trim(),
    shortTitle: values.get("short-title")?.trim(),
    publishedAt: values.get("published-at")?.trim(),
    displayDate: values.get("display-date")?.trim(),
    summary: values.get("summary")?.trim(),
    emailSubject: values.get("email-subject")?.trim(),
    emailPreheader: values.get("email-preheader")?.trim(),
  };
}

function socialImageAssetName(href: string, index: number) {
  try {
    const parsed = new URL(href);
    const username = parsed.pathname.split("/").filter(Boolean)[0] || `post-${index}`;
    const normalized = username.toLowerCase();
    if (normalized === "jswihart") return "x-josh-swihart.png";
    if (normalized === "warrendavidson") return "x-warren-davidson.png";
    if (normalized === "jbsdc") return "x-justin-slaughter.png";
    if (normalized === "austincampbell") return "x-austin-campbell.png";
    return `x-${username.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${index}.png`;
  } catch {
    return `x-post-${index}.png`;
  }
}

function socialDisplayName(href: string) {
  try {
    const username = new URL(href).pathname.split("/").filter(Boolean)[0] || "X";
    const normalized = username.toLowerCase();
    if (normalized === "jswihart") return "Josh Swihart";
    if (normalized === "warrendavidson") return "Warren Davidson";
    if (normalized === "jbsdc") return "Justin Slaughter";
    if (normalized === "austincampbell") return "Austin Campbell";
    return username.replace(/[-_]+/g, " ");
  } catch {
    return "X";
  }
}

function fallbackSocialSections(slug: string, links: ExtractedPdf["links"]) {
  const xLinks = links
    .filter((link) => /(?:x|twitter)\.com\//i.test(link.href))
    .filter((link, index, all) => all.findIndex((candidate) => candidate.href === link.href) === index);

  return xLinks.map((link, index): PolicyUpdateSection => {
    const displayName = socialDisplayName(link.href);
    return {
      heading: index === 0 ? "X Post of the Week" : index === 1 ? "Notable Post" : "Notable Posts",
      body: [],
      images: [
        {
          src: `/api/policy-updates/${encodeURIComponent(slug)}/assets/${socialImageAssetName(link.href, index + 1)}`,
          alt: `${displayName} X post screenshot`,
          caption: `${displayName} X post embedded in the source memo.`,
          href: link.href,
        },
      ],
    };
  });
}

function insertFallbackSocialSections(sections: PolicyUpdateSection[], socialSections: PolicyUpdateSection[]) {
  if (!socialSections.length) return sections;
  if (sections.some((section) => section.images?.length)) return sections;

  const output: PolicyUpdateSection[] = [];
  let socialIndex = 0;

  for (const section of sections) {
    if (socialIndex === 0 && /financial services committee|fincen|aml/i.test(section.heading)) {
      output.push(socialSections[socialIndex]);
      socialIndex += 1;
    }
    output.push(section);
    if (socialIndex < socialSections.length && /fincen|illinois|stablecoin/i.test(section.heading)) {
      output.push(socialSections[socialIndex]);
      socialIndex += 1;
    }
  }

  while (socialIndex < socialSections.length) {
    output.push(socialSections[socialIndex]);
    socialIndex += 1;
  }

  return output;
}

async function loadGeneratedUpdate(slug: string) {
  const { getDistributablePolicyUpdate } = await import("../lib/admin/policy-update-uploads");
  return getDistributablePolicyUpdate(slug);
}

async function loadPdfFallbackUpdate(options: CliOptions): Promise<PolicyUpdate> {
  if (!options.pdf) throw new Error("PDF fallback requires --pdf.");
  if (!existsSync(options.pdf)) throw new Error(`PDF not found: ${options.pdf}`);

  const [
    { extractPolicyUpdatePdfContent, sourcePolicyUpdateContent },
    { policyUpdateCategoryLabels },
  ] = await Promise.all([
    import("../lib/admin/policy-update-generation"),
    import("../lib/policy-updates"),
  ]);

  const publishedAt = options.publishedAt || new Date().toISOString().slice(0, 10);
  const categoryLabel = policyUpdateCategoryLabels[options.category];
  const title = options.title || `${categoryLabel}: ${publishedAt}`;
  const summary = options.summary || "";
  const record = {
    slug: options.slug,
    category: options.category,
    title,
    shortTitle: options.shortTitle || title,
    publishedAt,
    displayDate:
      options.displayDate ||
      (options.category === "weekly" ? `Week of ${publishedAt}` : publishedAt),
    summary,
    emailSubject: options.emailSubject || `PGPZ ${categoryLabel}: ${title}`,
    emailPreheader: options.emailPreheader || summary,
    keyTakeaways: [],
    actionItems: [],
    sections: [],
  };

  const extracted = await extractPolicyUpdatePdfContent(readFileSync(options.pdf));
  const content = sourcePolicyUpdateContent(record as any, extracted);
  const sections = insertFallbackSocialSections(
    content.sections,
    fallbackSocialSections(options.slug, extracted.links),
  );

  return {
    slug: options.slug,
    category: options.category,
    categoryLabel,
    title,
    shortTitle: content.shortTitle || record.shortTitle,
    publishedAt,
    displayDate: record.displayDate,
    summary: content.summary || summary,
    emailSubject: content.emailSubject || record.emailSubject,
    emailPreheader: content.emailPreheader || record.emailPreheader,
    coverImage: "",
    pdfHref: `/api/policy-updates/${encodeURIComponent(options.slug)}/pdf`,
    portalPath: `/updates/${options.slug}`,
    keyTakeaways: content.keyTakeaways,
    actionItems: content.actionItems,
    sections,
  };
}

async function loadUpdate(options: CliOptions): Promise<{ update: PolicyUpdate; source: "generated" | "pdf" }> {
  if (options.source === "pdf") return { update: await loadPdfFallbackUpdate(options), source: "pdf" };

  try {
    const generated = await loadGeneratedUpdate(options.slug);
    if (generated) return { update: generated, source: "generated" };
  } catch (err) {
    if (!options.pdf) throw err;
    console.warn(`Could not load generated update for ${options.slug}; using PDF fallback.`);
  }

  return { update: await loadPdfFallbackUpdate(options), source: "pdf" };
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseArgs(process.argv.slice(2));
  const { update, source } = await loadUpdate(options);
  const markdown = buildPolicyUpdateForumMarkdown(update, {
    siteUrl: options.siteUrl,
    greeting: options.greeting,
  });

  const outputPath = path.resolve(options.output);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);

  const imageUrls = policyUpdateMarkdownImageUrls(markdown);
  console.log(`Wrote ${options.output}`);
  console.log(`Source: ${source === "pdf" ? "pdf fallback" : "generated update"}`);
  console.log(`Images: ${imageUrls.length}`);
  if (imageUrls.length) {
    console.log("Image sources:");
    for (const url of imageUrls) console.log(`- ${url}`);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
