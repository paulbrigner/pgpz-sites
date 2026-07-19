import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConditionalPointerUpdate,
  localPolicyUpdateAssetNames,
  parseArgs,
  planUpload,
  runBackfill,
} from "./backfill-policy-update-email-assets.mjs";

function upload(overrides = {}) {
  return {
    pk: "POLICY_UPDATE_UPLOAD#public-update",
    sk: "POLICY_UPDATE_UPLOAD#public-update",
    type: "POLICY_UPDATE_UPLOAD",
    slug: "public-update",
    visibilityStatus: "published",
    publicEmailAssetMaterializationId: null,
    s3Bucket: "bucket",
    s3Key: "policy-updates/public-update.pdf",
    sections: [
      {
        images: [
          { src: "/api/policy-updates/public-update/assets/chart.png" },
          { src: "/api/policy-updates/public-update/assets/chart.png" },
        ],
      },
    ],
    ...overrides,
  };
}

function dependencies(items) {
  const calls = { get: 0, copy: 0, put: 0, attach: 0 };
  return {
    calls,
    implementation: {
      listUploads: async () => items,
      getUpload: async (item) => {
        calls.get += 1;
        return item;
      },
      copyAsset: async () => {
        calls.copy += 1;
      },
      putMaterialization: async () => {
        calls.put += 1;
      },
      attachMaterialization: async () => {
        calls.attach += 1;
      },
      randomUUID: () => "2f6ff29c-0fbf-4943-aaed-a09610a01b95",
      now: () => "2026-07-19T12:00:00.000Z",
    },
  };
}

test("defaults to a read-only dry-run", async () => {
  const options = parseArgs(["--app", "community"]);
  const deps = dependencies([upload()]);
  const summary = await runBackfill({ options, dependencies: deps.implementation });

  assert.equal(options.apply, false);
  assert.deepEqual(
    { planned: summary.planned, materialized: summary.materialized },
    { planned: 1, materialized: 0 },
  );
  assert.deepEqual(deps.calls, { get: 0, copy: 0, put: 0, attach: 0 });
});

test("accepts only valid same-update local asset paths", () => {
  const names = localPolicyUpdateAssetNames(
    upload({
      sections: [
        {
          images: [
            { src: "/api/policy-updates/public-update/assets/chart.png?cache=draft" },
            { src: "https://community.pgpz.org/api/policy-updates/public-update/assets/photo.webp" },
            { src: "/api/policy-updates/another-update/assets/wrong.jpg" },
            { src: "https://example.org/api/policy-updates/public-update/assets/external.png" },
            { src: "/api/policy-updates/public-update/assets/%2e%2e%2fsecret.png" },
            { src: "/api/policy-updates/public-update/assets/script.svg" },
          ],
        },
      ],
    }),
  );

  assert.deepEqual(names, ["chart.png"]);
});

test("skips published uploads with no valid local assets", () => {
  assert.equal(planUpload(upload({ sections: [] })).status, "skip-no-assets");
  assert.equal(
    planUpload(
      upload({ sections: [{ images: [{ src: "/api/policy-updates/public-update/assets/a.svg" }] }] }),
    ).status,
    "skip-no-assets",
  );
});

test("rejects records whose primary key does not match their upload slug", () => {
  assert.equal(planUpload(upload({ pk: "POLICY_UPDATE_UPLOAD#another-update" })).status, "skip-invalid-record");
});

test("idempotently skips uploads that already have a materialization pointer", async () => {
  const options = parseArgs(["--app", "coalition", "--apply"]);
  const deps = dependencies([upload({ publicEmailAssetMaterializationId: "existing-id" })]);
  const summary = await runBackfill({ options, dependencies: deps.implementation });

  assert.equal(summary.skippedAlreadyMaterialized, 1);
  assert.deepEqual(deps.calls, { get: 0, copy: 0, put: 0, attach: 0 });
});

test("builds a conditional pointer update bound to publication and source state", () => {
  const item = upload();
  const update = buildConditionalPointerUpdate({
    tableName: "Table",
    upload: item,
    materializationId: "materialization-id",
  });

  assert.deepEqual(update.Key, { pk: item.pk, sk: item.sk });
  assert.match(update.ConditionExpression, /#visibility = :published/);
  assert.match(update.ConditionExpression, /attribute_not_exists\(#materialization\)/);
  assert.match(update.ConditionExpression, /#sections = :sections/);
  assert.equal(update.ExpressionAttributeValues[":materializationId"], "materialization-id");
  assert.equal(update.ExpressionAttributeValues[":published"], "published");
});

test("reports copied objects and the materialization record as orphaned after a lost race", async () => {
  const options = parseArgs(["--app", "community", "--apply"]);
  const deps = dependencies([upload()]);
  deps.implementation.attachMaterialization = async () => {
    deps.calls.attach += 1;
    const error = new Error("condition rejected");
    error.name = "ConditionalCheckFailedException";
    throw error;
  };
  const events = [];
  const summary = await runBackfill({
    options,
    dependencies: deps.implementation,
    log: (event) => events.push(event),
  });

  assert.equal(summary.orphaned, 1);
  assert.equal(summary.materialized, 0);
  assert.deepEqual(events[0], {
    level: "orphan",
    upload: events[0].upload,
    materializationId: "2f6ff29c-0fbf-4943-aaed-a09610a01b95",
    copiedObjects: 1,
    recordWritten: true,
    reason: "conditional-pointer-update-rejected",
  });
});

test("requires an explicit target and rejects ambiguous selectors", () => {
  assert.throws(() => parseArgs([]), /Select a target/);
  assert.throws(
    () => parseArgs(["--app", "community", "--table", "Other", "--region", "us-east-1"]),
    /either --app or --table/,
  );
});
