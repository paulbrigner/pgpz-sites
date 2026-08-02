import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseApplications(source, label, { requireHeaders = false } = {}) {
  let document;
  try {
    document = load(source);
  } catch (error) {
    throw new Error(`${label} must be valid YAML: ${error.message}`);
  }

  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`${label} must contain a YAML object`);
  }
  if (!Array.isArray(document.applications) || document.applications.length === 0) {
    throw new Error(`${label} must define a nonempty applications array`);
  }

  const appRoots = [];
  for (const [index, application] of document.applications.entries()) {
    if (!application || typeof application !== "object" || Array.isArray(application)) {
      throw new Error(`${label} applications[${index}] must be an object`);
    }

    const { appRoot } = application;
    if (
      typeof appRoot !== "string" ||
      appRoot.length === 0 ||
      appRoot.trim() !== appRoot
    ) {
      throw new Error(`${label} applications[${index}].appRoot must be an exact nonempty string`);
    }
    if (appRoots.includes(appRoot)) {
      throw new Error(`${label} contains duplicate appRoot ${appRoot}`);
    }
    if (requireHeaders) {
      if (!Array.isArray(application.customHeaders) || application.customHeaders.length === 0) {
        throw new Error(`${label} ${appRoot} must define a nonempty customHeaders array`);
      }

      for (const [headerIndex, customHeader] of application.customHeaders.entries()) {
        const headerLabel = `${label} ${appRoot} customHeaders[${headerIndex}]`;
        if (!customHeader || typeof customHeader !== "object" || Array.isArray(customHeader)) {
          throw new Error(`${headerLabel} must be an object`);
        }
        if (typeof customHeader.pattern !== "string" || customHeader.pattern.trim() === "") {
          throw new Error(`${headerLabel}.pattern must be a nonblank string`);
        }
        if (!Array.isArray(customHeader.headers) || customHeader.headers.length === 0) {
          throw new Error(`${headerLabel}.headers must be a nonempty array`);
        }

        for (const [valueIndex, header] of customHeader.headers.entries()) {
          const valueLabel = `${headerLabel}.headers[${valueIndex}]`;
          if (!header || typeof header !== "object" || Array.isArray(header)) {
            throw new Error(`${valueLabel} must be an object`);
          }
          if (typeof header.key !== "string" || header.key.trim() === "") {
            throw new Error(`${valueLabel}.key must be a nonblank string`);
          }
          if (typeof header.value !== "string" || header.value.trim() === "") {
            throw new Error(`${valueLabel}.value must be a nonblank string`);
          }
        }
      }
    }

    appRoots.push(appRoot);
  }

  return appRoots;
}

export function assertAmplifyCustomHeaderParity(amplifySource, customHttpSource) {
  const amplifyRoots = parseApplications(amplifySource, "amplify.yml");
  if (customHttpSource === null) return;

  const headerRoots = parseApplications(customHttpSource, "customHttp.yml", {
    requireHeaders: true,
  });
  const missing = amplifyRoots.filter((appRoot) => !headerRoots.includes(appRoot));
  const unexpected = headerRoots.filter((appRoot) => !amplifyRoots.includes(appRoot));
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [];
    if (missing.length > 0) details.push(`missing: ${missing.join(", ")}`);
    if (unexpected.length > 0) details.push(`unexpected: ${unexpected.join(", ")}`);
    throw new Error(`customHttp.yml appRoots must exactly match amplify.yml (${details.join("; ")})`);
  }
}

const amplifyFixture = `
version: 1
applications:
  - appRoot: apps/community
  - appRoot: apps/coalition
  - appRoot: apps/reference
`;

const headerFixture = (appRoots) => `
applications:
${appRoots
  .map(
    (appRoot) => `  - appRoot: ${appRoot}
    customHeaders:
      - pattern: '/fixture'
        headers:
          - key: 'X-Fixture'
            value: 'true'`,
  )
  .join("\n")}
`;

test("allows app-specific Amplify headers when root customHttp.yml is absent", () => {
  assert.doesNotThrow(() => assertAmplifyCustomHeaderParity(amplifyFixture, null));
});

test("accepts a complete monorepo header configuration in any order", () => {
  assert.doesNotThrow(() =>
    assertAmplifyCustomHeaderParity(
      amplifyFixture,
      headerFixture(["apps/reference", "apps/community", "apps/coalition"]),
    ),
  );
});

test("rejects the Community-only configuration that blocked Coalition and Reference", () => {
  assert.throws(
    () =>
      assertAmplifyCustomHeaderParity(amplifyFixture, headerFixture(["apps/community"])),
    /missing: apps\/coalition, apps\/reference/,
  );
});

test("rejects unexpected and misspelled app roots", () => {
  assert.throws(
    () =>
      assertAmplifyCustomHeaderParity(
        amplifyFixture,
        headerFixture(["apps/community", "apps/coalition", "apps/referance"]),
      ),
    /missing: apps\/reference; unexpected: apps\/referance/,
  );
});

test("rejects duplicate app roots", () => {
  assert.throws(
    () =>
      assertAmplifyCustomHeaderParity(
        amplifyFixture,
        headerFixture(["apps/community", "apps/community", "apps/coalition"]),
      ),
    /duplicate appRoot apps\/community/,
  );
});

test("rejects undocumented empty custom header stubs", () => {
  assert.throws(
    () =>
      assertAmplifyCustomHeaderParity(
        amplifyFixture,
        `applications:
  - appRoot: apps/community
    customHeaders: []`,
      ),
    /apps\/community must define a nonempty customHeaders array/,
  );
});

test("rejects placeholder custom header rules", () => {
  assert.throws(
    () =>
      assertAmplifyCustomHeaderParity(
        amplifyFixture,
        `applications:
  - appRoot: apps/community
    customHeaders:
      - null`,
      ),
    /customHeaders\[0\] must be an object/,
  );
  assert.throws(
    () =>
      assertAmplifyCustomHeaderParity(
        amplifyFixture,
        `applications:
  - appRoot: apps/community
    customHeaders:
      - {}`,
      ),
    /customHeaders\[0\]\.pattern must be a nonblank string/,
  );
  assert.throws(
    () =>
      assertAmplifyCustomHeaderParity(
        amplifyFixture,
        `applications:
  - appRoot: apps/community
    customHeaders:
      - pattern: '/fixture'
        headers: []`,
      ),
    /customHeaders\[0\]\.headers must be a nonempty array/,
  );
});

test("rejects malformed or missing application definitions", () => {
  assert.throws(
    () => assertAmplifyCustomHeaderParity("applications: [", null),
    /amplify.yml must be valid YAML/,
  );
  assert.throws(
    () => assertAmplifyCustomHeaderParity(amplifyFixture, "customHeaders: []"),
    /customHttp.yml must define a nonempty applications array/,
  );
});

test("repository header configuration covers every deployed Amplify app", () => {
  const amplifySource = readFileSync(resolve(repositoryRoot, "amplify.yml"), "utf8");
  const customHttpPath = resolve(repositoryRoot, "customHttp.yml");
  const customHttpSource = existsSync(customHttpPath)
    ? readFileSync(customHttpPath, "utf8")
    : null;
  assert.doesNotThrow(() =>
    assertAmplifyCustomHeaderParity(amplifySource, customHttpSource),
  );
});
