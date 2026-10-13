import type { PolicyUpdateImage, PolicyUpdateLink, PolicyUpdateSection, PolicyUpdateTextRun } from "./policy-updates";
import { isPolicyUpdateRelevantPostImage, policyUpdateImageDisplaySizePx, policyUpdateImageHref } from "./policy-update-images";
import { isPolicyUpdateActionItemSection, isPolicyUpdateSocialPostSection, policyUpdateSectionHeadingLink, splitPolicyUpdateSocialPostHeading } from "./policy-update-sections";
import { isPgpzProgressSummarySection, progressSummaryItems } from "./policy-update-progress-summary";
import { PUBLIC_POLICY_ORIGIN, safePolicyHttpUrl, type PublicPolicyDocument, type PublicPolicySummary } from "./public-policy-updates";

export const escapePolicyHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const esc = escapePolicyHtml;
function linked(content: string, href: string | undefined) {
  const safe = safePolicyHttpUrl(href);
  return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${content}</a>` : content;
}
export function renderPublicPolicyText(text: string, links: PolicyUpdateLink[] = [], runs: PolicyUpdateTextRun[] = []) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  if (runs.length && normalize(runs.map((run) => run.text).join("")) === normalize(text)) {
    return runs.map((run) => {
      let content = esc(run.text);
      if (run.bold) content = `<strong>${content}</strong>`;
      if (run.italic) content = `<em>${content}</em>`;
      if (run.underline && !run.href) content = `<u>${content}</u>`;
      return linked(content, run.href);
    }).join("");
  }
  const matches = links.map((link) => ({ link, index: text.indexOf(link.text) })).filter(({ link, index }) => link.text && index >= 0).sort((a, b) => a.index - b.index);
  let cursor = 0;
  let result = "";
  for (const { link, index } of matches) {
    if (index < cursor) continue;
    result += esc(text.slice(cursor, index)) + linked(esc(link.text), link.href);
    cursor = index + link.text.length;
  }
  return result + esc(text.slice(cursor));
}
const relevant = (value: string) => /^Relevant Posts?:?$/i.test(value.trim());
const paragraphs = (texts: string[] = [], links?: PolicyUpdateLink[], runs?: PolicyUpdateTextRun[][]) => texts.map((text, index) => relevant(text) ? "<h3>Relevant Posts</h3>" : `<p>${renderPublicPolicyText(text, links, runs?.[index])}</p>`).join("");
function imageHtml(image: PolicyUpdateImage, fallback?: string) {
  const dimensions = policyUpdateImageDisplaySizePx(image);
  const width = dimensions.width ? ` style="width:${dimensions.width}px"` : "";
  const imageTag = `<img src="${esc(image.src)}" alt="${esc(image.alt)}" loading="lazy"${width}>`;
  return `<figure>${linked(imageTag, policyUpdateImageHref(image, fallback) || undefined)}${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}</figure>`;
}
function sectionHtml(section: PolicyUpdateSection) {
  const headingLink = policyUpdateSectionHeadingLink(section);
  const heading = (title: string) => {
    const runs = title === section.heading ? section.headingRuns : [];
    const content = headingLink
      ? renderPublicPolicyText(title, [], runs?.map(({ href: _href, ...run }) => run))
      : renderPublicPolicyText(title, section.links, runs);
    return `<h2>${linked(content, headingLink?.href)}</h2>`;
  };
  const body = paragraphs(section.body, section.links, section.bodyRuns);
  const table = section.table ? `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(section.heading)} table"><table><thead><tr>${section.table.columns.map((value) => `<th scope="col">${esc(value)}</th>`).join("")}</tr></thead><tbody>${section.table.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : "";
  const bullets = section.bullets?.length ? `<ul>${section.bullets.map((value, index) => `<li>${renderPublicPolicyText(value, section.links, section.bulletRuns?.[index])}</li>`).join("")}</ul>` : "";
  const after = paragraphs(section.bodyAfterBullets, section.links, section.bodyAfterBulletsRuns);
  const images = section.images?.map((image) => imageHtml(image, headingLink?.href || section.links?.[0]?.href)).join("") || "";
  if (isPgpzProgressSummarySection(section)) {
    const items = progressSummaryItems(section).map((item) => `<div><h3>${esc(item.label)}</h3>${item.details?.length ? `<ul>${item.details.map((detail) => `<li>${renderPublicPolicyText(detail.text, section.links)}${detail.children?.length ? `<ul>${detail.children.map((child) => `<li>${renderPublicPolicyText(child, section.links)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>` : ""}</div>`).join("");
    return `<section>${heading(section.heading)}<div class="progress-summary">${body}${items}${images}${table}${after}</div></section>`;
  }
  if (isPolicyUpdateSocialPostSection(section)) {
    const social = splitPolicyUpdateSocialPostHeading(section.heading);
    const title = social?.title || (social ? "" : section.heading);
    return `<section class="social-post"><p class="eyebrow">${esc(social?.label || "Source post")}</p>${images}${title ? heading(title) : ""}${body}${table}${bullets}${after}</section>`;
  }
  const label = ![section.heading, ...section.body, ...(section.bodyAfterBullets || [])].some(relevant) && section.images?.some(isPolicyUpdateRelevantPostImage) ? "<h3>Relevant Posts</h3>" : "";
  return `<section>${heading(section.heading)}${body}${label}${images}${table}${bullets}${after}</section>`;
}

const readerCss = `
.brand-signature{position:relative;width:220px;flex:0 0 auto}.brand-signature img{display:block;width:100%;height:auto}.brand-signature__home,.brand-signature__zcash{position:absolute;z-index:2}.brand-signature__home{inset:0}.brand-signature__zcash{top:13.3333%;left:70.7057%;width:22.3482%;height:49.3333%;z-index:3;border-radius:50%}
@font-face{font-family:Inter;src:url('https://pgpz.org/assets/fonts/Inter-Regular.ttf') format('truetype');font-weight:400;font-style:normal;font-display:swap}@font-face{font-family:Inter;src:url('https://pgpz.org/assets/fonts/Inter-Semibold.ttf') format('truetype');font-weight:600;font-style:normal;font-display:swap}@font-face{font-family:Inter;src:url('https://pgpz.org/assets/fonts/Inter-Extrabold.ttf') format('truetype');font-weight:800;font-style:normal;font-display:swap}
:root{color-scheme:light;--ink:#102827;--gold:#f5a800;--paper:#f6faf2;--muted:#54605c}*{box-sizing:border-box}body{margin:0;color:var(--ink);background:var(--paper);font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7}a{color:inherit;text-underline-offset:.2em}a:hover{color:#705000}a:focus-visible,summary:focus-visible{outline:3px solid var(--gold);outline-offset:4px}.skip{position:absolute;left:12px;top:-60px;background:white;padding:8px;z-index:10}.skip:focus{top:12px}.site-header{background:#0d1f20;color:white;border-bottom:1px solid #ffffff25}.header-inner{max-width:1240px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 28px}.logo{display:block;width:180px;height:auto}.site-header nav{display:flex;flex-wrap:wrap;gap:22px;font-size:14px}.site-header a{text-decoration:none}.site-header a:hover{color:var(--gold)}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.hero{background:#102827;color:#fff;position:relative;overflow:hidden}.hero-inner{max-width:1240px;margin:auto;padding:70px 28px 58px;position:relative}.hero:before{content:"";position:absolute;right:-170px;top:-250px;width:680px;height:680px;background:url('https://pgpz.org/assets/brand/pgpz-circle-motif-on-dark-2400w.png') center/contain no-repeat;opacity:.14;pointer-events:none}.hero .eyebrow{color:#f5c85e}.hero h1{font-family:Inter,Arial,sans-serif;font-size:clamp(2.25rem,4.5vw,4rem);line-height:1.12;font-weight:800;max-width:970px;margin:16px 0 24px;letter-spacing:-.025em}.hero p{max-width:800px;color:#e2e7e0}.hero .lede{font-size:18px}.actions{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}.button{display:inline-block;background:var(--gold);color:#102827;border:1px solid var(--gold);border-radius:3px;padding:10px 18px;font-size:14px;font-weight:700;text-decoration:none}.button.secondary{background:transparent;color:inherit;border-color:currentColor}.main{max-width:1240px;margin:auto;padding:42px 28px 70px}.reading-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:60px}.body{min-width:0;background:#fff;padding:36px;border:1px solid #dde2da}.body section+section{margin-top:38px}.body p,.body li{line-height:1.8}.body h2{font-family:Inter,Arial,sans-serif;font-size:27px;line-height:1.28;font-weight:600;margin:0 0 20px}.body h3{font-size:19px;line-height:1.4}.body a{text-decoration-color:#b47d00}.body a img{display:block}.body figure{margin:26px 0}.body img{display:block;max-width:100%;height:auto;max-height:none}.body figcaption{font-size:13px;color:var(--muted);margin-top:10px}.body ul{padding-left:24px}.body li+li{margin-top:10px}.source-divider{border:0;border-top:1.5pt solid #f79646;margin:36px 0}.legacy-divider{border:0;border-top:1px solid #d6ddd5;margin:36px 0}.social-post{background:#f6f7f1;border-left:3px solid var(--gold);padding:24px}.progress-summary{background:#fff7df;border:1px solid #ded4b4;padding:22px}.table-scroll{overflow-x:auto;margin:24px 0}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:13px;vertical-align:top;border:1px solid #dbe1d7;text-align:left;min-width:150px;white-space:pre-line;overflow-wrap:anywhere}th{background:#102827;color:#fff}.sidebar section{border-top:3px solid var(--gold);padding:22px 0;margin-bottom:25px}.sidebar h2{font-size:14px;letter-spacing:.1em;text-transform:uppercase;margin:0 0 20px}.sidebar ul{padding-left:18px;font-size:14px;color:#43524b}.sidebar li{margin-bottom:16px}.sidebar .cover{width:100%;max-height:320px;object-fit:contain;background:white;border:1px solid #dce2d8;padding:12px}.archive-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;border-bottom:1px solid #cfd9d0;margin:0 0 28px}.archive-heading h2{font-family:Inter,Arial,sans-serif;font-weight:800;font-size:30px}.archive-grid{display:block;margin-bottom:56px}.card{display:grid;grid-template-columns:165px minmax(0,1fr) 112px;gap:4px 24px;padding:28px 0;border-bottom:1px solid #cdd8cb}.card .eyebrow{grid-column:1;grid-row:1/span 2}.card h3,.card p:not(.eyebrow){grid-column:2}.card .read{grid-column:3;grid-row:1/span 2;align-self:center}.card .eyebrow{color:#667667;margin-top:0}.card h3{font-family:Inter,Arial,sans-serif;font-weight:600;font-size:25px;line-height:1.25;margin:0 0 10px}.card h3 a{text-decoration:none}.card p{font-size:14px;color:#54605c}.card .read{margin-top:0;font-size:13px;font-weight:700}.community-callout{background:#e8eee3;padding:28px;margin-top:36px;border:1px solid #d6e0cf}.community-callout h2{font-family:Inter,Arial,sans-serif;font-weight:600;margin-top:0}.site-footer{background:#0d1f20;color:#dce4da;padding:40px 28px;font-size:13px}.footer-inner{max-width:1184px;margin:auto;display:flex;gap:30px;justify-content:space-between;align-items:center}.site-footer p{max-width:730px}.muted{color:var(--muted)}.empty{padding:40px 0}.back{display:inline-block;margin-bottom:28px;font-size:14px}.not-found{min-height:45vh}.body a,.body p,.card h3{overflow-wrap:anywhere}@media(max-width:1000px){.reading-layout{grid-template-columns:minmax(0,1fr);gap:30px}.sidebar{display:grid;grid-template-columns:1fr 1fr;gap:28px}.sidebar .cover{display:none}.archive-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.header-inner{align-items:flex-start;flex-direction:column;padding:18px 20px}.logo{width:160px}.site-header nav{gap:18px}.hero-inner{padding:44px 20px}.hero .lede{font-size:16px}.main{padding:28px 18px 48px}.body{padding:22px 18px}.body h2{font-size:24px}.archive-grid,.sidebar{grid-template-columns:1fr}.card{display:block;padding:24px 0}.card .read{display:inline-block;margin-top:12px}.footer-inner{align-items:flex-start;flex-direction:column}.hero h1{font-size:2.35rem}.archive-heading h2{font-size:27px}}@media print{.site-header,.site-footer,.actions,.back,.community-callout{display:none}.hero,.hero p{background:white;color:black}.hero:before{display:none}.hero-inner{padding:0}.main{padding:0}.reading-layout{display:block}.body{border:0;padding:0}.body h2{break-after:avoid}section,figure{break-inside:auto}.sidebar{display:block}.source-divider{border-color:#888}}`;

const brandSignature = `<div class="brand-signature"><img src="https://pgpz.org/assets/brand/pgpz-primary-on-dark-2048w.png" width="2048" height="927" alt=""><a class="brand-signature__home" href="https://pgpz.org" aria-label="Pretty Good Policy for Zcash (PGPZ) home"></a><a class="brand-signature__zcash" href="https://z.cash/" aria-label="Official Zcash website"></a></div>`;

function shell(title: string, description: string, canonical: string, content: string, noindex = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | PGPZ</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:type" content="article">${noindex ? '<meta name="robots" content="noindex">' : ""}<style>${readerCss}</style></head><body><a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="header-inner">${brandSignature}<nav aria-label="Primary navigation"><a href="https://pgpz.org/#about">About</a><a href="https://pgpz.org/updates" aria-current="page">Policy updates</a><a href="https://community.pgpz.org">Community</a><a href="https://coalition.pgpz.org">Coalition</a></nav></div></header>${content}<footer class="site-footer"><div class="footer-inner"><p>Pretty Good Policy for Zcash is independent, nonpartisan, and is not an official Zcash or Zcash Foundation website. It is not affiliated with or endorsed by the Zcash Foundation.</p><a href="https://pgpz.org">PGPZ home</a></div></footer></body></html>`;
}
const callout = `<section class="community-callout"><h2>Stay informed. Take part.</h2><p>Join the PGPZ Community to receive policy memos by email and connect with people working on privacy-focused policy.</p><a class="button" href="https://community.pgpz.org">Explore the Community</a></section>`;
export function renderPublicPolicyArchive(updates: PublicPolicySummary[]) {
  const groups = (["weekly", "special"] as const).map((category) => {
    const items = updates.filter((item) => item.category === category);
    return `<section><div class="archive-heading"><h2>${category === "weekly" ? "Weekly Policy Memos" : "Special Updates"}</h2><span class="muted">${items.length} publication${items.length === 1 ? "" : "s"}</span></div><div class="archive-grid">${items.map((item) => `<article class="card"><p class="eyebrow">${esc(item.displayDate)}</p><h3><a href="${esc(item.canonicalUrl)}">${esc(item.shortTitle)}</a></h3><p>${esc(item.summary)}</p><a class="read" href="${esc(item.canonicalUrl)}">Read ${category === "weekly" ? "memo" : "report"} &rarr;</a></article>`).join("") || '<p class="empty">Publications will appear here when published.</p>'}</div></section>`;
  }).join("");
  return shell("Policy Updates", "Independent analysis of digital asset policy and what it means for Zcash and financial privacy.", `${PUBLIC_POLICY_ORIGIN}/updates`, `<main id="main"><div class="hero"><div class="hero-inner"><p class="eyebrow">Public policy analysis</p><h1>Policy in focus.<br>Privacy at the center.</h1><p class="lede">Weekly memos and special reports on digital asset policy, financial privacy, and the Zcash ecosystem. Open to everyone.</p></div></div><div class="main">${groups}${callout}</div></main>`);
}
export function renderPublicPolicyDocument(update: PublicPolicyDocument) {
  const body = update.sections.map((section, index) => `${update.sourceFormat === "docx" ? (section.dividerBefore ? '<hr class="source-divider">' : "") : index > 0 && !isPolicyUpdateActionItemSection(section) ? '<hr class="legacy-divider">' : ""}${sectionHtml(section)}${update.sourceFormat === "docx" && section.dividerAfter ? '<hr class="source-divider">' : ""}`).join("");
  const aside = (title: string, items: string[]) => items.length ? `<section><h2>${title}</h2><ul>${items.map((value) => `<li>${esc(value)}</li>`).join("")}</ul></section>` : "";
  return shell(update.title, update.summary, update.canonicalUrl, `<main id="main"><div class="hero"><div class="hero-inner"><p class="eyebrow">${esc(update.categoryLabel)} &nbsp; / &nbsp; ${esc(update.displayDate)}</p><h1>${esc(update.title)}</h1><p class="lede">${esc(update.summary)}</p><div class="actions"><a class="button" href="${esc(update.pdfUrl)}">Read the PDF</a><a class="button secondary" href="https://pgpz.org/updates">Browse all updates</a></div></div></div><div class="main"><a class="back" href="https://pgpz.org/updates">&larr; All policy updates</a><div class="reading-layout"><article class="body" aria-label="${esc(update.title)}">${body}</article><aside class="sidebar" aria-label="Memo summary"><img class="cover" src="${esc(update.coverUrl)}" alt="${esc(update.shortTitle)} cover">${aside("Key takeaways", update.keyTakeaways)}${aside("Action items", update.actionItems)}</aside></div>${callout}</div></main>`);
}
export function renderPublicPolicyError(status: 404 | 503) {
  const title = status === 404 ? "Publication not found" : "Policy updates are temporarily unavailable";
  return shell(title, title, `${PUBLIC_POLICY_ORIGIN}/updates`, `<main id="main" class="main not-found"><p class="eyebrow">Policy updates</p><h1>${title}</h1><p>${status === 404 ? "This publication is not available. Browse the public archive for published memos and reports." : "Please try again in a moment."}</p><a href="https://pgpz.org/updates">Return to the archive</a></main>`, true);
}
