#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(
  repositoryRoot,
  "packages/x-monitor-core/vendor-manifest.json",
);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];

for (const entry of manifest.files || []) {
  const destinationPath = resolve(repositoryRoot, entry.destination);
  let contents;
  try {
    contents = readFileSync(destinationPath);
  } catch {
    failures.push(`missing vendored file: ${entry.destination}`);
    continue;
  }
  const digest = createHash("sha256").update(contents).digest("hex");
  if (digest !== entry.sha256) {
    failures.push(
      `${entry.destination} differs from ${manifest.sourceRepository}@${manifest.sourceCommit}`,
    );
  }
}

if (failures.length > 0) {
  console.error("X Monitor vendor verification failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Verified ${manifest.files.length} X Monitor files from ` +
    `${manifest.sourceRepository}@${manifest.sourceCommit}.`,
);
