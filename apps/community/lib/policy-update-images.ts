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

export function knownPolicyUpdateImageHref(image: PolicyUpdateImageLike) {
  const text = `${image.src || ""} ${image.alt || ""} ${image.caption || ""}`.toLowerCase();

  if (/\bjosh\b|\bswihart\b/.test(text)) {
    return "https://x.com/jswihart/status/2066384781601132602?s=20";
  }

  if (/\bwarren\b|\bdavidson\b/.test(text)) {
    return "https://x.com/WarrenDavidson/status/2067969401593254017";
  }

  if (/\bjustin\b|\bslaughter\b|\bjbsdc\b/.test(text)) {
    return "https://x.com/JBSDC/status/2067215860758990961";
  }

  if (/\baustin\b|\bcampbell\b/.test(text)) {
    return "https://x.com/austincampbell/status/2067219843472851198";
  }

  return image.href || null;
}

export function policyUpdateImageHref(image: PolicyUpdateImageLike, fallbackHref?: string | null) {
  return image.href || knownPolicyUpdateImageHref(image) || fallbackHref || null;
}
