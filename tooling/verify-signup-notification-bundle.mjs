import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const expectedUpdateExpression =
  "SET adminSignupApprovalRequestedEmailOptIn = :approvalRequested, adminSignupSuccessfulJoinEmailOptIn = :successfulJoin, adminSignupNotificationsUpdatedAt = :now, adminSignupNotificationsUpdatedBy = :adminUserId";
const updateExpressionPattern =
  /UpdateExpression\s*:\s*["'](SET adminSignupApprovalRequestedEmailOptIn[^"']*)["']/g;

function javascriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

const appDirectory = resolve(process.cwd(), process.argv[2] || ".");
const serverBundleDirectory = resolve(appDirectory, ".next/server");

if (!existsSync(serverBundleDirectory)) {
  throw new Error(`Next.js server bundle not found: ${serverBundleDirectory}`);
}

const observedExpressions = new Map();
for (const file of javascriptFiles(serverBundleDirectory)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(updateExpressionPattern)) {
    const expression = match[1];
    const files = observedExpressions.get(expression) || [];
    files.push(file);
    observedExpressions.set(expression, files);
  }
}

if (observedExpressions.size === 0) {
  throw new Error(
    `Admin signup notification UpdateExpression was not found in ${serverBundleDirectory}`,
  );
}

const unexpectedExpressions = [...observedExpressions.entries()].filter(
  ([expression]) => expression !== expectedUpdateExpression,
);
if (unexpectedExpressions.length > 0) {
  const details = unexpectedExpressions
    .map(
      ([expression, files]) =>
        `${JSON.stringify(expression)} in ${files.map((file) => file.replace(`${appDirectory}/`, "")).join(", ")}`,
    )
    .join("\n");
  throw new Error(`Compiled signup notification UpdateExpression is invalid:\n${details}`);
}

console.log(
  `Verified compiled signup notification UpdateExpression in ${[...observedExpressions.values()].flat().length} server bundle location(s).`,
);
