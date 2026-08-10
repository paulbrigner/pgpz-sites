#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const generatedRoots = ["node_modules/", ".next/", "output/", "phase7-logs/", "storybook-static/"];

function repositoryFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter(Boolean)
    .filter((path) => !generatedRoots.some((entry) => path.includes(entry)));
}

const files = repositoryFiles();
const markdownFiles = files.filter((path) => [".md", ".mdx"].includes(extname(path)));

for (const file of markdownFiles) {
  const contents = readFileSync(resolve(root, file), "utf8");
  for (const match of contents.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    const target = rawTarget.split("#")[0];
    if (!target || target.startsWith("#") || /^[a-z][a-z+.-]*:/i.test(target)) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      failures.push(`${file} has an invalid encoded link: ${rawTarget}`);
      continue;
    }
    if (!existsSync(resolve(root, dirname(file), decoded))) {
      failures.push(`${file} links to missing path: ${rawTarget}`);
    }
  }
}

const workspaceDirectories = [];
for (const parent of ["apps", "packages"]) {
  for (const entry of readdirSync(resolve(root, parent)).sort()) {
    const directory = `${parent}/${entry}`;
    if (
      statSync(resolve(root, directory)).isDirectory() &&
      existsSync(resolve(root, directory, "package.json"))
    ) {
      workspaceDirectories.push(directory);
      if (!existsSync(resolve(root, directory, "README.md"))) {
        failures.push(`${directory} is missing README.md`);
      }
    }
  }
}

const rootReadme = readFileSync(resolve(root, "README.md"), "utf8");
for (const directory of workspaceDirectories) {
  if (!rootReadme.includes(`${directory}/README.md`)) {
    failures.push(`README.md does not link to ${directory}/README.md`);
  }
}

const docsIndex = readFileSync(resolve(root, "docs/README.md"), "utf8");
for (const file of markdownFiles.filter((path) => path.startsWith("docs/") && path !== "docs/README.md")) {
  const indexTarget = relative("docs", file);
  if (!docsIndex.includes(`](${indexTarget})`)) {
    failures.push(`docs/README.md does not classify ${file}`);
  }
}

const agentGuide = readFileSync(resolve(root, "AGENTS.md"), "utf8");
const requiredAgentSections = [
  "## First minute",
  "## Context map",
  "## Repository invariants",
  "## Validation matrix",
  "## Deployment safeguards",
];
for (const heading of requiredAgentSections) {
  if (!agentGuide.includes(heading)) failures.push(`AGENTS.md is missing ${heading}`);
}
if (agentGuide.length > 14_000) {
  failures.push(`AGENTS.md is ${agentGuide.length} characters; keep it at or below 14000`);
}

const rootManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const rootScripts = new Set(Object.keys(rootManifest.scripts || {}));
for (const file of ["AGENTS.md", "README.md", "docs/README.md", "docs/testing.md"]) {
  const contents = readFileSync(resolve(root, file), "utf8");
  for (const match of contents.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
    if (!rootScripts.has(match[1])) {
      failures.push(`${file} references missing root script: npm run ${match[1]}`);
    }
  }
}

if (failures.length) {
  console.error("Documentation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Documentation verification passed.");
console.log(`- Markdown files checked: ${markdownFiles.length}`);
console.log(`- Workspace READMEs checked: ${workspaceDirectories.length}`);
console.log(`- AGENTS.md characters: ${agentGuide.length}/14000`);
