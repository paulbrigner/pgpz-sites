import {
  defineFeatureSwitches,
  type SiteFeature,
} from "@pgpz/core";

export const siteFeatures = defineFeatureSwitches({
  updates: true,
  newsletters: true,
  memberDirectory: false,
  zecShelf: true,
  publicFiles: true,
});

export function isFeatureEnabled(feature: SiteFeature) {
  return siteFeatures[feature];
}
