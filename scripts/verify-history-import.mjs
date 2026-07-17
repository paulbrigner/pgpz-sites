import { execFileSync, spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = execFileSync(
  "git",
  ["-C", scriptDirectory, "rev-parse", "--show-toplevel"],
  { encoding: "utf8" },
).trim();

const importMerge = {
  commit: "a676d085d0f90a3a93dee6da050cc8fca8497106",
  commitCount: 398,
  mergeCount: 52,
};

const imports = [
  {
    name: "Community",
    path: "apps/community",
    source: {
      repository: "https://github.com/paulbrigner/pgpz-community.git",
      root: "cce53d97021bd0a632fc961605e5de49d13268df",
      tip: "d6a1d1876dbdd5f0959d43ea3c8a19ebf70334ac",
      tree: "7b02e953062c75e88d86fea4ffb9c63a6cc2c223",
      commitCount: 359,
      mergeCount: 51,
    },
    imported: {
      root: "02d6b761be63d0c2f975b1afc07d3985b40d4599",
      tip: "4096326a40748e05a243d3f00568a0536ecd8dfa",
    },
  },
  {
    name: "Coalition",
    path: "apps/coalition",
    source: {
      repository: "https://github.com/paulbrigner/pgpz-coalition.git",
      root: "f8e91125bc2b53cfa05de9cf911daf0b51ae5145",
      tip: "ffffec98878729658f96ddba6624c73b316279f6",
      tree: "26ff049ff9beaff22607b0e812b09b104c6be16a",
      commitCount: 38,
      mergeCount: 0,
    },
    imported: {
      root: "90b5c68d114b51bbb962d5e473407eb20db9edc3",
      tip: "c2e4d9d526fed99a2842e0a2729cdff2395088cf",
    },
  },
];

const importedTags = [
  {
    ref: "refs/tags/community/v0.0.1",
    sourceCommit: "7ad8d21d06a3d034532502a13158ab5594f890bd",
    importedCommit: "63d5a0678df40befe9442cc300e3697526d37566",
  },
  {
    ref: "refs/tags/community/v.0.1.1",
    sourceCommit: "600abdebcc4ae2c48ceaf4647401f429a7bf7e34",
    importedCommit: "274632efd9190f03d62d9c975722d1a376504a47",
  },
  {
    ref: "refs/tags/community/v.0.1.2",
    sourceCommit: "f8dba54f46be4cc56808c9c74fb800571bb34303",
    importedCommit: "b3e5862869d614d4e721d761806cf9400c75ed3a",
  },
  {
    ref: "refs/tags/community/v.0.2.0",
    sourceCommit: "8bdc7423692907cb6b26488a0d7ed89250927be0",
    importedCommit: "5e9e2e11973bf462c4530c9830338bbb95a21372",
  },
];

const failures = [];

function git(args) {
  return execFileSync("git", ["-C", repositoryRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

function gitSucceeds(args) {
  return (
    spawnSync("git", ["-C", repositoryRoot, ...args], {
      encoding: "utf8",
    }).status === 0
  );
}

function expectEqual(label, actual, expected) {
  if (actual !== String(expected)) {
    failures.push(`${label}: expected ${expected}, received ${actual || "<empty>"}`);
  }
}

function expectAncestor(label, ancestor, descendant) {
  if (!gitSucceeds(["merge-base", "--is-ancestor", ancestor, descendant])) {
    failures.push(`${label}: ${ancestor} is not an ancestor of ${descendant}`);
  }
}

expectEqual(
  "import merge parents",
  git(["show", "-s", "--format=%P", importMerge.commit]),
  imports.map((entry) => entry.imported.tip).join(" "),
);
expectEqual(
  "import merge commit count",
  git(["rev-list", "--count", importMerge.commit]),
  importMerge.commitCount,
);
expectEqual(
  "import merge merge count",
  git(["rev-list", "--count", "--merges", importMerge.commit]),
  importMerge.mergeCount,
);
expectAncestor("main contains the import merge", importMerge.commit, "HEAD");

for (const entry of imports) {
  const { name, path, source, imported } = entry;

  expectEqual(
    `${name} imported root has no parents`,
    git(["show", "-s", "--format=%P", imported.root]),
    "",
  );
  expectAncestor(`${name} root-to-tip history`, imported.root, imported.tip);
  expectAncestor(`${name} import is retained on main`, imported.tip, "HEAD");
  expectEqual(
    `${name} imported commit count`,
    git(["rev-list", "--count", imported.tip]),
    source.commitCount,
  );
  expectEqual(
    `${name} imported merge count`,
    git(["rev-list", "--count", "--merges", imported.tip]),
    source.mergeCount,
  );
  expectEqual(
    `${name} source tree at the imported baseline`,
    git(["rev-parse", `${imported.tip}:${path}`]),
    source.tree,
  );

  const unexpectedPaths = git([
    "ls-tree",
    "-r",
    "--name-only",
    imported.tip,
  ])
    .split("\n")
    .filter((file) => file && !file.startsWith(`${path}/`));

  if (unexpectedPaths.length > 0) {
    failures.push(
      `${name} imported history contains paths outside ${path}: ${unexpectedPaths
        .slice(0, 5)
        .join(", ")}`,
    );
  }
}

const expectedRoots = imports
  .map((entry) => entry.imported.root)
  .sort()
  .join("\n");
const actualRoots = git(["rev-list", "--max-parents=0", importMerge.commit])
  .split("\n")
  .sort()
  .join("\n");
expectEqual("imported history roots", actualRoots, expectedRoots);

for (const tag of importedTags) {
  expectEqual(
    `${tag.ref} target`,
    git(["rev-parse", `${tag.ref}^{commit}`]),
    tag.importedCommit,
  );
}

if (failures.length > 0) {
  console.error("History import verification failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("History import verification passed.");
for (const entry of imports) {
  console.log(
    `- ${entry.name}: ${entry.source.commitCount} commits; source tree ${entry.source.tree}`,
  );
}
console.log(`- Namespaced Community tags: ${importedTags.length}`);
