#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { configurePublicPolicyDistribution, PUBLIC_POLICY } from "./community-public-policy-cloudformation.mjs";
import { awsJson } from "./provision-community-public-policy.mjs";

export function parseCloudFrontArguments(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--apply") { values.apply = true; continue; }
    const key = argv[i];
    if (!["--profile", "--expected-etag", "--confirm", "--snapshot-dir"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`Unexpected or incomplete argument: ${key}`);
    values[key.slice(2)] = argv[++i];
  }
  if (values.apply && (values.confirm !== "EXPOSE-PUBLISHED-COMMUNITY-POLICY" || !values["expected-etag"] || !values["snapshot-dir"])) throw new Error("Apply requires --confirm EXPOSE-PUBLISHED-COMMUNITY-POLICY, --expected-etag, and --snapshot-dir");
  return values;
}

export function main(argv = process.argv.slice(2)) {
  const values = parseCloudFrontArguments(argv);
  const c = PUBLIC_POLICY;
  const caller = awsJson(values.profile, ["sts", "get-caller-identity"]);
  if (caller.Account !== c.accountId) throw new Error("AWS account mismatch");
  const stack = awsJson(values.profile, ["cloudformation", "describe-stacks", "--stack-name", c.stackName]).Stacks[0];
  if (!["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(stack.StackStatus)) throw new Error("Public policy stack is not ready");
  const outputs = Object.fromEntries(stack.Outputs.map((item) => [item.OutputKey, item.OutputValue]));
  const current = awsJson(values.profile, ["cloudfront", "get-distribution-config", "--id", c.distributionId]);
  const updated = configurePublicPolicyDistribution(current.DistributionConfig, { functionUrl: outputs.FunctionUrl, originAccessControlId: outputs.OriginAccessControlId });
  const changed = JSON.stringify(updated) !== JSON.stringify(current.DistributionConfig);
  const plan = { mode: values.apply ? "apply" : "dry-run", distributionId: c.distributionId, etag: current.ETag, changed, origin: updated.Origins.Items.find((item) => item.Id === c.originId), behaviors: updated.CacheBehaviors.Items.filter((item) => item.TargetOriginId === c.originId) };
  console.log(JSON.stringify(plan, null, 2));
  if (!values.apply) return;
  if (current.ETag !== values["expected-etag"]) throw new Error("Distribution changed since review; inspect a fresh plan before applying");
  const snapshotDirectory = resolve(values["snapshot-dir"]);
  mkdirSync(snapshotDirectory, { recursive: true, mode: 0o700 });
  // Exclusive creation protects the original rollback evidence on repeated runs.
  writeFileSync(join(snapshotDirectory, "before.json"), JSON.stringify(current, null, 2), { mode: 0o600, flag: "wx" });
  const after = join(snapshotDirectory, "after.json");
  writeFileSync(after, JSON.stringify(updated, null, 2), { mode: 0o600, flag: "wx" });
  if (!changed) { console.log("Public policy routing already matches."); return; }
  const response = awsJson(values.profile, ["cloudfront", "update-distribution", "--id", c.distributionId, "--if-match", current.ETag, "--distribution-config", `file://${after}`]);
  console.log(JSON.stringify({ distributionId: response.Distribution.Id, status: response.Distribution.Status, etag: response.ETag }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
