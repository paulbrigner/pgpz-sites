export const PUBLIC_POLICY = Object.freeze({
  accountId: "860091316962",
  region: "us-east-1",
  stackName: "PgpzCommunityPublicPolicy",
  functionName: "pgpz-community-public-policy",
  distributionId: "E1OPCMWT4I5SHU",
  originId: "pgpz-community-public-policy",
  tableName: "PGPZCommunityNextAuth",
  bucketName: "pgpz-community-content",
  prefix: "policy-updates/uploads",
  artifactPrefix: "deployments/public-policy",
  cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
});

export function buildPublicPolicyStackPlan({ accountId, artifactSha256 }) {
  if (accountId !== PUBLIC_POLICY.accountId) throw new Error("Unexpected Community production account");
  if (!/^[a-f0-9]{64}$/.test(artifactSha256 || "")) throw new Error("A SHA-256 artifact digest is required");
  const c = PUBLIC_POLICY;
  const tableArn = `arn:aws:dynamodb:${c.region}:${accountId}:table/${c.tableName}`;
  const distributionArn = `arn:aws:cloudfront::${accountId}:distribution/${c.distributionId}`;
  const artifactKey = `${c.artifactPrefix}/${artifactSha256}.zip`;
  const versionId = `Version${artifactSha256}`;
  const getAtt = (resource, attribute) => ({ "Fn::GetAtt": [resource, attribute] });
  const ref = (resource) => ({ Ref: resource });
  const template = {
    AWSTemplateFormatVersion: "2010-09-09",
    Description: "Community-owned published-only policy reader for pgpz.org; no member, mail, or write access",
    Resources: {
      LogGroup: {
        Type: "AWS::Logs::LogGroup", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain",
        Properties: { LogGroupName: `/aws/lambda/${c.functionName}`, RetentionInDays: 30 },
      },
      Role: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: `${c.functionName}-reader`,
          AssumeRolePolicyDocument: { Version: "2012-10-17", Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }] },
          Policies: [{ PolicyName: "PublishedPolicyReadOnly", PolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              { Effect: "Allow", Action: ["dynamodb:GetItem"], Resource: tableArn, Condition: { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["POLICY_UPDATE_UPLOAD#*"] } } },
              { Effect: "Allow", Action: ["dynamodb:Query"], Resource: `${tableArn}/index/GSI1`, Condition: { "ForAllValues:StringEquals": { "dynamodb:LeadingKeys": ["POLICY_UPDATE_UPLOAD"] } } },
              { Effect: "Allow", Action: ["s3:GetObject"], Resource: [
                `arn:aws:s3:::${c.bucketName}/${c.prefix}/*.pdf`,
                `arn:aws:s3:::${c.bucketName}/${c.prefix}/*/assets/cover.svg`,
                ...["png", "jpg", "jpeg", "gif", "webp"].map((ext) => `arn:aws:s3:::${c.bucketName}/${c.prefix}/*/assets/*.${ext}`),
              ] },
              { Effect: "Allow", Action: ["logs:CreateLogStream", "logs:PutLogEvents"], Resource: `${getLogArn(accountId)}:*` },
            ],
          } }],
        },
      },
      Function: {
        Type: "AWS::Lambda::Function", DependsOn: ["LogGroup"],
        Properties: {
          FunctionName: c.functionName, Runtime: "nodejs22.x", Handler: "index.handler",
          Architectures: ["arm64"], MemorySize: 512, Timeout: 30, ReservedConcurrentExecutions: 30,
          Role: getAtt("Role", "Arn"),
          Code: { S3Bucket: c.bucketName, S3Key: artifactKey },
          Environment: { Variables: {
            PUBLIC_POLICY_TABLE: c.tableName, PUBLIC_POLICY_BUCKET: c.bucketName,
            PUBLIC_POLICY_PREFIX: c.prefix, PUBLIC_POLICY_ORIGIN: "https://pgpz.org",
          } },
          Tags: [{ Key: "Application", Value: "community" }, { Key: "Purpose", Value: "public-policy-read-only" }],
        },
      },
      [versionId]: {
        Type: "AWS::Lambda::Version", DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain",
        Properties: { FunctionName: ref("Function"), CodeSha256: Buffer.from(artifactSha256, "hex").toString("base64"), Description: `Reviewed artifact ${artifactSha256}` },
      },
      Alias: { Type: "AWS::Lambda::Alias", Properties: { Name: "live", FunctionName: ref("Function"), FunctionVersion: getAtt(versionId, "Version") } },
      FunctionUrl: { Type: "AWS::Lambda::Url", Properties: { TargetFunctionArn: ref("Function"), Qualifier: "live", AuthType: "AWS_IAM", InvokeMode: "RESPONSE_STREAM" }, DependsOn: ["Alias"] },
      CloudFrontUrlPermission: { Type: "AWS::Lambda::Permission", Properties: { FunctionName: ref("Alias"), Action: "lambda:InvokeFunctionUrl", Principal: "cloudfront.amazonaws.com", SourceArn: distributionArn, SourceAccount: accountId, FunctionUrlAuthType: "AWS_IAM" } },
      CloudFrontInvokePermission: { Type: "AWS::Lambda::Permission", Properties: { FunctionName: ref("Alias"), Action: "lambda:InvokeFunction", Principal: "cloudfront.amazonaws.com", SourceArn: distributionArn, SourceAccount: accountId, InvokedViaFunctionUrl: true } },
      OriginAccessControl: { Type: "AWS::CloudFront::OriginAccessControl", Properties: { OriginAccessControlConfig: { Name: c.functionName, Description: "Signed read-only Community policy origin", OriginAccessControlOriginType: "lambda", SigningBehavior: "always", SigningProtocol: "sigv4" } } },
    },
    Outputs: {
      FunctionUrl: { Value: getAtt("FunctionUrl", "FunctionUrl") },
      OriginAccessControlId: { Value: ref("OriginAccessControl") },
      FunctionName: { Value: ref("Function") },
      Version: { Value: getAtt(versionId, "Version") },
      ArtifactSha256: { Value: artifactSha256 },
    },
  };
  return { ...c, artifactKey, artifactSha256, template };
}

