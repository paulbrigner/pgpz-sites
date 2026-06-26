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

  return null;
}

export function policyUpdateImageHref(image: PolicyUpdateImageLike, fallbackHref?: string | null) {
  const directHref = image.href || knownPolicyUpdateImageHref(image);
  if (directHref) return directHref;
  if (isPolicyUpdateSocialImage(image)) return null;
  return fallbackHref || null;
}
