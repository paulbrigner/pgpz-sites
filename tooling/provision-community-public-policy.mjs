#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildPublicPolicyStackPlan, PUBLIC_POLICY } from "./community-public-policy-cloudformation.mjs";

export function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (["--apply", "--validate-only"].includes(key)) { values[key.slice(2)] = true; continue; }
    if (!["--artifact", "--account-id", "--profile", "--confirm", "--expected-sha256"].includes(key) || !argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error(`Unexpected or incomplete argument: ${key}`);
    values[key.slice(2)] = argv[++index];
  }
  if (values.apply && values["validate-only"]) throw new Error("Choose apply or validate-only");
  if (values.apply && values.confirm !== "PROVISION-COMMUNITY-PUBLIC-POLICY") throw new Error("--apply requires --confirm PROVISION-COMMUNITY-PUBLIC-POLICY");
  if (!values.artifact || !values["account-id"]) throw new Error("Required: --artifact <reviewed-worker.zip> --account-id <account>; default is dry-run");
  return values;
}

export function awsJson(profile, args, { json = true } = {}) {
  const result = spawnSync("aws", [...(profile ? ["--profile", profile] : []), "--region", PUBLIC_POLICY.region, ...args, "--output", "json"], { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`AWS ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`);
  return json ? (result.stdout.trim() ? JSON.parse(result.stdout) : null) : result.stdout;
}

export function main(argv = process.argv.slice(2)) {
  const values = parseArguments(argv);
  const artifactPath = resolve(values.artifact);
  const bytes = readFileSync(artifactPath);
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  const plan = buildPublicPolicyStackPlan({ accountId: values["account-id"], artifactSha256 });
  if (values.apply && values["expected-sha256"] !== artifactSha256) throw new Error("--expected-sha256 must match the reviewed artifact");
  if (!values.apply && !values["validate-only"]) {
    console.log(JSON.stringify({ mode: "dry-run", ...plan }, null, 2));
    return;
  }
  const caller = awsJson(values.profile, ["sts", "get-caller-identity"]);
  if (caller.Account !== plan.accountId) throw new Error("AWS account mismatch");
  const directory = mkdtempSync(join(tmpdir(), "pgpz-public-policy-"));
  const templatePath = join(directory, "template.json");
  writeFileSync(templatePath, JSON.stringify(plan.template), { mode: 0o600 });
  try {
    awsJson(values.profile, ["cloudformation", "validate-template", "--template-body", `file://${templatePath}`]);
    if (values["validate-only"]) { console.log(`Validated ${plan.stackName}; no resources changed.`); return; }
    const table = awsJson(values.profile, ["dynamodb", "describe-table", "--table-name", plan.tableName]).Table;
    if (table.TableStatus !== "ACTIVE" || !table.GlobalSecondaryIndexes?.some((index) => index.IndexName === "GSI1" && index.IndexStatus === "ACTIVE")) throw new Error("Community table/GSI1 is not active");
    const block = awsJson(values.profile, ["s3api", "get-public-access-block", "--bucket", plan.bucketName]).PublicAccessBlockConfiguration;
    if (!["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"].every((key) => block[key] === true)) throw new Error("Community content bucket must block public access");
    const location = awsJson(values.profile, ["s3api", "get-bucket-location", "--bucket", plan.bucketName]).LocationConstraint;
    if (location !== null && location !== plan.region) throw new Error("Artifact bucket region mismatch");
    awsJson(values.profile, ["s3api", "put-object", "--bucket", plan.bucketName, "--key", plan.artifactKey, "--body", artifactPath, "--server-side-encryption", "AES256", "--metadata", `sha256=${artifactSha256}`]);
    awsJson(values.profile, ["cloudformation", "deploy", "--stack-name", plan.stackName, "--template-file", templatePath, "--capabilities", "CAPABILITY_NAMED_IAM", "--tags", "Project=pgpz", "Application=community", "Purpose=public-policy-read-only", "--no-fail-on-empty-changeset"], { json: false });
    awsJson(values.profile, ["cloudformation", "update-termination-protection", "--stack-name", plan.stackName, "--enable-termination-protection"]);
    const outputs = awsJson(values.profile, ["cloudformation", "describe-stacks", "--stack-name", plan.stackName]).Stacks[0].Outputs;
    console.log(JSON.stringify({ stackName: plan.stackName, artifactSha256, outputs }, null, 2));
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
