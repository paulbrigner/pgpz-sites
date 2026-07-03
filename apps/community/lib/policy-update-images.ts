type PolicyUpdateImageLike = {
  src?: string;
  alt?: string;
  caption?: string;
  href?: string;
};

export function isPolicyUpdateDisplayImageAllowed(image: PolicyUpdateImageLike) {
  const src = image.src || "";
  const text = `${image.alt || ""} ${image.caption || ""}`.toLowerCase();

  if (/\/(?:member-join-qr|community-join-qr)\.(?:png|jpe?g|webp)$/i.test(src)) {
    return false;
  }

  if (/\bnot a pgpz member\b/i.test(text) || /\bsign up here\b/i.test(text)) {
    return false;
  }

  if (/\b(?:signup|sign-up)\s+qr\b/i.test(text)) {
    return false;
  }

  if (/\bqr code for joining the pgpz community\b/i.test(text) && !/\bsignal\b/i.test(text)) {
    return false;
  }

  if (/\bpgpz community signup qr\b/i.test(text)) {
    return false;
  }

  return true;
}

export function isPolicyUpdateRelevantPostImage(image: PolicyUpdateImageLike) {
  const text = `${image.src || ""} ${image.alt || ""} ${image.caption || ""}`.toLowerCase();
  return /\brelevant post\b/.test(text) || /\/relevant-post[-/]/.test(text);
}

export function isPolicyUpdateSocialImage(image: PolicyUpdateImageLike) {
  const text = `${image.src || ""} ${image.alt || ""} ${image.caption || ""}`.toLowerCase();
  return (
    isPolicyUpdateRelevantPostImage(image) ||
    /(?:^|[/-])x[-_]/i.test(text) ||
    /\bx post\b/i.test(text) ||
    /\btwitter\b/i.test(text)
  );
}

export function knownPolicyUpdateImageHref(image: PolicyUpdateImageLike) {
  const text = `${image.src || ""} ${image.alt || ""} ${image.caption || ""}`.toLowerCase();

  if (/x-josh-swihart\.png\b/.test(text)) {
    return "https://x.com/jswihart/status/2066384781601132602?s=20";
  }

  if (/x-warren-davidson\.png\b/.test(text)) {
    return "https://x.com/WarrenDavidson/status/2067969401593254017";
  }

  if (/x-justin-slaughter\.png\b/.test(text)) {
    return "https://x.com/JBSDC/status/2067215860758990961";
  }

  if (/x-austin-campbell\.png\b/.test(text)) {
    return "https://x.com/austincampbell/status/2067219843472851198";
  }

  if (/2026-06-22-weekly-policy-memo\/assets\/relevant-post-page-3-1\.png\b/.test(text)) {
    return "https://x.com/cypherpunk/status/2069226926128955704";
  }

  if (/2026-06-22-weekly-policy-memo\/assets\/relevant-post-page-4-1\.png\b/.test(text)) {
    return "https://x.com/SummerMersinger/status/2069562907621536034";
  }

  if (/2026-06-22-weekly-policy-memo\/assets\/relevant-post-page-5-1\.png\b/.test(text)) {
    return "https://x.com/CharlesFLehman/status/2067963794836349321";
  }

  if (
    /june-29|2026-06-29|weekly-policy-memo-june-29/.test(text) &&
    /relevant-post-page-4-1\.png\b/.test(text)
  ) {
    return "https://www.linkedin.com/posts/gracenavas_wonderful-attending-the-launch-of-pgpz-a-ugcPost-7477863722775031808-zEz7/";
  }

  if (
    /june-29|2026-06-29|weekly-policy-memo-june-29/.test(text) &&
    /relevant-post-page-5-1\.png\b/.test(text)
  ) {
    return "https://x.com/intangiblecoins/status/2070525408383008938";
  }

  return null;
}

export function policyUpdateImageHref(image: PolicyUpdateImageLike, fallbackHref?: string | null) {
  const directHref = image.href || knownPolicyUpdateImageHref(image);
  if (directHref) return directHref;
  if (isPolicyUpdateSocialImage(image)) return null;
  return fallbackHref || null;
}
