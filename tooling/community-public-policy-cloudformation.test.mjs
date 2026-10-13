import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicPolicyStackPlan, configurePublicPolicyDistribution, PUBLIC_POLICY } from "./community-public-policy-cloudformation.mjs";
import { parseArguments } from "./provision-community-public-policy.mjs";
import { parseCloudFrontArguments } from "./configure-public-policy-cloudfront.mjs";

const artifactSha256 = "a".repeat(64);
const plan = () => buildPublicPolicyStackPlan({ accountId: PUBLIC_POLICY.accountId, artifactSha256 });

test("Community reader has narrowly scoped read-only permissions and a private signed streaming URL", () => {
  const { template } = plan();
  const resources = template.Resources;
  assert.equal(resources.Function.Properties.Runtime, "nodejs22.x");
  assert.equal(resources.FunctionUrl.Properties.AuthType, "AWS_IAM");
  assert.equal(resources.FunctionUrl.Properties.InvokeMode, "RESPONSE_STREAM");
  assert.equal(resources.FunctionUrl.Properties.Qualifier, "live");
  const policies = resources.Role.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(policies.flatMap((item) => item.Action).sort(), ["dynamodb:GetItem", "dynamodb:Query", "logs:CreateLogStream", "logs:PutLogEvents", "s3:GetObject"].sort());
  assert.deepEqual(policies[0].Condition, { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["POLICY_UPDATE_UPLOAD#*"] } });
  assert.deepEqual(policies[1].Condition, { "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["POLICY_UPDATE_UPLOAD"] } });
  assert.equal(policies[1].Resource.endsWith("/index/GSI1"), true);
  assert.equal(policies[2].Resource.some((value) => value.endsWith("/*")), false);
  assert.equal(JSON.stringify(policies).includes(".docx"), false);
  for (const name of ["CloudFrontUrlPermission", "CloudFrontInvokePermission"]) {
    const permission = resources[name].Properties;
    assert.equal(permission.Principal, "cloudfront.amazonaws.com");
    assert.equal(permission.SourceArn, `arn:aws:cloudfront::${PUBLIC_POLICY.accountId}:distribution/${PUBLIC_POLICY.distributionId}`);
    assert.deepEqual(permission.FunctionName, { Ref: "Alias" });
  }
  assert.equal(resources.CloudFrontInvokePermission.Properties.InvokedViaFunctionUrl, true);
  assert.equal(resources.OriginAccessControl.Properties.OriginAccessControlConfig.SigningBehavior, "always");
  assert.equal(resources.OriginAccessControl.Properties.OriginAccessControlConfig.OriginAccessControlOriginType, "lambda");
});

test("immutable artifact digest selects a retained version and stable alias", () => {
  const built = plan();
  assert.equal(built.artifactKey, `deployments/public-policy/${artifactSha256}.zip`);
  const version = built.template.Resources[`Version${artifactSha256}`];
  assert.equal(version.DeletionPolicy, "Retain");
  assert.equal(version.Properties.CodeSha256, Buffer.from(artifactSha256, "hex").toString("base64"));
  assert.throws(() => buildPublicPolicyStackPlan({ accountId: "000000000000", artifactSha256 }), /account/);
  assert.throws(() => buildPublicPolicyStackPlan({ accountId: PUBLIC_POLICY.accountId, artifactSha256: "latest" }), /digest/);
});

const fixture = () => ({
  Aliases: { Quantity: 2, Items: ["pgpz.org", "www.pgpz.org"] },
  Origins: { Quantity: 1, Items: [{ Id: "static", DomainName: "pgpz.org.s3-website-us-east-1.amazonaws.com" }] },
  DefaultCacheBehavior: { TargetOriginId: "static", FunctionAssociations: { Quantity: 1, Items: [{ FunctionARN: "existing-router", EventType: "viewer-request" }] } },
  CacheBehaviors: { Quantity: 1, Items: [{ PathPattern: "/other/*", TargetOriginId: "static" }] },
  CustomErrorResponses: { Quantity: 1, Items: [{ ErrorCode: 404, ErrorCachingMinTTL: 10 }] },
  ViewerCertificate: { ACMCertificateArn: "preserve-certificate" },
  Logging: { Enabled: true, Bucket: "preserve-logs" },
  WebACLId: "preserve-waf", Comment: "preserve-comment",
});
const origin = { functionUrl: "https://abcd1234.lambda-url.us-east-1.on.aws/", originAccessControlId: "EABC123" };

test("routing only changes owned origin and two exact policy behaviors", () => {
  const before = fixture();
  const serialized = JSON.stringify(before);
  const after = configurePublicPolicyDistribution(before, origin);
  assert.equal(JSON.stringify(before), serialized);
  for (const key of Object.keys(before).filter((key) => !["Origins", "CacheBehaviors"].includes(key))) assert.deepEqual(after[key], before[key]);
  assert.deepEqual(after.Origins.Items[0], before.Origins.Items[0]);
  assert.deepEqual(after.CacheBehaviors.Items[2], before.CacheBehaviors.Items[0]);
  assert.deepEqual(after.CacheBehaviors.Items.slice(0, 2).map((value) => value.PathPattern), ["/updates", "/updates/*"]);
  for (const behavior of after.CacheBehaviors.Items.slice(0, 2)) {
    assert.equal(behavior.CachePolicyId, PUBLIC_POLICY.cachePolicyId);
    assert.equal(behavior.OriginRequestPolicyId, undefined);
    assert.deepEqual(behavior.AllowedMethods.Items, ["HEAD", "GET"]);
    assert.equal(behavior.FunctionAssociations.Quantity, 0);
  }
  assert.deepEqual(configurePublicPolicyDistribution(after, origin), after);
});

test("routing refuses stacked distributions, another site, and conflicting ownership", () => {
  assert.throws(() => configurePublicPolicyDistribution(fixture(), { ...origin, functionUrl: "https://main.app.amplifyapp.com/" }), /Lambda/);
  assert.throws(() => configurePublicPolicyDistribution(fixture(), { ...origin, functionUrl: "https://abcd1234.lambda-url.us-east-1.on.aws/private" }), /Lambda/);
  assert.throws(() => configurePublicPolicyDistribution({ ...fixture(), Aliases: { Items: ["coalition.pgpz.org"] } }, origin), /pgpz.org/);
  const conflicting = fixture();
  conflicting.CacheBehaviors.Items.push({ PathPattern: "updates/*", TargetOriginId: "unrelated" });
  assert.throws(() => configurePublicPolicyDistribution(conflicting, origin), /another origin/);
});

test("provision and routing default to dry-run and require exact apply confirmations", () => {
  const args = ["--artifact", "worker.zip", "--account-id", PUBLIC_POLICY.accountId];
  assert.equal(parseArguments(args).apply, undefined);
  assert.throws(() => parseArguments([...args, "--apply"]), /confirm/);
  assert.throws(() => parseArguments([...args, "--apply", "--validate-only"]), /Choose/);
  assert.deepEqual(parseCloudFrontArguments([]), {});
  assert.throws(() => parseCloudFrontArguments(["--apply"]), /requires/);
  assert.equal(parseCloudFrontArguments(["--apply", "--confirm", "EXPOSE-PUBLISHED-COMMUNITY-POLICY", "--expected-etag", "ETAG", "--snapshot-dir", "out"]).apply, true);
});
