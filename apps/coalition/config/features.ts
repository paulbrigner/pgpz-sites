import {
  defineFeatureSwitches,
  type SiteFeature,
} from "@pgpz/core";

export const siteFeatures = defineFeatureSwitches({
  updates: true,
  newsletters: true,
  memberDirectory: true,
  zecShelf: false,
  publicFiles: true,
});

export function isFeatureEnabled(feature: SiteFeature) {
  return siteFeatures[feature];
}
