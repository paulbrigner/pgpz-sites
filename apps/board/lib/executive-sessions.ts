/** Board-owned, client-safe records. Restricted deliberation never counts as a formal vote. */
export type ExecutiveParticipant = {
  accessId: string;
  email: string;
  name: string;
  kind: "director" | "counsel";
};

/** One immutable admission record per participant; read only the viewer's grant
 * before loading any private session content or other participants' identities. */
export type ExecutiveGrant = Omit<ExecutiveParticipant, "name"> & { meetingId: string };

export type ExecutiveSession = {
  id: string;
  meetingId: string;
  title: string;
  purpose: string;
  participants: ExecutiveParticipant[];
  facilitatorId: string;
  status: "open" | "closed";
  version: number;
  createdAt: string;
  createdBy: string;
  closedAt: string | null;
  closedBy: string | null;
  publishedAt: string | null;
};

export type ExecutiveMessage = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type ExecutiveMaterial = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  objectKey: string;
  createdAt: string;
  createdBy: string;
};

/** The only executive-session content deliberately released into the ordinary meeting. */
export type ExecutiveReport = {
  id: string;
  summary: string;
  publishedAt: string;
  publishedBy: string;
};

export function executiveMaterialView(material: ExecutiveMaterial): Omit<ExecutiveMaterial, "objectKey"> {
  return { id: material.id, title: material.title, fileName: material.fileName, mimeType: material.mimeType,
    byteLength: material.byteLength, sha256: material.sha256, createdAt: material.createdAt, createdBy: material.createdBy };
}

export const EXECUTIVE_MATERIAL_MAX_BYTES = 4 * 1024 * 1024;
export const isDirectorRole = (role: string) => ["member", "chair", "admin"].includes(role);
export const canCreateExecutiveSession = (role: string) => role === "chair" || role === "admin";

export class ExecutiveSessionError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function executiveText(value: unknown, label: string, maximum: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maximum) throw new ExecutiveSessionError(400, `${label} is required (up to ${maximum} characters).`);
  return result;
}
