import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = execFileSync(
  "git",
  ["-C", scriptDirectory, "rev-parse", "--show-toplevel"],
  { encoding: "utf8" },
).trim();
const manifestPath = join(scriptDirectory, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const categories = [
  "exact-copy",
  "branding-config-variant",
  "intentional-workflow-divergence",
  "reconcile-before-sharing",
];
const failures = [];

function git(args) {
  return execFileSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function relativeInventory(root) {
  const prefix = `${root}/`;
  const output = git([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    root,
  ]);

  return new Set(
    output
      .split("\n")
      .filter((path) => path.startsWith(prefix))
      .filter((path) => existsSync(join(repositoryRoot, path)))
      .map((path) => path.slice(prefix.length)),
  );
}

function entryPath(entry) {
  return typeof entry === "string" ? entry : entry?.path;
}

if (manifest.version !== 1) {
  failures.push(`manifest version must be 1, received ${manifest.version}`);
}

const appRoots = manifest.appRoots || {};
const communityRoot = appRoots.community;
const coalitionRoot = appRoots.coalition;
if (typeof communityRoot !== "string" || typeof coalitionRoot !== "string") {
  failures.push("manifest must define string appRoots.community and appRoots.coalition");
}

const classified = new Map();
for (const category of Object.keys(manifest.classifications || {})) {
  if (!categories.includes(category)) {
    failures.push(`unknown classification category: ${category}`);
  }
}
for (const category of categories) {
  const entries = manifest.classifications?.[category];
  if (!Array.isArray(entries)) {
    failures.push(`classification ${category} must be an array`);
    continue;
  }

  for (const entry of entries) {
    const path = entryPath(entry);
    if (typeof path !== "string" || path.length === 0) {
      failures.push(`${category} contains an entry without a path`);
      continue;
    }
    if (classified.has(path)) {
      failures.push(
        `${path} is classified more than once (${classified.get(path)} and ${category})`,
      );
      continue;
    }
    if (
      category === "exact-copy" &&
      (typeof entry !== "object" ||
        typeof entry.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(entry.sha256))
    ) {
      failures.push(`${path} exact-copy entry must include a lowercase SHA-256 hash`);
    }
    classified.set(path, category);
  }
}

if (typeof communityRoot === "string" && typeof coalitionRoot === "string") {
  const communityFiles = relativeInventory(communityRoot);
  const coalitionFiles = relativeInventory(coalitionRoot);
  const commonPaths = [...communityFiles]
    .filter((path) => coalitionFiles.has(path))
    .sort();
  const commonSet = new Set(commonPaths);

  for (const path of commonPaths) {
    if (!classified.has(path)) {
      failures.push(`unclassified common app path: ${path}`);
    }
  }

  for (const [path, category] of classified) {
    if (!commonSet.has(path)) {
      failures.push(`${category} classification is not a current common app path: ${path}`);
    }
  }

  for (const entry of manifest.classifications?.["exact-copy"] || []) {
    const path = entryPath(entry);
    if (typeof path !== "string") continue;

    const communityPath = join(repositoryRoot, communityRoot, path);
    const coalitionPath = join(repositoryRoot, coalitionRoot, path);
    if (!existsSync(communityPath) || !existsSync(coalitionPath)) {
      failures.push(`exact-copy path is missing from one or both apps: ${path}`);
      continue;
    }

    const communityContents = readFileSync(communityPath);
    const coalitionContents = readFileSync(coalitionPath);
    const communityHash = sha256(communityContents);
    const coalitionHash = sha256(coalitionContents);

    if (!communityContents.equals(coalitionContents)) {
      failures.push(
        `exact-copy path diverged: ${path} (${communityHash} != ${coalitionHash})`,
      );
      continue;
    }
    if (communityHash !== entry.sha256) {
      failures.push(
        `exact-copy hash changed for ${path}: expected ${entry.sha256}, received ${communityHash}`,
      );
    }
  }
}

for (const feature of manifest.extractedFeatures || []) {
  if (
    typeof feature.name !== "string" ||
    typeof feature.packagePath !== "string"
  ) {
    failures.push("each extracted feature must define name and packagePath");
    continue;
  }

  const absolutePackagePath = join(repositoryRoot, feature.packagePath);
  if (!existsSync(absolutePackagePath) || !statSync(absolutePackagePath).isDirectory()) {
    failures.push(`${feature.name} package directory is missing: ${feature.packagePath}`);
  }

  for (const path of feature.requiredPackagePaths || []) {
    if (!existsSync(join(absolutePackagePath, path))) {
      failures.push(`${feature.name} required package path is missing: ${path}`);
    }
  }

  for (const appRoot of Object.values(appRoots)) {
    if (typeof appRoot !== "string") continue;
    for (const path of feature.forbiddenAppLocalImplementationPaths || []) {
      if (existsSync(join(repositoryRoot, appRoot, path))) {
        failures.push(
          `${feature.name} app-local implementation copy is forbidden: ${appRoot}/${path}`,
        );
      }
    }
  }

  for (const consumer of feature.requiredConsumers || []) {
    const appRoot = appRoots[consumer.app];
    if (typeof appRoot !== "string") {
      failures.push(`${feature.name} consumer has unknown app: ${consumer.app}`);
      continue;
    }
    const consumerPath = join(repositoryRoot, appRoot, consumer.path);
    if (!existsSync(consumerPath)) {
      failures.push(
        `${feature.name} required consumer is missing: ${appRoot}/${consumer.path}`,
      );
      continue;
    }
    const contents = readFileSync(consumerPath, "utf8");
    if (!contents.includes(consumer.import)) {
      failures.push(
        `${feature.name} consumer ${appRoot}/${consumer.path} must import ${consumer.import}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Parity verification failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

const totals = Object.fromEntries(
  categories.map((category) => [
    category,
    manifest.classifications[category].length,
  ]),
);
console.log("Parity verification passed.");
console.log(`- Classified common paths: ${classified.size}`);
for (const category of categories) {
  console.log(`- ${category}: ${totals[category]}`);
}
for (const feature of manifest.extractedFeatures || []) {
  console.log(`- extracted feature: ${feature.name} (${feature.packagePath})`);
}
