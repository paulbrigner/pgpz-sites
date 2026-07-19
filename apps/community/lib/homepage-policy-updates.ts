import "server-only";

import { unstable_cache } from "next/cache";
import { getPublishedPolicyUpdates } from "@/lib/admin/policy-update-uploads";
import { getPolicyUpdate } from "@/lib/policy-updates";

const cachedPublishedPolicyUpdates = unstable_cache(
  getPublishedPolicyUpdates,
  ["community-home-published-policy-updates"],
  { revalidate: 300 },
);

const featuredPolicyUpdate = (update: NonNullable<ReturnType<typeof getPolicyUpdate>>) => ({
  slug: update.slug,
  categoryLabel: update.categoryLabel,
  title: update.title,
  shortTitle: update.shortTitle,
  summary: update.summary,
  emailPreheader: update.emailPreheader,
  coverImage: update.coverImage,
  portalPath: update.portalPath,
});

const staticFeaturedPolicyUpdates = () =>
  ["1H2026-us-digital-asset-policy", "2026-06-08-weekly-policy-memo"]
    .map((slug) => getPolicyUpdate(slug))
    .filter((update): update is NonNullable<typeof update> => Boolean(update))
    .map(featuredPolicyUpdate);

export async function loadFeaturedPolicyUpdates() {
  try {
    const publishedUpdates = await cachedPublishedPolicyUpdates();
    const featured = publishedUpdates.slice(0, 2).map(featuredPolicyUpdate);
    if (featured.length) return featured;
  } catch (error) {
    console.error("Unable to load published policy updates for the Community homepage", error);
  }
  return staticFeaturedPolicyUpdates();
}
