import "server-only";
import { createHash } from "node:crypto";
import type { BoardAsyncBallot } from "@/lib/meetings";
import type { WrittenConsent } from "@/lib/written-consents";

export function consentPayload(ballot: Pick<BoardAsyncBallot, "id" | "meetingId" | "title" | "motion" | "attachments" | "eligibleVoters" | "adoption">, consent: Pick<WrittenConsent, "rosterRevision" | "startAt" | "endAt" | "statement" | "withdrawalStatement"> & { schema?: 1 | 2 | 3 }) {
  // Schemas 1 and 2 stay byte-for-byte reproducible. Schema 3 signs attachment descriptions.
  const schema = consent.schema ?? 1;
  return { schema, meetingId: ballot.meetingId, ballotId: ballot.id, title: ballot.title, motion: ballot.motion,
    // DynamoDB maps do not retain JavaScript property insertion order. Rebuild
    // every nested object in a fixed order before hashing or exporting.
    attachments: (ballot.attachments || []).map((doc) => ({ documentId: doc.documentId, versionId: doc.versionId, title: doc.title, fileName: doc.fileName, sequence: doc.sequence, sha256: doc.sha256, ...(schema === 3 ? { description: doc.description || "" } : {}) })),
    eligibleVoters: ballot.eligibleVoters.map((director) => ({ userId: director.userId, name: director.name, email: director.email })), rosterRevision: consent.rosterRevision,
    startAt: consent.startAt, endAt: consent.endAt, statement: consent.statement, withdrawalStatement: consent.withdrawalStatement,
    ...((schema === 2 || schema === 3) ? { adoption: { targets: (ballot.adoption?.targets || []).map(({ documentId, versionId }) => ({ documentId, versionId })), effectiveTerms: ballot.adoption?.effectiveTerms || "" } } : {}),
  };
}
export const consentDigest = (payload: ReturnType<typeof consentPayload>) => createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
