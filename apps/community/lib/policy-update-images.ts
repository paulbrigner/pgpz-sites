type PolicyUpdateImageLike = {
  src?: string;
  alt?: string;
  caption?: string;
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