function getLogArn(accountId) {
  return `arn:aws:logs:${PUBLIC_POLICY.region}:${accountId}:log-group:/aws/lambda/${PUBLIC_POLICY.functionName}`;
}

export function configurePublicPolicyDistribution(config, { functionUrl, originAccessControlId }) {
  const parsed = new URL(functionUrl);
  if (parsed.protocol !== "https:" || !/^[a-z0-9]+\.lambda-url\.us-east-1\.on\.aws$/.test(parsed.hostname) || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error("Expected a regional Lambda Function URL");
  if (!/^[A-Z0-9]+$/.test(originAccessControlId || "")) throw new Error("Invalid origin access control ID");
  if (!config.Aliases?.Items?.includes("pgpz.org")) throw new Error("Distribution does not serve pgpz.org");
  const result = structuredClone(config);
  const c = PUBLIC_POLICY;
  const origins = result.Origins?.Items || [];
  const behaviors = result.CacheBehaviors?.Items || [];
  const conflicts = behaviors.filter((item) => ["/updates", "/updates/*", "updates", "updates/*"].includes(item.PathPattern) && item.TargetOriginId !== c.originId);
  if (conflicts.length) throw new Error("Policy paths are already owned by another origin");
  const origin = {
    Id: c.originId, DomainName: parsed.hostname, OriginPath: "", CustomHeaders: { Quantity: 0 },
    CustomOriginConfig: { HTTPPort: 80, HTTPSPort: 443, OriginProtocolPolicy: "https-only", OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] }, OriginReadTimeout: 30, OriginKeepaliveTimeout: 5 },
    ConnectionAttempts: 3, ConnectionTimeout: 10, OriginShield: { Enabled: false }, OriginAccessControlId: originAccessControlId,
  };
  result.Origins = { Quantity: origins.filter((item) => item.Id !== c.originId).length + 1, Items: [...origins.filter((item) => item.Id !== c.originId), origin] };
  const policyBehaviors = ["/updates", "/updates/*"].map((PathPattern) => ({
    PathPattern, TargetOriginId: c.originId,
    TrustedSigners: { Enabled: false, Quantity: 0 }, TrustedKeyGroups: { Enabled: false, Quantity: 0 },
    ViewerProtocolPolicy: "redirect-to-https", AllowedMethods: { Quantity: 2, Items: ["HEAD", "GET"], CachedMethods: { Quantity: 2, Items: ["HEAD", "GET"] } },
    SmoothStreaming: false, Compress: true, LambdaFunctionAssociations: { Quantity: 0 }, FunctionAssociations: { Quantity: 0 },
    FieldLevelEncryptionId: "", CachePolicyId: c.cachePolicyId, GrpcConfig: { Enabled: false },
  }));
  const otherBehaviors = behaviors.filter((item) => !["/updates", "/updates/*", "updates", "updates/*"].includes(item.PathPattern));
  // Specific public routes precede any existing broader wildcard behavior.
  result.CacheBehaviors = { Quantity: otherBehaviors.length + 2, Items: [...policyBehaviors, ...otherBehaviors] };
  return result;
}
