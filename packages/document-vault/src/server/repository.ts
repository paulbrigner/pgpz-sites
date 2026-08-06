import "server-only";

import type {
  DocumentItem,
  DocumentRecord,
  DocumentVersion,
} from "../domain";

export type DocumentFilter = Readonly<{
  category?: string;
  status?: DocumentRecord["status"];
  term?: string;
}>;

export type NewDocumentInput = {
  documentId: string;
  title: string;
  description: string;
  category: string;
  visibility: string;
  version: DocumentVersion;
  actorId: string | null;
};

export type AcceptVersionInput = {
  documentId: string;
  /** Optimistic-concurrency guard the repository must enforce. */
  expectedRevision: number;
  head: DocumentRecord;
  version: DocumentVersion;
  actorId: string | null;
};

/**
 * Document repository contract injected by the consuming app. Every mutating
 * method must enforce optimistic concurrency (revision condition) and treat a
 * version insert as immutable. The Board implements it with the dedicated
 * `PGPZBoardDocuments` table; tests and Reference use an in-memory adapter.
 */
export interface DocumentRepository {
  getDocument(documentId: string): Promise<DocumentItem | null>;
  listDocuments(filter?: DocumentFilter): Promise<DocumentItem[]>;
  listVersions(documentId: string): Promise<DocumentVersion[]>;

  createDocument(input: NewDocumentInput): Promise<DocumentItem>;
  acceptVersion(input: AcceptVersionInput): Promise<DocumentItem>;
  setArchived(
    documentId: string,
    archived: boolean,
    actorId: string | null,
    now: string,
  ): Promise<DocumentItem | null>;
  updateMetadata(
    documentId: string,
    metadata: { title: string; description: string; category: string; visibility: string },
    actorId: string | null,
  ): Promise<DocumentItem | null>;
}

export class OptimisticConcurrencyError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} changed since it was read; refresh and retry.`);
    this.name = "OptimisticConcurrencyError";
  }
}
