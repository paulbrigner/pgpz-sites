# Community public policy publishing

## Ownership and access

Community owns authoring, source DOCX files, review, publication status, and
member email delivery. Published weekly memos and Special Updates, including
the historical catalog, are readable without membership at
`https://pgpz.org/updates`. Drafts and unpublished records remain private.
Coalition publication and membership policy are independent.

The Community-owned regional Lambda reader has only policy-key DynamoDB
reads and PDF/raster-object S3 reads, plus explicitly referenced historical
`cover.svg` files served with a sandbox policy. It has no source DOCX, member/session,
email, secret, or write permissions. Each document/media request strongly
checks the canonical publication record. Archive queries use the GSI only to
discover candidates, then strongly check them. Responses use `no-store`; a
missing, draft, or unpublished item returns the same 404. The two static
historical publications and their explicitly cataloged files ship in the
worker bundle. No private records are copied into the public website bucket.

The existing public site's CloudFront distribution routes only `/updates`
and `/updates/*` to an IAM-authenticated Lambda Function URL with an origin
access control. It does not forward viewer cookies, authorization, or host
headers. AWS does not support stacking the public CloudFront distribution
in front of Community's Amplify distribution.

The public site is the separate `/Users/paulbrigner/dev/pgpz.org` repository.
Its static homepage fetches `/updates/feed.json`. All other static routes,
Community administration, email eligibility/preferences, unsubscribe,
tracking, and delivery jobs retain their existing owners.

## Release preflight

Deployment needs explicit user authorization and independent review of the
final source revisions. Do not send production email as a test.

1. Run `npm run check`, the affected application builds, standard browser
   journeys, and `npm run test:public-policy-infra`. Build the worker with
   `npm run build:public-policy`. Validate the separate public site with its
   `node scripts/validate-site.mjs` and browser checks.
2. Confirm the AWS caller is account `860091316962`, region `us-east-1`, using
   the selected SSO profile. Verify the current Community Amplify branch,
   resources, and rollback commit; never infer them from this document.
3. Check `PGPZCommunityNextAuth` and GSI1 are active, and
   `pgpz-community-content` blocks all public access. Read only policy-record
   keys when inventorying published/draft content; do not scan member data.
4. Record the current CloudFront config/ETag for `E1OPCMWT4I5SHU`, its aliases,
   origin/behavior configuration, and any existing reader alias/version.
5. Build the artifact from the reviewed source revision. Zip the **contents**
   of `apps/community/dist-public-policy` with `index.js` at the ZIP root.
   Record the source SHA and artifact SHA-256. Keep generated artifacts out
   of Git. No credentials or `.env` files belong in the archive.

## Provision the versioned reader

The tooling defaults to a local dry run. It fixes the Community account,
region, content bucket, table, and public distribution. Apply verifies the
artifact digest, caller, active table/index, bucket region, and public-access
block before uploading a content-addressed artifact and deploying the stack.

```bash
npm run provision:public-policy -- \
  --artifact /absolute/path/public-policy.zip --account-id 860091316962

npm run provision:public-policy -- \
  --artifact /absolute/path/public-policy.zip --account-id 860091316962 \
  --profile zodldashboard --validate-only

npm run provision:public-policy -- \
  --artifact /absolute/path/public-policy.zip --account-id 860091316962 \
  --profile zodldashboard --expected-sha256 <reviewed-artifact-sha256> \
  --apply --confirm PROVISION-COMMUNITY-PUBLIC-POLICY
```

The `PgpzCommunityPublicPolicy` stack owns the reader role/function/log group,
retained immutable Lambda versions, `live` alias, streaming Function URL,
CloudFront-only invocation permissions, and origin access control. It does
not own the existing public CloudFront distribution or application data.
Function URL access is AWS_IAM, never anonymous `NONE`. Smoke-test signed
requests using the SSO credentials locally; never put credentials in output.
Unsigned direct-origin access must fail.

Verify archive, feed, weekly/special HTML, the two static historical files,
PDFs, images, HEAD, malformed paths, missing records, and draft/unpublished
denials before routing public traffic. Exercise visibility transitions and
dependency failures with isolated fixtures, not by changing live content.

## Deploy the protected writer before public routing

Release the independently reviewed Community revision first and verify the
Amplify job completed successfully at the expected commit. The generation
lease, published-generation rejection, and client-reviewed publication
revision checks must be live before any public routing is attached.

Record the deployment completion time and wait at least 15 minutes before
exposing the reader. This drains requests from the previous writer, using
Amplify's documented maximum compute execution time. Do not infer that old
generation requests ended merely because a new deployment succeeded. The
signed reader smoke checks and static-site preparation can run during this
interval; keep the public homepage release until after routing verification.
Community publication links may temporarily point to the not-yet-routed
public archive during this initial cutover.

## Attach only the public paths

Proceed only after the protected Community writer is live and the drain
interval above has elapsed. Record that evidence with the release snapshot.

```bash
npm run configure:public-policy-cloudfront -- --profile zodldashboard

npm run configure:public-policy-cloudfront -- --profile zodldashboard \
  --apply --confirm EXPOSE-PUBLISHED-COMMUNITY-POLICY \
  --expected-etag <fresh-reviewed-etag> \
  --snapshot-dir /absolute/path/unique-release-snapshot
```

Review the dry-run origin and two behaviors. Apply refuses a changed ETag or
paths owned by another origin, and saves the original/full resulting config
before mutation. All other origins, default behavior, function associations,
aliases, certificate, WAF, logging, and custom errors are preserved. The new
behaviors use managed CachingDisabled, GET/HEAD only, HTTPS, no origin-request
policy, and SigV4 signing. Wait for CloudFront deployment and invalidate
`/updates` and `/updates/*` to remove old static-site errors.

CloudFront honors `no-store` for 404/410. Most 5xx and 403 errors can still be
negatively cached for ten seconds; they fail closed. Do not change the
distribution-wide custom-error policy merely to alter this short recovery
delay, and never serve stale successful content after an origin error.

After anonymous public pages/assets work, release the static homepage.
Existing Community publication links temporarily
redirect to public URLs; private review stays in Community. Verify mobile and
desktop navigation, public canonical/SEO URLs, unpublished protection, and
that neither published HTML nor JSON exposes source/storage/admin metadata.
Confirm production email rendering through tests or validation-only mode;
do not send to members as a deployment check.

## Rollback

Retain the reviewed source/artifact digest, original CloudFront snapshot,
previous Lambda version, and separate site release commits. If content
visibility checks fail, remove the two public behaviors immediately or route
the alias to a previously verified fail-closed version. Do not bypass the
status checks or make the content bucket public.

For a normal reader rollback, point `live` at a previously reviewed retained
version, then reconcile CloudFormation to that reviewed artifact. Roll back
the public/Community links and homepage commits as needed, but never restore
an unguarded Community writer while public reader routing remains active.
Remove public routing and verify it no longer serves content before rolling
Community back to a revision without the generation/publication guards.
To remove routing,
fetch a fresh ETag and remove only the two owned behaviors and owned origin;
preserve concurrent unrelated distribution changes. Invalidate the public
paths and verify they no longer serve reader content. Keep the protected
stack and retained artifacts until rollback verification is complete.

## Primary platform references

- [Lambda Function URL origin access control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
- [CloudFront error caching](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/custom-error-pages-expiration.html)
- [Stacked distribution restriction](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/http-403-permission-denied.html)
- [Amplify compute execution limit](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-deployment-specification.html)
