import "server-only";

export type ObjectMetadata = Readonly<{
  byteLength: number;
  mimeType: string;
  sha256: string;
}>;

/**
 * Object-store contract injected by the consuming app. The Board implements it
 * with S3 (staging + retained boundaries); tests and Reference use an
 * in-memory fake. The package owns neither a client nor bucket policy.
 */
export interface ObjectStore {
  /** Reads object metadata without streaming the body. */
  head(key: string): Promise<ObjectMetadata | null>;

  /** Server-side promote/copy from staging to an immutable final key. */
  promote(sourceKey: string, targetKey: string): Promise<ObjectMetadata>;

  /** Deletes a staging object (never a retained final object). */
  deleteStaging(key: string): Promise<void>;
}
