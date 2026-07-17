#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const rootManifest = readJson(resolve(repositoryRoot, "package.json"));
const failures = [];
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listWorkspaceDirectories(pattern) {
  if (typeof pattern !== "string" || !pattern.endsWith("/*")) {
    failures.push(`unsupported workspace pattern: ${String(pattern)}`);
    return [];
  }

  const parent = resolve(repositoryRoot, pattern.slice(0, -2));
  if (!existsSync(parent)) return [];

  return readdirSync(parent)
    .map((entry) => resolve(parent, entry))
    .filter((path) => statSync(path).isDirectory())
    .filter((path) => existsSync(resolve(path, "package.json")));
}

function gitFiles(workspacePath) {
  const output = execFileSync(
    "git",
    [
      "-C",
      repositoryRoot,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      relative(repositoryRoot, workspacePath),
    ],
    { encoding: "utf8" },
  ).trim();

  if (!output) return [];

  return output
    .split("\n")
    .map((path) => resolve(repositoryRoot, path))
    .filter((path) => existsSync(path))
    .filter((path) => sourceExtensions.has(path.slice(path.lastIndexOf("."))));
}

function importedSpecifiers(contents) {
  const specifiers = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of contents.matchAll(pattern)) specifiers.add(match[1]);
  }

  return specifiers;
}

function isWithin(path, parent) {
  const pathFromParent = relative(parent, path);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) &&
      pathFromParent !== ".." &&
      !isAbsolute(pathFromParent))
  );
}

function resolvesIntoApps(sourcePath, specifier) {
  if (specifier === "apps" || specifier.startsWith("apps/")) return true;
  if (specifier.startsWith(".")) {
    return isWithin(resolve(dirname(sourcePath), specifier), resolve(repositoryRoot, "apps"));
  }
  if (isAbsolute(specifier)) {
    return isWithin(resolve(specifier), resolve(repositoryRoot, "apps"));
  }
  return false;
}

const brandedApplicationPaths = [
  resolve(repositoryRoot, "apps/community"),
  resolve(repositoryRoot, "apps/coalition"),
];

function resolvesIntoBrandedApplication(sourcePath, specifier) {
  if (
    specifier === "apps/community" ||
    specifier.startsWith("apps/community/") ||
    specifier === "apps/coalition" ||
    specifier.startsWith("apps/coalition/")
  ) {
    return true;
  }

  if (!specifier.startsWith(".") && !isAbsolute(specifier)) return false;
  const resolvedPath = specifier.startsWith(".")
    ? resolve(dirname(sourcePath), specifier)
    : resolve(specifier);
  return brandedApplicationPaths.some((applicationPath) =>
    isWithin(resolvedPath, applicationPath),
  );
}

function validatePathAliases(workspace, declaredDependencies) {
  const tsconfigPath = resolve(workspace.path, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return;

  const compilerOptions = readJson(tsconfigPath).compilerOptions || {};
  const paths = compilerOptions.paths;
  if (!paths || typeof paths !== "object") return;

  const aliasBase = resolve(workspace.path, compilerOptions.baseUrl || ".");
  const isSharedPackage = workspace.relativePath.startsWith(`packages${sep}`);
  const isReferenceApplication =
    workspace.relativePath === ["apps", "reference"].join(sep);

  for (const [alias, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) {
      failures.push(`${workspace.relativePath}/tsconfig.json alias ${alias} must be an array`);
      continue;
    }

    for (const target of targets) {
      if (typeof target !== "string") {
        failures.push(
          `${workspace.relativePath}/tsconfig.json alias ${alias} has a non-string target`,
        );
        continue;
      }

      const resolvedTarget = resolve(aliasBase, target.replaceAll("*", "__alias__"));
      if (
        isSharedPackage &&
        isWithin(resolvedTarget, resolve(repositoryRoot, "apps"))
      ) {
        failures.push(
          `${workspace.relativePath}/tsconfig.json alias ${alias} resolves into application-owned code`,
        );
      }
      if (
        isReferenceApplication &&
        !isWithin(resolvedTarget, workspace.path) &&
        !isWithin(resolvedTarget, resolve(repositoryRoot, "packages"))
      ) {
        failures.push(
          `${workspace.relativePath}/tsconfig.json alias ${alias} resolves outside ` +
            "the reference application and shared packages",
        );
      }
      if (
        isReferenceApplication &&
        isWithin(resolvedTarget, resolve(repositoryRoot, "packages"))
      ) {
        const targetWorkspace = workspaces.find(({ path }) =>
          isWithin(resolvedTarget, path),
        );
        if (
          targetWorkspace &&
          !declaredDependencies.has(targetWorkspace.manifest.name)
        ) {
          failures.push(
            `${workspace.relativePath}/tsconfig.json alias ${alias} targets ` +
              `undeclared shared package ${targetWorkspace.manifest.name}`,
          );
        }
      }
    }
  }
}

const workspacePatterns = Array.isArray(rootManifest.workspaces)
  ? rootManifest.workspaces
  : rootManifest.workspaces?.packages;

if (!Array.isArray(workspacePatterns)) {
  failures.push("root package.json must define a workspaces array");
}

const workspaces = (workspacePatterns || [])
  .flatMap(listWorkspaceDirectories)
  .map((path) => ({
    path,
    relativePath: relative(repositoryRoot, path),
    manifest: readJson(resolve(path, "package.json")),
  }));

const workspacePackages = new Map();
for (const workspace of workspaces) {
  if (typeof workspace.manifest.name !== "string" || workspace.manifest.name.length === 0) {
    failures.push(`${workspace.relativePath}/package.json must define a package name`);
    continue;
  }
  if (workspacePackages.has(workspace.manifest.name)) {
    failures.push(`duplicate workspace package name: ${workspace.manifest.name}`);
    continue;
  }
  workspacePackages.set(workspace.manifest.name, workspace);
}

const packageNamesByLength = [...workspacePackages.keys()].sort(
  (left, right) => right.length - left.length,
);

function referencedWorkspace(sourcePath, specifier) {
  const packageName = packageNamesByLength.find(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
  if (packageName) return workspacePackages.get(packageName);

  if (specifier.startsWith(".") || isAbsolute(specifier)) {
    const resolvedPath = specifier.startsWith(".")
      ? resolve(dirname(sourcePath), specifier)
      : resolve(specifier);
    return workspaces.find((workspace) => isWithin(resolvedPath, workspace.path));
  }

  return undefined;
}

function externalPackageName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("#")
  ) {
    return undefined;
  }

  const withoutNodePrefix = specifier.startsWith("node:")
    ? specifier.slice("node:".length)
    : specifier;
  if (
    builtinModules.includes(withoutNodePrefix) ||
    builtinModules.includes(withoutNodePrefix.split("/")[0])
  ) {
    return undefined;
  }

  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name ? `${scope}/${name}` : specifier;
  }

  return specifier.split("/")[0];
}

