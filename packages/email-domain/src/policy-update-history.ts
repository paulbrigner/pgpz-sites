import type {
  PolicyUpdateEmailLogItem,
  PolicyUpdateHistoryContext,
  PolicyUpdateSendHistoryItem,
} from "./contracts";
import { normalizeFailurePreview } from "./newsletters";

const POLICY_UPDATE_LEGACY_RUN_GAP_MS = 15 * 60 * 1000;
const textOrEmpty = (value: unknown) =>
  typeof value === "string" ? value : "";
const textOrNull = (value: unknown) =>
  typeof value === "string" && value.trim() ? value : null;

function policyUpdateRunDefaults(
  slug: string,
  updatesBySlug: Map<string, PolicyUpdateHistoryContext>,
) {
  const update = updatesBySlug.get(slug);
  return {
    title: update?.title || slug,
    shortTitle: update?.shortTitle || update?.title || slug,
    category: update?.category || "",
    categoryLabel: update?.categoryLabel || "Policy update",
    subject: update?.emailSubject || "",
  };
}

function createPolicyUpdateHistoryRun({
  id,
  slug,
  createdAt,
  metadata,
  subject,
  source,
  updatesBySlug,
}: {
  id: string;
  slug: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  subject: string;
  source: PolicyUpdateSendHistoryItem["source"];
  updatesBySlug: Map<string, PolicyUpdateHistoryContext>;
}): PolicyUpdateSendHistoryItem {
  const defaults = policyUpdateRunDefaults(slug, updatesBySlug);
  const category = textOrEmpty(metadata.category) || defaults.category;
  return {
    id,
    updateSlug: slug,
    title: defaults.title,
    shortTitle: defaults.shortTitle,
    category,
    categoryLabel: defaults.categoryLabel,
    subject: subject || defaults.subject,
    sentAt: createdAt,
    lastEventAt: createdAt,
    audienceMode:
      metadata.audienceMode === "selected_members"
        ? "selected_members"
        : "all_active_members",
    stats: {
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      openCount: null,
      clickCount: null,
      unsubscribeCount: null,
      possibleForwardOpenCount: null,
    },
    failurePreview: [],
    source,
    engagementTracked: false,
  };
}

export function groupPolicyUpdateEmailLogs(
  items: PolicyUpdateEmailLogItem[],
  updates: PolicyUpdateHistoryContext[] = [],
) {
  const updatesBySlug = new Map(updates.map((update) => [update.slug, update]));
  const allowedSlugs = new Set(updates.map((update) => update.slug));
  const runs = new Map<string, PolicyUpdateSendHistoryItem>();
  const legacyRunsBySlug = new Map<string, PolicyUpdateSendHistoryItem>();
  const sortedItems = [...items].sort((a, b) =>
    textOrEmpty(a.createdAt).localeCompare(textOrEmpty(b.createdAt)),
  );

  for (const item of sortedItems) {
    const metadata =
      item.metadata &&
      typeof item.metadata === "object" &&
      !Array.isArray(item.metadata)
        ? (item.metadata as Record<string, unknown>)
        : {};
    const slug = textOrEmpty(metadata.updateSlug);
    if (!slug || (allowedSlugs.size && !allowedSlugs.has(slug))) continue;
    if (metadata.draft === true) continue;

    const status =
      item.status === "sent"
        ? "sent"
        : item.status === "failed"
          ? "failed"
          : "";
    if (!status) continue;

    const createdAt = textOrEmpty(item.createdAt);
    if (!createdAt) continue;

    const explicitRunId =
      textOrNull(metadata.policyUpdateSendRunId) ||
      textOrNull(metadata.sendRunId);
    const subject = textOrEmpty(item.subject);
    let run: PolicyUpdateSendHistoryItem | undefined;

    if (explicitRunId) {
      const key = `run:${explicitRunId}`;
      run = runs.get(key);
      if (!run) {
        run = createPolicyUpdateHistoryRun({
          id: explicitRunId,
          slug,
          createdAt,
          metadata,
          subject,
          source: "send_run",
          updatesBySlug,
        });
        runs.set(key, run);
      }
    } else {
      const previous = legacyRunsBySlug.get(slug);
      const previousTime = previous ? Date.parse(previous.lastEventAt) : NaN;
      const currentTime = Date.parse(createdAt);
      const sameLegacyRun =
        previous &&
        Number.isFinite(previousTime) &&
        Number.isFinite(currentTime) &&
        currentTime - previousTime <= POLICY_UPDATE_LEGACY_RUN_GAP_MS;

      if (sameLegacyRun) {
        run = previous;
      } else {
        const key = `legacy:${slug}:${createdAt}`;
        run = createPolicyUpdateHistoryRun({
          id: key,
          slug,
          createdAt,
          metadata,
          subject,
          source: "legacy_email_log",
          updatesBySlug,
        });
        runs.set(key, run);
        legacyRunsBySlug.set(slug, run);
      }
    }

    run.stats.recipientCount += 1;
    if (status === "sent") run.stats.sentCount += 1;
    if (status === "failed") {
      run.stats.failedCount += 1;
      if (run.failurePreview.length < 10) {
        run.failurePreview.push(
          ...normalizeFailurePreview([
            {
              email: textOrEmpty(item.email) || "Unknown recipient",
              error: textOrEmpty(item.error) || "Failed to send",
            },
          ]),
        );
      }
    }
    if (createdAt < run.sentAt) run.sentAt = createdAt;
    if (createdAt > run.lastEventAt) run.lastEventAt = createdAt;
    if (!run.subject && subject) run.subject = subject;
  }

  return Array.from(runs.values()).sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt),
  );
}
