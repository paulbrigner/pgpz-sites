import {
  defineFeatureSwitches,
  type SiteFeature,
} from "@pgpz/core";

export const siteFeatures = defineFeatureSwitches({
  personalHome: true,
  updates: true,
  newsletters: true,
  memberDirectory: false,
  zecShelf: true,
  publicFiles: true,
  letterSignons: false,
  documentVault: false,
});

export function isFeatureEnabled(feature: SiteFeature) {
  return siteFeatures[feature];
}