for (const workspace of workspaces) {
  const declaredDependencies = new Set(
    [
      workspace.manifest.dependencies,
      workspace.manifest.devDependencies,
      workspace.manifest.optionalDependencies,
      workspace.manifest.peerDependencies,
    ].flatMap((dependencies) => Object.keys(dependencies || {})),
  );
  const isSharedPackage = workspace.relativePath.startsWith(`packages${sep}`);
  const isReferenceApplication =
    workspace.relativePath === ["apps", "reference"].join(sep);

  validatePathAliases(workspace, declaredDependencies);

  for (const sourcePath of gitFiles(workspace.path)) {
    const sourceRelative = relative(repositoryRoot, sourcePath);
    const contents = readFileSync(sourcePath, "utf8");

    for (const specifier of importedSpecifiers(contents)) {
      if (
        isSharedPackage &&
        (specifier === "@" ||
          specifier.startsWith("@/") ||
          resolvesIntoApps(sourcePath, specifier))
      ) {
        failures.push(
          `${sourceRelative} imports application-owned code via ${JSON.stringify(specifier)}`,
        );
      }

      if (
        isReferenceApplication &&
        resolvesIntoBrandedApplication(sourcePath, specifier)
      ) {
        failures.push(
          `${sourceRelative} imports branded application code via ${JSON.stringify(specifier)}`,
        );
      }

      const referenced = referencedWorkspace(sourcePath, specifier);
      const referencesAnotherApplication =
        referenced?.relativePath.startsWith(`apps${sep}`) &&
        referenced.manifest.name !== workspace.manifest.name;
      if (referencesAnotherApplication) {
        failures.push(
          `${sourceRelative} imports application workspace ${referenced.relativePath} via ${JSON.stringify(specifier)}`,
        );
      }

      if (
        referenced &&
        referenced.manifest.name !== workspace.manifest.name &&
        !referencesAnotherApplication &&
        !declaredDependencies.has(referenced.manifest.name)
      ) {
        failures.push(
          `${sourceRelative} imports ${JSON.stringify(specifier)}, but ${workspace.relativePath}/package.json does not directly declare ${referenced.manifest.name}`,
        );
      }

      const externalName = referenced ? undefined : externalPackageName(specifier);
      if (externalName && !declaredDependencies.has(externalName)) {
        failures.push(
          `${sourceRelative} imports ${JSON.stringify(specifier)}, but ${workspace.relativePath}/package.json does not directly declare ${externalName}`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Workspace boundary verification failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Workspace boundary verification passed.");
console.log(`- Workspaces checked: ${workspaces.length}`);
console.log(
  `- Shared packages checked: ${workspaces.filter(({ relativePath }) => relativePath.startsWith(`packages${sep}`)).length}`,
);
console.log(`- Workspace package names checked: ${workspacePackages.size}`);
